// Packs and collection: pick a pack, swipe to tear it open, flick through 5 cards one by one (rares get a reveal),
// then a summary. The collection (cards you own, and which finishes) lives in localStorage; you need to own a card to deck it.
// shortcut: unlimited free packs while testing; add a timer or battle rewards before friends grind it.
const PACKS = [
  { id: 'heehn', name: 'HEEHN Starter Pack', colour: '#1840c8' },
  { id: 'empirical', name: 'Empirical Ascension', colour: '#1f9bff' },
  { id: 'foreseen', name: 'Foreseen Knowledge', colour: '#5b1fd6' },
];
const RARITY_NAME = { C: 'Common', U: 'Uncommon', R: 'Rare', UR: 'Ultra Rare' };
const FINISH_NAME = { normal: '', rev: 'Reverse Holo', holo: 'Holo', full: 'Full Art' };
const FINISH_CLS = { normal: '', rev: 'v-rev', holo: 'v-holo', full: 'v-full v-holo' };

// Everyone starts owning both free starter decks.
let coll = store.get('collection', null);
if (!coll || typeof coll !== 'object') {
  coll = {};
  for (const s of STARTERS) for (const [id, n] of Object.entries(s.cards)) coll[id] = { n: Math.max(coll[id]?.n || 0, n), f: { normal: n } };
  store.set('collection', coll);
}
const owned = id => coll[id]?.n || 0;
const ownedCount = () => CARDS.filter(c => owned(c.id)).length;

// Slot odds (5 cards): three commons-ish, one uncommon-ish, one rare-ish. Finishes roll per card.
const pool = r => CARDS.filter(c => c.type !== 'captain' && (c.rarity || 'C') === r);
const roll = table => { let x = Math.random(); for (const [p, v] of table) { if ((x -= p) < 0) return v; } return table[table.length - 1][1]; };
const SLOTS = [
  [[0.85, 'C'], [0.13, 'U'], [0.02, 'R']], [[0.85, 'C'], [0.13, 'U'], [0.02, 'R']], [[0.85, 'C'], [0.13, 'U'], [0.02, 'R']],
  [[0.7, 'U'], [0.25, 'R'], [0.05, 'UR']],
  [[0.75, 'R'], [0.25, 'UR']],
];
const FINISH = { C: [[0.12, 'rev'], [0.88, 'normal']], U: [[0.15, 'rev'], [0.85, 'normal']], R: [[0.4, 'holo'], [0.15, 'rev'], [0.05, 'full'], [0.4, 'normal']], UR: [[0.6, 'holo'], [0.4, 'full']] };
function openPack(packId) {
  const cards = SLOTS.map(t => {
    let r = roll(t); while (!pool(r).length) r = { UR: 'R', R: 'U', U: 'C', C: 'C' }[r];
    const list = pool(r), c = list[Math.floor(Math.random() * list.length)];
    return { id: c.id, rarity: r, finish: roll(FINISH[r]), isNew: false };
  });
  cards.forEach(p => { p.isNew = !owned(p.id); const e = (coll[p.id] ||= { n: 0, f: {} }); e.n++; e.f[p.finish] = (e.f[p.finish] || 0) + 1; });
  store.set('collection', coll);
  return { pack: packId, cards, stage: 'tear', i: 0 };
}

const packArt = (p, cls = '') => `<div class="pack ${cls}" style="--pc:${p.colour}"><img src="art/local/pack-${p.id}.png" alt="" onerror="this.remove()"><div class="pack-fallback"><img src="art/logo.png" alt=""><b>${p.name}</b><small>5 cards</small></div></div>`;

function viewPacks() {
  return `${header('Open Packs')}
  <p class="muted center">You own ${ownedCount()} of ${CARDS.length} cards. Pick a pack.</p>
  <div class="pack-row">${PACKS.map(p => `<button class="pack-pick" data-act="pick-pack" data-p="${p.id}" aria-label="Open ${p.name}">${packArt(p)}<b>${p.name}</b></button>`).join('')}</div>`;
}

