// Headless balance sim on the real rules engine: bots play each other thousands of times, then it prints a summary.
// Run: node tools/sim.js [games per matchup, default 200] [seed, default 1] [Boredom knockout] [HP scale] (defaults: the game's)
// The bots are small greedy policies on purpose: if one simple plan beats everything by a mile, that's a balance problem.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = vm.createContext({ structuredClone, console });
// VARIANT=<file.json> {cardId: {fields}} tests card changes without touching the real card data
const VARIANT = process.env.VARIANT ? fs.readFileSync(process.env.VARIANT, 'utf8') : '{}';
vm.runInContext(['js/cards-data.js', 'js/card-overrides.js', 'js/cards.js', 'js/game.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n')
  .replace('// CAPTAINS, CARDS and STARTERS come from', `for (const [id, v] of Object.entries(${VARIANT})) Object.assign([...CAPTAINS, ...CARDS].find(c => c.id === id), v);\n// CAPTAINS, CARDS and STARTERS come from`).replace(/const BORE_MAX = \d+;/, m => (process.argv[4] ? `const BORE_MAX = ${+process.argv[4]};` : m)).replace(/const HP_SCALE = [\d.]+;/, m => (process.argv[5] ? `const HP_SCALE = ${+process.argv[5]};` : m)).replace(/const DECK_SIZE = \d+;/, m => (process.env.DECK ? `const DECK_SIZE = ${+process.env.DECK};` : m))
  // DIRECT=<no direct attacks while turnNo <= this>,<half power 0|1>, e.g. DIRECT=2,0 (js/game.js NO_DIRECT_UNTIL, DIRECT_HALF)
  .replace(/const NO_DIRECT_UNTIL = \d+, DIRECT_HALF = \w+;/, m => { if (!process.env.DIRECT) return m; const [u, h] = process.env.DIRECT.split(','); return `const NO_DIRECT_UNTIL = ${+u}, DIRECT_HALF = ${h === '1'};`; })
  + '\nthis.E = { CARDS, CAPTAINS, STARTERS, CARD, newGame, apply, deckProblems, statsOf, DECK_SIZE, maxHp, baseArmor, canBlock: typeof canBlock === "function" ? canBlock : () => true };', ctx);
const { CARDS, CAPTAINS, STARTERS, CARD, newGame, apply, deckProblems, statsOf, DECK_SIZE, maxHp, baseArmor, canBlock } = ctx.E;

const N = +(process.argv[2] || 200);
let seed = +(process.argv[3] || 1);
const rng = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rng() * a.length)];
const tryAct = (s, p, a, r = rng) => { try { return apply(s, p, a, r); } catch { return null; } };

// Every legal move this turn (plays, moves, captain ability), found by asking the engine, so no rules are copied here.
function options(s) {
  const p = s.turn, me = s.players[p], out = [], seen = new Set();
  me.hand.forEach((id, i) => { if (!seen.has(id)) { seen.add(id); out.push({ type: 'play', i }); } });
  me.field.forEach((f, i) => CARD[f.id].moves.forEach((_, m) => out.push({ type: 'attack', i, m })));
  if (CARD[me.captain].ability) out.push({ type: 'ability', i: -1 });
  s.players[1 - p].effects.forEach((e, i) => CARD[e.id].type === 'evil' && out.push({ type: 'cleanse', i }));
  return out.filter(a => tryAct(s, p, a));
}
const kind = (s, a) => a.type === 'play' ? CARD[s.players[s.turn].hand[a.i]].type
  : a.type === 'attack' ? (CARD[s.players[s.turn].field[a.i].id].moves[a.m].ability ? 'move-ability' : 'attack') : a.type;
const mv = (s, a) => CARD[s.players[s.turn].field[a.i].id].moves[a.m];
const END = { type: 'end' };

