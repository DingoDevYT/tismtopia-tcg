// Self-check for the rules engine. Run: node test/game.test.js
const fs = require('fs'), vm = require('vm'), path = require('path');
// syntax-check every browser script too, so a broken app.js can't ship (the rules tests don't load it)
for (const f of ['js/app.js', 'js/packs.js', 'js/audio.js', 'js/assets.js', 'js/render.js', 'js/rainbow.js', 'js/cards.js', 'js/cards-data.js', 'js/game.js', 'js/cardfile.js', 'js/art-tools.js', 'js/cloud.js', 'js/profile.js', 'js/social.js', 'js/submit.js', 'js/community.js', 'js/review.js', 'js/onboard.js', 'js/tour.js']) new vm.Script(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), { filename: f });
const load = files => files.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const src = load(['test/fixture-cards.js', 'js/cards.js', 'js/game.js']).replace('const BORE_MAX = 15;', 'const BORE_MAX = 99;').replace('const DECK_SIZE = 40;', 'const DECK_SIZE = 20;').replace('const HP_SCALE = 1.2;', 'const HP_SCALE = 2;');

// The real generated cards: both free starters must be legal and every Character usable.
vm.runInNewContext(load(['js/cards-data.js', 'js/cards.js', 'js/game.js']) + `
if (STARTERS.length < 2 || STARTERS.some(d => deckProblems(d).length)) throw new Error('FAIL: real starters: ' + JSON.stringify(STARTERS.map(deckProblems)));
if (!CARDS.filter(c => c.type === 'character').every(c => c.moves?.length)) throw new Error('FAIL: a real Character has no moves');
{ let g = newGame([STARTERS[0], STARTERS[1]], ['A', 'B'], () => 0.1); const cap = CARD[g.players[0].captain].goof; g.players[0].goof = cap - 1; for (let k = 0; k < 3; k++) g = apply(g, 1, { type: 'adjust', who: 0, key: 'goof', d: 1 });
  if (g.players[0].goof !== cap) throw new Error('FAIL: Creativity should stop at the Super cost ' + cap + ', got ' + g.players[0].goof); }
// replaced cards: the old id is gone, the new one exists, and an owner's copies and finishes carry over
for (const [old, id] of Object.entries(REPLACED)) if (CARD[old] || !CARD[id]) throw new Error('FAIL: REPLACED ' + old + ' -> ' + id);
{ const [old, id] = Object.entries(REPLACED)[0], c = swapColl({ [old]: { n: 3, f: { normal: 1, holo: 2 } }, [id]: { n: 1, f: { normal: 1 } } });
  if (c[old] || c[id].n !== 4 || c[id].f.holo !== 2 || c[id].f.normal !== 2) throw new Error('FAIL: swapColl ' + JSON.stringify(c));
  const d = swapDeck({ [old]: 2, [id]: 2 }); if (d[old] || d[id] !== 3) throw new Error('FAIL: swapDeck ' + JSON.stringify(d)); }
`, { structuredClone });

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
// The browser loads these as one shared scope: two files declaring the same name breaks everything after it.
new Function(['cards-data', 'card-overrides', 'cards', 'assets', 'render', 'rainbow', 'game', 'app', 'pack-sets', 'packs', 'economy', 'audio', 'cardfile', 'art-tools', 'cloud', 'profile', 'social', 'submit', 'community', 'review', 'onboard', 'tour'].map(f => fs.readFileSync(__dirname + '/../js/' + f + '.js', 'utf8')).join('\n;\n'));
// New players (js/onboard.js): each starter dealt as 8 packs of 5 holding exactly its 40 cards, no pack with two of a card, strongest
// card last in each pack, the deck those packs make is legal; and only the public site (github.io) or ?gate=1 forces the sign-in gate.
{ const x = { structuredClone }, ob = fs.readFileSync(__dirname + '/../js/onboard.js', 'utf8').split('// ---------------- browser only')[0];
  vm.runInNewContext(['cards-data', 'card-overrides', 'cards', 'game'].map(f => fs.readFileSync(__dirname + '/../js/' + f + '.js', 'utf8')).join('\n;\n') + '\n;\n' + ob + `;
  const ok = (c, m) => { if (!c) throw new Error('FAIL: onboard: ' + m); };
  const R = { C: 0, U: 1, R: 2, UR: 3 }, pow = id => R[CARD[id].rarity || 'C'] * 10 + (CARD[id].cost ?? 1), bag = cards => JSON.stringify(Object.entries(cards).sort());
  ok(STARTERS.length === 3, 'three starters');
  for (const s of STARTERS) {
    const p = starterPacks(s), d = packsDeck(s, p);
    ok(p.length === ONB_PACKS && ONB_PACKS === 8 && p.every(k => k.length === 5), s.name + ': 8 packs of 5');
    ok(bag(d.cards) === bag(s.cards) && d.captain === s.captain && d.name === s.name, s.name + ': the packs hold exactly the starter (multiset)');
    ok(deckProblems(d).length === 0, s.name + ': granted deck is legal: ' + deckProblems(d));
    ok(p.every(k => new Set(k).size === k.length), s.name + ': copies spread, no pack holds two of a card');
    ok(p.every(k => k.every(id => pow(id) <= pow(k[k.length - 1]))), s.name + ': strongest card last in every pack');
    const top = Math.max(...Object.keys(s.cards).map(pow)); ok(p[6].concat(p[7]).some(id => pow(id) === top), s.name + ': best card in packs 7-8');
    ok(JSON.stringify(starterPacks(s)) === JSON.stringify(p), s.name + ': same deal every time');
    ok(/^\\d+ Characters · \\d+ Items · (no|\\d+) Evils? · average cost \\d\\.\\d$/.test(starterLine(s)), 'starter line: ' + starterLine(s));
  }
  ok(gateOn('dingodevyt.github.io', '') && gateOn('dingodevyt.github.io', '?gate=0'), 'public site always gated, ?gate=0 cannot switch it off');
  ok(!gateOn('localhost', '') && !gateOn('localhost', '?gate=0') && gateOn('localhost', '?gate=1') && gateOn('localhost', '?dev&gate=1'), 'localhost: off unless ?gate=1');
  ok(!gateOn('127.0.0.1', '') && !gateOn('192.168.0.190', '') && !gateOn('10.0.0.5', '') && !gateOn('tism.local', '') && !gateOn('', ''), 'LAN, .local and file: no gate');
  ok(!gateOn('github.io.evil.com', '') && !gateOn('localhost', '?gate=10'), 'lookalikes do not match');
  `, x); }
