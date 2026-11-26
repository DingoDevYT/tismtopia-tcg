// Real-card audit + the Item/Character mechanics added in the 2026-11 design pass. Run by test/game.test.js (or: node test/cards.test.js).
// The audit reads each card's text, plays the card in a mid-game state, and checks the meters moved exactly as the text says.
const fs = require('fs'), vm = require('vm'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const src = rules => ['js/cards-data.js', 'js/card-overrides.js', 'js/cards.js', 'js/game.js'].map(read).join('\n;\n').replace(/const NO_DIRECT_UNTIL = \d+, DIRECT_HALF = \w+;/, rules || '$&');
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

function audit() {
  const x = { structuredClone };
  vm.runInNewContext(src() + ';this.E = { CARDS, CAPTAINS, CARD, STARTERS, REPLACED, newGame, apply, maxHp, baseArmor, deckProblems };', x);
  const { CARDS, CAPTAINS, CARD, STARTERS, REPLACED, newGame, apply, maxHp, baseArmor } = x.E;
  const num = w => (w === 'a' || w === 'an' ? 1 : +w);
  // What the text promises, as meter changes. Only these phrasings are understood; texts with a coin flip are skipped.
  const expect = t => {
    const e = {}, T = t.replace(/’/g, "'");
    let r;
    if ((r = T.match(/draw (\d+|a) cards?/i))) e.draw = num(r[1]);
    if ((r = T.match(/opponent \+(\d+) boredom/i) || T.match(/opponent -\d+ creativity and \+(\d+) boredom/i))) e.oppBore = +r[1];
    if ((r = T.match(/your boredom -(\d+)/i) || T.match(/clear (\d+) of your boredom/i))) e.meBore = -r[1];
    if ((r = T.match(/opponent -(\d+) creativity/i) || T.match(/opponent \+\d+ boredom and -(\d+) creativity/i))) e.oppGoof = -r[1];
    if ((r = T.match(/(?:gain|you) \+?(\d+) creativity/i) || T.match(/(?:^|[.:] )\+(\d+) creativity/i) || T.match(/you \+(\d+)\b/i) || T.match(/and \+(\d+) creativity/i))) e.meGoof = +r[1];
    if ((r = T.match(/(?:\+|gain )(\d+) actions?/i))) e.actions = +r[1];
    return e;
  };
  // A mid-game state: player 0's turn, plenty of Actions, deck stocked, meters away from their limits. cap = player 0's Captain.
  const filler = CARDS.find(c => c.type === 'character' && !c.onPlay).id;
  const fresh = (cap = 'captain_xee') => {
    const g = newGame([{ captain: cap, cards: STARTERS[0].cards }, { captain: 'captain_xee', cards: STARTERS[0].cards }], ['A', 'B'], () => 0.1);
    g.turn = 0; g.turnNo = 7; g.actions = 5; g.phase = 'play';
    for (const p of g.players) { p.deck = Array(20).fill(filler); p.hand = []; p.field = []; p.effects = []; p.bore = 5; p.goof = 0; }
    g.players[1].goof = 4;
    return g;
  };
  const meters = g => ({ hand: g.players[0].hand.length, deck: g.players[0].deck.length, meBore: g.players[0].bore, oppBore: g.players[1].bore, meGoof: g.players[0].goof, oppGoof: g.players[1].goof, actions: g.actions });
  const compare = (who, e, a, b, paid = 0, handOut = 0) => {
    const got = { draw: b.hand - a.hand + handOut, meBore: b.meBore - a.meBore, oppBore: b.oppBore - a.oppBore, meGoof: b.meGoof - a.meGoof, oppGoof: b.oppGoof - a.oppGoof, actions: b.actions - a.actions + paid };
    ok(got.draw === b.deck * 0 + (a.deck - b.deck), `${who}: hand grew by ${got.draw} but the deck shrank by ${a.deck - b.deck}`);
    for (const k of Object.keys(got)) ok(got[k] === (e[k] || 0), `${who}: text says ${k} ${e[k] || 0}, card did ${got[k]}`);
  };
  let checked = 0;
  // Items played from hand (their onPlay)
  for (const c of CARDS.filter(c => c.type === 'bit' && c.onPlay && !/flip/i.test(c.text))) {
    const g = fresh(); g.players[0].hand = [c.id]; const a = meters(g);
    const n = apply(g, 0, { type: 'play', i: 0 }); compare(c.name, expect(c.text), a, meters(n), c.cost ?? 1, 1); checked++;
  }
  // Characters' "When played:" text
  for (const c of CARDS.filter(c => c.type === 'character' && c.onPlay?.length)) {
    const t = (c.text.match(/When played[^:]*: ([^.]*\.)/i) || [])[1]; ok(t, `${c.name}: has an onPlay effect but no "When played:" text`); if (!t) continue;
    const g = fresh(); g.players[0].hand = [c.id]; const a = meters(g);
    const n = apply(g, 0, { type: 'play', i: 0 }); compare(c.name + ' (when played)', expect(t), a, meters(n), c.cost ?? 1, 1); checked++;
  }
  // Captain Supers
  for (const c of CAPTAINS.filter(c => !/flip/i.test(c.text))) {
    const g = fresh(c.id); g.players[0].goof = c.goof; const a = meters(g);
    const n = apply(g, 0, { type: 'ability', i: -1 }), e = expect(c.text.replace(/^Super, \d+ Creativity: [^.]*\. /, ''));
    e.meGoof = (e.meGoof || 0) - c.goof; compare(c.name + ' Super', e, a, meters(n)); checked++;
  }
  // Character abilities and on-hit effects (attacks land on a 0-armour, high-HP blocker)
  const wall = CARDS.find(c => c.type === 'character' && baseArmor(c) === 0 && !c.mod && !c.unkillable).id;
  for (const c of CARDS.filter(c => c.type === 'character')) c.moves.forEach((mv, m) => {
    if (!mv.text || /flip/i.test(mv.text) || (!mv.ability && !/^On a hit/.test(mv.text))) return;
    if ((mv.ops || mv.onHit || []).some(o => ['hp', 'sac', 'splash', 'healAll', 'ready'].includes(o[0]))) return; // HP effects are checked in the mechanics tests
    const g = fresh(); g.players[0].field = [{ id: c.id, hp: maxHp(c), t: 0 }]; g.players[1].field = [{ id: wall, hp: 99, t: 0 }];
    const a = meters(g);
    let n = apply(g, 0, { type: 'attack', i: 0, m });
    if (n.phase === 'defend') n = apply(n, 1, { type: 'defend', i: 0 });
    const e = expect(mv.text), pass = !mv.ability && c.onBreak && (c.text.match(/Whenever this lands a hit: ([^.]*\.)/) || [])[1]; // the card's own on-hit passive adds to it
    if (pass) for (const [k, v] of Object.entries(expect(pass))) e[k] = (e[k] || 0) + v;
    compare(`${c.name}: ${mv.name}`, e, a, meters(n), mv.cost); checked++;
  });
  // Start-of-turn texts (Characters and timed Items): end both turns, compare player 0's start of turn with a plain one
  for (const c of CARDS.filter(c => c.onTurnStart)) {
    const t = (c.text.match(/(?:start of your turn|at the start of your turn): ([^.]*\.)/i) || [])[1]; ok(t, `${c.name}: has a start-of-turn effect but no matching text`); if (!t) continue;
    const run = withIt => { let g = fresh(); g.players[0].goof = 0; if (withIt) (c.type === 'character' ? g.players[0].field : g.players[0].effects).push(c.type === 'character' ? { id: c.id, hp: maxHp(c), t: 0 } : { id: c.id, turns: c.dur || 3, t: 0 }); g = apply(g, 0, { type: 'end' }); g = apply(g, 1, { type: 'end' }); return meters(g); };
    const a = run(false), b = run(true), e = expect(t);
    for (const k of ['meBore', 'meGoof', 'draw']) ok((b[k === 'draw' ? 'hand' : k] - a[k === 'draw' ? 'hand' : k]) === (e[k] || 0), `${c.name} (start of turn): text says ${k} ${e[k] || 0}`);
    checked++;
  }
  // Bee Swarm style: opponent +1 Boredom at the start of each of their next 2 turns
  for (const c of CARDS.filter(c => c.onOppTurnStart)) {
    const m2 = c.text.match(/start of each of their next (\d+) turns/i); ok(m2, `${c.name}: onOppTurnStart without "next N turns" text`); if (!m2) continue;
    let g = fresh(); g.players[0].hand = [c.id]; g = apply(g, 0, { type: 'play', i: 0 }); const b0 = g.players[1].bore;
    for (let k = 0; k < 4; k++) g = apply(g, g.turn, { type: 'end' });
    ok(g.players[1].bore - b0 === +m2[1] * (expect(c.text).oppBore || 1), `${c.name}: fired ${g.players[1].bore - b0} times, text says ${m2[1]}`); checked++;
  }
  ok(checked > 40, 'audit covered only ' + checked + ' effects');
  // No Evils left in the built-in set; every retired Evil maps to an Item that exists; starters and packs use the new ids
  ok(!CARDS.some(c => c.type === 'evil'), 'built-in Evils are gone');
  for (const old of ['item_evening_coil', 'item_wont_let_rest', 'item_deity_form', 'item_anxious_duo', 'item_pollen_season', 'item_nicer_mondays', 'item_entity_form'])
    ok(!CARD[old] && CARD[REPLACED[old]]?.type === 'bit', 'REPLACED ' + old);
  ok(STARTERS.every(d => Object.keys(d.cards).every(id => CARD[id])), 'starters only use cards that exist');
  return checked;
}

function mechanics() {
  const x = { structuredClone };
  vm.runInNewContext(src('const NO_DIRECT_UNTIL = 2, DIRECT_HALF = true;') + ';this.E = { CARDS, CARD, STARTERS, newGame, apply, maxHp, movePower, moveBlock, canBlock, statsOf };', x);
  const { CARD, STARTERS, newGame, apply, maxHp, movePower, moveBlock, canBlock } = x.E;
  // test-only cards: a plain hitter, a 0-armour wall, a 2-HP pawn
  CARD.t_hit = { id: 't_hit', type: 'character', name: 'Hit', def: 8, hp: 10, moves: [{ name: 'Hit', cost: 1, power: 3 }, { name: 'Big', cost: 1, power: 6 }] };
  CARD.t_wall = { id: 't_wall', type: 'character', name: 'Wall', def: 8, hp: 10, moves: [{ name: 'x', cost: 1, power: 1 }] };
  CARD.t_pawn = { id: 't_pawn', type: 'character', name: 'Pawn', def: 8, hp: 2, moves: [{ name: 'x', cost: 1, power: 1 }] };
  CARD.t_tank = { id: 't_tank', type: 'character', name: 'Tank', def: 14, hp: 10, moves: [{ name: 'x', cost: 1, power: 1 }] };
  const F = (id, hp) => ({ id, hp: hp ?? maxHp(CARD[id]), t: 0 });
  const fresh = () => { const g = newGame([STARTERS[0], STARTERS[0]], ['A', 'B'], () => 0.1); g.turn = 0; g.turnNo = 9; g.actions = 9; for (const p of g.players) { p.deck = Array(20).fill('t_wall'); p.hand = []; p.field = []; p.effects = []; p.bore = 0; p.goof = 0; } return g; };
  const hit = (g, i = 0, m = 0, block = 0) => { let n = apply(g, 0, { type: 'attack', i, m }); if (n.phase === 'defend') n = apply(n, 1, { type: 'defend', i: block }); return n; };

  // ---- Items with uses / durations ----
  let g = fresh(); g.players[0].hand = ['item_wont_let_rest_v2']; g.players[0].field = [F('t_hit'), F('t_hit')]; g.players[1].field = [F('t_wall')];
  g = apply(g, 0, { type: 'play', i: 0 });
  ok(g.players[0].effects[0].uses === 3 && g.players[0].hand.length === 0, "Won't Let You Rest enters with 3 uses");
  g = hit(g, 0); ok(g.players[0].hand.length === 1 && g.players[0].effects[0].uses === 2, "attack: draw 1, 2 uses left");
  g = hit(g, 1); g.players[0].field[0].acted = 0; g = hit(g, 0);
  ok(g.players[0].hand.length === 3 && g.players[0].effects.length === 0, "third attack: 3 cards drawn, Item used up");
  g = fresh(); g.players[1].effects = [{ id: 'item_evening_coil_v2', uses: 2 }]; g.players[0].field = [F('t_hit')]; g.players[1].field = [F('t_wall')];
  g = hit(g); ok(g.players[0].field[0].hp === maxHp(CARD.t_hit) - 2 && g.players[1].effects[0].uses === 1, 'Evening Coil: blocking hurts the attacker 2, a use spent');
  g = fresh(); g.players[1].effects = [{ id: 'item_deity_form_v2', uses: 1 }]; g.players[0].field = [F('t_hit')]; g.players[1].field = [F('t_pawn'), F('t_wall')];
  g = hit(g, 0, 1); // power 6 into a 2-HP pawn: would die and spill 4
  ok(g.players[1].field.length === 2 && g.players[1].field[0].hp === 1 && g.players[1].field[1].hp === maxHp(CARD.t_wall) && g.players[1].effects.length === 0, 'Deity Form: pawn stays on 1 HP, no spill, Item gone');
  g = fresh(); g.players[1].effects = [{ id: 'item_nicer_mondays_v2', uses: 3 }]; g.players[0].field = [F('t_hit')];
  g = hit(g, 0, 1); ok(g.players[1].bore === 2 && g.players[1].effects[0].uses === 2, 'Nicer Mondays: direct 6 halves to 3, then 1 less = 2');
  g = fresh(); g.players[0].field = [F('t_wall'), F('t_wall'), F('t_wall')]; g.players[0].hand = ['t_wall'];
  ok((() => { try { apply(g, 0, { type: 'play', i: 0 }); return false; } catch { return true; } })() &&g.players[0].field.length === 3,'a 4th Character cannot be played');
  g = fresh(); g.players[0].field = [F('scrunge_calytrix_and_noli'), F('t_wall'), F('t_wall'), F('t_wall'), F('t_wall')];
  ok(movePower(g, 0, g.players[0].field[0], CARD.scrunge_calytrix_and_noli.moves[1]) === 4, 'Calytrix: the ally bonus stops at +2');
  g = fresh(); g.players[0].hand = ['item_entity_form_v2']; g.players[0].field = [F('t_hit')]; g.players[1].field = [F('t_wall')];
  g = apply(g, 0, { type: 'play', i: 0 });
  ok(movePower(g, 0, g.players[0].field[0], CARD.t_hit.moves[0]) === 3, 'Entity Form: no bonus the turn it is played');
  g = apply(g, 0, { type: 'end' }); g = apply(g, 1, { type: 'end' });
  ok(movePower(g, 0, g.players[0].field[0], CARD.t_hit.moves[0]) === 5, 'Entity Form: +2 power on your next turn');
  g = apply(g, 0, { type: 'end' }); ok(!g.players[0].effects.length, 'Entity Form: gone after that turn');
  g = fresh(); g.players[0].hand = ['item_anxious_duo_v2', 'item_pollen_season_v2']; g.players[1].goof = 6; g.players[1].captain = 'captain_xee';
  g = apply(g, 0, { type: 'play', i: 0 }); g = apply(g, 0, { type: 'play', i: 0 });
  ok(g.players[1].goof === 5, 'Pollen Season: opponent -1 Creativity');
  g = apply(g, 0, { type: 'end' }); g.players[1].goof = 6; g.players[1].field = [F('t_hit')];
  ok(moveBlock(g, 1, g.players[1].field[0], 0) === '' && g.actions === 2, 'opponent turn starts');
  let threw = false; try { apply(g, 1, { type: 'ability', i: -1 }); } catch { threw = true; } ok(threw, 'Pollen Season: no Super on their next turn');
  g.actions = 1; ok(moveBlock(g, 1, g.players[1].field[0], 0) === 'Not enough Actions', 'Anxious Duo: their attacks cost 1 more');
  g = apply(g, 1, { type: 'end' }); g = apply(g, 0, { type: 'end' });
  ok(!g.players[0].effects.length, 'both timed Items wore off after your next turn');
  ok(apply(g, 1, { type: 'ability', i: -1 }).players[0].bore === 3, 'Super works again afterwards');

  // ---- direct hits: none on a player's first turn, half power after ----
  g = fresh(); g.turnNo = 2; g.players[0].field = [F('t_hit')];
  threw = false; try { apply(g, 0, { type: 'attack', i: 0, m: 0 }); } catch { threw = true; } ok(threw && moveBlock(g, 0, g.players[0].field[0], 0) !== '', 'no direct attack while turnNo <= 2');
  g.turnNo = 3; ok(apply(g, 0, { type: 'attack', i: 0, m: 0 }).players[1].bore === 1, 'direct attack: power 3 halves to 1');
  g.players[1].field = [F('t_pawn')]; g.turnNo = 2; ok(apply(g, 0, { type: 'attack', i: 0, m: 0 }).phase === 'defend', 'turn-1 attacks into a blocker are fine');

  // ---- spill-over still goes in field order, armour applies to each ----
  g = fresh(); g.players[0].field = [F('t_hit')]; g.players[1].field = [F('t_pawn'), F('t_tank'), F('t_pawn')];
  g = hit(g, 0, 1, 0); // pawn takes 2, tank (armour 1) takes the other 3
  ok(g.players[1].field.length === 2 && g.players[1].field[0].hp === maxHp(CARD.t_tank) - 3, 'spill-over: next in field order');

  // ---- Character hooks ----
  g = fresh(); g.players[0].field = [F('lord_fey')]; g.players[1].field = [F('t_tank')];
  g = hit(g, 0, 1); ok(g.players[1].field[0].hp === maxHp(CARD.t_tank) - 3, 'Fey Glowing Stare ignores armour');
  g = fresh(); g.players[0].field = [F('jegg_aj')]; ok(movePower(g, 0, g.players[0].field[0], CARD.jegg_aj.moves[0]) === 4, 'AJ alone: +2'); g.players[0].field.push(F('t_wall')); ok(movePower(g, 0, g.players[0].field[0], CARD.jegg_aj.moves[0]) === 2, 'AJ with company: no bonus');
  g = fresh(); g.players[0].field = [F('jegg_brulee')]; g.players[1].field = [F('t_wall'), F('t_wall'), F('t_tank')];
  g = hit(g, 0, 1); ok(g.players[1].field.map(f => f.hp).join() === [maxHp(CARD.t_wall) - 3, maxHp(CARD.t_wall) - 1, maxHp(CARD.t_tank) - 1].join(), 'Brûlée Fire Breath: 3 to the blocker, 1 to each other');
  g = fresh(); g.players[0].field = [F('jegg_brulee', 1)]; g.players[1].field = [F('t_wall')]; g = hit(g, 0, 0); ok(g.players[0].field[0].hp === 2, 'Brûlée Honey Tail heals 1');
  g = fresh(); g.players[0].field = [F('jegg_jenosu')]; g.players[1].field = [F('t_wall')]; g = hit(g, 0, 1);
  ok(moveBlock(g, 0, g.players[0].field[0], 1) === '', 'Jenosu Zoomies: can move again after a hit');
  g = fresh(); g.players[0].field = [F('jegg_lyra')]; ok(movePower(g, 0, g.players[0].field[0], CARD.jegg_lyra.moves[1]) === 4, 'Lyra: 4 normally'); g.players[1].bore = 10; ok(movePower(g, 0, g.players[0].field[0], CARD.jegg_lyra.moves[1]) === 7, 'Lyra: 7 at 10 Boredom');
  g = fresh(); g.players[0].field = [F('scrunge_calytrix_and_noli'), F('t_wall'), F('t_wall')]; ok(movePower(g, 0, g.players[0].field[0], CARD.scrunge_calytrix_and_noli.moves[1]) === 4, 'Calytrix: +1 per other Character');
  g = fresh(); g.players[1].field = [F('scrunge_maxi'), F('t_wall')]; ok(!canBlock(g, 1, 0) && canBlock(g, 1, 1), 'Maxi cannot block beside another Character'); g.players[1].field.pop(); ok(canBlock(g, 1, 0), 'Maxi alone can block');
  g = fresh(); g.players[0].field = [F('scrunge_noxx_darmen'), F('t_wall', 3)]; g = apply(g, 0, { type: 'attack', i: 0, m: 0 }); ok(g.players[0].field[1].hp === 6 && g.actions === 7, 'Noxx and D’Armen: Dad Hug costs 2 and heals the others 3');
  g = fresh(); g.players[0].field = [F('t_wall')]; g.players[1].field = [F('t_tank'), F('t_pawn')]; g = apply(apply(g, 0, { type: 'attack', i: 0, m: 0 }), 1, { type: 'defend', i: 0 });
  ok(g.players[1].field[0].hp === maxHp(CARD.t_tank) - 1 && g.players[1].field[1].hp === 2 && !g.roll.hit, 'power 1 into armour 1: blocked, the blocker still takes 1, nothing spills');
  g = fresh(); g.players[1].field = [F('scrunge_alek')]; g.players[0].hand = ['t_hit']; g = apply(g, 0, { type: 'play', i: 0 });
  ok(moveBlock(g, 0, g.players[0].field[0], 0) === 'Can attack next turn', 'Alek: new enemy Characters cannot attack that turn');
  g = fresh(); g.players[0].field = [F('t_hit')]; g.players[1].field = [F('jimmy_arhakoth', 2)];
  g = hit(g, 0, 1); ok(g.players[1].field[0]?.hp === 1 && g.players[1].bore === 0, 'Arhakoth survives the first lethal hit on 1 HP');
  g.players[0].field[0].acted = 0; g = hit(g, 0, 1); ok(!g.players[1].field.length, 'Arhakoth: only once');
  g = fresh(); g.players[0].field = [F('scrunge_corin')]; g.players[1].field = [F('t_wall')]; g = hit(g, 0, 1); ok(g.players[0].field[0].hp === maxHp(CARD.scrunge_corin) - 2, 'Salem Lamp Dive costs Salem 2 HP');
  g = fresh(); g.players[0].field = [F('jangle_evil_oc')]; g.players[1].goof = 3; g = apply(g, 0, { type: 'attack', i: 0, m: 1 }); ok(g.players[1].goof === 1 && g.players[0].goof === 2, 'Favourite Villain steals 2 Creativity');
  return x.E;
}

const n = audit(); mechanics();
if (fails.length) { console.error('cards.test.js FAIL:\n  ' + fails.join('\n  ')); process.exit(1); }
console.log(`cards.test.js: ${n} card effects audited, mechanics ok`);
