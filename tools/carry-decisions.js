// Carries review decisions into a new round of drafts:  node tools/carry-decisions.js [previous decisions.json]
// A card stays accepted only if the fact-check marked it "ok" and its chosen art wasn't flagged.
// Everything else goes back to pending, keeping the chosen art and crop unless that art was flagged.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'review');
const prevFile = process.argv[2] || path.join(dir, 'round1', 'decisions.json');
const prev = JSON.parse(fs.readFileSync(prevFile, 'utf8'));
const drafts = fs.readdirSync(path.join(dir, 'drafts')).filter(f => f.endsWith('.json'))
  .flatMap(f => JSON.parse(fs.readFileSync(path.join(dir, 'drafts', f), 'utf8')));

const out = {}, tally = {};
for (const d of drafts) {
  const p = prev[d.id], flagged = new Set((d.artIssues || []).map(a => a.file));
  const art = p?.art?.file && p.folder === d.folder && !flagged.has(p.art.file) ? p.art : undefined;
  const status = p?.status === 'accepted' && d.check === 'ok' && art ? 'accepted' : 'pending';
  if (status === 'accepted') out[d.id] = p;
  else if (art) out[d.id] = { status, art, folder: d.folder, owner: d.owner };
  tally[status] = (tally[status] || 0) + 1;
}
fs.writeFileSync(path.join(dir, 'decisions.json'), JSON.stringify(out, null, 1));
console.log(`${drafts.length} cards:`, tally);
