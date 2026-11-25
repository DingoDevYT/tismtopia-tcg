// New-player experience: the sign-in gate on the public site, the starter picker and its 8 free packs (which become the first
// deck), and Reset my account. The guided tour that runs after the packs is js/tour.js. Progress lives in tismtopia.onboard
// ({ starter, opened, done }, or { done, legacy } for saves from before this; see the top of app.js).

// ---------------- pure (the tests load only this part) ----------------
// Must this address sign in before playing? The public site always (no URL flag switches it off there); ?gate=1 anywhere else, for testing.
const gateOn = (host, search) => /(^|\.)github\.io$/i.test(host) || /[?&]gate=1(&|$)/.test(search);

// A starter deck dealt into 8 packs, the same every time: its 4 strongest copies go to packs 7 and 8, every other copy to the emptiest
// pack that doesn't hold that card yet (so copies spread out), and each pack ends on its strongest card. Strength = rarity, then cost.
const ONB_PACKS = 8;
function starterPacks(s) {
  const R = { C: 0, U: 1, R: 2, UR: 3 }, pow = id => R[CARD[id].rarity || 'C'] * 10 + (CARD[id].cost ?? 1), by = (a, b) => pow(a) - pow(b) || (a < b ? -1 : a > b ? 1 : 0);
  const all = Object.entries(s.cards).flatMap(([id, n]) => Array(n).fill(id)).sort(by).reverse(), size = all.length / ONB_PACKS;
  const packs = Array.from({ length: ONB_PACKS }, () => []);
  all.slice(0, 4).forEach((id, k) => packs[ONB_PACKS - 1 - (k % 2)].push(id));
  let p = 0;
  for (const id of all.slice(4)) {
    const open = packs.map((_, k) => (p + k) % ONB_PACKS).filter(k => packs[k].length < size).sort((a, b) => packs[a].length - packs[b].length);
    const k = open.find(k => !packs[k].includes(id)) ?? open[0];
    packs[k].push(id); p = (k + 3) % ONB_PACKS; // a stride of 3 so neighbouring packs don't come out alike
  }
  return packs.map(pk => pk.sort(by));
}
// The deck a player owns after opening all 8: exactly the cards the packs held.
const packsDeck = (s, packs) => ({ name: s.name, captain: s.captain, cards: packs.flat().reduce((o, id) => ((o[id] = (o[id] || 0) + 1), o), {}) });
// One honest line about a starter, from its contents: what kinds of cards and how cheap they are.
function starterLine(s) {
  const ids = Object.entries(s.cards).flatMap(([id, n]) => Array(n).fill(id)), n = t => ids.filter(id => CARD[id].type === t).length;
  const say = (k, one) => `${k || 'no'} ${one}${k === 1 ? '' : 's'}`;
  return `${say(n('character'), 'Character')} · ${say(n('bit'), 'Item')} · ${say(n('evil'), 'Evil')} · average cost ${(ids.reduce((a, id) => a + (CARD[id].cost ?? 1), 0) / ids.length).toFixed(1)}`;
}

// ---------------- browser only ----------------
// ---------- sign-in gate: on the public site nothing shows until you're signed in with Discord ----------
const gate = { on: !!CLOUD.url && gateOn(location.hostname, location.search), state: 'out', msg: '', passed: false, el: null };
const gateUp = () => gate.on && !gate.passed;

