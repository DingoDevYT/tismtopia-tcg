// Profile (the account pill, top left): name, coins, collection and battle stats, the Discord account panel,
// save export/import for this device, and the way into Submit a Card.
const downloadFile = (name, text, type) => {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

function viewProfile() {
  const u = cloud.user, st = store.get('stats', {}), n = ownedCount(), stars = [0, 0, 0, 0, 0, 0];
  CARDS.forEach(c => { if (owned(c.id)) stars[starN(c.id, bestFinish(c.id))]++; });
  const rec = (w, p) => `${st[w] || 0} won of ${st[p] || 0}`;
  const account = !CLOUD.url ? `<button class="btn wide" disabled>Sign in with Discord</button><p class="muted pf-note">Accounts are coming soon. Your progress is saved on this device.</p>`
    : !cloud.checked ? '<p class="muted center">Checking your account… <span class="spin"></span></p>'
    : u ? `<div class="pf-who"><span class="avatar">${u.avatar ? `<img src="${esc(u.avatar)}" alt="" referrerpolicy="no-referrer">` : ICON.character}</span><div><b>${esc(u.name)}</b><small>Tismtopia Discord member ✓</small><small class="cloud-last">${esc(lastSaveText())}</small></div></div>
      <div class="row2"><button class="btn primary" data-act="cloud-save">Save now</button><button class="btn" data-act="cloud-out">Sign out</button></div>${rvEntry()}`
    : cloud.block ? (([t, p, b, a]) => `${t ? `<h3>${t}</h3>` : ''}<p class="muted pf-note">${p}</p><button class="btn primary wide" data-act="cloud-${a}">${b}</button>`)(MEMBER_BLOCK[cloud.block])
    : `<button class="btn primary wide" data-act="cloud-in">Sign in with Discord</button><p class="muted pf-note">Keeps a copy of your progress online, so you can carry on from any device.</p>`;
  return `${header('Profile')}
  <div class="pf-wrap">
  <div class="pf-back"><button class="btn sm" data-act="pf-back">‹ Back</button></div>
  <section class="panel neu pf-head">
    <button class="pf-pfp" data-act="pfp-open" aria-label="Change your profile picture">${pfpAvatar(myPfp(), ' xl')}<span class="pf-pfp-tag">Change</span></button>
    <div class="pf-name"><label class="lbl" for="pf-name">Display name</label>
      <div class="row2"><input id="pf-name" class="pf-input" maxlength="22" autocomplete="off" value="${esc(myName)}"><button class="btn sm" data-act="pf-rename">Save</button></div></div>
  </section>
  <section class="panel neu"><small class="lbl">Collection</small>
    <div class="coll-progress"><b>${n} / ${CARDS.length}</b> cards owned<div class="progress"><i style="width:${((100 * n) / CARDS.length).toFixed(1)}%"></i></div></div>
    <div class="chips pf-stars">${stars.map((k, s) => `<span class="chip">${s ? s + '★' : '☆'}<b>${k}</b></span>`).join('')}</div>
    <div class="stats-list neu-in">
      <div><span>Coins</span><b>${COIN}${fmt(coins)}</b></div>
      <div><span>Decks</span><b>${decks.length}</b></div>
      <div><span>Battles vs the bot</span><b>${rec('botWon', 'botPlayed')}</b></div>
      <div><span>Battles vs players</span><b>${rec('pvpWon', 'pvpPlayed')}</b></div>
    </div></section>
  <section class="panel neu pf-social"><small class="lbl">Social</small><p class="muted">Your profile picture, stats and display stands are what other players see on the Social tab.</p>
    <div class="row2"><button class="btn" data-act="so-open" data-id="me">My public profile</button><button class="btn primary" data-act="so-edit">Edit showcase</button></div></section>
  <section class="panel neu pf-acct"><small class="lbl">Account</small>${account}</section>
  <section class="panel neu pf-save"><small class="lbl">Save on this device</small><p class="muted">Download your progress as a file, or load one (from a backup or another device). Loading replaces what's here.</p>
    <div class="row2"><button class="btn" data-act="pf-export">Export save</button><label class="btn" tabindex="0" role="button">Import save<input type="file" id="pf-import" accept=".json,application/json" hidden></label></div></section>
  <section class="panel neu pf-oc"><small class="lbl">Your OC as a card</small><p class="muted">Design a card with your own character and send it in. Anonagon reviews every one.</p>
    <button class="btn primary wide" data-act="go" data-to="submit">Submit a card</button>${u ? '<button class="btn wide" data-act="mine-list">My submissions</button>' : ''}</section>
  <section class="panel neu"><small class="lbl">Help</small><button class="btn wide" data-act="tour-replay">Replay the tour</button></section>
  <section class="panel neu pf-danger"><small class="lbl">Danger zone</small><p class="muted">Start again from nothing: your cards, coins and decks are wiped and you pick a starter again.</p>
    <button class="btn wide danger" data-act="reset-ask">Reset my account</button></section>
  </div>${tabbar('profile')}`;
}

function pfRename() {
  const v = document.getElementById('pf-name')?.value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 22);
  if (!v) return toast("Your name can't be empty.");
  myName = v; store.set('name', v); toast('Name saved.');
}
Object.assign(ACTS, {
  profile() { if (!['profile', 'submit', 'game'].includes(ui.view)) ui.back = ui.view; ui.view = 'profile'; ui.viewer = ui.zoom = ui.sheet = null; },
  'pf-back'() { ui.view = ui.back || 'home'; },
  'pf-rename'() { pfRename(); return false; },
  'cloud-in'() { cloudSignIn(); return false; },
  'cloud-consent'() { cloudSignIn(true); return false; },
  'cloud-recheck'() { cloudRecheck(); }, // renders "Checking your account…" now; cloudStart renders the answer
  'cloud-out'() { cloudSignOut().then(render); return false; },
  'cloud-save'() { cloudSaveGame().then(r => r.ok && toast('Saved to the cloud.')); return false; },
  'pf-export'() {
    downloadFile(`tismtopia-save-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'tismtopia-tcg', kind: 'save', v: 1, exported: new Date().toISOString(), data: saveBlob() }), 'application/json');
    return false;
  },
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'pf-name') pfRename();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('label.btn')) { e.preventDefault(); e.target.querySelector('input[type=file]')?.click(); }
});
// Import: a file from anywhere is untrusted. Size, wrapper and every key are checked (cleanSave), and the player confirms before anything is replaced.
document.addEventListener('change', async e => {
  if (e.target.id !== 'pf-import') return;
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (f.size > 1048576) return toast('That file is too big to be a save (over 1 MB).');
  let data;
  try {
    const o = JSON.parse(await f.text());
    if (o?.app !== 'tismtopia-tcg' || o.kind !== 'save' || o.v !== 1) throw new Error('This is not a Tismtopia save file.');
    data = cleanSave(o.data);
  } catch (err) { return toast(err instanceof SyntaxError ? "That file isn't a save file." : err.message); }
  if (!confirm(`Load this save? It replaces the progress on this device.\n\n${saveSummary(data)}${data.name ? `\nName: ${data.name}` : ''}`)) return;
  writeSave(data); location.reload();
});
