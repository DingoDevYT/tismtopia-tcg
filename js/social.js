// Social: profile pictures, the Social tab (other Tismtopia players), public profile pages, display stands and reactions.
// Your own picture, stands and Captain play counts live in the save (store keys pfp, showcase, capPlays; checked by cleanSave in
// js/cloud.js) and are published to your Supabase profiles row (pfp, showcase, summary) for other members. Tables: supabase/schema.sql.
// shortcut: whether you own the cards on your stands / your picture is checked here on the client only (friends' server).

// ---------------- pure helpers (also used by cleanSave in js/cloud.js and by test/game.test.js) ----------------
const SO_EMOJI = ['🔥', '😍', '😂', '🤯', '👏', '🥺'];
const STANDS = { ped: { name: 'Pedestal', n: 1, icon: 'award' }, shelf: { name: 'Shelf', n: 3, icon: 'cards_fan' }, wall: { name: 'Wall', n: 5, icon: 'cards_collection' } };
const SO_MAX_STANDS = 4, SO_FINS = ['normal', 'holo', 'rev', 'full', 'rainbow'];
const soCardId = id => typeof id === 'string' && /^[a-z0-9_]{1,64}$/.test(id);
const soLater = id => /^community_[0-9a-f]{8}$/.test(id); // a community card: it may not have loaded yet (js/community.js), so keep it
// A profile picture is a Captain or a Character card (shown as its full art).
const pfpOk = id => soCardId(id) && (CARD[id] ? CARD[id].type === 'captain' || CARD[id].type === 'character' : soLater(id));
// Stands: [{ id, kind: 'ped' | 'shelf' | 'wall', cards: [card id | null] (as many as the kind holds), fins?: [finish | null] (published copies) }].
// Untrusted input -> a clean copy, or null when its shape is wrong. Unknown cards become empty slots.
function cleanStands(v) {
  if (!Array.isArray(v) || v.length > SO_MAX_STANDS) return null;
  const out = [];
  for (const s of v) {
    const S = s && typeof s === 'object' && !Array.isArray(s) && Object.hasOwn(STANDS, s.kind) ? STANDS[s.kind] : null;
    if (!S || typeof s.id !== 'string' || !/^[a-z0-9]{1,12}$/.test(s.id) || out.some(o => o.id === s.id)
      || !Array.isArray(s.cards) || s.cards.length !== S.n || !s.cards.every(c => c === null || soCardId(c))) return null;
    const cards = s.cards.map(c => { c = c && (REPLACED[c] || c); return c && (CARD[c] ? CARD[c].type !== 'captain' : soLater(c)) ? c : null; });
    const st = { id: s.id, kind: s.kind, cards };
    if (s.fins !== undefined) { if (!Array.isArray(s.fins) || s.fins.length !== S.n) return null; st.fins = s.fins.map(f => (SO_FINS.includes(f) ? f : null)); }
    out.push(st);
  }
  return out;
}
// Captain plays { captainId: battles }: null when the shape is wrong; ids that aren't Captains are dropped.
function cleanCapPlays(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length > 50) return null;
  if (!Object.values(v).every(n => Number.isInteger(n) && n >= 0 && n <= 1e7)) return null;
  return Object.fromEntries(Object.entries(v).filter(([id]) => CARD[id]?.type === 'captain'));
}
const favCap = cp => Object.entries(cp || {}).filter(([id, n]) => CARD[id] && n > 0).sort((a, b) => b[1] - a[1])[0] || null; // [id, plays], most played
// Collection progress: different cards owned out of every card in packs, and how many different cards you have as full art, rainbow, holo.
const collStats = cl => {
  const o = { own: 0, total: CARDS.length, full: 0, rb: 0, holo: 0 };
  for (const c of CARDS) { const e = cl?.[c.id]; if (!(e?.n > 0)) continue; o.own++; if (e.f?.full > 0) o.full++; if (e.f?.rainbow > 0) o.rb++; if (e.f?.holo > 0) o.holo++; }
  return o;
};

