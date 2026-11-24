// Review submissions (owner only): every submission newest first; approve into a pack, reject or hand to the developer, with a note
// the submitter sees. The Profile button shows only for accounts in public.admins (is_admin()); the database refuses everyone else anyway.
// RV is the only part that talks to the database, so the screen can be checked with fake rows by swapping its functions.
const RV_COLS = 'id, created_at, updated_at, status, card, image_path, note, pack, review_note';
const RV = {
  async isAdmin() { try { const sb = await sbGet(); return (await sb?.rpc('is_admin'))?.data === true; } catch { return false; } }, // quiet: most players aren't
  list: () => sbRun('Loading submissions', async sb => ({ rows: need(await sb.from('submissions').select(RV_COLS).order('created_at', { ascending: false }).limit(200)) })),
  urls: paths => sbRun('Loading pictures', async sb => ({ urls: need(await sb.storage.from('submissions').createSignedUrls(paths, 3600)) })),
  update: (id, patch) => sbRun('Saving the review', async sb => ({ rows: need(await sb.from('submissions').update(patch).eq('id', id).select(RV_COLS)) })),
};
// for: the account the admin answer belongs to (asked once per account per visit). seq: only the newest list load is kept.
const rv = { for: '', admin: null, rows: null, seq: 0, saving: false };
const RV_TABS = [['pending', 'Pending'], ['dev', 'Handed to dev'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['all', 'All']];
const RV_DONE = { approve: 'Approved', pack: 'Pack changed', reject: 'Rejected', dev: 'Handed to the developer', unapprove: 'Unapproved', pending: 'Back to pending' };
const rvIsAdmin = () => !!cloud.user && rv.for === cloud.user.id && rv.admin === true;
const rvFind = id => rv.rows?.find(r => r.id === id);
const rvStatus = r => (SUB_STATUS[r.status] ? r.status : 'pending');
const rvPacks = () => [...PACKS.filter(p => p.id !== 'community'), CM_PACK]; // the Community Pack is only on the wheel once it has a card
const rvPackName = p => (p ? rvPacks().find(x => x.id === p)?.name || `unknown pack "${p}"` : 'no pack yet');
const rvPath = p => typeof p === 'string' && /^[\w-]{1,64}\/[\w-]{1,80}\.(webp|png|jpe?g)$/i.test(p);

function rvCheck() {
  const id = cloud.user?.id; if (!id || rv.for === id) return;
  Object.assign(rv, { for: id, admin: null, rows: null });
  RV.isAdmin().then(yes => {
    if (rv.for !== id) return;
    rv.admin = yes;
    if (yes) rvLoad(); else if (ui.view === 'review') render();
  });
}
async function rvLoad() {
  if (!rvIsAdmin()) return;
  const seq = ++rv.seq, r = await RV.list();
  if (seq !== rv.seq) return;
  rv.rows = r.ok && Array.isArray(r.rows) ? r.rows : rv.rows || [];
  const want = [...new Set(rv.rows.map(x => x.image_path).filter(p => rvPath(p) && !subUrls[p]))];
  if (want.length) { const u = await RV.urls(want); if (u.ok) u.urls.forEach(x => { if (x.signedUrl && !x.error) subUrls[x.path] = x.signedUrl; }); } // subRowCard (submit.js) reads these
  if (ui.view === 'profile' || ui.view === 'review') render();
}

// Profile: the way in, with the number waiting. Called only while signed in.
function rvEntry() {
  rvCheck(); if (!rvIsAdmin()) return '';
  const n = (rv.rows || []).filter(r => rvStatus(r) === 'pending').length;
  return `<button class="btn wide rv-entry" data-act="rv-go">Review submissions${n ? `<span class="rv-badge" aria-label="${n} pending">${n}</span>` : ''}</button>`;
}

// The card in plain words.
function rvWords(f) {
  const c = cfBuild(f), ch = f.type === 'character', acts = n => (n ? `${n} Action${n > 1 ? 's' : ''}` : 'free');
  const li = [`${{ character: 'Character', bit: 'Item', evil: 'Evil' }[f.type]}, ${f.cost ? `costs ${acts(f.cost)} to play` : 'free to play'}`];
  if (ch) li.push(`${maxHp(c)} HP, armour ${baseArmor(c)} (blocks that much of every hit)`);
  if (f.type === 'bit') li.push(f.dur ? `Lasts ${f.dur} turn${f.dur > 1 ? 's' : ''}` : 'Instant');
  if (f.type === 'evil') li.push('Stays in play until the opponent Cleanses it');
  li.push(c.text ? `${ch ? 'Passive' : 'Effect'}: ${c.text}` : ch ? 'No passive' : 'No effect');
  if (ch) c.moves.forEach(m => li.push(`Move "${m.name}" (${acts(m.cost)}): ${m.ability ? 'ability, no damage' : `${m.power} damage`}${m.text ? `. ${m.text}` : ''}`));
  return `<ul class="rv-words">${li.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
}
const rvNoteBox = (title, text) => (typeof text === 'string' && text.trim() ? `<div class="sub-note neu-in"><b>${title}</b><p>${esc(text.slice(0, 500))}</p></div>` : '');

// updated_at moves on any change, the submitter's edits and reviews alike
const rvDates = r => `Sent ${subWhen(r.created_at)}${r.updated_at && new Date(r.updated_at) - new Date(r.created_at) > 60e3 ? ` · updated ${subWhen(r.updated_at)}` : ''}`;
function rvItem(r) {
  const f = cfClean(r.card?.form), s = rvStatus(r);
  return `<div class="sub-mine-item neu-in" ${tappable('rv-open', `data-id="${esc(r.id)}" aria-label="Review ${esc(f.name || 'card')}"`)}>${subRowCard(r, 'normal')}
    <div><b>${esc(f.name || 'Card')}</b><small>OC: ${esc(f.credit || 'no credit')}</small><span class="sub-status s-${s}">${SUB_STATUS[s]}</span>
    <small>${rvDates(r)}${s === 'approved' ? ` · ${esc(rvPackName(r.pack))}` : ''}</small></div></div>`;
}

function rvDetail() {
  const r = ui.rvOpen && rvFind(ui.rvOpen); if (!r) return '';
  const f = cfClean(r.card?.form), s = rvStatus(r), btn = (k, label, cls = '') => `<button class="btn ${cls}" data-act="rv-ask" data-k="${k}">${label}</button>`;
  const controls = s === 'pending' ? `${btn('approve', 'Approve…', 'primary wide')}<div class="row2">${btn('reject', 'Reject…')}${btn('dev', 'Hand to dev…')}</div>`
    : s === 'approved' ? `<div class="row2">${btn('pack', 'Change pack…', 'primary')}${btn('unapprove', 'Unapprove…')}</div>` : btn('pending', 'Back to pending', 'wide');
  return `<div class="viewer"><div class="viewer-bg" data-act="rv-close"></div><div class="shop-sheet neu sub-mine-view rv-view">
    <h3>${esc(f.name || 'Card')} <span class="sub-status s-${s}">${SUB_STATUS[s]}</span></h3>
    <div class="sub-mine-fins">${subFins(f).map(k => `<figure>${subRowCard(r, k)}<figcaption class="muted">${k === 'normal' ? 'Normal' : FINISH_NAME[k]}</figcaption></figure>`).join('')}</div>
    <div class="stats-list neu-in">
      <div><span>Whose OC</span><b>${esc(f.credit || '—')}</b></div>
      <div><span>Rarity (from its strength)</span><b>${RARITY_NAME[cmRarity(cfBuild(f))]}</b></div>
      <div><span>Pack</span><b>${s === 'approved' ? esc(rvPackName(r.pack)) : '—'}</b></div>
      <div><span>Dates</span><b>${rvDates(r)}</b></div>
    </div>
    ${rvWords(f)}
    <div><span class="sub-lbl">Strength</span>${subMeter(f, true)}</div>
    ${rvNoteBox('Note from the submitter', r.note || f.notes)}${rvNoteBox('Your note to them', r.review_note)}
    ${controls}
    <button class="btn wide" data-act="rv-copy">Copy for dev</button><button class="btn wide" data-act="rv-close">Close</button></div></div>`;
}

// Sheets: pick a pack (approve / change pack), write a note (reject / hand to dev), or confirm unapproving.
function rvAskHtml() {
  const a = ui.rvAsk, r = a && rvFind(ui.rvOpen); if (!r) return '';
  const name = esc(cfClean(r.card?.form).name || 'Card'), off = rv.saving ? ' disabled' : '', no = '<button class="btn wide" data-act="rv-ask-no">Cancel</button>';
  let body;
  if (a === 'approve' || a === 'pack') {
    const opts = [...rvPacks().map(p => [p.id, p.name]), ['none', "No pack yet (exists, but can't be pulled)"]];
    body = `<h2>${a === 'pack' ? 'Change pack for' : 'Approve'} “${name}”</h2><p class="muted center">Which pack can give it?</p>
      <div class="rv-packs" role="radiogroup" aria-label="Pack">${opts.map(([k, l]) => `<button class="rv-pack${ui.rvPick === k ? ' on' : ''}" role="radio" aria-checked="${ui.rvPick === k}" data-act="rv-pick" data-p="${esc(k)}">${esc(l)}</button>`).join('')}</div>
      <button class="btn primary wide" data-act="rv-do" data-k="${a}"${ui.rvPick ? off : ' disabled'}>${!ui.rvPick ? 'Pick a pack first' : a === 'pack' ? 'Save pack' : 'Approve'}</button>${no}`;
  } else if (a === 'reject' || a === 'dev') {
    body = `<h2>${a === 'dev' ? 'Hand to the developer' : 'Reject'}: “${name}”</h2>
      <label class="sub-field"><span>${a === 'dev' ? 'What needs changing (optional)' : 'Message to the submitter (optional)'}</span><textarea id="rv-note" maxlength="500" rows="4">${esc(ui.rvNote || '')}</textarea></label>
      <p class="muted center">The submitter sees this in My submissions${a === 'dev' ? ', with the status "With the developer"' : ''}.</p>
      <button class="btn primary wide" data-act="rv-do" data-k="${a}"${off}>${a === 'dev' ? 'Hand to dev' : 'Reject'}</button>${no}`;
  } else if (a === 'unapprove') {
    body = `<h2>Unapprove “${name}”?</h2><p class="muted center">It leaves the game for everyone and goes back to pending, until you approve it again.</p>
      <button class="btn primary wide" data-act="rv-do" data-k="unapprove"${off}>Unapprove</button>${no}`;
  } else return '';
  return `<div class="cloud-ask">${sheet(body, false)}</div>`;
}

function viewReview() {
  const back = '<div class="pf-back"><button class="btn sm" data-act="rv-back">‹ Profile</button></div>';
  if (!rvIsAdmin()) { rvCheck(); return `${header('Review')}<div class="pf-wrap">${back}<section class="panel neu"><p class="muted">${cloud.user && rv.admin === null ? 'Checking… <span class="spin"></span>' : 'Only the reviewer can see this.'}</p></section></div>${tabbar('review')}`; }
  const tab = ui.rvTab || 'pending', rows = rv.rows, n = k => (rows || []).filter(r => k === 'all' || rvStatus(r) === k).length;
  const list = (rows || []).filter(r => tab === 'all' || rvStatus(r) === tab);
  return `${header('Review Submissions')}<div class="pf-wrap">${back}
    <div class="chips rv-tabs" role="tablist">${RV_TABS.map(([k, l]) => `<button class="chip${k === tab ? ' on' : ''}" role="tab" aria-selected="${k === tab}" data-act="rv-tab" data-t="${k}">${l}<b>${n(k)}</b></button>`).join('')}</div>
    ${!rows ? '<p class="muted center">Loading… <span class="spin"></span></p>' : list.length ? `<div class="sub-mine rv-list">${list.map(rvItem).join('')}</div>` : '<p class="muted center">Nothing here.</p>'}
  </div>${tabbar('review')}${rvDetail()}${rvAskHtml()}`;
}

async function rvDo(k) {
  const r = rvFind(ui.rvOpen); if (!r || rv.saving) return;
  const pack = ui.rvPick === 'none' ? null : ui.rvPick, note = String(ui.rvNote || '').trim().slice(0, 500) || null;
  if ((k === 'approve' || k === 'pack') && !(pack === null || rvPacks().some(p => p.id === pack))) return toast('Pick a pack first.');
  const patch = { approve: { status: 'approved', pack, review_note: null }, pack: { pack }, reject: { status: 'rejected', pack: null, review_note: note },
    dev: { status: 'dev', pack: null, review_note: note }, unapprove: { status: 'pending', pack: null }, pending: { status: 'pending' } }[k];
  if (!patch) return;
  rv.saving = true; render();
  const res = await RV.update(r.id, patch); rv.saving = false;
  if (!res.ok) return render(); // sbRun has shown why
  if (!res.rows?.length) { toast("That didn't save: the card is gone, or this account can't review."); return rvLoad(); }
  rv.rows = rv.rows.map(x => (x.id === r.id ? res.rows[0] : x)); ui.rvAsk = null;
  toast(`${RV_DONE[k]}: ${cfClean(r.card?.form).name || 'card'}${k === 'approve' || k === 'pack' ? ` (${rvPackName(pack)})` : ''}`);
  rvLoad(); cmRefresh(); // the game's community list, so the change shows straight away
}
// A compact block to paste to the developer: who, where, and the card as cards-data.js would hold it (rebuilt from the clamped form).
function rvCopyText(r) {
  const f = cfClean(r.card?.form);
  return [`Tismtopia submission ${r.id}`, `Name: ${f.name} (OC: ${f.credit})`, `Status: ${rvStatus(r)}`, `Pack: ${r.pack || 'none'}`,
    `Review note: ${r.review_note || 'none'}`, `Picture: ${r.image_path || 'none'}`, `Card: ${JSON.stringify(cfBuild(f))}`].join('\n');
}

Object.assign(ACTS, {
  'rv-go'() { if (!rvIsAdmin()) return false; ui.view = 'review'; ui.rvOpen = ui.rvAsk = null; $app.scrollTop = 0; rvLoad(); },
  'rv-back'() { ui.view = 'profile'; ui.rvOpen = ui.rvAsk = null; },
  'rv-tab'(d) { ui.rvTab = d.t; },
  'rv-open'(d) { ui.rvOpen = d.id; },
  'rv-close'() { ui.rvOpen = ui.rvAsk = null; },
  'rv-ask'(d) {
    const r = rvFind(ui.rvOpen); if (!r) return;
    if (d.k === 'pending') { rvDo('pending'); return false; }
    const known = r.pack && rvPacks().some(p => p.id === r.pack); // an unknown (old) pack id starts with nothing picked
    Object.assign(ui, { rvAsk: d.k, rvPick: d.k === 'pack' ? (known ? r.pack : r.pack ? '' : 'none') : '', rvNote: r.review_note || '' });
  },
  'rv-ask-no'() { ui.rvAsk = null; },
  'rv-pick'(d) { ui.rvPick = d.p; },
  'rv-do'(d) { rvDo(d.k); return false; },
  'rv-copy'() { const r = rvFind(ui.rvOpen); if (r) copy(rvCopyText(r), 'Submission'); return false; },
});
document.addEventListener('input', e => { if (e.target.id === 'rv-note') ui.rvNote = e.target.value; }); // a redraw (toast, refresh) must not lose the typing
