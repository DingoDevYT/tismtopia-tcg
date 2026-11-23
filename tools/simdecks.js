// Final showdown for the deck search: node tools/simdecks.js <folder of DECKOPT runs> [games per pairing]
// Takes each run's best deck, adds both starters, plays every pairing (seats alternated) and prints exact win rates.
const fs = require('fs'), path = require('path'), vm = require('vm'), { execFileSync } = require('child_process');
const dir = process.argv[2], games = +(process.argv[3] || 300);
const runs = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const ctx = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'cards-data.js'), 'utf8') + ';this.A=[...CAPTAINS,...CARDS];this.S=STARTERS', ctx);
const CARD = Object.fromEntries(ctx.A.map(c => [c.id, c]));
const decks = [...runs.map((r, i) => ({ name: 'Evolved #' + (i + 1), fit: r.top[0].fitness, ...r.top[0].deck })), ...ctx.S.map(s => ({ name: s.name, captain: s.captain, cards: s.cards }))];
fs.writeFileSync(path.join(dir, 'finalists.json'), JSON.stringify(decks));
const out = execFileSync(process.execPath, [path.join(__dirname, 'sim.js'), String(games), '99'], { env: { ...process.env, ROUNDROBIN: path.join(dir, 'finalists.json') }, maxBuffer: 1 << 26 }).toString();
const rr = JSON.parse(out);
console.log('Deck search: ' + runs.length + ' independent evolutions. Final round robin, ' + games + ' games per pairing.\n');
const rows = decks.map((d, i) => ({ d, i, wr: rr.wins[i] / Math.max(1, rr.games[i]) })).sort((a, b) => b.wr - a.wr);
for (const { d, i, wr } of rows) console.log((100 * wr).toFixed(1).padStart(5) + '%  ' + d.name.padEnd(14) + ' Captain ' + CARD[d.captain].name + (d.fit != null ? '  (evolution fitness ' + (100 * d.fit).toFixed(0) + '%)' : ''));
const best = rows[0].d;
console.log('\nBest deck (' + rows[0].d.name + ', Captain ' + CARD[best.captain].name + '):');
for (const [id, n] of Object.entries(best.cards).sort((a, b) => b[1] - a[1])) console.log('  ' + n + 'x ' + CARD[id].name + ' [' + CARD[id].type + (CARD[id].role ? ', ' + CARD[id].role : '') + ']');
const freq = {}; for (const d of decks.slice(0, runs.length)) for (const [id, n] of Object.entries(d.cards)) freq[id] = (freq[id] || 0) + n;
console.log('\nCards the evolved decks agree on (copies across all ' + runs.length + ' best decks):');
Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([id, n]) => console.log('  ' + String(n).padStart(3) + '  ' + CARD[id].name));
const caps = {}; for (const d of decks.slice(0, runs.length)) caps[d.captain] = (caps[d.captain] || 0) + 1;
console.log('\nCaptains chosen by evolution: ' + Object.entries(caps).sort((a, b) => b[1] - a[1]).map(([id, n]) => CARD[id].name + ' x' + n).join(', '));
console.log('\nHead to head (row beats column):');
console.log('               ' + decks.map((_, j) => ('#' + (j + 1)).padStart(6)).join(''));
decks.forEach((d, i) => console.log(d.name.padEnd(14) + ' ' + decks.map((_, j) => (i === j ? '     -' : ((100 * rr.pair[i][j]).toFixed(0) + '%').padStart(6))).join('')));