// ---------------- browser only ----------------
let soPfp = store.get('pfp', null), soStands = cleanStands(store.get('showcase', [])) || [];
const so = { list: null, at: 0, busy: false, rx: {}, rxAt: {}, rxBusy: {}, pubTimer: 0, dropped: false };
const soIc = (n, cls = '') => `<i class="gi ${cls}" style="--m:url(art/icons/${n}.svg)" aria-hidden="true"></i>`;
const fullOwned = id => CARD[id]?.type === 'character' && (coll[id]?.f?.full > 0 || coll[id]?.f?.rainbow > 0);
// Your picture: what you picked if you still can use it, else your current deck's Captain (what showed before pictures existed).
const myPfp = () => (pfpOk(soPfp) && CARD[soPfp] && (CARD[soPfp].type === 'captain' || fullOwned(soPfp)) ? soPfp : deck().captain || CAPTAINS[0].id);
// Any id -> a round avatar. Characters show their full-art crop (a 5★ rainbow shows as the plain full art). Unknown -> the first Captain.
function pfpAvatar(id, cls = '') {
  const c = CARD[id];
  if (c?.type !== 'character') return renderAvatar(c?.type === 'captain' ? c : CAPTAINS[0], cls);
  return `<span class="avatar fa${cls}">${ICON.character}${c.art ? `<img ${assetSrc(c.art)} alt="" onerror="this.remove()"${cropStyle(c.cropFull)}>` : ''}</span>`;
}
// A card in a given finish, drawn like the collection draws it.
const soCard = (id, f, cls = '', attrs = '') => { const c = CARD[id], fin = SO_FINS.includes(f) ? f : 'normal';
  return renderCard(fin === 'full' || fin === 'rainbow' ? { ...c, crop: null } : c, { cls: `${cls} ${FINISH_CLS[fin] || ''}`, attrs }); };

const mySummary = () => {
  const st = store.get('stats', {});
  return { name: myName, w: (st.botWon || 0) + (st.pvpWon || 0), g: (st.botPlayed || 0) + (st.pvpPlayed || 0), cap: cleanCapPlays(store.get('capPlays', {})) || {}, ...collStats(coll), ...(typeof rkMine === 'function' ? rkMine() : {}) }; // r, rg: ranked rating and games (js/ranked.js)
};
// What visitors see: cards you no longer own drop out, each slot carries your best finish of it.
const myShowcase = () => soStands.map(s => { const cards = s.cards.map(id => (id && owned(id) ? id : null)); return { id: s.id, kind: s.kind, cards, fins: cards.map(id => (id ? bestFinish(id) : null)) }; });
const myRow = () => ({ id: cloud.user?.id || 'me', mine: true, name: myName, pfp: myPfp(), showcase: myShowcase(), summary: mySummary() });
// A profiles row from the server is untrusted: every field is checked before it is drawn.
function soRow(r) {
  const sm = r.summary && typeof r.summary === 'object' && !Array.isArray(r.summary) ? r.summary : {}, n = v => (Number.isInteger(v) && v >= 0 ? Math.min(v, 1e7) : 0);
  return { id: r.id, mine: !!cloud.user && r.id === cloud.user.id, name: String(sm.name || r.name || 'Player').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 22) || 'Player',
    pfp: pfpOk(r.pfp) && CARD[r.pfp] ? r.pfp : null, showcase: cleanStands(r.showcase) || [],
    summary: { w: n(sm.w), g: n(sm.g), cap: cleanCapPlays(sm.cap) || {}, own: n(sm.own), total: n(sm.total) || CARDS.length, full: n(sm.full), rb: n(sm.rb), holo: n(sm.holo), ...(Number.isInteger(sm.r) && sm.r >= 0 && sm.r <= 5000 ? { r: sm.r, rg: n(sm.rg) } : { r: 0, rg: 0 }) } }; // r, rg: ranked rating and games (no badge without a valid rating)
}
const soAv = r => r.pfp || favCap(r.summary.cap)?.[0] || CAPTAINS[0].id;

