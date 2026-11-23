// Rules engine. Pure: apply(state, player, action) returns a new state or throws Error(message for the player).
// Card effects come from card data (key at the top of cards.js); the manual actions cover anything else.
// Each new state carries `events` describing what just happened, which the UI animates.
const MAX_COPIES = 3;
const METERS = { goof: 'Goofiness', bore: 'Boredom', points: 'Points' };

const expand = cards => Object.entries(cards).flatMap(([id, n]) => Array(n).fill(id));

function shuffle(a, rng) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Returns a list of problems; empty = legal. Also the trust boundary for decks arriving over the network.
function deckProblems(d) {
  const out = [];
  if (!d || typeof d !== 'object' || !d.cards || typeof d.cards !== 'object') return ['Not a deck.'];
  if (CARD[d.captain]?.type !== 'captain') out.push('Pick a Captain.');
  let total = 0;
  for (const [id, n] of Object.entries(d.cards)) {
    const c = CARD[id];
    if (!c || c.type === 'captain') { out.push(`Unknown card "${id}".`); continue; }
    if (!Number.isInteger(n) || n < 1) out.push(`Bad count for ${c.name}.`);
    else if (n > (c.main ? 1 : MAX_COPIES)) out.push(c.main ? `${c.name} is a Main Character: max 1.` : `Max ${MAX_COPIES} copies of ${c.name}.`);
    total += Number.isInteger(n) ? n : 0;
  }
  if (total !== DECK_SIZE) out.push(`${total}/${DECK_SIZE} cards.`);
  return out;
}

// Everything of a player's that can carry effects: Captain, Characters in play, active Bits and Evils.
const sources = (s, pi) => { const p = s.players[pi]; return [CARD[p.captain], ...p.field.map(f => CARD[f.id]), ...p.effects.map(e => CARD[e.id])]; };
const modSum = (s, pi, key) => sources(s, pi).reduce((n, c) =>
  n + (c.mod?.[key] && !(c.mod.if === 'noGoof' && s.players[pi].goof) ? c.mod[key] : 0), 0);
// A Character's live numbers: DEF with modifiers, and `bonus` power added to each of its attacks.
const statsOf = (s, pi, f) => ({ def: CARD[f.id].def + modSum(s, pi, 'def'), bonus: modSum(s, pi, 'atk') });
const moveCost = (s, pi, mv) => mv.cost + (mv.ability ? 0 : modSum(s, 1 - pi, 'oppAttackCost'));
const playCost = (s, pi, c) => 1 + (c.type === 'evil' ? modSum(s, 1 - pi, 'oppEvilCost') : 0);
const canAttack = (s, f) => !(CARD[f.id].sick && f.t === s.turnNo);
// Can this Character use any move right now with the Actions left?
const canUseAny = (s, pi, f) => (CARD[f.id].moves || []).some(mv => moveCost(s, pi, mv) <= s.actions && (mv.ability || canAttack(s, f)));

function newGame(decks, names, rng = Math.random) {
  const players = [0, 1].map(i => {
    const deck = shuffle(expand(decks[i].cards), rng);
    return { name: names[i], captain: decks[i].captain, deck: deck.slice(5), hand: deck.slice(0, 5), field: [], effects: [],
      points: 0, goof: 0, bore: 0, stats: { goof: 0, bore: 0 } };
  });
  const first = rng() < 0.5 ? 0 : 1;
  // The first player skips their opening draw: they simply start with 5 cards.
  return { players, turn: first, turnNo: 1, actions: 2, phase: 'play', pending: null, roll: null, winner: null, seq: 0, capUsed: false, events: [],
    log: [`${names[first]} won the coin flip and goes first.`] };
}

