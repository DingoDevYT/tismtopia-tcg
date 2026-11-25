// Cloud layer (Supabase): Discord sign-in, a cloud copy of your save, private card submissions. Tables: supabase/schema.sql.
// These two values are PUBLIC by design (the project URL and its publishable key; Row Level Security decides what anyone can read or write),
// so they are safe to commit. Never put a secret / service_role key here. An empty url switches accounts off: every call returns CLOUD_OFF.
const CLOUD = { url: 'https://ikmohktrubvpykvwyxuf.supabase.co', key: 'sb_publishable_GSno-kcVbX_vi5eQYQ8Vaw_jaSwsWST' };
const SAVE_KEYS = ['name', 'collection', 'coins', 'decks', 'deck', 'favs', 'volume', 'stats', 'onboard', 'resetAt', 'pfp', 'showcase', 'capPlays']; // the last three: js/social.js
const STAT_KEYS = ['botPlayed', 'botWon', 'pvpPlayed', 'pvpWon'];
const CLOUD_OFF = { ok: false, why: 'Accounts are not connected yet.' }, NO_USER = { ok: false, why: 'Not signed in.' };
// checked: we know whether someone is signed in. synced: the sign-in comparison is settled, so auto-save may run.
// last: the cloud copy's updated_at as of this device's last sync (server time, so phone clocks don't matter).
// mem: this page load's Discord-server answer (cloudMember). block: why a signed-in player gets no cloud features (a MEMBER_BLOCK key).
// token: the Discord access token from a sign-in on this page, kept in memory only, for Retry.
const cloud = { user: null, checked: false, synced: false, dirty: false, timer: 0, savedMs: 0, start: null, last: store.get('cloudAt', ''), mem: null, block: '', token: '' };
// Shown on the gate and on Profile: [title, text, button, what the button does: in = sign in, consent = sign in and re-ask Discord, recheck].
const MEMBER_BLOCK = {
  no: ['Members only', 'This game is for members of the Tismtopia Discord server. Join the server, then sign in again.', 'Try again', 'in'],
  stale: ['', "Please sign in again to confirm you're in the Tismtopia Discord", 'Sign in with Discord', 'in'],
  scope: ['', "Discord didn't share your server list. Sign in again and allow it.", 'Sign in again', 'consent'],
  err: ['', "Couldn't check your Discord server membership. Try again.", 'Retry', 'recheck'],
};
const PAUSED = 'Cloud save is paused: see Profile.'; // short: toasts are one line
let sbLib = null;

// The library loads on first use only: a sign-in tap, a return from Discord, or a player who is already signed in. Signed-out play never loads it.
function sbGet() {
  if (!CLOUD.url) return Promise.resolve(null);
  return (sbLib ||= import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm')
    .then(m => m.createClient(CLOUD.url, CLOUD.key, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } }))
    .catch(e => { sbLib = null; throw e; }));
}
const need = r => { if (r.error) throw r.error; return r.data; };
// Every cloud call goes through here: no client = not connected; any failure (offline, missing table, refused by RLS) is one short toast.
async function sbRun(what, fn) {
  try { const sb = await sbGet(); return sb ? { ok: true, ...(await fn(sb)) } : CLOUD_OFF; }
  catch (e) {
    console.warn('cloud:', what, e);
    if (cloud.user && (e?.code === '42501' || /row-level security/i.test(e?.message)) && (await cloudRefused())) return { ok: false, why: 'not a member' };
    const why = String(e?.message || e || 'no connection').slice(0, 90); toast(`${what} failed: ${why}`); return { ok: false, why };
  }
}
// The database refused: if membership has lapsed, cloud features (and auto-save) stop with one message until the next sign-in verifies again.
async function cloudRefused() {
  const r = await (await sbGet()).rpc('is_member').catch(() => null);
  if (r?.data !== false) return false;
  if (!cloud.user) return true; // another refused call got here first and said it
  clearTimeout(cloud.timer); Object.assign(cloud, { user: null, synced: false, timer: 0, block: 'stale' }); ui.subList = null;
  toast(PAUSED); // Profile shows the reason and the sign-in button
  if (ui.view === 'profile' || ui.view === 'submit') render();
  return true;
}
const hasSession = () => { try { return Object.keys(localStorage).some(k => /^sb-.+-auth-token$/.test(k)); } catch { return false; } };

