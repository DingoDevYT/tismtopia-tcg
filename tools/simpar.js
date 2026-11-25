// Runs tools/sim.js CAPS or HEALTH mode split across processes, then merges the results.
// node tools/simpar.js caps|health <games per seed> <seeds, e.g. 1,2> [chunks per seed, default 4]
// Env vars (VARIANT, DIRECT, ...) pass through. Each chunk uses its own seed (seed * 1000 + chunk), so results are reproducible.
const { spawn } = require('child_process'), path = require('path');
const [mode, games = '1600', seedList = '1,2', chunks = '4'] = process.argv.slice(2);
const seeds = seedList.split(',').map(Number), K = +chunks, per = Math.ceil(+games / K);
const run = seed => new Promise((ok, no) => {
  const env = { ...process.env, [mode === 'caps' ? 'CAPS' : 'HEALTH']: '1' };
  const p = spawn(process.execPath, [path.join(__dirname, 'sim.js'), String(per), String(seed)], { env });
  let out = ''; p.stdout.on('data', d => (out += d)); p.stderr.on('data', d => process.stderr.write(d));
  p.on('close', c => (c ? no(new Error('sim exit ' + c)) : ok(out)));
});
(async () => {
  const jobs = seeds.flatMap(s => Array.from({ length: K }, (_, k) => ({ s, seed: s * 1000 + k })));
  const outs = await Promise.all(jobs.map(j => run(j.seed).then(o => ({ ...j, o }))));
  if (mode === 'caps') {
    // line: "Name  NN%  (G games, avg T turns)  text"
    const bySeed = {}, all = {};
    for (const { s, o } of outs) for (const line of o.trim().split('\n')) {
      const m = line.match(/^(.+?)\s+(\d+)%\s+\((\d+) games, avg ([\d.]+) turns\)\s*(.*)$/); if (!m) continue;
      const [, name, pct, g, t, text] = m, w = Math.round(+pct * +g / 100);
      for (const acc of [(bySeed[s] ||= {}), all]) { const a = (acc[name] ||= { w: 0, g: 0, t: 0, text }); a.w += w; a.g += +g; a.t += +t * +g; }
    }
    const rows = Object.entries(all).sort((a, b) => b[1].w / b[1].g - a[1].w / a[1].g);
    console.log('Captain       all    ' + seeds.map(s => ('s' + s).padStart(5)).join('') + '  turns  Super');
    for (const [n, a] of rows) console.log(`${n.padEnd(12)} ${(100 * a.w / a.g).toFixed(1).padStart(5)}%  ${seeds.map(s => { const b = bySeed[s][n]; return (100 * b.w / b.g).toFixed(0).padStart(4) + '%'; }).join('')}  ${(a.t / a.g).toFixed(1).padStart(5)}  ${a.text}`);
    const g = rows.reduce((x, [, a]) => x + a.g, 0); console.log(`(${g} games)`);
  } else {
    const rs = outs.map(x => JSON.parse(x.o)), G = rs.reduce((a, r) => a + r.games, 0), avg = k => rs.reduce((a, r) => a + r[k] * r.games, 0) / G;
    console.log(JSON.stringify({ games: G, avgTurns: +avg('avgTurns').toFixed(1), firstWin: +avg('firstWin').toFixed(3), directPerGame: +avg('directPerGame').toFixed(2), directShare: +avg('directShare').toFixed(3), boreByT4: +avg('boreByT4').toFixed(2), capped: rs.reduce((a, r) => a + r.capped, 0) }));
  }
})();