// Submitted cards (js/cardfile.js): untrusted forms are clamped, effects come only from the menu, a card file round-trips, junk is refused.
{ const x = { Image: function () {} }; vm.runInNewContext(['cards-data', 'cards', 'assets', 'render', 'cardfile'].map(f => fs.readFileSync(__dirname + '/../js/' + f + '.js', 'utf8')).join('\n;\n') + `;
  const ok = (c, m) => { if (!c) throw new Error('FAIL: cardfile: ' + m); };
  const f = cfClean({ type: 'character', name: 'x'.repeat(40), hp: 99, def: -5, cost: 9, fx: { trig: 'passive', eff: 'goof' }, moves: [{ name: 'Hit', power: 50, eff: 'heal', n: 2 }, { ability: true, eff: 'dmg' }, {}], fins: { rainbow: true, evil: true }, hack: 1 });
  ok(f.name.length === 22 && f.cost === 3 && f.moves.length === 2 && f.moves[0].power === CF_POW[1] && !('hack' in f), 'clamps values');
  // what the player picks is what the card prints: HP within the real cards' printed range, armour 0-2, damage as stored
  const shown = CARDS.filter(c => c.type === 'character').map(maxHp), b = cfBuild(f);
  ok(maxHp(b) === Math.max(...shown) && baseArmor(b) === 0 && CF_POW[0] === Math.min(...CARDS.flatMap(c => (c.moves || []).filter(m => !m.ability).map(m => m.power))), 'stats clamp to printed ranges');
  ok(Object.entries(CF_HP).every(([p, hp]) => maxHp(cfBuild(cfClean({ hp }))) === +p) && Object.entries(CF_DEF).every(([a, def]) => baseArmor(cfBuild(cfClean({ def }))) === +a) && JSON.stringify(Object.keys(CF_DEF)) === '["0","1","2"]', 'each printed HP / armour button builds that exact card');
  ok(f.fx.eff === 'atk' && f.moves[1].eff === '' && f.fins.rainbow && !('evil' in f.fins), 'only menu effects for each slot');
  const c = cfBuild(f); ok(JSON.stringify(c.moves[0].onHit) === '[["hp","self",-2]]' && c.moves[0].text === 'On a hit, ' + f.name + ' heals 2 HP.', 'heal is a negative hp op with the card wording');
  const d = cfBuild(cfClean({ moves: [{ name: 'a', eff: 'dmg', n: 3 }] })); ok(d.moves[0].text === 'On a hit, 3 more damage to the blocker.' && d.moves[0].onHit[0][2] === 3, 'extra damage is a positive hp op');
  ok(cfBuild(cfClean({ type: 'bit', fx: { eff: 'draw', n: 2 } })).text === 'Draw 2 cards.' && cfBuild(cfClean({ type: 'evil', fx: { trig: 'turn', eff: 'bore' } })).text === 'Start of your turn: opponent +1 Boredom.', 'Item and Evil wording');
  const p = JSON.parse(JSON.stringify(cfPayload(f, { image: 'data:image/png;base64,iVBORw0K', bg: { tpl: 'rays', tint: '#ABCDEF' } }))), r = cfRead(p);
  ok(JSON.stringify(r.card) === JSON.stringify(p.card) && r.image === p.image && r.bg.tint === '#abcdef', 'card file round-trips');
  ok(cfRead({ ...p, image: 'javascript:alert(1)', bg: { tpl: 'x', tint: 'red' } }).image === '' && cfRead({ ...p, bg: { tpl: 'x' } }).bg === null, 'bad image / background dropped');
  let refused = 0; for (const bad of [null, {}, { ...p, v: 2 }, { ...p, kind: 'save' }, { ...p, form: 'x' }]) try { cfRead(bad); } catch { refused++; } ok(refused === 5, 'junk files refused');
  ok(cfSafe(cfBuild(cfClean({ name: '<img src=x onerror=alert(1)>' }))).name.indexOf('<') < 0, 'names are escaped for renderCard');
  ok(cfBand(cfBuild(cfClean({ hp: 8, def: 16, cost: 0, fx: { trig: 'passive', eff: 'atk', n: 3 }, moves: [{ name: 'a', power: 6, cost: 1 }, { name: 'b', power: 6, cost: 1 }] }))).band === 3, 'an overloaded card is Too strong');
`, x); }
// Full art (v-full) takes its crop from cropFull, other finishes from crop; no cropFull = plain cover, as before.
{ const x = { Image: function () {} }; vm.runInNewContext(['cards-data', 'cards', 'assets', 'render'].map(f => fs.readFileSync(__dirname + '/../js/' + f + '.js', 'utf8')).join('\n;\n') + `;
  const c = { ...CARDS.find(c => c.type === 'character'), art: 'a.png', crop: { x: 10, y: 20, zoom: 2 }, cropFull: { x: 70, y: 30, zoom: 1.5 } };
  this.r = [renderCard(c), renderCard({ ...c, crop: null }, { cls: 'v-full v-holo' }), renderCard({ ...c, crop: null, cropFull: undefined }, { cls: 'v-full v-holo v-rainbow' })];`, x);
  if (!x.r[0].includes('object-position:10% 20%') || !x.r[1].includes('object-position:70% 30%') || x.r[2].includes('object-position')) throw new Error('FAIL: full-art crop should come from cropFull'); }
