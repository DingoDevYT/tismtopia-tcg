// Coins: packs cost coins, matches pay coins, cards sell for coins, and a daily shop sells a few cards.
const PACK_PRICE = { heehn: 300, empirical: 400, foreseen: 500 }, price = pk => PACK_PRICE[pk] || 300;
const PAY = { bot: [1000, 500], player: [2000, 1000] }; // [win, loss] // 10-card packs resell for roughly their price on average
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
  if (v.shop) { const c = CARD[v.id], f = v.finish, full = f === 'full' || f === 'rainbow';
    return html.replace(/<div class="viewer-card">[\s\S]*?<\/div>\s*<div class="viewer-info/, `<div class="viewer-card">${renderCard(full ? { ...c, crop: null } : c, { cls: `zoom view sway ${FINISH_CLS[f] || ''}` })}</div><div class="viewer-info`)
      .replace(/<div class="chips">[\s\S]*?<\/div>/, '').replace('<button class="btn wide" data-act="close-viewer">', `<button class="btn primary wide" data-act="buy" data-id="${v.id}" data-f="${f}">Buy ${starsOf(v.id, f)} for ${COIN}${fmt(cardValue(v.id, f) * SHOP_MARKUP)}</button><button class="btn wide" data-act="close-viewer">`); }
  const have = coll[v.id]?.f?.[v.finish] || 0, spare = (coll[v.id]?.n || 0) - keep(v.id);
  // Missing card: point to the pack that can give it, with the chance per pack.
  const pk = !coll[v.id]?.n && PACKS.find(p => PACK_SET[p.id]?.includes(v.id));
  const get = pk ? (() => { const r = CARD[v.id].rarity || 'C', n = pool(r, pk.id).length, miss = SLOTS.reduce((m, t) => m * (1 - (t.find(([, x]) => x === r)?.[0] || 0) / n), 1);
    return `<button class="btn primary wide find-btn" data-act="goto-pack" data-p="${pk.id}">Find it in ${esc(pk.name)}<small>${((1 - miss) * 100).toFixed(1)}% chance per pack</small></button>`; })() : '';
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
  shop() { ui.view = 'shop'; },
  'shop-view'(d) { ui.viewer = { id: d.id, finish: d.f || 'normal', shop: true }; },
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
    const f = d.f || 'normal', price = cardValue(d.id, f) * SHOP_MARKUP; if (coins < price) { ui.toast = 'Not enough coins'; return; }
    const e = (coll[d.id] ||= { n: 0, f: {} }); e.n++; e.f[f] = (e.f[f] || 0) + 1;
    setCoins(coins - price); store.set('collection', coll); ui.toast = `Bought ${CARD[d.id].name}`;
  },
});

// Match rewards, paid once when a game ends.
let paidPhase = null;
const renderNoPay = render;
render = function () {
  if (ui.view === 'game' && game) {
    if (game.phase === 'over' && paidPhase && paidPhase !== 'over') { const won = game.winner === me, pay = PAY[bot ? 'bot' : 'player'][won ? 0 : 1]; setCoins(coins + pay); ui.reward = { pay, shown: false }; }
    paidPhase = game.phase;
  } else paidPhase = null;
  renderNoPay();
  // Victory/defeat screen: the coin reward under the stats, counting up with a sound.
  const st = ui.view === 'game' && game?.phase === 'over' && ui.reward && $app.querySelector('.victory .stats-list');
  if (st) { const rw = ui.reward; st.insertAdjacentHTML('afterend', `<div class="reward neu">${COIN}<b>+${fmt(rw.shown ? rw.pay : 0)}</b><small>coins</small></div>`);
    if (!rw.shown) { rw.shown = true; const b = $app.querySelector('.reward b'), t0 = Date.now(); if (typeof sfx === 'function') { sfx('versus_rewards_2_barfillsparkle'); setTimeout(() => sfx('ui_reward_coinreward'), 1300); }
      const t = setInterval(() => { const k = Math.min(1, (Date.now() - t0) / 1300), el = document.querySelector('.reward b') || b; el.textContent = '+' + fmt(rw.pay * (1 - (1 - k) ** 3)); if (k >= 1) { clearInterval(t); el.parentElement.classList.add('done'); } }, 30); } }
  else if (ui.view !== 'game') ui.reward = null;
  if (ui.view !== 'game') {
    $app.insertAdjacentHTML('afterbegin', coinBar());
    $app.querySelector('.tabbar')?.insertAdjacentHTML('beforeend', `<button class="${ui.view === 'shop' ? 'on' : ''}" data-act="shop" aria-label="shop">${ICON.cart}</button>`);
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
    `<div class="cell coll-cell">${renderCard((f === 'full' || f === 'rainbow') ? { ...c, crop: null } : c, { cls: FINISH_CLS[f] || '', attrs: `data-act="view-card" data-id="${c.id}" data-f="${f}"` })}<small class="chip on">${starsOf(c.id, f)} · ${pc(p)}</small></div>`).join('')}</div>`;
}
const viewPacksNoOdds = viewPacks;
viewPacks = () => viewPacksNoOdds() + (ui.odds ? `<div class="viewer"><div class="viewer-bg" data-act="odds"></div><div class="shop-sheet neu">${oddsHtml()}<button class="btn wide" data-act="odds">Close</button></div></div>` : '');

// Before tearing a pack you can back out: the cards go back and the coins are refunded.
const viewOpenNoBack = viewOpen;
viewOpen = () => { const html = viewOpenNoBack(); return ui.open?.stage === 'tear' ? html.replace('data-act="tear-now">Tap to open</button>', 'data-act="tear-now">Tap to open</button><button class="btn sm" data-act="cancel-pack">Back (refund)</button>') : html; };
ACTS['cancel-pack'] = () => {
  const o = ui.open; if (o?.stage !== 'tear') return;
  for (const p of o.cards) { const e = coll[p.id]; if (!e) continue; e.n--; if (!--e.f[p.finish]) delete e.f[p.finish]; if (e.n <= 0) delete coll[p.id]; }
  store.set('collection', coll); setCoins(coins + price(o.pack)); ui.open = null; ui.view = 'packs';
};

// Shop screen: 20 cards, the whole stock changes every 30 minutes on the UTC clock (:00 and :30), same for everyone.
// Any finish can show up, even 4★ and 5★, at 3x the sell value: pulling is cheaper, buying is for a specific card.
const ROTATE = 30 * 6e4, SHOP_MARKUP = 3;
const SHOP_FIN = [[0.55, 'normal'], [0.2, 'holo'], [0.13, 'rev'], [0.09, 'full'], [0.03, 'rainbow']];
function shopSlots() {
  const turn = Math.floor(Date.now() / ROTATE), ends = (turn + 1) * ROTATE, list = CARDS.filter(c => c.type !== 'captain');
  let s = turn % 233280; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: 20 }, () => {
    const c = list[Math.floor(rnd() * list.length)];
    let f = 'normal'; if (c.type === 'character') { let x = rnd(); for (const [p, v] of SHOP_FIN) if ((x -= p) < 0) { f = v; break; } }
    if (f === 'rainbow' && c.rarity !== 'UR') f = 'full'; // rainbow is Ultra Rare only
    return { c, f, ends };
  }).sort((a, b) => starN(b.c.id, b.f) - starN(a.c.id, a.f) || cardValue(b.c.id, b.f) - cardValue(a.c.id, a.f));
}
const left = ms => { const m = Math.floor(ms / 6e4), sec = Math.floor(ms % 6e4 / 1000); return `${m}m ${String(sec).padStart(2, '0')}s`; };
function viewShop() {
  const slots = shopSlots();
  return `<div class="shop-page"><h2>Shop</h2><p class="shop-timer">${ICON.time}New stock in <b class="leaves" data-ends="${slots[0].ends}">${left(slots[0].ends - Date.now())}</b></p><p class="muted center-text">Prices are 3x a card's sell value</p>
  <div class="grid">${slots.map(({ c, f }) => `<div class="cell coll-cell shop-cell">${renderCard((f === 'full' || f === 'rainbow') ? { ...c, crop: null } : c, { cls: FINISH_CLS[f] || '', attrs: `data-act="shop-view" data-id="${c.id}" data-f="${f}"` })}${owned(c.id) ? '' : '<span class="new shop-new">NEW</span>'}
    <small class="chip on shop-stars">${starsOf(c.id, f)}${f !== 'normal' ? ' · ' + FINISH_NAME[f] : ''}</small>
    <button class="btn primary wide" data-act="buy" data-id="${c.id}" data-f="${f}">${COIN}${fmt(cardValue(c.id, f) * SHOP_MARKUP)}</button></div>`).join('')}</div></div>${tabbar('shop')}${viewer()}`;
}
setInterval(() => { document.querySelectorAll('.leaves').forEach(el => { const ms = +el.dataset.ends - Date.now(); if (ms <= 0) return render(); el.textContent = left(ms); }); }, 1000);

