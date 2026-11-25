// Combines CARDS=1 sim runs: node tools/simcards.js <folder of .json runs>. Prints a per-card balance table.
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2], ctx = {};
vm.runInNewContext(['cards-data', 'card-overrides', 'cards'].map(f => fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8')).join('\n;\n') + ';this.A=[...CAPTAINS,...CARDS]', ctx); // with overrides and the Evil -> Item swap
const CARD = Object.fromEntries(ctx.A.map(c => [c.id, c]));
const T = { games: 0, turns: 0, firstWins: 0, cards: {}, caps: {} };
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const o = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  T.games += o.games; T.turns += o.turns; T.firstWins += o.firstWins;
  for (const [id, c] of Object.entries(o.cards)) { const t = (T.cards[id] ||= {}); for (const [k, v] of Object.entries(c)) t[k] = (t[k] || 0) + v; }
  for (const [id, [n, w]] of Object.entries(o.caps || {})) { const t = (T.caps[id] ||= [0, 0]); t[0] += n; t[1] += w; }
}
const pc = x => (100 * x).toFixed(0).padStart(3) + '%';
console.log(`${T.games} games, average ${(T.turns / T.games).toFixed(1)} turns, first player wins ${pc(T.firstWins / T.games)}`);
console.log('\nCaptains:'); Object.entries(T.caps).sort((a, b) => b[1][1] / b[1][0] - a[1][1] / a[1][0]).forEach(([id, [n, w]]) => console.log(`  ${pc(w / n)} ${CARD[id].name} (Super ${CARD[id].goof})`));
const rows = Object.entries(T.cards).filter(([id, c]) => CARD[id] && c.played >= 60).map(([id, c]) => {
  const k = CARD[id], cost = k.type === 'character' ? 1 : (k.cost ?? 1);
  return { k, playedWr: c.playedWins / c.played, edge: c.playedWins / c.played - (c.deckWins - c.playedWins) / Math.max(1, c.deck - c.played), n: c.played, life: c.lifeN ? c.life / c.lifeN : null, dmg: c.attacks ? c.dmg / c.plays : 0, blocked: c.attacks ? c.blocked / c.attacks : 0, cost };
}).sort((a, b) => b.edge - a.edge);
const line = x => `  ${pc(x.playedWr)} win when played, edge ${(x.edge >= 0 ? '+' : '') + (100 * x.edge).toFixed(0).padStart(3)}  n=${String(x.n).padStart(5)}  ${x.k.type === 'character' ? `life ${x.life ? x.life.toFixed(1) : ' -- '} turns, dmg/play ${x.dmg.toFixed(1)}, fully blocked ${pc(x.blocked)}` : `cost ${x.cost}`}  ${x.k.name} [${x.k.type}${x.k.hp ? ` HP${x.k.hp} DEF${x.k.def}` : ''}${x.k.moves ? ' ' + x.k.moves.map(m => m.name + ' c' + m.cost + (m.ability ? ' abil' : ' p' + m.power)).join(', ') : ''}]`;
console.log('\nEdge = win rate when played minus win rate when in the deck but not played (how much the card itself helps).');
console.log('\nStrongest 15:'); rows.slice(0, 15).forEach(x => console.log(line(x)));
console.log('\nWeakest 15:'); rows.slice(-15).forEach(x => console.log(line(x)));
const items = rows.filter(x => x.k.type !== 'character');
console.log('\nAll Items/Evils:'); items.forEach(x => console.log(line(x)));
const ch = rows.filter(x => x.k.type === 'character' && x.life);
console.log(`\nCharacters live ${(ch.reduce((a, x) => a + x.life, 0) / ch.length).toFixed(1)} turns on average once played.`);