// Rainbow repaint (fake canvas): a dark-outlined red disc on flat grey -> grey becomes pale silver, the disc a saturated rainbow fill, nothing white.
{ const W = 120, d = new Uint8ClampedArray(W * W * 4).map((_, i) => { const p = i >> 2, e = Math.hypot(p % W - 60, (p / W | 0) - 60); return i % 4 === 3 ? 255 : e < 30 ? [220, 40, 40][i % 4] : e < 33 ? 20 : 128; });
  const x = { document: { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: d }), putImageData() {} }) }) } };
  vm.runInNewContext(fs.readFileSync(__dirname + '/../js/rainbow.js', 'utf8') + ';rbPaint({ naturalWidth: 120, naturalHeight: 120 })', x);
  const px = (X, Y) => [...d.slice(4 * (Y * W + X), 4 * (Y * W + X) + 3)], sat = c => Math.max(...c) - Math.min(...c), corner = [0, 1, 2, 3, 4].map(k => px(5 + k * 2, 5));
  const mid = [0, 1, 2].map(j => { let s = 0; for (let k = 0; k < 64; k++) s += px(52 + k % 8, 50 + (k >> 3))[j]; return s / 64; });
  if (!corner.every(c => Math.min(...c) > 140) || corner.every(c => sat(c) < 15)) throw new Error('FAIL: rainbow background should be pale tinted silver ' + JSON.stringify(corner));
  if (!(sat(mid) > 80 && Math.min(...mid) < 200)) throw new Error('FAIL: rainbow fill should be saturated, not white ' + mid); }
