// Rules engine. Pure: apply(state, player, action) returns a new state or throws Error(message for the player).
// Card effect text is NOT automated; players apply it with the manual actions (adjust, hp, turns, discard, draw).
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

function newGame(decks, names, rng = Math.random) {
  const players = [0, 1].map(i => {
    const deck = shuffle(expand(decks[i].cards), rng);
    return { name: names[i], captain: decks[i].captain, deck: deck.slice(5), hand: deck.slice(0, 5), field: [], effects: [],
      points: 0, goof: 0, bore: 0, stats: { goof: 0, bore: 0 } };
  });
  const first = rng() < 0.5 ? 0 : 1;
  // The first player skips their opening draw: they simply start with 5 cards.
  return { players, turn: first, turnNo: 1, actions: 2, phase: 'play', pending: null, roll: null, winner: null, seq: 0,
    log: [`${names[first]} won the coin flip and goes first.`] };
}

function apply(s0, p, a, rng = Math.random) {
  const s = structuredClone(s0);
  const me = s.players[p], opp = s.players[1 - p];
  const say = t => { s.log.push(t); if (s.log.length > 60) s.log.shift(); };
  const at = (arr, i) => { if (!Number.isInteger(i) || !arr[i]) throw new Error('That card is gone.'); return arr[i]; };
  const who = () => { if (a.who !== 0 && a.who !== 1) throw new Error('Bad player.'); return s.players[a.who]; };
  const step = () => { if (a.d !== 1 && a.d !== -1) throw new Error('Bad amount.'); return a.d; };
  const spend = () => {
    if (s.turn !== p) throw new Error('Not your turn.');
    if (s.actions < 1) throw new Error('No Actions left.');
    s.actions--;
  };
  const draw = pl => { if (pl.deck.length) pl.hand.push(pl.deck.shift()); else say(`${pl.name}'s deck is empty.`); };
  const cull = pl => { pl.field = pl.field.filter(f => f.hp > 0 || (say(`${CARD[f.id].name} was defeated.`), false)); };
  const bore = (target, by, n) => { target.bore += n; by.stats.bore += n; };

  if (s.phase === 'over') throw new Error('The game is over.');
  if (s.phase === 'defend' && a.type !== 'defend') throw new Error('Waiting for a defender.');
  s.roll = null;

  switch (a.type) {
    case 'play': {
      const id = at(me.hand, a.i), c = CARD[id];
      spend();
      me.hand.splice(a.i, 1);
      if (c.type === 'character') me.field.push({ id, hp: c.hp });
      else me.effects.push(c.type === 'bit' ? { id, turns: c.dur } : { id });
      say(`${me.name} played ${c.name}.`);
      break;
    }
    case 'attack': {
      const c = CARD[at(me.field, a.i).id];
      spend();
      if (opp.field.length) { s.phase = 'defend'; s.pending = { i: a.i }; say(`${c.name} attacks! ${opp.name} picks a defender.`); }
      else { bore(opp, me, c.atk); say(`${c.name} attacks directly: ${opp.name} +${c.atk} Boredom.`); }
      break;
    }
    case 'defend': {
      if (s.phase !== 'defend' || s.turn === p) throw new Error('Nothing to defend.');
      const atk = opp, af = at(atk.field, s.pending.i), df = at(me.field, a.i);
      const ac = CARD[af.id], dc = CARD[df.id];
      const die = 1 + Math.floor(rng() * 20), total = die + ac.atk, hit = total >= dc.def;
      if (hit) { df.hp--; bore(me, atk, ac.atk); } else af.hp--;
      s.roll = { seq: s.seq + 1, die, atk: ac.atk, def: dc.def, total, hit, a: af.id, d: df.id, aHp: af.hp, dHp: df.hp, by: 1 - p };
      say(`Rolled ${die} + ${ac.atk} = ${total} vs ${dc.def} DEF: ` + (hit
        ? `breaks through! ${dc.name} -1 HP, ${me.name} +${ac.atk} Boredom.`
        : `blocked! ${ac.name} -1 HP.`));
      cull(atk); cull(me);
      s.phase = 'play'; s.pending = null;
      break;
    }
    case 'ability': {
      const c = a.i === -1 ? CARD[me.captain] : CARD[at(me.field, a.i).id];
      spend();
      say(`${me.name} used ${c.name}: "${c.text}"`);
      break;
    }
    case 'end': {
      if (s.turn !== p) throw new Error('Not your turn.');
      me.effects = me.effects.filter(e => {
        if (e.turns == null || --e.turns > 0) return true;
        say(`${CARD[e.id].name} wore off.`);
        return false;
      });
      s.turn = 1 - p; s.turnNo++; s.actions = 2;
      draw(opp);
      say(`${opp.name}'s turn.`);
      break;
    }
    // ---- manual tools for applying card text ----
    case 'adjust': {
      const t = who(), d = step();
      if (a.key === 'actions') { s.actions = Math.max(0, s.actions + d); say(`${me.name} set Actions to ${s.actions}.`); break; }
      if (!METERS[a.key]) throw new Error('Bad meter.');
      t[a.key] = Math.max(0, t[a.key] + d);
      if (d > 0 && a.key === 'goof') t.stats.goof++;
      if (d > 0 && a.key === 'bore') s.players[1 - a.who].stats.bore++;
      say(`${me.name} set ${t.name}'s ${METERS[a.key]} to ${t[a.key]}.`);
      break;
    }
    case 'hp': {
      const t = who(), f = at(t.field, a.i);
      f.hp = Math.max(0, f.hp + step());
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
    case 'draw': draw(me); say(`${me.name} drew a card.`); break;
    default: throw new Error('Unknown action.');
  }

  // Scoring: a meter reaching 5 scores a Point and resets to 0; overflow is lost.
  for (const [i, pl] of s.players.entries()) {
    const other = s.players[1 - i];
    if (pl.goof >= 5) { pl.goof = 0; pl.points++; say(`${pl.name} hit 5 Goofiness: +1 Point!`); }
    if (pl.bore >= 5) { pl.bore = 0; other.points++; say(`${pl.name} hit 5 Boredom: ${other.name} +1 Point!`); }
  }
  const won = [s.turn, 1 - s.turn].find(i => s.players[i].points >= 5);
  if (won !== undefined) { s.phase = 'over'; s.winner = won; say(`${s.players[won].name} wins!`); }
  s.seq++;
  return s;
}
