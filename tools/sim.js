// Headless balance sim on the real rules engine: bots play each other thousands of times, then it prints a summary.
// Run: node tools/sim.js [games per matchup, default 200] [seed, default 1] [Boredom knockout, default the game's]
// The bots are small greedy policies on purpose: if one simple plan beats everything by a mile, that's a balance problem.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = vm.createContext({ structuredClone, console });
vm.runInContext(['js/cards-data.js', 'js/cards.js', 'js/game.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n').replace(/const BORE_MAX = \d+;/, m => (process.argv[4] ? `const BORE_MAX = ${+process.argv[4]};` : m))
  + '\nthis.E = { CARDS, CAPTAINS, STARTERS, CARD, newGame, apply, deckProblems, statsOf, DECK_SIZE };', ctx);
const { CARDS, CAPTAINS, STARTERS, CARD, newGame, apply, deckProblems, statsOf, DECK_SIZE } = ctx.E;

const N = +(process.argv[2] || 200);
let seed = +(process.argv[3] || 1);
const rng = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rng() * a.length)];
const tryAct = (s, p, a, r = rng) => { try { return apply(s, p, a, r); } catch { return null; } };

// Every legal move this turn (plays, moves, captain ability), found by asking the engine, so no rules are copied here.
function options(s) {
  const p = s.turn, me = s.players[p], out = [], seen = new Set();
  me.hand.forEach((id, i) => { if (!seen.has(id)) { seen.add(id); out.push({ type: 'play', i }); } });
  const T = s.players[1 - p].field.map((_, t) => t);
  me.field.forEach((f, i) => CARD[f.id].moves.forEach((mv, m) => (T.length && !mv.ability ? T.map(t => ({ type: 'attack', i, m, t })) : [{ type: 'attack', i, m }]).forEach(a => out.push(a))));
  if (CARD[me.captain].ability) out.push({ type: 'ability', i: -1 });
  return out.filter(a => tryAct(s, p, a));
}
const kind = (s, a) => a.type === 'play' ? CARD[s.players[s.turn].hand[a.i]].type
  : a.type === 'attack' ? (CARD[s.players[s.turn].field[a.i].id].moves[a.m].ability ? 'move-ability' : 'attack') : a.type;
const mv = (s, a) => CARD[s.players[s.turn].field[a.i].id].moves[a.m];
const END = { type: 'end' };

// Board score from p's side, for the lookahead bot.
function val(s, p) {
  if (s.phase === 'over') return s.winner === p ? 1e6 : -1e6;
  const side = x => x.goof * 0.6 - x.bore * 2.5 + x.field.reduce((n, f) => n + 1.5 + f.hp * 0.8, 0) + x.hand.length * 0.6 + x.effects.length;
  return side(s.players[p]) - side(s.players[1 - p]) + (s.turn === p ? s.actions : s.players[p].bank) * 0.5;
}
// Chance this attack breaks through (attacks on an empty field always land).
const odds = (s, a) => {
  const p = s.turn, tf = s.players[1 - p].field[a.t];
  if (!tf) return 1;
  const need = statsOf(s, 1 - p, tf).def - (mv(s, a).power + statsOf(s, p, s.players[p].field[a.i]).bonus);
  const ph = Math.min(1, Math.max(0, (21 - need) / 20));
  return CARD[tf.id].disadv ? ph * ph : ph;
};
const byOrder = order => (s, p) => {
  const o = options(s);
  for (const want of order) {
    const m = o.filter(a => kind(s, a) === want);
    if (m.length) return want === 'attack' ? m.reduce((b, a) => (mv(s, a).power + odds(s, a) > mv(s, b).power + odds(s, b) ? a : b)) : m[0];
  }
  return END;
};
const POL = {
  random: s => pick([...options(s), END]),
  rush: byOrder(['ability', 'attack', 'character', 'bit', 'evil', 'move-ability']),
  builder: byOrder(['ability', 'character', 'bit', 'evil', 'attack', 'move-ability']),
  // Only ever uses each Character's priciest attack, banking Actions until it can afford it.
  saver: (s, p) => {
    const o = options(s), me = s.players[p];
    const big = o.filter(a => kind(s, a) === 'attack' && mv(s, a).cost === Math.max(...CARD[me.field[a.i].id].moves.filter(m => !m.ability).map(m => m.cost)));
    return o.find(a => kind(s, a) === 'ability') || big[0] || o.find(a => kind(s, a) === 'character') || END;
  },
  // One-step lookahead: tries each move, scores the result (attacks as hit/miss weighted by the real odds), ends the turn when nothing beats banking.
  greedy: (s, p) => {
    let best = END, bestV = val(tryAct(s, p, END), p) + 0.5 * s.actions;
    for (const a of options(s)) {
      const n = tryAct(s, p, a);
      let v;
      if (kind(s, a) === 'attack' && a.t !== undefined) {
        const ph = odds(s, a), hit = tryAct(s, p, a, () => 0.999), miss = tryAct(s, p, a, () => 0);
        v = ph * val(hit, p) + (1 - ph) * val(miss, p);
      } else v = val(n, p);
      if (v > bestV) { bestV = v; best = a; }
    }
    return best;
  },
};

function play(decks, pols, cap = 200) {
  let s = newGame(decks, ['A', 'B'], rng);
  const st = { first: s.turn, attacks: 0, hits: 0, direct: 0, supers: 0, kos: 0 };
  for (let steps = 0; s.phase !== 'over' && s.turnNo < cap && steps < 5000; steps++) {
    const p = s.turn, a = pols[p](s, p);
    s.events = [];
    const n = tryAct(s, p, a) || tryAct(s, p, END);
    if (!n) throw new Error('stuck on ' + JSON.stringify(a));
    for (const e of n.events) {
      if (e.k === 'attack') { if (e.roll) { st.attacks++; if (e.roll.hit) st.hits++; } else st.direct++; }
      if (e.k === 'cast' && CARD[e.id].type === 'captain') st.supers++;
      if (e.k === 'hit' && e.ko) st.kos++;
    }
    s = n; s.log = [];
  }
  return { winner: s.phase === 'over' ? s.winner : -1, turns: s.turnNo, ...st };
}

