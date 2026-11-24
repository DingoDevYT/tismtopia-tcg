// Packs and collection: pick a pack, swipe to tear it open, flick through 5 cards one by one (rares get a reveal),
// then a summary. The collection (cards you own, and which finishes) lives in localStorage; you need to own a card to deck it.
// shortcut: unlimited free packs while testing; add a timer or battle rewards before friends grind it.
const PACKS = [
  { id: 'heehn', name: 'HEEHN Starter Pack', colour: '#1840c8' },
  { id: 'empirical', name: 'Empirical Ascension', colour: '#1f9bff' },
  { id: 'foreseen', name: 'Foreseen Knowledge', colour: '#5b1fd6' },
];
const RARITY_NAME = { C: 'Common', U: 'Uncommon', R: 'Rare', UR: 'Ultra Rare' };
// Stars: 0 plain common, 1 rarer card, 2 holo, 3 reverse holo, 4 full art, 5 rainbow.
const starN = (id, f = 'normal') => ({ holo: 2, rev: 3, full: 4, rainbow: 5 }[f] ?? (CARD[id]?.type !== 'character' || (CARD[id]?.rarity || 'C') === 'C' ? 0 : 1)); // Items and Evils are always 0 stars
const starsOf = (id, f) => { const n = starN(id, f); return n ? '★'.repeat(n) : '☆'; };
const FINISH_NAME = { normal: '', rev: 'Reverse Holo', holo: 'Holo', full: 'Full Art', rainbow: 'Rainbow' };
const FINISH_CLS = { normal: '', rev: 'v-rev', holo: 'v-holo', full: 'v-full v-holo', rainbow: 'v-full v-holo v-rainbow' };

// Everyone owns the free starter decks (topped up on every load, so new starters reach old saves).
let coll = store.get('collection', null);
if (!coll || typeof coll !== 'object') coll = {};
for (const s of STARTERS) for (const [id, n] of Object.entries(s.cards)) {
  const have = coll[id]?.n || 0;
  if (have < n) coll[id] = { n, f: { ...(coll[id]?.f || {}), normal: (coll[id]?.f?.normal || 0) + n - have } };
}
store.set('collection', coll);
const owned = id => coll[id]?.n || 0;
const ownedCount = () => CARDS.filter(c => owned(c.id)).length;

// Slot odds (5 cards, like TCG Pocket): three commons-ish, a 30% shot at a rare in slot 4, slot 5 always rare or better. Finishes roll per card.
const pool = (r, pk) => CARDS.filter(c => c.type !== 'captain' && (c.rarity || 'C') === r && (!pk || typeof PACK_SET === 'undefined' || !PACK_SET[pk] || PACK_SET[pk].includes(c.id)));
const BOOST = { heehn: 1, empirical: 1.25, foreseen: 1.6 }; // pricier packs: better odds of special finishes
const boosted = (table, pk) => { const k = BOOST[pk] || 1, sp = table.filter(([, f]) => f !== 'normal').map(([p, f]) => [p * k, f]), rest = 1 - sp.reduce((a, [p]) => a + p, 0);
  return rest > 0 ? [...sp, [rest, 'normal']] : sp.map(([p, f]) => [p / (1 - rest), f]); };
const roll = table => { let x = Math.random(); for (const [p, v] of table) { if ((x -= p) < 0) return v; } return table[table.length - 1][1]; };
const COMMONISH = [[0.85, 'C'], [0.13, 'U'], [0.02, 'R']];
const SLOTS = [COMMONISH, COMMONISH, COMMONISH, [[0.7, 'U'], [0.25, 'R'], [0.05, 'UR']], [[0.75, 'R'], [0.25, 'UR']]];
const GOD_ODDS = 1 / 1000, GOD_SLOT = [[0.6, 'R'], [0.4, 'UR']]; // god pack: twice TCG Pocket's 1 in 2,000, every card rare+ and foil
// Normal is always the most likely; holo beats reverse holo beats full art at every rarity.
const FINISH = { C: [[0.06, 'holo'], [0.03, 'rev'], [0.91, 'normal']], U: [[0.08, 'holo'], [0.04, 'rev'], [0.005, 'full'], [0.875, 'normal']],
  R: [[0.15, 'holo'], [0.07, 'rev'], [0.02, 'full'], [0.76, 'normal']], UR: [[0.25, 'holo'], [0.12, 'rev'], [0.06, 'full'], [0.01, 'rainbow'], [0.56, 'normal']] }; // 5★ rainbow: Ultra Rare Characters only