function gatePaint() {
  if (!gate.el) {
    gate.el = Object.assign(document.createElement('div'), { className: 'title-screen gate', tabIndex: -1 });
    gate.el.setAttribute('role', 'dialog'); gate.el.setAttribute('aria-modal', 'true'); gate.el.setAttribute('aria-label', 'Sign in');
    gate.el.addEventListener('click', e => {
      const b = e.target.closest('button');
      const g = b?.dataset.gate;
      if (g === 'in' || g === 'consent') gateSignIn(g === 'consent'); else if (g === 'retry') gateCheck(); else if (g === 'recheck') { cloudRecheck(); gateCheck(); } else if (gate.state === 'in') gatePass();
    });
    gate.el.addEventListener('keydown', e => { if (gate.state === 'in' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); gatePass(); } });
    document.body.append(gate.el);
  }
  const s = gate.state;
  gate.el.classList.toggle('ready', s === 'in');
  gate.el.innerHTML = `<img src="art/logo.png" alt="Tismtopia TCG">${s === 'checking' ? '<p class="gate-line">Checking your account… <span class="spin"></span></p>'
    : s === 'down' ? '<p class="gate-line">Can\'t reach the server</p><p class="muted">Check your connection, then try again.</p><button class="btn primary gate-btn" data-gate="retry">Retry</button>'
    : s === 'in' ? '<p class="gate-tap">Tap anywhere to start</p>'
    : s === 'block' ? (([t, p, b, a]) => `${t ? `<p class="gate-line"><b>${t}</b></p>` : ''}<p class="${t ? 'muted' : 'gate-line'}">${p}</p><button class="btn primary gate-btn" data-gate="${a}">${b}</button>`)(MEMBER_BLOCK[cloud.block])
    : `<p class="gate-line">Sign in to play — your cards and progress are saved to your account</p><button class="btn primary gate-btn" data-gate="in"${s === 'busy' ? ' disabled' : ''}>${s === 'busy' ? 'Opening Discord…' : 'Sign in with Discord'}</button>`}
    <p class="gate-msg" role="status">${esc(gate.msg)}</p><small class="ver">v${APP_VERSION}</small>`;
  (gate.el.querySelector('button:not([disabled])') || gate.el).focus({ preventScroll: true });
}
// Is there a session, and can we reach the account server? 8 s at most; any failure = "Can't reach the server" with Retry.
async function gateCheck() {
  gate.state = 'checking'; gatePaint();
  const check = (async () => {
    if (!(await cloudReady())) return 'down'; // the sign-in library didn't load (CDN down or offline)
    if (await cloudUser()) return 'in'; // a saved session of a verified Discord-server member; this also finishes a return from Discord
    if (cloud.block) return 'block'; // signed in, but not (or no longer, or not checkably) a member: the reason and its button
    const r = await fetch(CLOUD.url + '/auth/v1/settings', { headers: { apikey: CLOUD.key } }).catch(() => null);
    return r?.ok ? 'out' : 'down';
  })().catch(() => 'down');
  gate.state = await Promise.race([check, new Promise(r => setTimeout(r, 8000, 'down'))]);
  if (gate.state === 'out' && fromDiscord && !gate.msg) gate.msg = "Sign-in didn't finish. Try again.";
  gatePaint();
}
async function gateSignIn(consent) {
  Object.assign(gate, { state: 'busy', msg: '' }); gatePaint();
  const r = await cloudSignIn(consent); // on success the browser leaves for Discord and comes back signed in
  if (r.ok) return;
  Object.assign(gate, r.why === 'offline' ? { state: 'down', msg: '' } : { state: 'out', msg: `Sign-in didn't start: ${r.why}` }); gatePaint();
}
function gatePass() {
  const el = gate.el; gate.passed = true; gate.el = null; $app.inert = false;
  el.classList.add('gone'); setTimeout(() => el.remove(), 400);
  render();
}
if (gate.on) {
  title.remove(); // audio.js's "Tap anywhere to start": the gate takes its place, and any tap on it unlocks sound the same way
  $app.inert = true; $app.innerHTML = '';
  gateCheck();
}
// Signing out on the public site goes back to the gate.
ACTS['cloud-out'] = () => {
  cloudSignOut().then(r => { if (r.ok && gate.on) { Object.assign(gate, { passed: false, state: 'out', msg: 'You signed out.' }); $app.inert = true; gatePaint(); } render(); });
  return false;
};

// ---------- starter picker and the 8 free packs ----------
const onbSave = patch => store.set('onboard', (onb = { ...onb, ...patch }));
const onbStarter = () => STARTERS.find(s => s.name === onb.starter);
let onbDealt = null;
const onbPacks = () => (onbDealt?.[0] === onbStarter() ? onbDealt[1] : (onbDealt = [onbStarter(), starterPacks(onbStarter())])[1]);
// Pull objects for the opening screens; NEW = the first copy you'll own.
// Fixed treats so the packs build up: holos from pack 3, reverse holos from pack 6, and pack 8 ends on a 4-star full art.
// Each list is applied to that pack's Characters from the last card backwards (Items and Evils only come in normal).
const ONB_FIN = { 3: ['holo'], 4: ['holo'], 5: ['holo'], 6: ['rev'], 7: ['rev', 'holo'], 8: ['full', 'rev', 'holo'] };
function onbFinishes(ids, k) {
  const out = ids.map(() => 'normal'), want = [...(ONB_FIN[k] || [])];
  for (let i = ids.length - 1; i >= 0 && want.length; i--) if (CARD[ids[i]].type === 'character') out[i] = want.shift();
  return out;
}
const ONB_RANK = { normal: 0, holo: 1, rev: 2, full: 3 }; // the shiny ones are revealed last, the best one at the very end
const onbCards = (ids, k) => { const seen = {}, fin = onbFinishes(ids, k);
  return ids.map((id, i) => ({ id, rarity: CARD[id].rarity || 'C', finish: fin[i], i })).sort((x, y) => ONB_RANK[x.finish] - ONB_RANK[y.finish] || x.i - y.i)
    .map(({ id, rarity, finish }) => ({ id, rarity, finish, isNew: !(coll[id]?.n > 0) && (seen[id] = (seen[id] || 0) + 1) === 1 })); };
