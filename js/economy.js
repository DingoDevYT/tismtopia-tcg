// Coins: packs cost coins, matches pay coins, cards sell for coins, and a daily shop sells a few cards.
const PACK_PRICE = { heehn: 300, empirical: 400, foreseen: 500 }, price = pk => PACK_PRICE[pk] || 300;
const WIN_PAY = 100, LOSS_PAY = 40; // 10-card packs resell for roughly their price on average
const RVAL = { C: 15, U: 38, R: 90, UR: 300 }, FVAL = { normal: 1, rev: 1.5, holo: 2, full: 4, rainbow: 12 }; // a weak pack sells for about half its cost
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
// Selling below 3 copies means you can no longer run a full set of this card in a deck.
const lowWarn = (id, n) => `Sell ${CARD[id].name}? You'll have ${n - 1} left, and decks can use up to 3 copies of a card, so you won't be able to run a full set of it.`;
const FORDER = ['normal', 'holo', 'rev', 'full', 'rainbow']; // common to rare
let sellAt = 0; const cooled = () => { const t = Date.now(); if (t - sellAt < 100) return false; sellAt = t; return true; }; // stops double-taps and spam
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
viewPacks = () => (viewPacksNoShop().replace('data-p="' , 'data-p="').replace(/(wheel-open[^>]*data-p="([^"]*)"[^>]*>)Open<\/button>/, (m, a, pk) => `${a}Open for ${COIN}${fmt(price(pk))}</button><button class="btn odds-btn" data-act="odds" data-p="${pk}">What's in this pack?</button>`).replace(/(<nav class="tabbar)/, `<button class="btn wide shop-open" data-act="shop">${COIN} Shop</button>$1`));
const viewCollectionNoCoins = viewCollection;
viewCollection = () => viewCollectionNoCoins();
const viewerNoSell = viewer;
viewer = () => {
  const v = ui.viewer, html = viewerNoSell(); if (!v) return html;
  const have = coll[v.id]?.f?.[v.finish] || 0, spare = (coll[v.id]?.n || 0) - keep(v.id);
  // Missing card: point to the pack that can give it, with the chance per pack.
  const pk = !coll[v.id]?.n && PACKS.find(p => PACK_SET[p.id]?.includes(v.id));
  const get = pk ? (() => { const r = CARD[v.id].rarity || 'C', n = pool(r, pk.id).length, miss = SLOTS.reduce((m, t) => m * (1 - (t.find(([, x]) => x === r)?.[0] || 0) / n), 1);
    return `<button class="btn primary wide" data-act="goto-pack" data-p="${pk.id}">Get it in ${esc(pk.name)}: ${((1 - miss) * 100).toFixed(1)}% per pack</button>`; })() : '';
  const sell = get || (have && spare > 0 ? `<button class="btn wide" data-act="sell">Sell one for ${COIN}${fmt(cardValue(v.id, v.finish))}</button>` : '');
  const fs = Object.entries(coll[v.id]?.f || {}).filter(([, n]) => n > 0).sort(([a], [b]) => FORDER.indexOf(a) - FORDER.indexOf(b));
  // Every copy you own as a row of big cards, the chosen finish first.
  // One stack per finish: copies sit behind each other so only their edges show.
  const row = fs.map(([f, n]) => `<div class="stack${f === v.finish ? ' picked' : ''}" data-act="viewer-finish" data-f="${f}" style="--n:${Math.min(n, 6) - 1}">${Array.from({ length: Math.min(n, 6) }, (_, k) =>
    renderCard((f === 'full' || f === 'rainbow') ? { ...CARD[v.id], crop: null } : CARD[v.id], { cls: `zoom view ${FINISH_CLS[f] || ''}${k ? ' behind' : ' picked'}`, style: `--k:${k}` })).join('')}${n > 1 ? `<span class="chip on stack-n">×${n}</span>` : ''}</div>`).join('');
  return (row ? html.replace(/<div class="viewer-card">[\s\S]*?<\/div>\s*<div class="viewer-info/, `<div class="viewer-card copies">${row}</div><div class="viewer-info`) : html).replace('<button class="btn wide" data-act="close-viewer">', sell + '<button class="btn wide" data-act="close-viewer">');
};

const pickPack = ACTS['pick-pack'];
Object.assign(ACTS, {
  'pick-pack'(d) {
    if (coins < price(d.p)) { ui.toast = `This pack costs ${fmt(price(d.p))} coins: sell cards or win matches`; return; }
    const r = pickPack(d); if (r !== false) setCoins(coins - price(d.p)); return r;
  },
  'goto-pack'(d) { ui.viewer = null; ui.view = 'packs'; ui.packIdx = PACKS.findIndex(p => p.id === d.p); },
  sell() {
    const v = ui.viewer, e = coll[v.id];
    if (!e?.f?.[v.finish] || e.n - keep(v.id) <= 0) return;
    if (e.n - 1 < 3 && !confirm(lowWarn(v.id, e.n))) return;
    if (!cooled()) return false;
    const el = document.querySelector('.viewer-card .stack.picked .card.picked'); if (el) { el.classList.remove('holo', 'masked'); el.querySelectorAll('.holo__shine,.holo__glare').forEach(x => x.remove()); disintegrate(el); }
    e.f[v.finish]--; e.n--; if (!e.n) delete coll[v.id];
    setCoins(coins + cardValue(v.id, v.finish)); store.set('collection', coll);
    if (!coll[v.id]?.f?.[v.finish]) ui.viewer.finish = 'normal';
  },
  shop() { ui.shop = !ui.shop; },
  odds(d) { ui.odds = ui.odds ? null : d.p; },
  'sell-pull'(d) {
    const p = ui.open.cards[d.i], e = coll[p.id];
    if (p.sold || !e?.f?.[p.finish] || e.n - keep(p.id) <= 0) return;
    if (!d.all && !cooled()) return;
    if (!d.all && e.n - 1 < 3 && !confirm(lowWarn(p.id, e.n))) return;
    e.f[p.finish]--; e.n--; if (!e.n) delete coll[p.id]; p.sold = true;
    setCoins(coins + cardValue(p.id, p.finish)); store.set('collection', coll);
  },
  'sell-all-pulls'() { if (!confirm('Sell all of these pulls? Some may leave you with fewer than 3 copies of a card.')) return; ui.open.cards.forEach((_, i) => ACTS['sell-pull']({ i, all: true })); },
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
  if (ui.view !== 'game') {
    $app.insertAdjacentHTML('afterbegin', coinBar());
    $app.querySelector('.tabbar')?.insertAdjacentHTML('beforeend', `<button class="${ui.shop ? 'on' : ''}" data-act="shop" aria-label="shop">${COIN}</button>`);
    if (ui.shop) $app.insertAdjacentHTML('beforeend', `<div class="viewer"><div class="viewer-bg" data-act="shop"></div><div class="shop-sheet neu">${shopHtml()}<button class="btn wide" data-act="shop">Close</button></div></div>`);
  }
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

// "What's in this pack?": every card, in number order, with its share of all pulled cards (adds up to 100%).
function oddsHtml() {
  // One entry per card per finish (Characters only get special finishes), rarest first.
  const rows = CARDS.filter(c => c.type !== 'captain').flatMap(c => { const r = c.rarity || 'C', n = pool(r, ui.odds).length; if (!PACK_SET[ui.odds]?.includes(c.id)) return [];
    const p = SLOTS.reduce((s, t) => s + (t.find(([, v]) => v === r)?.[0] || 0) / n, 0) / SLOTS.length;
    return (c.type === 'character' ? boosted(FINISH[r], ui.odds) : [[1, 'normal']]).map(([fp, f]) => ({ c, f, p: p * fp })); })
    .sort((a, b) => FORDER.indexOf(b.f) - FORDER.indexOf(a.f) || a.p - b.p || a.c.no.localeCompare(b.c.no));
  const pc = p => (p * 100).toFixed(p < 0.001 ? 3 : p < 0.01 ? 2 : 1) + '%';
  return `<h3>${esc(PACKS.find(p => p.id === ui.odds)?.name || 'This pack')}: ${fmt(price(ui.odds))} coins</h3><small class="muted">Chance that any card you pull is this one, rarest first</small><div class="grid odds">${rows.map(({ c, f, p }) =>
    `<div class="cell coll-cell">${renderCard((f === 'full' || f === 'rainbow') ? { ...c, crop: null } : c, { cls: FINISH_CLS[f] || '', attrs: `data-act="view-card" data-id="${c.id}" data-f="${f}"` })}<small class="chip on">${f === 'normal' ? '' : FINISH_NAME[f] + ' · '}${pc(p)}</small></div>`).join('')}</div>`;
}
const viewPacksNoOdds = viewPacks;
viewPacks = () => viewPacksNoOdds() + (ui.odds ? `<div class="viewer"><div class="viewer-bg" data-act="odds"></div><div class="shop-sheet neu">${oddsHtml()}<button class="btn wide" data-act="odds">Close</button></div></div>` : '');
