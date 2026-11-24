// Self-check for the rules engine. Run: node test/game.test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
// syntax-check every browser script too, so a broken app.js can't ship (the rules tests don't load it)
for (const f of ['js/app.js', 'js/packs.js', 'js/audio.js', 'js/render.js', 'js/cards.js', 'js/cards-data.js', 'js/game.js']) new vm.Script(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), { filename: f });
const load = files => files.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const src = load(['test/fixture-cards.js', 'js/cards.js', 'js/game.js']).replace('const BORE_MAX = 10;', 'const BORE_MAX = 99;').replace('const DECK_SIZE = 40;', 'const DECK_SIZE = 20;').replace('const HP_SCALE = 1.2;', 'const HP_SCALE = 2;');

// The real generated cards: both free starters must be legal and every Character usable.
vm.runInNewContext(load(['js/cards-data.js', 'js/cards.js', 'js/game.js']) + `
if (STARTERS.length < 2 || STARTERS.some(d => deckProblems(d).length)) throw new Error('FAIL: real starters: ' + JSON.stringify(STARTERS.map(deckProblems)));
if (!CARDS.filter(c => c.type === 'character').every(c => c.moves?.length)) throw new Error('FAIL: a real Character has no moves');
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
assert(s.turn === 0 && s.players[0].hand.length === 5 && s.players[1].hand.length === 6 && s.players[0].deck.length === DECK_SIZE - 5, 'deal + coin flip; second player gets 6 cards');
assert(s.actions === 1, 'first player starts with 1 Action');
s.actions = 2; // the scripted checks below assume a normal 2-Action turn

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
throws(() => apply(s, 0, { type: 'attack', i: 0, m: 0 }), 'one move per Character per turn'); s.players[0].field[0].acted = 0; // then let it go again for the checks below
s = apply(s, 0, { type: 'attack', i: 0, m: 0 });
assert(s.players[1].bore === 2, 'same Character can attack again while Actions remain');
s = apply(s, 0, { type: 'play', i: 0 }); // Night Owl
throws(() => apply(s, 0, { type: 'attack', i: 1, m: 0 }), "Night Owl can't attack the turn it's played");
s = apply(s, 0, { type: 'play', i: 0 }); // @everyone Ping: B +2 -> 4
assert(s.players[1].bore === 4, 'Ping onPlay: opponent +2 Boredom');
const actBefore = s.actions;
s = apply(s, 0, { type: 'ability', i: -1 }); // Gremlin Super (costs 0 Goofiness here): B +1 Boredom
assert(s.players[1].bore === 5 && s.actions === actBefore, 'captain Super runs and costs no Actions');
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
s.players[1].goof = 0; // turns now give +1 Creativity; Lurker needs 0
s = apply(s, 1, { type: 'play', i: 0 }); // Laggy Larry: DEF 14 -> armour 1, Tough +1, Lurker +2 while B has 0 Creativity
assert(statsOf(s, 1, s.players[1].field[1]).def === 4 && s.players[1].field[1].hp === 4, 'armour from DEF, Tough and Lurker; HP doubled');
const handB2 = s.players[1].hand.length, goofA = s.players[0].goof, hpG = s.players[0].field[0].hp;
s.players[1].field[0].acted = 0; // test shortcut: Reply Guy already used Well Actually this turn
s = apply(s, 1, { type: 'attack', i: 0, m: 1 }); // Ratio: power 2 + 1 Brainrot
assert(s.phase === 'defend' && s.actions === 0, 'attack waits for a blocker, cost 3 paid');
throws(() => apply(s, 1, { type: 'end' }), 'cannot act while waiting for a blocker');
s = apply(s, 0, { type: 'defend', i: 0 }); // VC Goblin, armour 1: 3 - 1 = 2 damage
assert(s.roll.dmg === 2 && s.players[0].field[0].hp === hpG - 2 && s.players[0].goof === goofA && s.players[1].goof === 0, 'damage = power - armour; hits no longer move Creativity');
assert(s.players[1].hand.length === handB2 + 1, 'Ratio onHit: draw a card');
assert(s.events.some(e => e.k === 'attack' && e.move === 'Ratio' && e.target), 'attack event names the move and target');

s.players[1].effects.push({ id: 'e_read' });
s = apply(s, 1, { type: 'end' });
assert(s.players[0].bore === 2, 'Left on Read: A +1 Boredom at the start of their turn');

// ---- turn 3 (A): Tough armour, self damage, defeat Boredom, coin flips ----
s.actions = 9; s.players[1].goof = 1; // B has Creativity, so Larry's Lurker is off
s = apply(s, 0, { type: 'attack', i: 1, m: 1 }); // Night Owl All-Nighter (power 4)
s = apply(s, 1, { type: 'defend', i: 1 }); // Larry: armour 2 now (B has Creativity, so no Lurker bonus): 2 damage
assert(s.roll.dmg === 2 && s.players[1].field[1].hp === 2 && s.players[0].field[1].hp === 3, 'Tough armour; All-Nighter costs Night Owl 1 HP');
s.players[0].field[1].hp = 1;
const boreA = s.players[0].bore;
s.players[0].field[1].acted = 0; // test shortcut: let Night Owl move again this turn
s.players[1].goof = 0; // B back to 0 Creativity for Lurker
s = apply(s, 0, { type: 'attack', i: 1, m: 1 });
s = apply(s, 1, { type: 'defend', i: 0 }); // Reply Guy: B is back to 0 Creativity, so Lurker gives armour 2: 2 damage; Night Owl's self damage defeats it
assert(s.roll.dmg === 2 && !s.players[0].field.some(f => f.id === 'c_night_owl') && s.players[0].bore === boreA, 'self damage can defeat the attacker; defeats alone give no Boredom');
s.players[1].goof = 5; // switches off B's Lurker armour for the coin-flip checks
s = apply(s, 0, { type: 'attack', i: 0, m: 1 }); // VC Goblin Unmute Scream; heads -> +2 Boredom
s = apply(s, 1, { type: 'defend', i: 0 }, fixed(0.2));
const boreGained = s.events.filter(e => e.k === 'meter' && e.p === 1 && e.key === 'bore').reduce((n, e) => n + e.n, 0);
assert(s.roll.hit && boreGained === 2 && s.events.some(e => e.k === 'coin' && e.heads === true), 'Unmute Scream heads: +2 Boredom from the coin');
s.players[1].field.push({ id: 'c_reply_guy', hp: 8, t: 0 });
s.players[0].hand = ['c_lagger'];
s = apply(s, 0, { type: 'play', i: 0 });
s.players[0].field[s.players[0].field.length - 1].t = 0;
s = apply(s, 0, { type: 'attack', i: s.players[0].field.length - 1, m: 1 }); // Rubberband: 2 damage, heads -> 1 more
s = apply(s, 1, { type: 'defend', i: s.players[1].field.length - 1 }, fixed(0.1));
assert(s.events.filter(e => e.k === 'hit' && e.p === 1).length === 3, 'Rubberband heads: 2 damage + 1 more HP');

// ---- Action economy: carry-over, cap, once-per-turn, extra-Action cards ----
let e = newGame([STARTER, STARTER], ['A', 'B'], fixed(0.1));
e.players[0].hand = ['c_booster', 'b_energy', 'b_caffeine']; e.actions = 2;
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
assert(pu.actions === 2, 'Power User: 1 + 1 Actions on the very first turn');
pu = apply(pu, 0, { type: 'end' }); pu = apply(pu, 1, { type: 'end' });
assert(pu.actions === Math.min(MAX_ACTIONS, 2 + 2) + 1, 'Power User: +1 every turn on top of saved Actions');

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
m.players[0].goof = 9;
m = apply(m, 1, { type: 'adjust', who: 0, key: 'goof', d: 1 });
assert(m.players[0].goof === 10, 'Goofiness fills to 10');
const mb = m.players[1].bore;
m = apply(m, 1, { type: 'hp', who: 1, i: 0, d: -1 });
assert(m.players[1].field.length === 0 && m.players[1].bore === mb, 'HP 0 removes the card (no Boredom by itself)');
throws(() => apply(m, 1, { type: 'adjust', who: '__proto__', key: 'goof', d: 1 }), 'bad player index');
throws(() => apply(m, 1, { type: 'adjust', who: 0, key: 'hand', d: 1 }), 'bad meter');
throws(() => apply(m, 1, { type: 'adjust', who: 0, key: 'goof', d: 50 }), 'bad amount');
throws(() => apply(m, 1, { type: 'discard', who: 0, zone: 'hand', i: 0 }), "can't discard opponent's hand");
throws(() => apply(m, 0, { type: 'adjust', who: 0, key: 'points', d: 1 }), 'Points are gone');
m.players[1].bore = 98;
m = apply(m, 0, { type: 'adjust', who: 1, key: 'bore', d: 1 });
CARD.t_cheap = { id: 't_cheap', type: 'bit', name: 'Cheap', cost: 0, dur: 1, onPlay: [['bore', 'opp', 1]] };
CARD.t_sac = { id: 't_sac', type: 'character', name: 'Sac', def: 10, hp: 3, group: 'G', moves: [{ name: 'Boom', cost: 1, ability: true, ops: [['bore', 'opp', 2], ['sac']] }] };
CARD.t_buff = { id: 't_buff', type: 'character', name: 'Buff', def: 10, hp: 3, group: 'G', mod: { atk: 1, if: 'G' }, moves: [{ name: 'Hit', cost: 1, power: 1 }] };
let q = newGame([STARTER, STARTER], ['A', 'B'], fixed(0.1));
q.players[q.turn].hand = ['t_cheap']; const qa = q.actions;
q = apply(q, q.turn, { type: 'play', i: 0 });
assert(q.actions === qa, 'a 0-cost Bit costs nothing');
q.players[q.turn].field = [{ id: 't_buff', hp: 3, t: 0 }];
assert(statsOf(q, q.turn, q.players[q.turn].field[0]).bonus === 0, 'group mod needs another group member');
q.players[q.turn].field.push({ id: 't_sac', hp: 3, t: 0 });
assert(statsOf(q, q.turn, q.players[q.turn].field[0]).bonus === 1, 'group mod on with a partner');
q = apply(q, q.turn, { type: 'attack', i: 1, m: 0 });
assert(q.players[q.turn].field.length === 1 && q.players[q.turn].bore === 0, 'sac removes the Character without Boredom');
// spill-over: a 9-power hit kills a 2-HP blocker, carries 7 into the next (armour 1 -> 6 into 4 HP), and 2 reaches Boredom
CARD.t_big = { id: 't_big', type: 'character', name: 'Big', def: 8, hp: 5, moves: [{ name: 'Smash', cost: 1, power: 9 }] };
CARD.t_a = { id: 't_a', type: 'character', name: 'A', def: 8, hp: 2, moves: [{ name: 'x', cost: 1, power: 1 }] };
CARD.t_b = { id: 't_b', type: 'character', name: 'B', def: 12, hp: 4, moves: [{ name: 'x', cost: 1, power: 1 }] };
let sp = newGame([STARTER, STARTER], ['A', 'B'], fixed(0.1)); const sa = sp.turn, sd = 1 - sa; sp.actions = 3;
sp.players[sa].field = [{ id: 't_big', hp: 5, t: 0 }]; sp.players[sd].field = [{ id: 't_a', hp: 2, t: 0 }, { id: 't_b', hp: 4, t: 0 }]; sp.players[sd].goof = 3;
const boreD = sp.players[sd].bore;
sp = apply(sp, sa, { type: 'attack', i: 0, m: 0 }); sp = apply(sp, sd, { type: 'defend', i: 0 });
assert(sp.players[sd].field.length === 0 && sp.players[sd].bore === boreD + 2, 'damage spills to the next Character (armour applies) and the rest becomes Boredom');
// deck-out: drawing from an empty deck gives escalating Boredom
let fo = newGame([STARTER, STARTER], ['A', 'B'], fixed(0.1)); const fa = fo.turn, fb = 1 - fa; fo.players[fb].deck = []; fo.players[fa].deck = [];
const b0 = fo.players[fb].bore; fo = apply(fo, fa, { type: 'end' });
assert(fo.players[fb].bore === b0 + 1, 'empty deck: +1 Boredom instead of a draw');
fo = apply(fo, fb, { type: 'end' }); fo = apply(fo, fa, { type: 'end' });
assert(fo.players[fb].bore === b0 + 3, 'then +2 the next time');
let ce = newGame([STARTER, STARTER], ['A', 'B'], fixed(0.1)); const ep = ce.turn;
ce.players[1 - ep].effects = [{ id: 'e_read' }, { id: 'b_brainrot', turns: 2 }]; ce.actions = 2;
throws(() => apply(ce, ep, { type: 'cleanse', i: 1 }), 'only Evils can be cleansed');
ce = apply(ce, ep, { type: 'cleanse', i: 0 });
assert(ce.actions === 0 && ce.players[1 - ep].effects.length === 1, 'Cleanse: 2 Actions removes an Evil');
CARD.t_purge = { id: 't_purge', type: 'bit', name: 'Purge', dur: 1, onPlay: [['purge', 'opp', 1]] };
ce.players[1 - ep].effects.push({ id: 'e_slowmode' }); ce.actions = 1; ce.players[ep].hand = ['t_purge'];
ce = apply(ce, ep, { type: 'play', i: 0 });
assert(!ce.players[1 - ep].effects.some(x => x.id === 'e_slowmode'), 'purge step removes an Evil');
assert(m.phase === 'over' && m.winner === 0, 'reaching the Boredom limit loses');
throws(() => apply(m, 0, { type: 'end' }), 'no actions after game over');
`, { structuredClone });
// Card names stay on one line: 22 characters max (the longest name when the limit was set).
{ const x = {}; require('vm').runInNewContext(fs.readFileSync(__dirname + '/../js/cards-data.js', 'utf8') + fs.readFileSync(__dirname + '/../js/card-overrides.js', 'utf8') + ';this.A=[...CAPTAINS,...CARDS]', x);
  for (const c of x.A) if (c.name.length > 22) throw new Error('FAIL: name too long (max 22): ' + c.name); }
console.log('game.test.js: all checks passed');
