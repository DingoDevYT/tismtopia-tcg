// Finds card effects that cost Actions but change nothing:  node tools/audit-cards.js
// Every Character move is tried against a weak blocker and against an empty field; every Item/Evil is played in a mid-game state.
// A move or card is flagged when the game state is identical afterwards apart from the Actions it spent.
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = vm.createContext({ structuredClone });
vm.runInContext(['js/cards-data.js', 'js/card-overrides.js', 'js/cards.js', 'js/game.js'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n') + '\nthis.E = { CARDS, CAPTAINS, STARTERS, CARD, REPLACED, newGame, apply, maxHp };', ctx);
const { CARDS, STARTERS, CARD, REPLACED, newGame, apply, maxHp } = ctx.E;
let r = 7; const rng = () => (r = (r * 16807) % 2147483647) / 2147483647;

const snap = (s, p) => JSON.stringify({ me: { ...s.players[p], hand: s.players[p].hand.length, deck: s.players[p].deck.length }, opp: { ...s.players[1 - p], hand: s.players[1 - p].hand.length, deck: s.players[1 - p].deck.length } });
function base(fieldOpp) {
  const s = newGame([STARTERS[0], STARTERS[1]], ['A', 'B'], rng); const p = s.turn; s.turnNo = 3; // past the first-turn rule (no direct hits on turns 1-2)
  s.actions = 5; s.players[p].goof = 3; s.players[1 - p].goof = 3; s.players[p].bore = 3; s.players[1 - p].bore = 3;
  s.players[1 - p].field = fieldOpp ? [{ id: 'scrunge_snoob', hp: maxHp(CARD.scrunge_snoob), t: 0 }, { id: 'scrunge_bobby', hp: maxHp(CARD.scrunge_bobby), t: 0 }] : [];
  s.players[1 - p].effects = [{ id: REPLACED.item_wont_let_rest || 'item_wont_let_rest' }];
  return [s, p];
}
const flags = [];
for (const c of CARDS.filter(c => c.type === 'character')) {
  c.moves.forEach((mv, m) => {
    for (const filled of [true, false]) {
      const [s, p] = base(filled); s.players[p].field = [{ id: c.id, hp: maxHp(c), t: 0 }];
      const before = snap(s, p);
      let n;
      try { n = apply(s, p, { type: 'attack', i: 0, m }, rng); if (n.phase === 'defend') n = apply(n, 1 - p, { type: 'defend', i: 0 }, rng); }
      catch (e) { flags.push(`${c.name} / ${mv.name}: can't be used (${e.message})`); return; }
      const spent = s.actions - n.actions; n.actions = s.actions;
      if (snap(n, p) === before) flags.push(`${c.name} / ${mv.name} (cost ${mv.cost}${mv.ability ? ', ability' : `, power ${mv.power}`}) did nothing ${filled ? 'against a blocker' : 'on an empty field'}${mv.text ? ` - text: "${mv.text}"` : ''}`);
    }
  });
}
for (const c of CARDS.filter(c => c.type !== 'character')) {
  const [s, p] = base(true); s.players[p].hand = [c.id]; s.players[p].field = [{ id: 'jangle_fenrik', hp: 5, t: 0 }, { id: 'scrunge_custard', hp: 4, t: 0 }];
  const before = snap(s, p);
  let n; try { n = apply(s, p, { type: 'play', i: 0 }, rng); } catch (e) { flags.push(`${c.name}: can't be played (${e.message})`); continue; }
  // a lasting effect (mod or start-of-turn) counts as doing something; only flag one-shot cards that change nothing
  const lasting = c.mod || c.onTurnStart || c.onOppTurnStart;
  n.actions = s.actions; n.players[p].effects = s.players[p].effects;
  if (!lasting && snap(n, p) === before) flags.push(`${c.name} (cost ${c.cost ?? 1}) did nothing - text: "${c.text}"`);
}
console.log(flags.length ? flags.join('\n') : 'No card wastes Actions in these tests.');