function openPack(packId) {
  const god = Math.random() < GOD_ODDS;
  const cards = (god ? Array(5).fill(GOD_SLOT) : SLOTS).map(t => {
    let r = roll(t); while (!pool(r, packId).length && r !== 'C') r = { UR: 'R', R: 'U', U: 'C' }[r];
    const list = pool(r, packId), c = list[Math.floor(Math.random() * list.length)];
    return { id: c.id, rarity: r, finish: c.type === 'character' ? (god ? roll([[0.45, 'holo'], [0.3, 'rev'], [0.2, 'full'], [0.05, 'rainbow']]) : roll(boosted(FINISH[r], packId))) : 'normal', isNew: false }; // only Characters come in special finishes for now
  });
  cards.forEach(p => { p.isNew = !(coll[p.id]?.f?.[p.finish] > 0); const e = (coll[p.id] ||= { n: 0, f: {} }); e.n++; e.f[p.finish] = (e.f[p.finish] || 0) + 1; });
  store.set('collection', coll);
  if (god) ui.toast = 'GOD PACK!';
  return { pack: packId, cards, stage: 'tear', i: 0, god };
}

const packArt = (p, cls = '') => `<div class="pack ${cls}" style="--pc:${p.colour}"><img src="art/local/pack-${p.id}.png" alt="" onerror="this.remove()"><div class="pack-fallback"><img src="art/logo.png" alt=""><b>${p.name}</b><small>5 cards</small></div></div>`;

// Pack select: a wheel like TCG Pocket. Swipe or use the arrows; tap the centre pack (or Open) to open it.
function viewPacks() {
  const n = PACKS.length, idx = ((ui.packIdx || 0) % n + n) % n, cur = PACKS[idx];
  const slots = PACKS.map((pk, i) => { let o = i - idx; if (o > n / 2) o -= n; if (o < -n / 2) o += n;
    return `<button class="slot${o === 0 ? ' center' : ''}" style="--o:${o};--a:${Math.abs(o)}" data-act="${o === 0 ? 'pick-pack' : 'wheel-to'}" data-p="${pk.id}" data-i="${i}" aria-label="${pk.name}">${packArt(pk)}</button>`; }).join('');
  return `<div class="wheel-stage" style="--pc:${cur.colour}">
    <p class="muted center" style="margin:0">You own ${ownedCount()} of ${CARDS.length} cards</p>
    <div class="wheel">${slots}<button class="wheel-arrow l" data-act="wheel-step" data-d="-1" aria-label="Previous pack">‹</button><button class="wheel-arrow r" data-act="wheel-step" data-d="1" aria-label="Next pack">›</button></div>
    <p class="wheel-name">${cur.name}</p>
    <div class="wheel-dots">${PACKS.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('')}</div>
    <button class="btn primary wheel-open" data-act="pick-pack" data-p="${cur.id}">Open</button>
  </div>${tabbar('packs')}`;
}