// ---------- cloud: the player list, reactions, publishing your own row ----------
async function soLoad() {
  if (so.busy || !cloud.user) return;
  so.busy = true;
  const r = await sbRun('Loading players', async sb => ({ rows: need(await sb.from('profiles').select('id, name, pfp, showcase, summary, updated_at').order('updated_at', { ascending: false }).limit(500)) }));
  so.busy = false; so.at = Date.now();
  so.list = r.ok ? r.rows.map(soRow) : so.list || [];
  if (['social', 'player'].includes(ui.view)) render();
}
async function soLoadRx(owner) {
  if (!cloud.user || so.rxBusy[owner] || Date.now() - (so.rxAt[owner] || 0) < 30000) return;
  so.rxBusy[owner] = true;
  const r = await sbRun('Loading reactions', async sb => ({ rows: need(await sb.from('reactions').select('stand, emoji, reactor').eq('owner', owner).limit(2000)) }));
  so.rxBusy[owner] = false; so.rxAt[owner] = Date.now();
  if (r.ok) {
    const rx = { count: {}, mine: {} };
    for (const x of r.rows) { if (!SO_EMOJI.includes(x.emoji)) continue; const c = (rx.count[x.stand] ||= {}); c[x.emoji] = (c[x.emoji] || 0) + 1; if (x.reactor === cloud.user?.id) rx.mine[x.stand] = x.emoji; }
    so.rx[owner] = rx;
  }
  if (ui.view === 'player') render();
}
// One reaction per visitor per stand: tap the same emoji again to take it back, another one to switch.
async function soReact(owner, stand, e) {
  const rx = so.rx[owner], me = cloud.user?.id; if (!rx || !me || owner === me) return;
  const was = rx.mine[stand], c = (rx.count[stand] ||= {});
  if (was) c[was]--;
  if (was === e) delete rx.mine[stand]; else { c[e] = (c[e] || 0) + 1; rx.mine[stand] = e; }
  ui.soPop = null; render(); // shows straight away; the reload below puts in the real counts
  await sbRun('Reacting', async sb => {
    const q = () => sb.from('reactions'), mine = x => x.eq('owner', owner).eq('stand', stand).eq('reactor', me);
    if (was === e) need(await mine(q().delete()));
    else if (was) need(await mine(q().update({ emoji: e })));
    else need(await q().insert({ owner, stand, reactor: me, emoji: e }));
    return {};
  });
  so.rxAt[owner] = 0; soLoadRx(owner);
}
// Your picture, stands and summary go to your profiles row (when they change, and after every cloud save).
async function soPublish() {
  clearTimeout(so.pubTimer); so.pubTimer = 0;
  const u = cloud.user; if (!u) return;
  const show = myShowcase(), drop = so.dropped; so.dropped = false;
  const r = await sbRun('Updating your profile', async sb => {
    need(await sb.from('profiles').upsert({ id: u.id, pfp: myPfp(), showcase: show, summary: mySummary() }));
    if (drop) { const del = sb.from('reactions').delete().eq('owner', u.id); need(await (show.length ? del.not('stand', 'in', `(${show.map(s => s.id).join(',')})`) : del)); } // reactions on removed stands
    return {};
  });
  if (!r.ok && drop) so.dropped = true;
  if (r.ok && so.list) so.list = so.list.filter(x => x.id !== u.id).concat(soRow({ id: u.id, pfp: myPfp(), showcase: show, summary: mySummary() }));
}
const soPublishSoon = () => { clearTimeout(so.pubTimer); so.pubTimer = setTimeout(soPublish, 1500); };
const cloudSaveNoSocial = cloudSaveGame;
cloudSaveGame = async (...a) => { const r = await cloudSaveNoSocial(...a); if (r.ok) soPublish(); return r; };

// ---------- Social tab ----------
const soSignedOut = () => {
  const [t, p, b, a] = !CLOUD.url ? ['Accounts are coming soon', 'Other players show up here once accounts are switched on.', '', '']
    : !cloud.checked ? ['', 'Checking your account… <span class="spin"></span>', '', '']
    : cloud.block ? ['Cloud features are paused', 'Open Profile to sign in again, then other players show up here.', 'Open Profile', 'profile']
    : ['Sign in to see other players', 'Sign in with Discord to find other Tismtopia players, visit their profiles and react to their display stands.', 'Sign in with Discord', 'cloud-in'];
  return `<section class="panel neu so-empty">${soIc('user-group', 'so-big')}${t ? `<h3>${t}</h3>` : ''}<p class="muted">${p}</p>${b ? `<button class="btn primary wide" data-act="${a}">${b}</button>` : ''}
    <button class="btn wide" data-act="so-open" data-id="me">See your own profile</button></section>`;
};
const soPRow = r => { const fav = favCap(r.summary.cap);
  return `<button class="prow neu${r.mine ? ' me' : ''}" data-act="so-open" data-id="${r.mine ? 'me' : esc(r.id)}">${pfpAvatar(soAv(r), ' md')}
    <span class="who"><b>${esc(r.name)}${r.mine ? ' <small>(you)</small>' : ''}</b><span class="rk-slot">${r.summary.rg && typeof rkChip === 'function' ? rkChip(r.summary.r) : ''}</span><small>${r.summary.w} wins · ${r.summary.own} cards</small></span>
    ${fav ? `<span class="favc">${pfpAvatar(fav[0], ' sm')}<small>${esc(CARD[fav[0]].name)}</small></span>` : ''}</button>`; }; // rk-slot: the rank badge (js/ranked.js), once they have played ranked