// hp op: positive = damage, negative = heal (capped at full HP)
{ const src = fs.readFileSync(__dirname + '/../js/game.js', 'utf8'); if (!src.includes('negative = heal')) throw new Error('FAIL: hp op: negative heals'); }
{ const x = {}; require('vm').runInNewContext(fs.readFileSync(__dirname + '/../js/cards-data.js', 'utf8') + fs.readFileSync(__dirname + '/../js/card-overrides.js', 'utf8') + ';this.A=[...CAPTAINS,...CARDS]', x);
  for (const c of x.A) for (const mv of c.moves || []) if (/heals/.test(mv.text || '') && !JSON.stringify(mv.onHit || mv.ops || []).includes('-')) throw new Error('FAIL: ' + c.name + ' says it heals but its op deals damage');
  for (const c of x.A) for (const mv of c.moves || []) if (/more damage/.test(mv.text || '') && /"hp","target",-/.test(JSON.stringify(mv.onHit || []))) throw new Error('FAIL: ' + c.name + ' says more damage but its op heals'); }
// Community cards (js/community.js): approved rows are validated, escaped, numbered after the built-ins and playable.
{ const x = { Image: function () {}, structuredClone }; vm.runInNewContext(['cards-data', 'cards', 'assets', 'render', 'game', 'cardfile', 'community'].map(f => fs.readFileSync(__dirname + '/../js/' + f + '.js', 'utf8')).join('\n;\n') + `;
  const ok = (c, m) => { if (!c) throw new Error('FAIL: community: ' + m); };
  const base = CARDS.length, card = { id: 'sub_x', type: 'character', name: 'Jonathan', hp: 4, def: 14, cost: 1, text: 'When played: +1 Action this turn.', onPlay: [['actions', 'me', 1]], artist: 'anon',
    moves: [{ name: 'Sweepkick', cost: 1, power: 2 }, { name: 'Wind-dash', cost: 2, power: 4, text: 'On a hit, your Boredom -1.', onHit: [['bore', 'me', -1]] }], crop: { x: 20, y: 20, zoom: 2 }, cropFull: { x: 16, y: 44, zoom: 1 }, finishes: ['normal', 'holo', 'full'] };
  const row = (id, c, at = '2026-11-24T10:00:00Z') => ({ id, card: c, image_path: 'a1/b2.webp', approved_at: at });
  const rows = [row('bbbbbbbb-0000-0000-0000-000000000002', { ...card, name: '<b>Bob</b>' }, '2026-11-25T00:00:00Z'),
    row('46d80494-61e6-4dc3-955f-ba2d2b5c62d6', card),
    row('cccccccc-0000-0000-0000-000000000003', { ...card, name: 'Opsy', moves: [card.moves[0], { ...card.moves[1], onHit: [['nuke', 'opp', 9]] }] }),
    row('dddddddd-0000-0000-0000-000000000004', { ...card, name: 'x'.repeat(23) }),
    row('46d80494-ffff-0000-0000-000000000005', { ...card, name: 'Same Id' }),
    row('eeeeeeee-0000-0000-0000-000000000006', { ...card, name: CARDS[0].name })];
  let added = cmRegister(rows, CARDS, CARD);
  ok(added.map(c => c.id).join() === 'community_46d80494,community_bbbbbbbb', 'only the good and the HTML-named card register, in approval order: ' + added.map(c => c.id));
  ok(CARDS.length === base + 2 && CARD.community_46d80494 === added[0] && added[0].no === String(base + 1).padStart(3, '0') && added[1].no === String(base + 2).padStart(3, '0'), 'numbered after the built-ins');
  ok(!CARD.community_cccccccc && !CARD.community_dddddddd && !CARD.community_eeeeeeee, 'unknown op, over-long name and taken name are skipped');
  ok(added[1].name.indexOf('<') < 0 && !renderCard(added[1]).includes('<b>Bob'), 'HTML in a name is escaped');
  const j = added[0]; ok(j.community && j.rarity === 'U' && j.finishes.join() === 'normal,holo,full' && j.artPath === 'a1/b2.webp' && maxHp(j) === 5 && baseArmor(j) === 1, 'flag, rarity (5 HP + 2x1 armour + 4 power = 11 -> U), finishes kept');
  ok(cmRegister([{ ...rows[1], card: { ...card, hp: 99, moves: [{ ...card.moves[0], power: 99 }] } }], CARDS, CARD)[0].moves[0].power === CF_POW[1] && CARDS.length === base + 1, 'numbers clamped; a refresh replaces the old community cards');
  added = cmRegister(rows, CARDS, CARD); ok(CARDS.length === base + 2 && added[0].no === String(base + 1).padStart(3, '0'), 'same list, same numbers');
  // play it: onPlay +1 Action; Wind-dash (power 4) through a blocker runs onHit (your Boredom -1), and straight to Boredom with no blocker
  const tgt = CARDS.find(c => c.type === 'character' && !c.community && baseArmor(c) === 0 && !c.mod);
  let g = newGame([STARTER, STARTER], ['A', 'B'], () => 0.1); const a = g.turn, d = 1 - a;
  g.players[a].hand = [j.id]; g.actions = 4; g.players[a].bore = 3; g.players[d].field = [{ id: tgt.id, hp: 20, t: 0 }];
  g = apply(g, a, { type: 'play', i: 0 }); ok(g.actions === 4, 'onPlay: +1 Action');
  g = apply(g, a, { type: 'attack', i: 0, m: 1 }); g = apply(g, d, { type: 'defend', i: 0 });
  ok(g.roll.hit && g.players[a].bore === 2, 'onHit through a blocker');
  g.players[d].field = []; g.players[a].field[0].acted = 0; g.actions = 2; const bd = g.players[d].bore;
  g = apply(g, a, { type: 'attack', i: 0, m: 1 }); ok(g.players[d].bore === bd + 4 && g.players[a].bore === 1, 'direct hit + onHit');
  g = apply(g, a, { type: 'end' }); g = apply(g, d, { type: 'end' }); ok(g.turn === a && g.players[a].field[0].id === j.id, 'turns go on');
  // packs: the reviewer's pick decides. null, an unknown id, a name like 'constructor' or an old cached row without pack = in no pack.
  const pr = (id, name, pack) => ({ ...row(id, { ...card, name }), pack });
  cmRegister([pr('a1000000-0000-0000-0000-000000000001', 'In Emp', 'empirical'), pr('a2000000-0000-0000-0000-000000000002', 'No Pack', null),
    pr('a3000000-0000-0000-0000-000000000003', 'Bad Pack', 'nopack'), pr('a4000000-0000-0000-0000-000000000004', 'Proto', 'constructor'),
    row('a5000000-0000-0000-0000-000000000005', { ...card, name: 'Old Cache' })], CARDS, CARD);
  const ps = { heehn: ['h1'], empirical: ['e1', 'community_zzzzzzzz'] }, pk = [{ id: 'heehn' }, { id: 'empirical' }, CM_PACK];
  cmPacks(CARDS, ps, pk);
  ok(ps.empirical.join() === 'e1,community_a1000000' && ps.heehn.join() === 'h1' && !('community' in ps) && pk.map(p => p.id).join() === 'heehn,empirical', 'only the named known pack; no Community Pack without a card: ' + JSON.stringify(ps));
  ok(CARD.community_a2000000.pack === null && CARD.community_a5000000.pack === null && CARD.community_a3000000.pack === 'nopack', 'pack kept on the card, old cache = null');
  cmRegister([pr('a6000000-0000-0000-0000-000000000006', 'Comm One', 'community')], CARDS, CARD); cmPacks(CARDS, ps, pk);
  ok(ps.community.join() === 'community_a6000000' && pk.at(-1) === CM_PACK && pk.length === 3 && ps.empirical.join() === 'e1', 'one card makes the Community Pack; a refresh drops cards no longer listed');
`, x); }
// Social (js/social.js): profile picture ids, display stands and Captain plays from saves or the server are validated; collection counts.
{ const x = {}, so = fs.readFileSync(__dirname + '/../js/social.js', 'utf8').split('// ---------------- browser only')[0];
  vm.runInNewContext(['cards-data', 'card-overrides', 'cards'].map(f => fs.readFileSync(__dirname + '/../js/' + f + '.js', 'utf8')).join('\n;\n') + '\n;\n' + so + `;
  const ok = (c, m) => { if (!c) throw new Error('FAIL: social: ' + m); };
  const cap = CAPTAINS[0].id, ch = CARDS.find(c => c.type === 'character').id, item = CARDS.find(c => c.type !== 'character').id;
  ok(pfpOk(cap) && pfpOk(ch) && pfpOk('community_0a1b2c3d'), 'Captains, Characters and not-yet-loaded community cards are valid pictures');
  ok(!pfpOk(item) && !pfpOk('nope_not_a_card') && !pfpOk('__proto__') && !pfpOk('<img>') && !pfpOk(5) && !pfpOk('community_xyz'), 'Items, unknown ids and junk are not');
  const st = cleanStands([{ id: 'a1', kind: 'shelf', cards: [ch, null, 'gone_card'] }, { id: 'b2', kind: 'ped', cards: [cap], fins: ['rainbow'] }]);
  ok(st && st[0].cards.join() === ch + ',,' && st[1].cards[0] === null && st[1].fins[0] === 'rainbow', 'unknown cards and Captains become empty slots');
  const old = Object.keys(REPLACED)[0]; ok(cleanStands([{ id: 'r', kind: 'ped', cards: [old] }])[0].cards[0] === REPLACED[old], 'replaced cards carry over');
  const bad = [null, {}, [{ id: 'a', kind: 'wall', cards: [ch] }], [{ id: 'a', kind: 'shrine', cards: [ch] }], [{ id: 'A!', kind: 'ped', cards: [ch] }],
    [{ id: 'a', kind: 'ped', cards: [ch] }, { id: 'a', kind: 'ped', cards: [ch] }], Array(5).fill(0).map((_, i) => ({ id: 's' + i, kind: 'ped', cards: [null] })),
    [{ id: 'a', kind: 'ped', cards: [{}] }], [{ id: 'a', kind: 'ped', cards: [ch], fins: [] }], [{ id: '__proto__', kind: '__proto__', cards: [] }]];
  ok(bad.every(b => cleanStands(b) === null), 'wrong slot counts, kinds, ids, duplicates, more than 4 stands and junk are refused');
  ok(JSON.stringify(cleanCapPlays({ [cap]: 3, [ch]: 2 })) === JSON.stringify({ [cap]: 3 }) && cleanCapPlays({ [cap]: -1 }) === null && cleanCapPlays([]) === null, 'Captain plays');
  ok(favCap({ [CAPTAINS[1].id]: 2, [CAPTAINS[2].id]: 5 })[0] === CAPTAINS[2].id && favCap({}) === null, 'favourite Captain = most played');
  const cs = collStats({ [ch]: { n: 3, f: { normal: 1, full: 1, rainbow: 1 } }, [item]: { n: 1, f: { holo: 1 } }, x_unknown: { n: 9, f: { full: 9 } }, [CARDS[2].id]: { n: 0, f: {} } });
  ok(cs.own === 2 && cs.total === CARDS.length && cs.full === 1 && cs.rb === 1 && cs.holo === 1, 'collection counts: ' + JSON.stringify(cs));
  `, x); }
