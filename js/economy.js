// Coins: packs cost coins, matches pay coins, cards sell for coins, and a daily shop sells a few cards.
const PACK_COST = 600, WIN_PAY = 100, LOSS_PAY = 40; // 10-card packs resell for roughly their price on average
const RVAL = { C: 10, U: 25, R: 60, UR: 200 }, FVAL = { normal: 1, rev: 1.5, holo: 2, full: 4 }; // a weak pack sells for about half its cost
const fmt = n => Math.round(n).toLocaleString('en-US'); // 10000 -> 10,000
const COIN = '<img class="coin" src="art/coin.svg" alt="coins">';
let coins = store.get('coins', 900);
let shown = coins, tick = null;
// The balance counts up (or down) to the new total instead of jumping.
const setCoins = n => { coins = n; store.set('coins', coins); clearInterval(tick);
  tick = setInterval(() => { shown += Math.sign(coins - shown) * Math.max(1, Math.round(Math.abs(coins - shown) / 8));
    document.querySelectorAll('.coin-bar b').forEach(b => { b.textContent = fmt(shown); }); if (shown === coins) clearInterval(tick); }, 30); };
const cardValue = (id, f = 'normal') => (RVAL[CARD[id].rarity || 'C'] || 10) * (FVAL[f] || 1);
// Starter copies come back on every load, so they can't be sold (no free-money loop).
const keep = id => Math.max(0, ...STARTERS.map(s => s.cards[id] || 0));
// Account corner on every screen but battles: your name/captain, then your coins.
const coinBar = () => `<div class="acct"><button class="profile neu" data-act="rename-me" aria-label="Change your name">${renderAvatar(CARD[deck().captain] || CAPTAINS[0])}<b>${esc(myName)}</b></button><div class="coin-bar neu">${COIN}<b>${fmt(shown)}</b></div></div>`;