function apply(s0, p, a, rng = Math.random) {
  const s = structuredClone(s0);
  const me = s.players[p], opp = s.players[1 - p];
  const say = t => { s.log.push(t); if (s.log.length > 60) s.log.shift(); };
  const ev = e => s.events.push(e);
  const at = (arr, i) => { if (!Number.isInteger(i) || !arr[i]) throw new Error('That card is gone.'); return arr[i]; };
  const who = () => { if (a.who !== 0 && a.who !== 1) throw new Error('Bad player.'); return s.players[a.who]; };
  const step = () => { if (a.d !== 1 && a.d !== -1) throw new Error('Bad amount.'); return a.d; };
  const spend = n => {
    if (s.turn !== p) throw new Error('Not your turn.');
    if (s.actions < n) throw new Error(n > 1 ? `That costs ${n} Actions.` : 'No Actions left.');
    s.actions -= n;
  };
  const draw = pi => {
    const pl = s.players[pi];
    if (pl.deck.length) { pl.hand.push(pl.deck.shift()); ev({ k: 'draw', p: pi }); } else say(`${pl.name}'s deck is empty.`);
  };
  const gain = (pi, key, n) => { // meters only; returns the real change
    const t = s.players[pi];
    if (key === 'goof' && n > 0) n += modSum(s, pi, 'goofBonus');
    const before = t[key];
    t[key] = Math.max(0, t[key] + n);
    const d = t[key] - before;
    if (d > 0 && key === 'goof') t.stats.goof += d;
    if (d > 0 && key === 'bore') s.players[1 - pi].stats.bore += d;
    if (d) ev({ k: 'meter', p: pi, key, n: d });
    return d;
  };
  // ctx: { self, target } as { p, i } field positions, for 'hp' steps inside moves
  const runOps = (pi, ops, c, ctx = {}) => {
    for (const [what, a1, a2] of ops || []) {
      if (what === 'flip') {
        const heads = rng() < 0.5;
        ev({ k: 'coin', p: pi, heads });
        say(`${c.name}: coin flip, ${heads ? 'heads' : 'tails'}.`);
        runOps(pi, heads ? a1 : a2, c, ctx);
        continue;
      }
      if (what === 'hp') {
        const pos = a1 === 'self' ? ctx.self : ctx.target, f = pos && s.players[pos.p].field[pos.i];
        if (!f || f.hp <= 0) continue;
        for (let k = 0; k < a2; k++) hurt(pos.p, pos.i);
        say(`${c.name}: ${CARD[f.id].name} -${a2} HP.`);
        continue;
      }
      const ti = a1 === 'opp' ? 1 - pi : pi, t = s.players[ti];
      if (what === 'goof' || what === 'bore') { const d = gain(ti, what, a2); say(`${c.name}: ${t.name} ${d >= 0 ? '+' : ''}${d} ${METERS[what]}.`); }
      else if (what === 'draw') { for (let k = 0; k < a2; k++) draw(ti); say(`${c.name}: ${t.name} draws ${a2}.`); }
      else if (what === 'actions' && s.turn === ti) { s.actions = Math.max(0, s.actions + a2); say(`${c.name}: ${a2 > 0 ? '+' : ''}${a2} Action${Math.abs(a2) > 1 ? 's' : ''}.`); }
    }
  };
  const hurt = (pi, i) => { const f = s.players[pi].field[i]; if (f.hp <= 0) return; f.hp--; ev({ k: 'hit', p: pi, i, ko: f.hp <= 0 }); };
  const cull = pl => { pl.field = pl.field.filter(f => f.hp > 0 || (say(`${CARD[f.id].name} was defeated.`), false)); };

  if (s.phase === 'over') throw new Error('The game is over.');
  if (s.phase === 'defend' && a.type !== 'defend') throw new Error('Waiting for a defender.');
  s.roll = null;
  s.events = [];

  switch (a.type) {
    case 'play': {
      const id = at(me.hand, a.i), c = CARD[id];
      spend(playCost(s, p, c));
      me.hand.splice(a.i, 1);
      if (c.type === 'character') { me.field.push({ id, hp: c.hp, t: s.turnNo }); ev({ k: 'play', p, zone: 'field', i: me.field.length - 1 }); }
      else { me.effects.push(c.type === 'bit' ? { id, turns: c.dur } : { id }); ev({ k: 'play', p, zone: 'fx', i: me.effects.length - 1 }); ev({ k: 'cast', p, id }); }
      say(`${me.name} played ${c.name}.`);
      runOps(p, c.onPlay, c);
      break;
    }
    case 'attack': { // use one of a Character's moves: a.i = field position, a.m = move index
      const f = at(me.field, a.i), c = CARD[f.id], mv = c.moves?.[a.m], self = { p, i: a.i };
      if (!mv) throw new Error('No such move.');
      if (mv.ability) {
        spend(moveCost(s, p, mv));
        say(`${c.name} used ${mv.name}.`);
        ev({ k: 'move', p, i: a.i, name: mv.name });
        runOps(p, mv.ops, c, { self });
        break;
      }
      if (!canAttack(s, f)) throw new Error(`${c.name} can't attack the turn it's played.`);
      spend(moveCost(s, p, mv));
      if (opp.field.length) { s.phase = 'defend'; s.pending = { i: a.i, m: a.m }; say(`${c.name} uses ${mv.name}! ${opp.name} picks a defender.`); }
      else {
        const power = mv.power + statsOf(s, p, f).bonus;
        ev({ k: 'attack', p, i: a.i, direct: true, move: mv.name });
        gain(1 - p, 'bore', power);
        say(`${c.name} uses ${mv.name} directly: ${opp.name} +${power} Boredom.`);
        runOps(p, mv.onHit, c, { self });
      }
      cull(me);
      break;
    }
    case 'defend': {
      if (s.phase !== 'defend' || s.turn === p) throw new Error('Nothing to defend.');
      const ai = 1 - p, af = at(opp.field, s.pending.i), df = at(me.field, a.i);
      const ac = CARD[af.id], dc = CARD[df.id], mv = ac.moves[s.pending.m];
      const power = mv.power + statsOf(s, ai, af).bonus, def = statsOf(s, p, df).def;
      const roll = () => 1 + Math.floor(rng() * 20);
      const rolls = dc.disadv ? [roll(), roll()] : [roll()], die = Math.min(...rolls), total = die + power, hit = total >= def;
      ev({ k: 'attack', p: ai, i: s.pending.i, target: { p, i: a.i }, move: mv.name, roll: { die, rolls, atk: power, def, total, hit } });
      if (hit) { hurt(p, a.i); gain(p, 'bore', power); } else hurt(ai, s.pending.i);
      s.roll = { seq: s.seq + 1, die, rolls, atk: power, def, total, hit, a: af.id, d: df.id, aHp: af.hp, dHp: df.hp, by: ai };
      say(`${mv.name}: rolled ${rolls.length > 1 ? `${rolls.join(' & ')}, kept ${die}` : die} + ${power} = ${total} vs ${def} DEF: ` + (hit
        ? `breaks through! ${dc.name} -1 HP, ${me.name} +${power} Boredom.`
        : `blocked! ${ac.name} -1 HP.`));
      if (hit) {
        runOps(ai, mv.onHit, ac, { self: { p: ai, i: s.pending.i }, target: { p, i: a.i } });
        runOps(ai, ac.onBreak, ac);
      }
      cull(opp); cull(me);
      s.phase = 'play'; s.pending = null;
      break;
    }
    case 'ability': { // Captain ability; Character abilities are moves
      const c = CARD[me.captain];
      if (a.i !== -1 || !c.ability) throw new Error(`${c.name} has no ability to use.`);
      if (c.once && s.capUsed) throw new Error(`${c.name}'s ability is once per turn.`);
      spend(1);
      s.capUsed = true;
      say(`${me.name} used ${c.name}'s ability.`);
      ev({ k: 'cast', p, id: c.id });
      runOps(p, c.ability, c);
      break;
    }
    case 'end': {
      if (s.turn !== p) throw new Error('Not your turn.');
      me.effects = me.effects.filter(e => {
        if (e.turns == null || --e.turns > 0) return true;
        say(`${CARD[e.id].name} wore off.`);
        return false;
      });
      s.turn = 1 - p; s.turnNo++; s.actions = 2; s.capUsed = false;
      draw(1 - p);
      say(`${opp.name}'s turn.`);
      ev({ k: 'turn', p: 1 - p });
      for (const c of sources(s, 1 - p)) runOps(1 - p, c.onTurnStart, c);
      for (const c of sources(s, p)) runOps(p, c.onOppTurnStart, c);
      break;
    }
    // ---- manual tools for card text the effect data doesn't cover ----
    case 'adjust': {
      const t = who(), d = step();
      if (a.key === 'actions') { s.actions = Math.max(0, s.actions + d); say(`${me.name} set Actions to ${s.actions}.`); break; }
      if (!METERS[a.key]) throw new Error('Bad meter.');
      const before = t[a.key];
      t[a.key] = Math.max(0, t[a.key] + d);
      if (t[a.key] === before) break;
      if (d > 0 && a.key === 'goof') t.stats.goof++;
      if (d > 0 && a.key === 'bore') s.players[1 - a.who].stats.bore++;
      if (a.key !== 'points') ev({ k: 'meter', p: a.who, key: a.key, n: d });
      say(`${me.name} set ${t.name}'s ${METERS[a.key]} to ${t[a.key]}.`);
      break;
    }
    case 'hp': {
      const t = who(), f = at(t.field, a.i), d = step();
      if (d < 0 && f.hp > 0) hurt(a.who, a.i); else f.hp += d > 0 ? 1 : 0;
      say(`${me.name} set ${CARD[f.id].name}'s HP to ${f.hp}.`);
      cull(t);
      break;
    }
    case 'turns': {
      const e = at(who().effects, a.i);
      if (e.turns == null) throw new Error('Evil cards last forever.');
      e.turns = Math.max(1, e.turns + step());
      say(`${me.name} set ${CARD[e.id].name} to ${e.turns} turn${e.turns > 1 ? 's' : ''}.`);
      break;
    }
    case 'discard': {
      const t = who(), zone = { field: 'field', fx: 'effects', hand: 'hand' }[a.zone];
      if (!zone || (zone === 'hand' && t !== me)) throw new Error("Can't remove that.");
      const item = at(t[zone], a.i);
      t[zone].splice(a.i, 1);
      say(`${me.name} removed ${CARD[item.id ?? item].name}${zone === 'hand' ? ' from their hand' : ''}.`);
      break;
    }
    case 'draw': draw(p); say(`${me.name} drew a card.`); break;
    default: throw new Error('Unknown action.');
  }

  // Scoring: a meter reaching 5 scores a Point and resets to 0; overflow is lost.
  for (const [i, pl] of s.players.entries()) {
    const other = s.players[1 - i];
    if (pl.goof >= 5) { pl.goof = 0; pl.points++; ev({ k: 'point', p: i }); say(`${pl.name} hit 5 Goofiness: +1 Point!`); }
    if (pl.bore >= 5) { pl.bore = 0; other.points++; ev({ k: 'point', p: 1 - i }); say(`${pl.name} hit 5 Boredom: ${other.name} +1 Point!`); }
  }
  const won = [s.turn, 1 - s.turn].find(i => s.players[i].points >= 5);
  if (won !== undefined) { s.phase = 'over'; s.winner = won; say(`${s.players[won].name} wins!`); }
  s.seq++;
  return s;
}