function viewOpen() {
  const o = ui.open, P = PACKS.find(p => p.id === o.pack);
  if (o.stage === 'tear') return `<div class="open-stage">
    <p class="open-hint">Swipe across the top to open</p>
    <div class="tear-zone" data-act="noop">${packArt(P, 'big')}<div class="tear-line"><i></i></div></div>
    <button class="btn sm" data-act="tear-now">Tap to open</button></div>`;
  if (o.stage === 'reveal') {
    const cur = o.cards[o.i], c = CARD[cur.id], rare = cur.rarity === 'R' || cur.rarity === 'UR' || cur.finish !== 'normal';
    const behind = o.cards.slice(o.i + 1).map((_, k) => `<div class="stack-back" style="--k:${k + 1}"></div>`).join('');
    return `<div class="open-stage reveal${rare ? ' rare r-' + cur.rarity : ''}" data-act="next-card">
      ${rare ? '<div class="burst"></div>' : ''}
      <div class="stack">${behind}${renderCard(cur.finish === 'full' ? { ...c, crop: null } : c, { cls: `zoom sway enter ${FINISH_CLS[cur.finish]}` })}</div>
      <p class="pull-tag">${cur.isNew ? '<span class="new">NEW</span>' : ''}${RARITY_NAME[cur.rarity]}${cur.finish !== 'normal' ? ` · ${FINISH_NAME[cur.finish]}` : ''}</p>
      <p class="open-hint">Tap for the next card (${o.i + 1}/${o.cards.length})</p></div>`;
  }
  return `${header('Your pulls')}
    <div class="pull-grid">${o.cards.map(p => `<div class="pull">${renderCard(p.finish === 'full' ? { ...CARD[p.id], crop: null } : CARD[p.id], { cls: FINISH_CLS[p.finish], attrs: tappable('zoom', `data-id="${p.id}"`) })}${p.isNew ? '<span class="new">NEW</span>' : ''}<small>${RARITY_NAME[p.rarity]}${p.finish !== 'normal' ? ` · ${FINISH_NAME[p.finish]}` : ''}</small></div>`).join('')}</div>
    <div class="row2" style="margin:16px"><button class="btn primary" data-act="pick-pack" data-p="${o.pack}">Open another</button><button class="btn" data-act="go" data-to="packs">Done</button></div>
    ${overlay()}`;
}

Object.assign(ACTS, {
  'pick-pack'(d) { ui.open = openPack(d.p); ui.view = 'open'; },
  'tear-now'() { tearOpen(); return false; },
  'next-card'() {
    const o = ui.open; if (!o || o.stage !== 'reveal') return;
    const top = $app.querySelector('.stack .card');
    if (top && !calm) { top.classList.add('flyout'); setTimeout(() => { advance(); render(); }, 260); return false; }
    advance();
  },
  noop() { return false; },
});
function advance() { const o = ui.open; if (++o.i >= o.cards.length) o.stage = 'summary'; }
function tearOpen() {
  const z = $app.querySelector('.tear-zone');
  if (z && !calm) { z.classList.add('torn'); setTimeout(() => { ui.open.stage = 'reveal'; render(); }, 650); }
  else { ui.open.stage = 'reveal'; render(); }
}
// Swipe to tear: drag across the top of the pack; past 80% of the width it rips open.
let tearing = null;
document.addEventListener('pointerdown', e => {
  const z = e.target.closest?.('.tear-zone'); if (!z || ui.view !== 'open') return;
  const r = z.getBoundingClientRect(); if (e.clientY > r.top + r.height * 0.35) return;
  tearing = { z, r, x0: e.clientX }; z.setPointerCapture?.(e.pointerId);
});
document.addEventListener('pointermove', e => {
  if (!tearing) return;
  const p = Math.max(0, Math.min(1, (e.clientX - tearing.r.left) / tearing.r.width));
  tearing.z.style.setProperty('--tear', p);
  if (p > 0.8) { tearing = null; tearOpen(); }
});
document.addEventListener('pointerup', () => { if (tearing) { tearing.z.style.setProperty('--tear', 0); tearing = null; } });
