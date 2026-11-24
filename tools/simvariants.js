// Tests card ideas: node tools/simvariants.js <ideas.json> <games per run> [parallel]
// For each idea's card it runs FOCUS (random decks with 0-3 copies vs decks without it) twice with the SAME seed:
// once as the card is now, once with the idea applied. Impact = average win rate with 1-3 copies minus with 0.
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const [file, games = '1000', par = String(os.cpus().length)] = process.argv.slice(2);
const ideas = JSON.parse(fs.readFileSync(file, 'utf8')), out = path.join(path.dirname(file), 'runs');
fs.mkdirSync(out, { recursive: true });
const jobs = [...new Set(ideas.map(i => i.card))].map(card => ({ name: 'base-' + card, card, v: null }))
  .concat(ideas.map(i => ({ name: i.key, card: i.card, v: { [i.card]: i.v } })));
const run = job => new Promise(res => {
  const dst = path.join(out, job.name + '.json'); if (fs.existsSync(dst)) return res();
  const env = { ...process.env, FOCUS: job.card };
  if (job.v) { const vf = path.join(out, job.name + '.variant.json'); fs.writeFileSync(vf, JSON.stringify(job.v)); env.VARIANT = vf; }
  let buf = ''; const p = spawn(process.execPath, [path.join(__dirname, 'sim.js'), games, '7'], { env });
  p.stdout.on('data', d => (buf += d)); p.on('close', () => { fs.writeFileSync(dst, buf); console.log('done', job.name); res(); });
});
(async () => {
  const queue = [...jobs]; await Promise.all(Array.from({ length: +par }, async () => { while (queue.length) await run(queue.shift()); }));
  const impact = name => { try { const r = JSON.parse(fs.readFileSync(path.join(out, name + '.json'), 'utf8')).res, wr = k => r[k].w / Math.max(1, r[k].g); return ((wr(1) + wr(2) + wr(3)) / 3 - wr(0)) * 100; } catch { return NaN; } };
  const rows = ideas.map(i => ({ ...i, base: impact('base-' + i.card), now: impact(i.key) })).map(r => ({ ...r, delta: r.now - r.base }));
  const lines = rows.map(r => `${r.tier.padEnd(7)} ${r.idea.padEnd(80)} card impact ${r.base.toFixed(1).padStart(5)} -> ${r.now.toFixed(1).padStart(5)}  (${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(1)})`);
  fs.writeFileSync(path.join(path.dirname(file), 'report.txt'), 'Impact = win-rate points a deck gains from running the card (1-3 copies vs none). ~+-3 is noise.\n\n' + lines.join('\n') + '\n');
  fs.writeFileSync(path.join(path.dirname(file), 'report.json'), JSON.stringify(rows, null, 1));
  console.log(lines.join('\n'));
})();
