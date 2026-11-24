// ===================== .tismcard.json payload, version 1 =====================
// The downloaded card file and the cloud submission use this same object. To read an untrusted file call cfRead(obj) from
// js/cardfile.js: it rejects anything without kind 'tismcard' and v 1, clamps `form`, REBUILDS `card` from it (the file's own
// `card` is never trusted), and keeps image/cutout only if they are data:image/(png|jpeg|webp);base64 URLs.
// {
//   v: 1,                                   number, format version
//   kind: 'tismcard',                       string, always this
//   created: '2026-11-24T12:00:00.000Z',    ISO time the file was made
//   form: {                                 what the player picked; every value is clamped by cfClean()
//     type: 'character' | 'bit' | 'evil',   (bit = Item; Captains can't be submitted)
//     name: string <= 22, credit: string <= 30 ("whose OC is this"), notes: string <= 300 (to the reviewer),
//     hp, def                               Characters, stored like cards-data.js; the player picks what the card prints:
//                                         hp is the lowest value whose maxHp() is the chosen printed HP (today hp 1-6 = printed 1, 2, 4, 5, 6, 7),
//                                         def is the lowest DEF for the chosen armour (8 = armour 0, 12 = 1, 15 = 2)
//     cost: 0-3                             Actions to play (Evils 1-3)
//     dur: 0-3                              Items: 0 = Instant, 1-3 = lasts that many turns; 0 for the others
//     fx: { trig, eff, n }                  the card's one effect (a Character's optional passive):
//         trig: '' (none) | 'play' | 'hit' (whenever this lands a hit) | 'turn' (start of your turn) | 'passive'
//         eff:  'goof' (+n Creativity) | 'bore' (opponent +n Boredom) | 'calm' (your Boredom -n) | 'draw' | 'act' (+n Actions)
//               | 'heal' (self, on a hit) | 'atk' | 'def' | 'tax' (opponent's attacks cost n more; these three are passive only) | ''
//         n: 1-3
//     moves: [ { name: string <= 20, cost: 1-3, ability: bool, power: printed damage, 2-6 like the real cards (ignored for abilities),
//                eff: '' | 'goof'|'bore'|'calm'|'draw'|'act'|'heal'|'dmg' (dmg = n more damage to the blocker, attacks only), n: 1-3 } ]
//                                         1-2 moves, Characters only (Items/Evils carry one default move that is ignored)
//     fins: { holo, rev, full, rainbow }    booleans: finishes the player allows (all false for Items/Evils; normal is always allowed)
//     crop: { x: 0-100, y: 0-100, zoom: 1-4 }   art crop for normal / holo / reverse holo
//     cropFull: { x, y, zoom }              art crop for full art / rainbow
//     anyway: bool                          ticked "Submit anyway" on a Too strong card
//   },
//   card: { ... }                           game card in the js/cards-data.js shape built from form by cfBuild():
//         id 'sub_<name>', type, name, cost, hp, def, text, moves [{ name, cost, power | ability: true, text, onHit | ops }],
//         one of onPlay | onBreak | onTurnStart | mod, dur (Items), artist (= credit), crop, cropFull, finishes ['normal', ...]
//   bg: { tpl: 'glow'|'rays'|'stars'|'dots'|'sky'|'flames'|'grid'|'plain', tint: '#rrggbb' } | null
//                                         background template drawn behind a transparent cut-out (null = the art's own background)
//   image: 'data:image/webp;base64,...'     the art as shown on the card (background composited in), <= 700 px wide ('' = none;
//                                         png/jpeg where the browser can't encode webp)
//   cutout: 'data:image/webp;base64,...'    the transparent character on its own, same size ('' when the art has its own background)
// }
// Cloud: the `submissions` row holds card = this object with image/cutout replaced by storage paths ('<uid>/<uuid>.webp'),
// image_path = the image's path, note = form.notes. Pictures live in the private `submissions` bucket.
// Example (image shortened):
// {"v":1,"kind":"tismcard","created":"2026-11-24T12:00:00.000Z",
//  "form":{"type":"character","name":"Bee Boy","credit":"the jangle jingler","notes":"","hp":4,"def":12,"cost":1,"dur":0,
//   "fx":{"trig":"play","eff":"goof","n":1},"moves":[{"name":"Bonk","cost":1,"ability":false,"power":2,"eff":"","n":1},
//   {"name":"Big Bonk","cost":2,"ability":false,"power":4,"eff":"bore","n":1}],"fins":{"holo":true,"rev":false,"full":false,"rainbow":true},
//   "crop":{"x":50,"y":30,"zoom":1.4},"cropFull":{"x":50,"y":50,"zoom":1},"anyway":false},
//  "card":{"id":"sub_bee_boy","type":"character","name":"Bee Boy","cost":1,"onPlay":[["goof","me",1]],"hp":4,"def":12,
//   "text":"When played: +1 Creativity.","moves":[{"name":"Bonk","cost":1,"power":2},{"name":"Big Bonk","cost":2,"power":4,
//   "onHit":[["bore","opp",1]],"text":"On a hit, opponent +1 Boredom."}],"artist":"the jangle jingler",
//   "crop":{"x":50,"y":30,"zoom":1.4},"cropFull":{"x":50,"y":50,"zoom":1},"finishes":["normal","holo","rainbow"]},
//  "bg":{"tpl":"rays","tint":"#e5535d"},"image":"data:image/webp;base64,UklGR...","cutout":"data:image/webp;base64,UklGR..."}
// ============================================================================