// A free pack runs through the normal opening screens (packs.js viewOpen); `free` = its number, or 'rest' for "Open all the rest".
const onbPack = k => ({ pack: PACKS[0].id, free: k, stage: 'tear', i: 0, cards: onbCards(onbPacks()[k - 1], k) });
// Cards are added when a pack's summary shows, and only if that pack isn't counted yet: a reload never gives a pack twice or loses one.
function onbGrant(o) {
  const from = o.free === 'rest' ? o.from : o.free;
  if (onb.opened !== from - 1) return;
  for (const p of o.cards) { const e = (coll[p.id] ||= { n: 0, f: {} }); e.n++; e.f[p.finish] = (e.f[p.finish] || 0) + 1; }
  store.set('collection', coll);
  onbSave({ opened: o.free === 'rest' ? ONB_PACKS : o.free });
}
// All 8 open: the deck is exactly what they held, selected, then the tour starts on it.
function onbFinish() {
  const s = onbStarter(), d = { id: uid(), ...packsDeck(s, onbPacks()) };
  decks = [...decks.filter(x => count(x)), d]; ui.deckId = d.id; saveDecks(); store.set('deck', d.id);
  onbSave({ done: true }); ui.open = null; ui.view = 'deck';
  store.set('tour', { step: 0, first: true }); // js/tour.js starts (or, at load, resumes) from this
  if (typeof tourStart === 'function') tourStart(0, true);
}
// Which screen a player still in the starter packs sees, whatever ui.view says.
function onbRoute() {
  if (!onbStarter()) { ui.view = 'welcome'; ui.open = null; return; }
  if (ui.open?.free) { if (ui.open.stage === 'summary') onbGrant(ui.open); ui.view = 'open'; return; }
  if (onb.opened >= ONB_PACKS) return onbFinish();
  ui.open = onbPack(onb.opened + 1); ui.view = 'open';
}
// Signed in on a new device: wait for the cloud save check, so someone with a cloud save isn't handed a starter first.
let onbWait = !onb.done && !!cloud.start;
if (onbWait) { const stop = () => { if (onbWait) { onbWait = false; render(); } }; cloud.start.then(stop, stop); setTimeout(stop, 8000); }

function viewWelcome() {
  const sel = ui.onbSel, logo = '<div class="logo"><img src="art/logo.png" alt="Tismtopia"></div>';
  if (onbWait) return `<div class="onb">${logo}<p class="muted center">Checking your save… <span class="spin"></span></p></div>`;
  return `<div class="onb">${logo}<h1 class="title">Pick your Captain's starter</h1><div class="rainbow"></div>
    <p class="muted center onb-sub">You get ${ONB_PACKS} free packs. Together they make your first deck.</p>
    <div class="onb-picks">${STARTERS.map((s, i) => { const c = CARD[s.captain];
      return `<button class="onb-pick neu${sel === i ? ' on' : ''}" data-act="onb-sel" data-i="${i}" aria-pressed="${sel === i}">${renderAvatar(c, ' xl')}
        <span class="onb-txt"><b>${esc(s.name)}</b><small>Captain ${esc(c.name)} · ${esc(c.style)}</small><span class="onb-line">${starterLine(s)}</span><small>${esc(c.text)}</small></span></button>`; }).join('')}</div>
    <button class="btn primary wide onb-go" data-act="onb-pick"${sel == null ? ' disabled' : ''}>${sel == null ? 'Tap a starter to choose it' : `Open ${ONB_PACKS} free packs: ${esc(STARTERS[sel].name)}`}</button></div>`;
}
Object.assign(ACTS, {
  'onb-sel'(d) { ui.onbSel = Number(d.i); },
  'onb-pick'() { const s = STARTERS[ui.onbSel]; if (!s || onb.starter) return; onbSave({ starter: s.name, opened: 0 }); ui.onbSel = null; },
  'onb-next'() { ui.open = null; }, // the router opens the next pack, or finishes after the 8th
  'onb-rest'() { // skip the animations: every pack not counted yet, in one summary
    const o = ui.open, from = o.stage === 'summary' ? o.free + 1 : o.free;
    ui.open = { pack: PACKS[0].id, free: 'rest', from, stage: 'summary', i: 0, cards: onbPacks().slice(from - 1).flatMap((ids, j) => onbCards(ids, from + j)) };
  },
});
// The free packs' own labels and buttons on the normal opening screens (economy.js already hides Sell and Back for them).
const viewOpenNoOnboard = viewOpen;
viewOpen = () => {
  const o = ui.open, html = viewOpenNoOnboard(); if (!o?.free) return html;
  const rest = '<button class="btn sm" data-act="onb-rest">Open all the rest</button>', k = o.free === 'rest' ? ONB_PACKS : o.free;
  if (o.stage === 'tear') return html.replace('<p class="open-hint">', `<p class="onb-tag">Starter Pack ${k} of ${ONB_PACKS} · free</p>$&`).replace('data-act="tear-now">Tap to open</button>', `$&${k >= 2 ? rest : ''}`);
  if (o.stage !== 'summary') return html;
  return html.replace('<h1 class="title">Your pulls</h1>', `<h1 class="title">${o.free === 'rest' ? `Starter Packs ${o.from} to ${ONB_PACKS}` : `Starter Pack ${k} of ${ONB_PACKS}`}</h1>`)
    .replace(/<div class="row2" style="width:auto;margin:16px">[\s\S]*?<\/div>/, `<div class="row2 onb-row">${k < ONB_PACKS
      ? `<button class="btn primary" data-act="onb-next">Open next pack (${k + 1} of ${ONB_PACKS})</button>${k >= 2 ? rest : ''}` : '<button class="btn primary" data-act="onb-next">See your deck</button>'}</div>`);
};

