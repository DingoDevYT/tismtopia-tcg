// Coins: packs cost coins, matches pay coins, cards sell for coins, and a daily shop sells a few cards.
const PACK_COST = 100, WIN_PAY = 60, LOSS_PAY = 25;
const RVAL = { C: 10, U: 25, R: 60, UR: 200 }, FVAL = { normal: 1, rev: 2, holo: 3, full: 8 }; // a weak pack sells for about half its cost
const COIN = '<img class="coin" src="art/coin.svg" alt="coins">';
let coins = store.get('coins', 500);
const setCoins = n => { coins = n; store.set('coins', coins); };
const cardValue = (id, f = 'normal') => (RVAL[CARD[id].rarity || 'C'] || 10) * (FVAL[f] || 1);
// Starter copies come back on every load, so they can't be sold (no free-money loop).
const keep = id => Math.max(0, ...STARTERS.map(s => s.cards[id] || 0));
// Account corner on every screen but battles: your name/captain, then your coins.
const coinBar = () => `<div class="acct"><button class="profile neu" data-act="rename-me" aria-label="Change your name">${renderAvatar(CARD[deck().captain] || CAPTAINS[0])}<b>${esc(myName)}</b></button><div class="coin-bar neu">${COIN}<b>${coins}</b></div></div>`;

// Daily shop: same 4 cards for everyone each day, at twice their sell value.
function shopToday() {
  let seed = Math.floor(Date.now() / 864e5); const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const pool = [...CARDS]; return Array.from({ length: 4 }, () => pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
}
const shopHtml = () => `<section class="shop"><h3>Shop <small class="muted">new cards every day</small></h3><div class="shop-row">${shopToday().map(c =>
  `<div class="shop-item">${renderCard(c, { cls: 'mini', attrs: `data-act="view-card" data-id="${c.id}"` })}<button class="btn primary" data-act="buy" data-id="${c.id}">${COIN}${cardValue(c.id) * 2}</button></div>`).join('')}</div></section>`;

const viewPacksNoShop = viewPacks;
viewPacks = () => viewPacksNoShop().replace('data-p="' , 'data-p="').replace(/(wheel-open[^>]*>)Open</, `$1Open for ${COIN}${PACK_COST}<`).replace(/(<nav class="tabbar)/, `${shopHtml()}$1`);
const viewCollectionNoCoins = viewCollection;
viewCollection = () => viewCollectionNoCoins();
const viewerNoSell = viewer;
viewer = () => {
  const v = ui.viewer, html = viewerNoSell(); if (!v) return html;
  const have = coll[v.id]?.f?.[v.finish] || 0, spare = (coll[v.id]?.n || 0) - keep(v.id);
  const sell = have && spare > 0 ? `<button class="btn wide" data-act="sell">Sell one for ${COIN}${cardValue(v.id, v.finish)}</button>` : '';
  return html.replace('<button class="btn wide" data-act="close-viewer">', sell + '<button class="btn wide" data-act="close-viewer">');
};

const pickPack = ACTS['pick-pack'];
Object.assign(ACTS, {
  'pick-pack'(d) {
    if (coins < PACK_COST) { ui.toast = `Packs cost ${PACK_COST} coins: sell cards or win matches`; return; }
    const r = pickPack(d); if (r !== false) setCoins(coins - PACK_COST); return r;
  },
  sell() {
    const v = ui.viewer, e = coll[v.id];
    if (!e?.f?.[v.finish] || e.n - keep(v.id) <= 0) return;
    e.f[v.finish]--; e.n--; if (!e.n) delete coll[v.id];
    setCoins(coins + cardValue(v.id, v.finish)); store.set('collection', coll);
    if (!coll[v.id]?.f?.[v.finish]) ui.viewer.finish = 'normal';
  },
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
