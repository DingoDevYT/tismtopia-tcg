// Self-check for the rules engine. Run: node test/game.test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = ['cards.js', 'game.js'].map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')).join('\n');

vm.runInNewContext(src + `
const assert = (ok, msg) => { if (!ok) throw new Error('FAIL: ' + msg); };
const throws = (fn, msg) => { try { fn(); } catch { return; } throw new Error('FAIL (no throw): ' + msg); };
const fixed = v => () => v; // deterministic rng

assert(deckProblems(STARTER).length === 0, 'starter deck is legal');
assert(deckProblems({ ...STARTER, cards: { ...STARTER.cards, m_sticker: 2 } }).some(p => p.includes('Main')), 'main character max 1');
assert(deckProblems({ ...STARTER, cards: { ...STARTER.cards, b_ping: 4 } }).length > 0, 'max 3 copies');
assert(deckProblems({ ...STARTER, captain: 'c_vc_goblin' }).length > 0, 'captain must be a captain');
assert(deckProblems({ ...STARTER, cards: { ...STARTER.cards, nope: 1 } }).length > 0, 'unknown card rejected');

let s = newGame([STARTER, STARTER], ['A', 'B'], fixed(0.1)); // rng < .5 -> A goes first
assert(s.turn === 0 && s.players[0].hand.length === 5 && s.players[0].deck.length === DECK_SIZE - 5, 'deal + coin flip');

// Put known cards in hand: a character and a bit.
s.players[0].hand = ['c_night_owl', 'b_brainrot', 'c_vc_goblin'];
throws(() => apply(s, 1, { type: 'play', i: 0 }), 'cannot play on opponent turn');
s = apply(s, 0, { type: 'play', i: 0 });
assert(s.players[0].field[0].id === 'c_night_owl' && s.actions === 1, 'play character costs 1 action');

// Direct attack (opponent has no characters): Boredom += ATK (3).
s = apply(s, 0, { type: 'attack', i: 0 });
assert(s.players[1].bore === 3 && s.actions === 0, 'direct attack adds ATK as boredom');
throws(() => apply(s, 0, { type: 'play', i: 0 }), 'no actions left');

// End turn: B draws one and gets 2 actions.
const handB = s.players[1].hand.length;
s = apply(s, 0, { type: 'end' });
assert(s.turn === 1 && s.actions === 2 && s.players[1].hand.length === handB + 1, 'turn passes with draw');

// B attacks A's Night Owl (DEF 8) with a Lagger (ATK 1). Roll 20 -> 21 >= 8 breaks through.
s.players[1].hand = ['c_lagger'];
s = apply(s, 1, { type: 'play', i: 0 });
s = apply(s, 1, { type: 'attack', i: 0 });
assert(s.phase === 'defend', 'blocked attack waits for defender');
throws(() => apply(s, 1, { type: 'end' }), 'cannot act while waiting for defender');
s = apply(s, 0, { type: 'defend', i: 0 }, fixed(0.99)); // die 20
assert(s.roll.hit && s.players[0].field[0].hp === 1 && s.players[0].bore === 1, 'break through: -1 HP and boredom');

// Blocked: roll 1 + 1 = 2 < 8, attacker (Lagger hp 2) loses 1 HP.
s.actions = 1;
s = apply(s, 1, { type: 'attack', i: 0 });
s = apply(s, 0, { type: 'defend', i: 0 }, fixed(0));
assert(!s.roll.hit && s.players[1].field[0].hp === 1, 'blocked: attacker -1 HP');

// Scoring: B's boredom 3 -> +2 hits 5 -> A gets a point, B resets to 0.
s = apply(s, 0, { type: 'adjust', who: 1, key: 'bore', d: 1 });
s = apply(s, 0, { type: 'adjust', who: 1, key: 'bore', d: 1 });
assert(s.players[1].bore === 0 && s.players[0].points === 1, 'boredom 5 scores for opponent');
s.players[0].goof = 4;
s = apply(s, 1, { type: 'adjust', who: 0, key: 'goof', d: 1 });
assert(s.players[0].goof === 0 && s.players[0].points === 2, 'goofiness 5 scores for self');

// HP to 0 removes the card; bits tick down at end of owner's turn.
s = apply(s, 1, { type: 'hp', who: 1, i: 0, d: -1 });
assert(s.players[1].field.length === 0, 'hp 0 removes the card');
s.players[1].effects = [{ id: 'b_ping', turns: 1 }, { id: 'e_slowmode' }];
s = apply(s, 1, { type: 'end' });
assert(s.players[1].effects.length === 1 && s.players[1].effects[0].id === 'e_slowmode', 'bit expires, evil stays');

// Bad input from the network is rejected.
throws(() => apply(s, 1, { type: 'adjust', who: '__proto__', key: 'goof', d: 1 }), 'bad player index');
throws(() => apply(s, 1, { type: 'adjust', who: 0, key: 'hand', d: 1 }), 'bad meter');
throws(() => apply(s, 1, { type: 'adjust', who: 0, key: 'goof', d: 50 }), 'bad amount');
throws(() => apply(s, 1, { type: 'discard', who: 0, zone: 'hand', i: 0 }), "can't discard opponent's hand");

// Win at 5 points.
s.players[0].points = 4;
s = apply(s, 0, { type: 'adjust', who: 0, key: 'points', d: 1 });
assert(s.phase === 'over' && s.winner === 0, 'first to 5 points wins');
throws(() => apply(s, 0, { type: 'end' }), 'no actions after game over');
`, { structuredClone });
console.log('game.test.js: all checks passed');