// Encrypted art and audio: tools/encrypt-assets.js writes what js/assets.js decrypts with WebCrypto (same names, same format); a changed byte
// or a file moved to another path is refused. The plaintext and the key are never tracked.
(async () => {
  const tool = require('../tools/encrypt-assets.js'), key = require('crypto').randomBytes(32), plain = require('crypto').randomBytes(5000), p = 'art/local/test_card.png';
  const c = { crypto: require('crypto').webcrypto, TextEncoder, atob };
  vm.runInNewContext(fs.readFileSync(__dirname + '/../js/assets.js', 'utf8') + ';this.x = { asKeys, asName, asDecrypt, assetUrl }', c);
  const x = c.x, k = await x.asKeys(key.toString('base64')), bin = tool.encrypt(key, p, plain), u8 = b => new Uint8Array(b);
  const ok = (c, msg) => { if (!c) throw new Error('FAIL: ' + msg); }, refused = pr => pr.then(() => false, () => true);
  ok(Buffer.from(await x.asDecrypt(k.aes, p, u8(bin))).equals(plain), 'browser decrypts what the tool encrypted');
  ok((await x.asName(k.hmac, p)) === tool.name(key, p) && /^[0-9a-f]{32}$/.test(tool.name(key, p)), 'browser and tool derive the same file name');
  ok(tool.encrypt(key, p, plain).equals(bin) && !tool.encrypt(key, p, Buffer.concat([plain, Buffer.from('x')])).subarray(0, 12).equals(bin.subarray(0, 12)), 'same file = same bytes; changed file = new IV');
  const bad = Buffer.from(bin); bad[100] ^= 1;
  ok(await refused(x.asDecrypt(k.aes, p, u8(bad))), 'a flipped byte is refused');
  ok(await refused(x.asDecrypt(k.aes, 'art/local/other.png', u8(bin))), 'a file encrypted for one path does not decrypt under another');
  ok(tool.decrypt(key, p, bin).equals(plain) && x.assetUrl('art/local/a.png?v=1') === 'art/local/a.png?v=1', 'tool round trip; plain mode passes paths through');
  const tracked = require('child_process').execSync('git ls-files art/local audio/local review', { cwd: __dirname + '/..' }).toString().trim();
  ok(!tracked, 'no plaintext art/audio and no review/ in git: ' + tracked.slice(0, 200));
})().then(() => console.log('game.test.js: all checks passed'), e => { console.error(e.message); process.exit(1); });