const cloudReady = async () => !!(await sbGet().catch(() => null));
async function cloudUser() {
  if (!CLOUD.url) return null;
  const r = await sbRun('Account check', async sb => ({ session: need(await sb.auth.getSession()).session }));
  const s = r.ok && r.session, v = s?.user ? await cloudMember(s) : '';
  if (v) cloud.block = v === 'yes' ? '' : v; // kept after a non-member is signed out, so the reason stays on screen
  cloud.checked = true;
  if (v !== 'yes') return (cloud.user = null); // only a verified member counts as signed in
  const u = s.user, m = u.user_metadata || {}, av = String(m.avatar_url || '');
  assetKeyLoad(); // a verified member: the key for the encrypted art and audio (js/assets.js; once per tab)
  return (cloud.user = { id: u.id, name: String(m.custom_claims?.global_name || m.full_name || m.name || 'Player').slice(0, 32), avatar: /^https:\/\/cdn\.discordapp\.com\/[\w/.-]+(\?[\w=&.-]*)?$/.test(av) ? av : '' });
}
// Is this account in the Tismtopia Discord server? Asked once per page load. Right after a Discord sign-in the Discord token goes to
// supabase/functions/verify-member (the server id is set there), which asks Discord and records the answer in public.members; any
// other load asks is_member() (verified in the last 30 days). The database itself refuses non-members (supabase/schema.sql).
// 'yes' | 'no' (not in the server: signed out) | 'stale' (not verified lately) | 'scope' (Discord didn't share the server list,
// e.g. consent given before the guilds scope) | 'err'. An error never counts as 'yes'.
const cloudMember = s => (cloud.mem ||= (async () => {
  const sb = await sbGet();
  if (fromDiscord && s.provider_token) cloud.token = s.provider_token; // Supabase drops it at the next token refresh
  if (cloud.token) {
    const { data, error } = await sb.functions.invoke('verify-member', { body: { provider_token: cloud.token } });
    if (error) return [401, 502].includes(error.context?.status) ? 'scope' : 'err';
    if (data?.member === false) await cloudSignOut();
    return data?.member === true ? 'yes' : data?.member === false ? 'no' : 'err';
  }
  const { data, error } = await sb.rpc('is_member');
  return error ? 'err' : data === true ? 'yes' : 'stale';
})().catch(e => { console.warn('cloud: member check', e); return 'err'; }));
// Retry after 'err': the same check again (with the Discord token if this page still holds it, else is_member()), then the usual sync.
const cloudRecheck = () => { Object.assign(cloud, { mem: null, start: null, checked: false }); return cloudStart(false); };
// consent: show Discord's permission screen again, for someone whose earlier consent didn't include the server list.
async function cloudSignIn(consent) {
  if (!CLOUD.url) return CLOUD_OFF;
  // Ask first whether Discord is switched on: otherwise the redirect lands on a bare error page instead of a toast here.
  try { const s = await (await fetch(CLOUD.url + '/auth/v1/settings', { headers: { apikey: CLOUD.key } })).json(); if (!s.external?.discord) { toast("Discord sign-in isn't switched on yet."); return { ok: false, why: 'Discord sign-in is off.' }; } }
  catch { toast("Couldn't reach the account server."); return { ok: false, why: 'offline' }; }
  return sbRun('Sign-in', async sb => { need(await sb.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: location.origin + location.pathname,
    scopes: 'identify email guilds', ...(consent && { queryParams: { prompt: 'consent' } }) } })); return {}; }); // guilds: verify-member reads the server list
}
async function cloudSignOut() {
  if (!CLOUD.url) return CLOUD_OFF;
  if (cloud.dirty && cloud.synced && cloud.user) await cloudSaveGame(); // keep the last few changes
  const r = await sbRun('Sign-out', async sb => { need(await sb.auth.signOut()); return {}; });
  if (r.ok) { clearTimeout(cloud.timer); Object.assign(cloud, { user: null, synced: false, timer: 0 }); ui.subList = null; assetForget(); }
  return r;
}

