// Rules engine. Pure: apply(state, player, action) returns a new state or throws Error(message for the player).
// Card effects come from card data (key at the top of cards.js); the manual actions cover anything else.
// Each new state carries `events` describing what just happened, which the UI animates.
const MAX_COPIES = 3;
const MAX_ACTIONS = 5; // unused Actions carry over; you start a turn with at most this many (card bonuses can go past it)
const METERS = { goof: 'Creativity', bore: 'Boredom' };
const GOOF_MAX = 10; // Creativity is a hype meter you spend; it stops filling here

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

// Everything of a player's that can carry effects: Captain, Characters in play, active Items and Evils.
const sources = (s, pi) => { const p = s.players[pi]; return [CARD[p.captain], ...p.field.map(f => CARD[f.id]), ...p.effects.map(e => CARD[e.id])]; };
const modSum = (s, pi, key) => sources(s, pi).reduce((n, c) =>
  n + (c.mod?.[key] && modOn(s, pi, c) ? c.mod[key] : 0), 0);
// mod.if: 'noGoof' = while you have 0 Creativity; any other word = while you have another Character of that group on the field.
const modOn = (s, pi, c) => { const w = c.mod.if, F = s.players[pi].field; return !w || (w === 'noGoof' ? !s.players[pi].goof : F.filter(f => CARD[f.id].group === w && f.id !== c.id).length > 0); };
// A Character's live numbers: DEF with modifiers, and `bonus` power added to each of its attacks.
const statsOf = (s, pi, f) => ({ def: baseArmor(CARD[f.id]) + modSum(s, pi, 'def'), bonus: modSum(s, pi, 'atk') }); // def = armour
const moveCost = (s, pi, mv) => mv.cost + (mv.ability ? 0 : modSum(s, 1 - pi, 'oppAttackCost'));
const playCost = (s, pi, c) => (c.cost ?? 1) + (c.type === 'evil' ? modSum(s, 1 - pi, 'oppEvilCost') : 0);
const canAttack = (s, f) => !(CARD[f.id].sick && f.t === s.turnNo);
// Why move m of field card f can't be used right now ('' = it can).
function moveBlock(s, pi, f, m) {
  const mv = CARD[f.id].moves?.[m];
  if (!mv) return 'No such move.';
  if (moveCost(s, pi, mv) > s.actions) return 'Not enough Actions';
  if ((mv.goof || 0) > s.players[pi].goof) return 'Not enough Creativity';
  if (!mv.ability && !canAttack(s, f)) return 'Can attack next turn';
  if (mv.once && f.once?.[m] === s.turnNo) return 'Used this turn';
  if (f.acted === s.turnNo) return 'Already moved this turn';
  return '';
}
const canUseAny = (s, pi, f) => (CARD[f.id].moves || []).some((_, m) => !moveBlock(s, pi, f, m));

