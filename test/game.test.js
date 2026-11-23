// Self-check for the rules engine. Run: node test/game.test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['cards.js', 'game.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n');

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
assert(deckProblems({ ...STARTER, cards: { ...STARTER.cards, __proto__: 1 } }).length > 0 || true, 'proto key does not crash');

// A = Gremlin captain, B = Lurker captain (+2 DEF at 0 Goofiness). rng .1 -> A goes first.
let s = newGame([STARTER, { ...STARTER, captain: 'cap_lurker' }], ['A', 'B'], fixed(0.1));
assert(s.turn === 0 && s.players[0].hand.length === 5 && s.players[0].deck.length === DECK_SIZE - 5, 'deal + coin flip');

// ---- turn 1 (A): onPlay, direct attack, sickness, bit onPlay, captain ability, evil ----
s.players[0].hand = ['c_vc_goblin', 'c_night_owl', 'b_ping', 'e_slowmode'];
throws(() => apply(s, 1, { type: 'play', i: 0 }), 'cannot play on opponent turn');
s = apply(s, 0, { type: 'play', i: 0 });
assert(s.players[0].field[0].id === 'c_vc_goblin' && s.actions === 1 && s.players[0].goof === 1, 'VC Goblin onPlay: +1 Goofiness');
assert(s.events.some(e => e.k === 'play' && e.zone === 'field') && s.events.some(e => e.k === 'meter' && e.key === 'goof'), 'play + meter events');
s = apply(s, 0, { type: 'attack', i: 0 });
assert(s.players[1].bore === 2 && s.actions === 0, 'direct attack adds ATK as Boredom');
throws(() => apply(s, 0, { type: 'play', i: 0 }), 'no actions left');

s.actions = 4;
s = apply(s, 0, { type: 'play', i: 0 }); // Night Owl
throws(() => apply(s, 0, { type: 'attack', i: 1 }), "Night Owl can't attack the turn it's played");
s = apply(s, 0, { type: 'play', i: 0 }); // @everyone Ping: B +2 Boredom -> 4
assert(s.players[1].bore === 4, 'Ping onPlay: opponent +2 Boredom');
s = apply(s, 0, { type: 'ability', i: -1 }); // Gremlin: B +1 -> 5 -> A scores, B resets
assert(s.players[0].points === 1 && s.players[1].bore === 0 && s.events.some(e => e.k === 'point' && e.p === 0), 'captain ability can score');
throws(() => apply(s, 0, { type: 'ability', i: -1 }), 'captain ability once per turn');
throws(() => apply(s, 0, { type: 'ability', i: 0 }), 'VC Goblin has no ability');
s = apply(s, 0, { type: 'play', i: 0 }); // Slowmode on A's side

const handB = s.players[1].hand.length;
s = apply(s, 0, { type: 'end' });
assert(s.turn === 1 && s.actions === 2 && s.players[1].hand.length === handB + 1 && !s.capUsed, 'turn passes with draw, captain use resets');
assert(s.players[0].effects.every(e => e.id !== 'b_ping'), 'Ping (1 turn) wore off');

// ---- turn 2 (B): Slowmode attack cost, Brainrot ATK buff in combat ----
s.players[1].hand = ['c_lagger', 'b_brainrot'];
s = apply(s, 1, { type: 'play', i: 0 });
throws(() => apply(s, 1, { type: 'attack', i: 0 }), 'Slowmode: attacks cost 2');
s.actions = 3;
s = apply(s, 1, { type: 'play', i: 0 }); // Brainrot: B Characters +1 ATK
assert(statsOf(s, 1, s.players[1].field[0]).atk === 2, 'Brainrot +1 ATK');
assert(statsOf(s, 1, s.players[1].field[0]).def === 16, 'Lurker +2 DEF at 0 Goofiness');
s = apply(s, 1, { type: 'attack', i: 0 });
assert(s.phase === 'defend' && s.actions === 0, 'blocked attack waits for defender, cost 2 paid');
throws(() => apply(s, 1, { type: 'end' }), 'cannot act while waiting for defender');
s = apply(s, 0, { type: 'defend', i: 0 }, fixed(0.99)); // 20 + 2 = 22 vs VC Goblin DEF 12
assert(s.roll.hit && s.roll.atk === 2 && s.players[0].field[0].hp === 2 && s.players[0].bore === 2, 'break through uses buffed ATK');
assert(s.events.some(e => e.k === 'hit' && e.p === 0) && s.events.some(e => e.k === 'attack' && e.p === 1), 'attack + hit events');

s.players[1].effects.push({ id: 'e_read' });
s = apply(s, 1, { type: 'end' });
assert(s.players[0].bore === 3, 'Left on Read: +1 Boredom at start of opponent turn');

// ---- turn 3 (A): Larry disadvantage, Sticker onBreak ----
s.actions = 5;
s = apply(s, 0, { type: 'attack', i: 1 }); // Night Owl (ATK 3) now allowed
s = apply(s, 1, { type: 'defend', i: 0 }, seq(0.99, 0)); // rolls 20 & 1, keeps 1: 4 vs 16 -> blocked
assert(!s.roll.hit && s.roll.die === 1 && s.roll.rolls.length === 2 && s.players[0].field[1].hp === 1, 'Larry: roll twice keep lower');
s.players[0].hand = ['m_sticker'];
s = apply(s, 0, { type: 'play', i: 0 });
s = apply(s, 0, { type: 'attack', i: 2 });
s = apply(s, 1, { type: 'defend', i: 0 }, seq(0.99, 0.99)); // 20 + 2 = 22 vs 16 -> hit
assert(s.roll.hit && s.players[0].goof === 2 && s.players[1].field[0].hp === 1, 'Sticker onBreak: +1 Goofiness');

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
s.players[0].goof = 4;
s = apply(s, 1, { type: 'adjust', who: 0, key: 'goof', d: 1 });
assert(s.players[0].goof === 0 && s.players[0].points === 2, 'Goofiness 5 scores for self');
s = apply(s, 1, { type: 'hp', who: 1, i: 0, d: -1 });
assert(s.players[1].field.length === 0, 'HP 0 removes the card');
throws(() => apply(s, 1, { type: 'adjust', who: '__proto__', key: 'goof', d: 1 }), 'bad player index');
throws(() => apply(s, 1, { type: 'adjust', who: 0, key: 'hand', d: 1 }), 'bad meter');
throws(() => apply(s, 1, { type: 'adjust', who: 0, key: 'goof', d: 50 }), 'bad amount');
throws(() => apply(s, 1, { type: 'discard', who: 0, zone: 'hand', i: 0 }), "can't discard opponent's hand");
s.players[0].points = 4;
s = apply(s, 0, { type: 'adjust', who: 0, key: 'points', d: 1 });
assert(s.phase === 'over' && s.winner === 0, 'first to 5 points wins');
throws(() => apply(s, 0, { type: 'end' }), 'no actions after game over');
`, { structuredClone });
console.log('game.test.js: all checks passed');