// ---------- Reset my account (Profile > Danger zone; the ?dev panel calls resetAccount straight away) ----------
const resetOk = () => String(ui.resetText || '').trim().toUpperCase() === 'RESET';
function resetHtml() {
  if (ui.resetBusy) return `<div class="cloud-ask">${sheet('<h2>Resetting your account…</h2><p class="muted center"><span class="spin"></span></p>', false)}</div>`;
  return `<div class="cloud-ask reset-ask">${sheet(`<h2>Reset my account?</h2>
    <p class="muted center">This wipes your progress ${cloud.user ? 'on this device and in your cloud save' : 'on this device'}, and you start again with a starter pick. It can't be undone.</p>
    <div class="adj neu-in"><b>Wiped</b><small>Your coins (back to ${fmt(START_COINS)}), every card you own, your decks, favourites, battle stats, and tutorial and tour progress.</small></div>
    <div class="adj neu-in"><b>Kept</b><small>Your Discord sign-in, the cards you submitted and their review status, your display name, and your volume and dark mode settings.</small></div>
    <label class="reset-type" for="reset-type">Type RESET to confirm</label><input id="reset-type" class="input" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(ui.resetText || '')}">
    <div class="row2"><button class="btn" data-act="reset-cancel">Cancel</button><button class="btn primary" id="reset-go" data-act="reset-go"${resetOk() ? '' : ' disabled'}>Reset my account</button></div>`, false)}</div>`;
}
async function resetAccount() {
  Object.assign(ui, { resetAsk: false, resetBusy: true }); render();
  // Fresh values written out (not just removed), so a device that later picks this save from the cloud gets every key replaced too.
  try { for (const k of ['deck', 'tour']) localStorage.removeItem('tismtopia.' + k); } catch { /* private mode */ }
  writeSave({ collection: {}, coins: START_COINS, decks: [], favs: [], stats: {}, onboard: { opened: 0 }, resetAt: new Date().toISOString() }); // straight to storage: no auto-save races the upload below
  if (cloud.user) {
    decks = [{ id: uid(), name: 'My Deck', captain: null, cards: {} }]; ui.deckId = decks[0].id; // the cloud copy takes its decks from memory
    await cloudSaveGame(true); // the reset wins over whatever the cloud held; if this fails, the next sign-in sync uploads it (or asks, naming the reset)
  }
  location.reload();
}
Object.assign(ACTS, {
  'reset-ask'() { Object.assign(ui, { resetAsk: true, resetText: '' }); setTimeout(() => document.getElementById('reset-type')?.focus()); },
  'reset-cancel'() { ui.resetAsk = false; },
  'reset-go'() { if (resetOk()) resetAccount(); return false; },
});
document.addEventListener('input', e => { if (e.target.id === 'reset-type') { ui.resetText = e.target.value; const b = document.getElementById('reset-go'); if (b) b.disabled = !resetOk(); } });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ui.resetAsk) { ui.resetAsk = false; render(); }
  if (e.key === 'Enter' && e.target.id === 'reset-type' && resetOk()) resetAccount();
});

// Outermost screen hook: the gate hides everything; a player still in the starter packs only sees those screens.
const renderNoOnboard = render;
render = function () {
  if (gateUp()) { $app.innerHTML = ''; return; }
  if (!onb.done) onbRoute();
  renderNoOnboard();
  if (!onb.done) $app.querySelector('.acct .profile')?.remove(); // no way out of the starter packs; they take a minute
  if (ui.resetAsk || ui.resetBusy) $app.insertAdjacentHTML('beforeend', resetHtml());
};
render();