// Decks come from memory: the free starters are rebuilt on every load and only reach storage once a deck is edited.
const saveBlob = () => ({ ...Object.fromEntries(SAVE_KEYS.map(k => [k, store.get(k, null)]).filter(([, v]) => v !== null)), decks, deck: deck().id });
// force: write even if another device saved since this one last synced (a reset, so it wins everywhere, or the player picking this device's save).
async function cloudSaveGame(force) {
  if (!CLOUD.url) return CLOUD_OFF;
  if (!cloud.user) return NO_USER;
  cloud.dirty = false; cloud.savedMs = Date.now();
  const r = await sbRun('Cloud save', async sb => {
    // Someone else saved since (another device, or a reset there): ask which save to keep instead of overwriting it.
    const cur = !force && cloud.last && need(await sb.from('saves').select('updated_at').eq('user_id', cloud.user.id).maybeSingle());
    if (cur && cur.updated_at !== cloud.last) return { stale: true };
    return { row: need(await sb.from('saves').upsert({ user_id: cloud.user.id, data: saveBlob() }).select('updated_at').single()) };
  });
  if (r.stale) { Object.assign(cloud, { synced: false, dirty: true }); cloudSync(); return { ok: false, why: 'Another device saved first.' }; }
  if (r.ok) { cloud.last = r.row.updated_at; store.set('cloudAt', cloud.last); document.querySelectorAll('.cloud-last').forEach(el => { el.textContent = lastSaveText(); }); } else cloud.dirty = true;
  return r;
}
async function cloudLoadGame() {
  if (!CLOUD.url) return CLOUD_OFF;
  if (!cloud.user) return NO_USER;
  return sbRun('Cloud load', async sb => ({ row: need(await sb.from('saves').select('data, updated_at').eq('user_id', cloud.user.id).maybeSingle()) }));
}
const lastSaveText = () => `Last cloud save: ${cloud.last ? new Date(cloud.last).toLocaleString() : 'not yet'}`;

// After sign-in neither side is ever overwritten silently: upload when the cloud copy is missing or unchanged since this device
// last synced; otherwise (another device saved, or this device never synced) the player picks.
const stable = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
async function cloudSync() {
  const r = await cloudLoadGame(); if (!r.ok) return;
  const row = r.row, same = row && stable(row.data) === stable(saveBlob());
  if (same) { Object.assign(cloud, { synced: true, last: row.updated_at }); store.set('cloudAt', cloud.last); if (cloud.dirty) cloudDirty(); return; }
  if (!row || row.updated_at === cloud.last) { cloud.synced = true; return cloudSaveGame(); }
  try { ui.cloudAsk = { data: cleanSave(row.data), at: row.updated_at }; } catch { return toast('Your cloud save looks damaged, so it was left alone.'); } // synced stays off: no auto-save over it
  render();
}
const cloudStart = fromDiscord => (cloud.start ||= (async () => {
  const u = await cloudUser(); // waits for the library to swap the ?code= for a session and store it
  if (fromDiscord) { history.replaceState(null, '', location.pathname); ui.view = 'profile'; ui.back = 'home'; if (!u && !cloud.block) toast("Sign-in didn't finish. Try again."); }
  else if (!u && cloud.block && ui.view !== 'profile') toast(PAUSED); // a saved session that isn't a verified member any more
  if (u && (ui.view === 'profile' || ui.view === 'submit')) render(); // signed-in buttons straight away, not after the save sync
  if (u) { try { await (await sbGet()).from('profiles').upsert({ id: u.id, name: u.name, avatar: u.avatar || null }); } catch { /* the profile row is a nicety */ } await cloudSync(); }
  if (ui.view === 'profile' || ui.view === 'submit') render();
})());