// Edge colour of a card in the stack: foil and rares glint so you can peek before revealing.
const edgeOf = c => (c.finish === 'full' || c.finish === 'rainbow') ? 'edge-full' : c.finish === 'holo' ? 'edge-holo' : c.finish === 'rev' ? 'edge-rev' : c.rarity === 'UR' || c.rarity === 'R' ? 'edge-gold' : '';
function viewOpen() {
  const o = ui.open, P = PACKS.find(p => p.id === o.pack);
  if (o.stage === 'tear') return `<div class="open-stage">
    <p class="open-hint">Swipe across the top to cut it open</p>
    <div class="tear-zone"><div class="rays"></div>${packArt(P, 'big body')}${packArt(P, 'big strip')}<div class="tear-guide"></div><div class="cut"><i></i></div></div>
    <button class="btn sm" data-act="tear-now">Tap to open</button></div>`;
  if (o.stage === 'deck') return `<div class="open-stage deck-stage">
    <p class="open-hint">Spin the stack to peek at the edges</p>
    <div class="deck3d" data-act="noop"><div class="deck-rot">${o.cards.map((c, k) => `<div class="dc ${edgeOf(c)}" style="--z:${(o.cards.length - k) * 7}px"></div>`).join('')}</div></div>
    <button class="btn primary" data-act="start-reveal">Reveal cards</button></div>`;
  if (o.stage === 'reveal') {
    const cur = o.cards[o.i], c = CARD[cur.id], rare = cur.rarity === 'R' || cur.rarity === 'UR' || cur.finish !== 'normal';
    const behind = o.cards.slice(o.i + 1).map((n, k) => `<div class="stack-back ${edgeOf(n)}" style="--k:${k + 1}"></div>`).join('');
    return `<div class="open-stage reveal${rare ? ' rare r-' + cur.rarity : ''}" data-act="next-card">
      ${rare ? '<div class="burst"></div>' : ''}
      <div class="stack" data-act="noop">${behind}${renderCard((cur.finish === 'full' || cur.finish === 'rainbow') ? { ...c, crop: null } : c, { cls: `zoom flick enter ${FINISH_CLS[cur.finish]}` })}</div>
      <p class="pull-tag">${cur.isNew ? '<span class="new">NEW</span>' : ''}${starsOf(cur.id, cur.finish)}${cur.finish !== 'normal' ? ` · ${FINISH_NAME[cur.finish]}` : ''}</p>
      <p class="open-hint">Drag to tilt · flick to the side for the next card (${o.i + 1}/${o.cards.length})</p></div>`;
  }
  return `${header('Your pulls')}
    <div class="pull-grid">${o.cards.map(p => `<div class="pull">${renderCard((p.finish === 'full' || p.finish === 'rainbow') ? { ...CARD[p.id], crop: null } : CARD[p.id], { cls: FINISH_CLS[p.finish], attrs: tappable('view-card', `data-id="${p.id}" data-f="${p.finish}"`) })}${p.isNew ? '<span class="new">NEW</span>' : ''}<small>${starsOf(p.id, p.finish)}${p.finish !== 'normal' ? ` · ${FINISH_NAME[p.finish]}` : ''}</small></div>`).join('')}</div>
    <div class="row2" style="margin:16px"><button class="btn primary" data-act="pick-pack" data-p="${o.pack}">Open another</button><button class="btn" data-act="go" data-to="packs">Done</button></div>
    ${overlay()}${viewer()}`;
}

