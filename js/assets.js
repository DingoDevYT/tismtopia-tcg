// Card art and audio. On the owner's PC and the LAN ('plain') they load straight from art/local/ and audio/local/, as always.
// The public site has only the encrypted copies in assets/ (written by tools/encrypt-assets.js, which documents the format) ('locked'):
// a signed-in member of the Discord server gets the key from the asset_keys table (js/cloud.js calls assetKeyLoad), and each file is
// fetched, decrypted with WebCrypto and shown as a blob URL. Decrypted copies go in the Cache API, so later visits need neither the
// download nor the decryption. Without the key everything stays a placeholder and silent. ?assets=enc forces 'locked' anywhere, for testing.

// ---------------- pure (the tests load this part in Node with crypto.webcrypto) ----------------
const AS_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp3: 'audio/mpeg', wav: 'audio/wav' };
const asHex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
// key (base64 of 32 bytes) -> the WebCrypto keys: AES-GCM to decrypt, HMAC to name the files
async function asKeys(b64) {
  const raw = Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
  return { aes: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']), hmac: await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']) };
}
const asName = async (hmac, path) => asHex(await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode(path))).slice(0, 32);
// .bin = IV (12) ‖ ciphertext ‖ tag (16), the path as additional data: rejects if a byte changed or the file belongs to another path
const asDecrypt = (aes, path, bin) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: bin.subarray(0, 12), additionalData: new TextEncoder().encode(path) }, aes, bin.subarray(12));

// Same hosts as the sign-in gate leaves open (js/onboard.js gateOn): localhost, LAN, *.local, file.
let ASSET_MODE = typeof location === 'undefined' || (/^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|.+\.local|)$/i.test(location.hostname)
  && !/[?&]assets=enc(&|$)/.test(location.search)) ? 'plain' : 'locked';
// keys/index: set once the key works. url: path -> blob URL. want: paths asked for on screen, the most recent last (served first);
// later: preloads, served once want is empty (newest first).
const AS = { keys: null, index: null, box: null, started: false, keyP: null, url: new Map(), names: new Map(), want: new Set(), later: new Set(), bad: new Set(), busy: 0 };
const AS_KEY = 'tismtopia.assetKey'; // sessionStorage: gone when the tab closes, dropped on sign-out

// The URL to load an art/local/ or audio/local/ path from (anything else passes through). Locked: the blob URL once decrypted, else ''
// (callers show their placeholder) and the file is queued; later = a preload, behind everything asked for on screen.
function assetUrl(path, later) {
  if (ASSET_MODE === 'plain' || !/^(art|audio)\/local\//.test(path || '')) return path;
  const p = path.split('?')[0], u = AS.url.get(p);
  if (u || AS.bad.has(p)) return u || '';
  if (!later) { AS.later.delete(p); AS.want.delete(p); AS.want.add(p); } else if (!AS.want.has(p)) AS.later.add(p);
  asPump();
  return '';
}
// An <img> source attribute: a picture still being decrypted gets data-asset instead (hidden by style.css) and its src when it's ready.
const assetSrc = path => { const u = assetUrl(path); return u ? `src="${u}"` : `data-asset="${path.split('?')[0]}"`; };

// ---------------- browser only ----------------
function asPump() {
  while (AS.index && AS.busy < 4 && (AS.want.size || AS.later.size)) {
    const p = [...(AS.want.size ? AS.want : AS.later)].pop(); AS.want.delete(p); AS.later.delete(p); AS.busy++;
    asLoad(p).catch(() => AS.bad.add(p)).finally(() => { AS.busy--; asPump(); }); // a failure is final for this visit: no retry storms
  }
}
async function asLoad(p) {
  if (!AS.names.has(p)) AS.names.set(p, await asName(AS.keys.hmac, p));
  const name = AS.names.get(p), tag = AS.index[name], ck = `asset-cache/${name}.${tag}`;
  if (!tag) throw new Error('not published');
  let blob = await (await AS.box?.match(ck))?.blob();
  if (!blob) {
    const r = await fetch(`assets/${name}.bin`, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status);
    const bin = new Uint8Array(await r.arrayBuffer());
    blob = new Blob([await asDecrypt(AS.keys.aes, p, bin)], { type: AS_MIME[p.split('.').pop().toLowerCase()] || '' });
    if (asHex(bin.subarray(0, 12)) === tag) await AS.box?.put(ck, new Response(blob)).catch(() => {}); // mid-deploy the file can lag the index: don't keep that one
  }
  const u = URL.createObjectURL(blob); AS.url.set(p, u);
  for (const img of document.querySelectorAll('img[data-asset]')) if (img.dataset.asset === p) { img.removeAttribute('data-asset'); img.src = u; }
  dispatchEvent(new CustomEvent('asset', { detail: p })); // js/audio.js starts a track that was wanted before it was ready
}
async function asStart(b64) {
  if (ASSET_MODE !== 'locked' || AS.started || !globalThis.crypto?.subtle) return;
  AS.started = true;
  try {
    AS.keys = await asKeys(b64);
    const r = await fetch('assets/index.json', { cache: 'no-cache' }), index = r.ok ? await r.json() : {};
    AS.box = typeof caches !== 'undefined' ? await caches.open('assets-v1').catch(() => null) : null;
    AS.index = index; asPump(); dispatchEvent(new Event('asset-key'));
    // drop decrypted copies of files that changed or went away since they were cached
    const keep = new Set(Object.entries(index).map(([n, t]) => new URL(`asset-cache/${n}.${t}`, location.href).href));
    for (const k of (await AS.box?.keys()) || []) if (!keep.has(k.url)) AS.box.delete(k);
  } catch (e) { if (!AS.index) { Object.assign(AS, { started: false, keys: null }); try { sessionStorage.removeItem(AS_KEY); } catch { /* */ } } }
}
// js/cloud.js, once cloudUser() has verified a member: read the key (the database refuses everyone else), once per tab.
function assetKeyLoad() {
  if (ASSET_MODE !== 'locked' || AS.started || AS.keyP) return;
  AS.keyP = sbGet().then(sb => sb.from('asset_keys').select('key').eq('name', 'v1').maybeSingle()).then(({ data }) => {
    if (!data?.key) return;
    try { sessionStorage.setItem(AS_KEY, data.key); } catch { /* private mode: memory only */ }
    return asStart(data.key);
  }).catch(() => {}).finally(() => { AS.keyP = null; });
}
// js/cloud.js, after a sign-out: the key and the decrypted copies go; a reload drops the blob URLs and stops anything playing.
function assetForget() {
  if (ASSET_MODE !== 'locked') return;
  try { sessionStorage.removeItem(AS_KEY); } catch { /* */ }
  const had = !!AS.keys;
  (typeof caches !== 'undefined' ? caches.delete('assets-v1') : Promise.resolve()).catch(() => {}).then(() => { if (had) location.reload(); });
}
if (typeof window !== 'undefined') {
  const boot = () => { let k = null; try { k = sessionStorage.getItem(AS_KEY); } catch { /* */ } if (k) asStart(k); else if (typeof cloud !== 'undefined' && cloud.user) assetKeyLoad(); };
  if (ASSET_MODE === 'locked') boot();
  // a local copy without the plaintext (e.g. a fresh clone): decrypt like the public site
  else if (window.isSecureContext && typeof CARDS !== 'undefined' && CARDS.find(c => c.art)) {
    fetch(CARDS.find(c => c.art).art.split('?')[0], { method: 'HEAD' }).then(r => { if (r.status === 404) { ASSET_MODE = 'locked'; boot(); if (typeof render === 'function') render(); } }, () => {});
  }
}