// Auto-save: a change to any save key marks the cloud copy stale; it uploads at most once every 30 s, and straight away when the tab is hidden.
function cloudDirty() {
  cloud.dirty = true;
  if (!cloud.user || !cloud.synced || cloud.timer) return;
  cloud.timer = setTimeout(() => { cloud.timer = 0; if (cloud.dirty && cloud.user && cloud.synced) cloudSaveGame(); }, Math.max(1000, 30000 - (Date.now() - cloud.savedMs)));
}
const lsGet = k => { try { return localStorage.getItem('tismtopia.' + k); } catch { return null; } };
const storeSetLocal = store.set;
store.set = (k, v) => {
  const watch = SAVE_KEYS.includes(k), was = watch && lsGet(k);
  storeSetLocal(k, v);
  if (watch && lsGet(k) !== was) cloudDirty();
};
document.addEventListener('visibilitychange', () => { if (document.hidden && cloud.dirty && cloud.user && cloud.synced) { clearTimeout(cloud.timer); cloud.timer = 0; cloudSaveGame(); } });

// Card submissions: the picture (and the transparent cut-out, if any) go to the private bucket under the player's own folder, then one row.
async function cloudSubmitCard(payload, imageBlob, cutoutBlob) {
  if (!CLOUD.url) return CLOUD_OFF;
  if (!cloud.user) return NO_USER;
  return sbRun('Sending the card', async sb => {
    const ext = b => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[b?.type];
    if (!ext(imageBlob)) throw new Error('add a picture first');
    const base = `${cloud.user.id}/${crypto.randomUUID()}`, put = async (b, path) => { need(await sb.storage.from('submissions').upload(path, b, { contentType: b.type, upsert: false })); return path; };
    const image = await put(imageBlob, `${base}.${ext(imageBlob)}`), cutout = ext(cutoutBlob) ? await put(cutoutBlob, `${base}-cutout.${ext(cutoutBlob)}`) : '';
    return { row: need(await sb.from('submissions').insert({ user_id: cloud.user.id, card: { ...payload, image, cutout }, image_path: image, note: payload.form.notes || null }).select('id, created_at, updated_at, status, card, image_path').single()) };
  });
}
async function cloudMySubmissions() {
  if (!CLOUD.url) return CLOUD_OFF;
  if (!cloud.user) return NO_USER;
  return sbRun('Loading your submissions', async sb => ({ rows: need(await sb.from('submissions').select('id, created_at, updated_at, status, card, image_path, review_note').order('created_at', { ascending: false }).limit(50)) }));
}
// Only paths inside the player's own folder are ever touched (storage rules enforce the same).
const ownPath = p => (typeof p === 'string' && cloud.user && p.startsWith(cloud.user.id + '/') && p.length <= 200 ? p : '');
// The bucket is private: pictures are shown through short-lived signed links, or downloaded with the player's session.
async function cloudSignedUrls(paths) {
  if (!CLOUD.url) return CLOUD_OFF;
  if (!cloud.user) return NO_USER;
  return sbRun('Loading pictures', async sb => ({ urls: need(await sb.storage.from('submissions').createSignedUrls(paths.filter(ownPath), 3600)) }));
}
async function cloudDownload(path) {
  if (!CLOUD.url) return CLOUD_OFF;
  if (!cloud.user) return NO_USER;
  return sbRun('Loading the picture', async sb => { if (!ownPath(path)) throw new Error('no picture'); return { blob: need(await sb.storage.from('submissions').download(path)) }; });
}
// Edit a pending submission: same row; new pictures (if any) go to new paths and the old ones are deleted after the row points at them.
// { gone: true } = the row was reviewed or withdrawn meanwhile (the update matched nothing).
async function cloudUpdateSubmission(edit, payload, imageBlob, cutoutBlob) {
  if (!CLOUD.url) return CLOUD_OFF;
  if (!cloud.user) return NO_USER;
  return sbRun('Saving changes', async sb => {
    const ext = b => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[b?.type], put = async (b, path) => { need(await sb.storage.from('submissions').upload(path, b, { contentType: b.type, upsert: false })); return path; };
    let image = ownPath(edit.image), cutout = ownPath(edit.cutout); const fresh = [], old = [];
    if (ext(imageBlob)) {
      const base = `${cloud.user.id}/${crypto.randomUUID()}`;
      fresh.push(image = await put(imageBlob, `${base}.${ext(imageBlob)}`));
      cutout = ext(cutoutBlob) ? await put(cutoutBlob, `${base}-cutout.${ext(cutoutBlob)}`) : ''; if (cutout) fresh.push(cutout);
      old.push(...[edit.image, edit.cutout].filter(ownPath));
    }
    const rows = need(await sb.from('submissions').update({ card: { ...payload, image, cutout }, image_path: image || null, note: payload.form.notes || null })
      .eq('id', edit.id).eq('status', 'pending').select('id, created_at, updated_at, status, card, image_path'));
    const drop = rows.length ? old : fresh; // tidy up whichever pictures nothing points at now
    if (drop.length && (await sb.storage.from('submissions').remove(drop)).error) console.warn('cloud: leftover pictures', drop);
    return rows.length ? { row: rows[0] } : { gone: true };
  });
}
// Withdraw: delete the pending row, then its pictures. { gone: false } = nothing matched (already reviewed or withdrawn).
async function cloudDeleteSubmission(row) {
  if (!CLOUD.url) return CLOUD_OFF;
  if (!cloud.user) return NO_USER;
  return sbRun('Withdrawing', async sb => {
    const rows = need(await sb.from('submissions').delete().eq('id', row.id).eq('status', 'pending').select('id'));
    const files = [row.image_path, row.card?.cutout].filter(ownPath);
    if (rows.length && files.length && (await sb.storage.from('submissions').remove(files)).error) toast("Card withdrawn, but its picture couldn't be deleted.");
    return { gone: rows.length > 0 };
  });
}