Object.assign(ACTS, {
  'wheel-step'(d) { wheelGo((ui.packIdx || 0) + Number(d.d)); return false; },
  'wheel-to'(d) { if (Date.now() - lastSwipe < 350) return false; wheelGo(Number(d.i)); return false; },
  'pick-pack'(d) { if (Date.now() - lastSwipe < 350) return false; ui.open = openPack(d.p); ui.view = 'open'; }, // a swipe isn't a tap
  'tear-now'() { tearOpen(); return false; },
  'start-reveal'() { ui.open.stage = 'reveal'; ui.open.i = 0; },
  'next-card'() { flick(-1); return false; },
  noop() { return false; },
});
function advance() { const o = ui.open; if (++o.i >= o.cards.length) o.stage = 'summary'; }
function tearOpen() {
  const z = $app.querySelector('.tear-zone');
  if (z && !calm) { z.style.setProperty('--tear', 1); z.classList.add('torn'); setTimeout(() => { ui.open.stage = 'deck'; render(); }, 1100); }
  else { ui.open.stage = 'deck'; render(); }
}
// Finger gestures for opening: tear the strip, spin the deck, tilt and flick the revealed card.
let drag = null, deckRot = [-25, 12];
const setVars = (el, vars) => { for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v); };
function flick(dir) {
  const o = ui.open; if (!o || o.stage !== 'reveal') return;
  const top = $app.querySelector('.stack .card');
  if (top && !calm) { top.classList.remove('enter'); top.classList.add(dir < 0 ? 'out-l' : 'out-r'); setTimeout(() => { advance(); render(); }, 280); }
  else { advance(); render(); }
}
document.addEventListener('pointerdown', e => {
  if (ui.view !== 'open') return;
  const zone = e.target.closest?.('.tear-zone'), deck = e.target.closest?.('.deck3d'), card = e.target.closest?.('.stack .card');
  const el = zone || deck || card; if (!el) return;
  const r = el.getBoundingClientRect();
  if (zone && e.clientY > r.top + r.height * 0.3) return;               // tearing starts on the top strip
  drag = { kind: zone ? 'tear' : deck ? 'deck' : 'card', el, r, x0: e.clientX, y0: e.clientY, t0: performance.now(), rot: deck ? deckRot : null };
  el.setPointerCapture?.(e.pointerId); if (card) card.classList.add('held');
});
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const { kind, el, r } = drag, dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (kind === 'tear') {
    const t = Math.max(drag.t || 0, Math.min(1, (e.clientX - r.left) / r.width)); drag.t = t; // the cut only grows, like a blade
    el.style.setProperty('--tear', t);
    if (t > 0.92) { drag = null; tearOpen(); }
  } else if (kind === 'deck') {
    const ry = Math.max(-75, Math.min(75, drag.rot[0] + dx * 0.5)), rx = Math.max(-35, Math.min(45, drag.rot[1] - dy * 0.3));
    setVars(el, { '--dry': ry + 'deg', '--drx': rx + 'deg' }); drag.cur = [ry, rx];
  } else {
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    setVars(el, { '--dx': dx * 0.8 + 'px', '--dy': dy * 0.25 + 'px', '--ry': Math.max(-28, Math.min(28, (x - 0.5) * 40 + dx * 0.05)) + 'deg', '--rx': Math.max(-24, Math.min(24, (0.5 - y) * 34)) + 'deg', '--mx': Math.max(0, Math.min(100, x * 100)) + '%', '--my': Math.max(0, Math.min(100, y * 100)) + '%', '--fx': Math.max(0, Math.min(1, x)), '--fy': Math.max(0, Math.min(1, y)), '--fc': Math.min(1, Math.hypot(x - 0.5, y - 0.5) * 2), '--co': 1 });
  }
});
document.addEventListener('pointerup', e => {
  if (!drag) return;
  const { kind, el } = drag, dx = e.clientX - drag.x0, v = Math.abs(dx) / Math.max(1, performance.now() - drag.t0);
  if (kind === 'tear') el.style.setProperty('--tear', 0);
  else if (kind === 'deck') { deckRot = drag.cur || deckRot; drag = null; return; }
  else { el.classList.remove('held'); if (Math.abs(dx) > 90 || (v > 0.6 && Math.abs(dx) > 30)) { drag = null; flick(dx < 0 ? -1 : 1); return; } for (const k of ['--dx', '--dy', '--rx', '--ry', '--mx', '--my', '--fx', '--fy', '--fc', '--co']) el.style.removeProperty(k); }
  drag = null;
});

// Wheel moves update the existing packs in place so the CSS transition animates them (re-rendering would snap).
function wheelGo(idx) {
  const n = PACKS.length; ui.packIdx = idx; const cur = ((idx % n) + n) % n, pk = PACKS[cur];
  document.querySelectorAll('.wheel .slot').forEach((el, i) => {
    let o = i - cur; if (o > n / 2) o -= n; if (o < -n / 2) o += n;
    el.style.setProperty('--o', o); el.style.setProperty('--a', Math.abs(o)); el.classList.toggle('center', o === 0); el.dataset.act = o === 0 ? 'pick-pack' : 'wheel-to';
  });
  const st = $app.querySelector('.wheel-stage'); if (!st) return render();
  st.style.setProperty('--pc', pk.colour);
  st.querySelector('.wheel-name').textContent = pk.name;
  st.querySelectorAll('.wheel-dots i').forEach((d, i) => d.classList.toggle('on', i === cur));
  st.querySelector('.wheel-open').dataset.p = pk.id;
  if (typeof price === 'function') { st.querySelector('.wheel-open').innerHTML = `Open for ${COIN}${fmt(price(pk.id))}`; const ob = st.querySelector('.odds-btn') || $app.querySelector('.odds-btn'); if (ob) ob.dataset.p = pk.id; } // economy.js prices
}
// Swipe: the packs follow your finger, then ease to the nearest one.
let wheelX = null, lastSwipe = 0;
document.addEventListener('pointerdown', e => { const w = e.target.closest?.('.wheel'); if (ui.view === 'packs' && w && !e.target.closest('.wheel-arrow')) { wheelX = { x: e.clientX, w, slotW: w.querySelector('.slot').getBoundingClientRect().width * 0.78 }; } });
document.addEventListener('pointermove', e => { if (!wheelX) return; const d = (e.clientX - wheelX.x) / wheelX.slotW; if (Math.abs(e.clientX - wheelX.x) > 6) { wheelX.w.classList.add('dragging'); wheelX.w.style.setProperty('--drag', d); } });
document.addEventListener('pointerup', e => {
  if (!wheelX) return; const { w, slotW, x } = wheelX, dx = e.clientX - x; wheelX = null;
  w.classList.remove('dragging'); w.style.setProperty('--drag', 0);
  if (Math.abs(dx) > 30) { lastSwipe = Date.now(); const steps = Math.round(dx / slotW) || Math.sign(dx); wheelGo((ui.packIdx || 0) - steps); }
});

