// Self-check for the rules engine. Run: node test/game.test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const load = files => files.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const src = load(['test/fixture-cards.js', 'js/cards.js', 'js/game.js']);

// The real generated cards: both free starters must be legal and every Character usable.
vm.runInNewContext(load(['js/cards-data.js', 'js/cards.js', 'js/game.js']) + `
if (STARTERS.length !== 2 || STARTERS.some(d => deckProblems(d).length)) throw new Error('FAIL: real starters: ' + JSON.stringify(STARTERS.map(deckProblems)));
if (!CARDS.filter(c => c.type === 'character').every(c => c.moves?.some(m => m.cost <= 1))) throw new Error('FAIL: a real Character has no move costing 0-1');
`);

vm.runInNewContext(src + `
const assert = (ok, msg) => { if (!ok) throw new Error('FAIL: ' + msg); };
const throws = (fn, msg) => { try { fn(); } catch { return; } throw new Error('FAIL (no throw): ' + msg); };
const fixed = v => () => v;            // deterministic rng
const seq = (...v) => () => v.shift(); // rng that returns these in order

// ---- deck rules ----
assert(deckProblems(STARTER).length === 0, 'starter deck is legal');
assert(deckProblems({ ...STARTER, cards: { ...STARTER.cards, m_sticker: 2 } }).some(p => p.includes('Main')), 'main character max 1');
assert(deckProblems({ ...STARTER, cards: { ...STARTER.cards, b_ping: 4 } }).length > 0, 'max 3 copies');
assert(deckProblems({ ...STARTER, captain: 'c_vc_goblin' }).length > 0, 'captain must be a captain');
assert(deckProblems({ ...STARTER, cards: { ...STARTER.cards, nope: 1 } }).length > 0, 'unknown card rejected');
assert(CARDS.filter(c => c.type === 'character').every(c => c.moves.length === 2 && c.moves.some(m => m.cost === 2)), 'every Character has a 1- and a 2-Action move');

// A = Gremlin captain, B = Lurker captain (+2 DEF at 0 Goofiness). rng .1 -> A goes first.
let s = newGame([STARTER, { ...STARTER, captain: 'cap_lurker' }], ['A', 'B'], fixed(0.1));
assert(s.turn === 0 && s.players[0].hand.length === 5 && s.players[0].deck.length === DECK_SIZE - 5, 'deal + coin flip');

// ---- turn 1 (A): onPlay, direct attack with a move, sickness, Bit, Captain ability, Evil ----
s.players[0].hand = ['c_vc_goblin', 'c_night_owl', 'b_ping', 'e_slowmode'];
throws(() => apply(s, 1, { type: 'play', i: 0 }), 'cannot play on opponent turn');
s = apply(s, 0, { type: 'play', i: 0 });
assert(s.players[0].field[0].id === 'c_vc_goblin' && s.actions === 1 && s.players[0].goof === 1, 'VC Goblin onPlay: +1 Goofiness');
throws(() => apply(s, 0, { type: 'attack', i: 0, m: 1 }), 'Unmute Scream costs 2');
throws(() => apply(s, 0, { type: 'attack', i: 0, m: 7 }), 'no such move');
s = apply(s, 0, { type: 'attack', i: 0, m: 0 }); // Mic Spam, power 1, nobody to block
assert(s.players[1].bore === 1 && s.actions === 0, 'direct attack: power goes to Boredom');

s.actions = 6;
s = apply(s, 0, { type: 'attack', i: 0, m: 0 });
assert(s.players[1].bore === 2, 'same Character can attack again while Actions remain');
s = apply(s, 0, { type: 'play', i: 0 }); // Night Owl
throws(() => apply(s, 0, { type: 'attack', i: 1, m: 0 }), "Night Owl can't attack the turn it's played");
s = apply(s, 0, { type: 'play', i: 0 }); // @everyone Ping: B +2 -> 4
assert(s.players[1].bore === 4, 'Ping onPlay: opponent +2 Boredom');
s = apply(s, 0, { type: 'ability', i: -1 }); // Gremlin: B +1 -> 5 -> A scores, B resets
assert(s.players[0].points === 1 && s.players[1].bore === 0 && s.events.some(e => e.k === 'point' && e.p === 0), 'captain ability can score');
throws(() => apply(s, 0, { type: 'ability', i: -1 }), 'captain ability once per turn');
s = apply(s, 0, { type: 'play', i: 0 }); // Slowmode on A's side

const handB = s.players[1].hand.length;
s = apply(s, 0, { type: 'end' });
assert(s.turn === 1 && s.actions === 2 && s.players[1].hand.length === handB + 1 && !s.capUsed, 'turn passes with draw, captain use resets');

// ---- turn 2 (B): ability move, Slowmode raises attack costs only, Brainrot power, combat ----
s.players[1].hand = ['c_reply_guy', 'b_brainrot', 'c_lagger'];
s = apply(s, 1, { type: 'play', i: 0 }); // Reply Guy
s = apply(s, 1, { type: 'attack', i: 0, m: 0 }); // Well Actually (ability, 1 Action, not affected by Slowmode)
assert(s.players[0].bore === 1 && s.actions === 0, 'ability move: no roll, opponent +1 Boredom');
s.actions = 2;
throws(() => apply(s, 1, { type: 'attack', i: 0, m: 1 }), 'Slowmode: Ratio now costs 3');
assert(moveCost(s, 1, CARD.c_reply_guy.moves[1]) === 3 && moveCost(s, 1, CARD.c_reply_guy.moves[0]) === 1, 'Slowmode only taxes attacks');
s.actions = 5;
s = apply(s, 1, { type: 'play', i: 0 }); // Brainrot
assert(statsOf(s, 1, s.players[1].field[0]).bonus === 1, 'Brainrot: +1 power');
s = apply(s, 1, { type: 'play', i: 0 }); // Laggy Larry
assert(statsOf(s, 1, s.players[1].field[1]).def === 16, 'Lurker +2 DEF at 0 Goofiness');
s = apply(s, 1, { type: 'attack', i: 0, m: 1 }); // Ratio (power 2 + 1)
assert(s.phase === 'defend' && s.actions === 0, 'blocked attack waits for defender, cost 3 paid');
throws(() => apply(s, 1, { type: 'end' }), 'cannot act while waiting for defender');
const handB2 = s.players[1].hand.length;
s = apply(s, 0, { type: 'defend', i: 0 }, fixed(0.99)); // 20 + 3 = 23 vs VC Goblin 12
assert(s.roll.hit && s.roll.atk === 3 && s.players[0].field[0].hp === 2 && s.players[0].bore === 4, 'break through: 1 HP, power as Boredom');
assert(s.players[1].hand.length === handB2 + 1, 'Ratio onHit: draw a card');
assert(s.events.some(e => e.k === 'attack' && e.move === 'Ratio' && e.target), 'attack event names the move and target');

s.players[1].effects.push({ id: 'e_read' });
s = apply(s, 1, { type: 'end' });
assert(s.players[0].bore === 0 && s.players[1].points === 1, 'Left on Read pushes A to 5 Boredom: B scores');

// ---- turn 3 (A): Larry disadvantage, self damage, coin flips ----
s.actions = 9;
s = apply(s, 0, { type: 'attack', i: 1, m: 1 }); // Night Owl All-Nighter (power 4)
s = apply(s, 1, { type: 'defend', i: 1 }, seq(0.99, 0)); // vs Larry: rolls 20 & 1, keeps 1: 5 vs 16 -> blocked
assert(!s.roll.hit && s.roll.die === 1 && s.roll.rolls.length === 2 && s.players[0].field[1].hp === 2, 'Larry: roll twice keep lower; a blocked attacker takes no damage');
s.players[0].field[1].hp = 1;
s = apply(s, 0, { type: 'attack', i: 1, m: 1 });
s = apply(s, 1, { type: 'defend', i: 0 }, fixed(0.99)); // vs Reply Guy: hit; All-Nighter costs Night Owl 1 HP -> KO
assert(s.roll.hit && !s.players[0].field.some(f => f.id === 'c_night_owl'), 'All-Nighter: self damage can defeat the attacker');
s = apply(s, 0, { type: 'attack', i: 0, m: 1 }); // VC Goblin Unmute Scream; heads (0.2) -> +2 more
s = apply(s, 1, { type: 'defend', i: 0 }, seq(0.99, 0.2));
const boreGained = s.events.filter(e => e.k === 'meter' && e.p === 1 && e.key === 'bore').reduce((n, e) => n + e.n, 0);
assert(s.roll.hit && boreGained === 4 && s.events.some(e => e.k === 'coin' && e.heads === true), 'Unmute Scream heads: 2 power + 2 from the coin');
s.players[1].field.push({ id: 'c_lagger', hp: 2, t: 0 });
s.players[0].hand = ['c_lagger'];
s = apply(s, 0, { type: 'play', i: 0 });
s.players[0].field[s.players[0].field.length - 1].t = 0;
const li = s.players[0].field.length - 1;
s = apply(s, 0, { type: 'attack', i: li, m: 1 }); // Rubberband: heads -> 1 more HP
s = apply(s, 1, { type: 'defend', i: 0 }, seq(0.99, 0.1));
assert(s.roll.hit && s.events.filter(e => e.k === 'hit' && e.p === 1).length === 2, 'Rubberband heads: 2 HP total');
s.actions = 2;
s = apply(s, 0, { type: 'attack', i: li, m: 1 });
s = apply(s, 1, { type: 'defend', i: 0 }, seq(0.99, 0.99, 0.9)); // vs Larry: two d20s, then tails
assert(s.roll.hit && s.events.filter(e => e.k === 'hit' && e.p === 1).length === 1, 'Rubberband tails: 1 HP');

// ---- Action economy: carry-over, cap, once-per-turn, extra-Action cards ----
let e = newGame([STARTER, STARTER], ['A', 'B'], fixed(0.1));
e.players[0].hand = ['c_booster', 'b_energy', 'b_caffeine'];
e = apply(e, 0, { type: 'end' });            // A saves both Actions
e = apply(e, 1, { type: 'end' });            // B saves 2 too
assert(e.turn === 0 && e.actions === 4, 'unused Actions carry over: 2 saved + 2');
e = apply(e, 0, { type: 'end' }); e = apply(e, 1, { type: 'end' });
assert(e.actions === MAX_ACTIONS, 'start-of-turn Actions capped at ' + MAX_ACTIONS);
e = apply(e, 0, { type: 'play', i: 0 });     // Server Booster (5 -> 4)
e = apply(e, 0, { type: 'attack', i: 0, m: 0 }); // Boost: free, +1
assert(e.actions === 5, 'Boost: free +1 Action');
throws(() => apply(e, 0, { type: 'attack', i: 0, m: 0 }), 'Boost is once per turn');
assert(moveBlock(e, 0, e.players[0].field[0], 0) === 'Used this turn', 'move shows why it is blocked');
e = apply(e, 0, { type: 'play', i: 0 });     // Energy Drink: -1 +2
assert(e.actions === 6, 'Energy Drink: net +1, can exceed the cap');
e = apply(e, 0, { type: 'play', i: 0 });     // Caffeine IV (3 turns)
const left0 = e.actions;
e = apply(e, 0, { type: 'end' }); e = apply(e, 1, { type: 'end' });
assert(e.actions === Math.min(MAX_ACTIONS, left0 + 2) + 1, 'Caffeine IV: +1 at the start of your next turn');
e = apply(e, 0, { type: 'attack', i: 0, m: 0 });
assert(e.players[0].field[0].once[0] === e.turnNo, 'Boost usable again on a new turn');
e = apply(e, 0, { type: 'end' }); e = apply(e, 1, { type: 'end' });
assert(e.players[0].effects.every(x => x.id !== 'b_caffeine') || e.players[0].effects.find(x => x.id === 'b_caffeine').turns === 1, 'Caffeine IV ticks down');
let pu = newGame([{ ...STARTER, captain: 'cap_poweruser' }, STARTER], ['P', 'B'], fixed(0.1));
assert(pu.actions === 3, 'Power User: 3 Actions on the very first turn');
pu = apply(pu, 0, { type: 'end' }); pu = apply(pu, 1, { type: 'end' });
assert(pu.actions === Math.min(MAX_ACTIONS, 3 + 2) + 1, 'Power User: +1 every turn on top of saved Actions');

// ---- captain passives on fresh games ----
let c = newGame([{ ...STARTER, captain: 'cap_clown' }, { ...STARTER, captain: 'cap_mod' }], ['C', 'M'], fixed(0.1));
c.players[0].hand = ['b_voice_crack', 'e_slowmode'];
c.actions = 5;
c = apply(c, 0, { type: 'play', i: 0 });
assert(c.players[0].goof === 3, 'Clown: +2 Goofiness becomes +3');
const left = c.actions;
c = apply(c, 0, { type: 'play', i: 0 });
assert(left - c.actions === 2, 'Sleepless Mod: Evils cost the opponent 2 Actions');

// ---- manual tools, scoring, network input, win ----
let m = newGame([STARTER, STARTER], ['A', 'B'], fixed(0.1));
m.players[1].field = [{ id: 'c_lagger', hp: 1, t: 0 }];
m.players[0].goof = 4;
m = apply(m, 1, { type: 'adjust', who: 0, key: 'goof', d: 1 });
assert(m.players[0].goof === 0 && m.players[0].points === 1, 'Goofiness 5 scores for self');
m = apply(m, 1, { type: 'hp', who: 1, i: 0, d: -1 });
assert(m.players[1].field.length === 0, 'HP 0 removes the card');
throws(() => apply(m, 1, { type: 'adjust', who: '__proto__', key: 'goof', d: 1 }), 'bad player index');
throws(() => apply(m, 1, { type: 'adjust', who: 0, key: 'hand', d: 1 }), 'bad meter');
throws(() => apply(m, 1, { type: 'adjust', who: 0, key: 'goof', d: 50 }), 'bad amount');
throws(() => apply(m, 1, { type: 'discard', who: 0, zone: 'hand', i: 0 }), "can't discard opponent's hand");
m.players[0].points = 4;
m = apply(m, 0, { type: 'adjust', who: 0, key: 'points', d: 1 });
assert(m.phase === 'over' && m.winner === 0, 'first to 5 points wins');
throws(() => apply(m, 0, { type: 'end' }), 'no actions after game over');
`, { structuredClone });
console.log('game.test.js: all checks passed');