// Untrusted save data (an imported file or the cloud copy) -> an object of known, well-formed keys, or an Error. Nothing unknown is ever written.
function cleanSave(d) {
  const plain = v => !!v && typeof v === 'object' && !Array.isArray(v), int = (v, hi) => Number.isInteger(v) && v >= 0 && v <= hi, str = (v, n) => typeof v === 'string' && v.length <= n;
  if (!plain(d)) throw new Error('This is not a Tismtopia save.');
  const out = {}, bad = k => { throw new Error(`This save's "${String(k).slice(0, 20)}" doesn't look right.`); };
  for (const [k, v] of Object.entries(d)) {
    if (k === 'name') { if (!str(v, 22) || !v.trim()) bad(k); out.name = v.trim(); }
    else if (k === 'coins') { if (!int(v, 1e9)) bad(k); out.coins = v; }
    else if (k === 'volume') { if (typeof v !== 'number' || !(v >= 0 && v <= 1)) bad(k); out.volume = v; }
    else if (k === 'deck') { if (!str(v, 40)) bad(k); out.deck = v; }
    else if (k === 'favs') { if (!Array.isArray(v) || v.length > 1000 || !v.every(x => str(x, 64))) bad(k); out.favs = v.map(id => REPLACED[id] || id).filter(id => CARD[id]); }
    else if (k === 'stats') { if (!plain(v) || !Object.entries(v).every(([s, n]) => STAT_KEYS.includes(s) && int(n, 1e7))) bad(k); out.stats = { ...v }; }
    else if (k === 'collection') {
      if (!plain(v) || Object.keys(v).length > 2000) bad(k);
      out.collection = {};
      for (const [id, e] of Object.entries(v)) {
        if (!plain(e) || !int(e.n, 1e5) || !plain(e.f) || !Object.entries(e.f).every(([f, n]) => FORDER.includes(f) && int(n, 1e5))) bad(k);
        out.collection[id] = { n: e.n, f: { ...e.f } };
      }
      swapColl(out.collection); // replaced cards carry over (js/cards.js); anything else that no longer exists is dropped
      for (const id of Object.keys(out.collection)) if (!CARD[id]) delete out.collection[id];
    } else if (k === 'decks') {
      if (!Array.isArray(v) || v.length > 100) bad(k);
      out.decks = v.map(x => {
        if (!plain(x) || !str(x.id, 40) || !str(x.name, 30) || !(x.captain === null || str(x.captain, 64)) || !plain(x.cards) || Object.keys(x.cards).length > 200
          || !Object.values(x.cards).every(n => Number.isInteger(n) && n >= 1 && n <= 3)) bad(k);
        return { id: x.id, name: x.name, captain: x.captain, cards: swapDeck({ ...x.cards }) };
      });
    } else if (k === 'onboard') { // starter packs progress (js/onboard.js)
      const ok = { done: x => typeof x === 'boolean', legacy: x => typeof x === 'boolean', starter: x => str(x, 40), opened: x => int(x, 8) };
      if (!plain(v) || !Object.entries(v).every(([f, x]) => Object.hasOwn(ok, f) && ok[f](x))) bad(k); out.onboard = { ...v };
    } else if (k === 'pfp') { if (v !== null && !pfpOk(v)) bad(k); out.pfp = v; } // profile picture: a Captain or Character id (js/social.js)
    else if (k === 'showcase') { const s = cleanStands(v); if (!s) bad(k); out.showcase = s; } // display stands
    else if (k === 'capPlays') { const c = cleanCapPlays(v); if (!c) bad(k); out.capPlays = c; } // battles per Captain
    else if (k === 'resetAt') { if (!str(v, 40) || isNaN(Date.parse(v))) bad(k); out.resetAt = v; }
    else bad(k);
  }
  if (!Object.keys(out).length) throw new Error('This save is empty.');
  if (out.collection && !out.onboard) out.onboard = { done: true, legacy: true }; // a save from before the starter packs: same rule as app.js
  return out;
}
const writeSave = d => { for (const [k, v] of Object.entries(d)) try { localStorage.setItem('tismtopia.' + k, JSON.stringify(v)); } catch { /* storage full */ } };
const saveSummary = d => `${fmt(d.coins ?? 0)} coins · ${Object.values(d.collection || {}).filter(e => e.n > 0).length} cards · ${(d.decks || []).length} deck${(d.decks || []).length === 1 ? '' : 's'}`;