// ---------------- collection: every card, what you own, favourites, search / filter / sort ----------------
let favs = new Set(store.get('favs', []));
const RANK = { C: 0, U: 1, R: 2, UR: 3 };
const bestFinish = id => { if (CARD[id]?.type !== 'character') return 'normal'; const f = coll[id]?.f || {}; return f.rainbow ? 'rainbow' : f.full ? 'full' : f.rev ? 'rev' : f.holo ? 'holo' : 'normal'; };
function viewCollection() {
  const s = (ui.coll ||= { q: '', own: 'all', type: 'all', rar: 'all', sort: 'no' }), q = s.q.trim().toLowerCase();
  let list = CARDS.filter(c => (s.own === 'all' || (s.own === 'owned' ? owned(c.id) : s.own === 'missing' ? !owned(c.id) : favs.has(c.id)))
    && (s.type === 'all' || c.type === s.type) && (s.rar === 'all' || String(starN(c.id, owned(c.id) ? bestFinish(c.id) : 'normal')) === s.rar)
    && (!q || [c.name, c.text, c.role, ...(c.moves || []).flatMap(m => [m.name, m.text])].some(t => t && t.toLowerCase().includes(q))));
  const by = { no: (a, b) => a.no.localeCompare(b.no), rarity: (a, b) => RANK[b.rarity || 'C'] - RANK[a.rarity || 'C'] || a.no.localeCompare(b.no), name: (a, b) => a.name.localeCompare(b.name), copies: (a, b) => owned(b.id) - owned(a.id) || a.no.localeCompare(b.no) };
  list = [...list].sort(by[s.sort]);
  const chip = (key, val, label) => `<button class="chip${s[key] === val ? ' on' : ''}" data-act="coll-set" data-k="${key}" data-v="${val}">${label}</button>`;
  return `${header('Collection')}
  <div class="panel neu coll-tools">
    <div class="coll-progress"><b>${ownedCount()} / ${CARDS.length}</b> cards owned<div class="progress"><i style="width:${(100 * ownedCount() / CARDS.length).toFixed(1)}%"></i></div></div>
    <input id="coll-search" class="coll-search" type="search" placeholder="Search names, moves, text…" value="${esc(s.q)}" autocomplete="off">
    <div class="chips">${chip('own', 'all', 'All')}${chip('own', 'owned', 'Owned')}${chip('own', 'missing', 'Missing')}${chip('own', 'favs', '★ Favourites')}</div>
    <div class="chips">${chip('type', 'all', 'Any type')}${chip('type', 'character', 'Characters')}${chip('type', 'bit', 'Items')}${chip('type', 'evil', 'Evils')}</div>
    <div class="chips">${chip('rar', 'all', 'Any')}${[0, 1, 2, 3, 4, 5].map(n => chip('rar', String(n), n ? n + '★' : '☆')).join('')}</div>
    <div class="chips">${chip('sort', 'no', 'Number')}${chip('sort', 'rarity', 'Rarity')}${chip('sort', 'name', 'Name')}${chip('sort', 'copies', 'Copies')}</div>
  </div>
  <div class="grid coll-grid">${list.map(c => { const n = owned(c.id), f = bestFinish(c.id);
    return `<div class="cell coll-cell${n ? '' : ' locked'}">${renderCard(n && (f === 'full' || f === 'rainbow') ? { ...c, crop: null } : c, { cls: n ? FINISH_CLS[f] : '', attrs: tappable('view-card', `data-id="${c.id}"`) })}
      <div class="coll-meta"><span class="rar r-${c.rarity || 'C'}">${c.rarity || 'C'}</span><span>${n ? '×' + n : 'Not owned'}</span>
      <button class="fav${favs.has(c.id) ? ' on' : ''}" data-act="fav" data-id="${c.id}" aria-label="${favs.has(c.id) ? 'Unfavourite' : 'Favourite'} ${esc(c.name)}">★</button></div></div>`; }).join('') || '<p class="muted center">No cards match.</p>'}</div>
  ${tabbar('collection')}${overlay()}${viewer()}`;
}
Object.assign(ACTS, {
  'coll-set'(d) { ui.coll[d.k] = d.v; },
  fav(d) { favs.has(d.id) ? favs.delete(d.id) : favs.add(d.id); store.set('favs', [...favs]); },
});
document.addEventListener('input', e => { if (e.target.id === 'coll-search') { ui.coll.q = e.target.value; const at = e.target.selectionStart; render(); const el = document.getElementById('coll-search'); el?.setSelectionRange(at, at); } });