function newGame(decks, names, rng = Math.random) {
  const first = rng() < 0.5 ? 0 : 1;
  const players = [0, 1].map(i => {
    const deck = shuffle(expand(decks[i].cards), rng), n = i === first ? 5 : 6; // going second: one extra card
    return { name: names[i], captain: decks[i].captain, deck: deck.slice(n), hand: deck.slice(0, n), field: [], effects: [],
      goof: 0, bore: 0, bank: 0, fin: decks[i].finishes || {} /* card finishes, display only */, stats: { goof: 0, bore: 0 } };
  });
  // The first player skips their opening draw: they simply start with 5 cards.
  return { players, turn: first, turnNo: 1, actions: 1 + (CARD[decks[first].captain].mod?.actions || 0) /* first turn of the game: 1 Action */, phase: 'play', pending: null, roll: null, winner: null, seq: 0, capUsed: false, events: [],
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
    t[key] = Math.min(key === 'goof' ? GOOF_MAX : Infinity, Math.max(0, t[key] + n));
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
        f.lastHit = a2; for (let k = 0; k < a2; k++) hurt(pos.p, pos.i);
        say(`${c.name}: ${CARD[f.id].name} -${a2} HP.`);
        continue;
      }
      if (what === 'sac') { const f = ctx.self && s.players[ctx.self.p].field[ctx.self.i]; if (f) { f.hp = 0; f.sac = true; } continue; }
      const ti = a1 === 'opp' ? 1 - pi : pi, t = s.players[ti];
      if (what === 'purge') { for (let k = 0; k < a2; k++) { const e = t.effects.findLastIndex(x => CARD[x.id].type === 'evil'); if (e < 0) break; say(`${c.name}: ${CARD[t.effects[e].id].name} was purged.`); t.effects.splice(e, 1); } continue; }
      if (what === 'goof' || what === 'bore') { const d = gain(ti, what, a2); say(`${c.name}: ${t.name} ${d >= 0 ? '+' : ''}${d} ${METERS[what]}.`); }
      else if (what === 'draw') { for (let k = 0; k < a2; k++) draw(ti); say(`${c.name}: ${t.name} draws ${a2}.`); }
      else if (what === 'actions' && s.turn === ti) { s.actions = Math.max(0, s.actions + a2); say(`${c.name}: ${a2 > 0 ? '+' : ''}${a2} Action${Math.abs(a2) > 1 ? 's' : ''}.`); }
    }
  };
  const hurt = (pi, i) => { const f = s.players[pi].field[i]; if (f.hp <= 0) return; f.hp--; ev({ k: 'hit', p: pi, i, ko: f.hp <= 0 }); };
  const cull = pl => {
    const pi = s.players.indexOf(pl);
    pl.field = pl.field.filter(f => {
      if (f.hp > 0) return true;
      const c = CARD[f.id];
      say(`${c.name} was ${f.sac ? 'sacrificed' : 'defeated'}.`);
      return false;
    });
  };

  if (s.phase === 'over') throw new Error('The game is over.');
  if (s.phase === 'defend' && a.type !== 'defend') throw new Error('Waiting for a blocker.');
  s.roll = null;
  s.events = [];

  switch (a.type) {
    case 'play': {
      const id = at(me.hand, a.i), c = CARD[id];
      spend(playCost(s, p, c));
      me.hand.splice(a.i, 1);
      if (c.type === 'character') { me.field.push({ id, hp: maxHp(c), t: s.turnNo }); ev({ k: 'play', p, zone: 'field', i: me.field.length - 1 }); }
      else if (isInstant(c)) ev({ k: 'cast', p, id }); // instant: resolves and is gone, never sits on the table
      else { me.effects.push(c.type === 'bit' ? { id, turns: c.dur } : { id }); ev({ k: 'play', p, zone: 'fx', i: me.effects.length - 1 }); ev({ k: 'cast', p, id }); }
      say(`${me.name} played ${c.name}.`);
      runOps(p, c.onPlay, c);
      break;
    }
    case 'attack': { // use one of a Character's moves: a.i = field position, a.m = move index
      const f = at(me.field, a.i), c = CARD[f.id], mv = c.moves?.[a.m], self = { p, i: a.i };
      if (!mv) throw new Error('No such move.');
      if (mv.once && f.once?.[a.m] === s.turnNo) throw new Error(`${mv.name} is once per turn.`);
      if (f.acted === s.turnNo) throw new Error(`${c.name} has already used a move this turn.`); // one move per Character per turn
      if (mv.goof) { if (me.goof < mv.goof) throw new Error(`${mv.name} needs ${mv.goof} Creativity.`); gain(p, 'goof', -mv.goof); }
      if (mv.once) f.once = { ...f.once, [a.m]: s.turnNo };
      f.acted = s.turnNo;
      if (mv.ability) {
        spend(moveCost(s, p, mv));
        say(`${c.name} used ${mv.name}.`);
        ev({ k: 'move', p, i: a.i, name: mv.name });
        runOps(p, mv.ops, c, { self });
        cull(me); cull(opp);
        break;
      }
      if (!canAttack(s, f)) throw new Error(`${c.name} can't attack the turn it's played.`);
      spend(moveCost(s, p, mv));
      if (opp.field.length) { s.phase = 'defend'; s.pending = { i: a.i, m: a.m }; say(`${c.name} uses ${mv.name}! ${opp.name} picks a blocker.`); }
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
    case 'defend': { // the defender picks which Character blocks; damage = power - armour
      if (s.phase !== 'defend' || s.turn === p) throw new Error('Nothing to defend.');
      const ai = 1 - p, af = at(opp.field, s.pending.i), df = at(me.field, a.i);
      const ac = CARD[af.id], dc = CARD[df.id], mv = ac.moves[s.pending.m];
      const power = mv.power + statsOf(s, ai, af).bonus, armor = statsOf(s, p, df).def, dmg = Math.max(0, power - armor), hit = dmg > 0;
      // Spill-over: damage past the blocker's HP moves on to the next Character (its own armour applies), then to Boredom.
      let left = power, ti = a.i, bore = 0; const hitIdx = new Set(), spill = [];
      while (left > 0) {
        const tf = me.field[ti];
        if (!tf) { bore = left; gain(p, 'bore', left); break; }
        const through = Math.max(0, left - statsOf(s, p, tf).def), taken = Math.min(through, tf.hp);
        for (let k = 0; k < taken; k++) hurt(p, ti);
        if (ti !== a.i) spill.push(`${CARD[tf.id].name} -${taken}`);
        hitIdx.add(ti); left = through - taken;
        if (!through) break;
        ti = me.field.findIndex((f, j) => f.hp > 0 && !hitIdx.has(j));
        if (ti < 0) ti = me.field.length; // nobody left to take it
      }
      ev({ k: 'attack', p: ai, i: s.pending.i, target: { p, i: a.i }, move: mv.name, roll: { atk: power, def: armor, dmg, hit, spill: spill.length, bore } });
      s.roll = { seq: s.seq + 1, atk: power, def: armor, dmg, hit, a: af.id, d: df.id, by: ai, bore };
      say(`${mv.name} hits ${dc.name} for ${power}${armor ? ` (armour ${armor})` : ''}: ` + (hit ? `${dmg} damage${spill.length ? `, spilling over: ${spill.join(', ')}` : ''}${bore ? `, ${me.name} +${bore} Boredom` : ''}.` : 'all blocked!'));
      if (hit) {
        runOps(ai, mv.onHit, ac, { self: { p: ai, i: s.pending.i }, target: { p, i: a.i } });
        runOps(ai, ac.onBreak, ac, { self: { p: ai, i: s.pending.i } });
      }
      cull(opp); cull(me);
      s.phase = 'play'; s.pending = null;
      break;
    }
    case 'ability': { // Captain Super: costs Creativity (c.goof); Character abilities are moves
      const c = CARD[me.captain];
      if (a.i !== -1 || !c.ability) throw new Error(`${c.name} has no ability to use.`);
      if (c.once && s.capUsed) throw new Error(`${c.name}'s Super is once per turn.`);
      if (s.turn !== p) throw new Error('Not your turn.');
      if (me.goof < (c.goof || 0)) throw new Error(`${c.name}'s Super needs ${c.goof} Creativity.`);
      gain(p, 'goof', -(c.goof || 0));
      s.capUsed = true;
      say(`${me.name} used ${c.name}'s Super!`);
      ev({ k: 'cast', p, id: c.id });
      runOps(p, c.ability, c);
      cull(me); cull(opp);
      break;
    }
    case 'cleanse': { // remove one of the opponent's Evils
      const e = at(opp.effects, a.i);
      if (CARD[e.id].type !== 'evil') throw new Error('Only Evils can be cleansed.');
      spend(2);
      opp.effects.splice(a.i, 1);
      ev({ k: 'move', p, name: 'Cleanse' });
      say(`${me.name} cleansed ${CARD[e.id].name}.`);
      break;
    }
    case 'end': {
      if (s.turn !== p) throw new Error('Not your turn.');
      me.effects = me.effects.filter(e => {
        if (e.turns == null || --e.turns > 0) return true;
        say(`${CARD[e.id].name} wore off.`);
        return false;
      });
      // Leftover Actions are saved for your next turn; the new player gets 2 plus whatever they saved (capped), plus passives.
      me.bank = s.actions;
      s.turn = 1 - p; s.turnNo++; s.capUsed = false;
      const saved = opp.bank || 0;
      s.actions = Math.min(MAX_ACTIONS, saved + 2) + modSum(s, 1 - p, 'actions');
      opp.bank = 0;
      if (opp.deck.length) draw(1 - p);
      else { opp.fatigue = (opp.fatigue || 0) + 1; gain(1 - p, 'bore', opp.fatigue); say(`${opp.name} has no cards left to draw: +${opp.fatigue} Boredom.`); } // deck-out: escalating Boredom
      say(`${opp.name}'s turn${saved ? ` (${saved} Action${saved > 1 ? 's' : ''} saved, starts with ${s.actions})` : ''}.`);
      ev({ k: 'turn', p: 1 - p });
      gain(1 - p, 'goof', 1); // everyone gets +1 Creativity each turn, so attacking is never forced
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
      ev({ k: 'meter', p: a.who, key: a.key, n: d });
      say(`${me.name} set ${t.name}'s ${METERS[a.key]} to ${t[a.key]}.`);
      break;
    }
    case 'hp': {
      const t = who(), f = at(t.field, a.i), d = step();
      if (d < 0 && f.hp > 0) { f.lastHit = 1; hurt(a.who, a.i); } else f.hp += d > 0 ? 1 : 0;
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

  // Whoever reaches BORE_MAX Boredom is bored out of the game.
  const lost = [1 - s.turn, s.turn].find(i => s.players[i].bore >= BORE_MAX);
  if (lost !== undefined) { s.phase = 'over'; s.winner = 1 - lost; say(`${s.players[lost].name} got bored out. ${s.players[1 - lost].name} wins!`); }
  s.seq++;
  return s;
}