// Shop tile on the home screen, next to Collection.
const viewHomeNoShop = viewHome;
viewHome = () => viewHomeNoShop().replace('<small>Your cards</small></button>', '<small>Your cards</small></button><button class="tile neu" data-act="shop">${ICON.cart}<b>Shop</b><small>New stock every 30 min</small></button>'.replace('${ICON.cart}', ICON.cart));
// Before any battle (bot, host or join): pick a deck and, if you like, a different Captain (defaults to the deck's own).
let capRestore = null; // [deck, its own captain] while a swapped Captain is in use
function preHtml() {
  const p = ui.pre; if (!p) return '';
  const d = decks.find(x => x.id === p.deckId) || decks[0];
  return `<div class="viewer"><div class="viewer-bg" data-act="pre-cancel"></div><div class="shop-sheet neu pre-sheet">
    <h3>Choose your deck</h3><div class="pre-list">${decks.map(x => `<button class="chip${x.id === d.id ? ' on' : ''}" data-act="pre-deck" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>
    <h3>Captain <small class="muted">defaults to the deck's own</small></h3>
    <div class="pre-caps">${CAPTAINS.map(c => `<button class="pre-cap${c.id === p.cap ? ' on' : ''}" data-act="pre-cap" data-id="${c.id}">${renderAvatar(c)}<small>${esc(c.name)}${c.id === d.captain ? ' ★' : ''}</small></button>`).join('')}</div>
    ${deckProblems(d).length ? `<p class="muted">This deck isn't legal yet: ${esc(deckProblems(d)[0])}</p>` : ''}
    <div class="row2"><button class="btn" data-act="pre-cancel">Cancel</button><button class="btn primary" data-act="pre-go"${deckProblems(d).length ? ' disabled' : ''}>Battle</button></div></div></div>`;
}
const openPre = act => { const d = deck(); ui.pre = { act, deckId: d.id, cap: d.captain || CAPTAINS[0].id }; };
const actBot = ACTS.bot, actHost = ACTS.host, actJoin = ACTS.join, actGo = ACTS.go;
Object.assign(ACTS, {
  bot() { openPre('bot'); },
  host() { openPre('host'); },
  join(d) { openPre('join'); ui.preJoin = d; },
  go(d) { if (d.host) { ui.view = 'lobby'; openPre('host'); return; } return actGo(d); },
  'pre-deck'(d) { const x = decks.find(k => k.id === d.id); ui.pre.deckId = x.id; ui.pre.cap = x.captain || CAPTAINS[0].id; },
  'pre-cap'(d) { ui.pre.cap = d.id; },
  'pre-cancel'() { ui.pre = null; },
  'pre-go'() {
    const p = ui.pre; ui.pre = null; ui.deckId = p.deckId; store.set('deck', p.deckId);
    const d = deck(); if (p.cap !== d.captain) { capRestore = [d, d.captain]; d.captain = p.cap; } // this battle only
    return { bot: actBot, host: actHost, join: actJoin }[p.act](ui.preJoin);
  },
});
const renderNoPre = render;
render = function () {
  if (capRestore && ui.view !== 'game' && ui.view !== 'lobby') { capRestore[0].captain = capRestore[1]; capRestore = null; }
  renderNoPre();
  if (ui.pre) $app.insertAdjacentHTML('beforeend', preHtml());
};

// Deck builder piles: your best copies of a card stacked, best on top (e.g. a full art over two holos).
function pile(id, n, cls = '', attrs = '') {
  const c = CARD[id], fins = Object.entries(coll[id]?.f || {}).flatMap(([f, k]) => Array(Math.max(0, k)).fill(f)).sort((x, y) => FORDER.indexOf(y) - FORDER.indexOf(x)).slice(0, Math.max(1, n));
  if (!fins.length) fins.push('normal');
  return `<div class="pile" style="--n:${fins.length - 1}">${fins.map((f, k) => renderCard((f === 'full' || f === 'rainbow') ? { ...c, crop: null } : c,
    { cls: `${cls} ${FINISH_CLS[f] || ''}${k ? ' behind' : ''}`, style: `--k:${k}`, attrs: k ? '' : attrs })).join('')}</div>`;
}

// app.js drew the first screen before this file loaded: draw it again so the shop tab and coins show straight away.
render();