// Board score from p's side, for the lookahead bot.
function val(s, p) {
  if (s.phase === 'over') return s.winner === p ? 1e6 : -1e6;
  const side = x => x.goof * 0.6 - x.bore * 2.5 + x.field.reduce((n, f) => n + 1.5 + f.hp * 0.8, 0) + x.hand.length * 0.6 + x.effects.length * 2.2;
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
const block = (s, p) => {
  const af = s.players[1 - p].field[s.pending.i], pw = CARD[af.id].moves[s.pending.m].power + statsOf(s, 1 - p, af).bonus;
  const ok = s.players[p].field.map((_, i) => i).filter(i => canBlock(s, p, i));
  return ok.reduce((b, i) => { const F = s.players[p].field, sc = x => { const d = Math.max(0, pw - statsOf(s, p, F[x]).def); return (d < F[x].hp ? 100 : 0) - d * 10 + F[x].hp; }; return sc(i) > sc(b) ? i : b; }, ok[0]);
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
  // Plays the toughest Character first (HP + armour), then attacks with its best move.
  tankfirst: (s, p) => {
    const o = options(s), plays = o.filter(a => kind(s, a) === 'character');
    if (plays.length) return plays.reduce((b, a) => { const t = id => maxHp(CARD[id]) + baseArmor(CARD[id]) * 3; return t(s.players[p].hand[a.i]) > t(s.players[p].hand[b.i]) ? a : b; });
    const atk = o.filter(a => kind(s, a) === 'attack'); return atk.length ? atk.reduce((b, a) => (mv(s, a).power > mv(s, b).power ? a : b)) : o.find(a => kind(s, a) === 'ability') || END;
  },
  // Never plays Items/Evils: Characters and attacks only.
  aggro: byOrder(['attack', 'character', 'ability']),
  // Saves Actions until it can afford its biggest attack, otherwise just builds the board.
  banker: (s, p) => {
    const o = options(s), atk = o.filter(a => kind(s, a) === 'attack'), big = atk.filter(a => mv(s, a).cost >= 2);
    if (big.length) return big.reduce((b, a) => (mv(s, a).power > mv(s, b).power ? a : b));
    const ch = o.find(a => kind(s, a) === 'character'); if (ch && s.actions > 2) return ch;
    return s.actions >= 4 && atk.length ? atk[0] : END;
  },
  // One-step lookahead: tries each move, scores the result (attacks as hit/miss weighted by the real odds), ends the turn when nothing beats banking.
  greedy: (s, p) => {
    let best = END, bestV = val(tryAct(s, p, END), p) + 0.5 * s.actions;
    for (const a of options(s)) {
      const n = tryAct(s, p, a);
      let v;
      if (n.phase === 'defend') {
        const d = tryAct(n, 1 - p, { type: 'defend', i: block(n, 1 - p) });
        v = d ? val(d, p) : val(n, p);
      } else v = val(n, p);
      if (v > bestV) { bestV = v; best = a; }
    }
    return best;
  },
};

function play(decks, pols, cap = 200, track) {
  let s = newGame(decks, ['A', 'B'], rng);
  const st = { first: s.turn, attacks: 0, hits: 0, direct: 0, supers: 0, kos: 0 };
  for (let steps = 0; s.phase !== 'over' && s.turnNo < cap && steps < 5000; steps++) {
    const p = s.phase === 'defend' ? 1 - s.turn : s.turn;
    const a = s.phase === 'defend' ? { type: 'defend', i: block(s, p) } : pols[p](s, p);
    s.events = [];
    const n = tryAct(s, p, a) || tryAct(s, p, END);
    if (!n) throw new Error('stuck on ' + JSON.stringify(a));
    track?.(s, n);
    for (const e of n.events) {
      if (e.k === 'attack') { if (e.roll) { st.attacks++; if (e.roll.hit) st.hits++; } else st.direct++; }
      if (e.k === 'cast' && CARD[e.id].type === 'captain') st.supers++;
      if (e.k === 'hit' && e.ko) st.kos++;
    }
    s = n; s.log = [];
  }
  return { winner: s.phase === 'over' ? s.winner : -1, turns: s.turnNo, deckout: s.players.some(p => p.fatigue), ...st };
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

// MATRIX=1 node tools/sim.js <games per cell> <seed>: strategy vs strategy win rates as JSON.
if (process.env.MATRIX) {
  const names = Object.keys(POL), w = {}, g = {};
  for (const a of names) for (const b of names) { if (a === b) continue; const k = a + '|' + b; w[k] = 0; g[k] = 0;
    for (let i = 0; i < N; i++) { const sw = i % 2, r = play(sw ? [STARTERS[1], STARTERS[0]] : [STARTERS[0], STARTERS[1]], [POL[a], POL[b]]); if (r.winner < 0) continue; g[k]++; w[k] += r.winner === 0; } }
  process.stdout.write(JSON.stringify({ names, w, g })); process.exit(0);
}

// FOCUS=<cardId> node tools/sim.js <games> <seed>: win rate of a random deck with 0, 1, 2 or 3 copies of one card vs random decks without it.
if (process.env.FOCUS) {
  const id = process.env.FOCUS, res = [0, 1, 2, 3].map(() => ({ g: 0, w: 0 }));
  const strip = d => { const n = d.cards[id] || 0; delete d.cards[id]; for (let i = 0; i < n; i++) { for (let t = 0; t < 200; t++) { const c = pick(CARDS); if (c.id !== id && (d.cards[c.id] || 0) < 3) { d.cards[c.id] = (d.cards[c.id] || 0) + 1; break; } } } return d; };
  for (let g = 0; g < N; g++) {
    const k = g % 4, a = strip(randomDeck()), b = strip(randomDeck());
    for (let i = 0; i < k; i++) { const ids = Object.keys(a.cards); const out = ids[Math.floor(rng() * ids.length)]; if (--a.cards[out] <= 0) delete a.cards[out]; }
    if (k) a.cards[id] = k;
    const seat = g % 2, rr = play(seat ? [b, a] : [a, b], [POL.greedy, POL.greedy]); if (rr.winner < 0) continue;
    res[k].g++; res[k].w += rr.winner === seat;
  }
  process.stdout.write(JSON.stringify({ id, res })); process.exit(0);
}

// CAPS=1 node tools/sim.js <games> <seed> [Boredom]: each Captain's win rate on random decks vs random decks with a random Captain (greedy vs greedy).
if (process.env.CAPS) {
  const res = Object.fromEntries(CAPTAINS.map(c => [c.id, { g: 0, w: 0, turns: 0 }]));
  for (let g = 0; g < N; g++) {
    const cap = CAPTAINS[g % CAPTAINS.length].id, a = { ...randomDeck(), captain: cap }, b = randomDeck(), seat = (g >> 3) % 2;
    const r = play(seat ? [b, a] : [a, b], [POL.greedy, POL.greedy]); if (r.winner < 0) continue;
    res[cap].g++; res[cap].w += r.winner === seat; res[cap].turns += r.turns || 0;
  }
  for (const [id, x] of Object.entries(res).sort((p, q) => q[1].w / q[1].g - p[1].w / p[1].g)) console.log(`${CARD[id].name.padEnd(12)} ${(100 * x.w / x.g).toFixed(0).padStart(3)}%  (${x.g} games, avg ${(x.turns / x.g).toFixed(1)} turns)  ${CARD[id].text}`);
  process.exit(0);
}

// HEALTH=1 node tools/sim.js <games> <seed>: whole-game health on random decks (greedy vs greedy) as one JSON line:
// avg turns, first-player win rate, direct attacks per game, share of Boredom that came from direct hits, Boredom dealt by the end of turn 4.
if (process.env.HEALTH) {
  const h = { games: 0, turns: 0, firstWins: 0, direct: 0, boreDirect: 0, boreAll: 0, early: 0, capped: 0 };
  for (let g = 0; g < N; g++) {
    let early = 0;
    const decks = process.env.HEALTH === 'starters' ? [pick(STARTERS), pick(STARTERS)] : [randomDeck(), randomDeck()]; // HEALTH=starters: the 3 starter decks
    const r = play(decks, [POL.greedy, POL.greedy], 200, (s0, n) => {
      const bore = n.events.filter(e => e.k === 'meter' && e.key === 'bore' && e.n > 0).reduce((x, e) => x + e.n, 0);
      h.boreAll += bore; if (n.turnNo <= 4) early += bore;
      if (n.events.some(e => e.k === 'attack' && e.direct)) h.boreDirect += bore;
    });
    if (r.winner < 0) { h.capped++; continue; }
    h.games++; h.turns += r.turns; h.firstWins += r.winner === r.first; h.direct += r.direct; h.early += early;
  }
  process.stdout.write(JSON.stringify({ games: h.games, avgTurns: +(h.turns / h.games).toFixed(1), firstWin: +(h.firstWins / h.games).toFixed(3), directPerGame: +(h.direct / h.games).toFixed(2),
    directShare: +(h.boreDirect / h.boreAll).toFixed(3), boreByT4: +(h.early / h.games).toFixed(2), capped: h.capped }) + '\n');
  process.exit(0);
}

// ROUNDROBIN=<decks.json> node tools/sim.js <games per pairing> <seed>: every deck vs every deck, seats alternated.
if (process.env.ROUNDROBIN) {
  const D = JSON.parse(fs.readFileSync(process.env.ROUNDROBIN, 'utf8')), n = D.length;
  const wins = Array(n).fill(0), games = Array(n).fill(0), pair = D.map(() => Array(n).fill(0));
  const part = +(process.env.RR_PART || 0), parts = +(process.env.RR_PARTS || 1); let pairNo = 0; // split the pairings across processes
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (pairNo++ % parts !== part) continue; let wi = 0, g = 0;
    for (let k = 0; k < N; k++) { const seat = k % 2, r = play(seat ? [D[j], D[i]] : [D[i], D[j]], [POL.greedy, POL.greedy]); if (r.winner < 0) continue; g++; if (r.winner === seat) wi++; }
    pair[i][j] = wi / Math.max(1, g); pair[j][i] = 1 - pair[i][j]; wins[i] += wi; wins[j] += g - wi; games[i] += g; games[j] += g; }
  process.stdout.write(JSON.stringify({ wins, games, pair })); process.exit(0);
}

// DECKOPT=1 node tools/sim.js <games per deck per generation> <seed> [knockout] [HP scale]: evolves decks with a genetic search
// (greedy bots, random-deck and starter opponents), prints the best decks and the generation history as JSON.
if (process.env.DECKOPT) {
  const POP = +(process.env.POP || 16), GENS = +(process.env.GENS || 10), ELITE = 4, M = N;
  const pool = CARDS.map(c => c.id);
  const total = d => Object.values(d.cards).reduce((a, b) => a + b, 0);
  const clone = d => ({ captain: d.captain, cards: { ...d.cards } });
  function addRandom(d) { for (let t = 0; t < 200; t++) { const id = pick(pool); if ((d.cards[id] || 0) < 3) { d.cards[id] = (d.cards[id] || 0) + 1; return; } } }
  function removeRandom(d) { const ids = Object.keys(d.cards); const id = pick(ids); if (--d.cards[id] <= 0) delete d.cards[id]; }
  function mutate(d) { const c = clone(d), k = 1 + Math.floor(rng() * 3); for (let i = 0; i < k; i++) { removeRandom(c); addRandom(c); } if (rng() < 0.15) c.captain = pick(CAPTAINS).id; return c; }
  function cross(a, b) { const c = { captain: rng() < 0.5 ? a.captain : b.captain, cards: {} };
    for (const [id, n] of Object.entries(a.cards)) for (let i = 0; i < n; i++) if (rng() < 0.5 && (c.cards[id] || 0) < 3) c.cards[id] = (c.cards[id] || 0) + 1;
    const rest = Object.entries(b.cards).flatMap(([id, n]) => Array(n).fill(id)); while (total(c) < DECK_SIZE && rest.length) { const id = rest.splice(Math.floor(rng() * rest.length), 1)[0]; if ((c.cards[id] || 0) < 3) c.cards[id] = (c.cards[id] || 0) + 1; }
    while (total(c) < DECK_SIZE) addRandom(c); return c; }
  const opponents = pop => [...pop, ...STARTERS, randomDeck(), randomDeck()];
  function fitness(d, opps) { let w = 0, g = 0; for (let k = 0; k < M; k++) { const o = opps[Math.floor(rng() * opps.length)], seat = k % 2, r = play(seat ? [o, d] : [d, o], [POL.greedy, POL.greedy]); if (r.winner >= 0) { g++; w += r.winner === seat; } } return g ? w / g : 0; }
  let pop = [...STARTERS.map(clone), ...Array.from({ length: POP - STARTERS.length }, () => randomDeck())];
  const history = [];
  for (let gen = 0; gen < GENS; gen++) {
    const opps = opponents(pop), scored = pop.map(d => ({ d, f: fitness(d, opps) })).sort((x, y) => y.f - x.f);
    history.push({ gen, best: scored[0].f, mean: scored.reduce((a, x) => a + x.f, 0) / scored.length });
    const elite = scored.slice(0, ELITE).map(x => x.d);
    pop = [...elite]; while (pop.length < POP) { const pa = pick(elite), pb = pick(scored.slice(0, POP / 2)).d; pop.push(mutate(rng() < 0.5 ? cross(pa, pb) : pa)); }
    if (gen === GENS - 1) { process.stdout.write(JSON.stringify({ history, top: scored.slice(0, 5).map(x => ({ fitness: x.f, deck: x.d })) })); }
  }
  process.exit(0);
}

// CARDS=1 node tools/sim.js <games> <seed> [knockout] [HP scale]: random-deck greedy games, per-card stats as JSON (combine with tools/simcards.js).
if (process.env.CARDS) {
  const out = { games: 0, turns: 0, firstWins: 0, cards: {} };
  const C = id => (out.cards[id] ||= { deck: 0, deckWins: 0, played: 0, playedWins: 0, plays: 0, kos: 0, life: 0, lifeN: 0, dmg: 0, attacks: 0, blocked: 0 });
  for (let g = 0; g < N; g++) {
    const decks = [randomDeck(), randomDeck()], born = [{}, {}], playedIn = [new Set(), new Set()];
    const r = play(decks, [POL.greedy, POL.greedy], 200, (s0, n) => {
      for (const e of n.events) {
        if (e.k === 'play') { const id = e.zone === 'field' ? n.players[e.p].field[e.i]?.id : n.players[e.p].effects[e.i]?.id; if (!id) continue; C(id).plays++; playedIn[e.p].add(id); if (e.zone === 'field') (born[e.p][id] ||= []).push(n.turnNo); }
        if (e.k === 'hit' && e.ko) { const id = s0.players[e.p].field[e.i]?.id; if (!id) continue; C(id).kos++; const t = born[e.p][id]?.shift(); if (t != null) { C(id).life += n.turnNo - t; C(id).lifeN++; } }
        if (e.k === 'attack') { const id = s0.players[e.p].field[e.i]?.id; if (!id) continue; const c = C(id); c.attacks++;
          const d = e.direct ? n.events.filter(m => m.k === 'meter' && m.key === 'bore' && m.p === 1 - e.p).reduce((x, m) => x + m.n, 0) : e.roll?.dmg || 0; c.dmg += d; if (!e.direct && !e.roll?.hit) c.blocked++; }
      }
    });
    if (r.winner < 0) continue;
    out.games++; out.turns += r.turns; out.firstWins += r.winner === r.first; out.deckouts = (out.deckouts || 0) + (r.deckout ? 1 : 0);
    decks.forEach((d, i) => { const won = r.winner === i ? 1 : 0; for (const id of Object.keys(d.cards)) { const c = C(id); c.deck++; c.deckWins += won; if (playedIn[i].has(id)) { c.played++; c.playedWins += won; } } (out.caps ||= {})[d.captain] ||= [0, 0]; out.caps[d.captain][0]++; out.caps[d.captain][1] += won; });
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

const pct = x => (100 * x).toFixed(0).padStart(3) + '%';
const t0 = Date.now(), agg = {};
const note = (k, r, won) => { const a = (agg[k] ||= { g: 0, w: 0, turns: 0, attacks: 0, hits: 0, direct: 0, goof: 0, bore: 0, draws: 0 });
  a.g++; a.w += won; a.turns += r.turns; a.attacks += r.attacks; a.hits += r.hits; a.direct += r.direct; a.goof += r.supers; a.bore += r.kos; a.draws += r.winner < 0; };

console.log(`== Strategy matrix: row's win rate vs column (${N} games each, starter decks swapped every game, defender blocks with the Character that loses least) ==`);
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
console.log(`\n== Random legal decks (${G} games, greedy vs greedy, random Captain, 0-10 Items/Evils) ==`);
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
console.log('Win rate by number of Items/Evils in the deck:'); for (const [k, r, g] of show(mix).sort((x, y) => x[0] - y[0])) console.log(`  ${String(k).padStart(2)}: ${pct(r)} (${g})`);
const cs = show(card, 40), line = ([k, r, g]) => { const c = CARD[k]; return `  ${pct(r)} (${g}) ${c.name} [${c.type}${c.def ? ` DEF${c.def} HP${c.hp}` : ''}${c.moves ? ' ' + c.moves.map(m => `${m.name} c${m.cost}${m.ability ? ' abil' : ` p${m.power}`}`).join(', ') : ''}]${c.text ? ' ' + c.text : ''}`; };
console.log('Best cards (win rate when in the deck):'); cs.slice(0, 12).forEach(x => console.log(line(x)));
console.log('Worst cards:'); cs.slice(-12).forEach(x => console.log(line(x)));
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