// Submit a Card: a card builder with a live preview (the real renderCard), saved as a draft on this device as you go.
// sub = the draft being edited: { form (raw inputs; cfClean() tidies them), art: { src (data URL of the shrunk upload), transparent, removed, tol, bg } | null,
//   edit: { id, name, image, cutout, artChanged } when it's one of the player's pending submissions loaded back in (the draft from before is stashed) }.
// subArt = what's worked out from art in memory: canvases, blobs and object URLs (only the upload itself is stored, everything else is redone on load).
let sub = null;
const subArt = { src: null, cut: null, out: null, blob: null, cutBlob: null, url: '', cutUrl: '', tint: '', thumbs: {}, job: 0, busy: false, warned: false };
const subTouched = new Set(), subUrls = {}; // subUrls: storage path -> signed link for the player's submitted pictures
let subSaveT = 0, subT = 0;
const SUB_DRAFT = 'tismtopia.submitDraft', SUB_STASH = 'tismtopia.submitStash', IMG_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function subLoad() {
  let d = null; try { d = JSON.parse(localStorage.getItem(SUB_DRAFT)); } catch { /* no draft */ }
  const a = d?.art, e = d?.edit;
  sub = { form: cfClean(d?.form || { moves: [{ cost: 1, power: 2 }, { cost: 2, power: 4 }] }),
    art: a && typeof a.src === 'string' && IMG_URL.test(a.src) ? { src: a.src, transparent: a.transparent === true, removed: a.removed === true, tol: cfInt(a.tol, 10, 150, 60), bg: cfBg(a.bg) } : null,
    edit: e && UUID.test(e.id) ? { id: e.id, name: cfStr(e.name, 22), image: cfStr(e.image, 200), cutout: cfStr(e.cutout, 200), artChanged: e.artChanged === true } : null };
  if (sub.art) atLoad(sub.art.src).then(cv => { subArt.src = cv; subRebuild(true); }, () => { sub.art = null; render(); });
}
// Autosave (debounced; now = straight away). A full device gets the draft without its picture rather than nothing.
function subSave(now) {
  clearTimeout(subSaveT);
  const go = () => {
    if (!sub) return;
    const put = v => { try { localStorage.setItem(SUB_DRAFT, JSON.stringify(v)); return true; } catch { return false; } };
    if (!put(sub) && sub.art && put({ ...sub, art: null }) && !subArt.warned) { subArt.warned = true; toast('Draft saved without the picture: this device is out of storage.'); }
  };
  if (now) go(); else subSaveT = setTimeout(go, 400);
}
const subArtTouched = () => { if (sub?.edit) sub.edit.artChanged = true; }; // an edited submission re-uploads its picture only after this

// Cut-out and composite from the art settings. Heavy canvas work, so it runs after the tap has been drawn; quiet = don't redraw the form (a slider is being dragged).
function subRebuild(full, quiet) {
  const job = ++subArt.job; subArt.busy = true;
  if (full) render();
  setTimeout(async () => {
    const a = sub?.art; if (!a || !subArt.src) return;
    let cut = a.transparent ? subArt.src : a.removed ? atRemove(subArt.src, a.tol) : null;
    if (a.removed && !cut) { a.removed = false; quiet = false; subSave(); toast("Couldn't find a plain background on this picture."); }
    if (cut && !subArt.tint) subArt.tint = atTint(cut);
    const out = cut && a.bg ? atCompose(cut, atBg(a.bg.tpl, a.bg.tint, cut.width, cut.height)) : cut || subArt.src;
    const [blob, cutBlob] = await Promise.all([atBlob(out, !!cut && !a.bg), cut ? atBlob(cut, true) : null]);
    if (job !== subArt.job) return; // a newer change is already being worked on
    URL.revokeObjectURL(subArt.url); if (subArt.cutUrl) URL.revokeObjectURL(subArt.cutUrl);
    Object.assign(subArt, { cut, out, blob, cutBlob, url: URL.createObjectURL(blob), cutUrl: cutBlob ? URL.createObjectURL(cutBlob) : '', busy: false });
    if (ui.view !== 'submit') return;
    if (!quiet) return render();
    subPaint(); const img = $app.querySelector('.sub-cut img'); if (img) img.src = subArt.cutUrl;
  }, 30);
}
async function subPick(file) {
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return toast('Pick a PNG, JPG or WebP picture.');
  if (file.size > 5 * 1048576) return toast('That picture is over 5 MB.');
  let cv; try { cv = await atLoad(file); } catch { return toast("Couldn't read that picture."); }
  const transparent = atAlpha(cv) >= 0.03;
  Object.assign(subArt, { src: cv, tint: '' });
  sub.art = { src: await atDataUrl(await atBlob(cv, transparent)), transparent, removed: false, tol: 60, bg: null };
  subArtTouched(); subSave(); subRebuild(true);
}