function randomDeck(items = Math.floor(rng() * 11)) {
  const chars = CARDS.filter(c => c.type === 'character'), other = CARDS.filter(c => c.type !== 'character'), cards = {};
  for (let n = 0; n < DECK_SIZE;) {
    const c = pick(n < items && other.length ? other : chars);
    if ((cards[c.id] || 0) >= (c.main ? 1 : 3)) continue;
    cards[c.id] = (cards[c.id] || 0) + 1; n++;
  }
  const d = { captain: pick(CAPTAINS).id, cards };
  if (deckProblems(d).length) throw new Error(deckProblems(d).join('; '));
  return d;
}

const pct = x => (100 * x).toFixed(0).padStart(3) + '%';
const t0 = Date.now(), agg = {};
const note = (k, r, won) => { const a = (agg[k] ||= { g: 0, w: 0, turns: 0, attacks: 0, hits: 0, direct: 0, goof: 0, bore: 0, draws: 0 });
  a.g++; a.w += won; a.turns += r.turns; a.attacks += r.attacks; a.hits += r.hits; a.direct += r.direct; a.goof += r.supers; a.bore += r.kos; a.draws += r.winner < 0; };

console.log(`== Strategy matrix: row's win rate vs column (${N} games each, starter decks swapped every game, attacker picks the target) ==`);
const names = Object.keys(POL);
console.log('          ' + names.map(n => n.padStart(8)).join(''));
let firstWins = 0, decided = 0;
for (const a of names) {
  let row = a.padEnd(10);
  for (const b of names) {
    if (a === b) { row += '       -'; continue; }
    let w = 0;
    for (let g = 0; g < N; g++) {
      const swap = g % 2, decks = swap ? [STARTERS[1], STARTERS[0]] : [STARTERS[0], STARTERS[1]];
      const r = play(decks, [POL[a], POL[b]]);
      w += r.winner === 0; note(a, r, r.winner === 0);
      if (r.winner >= 0) { decided++; firstWins += r.winner === r.first; }
    }
    row += pct(w / N).padStart(8);
  }
  console.log(row);
}
console.log(`First player wins ${pct(firstWins / decided)} of decided games.`);
console.log('\n== Per strategy (all its matrix games) ==');
for (const [k, a] of Object.entries(agg)) console.log(`${k.padEnd(8)} win ${pct(a.w / a.g)}  avg turns ${(a.turns / a.g).toFixed(1)}  hit rate ${pct(a.hits / Math.max(1, a.attacks))}  unblocked attacks/game ${(a.direct / a.g).toFixed(1)}  Supers/game ${(a.goof / a.g).toFixed(1)}  Characters defeated/game ${(a.bore / a.g).toFixed(1)}  draws(turn cap) ${pct(a.draws / a.g)}`);

for (const [label, d0, d1] of [['Starter A vs B (greedy mirror)', STARTERS[0], STARTERS[1]]]) {
  let w = 0;
  for (let g = 0; g < N * 2; g++) { const r = play([d0, d1], [POL.greedy, POL.greedy]); w += r.winner === 0; }
  console.log(`\n${label}: A wins ${pct(w / (N * 2))}`);
}

const G = N * 10;
console.log(`\n== Random legal decks (${G} games, greedy vs greedy, random Captain, 0-10 Bits/Evils) ==`);
const card = {}, cap = {}, mix = {};
const add = (m, k, won) => { const a = (m[k] ||= { g: 0, w: 0 }); a.g++; a.w += won; };
for (let g = 0; g < G; g++) {
  const decks = [randomDeck(), randomDeck()], r = play(decks, [POL.greedy, POL.greedy]);
  if (r.winner < 0) continue;
  decks.forEach((d, i) => {
    const won = r.winner === i ? 1 : 0;
    add(cap, d.captain, won);
    Object.keys(d.cards).forEach(id => add(card, id, won));
    add(mix, Object.entries(d.cards).reduce((n, [id, k]) => n + (CARD[id].type === 'character' ? 0 : k), 0), won);
  });
}
const show = (m, min = 1) => Object.entries(m).filter(([, a]) => a.g >= min).map(([k, a]) => [k, a.w / a.g, a.g]).sort((x, y) => y[1] - x[1]);
console.log('Captains:'); for (const [k, r, g] of show(cap)) console.log(`  ${CARD[k].name.padEnd(14)} ${pct(r)}  (${g} decks)  ${CARD[k].text}`);
console.log('Win rate by number of Bits/Evils in the deck:'); for (const [k, r, g] of show(mix).sort((x, y) => x[0] - y[0])) console.log(`  ${String(k).padStart(2)}: ${pct(r)} (${g})`);
const cs = show(card, 40), line = ([k, r, g]) => { const c = CARD[k]; return `  ${pct(r)} (${g}) ${c.name} [${c.type}${c.def ? ` DEF${c.def} HP${c.hp}` : ''}${c.moves ? ' ' + c.moves.map(m => `${m.name} c${m.cost}${m.ability ? ' abil' : ` p${m.power}`}`).join(', ') : ''}]${c.text ? ' ' + c.text : ''}`; };
console.log('Best cards (win rate when in the deck):'); cs.slice(0, 12).forEach(x => console.log(line(x)));
console.log('Worst cards:'); cs.slice(-12).forEach(x => console.log(line(x)));
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