// "Which save?" after signing in, when the two copies differ.
function cloudAskHtml() {
  const a = ui.cloudAsk, cr = Date.parse(a.data.resetAt) || 0, mr = Date.parse(store.get('resetAt', '')) || 0, when = t => esc(new Date(t).toLocaleString());
  // A reset stamps the save, so a copy from before it is named as such instead of looking like any other difference.
  const reset = cr > mr ? `<p class="muted center">This account was reset on ${when(cr)}. This device's save is from before that.</p>`
    : mr > cr ? `<p class="muted center">You reset your account on this device on ${when(mr)}. The cloud save is from before that.</p>` : '';
  return `<div class="cloud-ask">${sheet(`<h2>Which save do you want?</h2><p class="muted center">Your cloud save and this device's save are different. The one you don't pick is replaced.</p>${reset}
    <div class="adj neu-in"><b>Cloud save</b><small>${esc(saveSummary(a.data))} · saved ${esc(new Date(a.at).toLocaleString())}</small></div>
    <div class="adj neu-in"><b>This device</b><small>${esc(saveSummary(saveBlob()))}</small></div>
    <button class="btn primary wide" data-act="cloud-use">Use cloud save</button><button class="btn wide" data-act="cloud-keep">Keep this device's save</button>`, false)}</div>`;
}
Object.assign(ACTS, {
  'cloud-use'() { const a = ui.cloudAsk; ui.cloudAsk = null; writeSave(a.data); storeSetLocal('cloudAt', a.at); location.reload(); return false; },
  'cloud-keep'() { ui.cloudAsk = null; cloud.synced = true; cloudSaveGame(true); }, // the player chose: overwrite even though the cloud changed
});
const renderNoCloud = render;
render = function () { renderNoCloud(); if (ui.cloudAsk) $app.insertAdjacentHTML('beforeend', cloudAskHtml()); };

// Returning from Discord (?code=, #access_token= or an error) opens the Profile; a player already signed in just syncs. Everyone else loads nothing.
const fromDiscord = /[?&](code|error_description)=/.test(location.search) || /[#&](access_token|error_description)=/.test(location.hash);
if (CLOUD.url && (fromDiscord || hasSession())) cloudStart(fromDiscord);
else cloud.checked = true;
