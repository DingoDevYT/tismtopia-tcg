// Encrypts the card art and audio for the public site:  node tools/encrypt-assets.js   (check:  node tools/encrypt-assets.js --check)
// The plaintext stays on this PC (art/local/ and audio/local/ are git-ignored); the site publishes assets/, which js/assets.js
// decrypts in the browser only for signed-in members of the Tismtopia Discord (the key is in the asset_keys table, readable only by them).
// Workflow: after changing art or audio (tools/apply-cards.js, editor.html uploads, new tracks), run this, then commit assets/.
//
// Inputs: every card's art (c.art in js/cards-data.js + js/card-overrides.js, ?query dropped), art/local/pack-*.png, everything under audio/local/.
// Key: review/asset-key.txt (base64 of 32 bytes; review/ is never committed). Each file -> assets/<name>.bin, where
//   name = first 32 hex of HMAC-SHA256(key, path)            (path = e.g. "art/local/jegg_aj.png"; hides the file name)
//   .bin = IV (12 bytes) ‖ AES-256-GCM ciphertext ‖ tag (16 bytes), with the path as additional data (a file moved to another name fails)
//   IV   = first 12 bytes of HMAC-SHA256(key, 'iv:' + path + ':' + hex SHA-256(plaintext))  (unchanged file = identical .bin, no git churn)
// assets/index.json maps each name to its IV in hex: it changes exactly when a file's content does, so browsers know when their cached copy is stale.
// Stale .bin files are deleted. Running it twice changes nothing.
const fs = require('fs'), path = require('path'), vm = require('vm'), { createHmac, createHash, createCipheriv, createDecipheriv } = require('crypto');
const root = path.join(__dirname, '..');

const name = (key, rel) => createHmac('sha256', key).update(rel).digest('hex').slice(0, 32);
function encrypt(key, rel, buf) {
  const iv = createHmac('sha256', key).update(`iv:${rel}:${createHash('sha256').update(buf).digest('hex')}`).digest().subarray(0, 12);
  const c = createCipheriv('aes-256-gcm', key, iv); c.setAAD(Buffer.from(rel));
  return Buffer.concat([iv, c.update(buf), c.final(), c.getAuthTag()]);
}
function decrypt(key, rel, bin) {
  const d = createDecipheriv('aes-256-gcm', key, bin.subarray(0, 12)); d.setAAD(Buffer.from(rel)); d.setAuthTag(bin.subarray(-16));
  return Buffer.concat([d.update(bin.subarray(12, -16)), d.final()]);
}
// Relative paths (forward slashes) of every file to publish that exists on this PC.
function inputs() {
  const read = f => fs.readFileSync(path.join(root, f), 'utf8'), x = {};
  vm.runInNewContext(read('js/cards-data.js') + '\n;\n' + read('js/card-overrides.js') + ';this.A = [...CAPTAINS, ...CARDS]', x);
  const walk = d => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  const art = x.A.map(c => c.art && c.art.split('?')[0]).filter(a => a && a.startsWith('art/local/'));
  const all = [...new Set([...art, ...walk('art/local').filter(f => /^art\/local\/pack-[\w-]+\.png$/.test(f)), ...walk('audio/local')])].sort();
  const missing = all.filter(f => !fs.existsSync(path.join(root, f)));
  if (missing.length) console.warn('Not on this PC (skipped):\n  ' + missing.join('\n  '));
  return all.filter(f => !missing.includes(f));
}
module.exports = { name, encrypt, decrypt, inputs };

if (require.main === module) {
  const key = Buffer.from(fs.readFileSync(path.join(root, 'review', 'asset-key.txt'), 'utf8').trim(), 'base64');
  if (key.length !== 32) throw new Error('review/asset-key.txt must hold base64 of 32 bytes');
  const dir = path.join(root, 'assets'), files = inputs(), names = new Map(files.map(f => [name(key, f), f]));
  if (names.size !== files.length) throw new Error('two inputs hash to the same name');
  fs.mkdirSync(dir, { recursive: true });
  if (process.argv.includes('--check')) {
    const bins = fs.readdirSync(dir).filter(f => f.endsWith('.bin')), index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
    let bad = 0;
    for (const [n, f] of names) {
      try {
        const bin = fs.readFileSync(path.join(dir, n + '.bin'));
        if (!decrypt(key, f, bin).equals(fs.readFileSync(path.join(root, f))) || index[n] !== bin.subarray(0, 12).toString('hex')) throw new Error('differs');
      } catch (e) { bad++; console.error(`FAIL ${f}: ${e.message}`); }
    }
    if (bins.length !== files.length || Object.keys(index).length !== files.length) { bad++; console.error(`FAIL ${bins.length} .bin files and ${Object.keys(index).length} index entries for ${files.length} inputs`); }
    if (bad) process.exit(1);
    console.log(`check passed: ${files.length} files decrypt to their sources`);
  } else {
    let wrote = 0, bytes = 0; const index = {};
    for (const [n, f] of names) {
      const bin = encrypt(key, f, fs.readFileSync(path.join(root, f))), out = path.join(dir, n + '.bin');
      index[n] = bin.subarray(0, 12).toString('hex'); bytes += bin.length;
      if (!fs.existsSync(out) || !fs.readFileSync(out).equals(bin)) { fs.writeFileSync(out, bin); wrote++; }
    }
    const json = JSON.stringify(Object.fromEntries(Object.entries(index).sort())) + '\n', ix = path.join(dir, 'index.json');
    if (!fs.existsSync(ix) || fs.readFileSync(ix, 'utf8') !== json) fs.writeFileSync(ix, json);
    const stale = fs.readdirSync(dir).filter(f => f.endsWith('.bin') && !names.has(f.slice(0, -4)));
    stale.forEach(f => fs.unlinkSync(path.join(dir, f)));
    console.log(`${files.length} files, ${(bytes / 1e6).toFixed(1)} MB in assets/ (${wrote} written, ${stale.length} stale removed). Commit assets/ to publish.`);
  }
}