function viewSocial() {
  let body;
  if (!cloud.user) body = soSignedOut();
  else {
    if (!so.busy && (!so.list || Date.now() - so.at > 60000)) soLoad();
    const q = (ui.soQ || '').trim().toLowerCase(), list = [myRow(), ...(so.list || []).filter(r => !r.mine)].filter(r => !q || r.name.toLowerCase().includes(q));
    body = `<div class="so-search">${ICON.search}<input id="so-search" type="search" placeholder="Search players" autocomplete="off" value="${esc(ui.soQ || '')}" aria-label="Search players"></div>
      <div class="lbl2">${soIc('user-group')}Players${so.list ? ` · ${so.list.filter(r => !r.mine).length + 1}` : ''}</div>
      <div class="plist">${list.map(soPRow).join('') || '<p class="muted center">No players match.</p>'}${so.list ? '' : '<p class="muted center">Loading players… <span class="spin"></span></p>'}</div>`;
  }
  return `${header('Social')}<div class="so-wrap">${body}</div>${tabbar('social')}${soSheetHtml()}`;
}

// ---------- a player's profile (yours too, with the edit buttons) ----------
function soStand(st, r) {
  const S = STANDS[st.kind], cls = st.kind === 'ped' ? '' : 'mini', cards = st.cards.map((id, i) => (id && CARD[id] ? soCard(id, st.fins?.[i], cls) : '')).filter(Boolean);
  if (!cards.length) return '';
  const art = st.kind === 'ped' ? `<div class="ped">${cards[0]}<div class="ped-base"></div></div>` : st.kind === 'shelf' ? `<div class="shelf">${cards.join('')}</div><div class="ledge"></div>` : `<div class="wall">${cards.join('')}</div>`;
  const rx = so.rx[r.id] || { count: {}, mine: {} }, can = !!cloud.user && !r.mine, mine = rx.mine[st.id];
  const chips = SO_EMOJI.map(e => [e, rx.count[st.id]?.[e] || 0]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    .map(([e, n]) => `<button class="rx${e === mine ? ' on' : ''}" ${can ? `data-act="so-rx" data-st="${st.id}" data-e="${e}"` : 'disabled'} aria-label="${e} ${n}"><span class="e">${e}</span>${n}</button>`).join('');
  const pop = ui.soPop === st.id ? `<div class="rx-pop">${SO_EMOJI.map(e => `<button class="${e === mine ? 'on' : ''}" data-act="so-rx" data-st="${st.id}" data-e="${e}" aria-label="React ${e}">${e}</button>`).join('')}</div>` : '';
  return `<section class="stand neu"><div class="stand-h">${soIc(S.icon)}${S.name}<small>${cards.length} card${cards.length > 1 ? 's' : ''}</small></div>${art}
    <div class="rxrow">${chips}${can ? `<button class="rx-add" data-act="so-pop" data-st="${st.id}"><span class="e">🙂</span>+ React</button>${pop}` : !chips ? '<small class="muted">No reactions yet</small>' : ''}</div></section>`;
}
function viewPlayer() {
  const r = ui.soId === 'me' ? myRow() : so.list?.find(x => x.id === ui.soId);
  if (!r) { ui.view = 'social'; return viewSocial(); }
  if (cloud.user && r.id !== 'me') soLoadRx(r.id);
  const s = r.summary, fav = favCap(s.cap), pct = s.g ? Math.round((100 * s.w) / s.g) : 0, stands = r.showcase.map(st => soStand(st, r)).filter(Boolean);
  const av = pfpAvatar(soAv(r), ' xl');
  return `${header(r.mine ? 'Your profile' : 'Player')}<div class="so-wrap">
    <div class="so-nav"><button class="btn sm" data-act="so-back">‹ ${ui.soBack === 'profile' ? 'Profile' : 'Social'}</button>${r.mine ? `<button class="btn sm" data-act="so-edit">${soIc('cards_collection')}Edit showcase</button>` : ''}</div>
    <section class="neu pp-head"><div class="pp-top">${r.mine ? `<button class="pf-pfp" data-act="pfp-open" aria-label="Change your profile picture">${av}<span class="pf-pfp-tag">Change</span></button>` : av}
      <div class="nm"><b>${esc(r.name)}</b><span class="rk-slot">${r.summary.rg && typeof rkProfile === 'function' ? rkProfile(r.summary.r, r.summary.rg) : ''}</span></div></div>
      <div class="statrow"><div><b>${soIc('trophy')}${s.w}</b><small>Wins</small></div><div><b>${s.g}</b><small>Games</small></div><div><b>${pct}%</b><small>Win rate</small></div></div></section>
    <section class="panel neu"><small class="lbl">Favourite Captain</small>${fav ? `<div class="favcap">${pfpAvatar(fav[0], ' md')}<div><b>${esc(CARD[fav[0]].name)}</b><small>${esc(CARD[fav[0]].style || 'Captain')} · ${fav[1]} of ${s.g} game${s.g === 1 ? '' : 's'}</small></div><span class="pin">Most played</span></div>` : '<p class="muted">No battles yet.</p>'}</section>
    <section class="panel neu so-coll"><small class="lbl">Collection</small>
      <div class="num"><span><b>${s.own}</b> / ${s.total} cards</span><small>${s.total ? Math.round((100 * s.own) / s.total) : 0}%</small></div>
      <div class="progress"><i style="width:${s.total ? Math.min(100, (100 * s.own) / s.total).toFixed(1) : 0}%"></i></div>
      <div class="fchips"><span class="chip">4★ Full art <b>${s.full}</b></span><span class="chip"><span class="rbw">5★ Rainbow</span> <b>${s.rb}</b></span><span class="chip">Holo <b>${s.holo}</b></span></div></section>
    <div class="lbl2">${soIc('award')}Display stands · ${stands.length}</div>
    ${stands.join('') || `<p class="muted center so-none">${r.mine ? 'Nothing on show yet. Tap Edit showcase to put your best cards on stands.' : 'Nothing on show yet.'}</p>`}
  </div>${tabbar('social')}${soSheetHtml()}`;
}

// ---------- edit my showcase ----------
function viewShowcase() {
  const pk = ui.soSheet === 'pick' ? ui.soPick : null;
  const stands = soStands.map((s, i) => { const S = STANDS[s.kind], filled = s.cards.filter(id => id && owned(id)).length;
    const slots = s.cards.map((id, k) => (id && owned(id) ? `<div class="slotwrap">${soCard(id, bestFinish(id), 'mini', tappable('so-slot', `data-i="${i}" data-k="${k}" aria-label="Change this card"`))}<button class="sx" data-act="so-clear" data-i="${i}" data-k="${k}" aria-label="Empty this slot">${soIc('cross')}</button></div>`
      : `<button class="eslot${pk?.i === i && pk?.k === k ? ' picking' : ''}" data-act="so-slot" data-i="${i}" data-k="${k}" aria-label="Pick a card">${soIc('plus')}${S.n < 5 ? 'Add' : ''}</button>`)).join('');
    return `<section class="ed-stand neu"><div class="ed-h">${soIc(S.icon)}${S.name} <small>${S.n} card${S.n > 1 ? 's' : ''} · ${filled ? `${filled} filled` : 'empty'}</small>
      <span class="ed-tools"><button class="ed-b" data-act="so-move" data-i="${i}" data-d="-1"${i ? '' : ' disabled'} aria-label="Move up">▲</button><button class="ed-b" data-act="so-move" data-i="${i}" data-d="1"${i < soStands.length - 1 ? '' : ' disabled'} aria-label="Move down">▼</button><button class="ed-b" data-act="so-del" data-i="${i}" aria-label="Remove this stand">${soIc('cross')}</button></span></div>
      <div class="slots s${S.n}">${slots}</div></section>`; }).join('');
  const add = soStands.length < SO_MAX_STANDS ? `<section class="ed-stand neu"><div class="ed-h">Add a stand <small class="so-used">${soStands.length} of ${SO_MAX_STANDS} used</small></div>
    <div class="addst">${Object.entries(STANDS).map(([k, S]) => `<button class="btn" data-act="so-add" data-k="${k}">${soIc(S.icon)}${S.name}<small>${S.n} card${S.n > 1 ? 's' : ''}</small></button>`).join('')}</div></section>` : '';
  return `${header('My showcase')}<div class="so-wrap">
    <div class="so-nav"><button class="btn sm" data-act="so-edit-done">‹ Profile</button><button class="btn sm primary" data-act="so-edit-done">Done</button></div>
    <p class="hint">Tap a slot to put one of your cards on it. ▲ ▼ move a stand: visitors see them top to bottom.</p>${stands}${add}</div>${tabbar('social')}${soSheetHtml()}`;
}

// ---------- sheets: profile picture picker, card picker ----------
function soSheetHtml() {
  const wrap = h => `<div class="dim so-dim" data-act="so-close"></div><div class="sheet so-sheet"><div class="grab"></div>${h}</div>`;
  if (ui.soSheet === 'pfp') {
    const sel = ui.soSel || myPfp(), c = CARD[sel], fulls = CARDS.filter(x => fullOwned(x.id));
    const it = (id, tag = '') => `<button class="ap-it${id === sel ? ' on' : ''}" data-act="so-pfp-sel" data-id="${id}" aria-label="${esc(CARD[id].name)}">${pfpAvatar(id)}${tag}<span>${esc(CARD[id].name)}</span></button>`;
    return wrap(`<h2>Profile picture</h2>
      <div class="ap-now neu-in">${pfpAvatar(sel, ' lg')}<div><b>${esc(c.name)}</b><small>${c.type === 'captain' ? 'Captain' : 'Full art'} · shown on Home, Social and in battles</small></div></div>
      <h4>Captains <small>${CAPTAINS.length}</small></h4><div class="ap-grid">${CAPTAINS.map(x => it(x.id)).join('')}</div>
      <h4>Your full arts <small>${fulls.length} owned</small></h4>
      ${fulls.length ? `<div class="ap-grid">${fulls.map(x => it(x.id, coll[x.id].f.rainbow > 0 ? '<span class="st rb">5★</span>' : '<span class="st">4★</span>')).join('')}</div>` : '<p class="muted center">Pull a 4★ full art or a 5★ rainbow to use it here.</p>'}
      <div class="row2 so-foot"><button class="btn" data-act="so-close">Cancel</button><button class="btn primary" data-act="so-pfp-save">Save</button></div>`);
  }
  if (ui.soSheet === 'pick' && ui.soPick && soStands[ui.soPick.i]) {
    const { i, k } = ui.soPick, S = STANDS[soStands[i].kind], f = ui.soPickF || 'all', onShow = new Set(soStands.flatMap(s => s.cards).filter(Boolean));
    const mine = CARDS.filter(c => owned(c.id)).sort((a, b) => starN(b.id, bestFinish(b.id)) - starN(a.id, bestFinish(a.id)) || a.no.localeCompare(b.no));
    const groups = { all: ['All', () => true], full: ['Full art', id => ['full', 'rainbow'].includes(bestFinish(id))], holo: ['Holo', id => bestFinish(id) === 'holo'], rev: ['Reverse', id => bestFinish(id) === 'rev'] };
    const list = mine.filter(c => groups[f][1](c.id));
    return wrap(`<h2>Pick a card · ${S.name}${S.n > 1 ? `, slot ${k + 1}` : ''}</h2>
      <div class="chips so-chips">${Object.entries(groups).map(([g, [label, t]]) => `<button class="chip${g === f ? ' on' : ''}" data-act="so-pick-f" data-f="${g}">${label} ${mine.filter(c => t(c.id)).length}</button>`).join('')}</div>
      <div class="pk-grid">${list.map(c => `<button class="pk${onShow.has(c.id) ? ' used' : ''}" data-act="so-put" data-id="${c.id}" aria-label="${esc(c.name)}">${soCard(c.id, bestFinish(c.id), 'mini')}<small>${starsOf(c.id, bestFinish(c.id))} ${esc(c.name)}</small></button>`).join('') || '<p class="muted center">No cards here yet.</p>'}</div>
      <div class="row2 so-foot"><button class="btn" data-act="so-clear" data-i="${i}" data-k="${k}">Leave empty</button><button class="btn" data-act="so-close">Cancel</button></div>`);
  }
  return '';
}

const soSave = () => { store.set('showcase', soStands); soPublishSoon(); };
const soNewId = () => { let id; do id = uid().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'st'; while (soStands.some(s => s.id === id)); return id; };
Object.assign(ACTS, {
  'so-open'(d) {
    if (d.id !== 'me' && !so.list?.some(x => x.id === d.id)) return;
    if (!['player', 'showcase'].includes(ui.view)) ui.soBack = ui.view === 'profile' ? 'profile' : 'social';
    ui.soId = d.id; ui.view = 'player'; ui.soPop = null; ui.soSheet = null; $app.scrollTop = 0;
  },
  'so-back'() { ui.view = ui.soBack === 'profile' ? 'profile' : 'social'; ui.soPop = null; },
  'so-edit'() { ui.view = 'showcase'; ui.soSheet = null; },
  'so-edit-done'() { ui.view = 'player'; ui.soId = 'me'; ui.soSheet = null; },
  'so-pop'(d) { ui.soPop = ui.soPop === d.st ? null : d.st; },
  'so-rx'(d) { const r = ui.view === 'player' && ui.soId !== 'me' && so.list?.find(x => x.id === ui.soId);
    if (r && SO_EMOJI.includes(d.e) && r.showcase.some(s => s.id === d.st)) soReact(r.id, d.st, d.e); return false; },
  'pfp-open'() { ui.soSheet = 'pfp'; ui.soSel = myPfp(); },
  'so-pfp-sel'(d) { if (pfpOk(d.id) && CARD[d.id]) ui.soSel = d.id; },
  'so-pfp-save'() { const id = ui.soSel; if (id && (CARD[id]?.type === 'captain' || fullOwned(id))) { soPfp = id; store.set('pfp', id); soPublishSoon(); } ui.soSheet = null; },
  'so-close'() { ui.soSheet = null; ui.soPick = null; },
  'so-add'(d) { if (soStands.length >= SO_MAX_STANDS || !Object.hasOwn(STANDS, d.k)) return; soStands.push({ id: soNewId(), kind: d.k, cards: Array(STANDS[d.k].n).fill(null) }); soSave(); },
  'so-del'(d) { const s = soStands[+d.i]; if (!s) return; if (s.cards.some(Boolean) && !confirm(`Remove this ${STANDS[s.kind].name.toLowerCase()} and its reactions?`)) return;
    soStands.splice(+d.i, 1); so.dropped = true; soSave(); },
  'so-move'(d) { const i = +d.i, j = i + Number(d.d); if (!soStands[i] || !soStands[j]) return; [soStands[i], soStands[j]] = [soStands[j], soStands[i]]; soSave(); },
  'so-slot'(d) { if (!soStands[+d.i]) return; ui.soPick = { i: +d.i, k: +d.k }; ui.soSheet = 'pick'; },
  'so-pick-f'(d) { ui.soPickF = d.f; },
  'so-clear'(d) { const s = soStands[+d.i]; if (s && +d.k < s.cards.length) { s.cards[+d.k] = null; soSave(); } ui.soSheet = null; ui.soPick = null; },
  'so-put'(d) {
    const p = ui.soPick, s = p && soStands[p.i]; if (!s || !owned(d.id)) return;
    for (const t of soStands) t.cards = t.cards.map(id => (id === d.id ? null : id)); // a card is on show once: picking it again moves it here
    s.cards[p.k] = d.id; soSave(); ui.soSheet = null; ui.soPick = null;
  },
});
const soActProfile = ACTS.profile;
ACTS.profile = d => { ui.soSheet = null; return soActProfile(d); };
document.addEventListener('input', e => { if (e.target.id === 'so-search') { ui.soQ = e.target.value; const at = e.target.selectionStart; render(); document.getElementById('so-search')?.setSelectionRange(at, at); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && (ui.soSheet || ui.soPop)) { ui.soSheet = ui.soPick = ui.soPop = null; render(); } });
// Profile: the picture opens the picker (the sheet is drawn on top of the Profile screen).
const renderNoSocial = render;
render = function () {
  if (!['profile', 'social', 'player', 'showcase'].includes(ui.view)) ui.soSheet = null;
  renderNoSocial();
  if (ui.view === 'profile' && ui.soSheet === 'pfp') $app.insertAdjacentHTML('beforeend', soSheetHtml());
};
render(); // the account corner picks up your picture
