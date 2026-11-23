// Summarises the overnight runs: node tools/simnight.js review/sim/night > report.txt
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = process.argv[2], J = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const ctx = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'cards-data.js'), 'utf8') + ';this.A=[...CAPTAINS,...CARDS]', ctx);
const CARD = Object.fromEntries(ctx.A.map(c => [c.id, c])), pc = x => (100 * x).toFixed(1) + '%';
const sub = d => fs.existsSync(path.join(dir, d)) ? fs.readdirSync(path.join(dir, d)).filter(f => f.endsWith('.json')).map(f => J(path.join(dir, d, f))) : [];
// focus tests
for (const f of fs.readdirSync(dir).filter(f => f.startsWith('focus-'))) {
  const runs = sub(f), tot = [0, 1, 2, 3].map(k => runs.reduce((a, r) => ({ g: a.g + r.res[k].g, w: a.w + r.res[k].w }), { g: 0, w: 0 }));
  if (!runs.length) continue;
  console.log('FOCUS ' + CARD[runs[0].id].name + ': win rate with 0/1/2/3 copies = ' + tot.map(t => pc(t.w / Math.max(1, t.g)) + ' (' + t.g + ')').join('  '));
}
// strategy matrix
const mats = sub('matrix');
if (mats.length) { const names = mats[0].names, cell = (a, b) => { const k = a + '|' + b; const w = mats.reduce((x, m) => x + m.w[k], 0), g = mats.reduce((x, m) => x + m.g[k], 0); return w / Math.max(1, g); };
  console.log('\nSTRATEGY MATRIX (row win rate vs column, starter decks):\n           ' + names.map(n => n.padStart(10)).join(''));
  for (const a of names) console.log(a.padEnd(11) + names.map(b => (a === b ? '-' : pc(cell(a, b))).padStart(10)).join(''));
  console.log('Overall: ' + names.map(a => a + ' ' + pc(names.filter(b => b !== a).reduce((x, b) => x + cell(a, b), 0) / (names.length - 1))).join(', ')); }
// variant card-stat runs (deck size / HP)
for (const v of fs.readdirSync(dir).filter(f => f.startsWith('cards-'))) { const runs = sub(v); if (!runs.length) continue;
  const g = runs.reduce((a, r) => a + r.games, 0), t = runs.reduce((a, r) => a + r.turns, 0), d = runs.reduce((a, r) => a + (r.deckouts || 0), 0), f = runs.reduce((a, r) => a + r.firstWins, 0);
  console.log('\nVARIANT ' + v + ': ' + g + ' games, ' + (t / g).toFixed(1) + ' turns, deck-outs in ' + pc(d / g) + ' of games, first player wins ' + pc(f / g)); }