// Daily shop: same 4 cards for everyone each day, at twice their sell value.
function shopToday() {
  let seed = Math.floor(Date.now() / 864e5); const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const pool = [...CARDS]; return Array.from({ length: 4 }, () => pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
}
const shopHtml = () => `<section class="shop"><h3>Shop <small class="muted">new cards every day</small></h3><div class="shop-row">${shopToday().map(c =>
  `<div class="shop-item">${renderCard(c, { cls: 'mini', attrs: `data-act="view-card" data-id="${c.id}"` })}<button class="btn primary" data-act="buy" data-id="${c.id}">${COIN}${fmt(cardValue(c.id) * 2)}</button></div>`).join('')}</div></section>`;

const viewPacksNoShop = viewPacks;
viewPacks = () => (viewPacksNoShop().replace('data-p="' , 'data-p="').replace(/(wheel-open[^>]*>)Open</, `$1Open for ${COIN}${fmt(PACK_COST)}<`).replace(/(<nav class="tabbar)/, `<button class="btn wide" data-act="odds">What's in this pack?</button><button class="btn wide shop-open" data-act="shop">${COIN} Shop</button>$1`) + (ui.shop ? `<div class="viewer"><div class="viewer-bg" data-act="shop"></div><div class="shop-sheet neu">${shopHtml()}<button class="btn wide" data-act="shop">Close</button></div></div>` : ''));
const viewCollectionNoCoins = viewCollection;
viewCollection = () => viewCollectionNoCoins();
const viewerNoSell = viewer;
viewer = () => {
  const v = ui.viewer, html = viewerNoSell(); if (!v) return html;
  const have = coll[v.id]?.f?.[v.finish] || 0, spare = (coll[v.id]?.n || 0) - keep(v.id);
  const sell = have && spare > 0 ? `<button class="btn wide" data-act="sell">Sell one for ${COIN}${fmt(cardValue(v.id, v.finish))}</button>` : '';
  const fs = Object.entries(coll[v.id]?.f || {}).filter(([, n]) => n > 0).sort(([a], [b]) => (b === v.finish) - (a === v.finish));
  // Every copy you own as a row of big cards, the chosen finish first.
  const row = fs.flatMap(([f, n]) => Array.from({ length: n }, () => renderCard(f === 'full' ? { ...CARD[v.id], crop: null } : CARD[v.id], { cls: `zoom view ${FINISH_CLS[f] || ''}${f === v.finish ? ' picked' : ''}`, attrs: `data-act="viewer-finish" data-f="${f}"` }))).join('');
  return (row ? html.replace(/<div class="viewer-card">[\s\S]*?<\/div>\s*<div class="viewer-info/, `<div class="viewer-card copies">${row}</div><div class="viewer-info`) : html).replace('<button class="btn wide" data-act="close-viewer">', sell + '<button class="btn wide" data-act="close-viewer">');
};

const pickPack = ACTS['pick-pack'];
Object.assign(ACTS, {
  'pick-pack'(d) {
    if (coins < PACK_COST) { ui.toast = `Packs cost ${fmt(PACK_COST)} coins: sell cards or win matches`; return; }
    const r = pickPack(d); if (r !== false) setCoins(coins - PACK_COST); return r;
  },
  sell() {
    const v = ui.viewer, e = coll[v.id];
    if (!e?.f?.[v.finish] || e.n - keep(v.id) <= 0) return;
    if (!v.dusting) { v.dusting = true; disintegrate(document.querySelector('.viewer-card .card.picked') || document.querySelector('.viewer-card .card')); setTimeout(() => { ACTS.sell(); v.dusting = false; render(); }, 1300); return false; }
    e.f[v.finish]--; e.n--; if (!e.n) delete coll[v.id];
    setCoins(coins + cardValue(v.id, v.finish)); store.set('collection', coll);
    if (!coll[v.id]?.f?.[v.finish]) ui.viewer.finish = 'normal';
  },
  shop() { ui.shop = !ui.shop; },
  odds() { ui.odds = !ui.odds; },
  'sell-pull'(d) {
    const p = ui.open.cards[d.i], e = coll[p.id];
    if (p.sold || !e?.f?.[p.finish] || e.n - keep(p.id) <= 0) return;
    e.f[p.finish]--; e.n--; if (!e.n) delete coll[p.id]; p.sold = true;
    setCoins(coins + cardValue(p.id, p.finish)); store.set('collection', coll);
  },
  'sell-all-pulls'() { ui.open.cards.forEach((_, i) => ACTS['sell-pull']({ i })); },
  buy(d) {
    const price = cardValue(d.id) * 2; if (coins < price) { ui.toast = 'Not enough coins'; return; }
    const e = (coll[d.id] ||= { n: 0, f: {} }); e.n++; e.f.normal = (e.f.normal || 0) + 1;
    setCoins(coins - price); store.set('collection', coll); ui.toast = `Bought ${CARD[d.id].name}`;
  },
});

// Match rewards, paid once when a game ends.
let paidPhase = null;
const renderNoPay = render;
render = function () {
  if (ui.view === 'game' && game) {
    if (game.phase === 'over' && paidPhase && paidPhase !== 'over') { const won = game.winner === me; setCoins(coins + (won ? WIN_PAY : LOSS_PAY)); ui.toast = `+${won ? WIN_PAY : LOSS_PAY} coins`; }
    paidPhase = game.phase;
  } else paidPhase = null;
  renderNoPay();
  if (ui.view !== 'game') $app.insertAdjacentHTML('afterbegin', coinBar());
};

const viewHomeNoCoins = viewHome;
viewHome = () => viewHomeNoCoins().replace(/<div class="topbar">[\s\S]*?<\/div>/, '');

// "Your pulls": sell any pull on the spot.
const viewOpenNoSell = viewOpen;
viewOpen = () => {
  const o = ui.open, html = viewOpenNoSell(); if (o?.stage !== 'summary') return html;
  let i = 0;
  return html.replace(/<\/small><\/div>/g, () => { const p = o.cards[i], k = i++;
    return '</small>' + (p.sold ? '<small class="muted">Sold</small>' : `<button class="btn sell-pull" data-act="sell-pull" data-i="${k}">Sell ${COIN}${fmt(cardValue(p.id, p.finish))}</button>`) + '</div>'; })
    .replace('<div class="pull-grid">', `<button class="btn wide" data-act="sell-all-pulls">Sell all for ${COIN}${fmt(o.cards.filter(p => !p.sold).reduce((a, p) => a + cardValue(p.id, p.finish), 0))}</button><div class="pull-grid">`);
};

// "What's in this pack?": every card and its chance to show up at least once in a pack.
function oddsHtml() {
  const rows = CARDS.filter(c => c.type !== 'captain').map(c => { const r = c.rarity || 'C', n = pool(r).length;
    const miss = SLOTS.reduce((m, t) => m * (1 - (t.find(([, v]) => v === r)?.[0] || 0) / n), 1); return { c, p: 1 - miss }; })
    .sort((a, b) => a.p - b.p || a.c.name.localeCompare(b.c.name));
  return `<h3>What's in this pack</h3><small class="muted">Chance to get each card at least once in a 10-card pack</small><div class="odds">${rows.map(({ c, p }) =>
    `<div><span class="rar r-${c.rarity || 'C'}">${RARITY_NAME[c.rarity || 'C']}</span><b>${esc(c.name)}</b><span>${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%</span></div>`).join('')}</div>`;
}
const viewPacksNoOdds = viewPacks;
viewPacks = () => viewPacksNoOdds() + (ui.odds ? `<div class="viewer"><div class="viewer-bg" data-act="odds"></div><div class="shop-sheet neu">${oddsHtml()}<button class="btn wide" data-act="odds">Close</button></div></div>` : '');