// ---------- My submissions: list, read-only viewer, edit and withdraw (pending only) ----------
const SUB_STATUS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
const subStatus = r => (SUB_STATUS[r.status] ? r.status : 'pending');
const subRow = id => ui.subList?.find(r => r.id === id);
const subWhen = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleDateString(); };
// A stored submission is the player's own data but still untrusted: the card is rebuilt from its clamped form, the picture link checked.
function subRowCard(r, fin = 'normal', cls = '') {
  const f = cfClean(r.card?.form), full = fin === 'full' || fin === 'rainbow', url = subUrls[r.image_path] || '';
  return renderCard({ ...cfSafe(cfBuild(f)), no: 'NEW', art: url.startsWith(CLOUD.url + '/storage/') && !/["<>]/.test(url) ? url : '', crop: full ? f.cropFull : f.crop }, { cls: `${cls} ${FINISH_CLS[fin]}` });
}
async function subLoadList() {
  ui.subListBusy = true;
  const r = await cloudMySubmissions();
  ui.subListBusy = false; ui.subList = r.ok ? r.rows : [];
  // never stay in edit mode for a row that was reviewed or withdrawn meanwhile
  if (r.ok && sub?.edit && !ui.subList.some(x => x.id === sub.edit.id && x.status === 'pending')) { subEditEnd(); toast('That submission was reviewed or withdrawn, so editing stopped. Your earlier draft is back.'); }
  const want = ui.subList.map(x => x.image_path).filter(p => ownPath(p) && !subUrls[p]);
  if (want.length) { const u = await cloudSignedUrls(want); if (u.ok) u.urls.forEach(x => { if (x.signedUrl && !x.error) subUrls[x.path] = x.signedUrl; }); }
  if (ui.view === 'submit') render();
}
const subList = () => `<span class="sub-lbl" id="sub-mine">My submissions</span>${!ui.subList ? '<p class="muted">Loading… <span class="spin"></span></p>' : ui.subList.length
  ? `<div class="sub-mine">${ui.subList.map(r => { const s = subStatus(r), edited = r.updated_at && new Date(r.updated_at) - new Date(r.created_at) > 60e3;
    return `<div class="sub-mine-item neu-in" ${tappable('mine-open', `data-id="${esc(r.id)}" aria-label="View ${esc(cfClean(r.card?.form).name || 'card')}"`)}>${subRowCard(r, 'normal')}
      <div><b>${esc(cfClean(r.card?.form).name || 'Card')}</b><span class="sub-status s-${s}">${SUB_STATUS[s]}</span><small>Sent ${subWhen(r.created_at)}${edited ? ` · edited ${subWhen(r.updated_at)}` : ''}</small></div></div>`; }).join('')}</div>`
  : '<p class="muted">Nothing sent yet.</p>'}`;
// Tapping a submission: every finish it allows, full size; Edit / Withdraw while it's pending.
function subMineView() {
  const r = ui.mine && subRow(ui.mine); if (!r) return '';
  const f = cfClean(r.card?.form), s = subStatus(r);
  return `<div class="viewer"><div class="viewer-bg" data-act="mine-close"></div><div class="shop-sheet neu sub-mine-view">
    <h3>${esc(f.name || 'Card')} <span class="sub-status s-${s}">${SUB_STATUS[s]}</span></h3>
    <div class="sub-mine-fins">${subFins(f).map(k => `<figure>${subRowCard(r, k)}<figcaption class="muted">${k === 'normal' ? 'Normal' : FINISH_NAME[k]}</figcaption></figure>`).join('')}</div>
    ${s === 'pending' ? `<div class="row2"><button class="btn primary" data-act="mine-edit" data-id="${esc(r.id)}">Edit</button><button class="btn" data-act="mine-withdraw" data-id="${esc(r.id)}">Withdraw</button></div>`
    : `<p class="muted">${s === 'approved' ? "This card was approved, so it's locked: any changes now go through Anonagon." : "This card was reviewed and not accepted, so it can't be changed. You can send a new version as a new card."}</p>`}
    <button class="btn wide" data-act="mine-close">Close</button></div></div>`;
}
const subAskHtml = () => (ui.mineAsk && subRow(ui.mineAsk) ? `<div class="cloud-ask">${sheet(`<h2>Withdraw this card?</h2><p class="muted center">"${esc(cfClean(subRow(ui.mineAsk).card?.form).name || 'Card')}" and its picture are deleted. This can't be undone.</p>
  <button class="btn primary wide" data-act="mine-withdraw-yes">Withdraw it</button><button class="btn wide" data-act="mine-ask-no">Keep it</button>`, false)}</div>` : '');

// Edit: the earlier draft is stashed (once) and the submission is loaded into the builder with its form, crops, finishes, background and picture.
async function subEditStart(id) {
  const r = subRow(id); if (!r || r.status !== 'pending') return toast("Only cards waiting for review can be edited.");
  const cut = ownPath(r.card?.cutout), img = ownPath(r.image_path);
  const dl = img || cut ? await cloudDownload(cut || img) : { ok: true, blob: null }; if (!dl.ok) return;
  let cv = null; if (dl.blob) try { cv = await atLoad(dl.blob); } catch { return toast("Couldn't read that card's picture."); }
  if (!sub) subLoad();
  if (!sub.edit) { subSave(true); try { localStorage.setItem(SUB_STASH, localStorage.getItem(SUB_DRAFT) ?? 'null'); } catch { return toast("Couldn't keep your current draft safe, so editing didn't start."); } }
  const f = cfClean(r.card?.form);
  sub = { form: f, art: cv ? { src: await atDataUrl(await atBlob(cv, !!cut)), transparent: !!cut, removed: false, tol: 60, bg: cut ? cfBg(r.card?.bg) : null } : null,
    edit: { id: r.id, name: f.name, image: img, cutout: cut, artChanged: false } };
  subArt.job++; Object.assign(subArt, { src: cv, cut: null, out: null, blob: null, cutBlob: null, url: '', cutUrl: '', tint: '', busy: false });
  ui.mine = null; ui.subTried = false; subTouched.clear(); ui.view = 'submit';
  subSave(true); $app.scrollTop = 0;
  if (cv) subRebuild(true); else render();
}
// Back to the draft from before editing (or a fresh one), whatever happened to the edit.
function subEditEnd() {
  clearTimeout(subSaveT);
  let s = null; try { s = localStorage.getItem(SUB_STASH); localStorage.removeItem(SUB_STASH); } catch { /* nothing stashed */ }
  try { if (s && s !== 'null') localStorage.setItem(SUB_DRAFT, s); else localStorage.removeItem(SUB_DRAFT); } catch { /* storage off */ }
  sub = null; subArt.job++; ui.subTried = false; subTouched.clear();
  Object.assign(subArt, { src: null, cut: null, out: null, blob: null, cutBlob: null, url: '', cutUrl: '', tint: '', busy: false });
}
async function subSaveEdit() {
  if (ui.subSending || !subCheck()) return;
  ui.subSending = true; render();
  const e = sub.edit, changed = e.artChanged && subArt.blob;
  const r = await cloudUpdateSubmission(e, cfPayload(sub.form, { bg: subArt.cut ? sub.art.bg : null }), changed ? subArt.blob : null, changed && subArt.cut ? subArt.cutBlob : null);
  ui.subSending = false;
  if (!r.ok) return render();
  if (r.gone) { ui.subList = null; subEditEnd(); return toast("That card can't be changed any more: it was reviewed or withdrawn. Your earlier draft is back."); }
  ui.subList = (ui.subList || []).map(x => (x.id === r.row.id ? r.row : x)); if (changed) delete subUrls[e.image];
  subEditEnd(); ui.subList = null; toast('Changes saved.'); // the list reloads with fresh picture links
}
async function subWithdraw(id) {
  const r = subRow(id); ui.mineAsk = null; if (!r) return render();
  const res = await cloudDeleteSubmission(r);
  if (!res.ok) return render();
  if (sub?.edit?.id === id) subEditEnd();
  ui.subList = ui.subList.filter(x => x.id !== id); ui.mine = null;
  toast(res.gone ? 'Card withdrawn.' : 'That card was already reviewed or withdrawn.');
  if (!res.gone) ui.subList = null;
}

// ---------- the screen ----------
const subFins = f => ['normal', ...CF_FINS.filter(k => f.fins[k])];
const subFin = f => (subFins(f).includes(ui.subFin) ? ui.subFin : 'normal');
// The id lets render() put focus back after a redraw, so arrow keys keep working on a picker that changes the form.
const subSel = (path, val, opts, attrs = '') => `<select id="sf-${path.replace(/\./g, '-')}" data-f="${path}" ${attrs}>${opts.map(([v, l]) => `<option value="${v}"${String(v) === String(val) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
const subNums = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => [lo + i, lo + i]);
// A row of buttons showing exactly what the card will print; tapping one updates the preview in place (no redraw, nothing to lose mid-gesture).
const subSeg = (path, val, opts, label, hint = '') => `<div class="sub-field"><span>${label}${hint ? ` <small>${hint}</small>` : ''}</span><div class="sub-seg" role="radiogroup" aria-label="${label}">${opts.map(([v, l]) =>
  `<button type="button" role="radio" aria-checked="${v === val}" class="${v === val ? 'on' : ''}" data-act="sub-seg" data-p="${path}" data-v="${v}">${l}</button>`).join('')}</div></div>`;
const subPips = n => (n ? ICON.action.repeat(n) : 'Free'); // a move's cost as the card prints it
const SUB_N = subNums(1, 3);
const subField = (label, inner, err = '', cls = '') => `<label class="sub-field ${cls}"><span>${label}</span>${inner}${err ? `<small class="sub-err" data-err="${err}" aria-live="polite"></small>` : ''}</label>`;
const subThumb = (t, tint) => (subArt.thumbs[t + tint] ||= atBg(t, tint, 36, 50).toDataURL());

function subPreview(f) {
  const fin = subFin(f), full = fin === 'full' || fin === 'rainbow';
  return renderCard({ ...cfSafe(cfBuild(f)), no: 'NEW', art: subArt.url || '', crop: full ? f.cropFull : f.crop }, { cls: `sub-card ${FINISH_CLS[fin]}` });
}
const subFinChips = f => subFins(f).map(k => `<button class="chip${k === subFin(f) ? ' on' : ''}" data-act="sub-fin" data-f="${k}">${k === 'normal' ? 'Normal' : FINISH_NAME[k]}</button>`).join('');
function subMeter(f) {
  const { band, pct } = cfBand(cfBuild(f)), [label, tip] = CF_BANDS[band];
  return `<div class="sub-meter b${band}"><div class="progress"><i style="width:${pct.toFixed(0)}%"></i></div><b>${label}</b></div><p class="muted">${tip}</p>
    ${band === 3 ? `<label class="sub-check"><input type="checkbox" data-f="anyway"${f.anyway ? ' checked' : ''}> Submit anyway</label><small class="sub-err" data-err="anyway"></small>` : ''}`;
}
// The card's one effect (a Character's optional passive): when it happens, what it does, how much.
function subFx(f) {
  const trigs = cfTrigs(f.type, f.dur), ok = CF_OK[f.fx.trig] || [];
  return `${trigs.length > 1 ? subField(f.type === 'character' ? 'Passive ability' : 'When', subSel('fx.trig', f.fx.trig, trigs.map(t => [t, CF_TRIG[t]]), 'data-redraw')) : ''}
    ${ok.length ? subField('Effect', subSel('fx.eff', f.fx.eff, ok.map(k => [k, CF_EFF[k][0]]))) + subSeg('fx.n', f.fx.n, SUB_N, 'Amount') : ''}`;
}
function subMoves(f) {
  return f.moves.map((m, i) => {
    const list = CF_OK[m.ability ? 'ability' : 'onHit'];
    return `<div class="sub-move neu-in"><div class="sub-row">${subField(`Move ${i + 1} name`, `<input data-f="moves.${i}.name" maxlength="20" autocomplete="off" value="${esc(m.name)}">`, `m${i}name`, 'grow')}
      ${i ? `<button class="btn sm" data-act="sub-move-del" data-i="${i}">Remove</button>` : ''}</div>
      ${subSeg(`moves.${i}.cost`, m.cost, SUB_N.map(([n]) => [n, subPips(n)]), 'Action cost')}
      ${m.ability ? '<div class="sub-field"><span>Damage</span><p class="muted">None: abilities don\'t attack</p></div>' : subSeg(`moves.${i}.power`, m.power, subNums(CF_POW[0], CF_POW[1]), 'Damage')}
      <label class="sub-check"><input type="checkbox" id="sf-moves-${i}-ability" data-f="moves.${i}.ability" data-redraw${m.ability ? ' checked' : ''}> Ability (no damage, no roll)</label>
      ${subField(m.ability ? 'What it does' : 'On a hit (optional)', subSel(`moves.${i}.eff`, m.eff, [['', m.ability ? 'Pick an effect' : 'Nothing extra'], ...list.map(k => [k, CF_EFF[k][0]])]), `m${i}eff`)}
      ${subSeg(`moves.${i}.n`, m.n, SUB_N, 'Amount')}</div>`;
  }).join('') + (f.moves.length < 2 ? '<button class="btn wide" data-act="sub-move-add">Add a second move</button>' : '');
}
function subArtTools() {
  const a = sub.art; if (!a) return '';
  const tint = a.bg?.tint || subArt.tint || '#e5535d';
  return `${a.transparent ? '' : `<label class="sub-check"><input type="checkbox" id="sub-remove"${a.removed ? ' checked' : ''}> My art has a plain background: remove it</label>`}
    ${a.removed ? `<label class="sub-slider"><span>Tolerance <small>(higher removes more)</small></span><input type="range" id="sub-tol" min="10" max="150" step="5" value="${a.tol}"></label>` : ''}
    ${subArt.cut ? `<div class="sub-cutrow"><div class="sub-cut"><img src="${subArt.cutUrl}" alt="Your character on a checkerboard, showing what is see-through"></div>${a.removed ? '<button class="btn sm" data-act="sub-unremove">Undo removal</button>' : ''}</div>
      <span class="sub-lbl">Background</span>
      <div class="sub-bgs">${['', ...CF_BG].map(t => `<button class="sub-bg${(a.bg?.tpl || '') === t ? ' on' : ''}" data-act="sub-bg" data-t="${t}"${t ? ` style="background-image:url(${subThumb(t, tint)})"` : ''}><small>${t ? AT_BG_NAME[t] : 'None'}</small></button>`).join('')}</div>
      ${a.bg ? `<label class="sub-tint"><span>Colour</span><input type="color" id="sub-tint" value="${a.bg.tint}"></label>` : ''}` : ''}
    ${subArt.busy ? '<p class="muted">Working on the picture… <span class="spin"></span></p>' : ''}`;
}
const subCrops = (key, title) => `<fieldset class="sub-crop"><legend>${title}</legend>${['x', 'y', 'zoom'].map(k => `<label class="sub-slider"><span>${{ x: 'Left / right', y: 'Up / down', zoom: 'Zoom' }[k]}</span><input type="range" data-f="${key}.${k}" data-num min="${k === 'zoom' ? 1 : 0}" max="${k === 'zoom' ? 4 : 100}" step="${k === 'zoom' ? 0.05 : 0.5}" value="${sub.form[key]?.[k] ?? (k === 'zoom' ? 1 : 50)}"></label>`).join('')}</fieldset>`;

function viewSubmit() {
  if (!sub) subLoad();
  if (cloud.user && !ui.subList && !ui.subListBusy) subLoadList();
  const f = cfClean(sub.form), isCh = f.type === 'character', online = CLOUD.url && cloud.user, e = sub.edit;
  const wide = matchMedia('(min-width: 900px)').matches;
  return `${header(e ? 'Edit Submission' : 'Submit a Card')}
  <div class="pf-back"><button class="btn sm" data-act="profile">‹ Profile</button></div>
  ${e ? `<div class="panel neu sub-editing" role="status"><b>Editing your submission: ${esc(e.name || f.name || 'Card')}</b><small class="muted">Changes go to the same submission when you save. Your other draft is kept safe.</small>
    <button class="btn sm" data-act="sub-edit-cancel">Cancel editing</button></div>` : ''}
  <div class="sub-wrap">
  <details class="sub-prev neu"${ui.subPrevShut && !wide ? '' : ' open'}><summary>Preview</summary>
    <div class="sub-stage"></div><div class="chips sub-finchips"></div>
    ${subArt.url ? '<small class="muted center">Drag the picture to move it; scroll or pinch to zoom.</small>' : ''}</details>
  <div class="sub-form">
  <section class="panel neu"><h3 class="sub-h">The card</h3>
    <div class="chips sub-types" role="group" aria-label="Card type">${[['character', 'Character'], ['bit', 'Item'], ['evil', 'Evil']].map(([t, l]) => `<button class="chip${f.type === t ? ' on' : ''}" data-act="sub-type" data-t="${t}" aria-pressed="${f.type === t}">${l}</button>`).join('')}</div>
    ${subField('Card name', `<input data-f="name" maxlength="22" autocomplete="off" value="${esc(f.name)}"><small class="sub-count" data-count="name"></small>`, 'name')}
    ${subField('Whose OC is this?', `<input data-f="credit" maxlength="30" autocomplete="off" placeholder="Their name or handle" value="${esc(f.credit)}">`, 'credit')}
  </section>
  <section class="panel neu"><h3 class="sub-h">Art</h3>
    <label class="btn wide" tabindex="0" role="button">${sub.art ? 'Change picture' : 'Choose a picture'}<input type="file" id="sub-file" accept="image/png,image/jpeg,image/webp" hidden></label>
    <small class="muted">PNG, JPG or WebP, up to 5 MB.</small><small class="sub-err" data-err="art"></small>
    ${subArtTools()}
    ${sub.art ? subCrops('crop', isCh ? 'Crop: normal, holo and reverse holo' : 'Crop') + (isCh && (f.fins.full || f.fins.rainbow) ? subCrops('cropFull', 'Crop: full art and rainbow (the art fills the whole card)') : '') : ''}
  </section>
  ${isCh ? `<section class="panel neu"><h3 class="sub-h">Finishes</h3><p class="muted">Which special versions may this card come in? Normal always exists.</p>
    <div class="sub-fins">${CF_FINS.map(k => `<label class="sub-check"><input type="checkbox" id="sf-fins-${k}" data-f="fins.${k}" data-redraw${f.fins[k] ? ' checked' : ''}> ${FINISH_NAME[k]}</label>`).join('')}</div></section>
  <section class="panel neu"><h3 class="sub-h">Stats</h3>
    ${subSeg('hp', f.hp, Object.entries(CF_HP).map(([shown, hp]) => [hp, shown]), 'HP')}
    ${subSeg('def', f.def, Object.entries(CF_DEF).map(([armour, def]) => [def, armour]), 'Armour', 'damage blocked from every hit')}
    ${subSeg('cost', f.cost, subNums(0, 3).map(([n]) => [n, n ? `${ICON.action}${n}` : 'Free']), 'Actions to play')}
    ${subFx(f)}</section>
  <section class="panel neu"><h3 class="sub-h">Moves</h3>${subMoves(f)}</section>`
  : `<section class="panel neu"><h3 class="sub-h">${f.type === 'bit' ? 'Item' : 'Evil'}</h3>
    <div class="sub-row">${subSeg('cost', f.cost, subNums(f.type === 'evil' ? 1 : 0, 3).map(([n]) => [n, n ? `${ICON.action}${n}` : 'Free']), 'Actions to play')}
    ${f.type === 'bit' ? subField('How long', subSel('dur', f.dur, [[0, 'Instant'], [1, 'Lasts 1 turn'], [2, 'Lasts 2 turns'], [3, 'Lasts 3 turns']], 'data-num data-redraw')) : ''}</div>
    ${f.type === 'evil' ? '<p class="muted">Evils stay in play until the opponent Cleanses them.</p>' : ''}${subFx(f)}</section>`}
  <section class="panel neu"><h3 class="sub-h">Power</h3><div class="sub-meter-box"></div></section>
  <section class="panel neu"><h3 class="sub-h">Notes for the reviewer</h3>
    ${subField('Anything Anonagon should know (optional)', `<textarea data-f="notes" maxlength="300" rows="3">${esc(f.notes)}</textarea><small class="sub-count" data-count="notes"></small>`)}</section>
  <section class="panel neu sub-send"><h3 class="sub-h">${e ? 'Save it' : 'Send it'}</h3>
    ${online ? `<button class="btn primary wide" data-act="${e ? 'sub-edit-save' : 'sub-send'}"${ui.subSending ? ' disabled' : ''}>${ui.subSending ? (e ? 'Saving…' : 'Sending…') : e ? 'Save changes' : 'Submit card'}</button><button class="btn wide" data-act="sub-download">Download card file</button>`
    : CLOUD.url && !cloud.checked ? '<p class="muted center">Checking your account… <span class="spin"></span></p>'
    : `${e ? '<p class="muted center">Sign in again to save changes to this submission.</p>' : `<button class="btn primary wide" data-act="sub-download">Download card file</button><p class="muted center">Send this file to Anonagon on Discord.</p>`}${CLOUD.url ? `<button class="btn wide${e ? ' primary' : ''}" data-act="cloud-in">${e ? 'Sign in' : 'Sign in to submit online'}</button>` : ''}`}
    ${e ? '<button class="btn sm sub-reset" data-act="sub-edit-cancel">Cancel editing</button>' : '<button class="btn sm sub-reset" data-act="sub-reset">Start over</button>'}
    ${cloud.user ? subList() : ''}</section>
  </div></div>${tabbar('submit')}${subMineView()}${subAskHtml()}`;
}

// Live parts (preview, power, messages, counters) update without redrawing the form, so typing and sliders are never interrupted.
function subPaint() {
  if (ui.view !== 'submit' || !sub) return;
  const f = cfClean(sub.form), q = s => $app.querySelector(s), set = (s, h) => { const el = q(s); if (el) el.innerHTML = h; };
  set('.sub-stage', subPreview(f)); set('.sub-finchips', subFinChips(f)); set('.sub-meter-box', subMeter(f));
  const errs = cfErrors(f, !!subArt.blob || subArt.busy);
  $app.querySelectorAll('[data-err]').forEach(el => { const k = el.dataset.err; el.textContent = ((ui.subTried || subTouched.has(k)) && errs[k]) || ''; });
  $app.querySelectorAll('[data-count]').forEach(el => { el.textContent = `${String(sub.form[el.dataset.count] || '').length}/${el.dataset.count === 'notes' ? 300 : 22}`; });
}
const renderNoSubmit = render;
render = function () {
  renderNoSubmit(); subPaint();
  if (ui.subScrollMine && ui.view === 'submit' && ui.subList) { ui.subScrollMine = false; document.getElementById('sub-mine')?.scrollIntoView({ block: 'start' }); } // from Profile's "My submissions"
};

const subSet = (path, v) => { const ks = path.split('.'), last = ks.pop(); let o = sub.form; for (const k of ks) o = o[k] ??= {}; o[last] = v; };
// Moving a crop slider shows the finish it belongs to.
function subCropFin(full) {
  const f = cfClean(sub.form), cur = subFin(f), on = cur === 'full' || cur === 'rainbow';
  if (full && !on) ui.subFin = f.fins.full ? 'full' : 'rainbow';
  if (!full && on) ui.subFin = 'normal';
}
const subCheck = () => {
  if (subArt.busy) { toast('One moment: the picture is still being prepared.'); return false; }
  ui.subTried = true;
  if (!Object.keys(cfErrors(cfClean(sub.form), !!subArt.blob)).length) return true;
  toast('Fill in the marked fields first.');
  setTimeout(() => $app.querySelector('.sub-err:not(:empty)')?.closest('.panel')?.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'center' }));
  return false;
};
async function subDownload() {
  if (!subCheck()) return;
  const art = { bg: subArt.cut ? sub.art.bg : null, image: subArt.blob ? await atDataUrl(subArt.blob) : '', cutout: subArt.cutBlob ? await atDataUrl(subArt.cutBlob) : '' };
  const p = cfPayload(sub.form, art);
  downloadFile(`${p.card.id.slice(4)}.tismcard.json`, JSON.stringify(p), 'application/json');
  toast('Card file saved: send it to Anonagon on Discord.');
}
async function subSend() {
  if (ui.subSending || !subCheck()) return;
  ui.subSending = true; render();
  const r = await cloudSubmitCard(cfPayload(sub.form, { bg: subArt.cut ? sub.art.bg : null }), subArt.blob, subArt.cut ? subArt.cutBlob : null);
  ui.subSending = false;
  if (r.ok) { ui.subList = [r.row, ...(ui.subList || [])]; toast('Card sent! Anonagon will review it.'); } else render();
}

Object.assign(ACTS, {
  'sub-type'(d) { sub.form.type = d.t; sub.form = cfClean(sub.form); subSave(); },
  'sub-fin'(d) { ui.subFin = d.f; },
  'sub-seg'(d) {
    subSet(d.p, Number(d.v)); subSave();
    $app.querySelectorAll('[data-act="sub-seg"]').forEach(b => { if (b.dataset.p !== d.p) return; const on = b.dataset.v === d.v; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    subPaint(); return false;
  },
  'sub-move-add'() { sub.form.moves.push({ name: '', cost: 2, power: 4 }); subSave(); },
  'sub-move-del'(d) { sub.form.moves.splice(Number(d.i), 1); subSave(); },
  'sub-bg'(d) { sub.art.bg = d.t ? { tpl: d.t, tint: sub.art.bg?.tint || subArt.tint || '#e5535d' } : null; subArtTouched(); subSave(); subRebuild(true); return false; },
  'sub-unremove'() { sub.art.removed = false; subArtTouched(); subSave(); subRebuild(true); return false; },
  'sub-download'() { subDownload(); return false; },
  'sub-send'() { subSend(); return false; },
  'sub-edit-save'() { subSaveEdit(); return false; },
  'sub-edit-cancel'() { subEditEnd(); toast('Stopped editing. Your earlier draft is back.'); return false; },
  'mine-list'() { if (!['profile', 'submit', 'game'].includes(ui.view)) ui.back = ui.view; ui.view = 'submit'; ui.subList = null; ui.subScrollMine = true; },
  'mine-open'(d) { ui.mine = d.id; },
  'mine-close'() { ui.mine = null; },
  'mine-edit'(d) { subEditStart(d.id); return false; },
  'mine-withdraw'(d) { ui.mineAsk = d.id; ui.mine = null; },
  'mine-ask-no'() { ui.mineAsk = null; },
  'mine-withdraw-yes'() { subWithdraw(ui.mineAsk); return false; },
  'sub-reset'() {
    if (!confirm('Start over? This clears the card you are making.')) return false;
    try { localStorage.removeItem(SUB_DRAFT); } catch { /* nothing saved */ }
    sub = null; ui.subTried = false; ui.subFin = 'normal'; subTouched.clear(); subArt.job++;
    Object.assign(subArt, { src: null, cut: null, out: null, blob: null, cutBlob: null, url: '', cutUrl: '', tint: '', busy: false });
  },
});

document.addEventListener('input', e => {
  const el = e.target; if (ui.view !== 'submit' || !sub) return;
  if (el.id === 'sub-remove') { sub.art.removed = el.checked; subArtTouched(); subSave(); return subRebuild(true); }
  if (el.id === 'sub-tol' || el.id === 'sub-tint') {
    if (el.id === 'sub-tol') sub.art.tol = Number(el.value); else sub.art.bg.tint = el.value;
    subArtTouched(); subSave(); clearTimeout(subT); subT = setTimeout(() => subRebuild(false, true), 90); return;
  }
  const path = el.dataset?.f; if (!path) return;
  subSet(path, el.type === 'checkbox' ? el.checked : 'num' in el.dataset ? Number(el.value) : el.value);
  if (/^crop(Full)?\./.test(path)) subCropFin(path.startsWith('cropFull'));
  subSave();
  if ('redraw' in el.dataset) { sub.form = cfClean(sub.form); render(); } else subPaint();
});
document.addEventListener('change', e => {
  if (e.target.id === 'sub-file') { const f = e.target.files[0]; e.target.value = ''; subPick(f); }
  if (e.target.id === 'sub-tint' && ui.view === 'submit') setTimeout(render, 200); // refresh the swatches in the new colour
});
document.addEventListener('focusout', e => { const p = e.target.dataset?.f; if (p && ui.view === 'submit') { subTouched.add(p.replace(/^moves\.(\d)\./, 'm$1')); subPaint(); } });
document.addEventListener('toggle', e => { if (e.target.classList?.contains('sub-prev')) ui.subPrevShut = !e.target.open; }, true);

// Pan the art by dragging the preview, zoom with the wheel or a pinch. Moves the crop of the finish on show.
const subPtr = new Map();
const subCropKey = () => (['full', 'rainbow'].includes(subFin(cfClean(sub.form))) ? 'cropFull' : 'crop');
function subNudge(fn) {
  const key = subCropKey(), cr = (sub.form[key] = cfClean(sub.form)[key]); fn(cr);
  cr.zoom = Math.min(4, Math.max(1, cr.zoom)); cr.x = Math.min(100, Math.max(0, cr.x)); cr.y = Math.min(100, Math.max(0, cr.y));
  $app.querySelectorAll(`[data-f^="${key}."]`).forEach(el => { el.value = cr[el.dataset.f.split('.')[1]]; });
  const img = $app.querySelector('.sub-stage .art img'); if (img) img.setAttribute('style', cropStyle(cr).slice(8, -1)); // cheap update mid-drag; subPaint redraws on release
}
document.addEventListener('pointerdown', e => {
  if (ui.view !== 'submit' || !subArt.url || !e.target.closest?.('.sub-stage .art')) return;
  subPtr.set(e.pointerId, { x: e.clientX, y: e.clientY }); e.preventDefault();
});
document.addEventListener('pointermove', e => {
  const p = subPtr.get(e.pointerId), art = p && $app.querySelector('.sub-stage .art'); if (!art) return;
  const r = art.getBoundingClientRect();
  if (subPtr.size === 2) { const [a, b] = [...subPtr.values()], d0 = Math.hypot(a.x - b.x, a.y - b.y); Object.assign(p, { x: e.clientX, y: e.clientY }); const d1 = Math.hypot(a.x - b.x, a.y - b.y); subNudge(cr => { cr.zoom *= d1 / (d0 || 1); }); return; }
  subNudge(cr => { cr.x -= ((e.clientX - p.x) / r.width) * 100 / cr.zoom; cr.y -= ((e.clientY - p.y) / r.height) * 100 / cr.zoom; });
  Object.assign(p, { x: e.clientX, y: e.clientY });
});
const subUp = e => { if (subPtr.delete(e.pointerId) && !subPtr.size) { subSave(); subPaint(); } };
document.addEventListener('pointerup', subUp); document.addEventListener('pointercancel', subUp);
document.addEventListener('wheel', e => {
  if (ui.view !== 'submit' || !subArt.url || !e.target.closest?.('.sub-stage .art')) return;
  e.preventDefault(); subNudge(cr => { cr.zoom *= e.deltaY < 0 ? 1.08 : 1 / 1.08; }); clearTimeout(subT); subT = setTimeout(() => { subSave(); subPaint(); }, 250);
}, { passive: false });