// ---------------- card viewer: full screen, finger-tilt 3D, switch between the finishes you own ----------------
function viewer() {
  const v = ui.viewer; if (!v) return '';
  const c = CARD[v.id], n = owned(v.id), f = v.finish, have = c.type === 'character' ? ['normal', 'rev', 'holo', 'full', 'rainbow'].filter(k => coll[v.id]?.f?.[k] || k === f) : ['normal'];
  return `<div class="viewer"><div class="viewer-bg" data-act="close-viewer"></div>
    <div class="viewer-card">${renderCard((f === 'full' || f === 'rainbow') ? { ...c, crop: null } : c, { cls: `zoom view sway ${n ? FINISH_CLS[f] : ''}` })}</div>
    <div class="viewer-info neu">
      <div class="viewer-top"><b>${esc(c.name)}</b><span class="rar r-${c.rarity || 'C'}">${starsOf(v.id, n ? f : 'normal')}</span>
        <button class="fav${favs.has(v.id) ? ' on' : ''}" data-act="fav" data-id="${v.id}" aria-label="Favourite">★</button></div>
      <small class="muted">${n ? `You own ${n}` : 'Not owned yet'} · drag the card to tilt it</small>
      ${n ? `<div class="chips">${have.map(k => `<button class="chip${k === f ? ' on' : ''}" data-act="viewer-finish" data-f="${k}">${k === 'normal' ? 'Normal' : FINISH_NAME[k]}${coll[v.id]?.f?.[k] ? ` ×${coll[v.id].f[k]}` : ''}</button>`).join('')}</div>` : ''}
      <button class="btn wide" data-act="close-viewer">Close</button>
    </div></div>`;
}
Object.assign(ACTS, {
  'view-card'(d) { ui.viewer = { id: d.id, finish: d.f || bestFinish(d.id) }; },
  'viewer-finish'(d) { ui.viewer.finish = d.f; },
  'close-viewer'() { ui.viewer = null; },
});
// Finger / mouse tilt on the viewer card (no flick: it springs back).
let vdrag = null;
document.addEventListener('pointerdown', e => { const el = e.target.closest?.('.viewer .card'); if (!el) return; vdrag = { el, r: el.getBoundingClientRect() }; el.classList.add('held'); el.setPointerCapture?.(e.pointerId); vtilt(e); });
document.addEventListener('pointermove', e => { if (vdrag) vtilt(e); });
document.addEventListener('pointerup', () => { if (!vdrag) return; vdrag.el.classList.remove('held'); for (const k of ['--rx', '--ry', '--mx', '--my', '--fx', '--fy', '--fc', '--co']) vdrag.el.style.removeProperty(k); vdrag = null; });
function vtilt(e) {
  const { el, r } = vdrag, x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
  for (const [k, v] of Object.entries({ '--ry': (x - 0.5) * 44 + 'deg', '--rx': (0.5 - y) * 36 + 'deg', '--mx': x * 100 + '%', '--my': y * 100 + '%', '--fx': x, '--fy': y, '--fc': Math.min(1, Math.hypot(x - 0.5, y - 0.5) * 2), '--co': 1 })) el.style.setProperty(k, v);
}
