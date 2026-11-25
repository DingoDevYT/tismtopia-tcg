// Ranked bot tiers head to head on the real rules engine: row tier's win rate vs column tier.
// Both sides draw a random deck from the same pool (3 starters + 8 Captain pre-built decks) each game, seats alternate, so only play differs.
// Run: node tools/simranked.js [games per pairing, default 40] [tiers, default 0,1,2,3,4,5]
// OWN=1: each tier draws from its own deck pool (rkBotDeck), as in the game, instead of the shared pool.
// DECKS=1 node tools/simranked.js [games per pairing]: deck vs deck with the Diamond bot on both sides (to pick the lists for high tiers).
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..'), part = f => fs.readFileSync(path.join(root, f), 'utf8').split('// ---------------- browser only')[0];
const ctx = vm.createContext({ structuredClone, console });
vm.runInContext(['js/cards-data.js', 'js/card-overrides.js', 'js/cards.js', 'js/game.js'].map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n;\n')
  + '\n;\n' + part('js/prebuilt.js') + '\n;\n' + part('js/ranked.js') + '\nthis.E = { newGame, apply, rkPick, rkTry, PB_DECKS, RK_TIERS, rkBotDeck: typeof rkBotDeck === "function" ? rkBotDeck : null };', ctx);
const { newGame, rkPick, rkTry, PB_DECKS, RK_TIERS, rkBotDeck } = ctx.E;
const N = +(process.argv[2] || 40), tiers = (process.argv[3] || '0,1,2,3,4,5').split(',').map(Number);
const pick = a => a[Math.floor(Math.random() * a.length)];

function play(decks, pol) { // pol[p](s, p) -> action
  let s = newGame(decks, ['A', 'B']);
  for (let steps = 0; s.phase !== 'over' && s.turnNo < 200 && steps < 4000; steps++) {
    const p = s.phase === 'defend' ? 1 - s.turn : s.turn;
    s = rkTry(s, p, pol[p](s, p)) || rkTry(s, p, s.phase === 'defend' ? { type: 'defend', i: 0 } : { type: 'end' });
    s.log = [];
  }
  return s.phase === 'over' ? s.winner : -1;
}
const t0 = Date.now();
if (process.env.DECKS) {
  const D = PB_DECKS, w = D.map(() => 0), g = D.map(() => 0), dia = (s, p) => rkPick(s, p, 4);
  for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) for (let k = 0; k < N; k++) {
    const seat = k % 2, r = play(seat ? [D[j], D[i]] : [D[i], D[j]], [dia, dia]); if (r < 0) continue;
    g[i]++; g[j]++; if (r === seat) w[i]++; else w[j]++;
  }
  D.map((d, i) => [d.id, w[i] / g[i]]).sort((a, b) => b[1] - a[1]).forEach(([id, x]) => console.log(id.padEnd(26), (100 * x).toFixed(0) + '%'));
} else {
  console.log(`Row tier's win rate vs column tier (${N} games each, ${process.env.OWN ? "each tier's own deck pool" : 'random pool decks'}):`);
  console.log('          ' + tiers.map(t => RK_TIERS[t][1].padStart(9)).join(''));
  for (const a of tiers) {
    let row = RK_TIERS[a][1].padEnd(10);
    for (const b of tiers) {
      if (a === b) { row += '        -'; continue; }
      if (b < a) { row += ''.padStart(9); continue; } // the matrix is symmetric: upper half only
      let w = 0, n = 0;
      for (let k = 0; k < N; k++) {
        const seat = k % 2, pol = [(s, p) => rkPick(s, p, seat ? b : a), (s, p) => rkPick(s, p, seat ? a : b)];
        const dk = t => (process.env.OWN ? rkBotDeck(t) : pick(PB_DECKS)), r = play([dk(seat ? b : a), dk(seat ? a : b)], pol); if (r < 0) continue;
        n++; w += r === seat ? 1 : 0; // tier a sits at seat 0 on even games, seat 1 on odd ones
      }
      row += `${(100 * w / Math.max(1, n)).toFixed(0)}%`.padStart(9);
    }
    console.log(row);
  }
}
console.log(`(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
