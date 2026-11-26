// Guided tour: coach marks over the real screens. Each step sets a screen up (ui.view and friends), then a dimmed layer cuts a
// highlight around one real element and a small card explains it. Runs once after the starter packs (js/onboard.js), and again from
// Profile or How to Play. Progress is saved (tismtopia.tour: { step } while running, { done } after), so a reload resumes.
// A step whose element isn't on screen is skipped. Only "Try it" steps let taps through to the app; it never spends or sells anything.
const tour = { i: -1, el: null, key: '', first: false, pend: null };
const TOUR_OFF = { open: null, viewer: null, odds: null, sheet: null, zoom: null, pre: null, fopen: false, resetAsk: false };
const tourAt = (view, extra = () => ({})) => () => Object.assign(ui, TOUR_OFF, { view }, extra());
const tourColl = extra => tourAt('collection', () => ({ coll: { q: '', own: 'all', type: 'all', rar: 'all', sort: 'no' }, ...extra?.() }));
const tourCards = () => CARDS.filter(c => !c.community); // CARDS is in number order, like the collection's default sort
// The pack opening screens with five made-up pulls (one of each edge colour). Nothing is added to the collection; economy.js refuses
// to sell or refund a demo pack, and the tour keeps taps off it anyway.
function tourDemo(stage) {
  const ch = tourCards().filter(c => c.type === 'character'), pick = r => ch.find(c => c.art && (c.rarity || 'C') === r) || ch.find(c => (c.rarity || 'C') === r) || ch[0];
  const cards = [[pick('C'), 'normal'], [pick('R'), 'normal'], [pick('U'), 'holo'], [pick('C'), 'rev'], [pick('UR'), 'full']].map(([c, finish]) => ({ id: c.id, rarity: c.rarity || 'C', finish, isNew: false }));
  return { pack: PACKS[0].id, demo: true, stage, i: stage === 'reveal' ? 2 : 0, cards }; // the reveal shows the holo: no long cutscene
}
const tourPack = () => PACKS[(((ui.packIdx || 0) % PACKS.length) + PACKS.length) % PACKS.length].id;
const tourView = c => c && { id: c.id, finish: bestFinish(c.id) };
const tourOwned = () => tourView(tourCards().find(c => owned(c.id)));
const tourSpare = () => tourView(tourCards().find(c => owned(c.id) - keep(c.id) > 0)) || tourOwned();
const tourMissing = () => { const c = tourCards().find(c => !owned(c.id) && PACKS.some(p => PACK_SET[p.id]?.includes(c.id))); return c && { id: c.id, finish: 'normal' }; };
// Star levels on real cards: a plain Common, then one rarer Character in every finish.
function tourStars() {
  const ch = tourCards().filter(c => c.type === 'character'), mine = ch.filter(c => owned(c.id)), best = l => l.find(c => c.art) || l[0];
  const common = c => (c.rarity || 'C') === 'C', a = best(mine.filter(common)) || best(ch.filter(common)), b = best(mine.filter(c => !common(c))) || best(ch.filter(c => !common(c)));
  return `<div class="tour-strip">${[[a, 'normal', 'plain'], [b, 'normal', 'rarer card'], [b, 'holo', 'holo'], [b, 'rev', 'reverse holo'], [b, 'full', 'full art'], [b, 'rainbow', 'rainbow']].map(([c, f, what]) =>
    `<figure>${renderCard(f === 'full' || f === 'rainbow' ? { ...c, crop: null } : c, { cls: FINISH_CLS[f] })}<figcaption>${starsOf(c.id, f)}<small>${what}</small></figcaption></figure>`).join('')}</div>`;
}

// Every number comes from the game's own constants, read when the step shows.
const TOUR = [
  { at: tourAt('deck'), sel: '.app[data-view=deck] .grid', title: 'This is your deck', text: () => { const d = deck(), c = CARD[d.captain];
    return `${esc(d.name)}: ${count(d)} cards${c ? ` led by Captain ${esc(c.name)}` : ''}.${tour.first ? ` Your ${ONB_PACKS} starter packs made it, and it's ready to battle. Here's a quick look around.` : ''}`; } },
  { at: tourAt('home'), sel: '.acct', title: 'You and your coins', text: () => `Tap your name any time to open your Profile. Next to it are your coins (${fmt(coins)} right now): packs and the Shop cost coins, and battles pay them.` },
  { at: tourAt('home'), sel: '.tiles', title: 'Home', text: 'Everything starts here: the tutorial, practice, battles, packs, your collection, your decks and the rules.' },
  { at: tourAt('packs'), sel: '.wheel', title: 'Packs', text: 'Swipe the wheel, or tap the arrows, to choose a pack.' },
  { at: tourAt('packs'), sel: '.wheel-open', title: 'Prices', text: () => `Every pack holds ${SLOTS.length} cards. ${PACKS.map(p => `${esc(p.name)}: ${fmt(price(p.id))}`).join(' · ')} coins.` },
  { at: tourAt('packs'), sel: '.odds-btn', title: "What's in this pack?", text: 'Tap it to see every card this pack can give you, and the chance of each.', try: () => !!ui.odds },
  { at: tourAt('packs', () => ({ odds: tourPack() })), sel: '.viewer .shop-sheet', title: 'The odds', text: 'Rarest first, with the chance that a card you pull is that one. Cards you already have say OWNED.' },
  { at: tourAt('open', () => ({ open: tourDemo('tear') })), sel: '.tear-zone', title: 'Cutting a pack', text: 'After you buy a pack, swipe across its top to cut it open (or tap "Tap to open"). This is just a look: the tour never opens a pack or spends coins.' },
  { at: tourAt('open', () => ({ open: tourDemo('deck') })), sel: '.deck3d', title: 'Peek at the edges', text: 'Spin the stack to peek before you look. Gold edges mean a Rare or better; shiny edges mean a holo, reverse holo or full art.' },
  { at: tourAt('open', () => ({ open: tourDemo('reveal') })), sel: '.reveal .stack .card', title: 'Flick through', text: 'Flick each card left or right to see the next one. Rare cards and special finishes get a bigger reveal.' },
  { at: tourAt('open', () => ({ open: tourDemo('summary') })), sel: '.pull-grid .pull', title: 'Your pulls', text: 'At the end you see everything you got. Sell any card for coins right here, or Sell all, and Undo if you change your mind.' },
  { at: tourColl(() => ({ fopen: true })), sel: '.coll-tools .chips:has([data-k=rar])', title: 'Star levels', text: 'Stars show how special a copy is, from ☆ to ★★★★★. These chips filter your collection by them.', extra: tourStars },
  { at: tourColl(() => ({ fopen: true })), sel: '#coll-search', title: 'Search', text: 'Type a name, card text, a move or an artist to find a card.' },
  { at: tourColl(), sel: ['.filters-toggle', '.coll-tools .fbody'], title: 'Filters', text: 'Show only cards you own, are missing or starred, pick a type or star level, and change the order.' },
  { at: tourColl(), sel: '.coll-cell:not(.locked) .card', title: 'Open a card', text: 'Tap one of your cards to look at it up close.', try: () => !!ui.viewer },
  { at: tourColl(() => ({ viewer: tourOwned() })), sel: '.viewer-card', title: 'Your copies', text: 'Every copy you own, one stack per finish. Tap a stack to choose that version, and drag the card to tilt it.' },
  { at: tourColl(() => ({ viewer: tourSpare() })), sel: ['.viewer [data-act=sell]', '.viewer-info'], title: 'Selling', text: () => `${$app.querySelector('.viewer [data-act=sell]') ? 'Sell a spare copy for coins here.' : 'Spare copies can be sold here for coins. The copies in your starter deck are kept safe, so you can never sell yourself out of a deck.'} If a sale would leave you fewer than ${MAX_COPIES}, the game checks with you first, because a deck can use ${MAX_COPIES}.` },
  { at: tourColl(() => ({ viewer: tourMissing() })), sel: '.find-btn', title: 'Find it in a pack', text: 'Missing a card? This shows which pack has it and your chance per pack, and takes you there.' },
  { at: tourAt('deck'), sel: '.checks', title: 'Deck rules', text: `A deck is ${DECK_SIZE} cards plus a Captain, with up to ${MAX_COPIES} copies of a card (Main Characters: 1). This line says when it's ready to battle.` },
  { at: tourAt('deck'), sel: '.captain-slot', title: 'Captain and Super', text: () => { const c = CARD[deck().captain];
    return `Your Captain leads the deck. Its Super costs Creativity, which you build up during a battle.${c ? ` ${esc(c.name)}: ${esc(c.text)}` : ''}`; } },
  { at: tourAt('build'), sel: '.cell:not(.locked) .stepper', title: 'Add and remove cards', text: () => `Tap + and − to change how many copies are in the deck (up to ${MAX_COPIES}). You can only add cards you own.` },
  { at: tourAt('shop'), sel: '.shop-page .shop-cell', title: 'Shop', text: () => `${shopSlots().length} cards for sale, in any finish, at ${SHOP_MARKUP}× what they sell for. NEW means you don't have that version yet; OWNED shows how many you do.` },
  { at: tourAt('shop'), sel: '.shop-timer', title: 'New stock', text: `The whole shop changes every ${ROTATE / 6e4} minutes, the same for everyone.` },
  { at: tourAt('lobby'), sel: '.panel:has([data-act=host])', title: 'Battle a friend', text: () => `Create room gives you a ${$app.querySelector('#join-code')?.maxLength || ''}-character room code. Send it, or the invite link, to a friend, who types it under Join a friend.` },
  { at: tourAt('home'), sel: '.tile[data-to=lobby]', title: 'Battles and rewards', text: () => `Battle has Ranked (real players and ranked bots) and friend rooms. Finished battles pay coins: beating the bot ${fmt(PAY.bot[0])}, losing to it ${fmt(PAY.bot[1])}; against a friend ${fmt(PAY.player[0])} for a win and ${fmt(PAY.player[1])} for a loss.` },
  { at: tourAt('profile'), sel: '.pf-acct', title: 'Account and cloud save', text: () => (cloud.user ? "You're signed in with Discord, so your progress is saved online and follows you to any device." : 'Sign in with Discord to save your progress online and carry on from any device.') },
  { at: tourAt('profile'), sel: '.pf-save', title: 'Save file', text: 'Export your save as a file for a backup, or import one. Importing replaces what is on this device.' },
  { at: tourAt('profile'), sel: '.pf-danger', title: 'Reset', text: 'Want a fresh start? Reset wipes your cards, coins and decks. You have to type RESET first, so it never happens by accident.' },
  { at: tourAt('profile'), sel: '.pf-oc', title: 'Submit a card', text: () => `Design a card with your own character and send it in for review. ${cloud.user ? 'My submissions shows how each one is doing.' : 'Sign in and My submissions shows how each one is doing.'}` },
  { at: tourAt('home'), sel: ['.vol-btn', '.vol-slider'], title: 'Volume', text: 'Turn the music and sounds up, down or off here, any time.' },
  { at: tourAt('home'), sel: '.tile[data-act=tutorial]', title: 'Now learn to battle', text: 'The battle tutorial plays a real game against the bot with you: playing cards, attacking, blocking and Supers.', last: true },
];

// First visible match of a step's selector(s).
const tourFind = st => {
  for (const s of [].concat(st.sel)) {
    let all = []; try { all = document.querySelectorAll(s); } catch { /* :has unsupported: treat as missing */ }
    const el = [...all].find(x => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(x).visibility !== 'hidden'; });
    if (el) return el;
  }
  return null;
};
// Stand aside for the gate, the "which save?" question, a battle and a reset in progress.
const tourPaused = () => gateUp() || !!ui.cloudAsk || ui.view === 'game' || !!ui.resetBusy;

function tourStart(i = 0, first = false) {
  tour.first = first; store.set('tour', { step: i, first });
  if (tourPaused()) tour.pend = i; else setTimeout(() => tourGo(i, 1)); // after the current click or render finishes
}
function tourGo(i, dir = 1) {
  if (i < 0) return tourGo(0, 1);
  if (i >= TOUR.length) return tourEnd();
  const st = TOUR[i];
  tour.i = i; store.set('tour', { step: i, first: tour.first });
  st.at(); render();
  const el = tourFind(st);
  if (!el) return tourGo(i + dir, dir);
  tourDom(); $app.inert = !st.try;
  const r = el.getBoundingClientRect();
  if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: r.height > innerHeight * 0.6 ? 'start' : 'center' });
  const card = tour.el.querySelector('.tour-card');
  card.innerHTML = `<small class="tour-n">${i + 1} of ${TOUR.length}${st.try ? '<b class="tour-try">Try it</b>' : ''}</small><h3 id="tour-title">${st.title}</h3><p>${typeof st.text === 'function' ? st.text() : st.text}</p>${st.extra ? st.extra() : ''}
    <div class="tour-btns"><button class="btn sm" data-tour="skip">Skip tour</button><button class="btn sm" data-tour="back"${i ? '' : ' disabled'}>Back</button><button class="btn sm primary" data-tour="next">${st.last ? 'Start the battle tutorial' : 'Next'}</button></div>`;
  tour.el.classList.toggle('try', !!st.try);
  card.focus({ preventScroll: true });
  tour.key = ''; tourSync();
}
function tourEnd(battle) {
  tour.i = -1; tour.pend = null; store.set('tour', { done: true });
  tour.el?.remove(); tour.el = null; if (!gateUp()) $app.inert = false;
  if (ui.open?.demo) Object.assign(ui, { open: null, view: 'packs' });
  Object.assign(ui, { odds: null, viewer: null });
  if (battle) startBot(true); // the battle tutorial teaches the rules in play (app.js TUT)
  render();
}
function tourDom() {
  if (tour.el) return;
  tour.el = Object.assign(document.createElement('div'), { className: 'tour' });
  tour.el.innerHTML = '<i class="tour-shade"></i><i class="tour-shade"></i><i class="tour-shade"></i><i class="tour-shade"></i><i class="tour-ring"></i><i class="tour-catch"></i>'
    + '<div class="tour-card neu" role="dialog" aria-modal="true" aria-labelledby="tour-title" tabindex="-1"></div>';
  tour.el.addEventListener('click', e => {
    const b = e.target.closest('[data-tour]'), st = TOUR[tour.i];
    if (b) { const a = b.dataset.tour; if (a === 'skip') tourEnd(); else if (a === 'back') tourGo(tour.i - 1, -1); else if (st?.last) tourEnd(true); else tourGo(tour.i + 1, 1); }
    else if (e.target.matches('.tour-shade, .tour-catch') && !st?.last) tourGo(tour.i + 1, 1); // tapping the dim or the highlight = Next
  });
  document.body.append(tour.el);
}
// Keep the highlight on its element (re-renders, scrolling, resizing) and move on when a "Try it" step's action happened.
function tourSync() {
  const st = TOUR[tour.i]; if (!st || !tour.el) return;
  const paused = tourPaused(); tour.el.hidden = paused;
  if (paused) { if (!gateUp()) $app.inert = false; return; }
  $app.inert = !st.try;
  if (st.try?.()) return void setTimeout(() => { if (TOUR[tour.i] === st) tourGo(tour.i + 1, 1); });
  const el = tourFind(st); if (!el) return; // mid re-render: keep the last spot
  const r = el.getBoundingClientRect(), key = [r.left, r.top, r.width, r.height, innerWidth, innerHeight].map(Math.round).join();
  if (key !== tour.key) { tour.key = key; tourPlace(r); }
}
// Highlight = the element's box (inside the screen); the card goes below or above it, never over it. With no room either side, the
// card takes the bigger side and the highlight stops short of it.
function tourPlace(box) {
  const W = innerWidth, H = innerHeight, m = 10, card = tour.el.querySelector('.tour-card'), cw = Math.min(380, W - 2 * m);
  const h = { l: Math.max(0, box.left - 6), t: Math.max(0, box.top - 6), r: Math.min(W, box.right + 6), b: Math.min(H, box.bottom + 6) };
  card.style.width = cw + 'px';
  const ch = card.offsetHeight;
  let top;
  if (H - h.b >= ch + 2 * m) top = h.b + m;
  else if (h.t >= ch + 2 * m) top = h.t - m - ch;
  else if (H - h.b >= h.t) { top = H - ch - m; h.b = Math.max(h.t, Math.min(h.b, top - m)); }
  else { top = m; h.t = Math.min(h.b, Math.max(h.t, top + ch + m)); }
  const left = Math.max(m, Math.min(W - cw - m, (h.l + h.r) / 2 - cw / 2));
  Object.assign(card.style, { left: left + 'px', top: Math.max(m, top) + 'px' });
  const [s0, s1, s2, s3] = tour.el.querySelectorAll('.tour-shade'), put = (el, l, t, w, hh) => Object.assign(el.style, { left: l + 'px', top: t + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, hh) + 'px' });
  put(s0, 0, 0, W, h.t); put(s1, 0, h.b, W, H - h.b); put(s2, 0, h.t, h.l, h.b - h.t); put(s3, h.r, h.t, W - h.r, h.b - h.t);
  put(tour.el.querySelector('.tour-ring'), h.l, h.t, h.r - h.l, h.b - h.t); put(tour.el.querySelector('.tour-catch'), h.l, h.t, h.r - h.l, h.b - h.t);
  tour.el.dataset.rect = [h.l, h.t, h.r - h.l, h.b - h.t].map(Math.round).join(); // for checks
}

const renderNoTour = render;
render = function () {
  renderNoTour();
  if (tour.pend != null && !tourPaused()) { const i = tour.pend; tour.pend = null; setTimeout(() => tourGo(i, 1)); }
  else if (tour.i >= 0) tourSync();
};
addEventListener('resize', () => tour.i >= 0 && tourSync());
document.addEventListener('scroll', () => tour.i >= 0 && tourSync(), true);
setInterval(() => tour.i >= 0 && tourSync(), 300); // safety net: things that move without an event (transitions, late images)
document.addEventListener('keydown', e => { if (e.key === 'Escape' && tour.i >= 0 && !tourPaused()) { e.stopPropagation(); tourEnd(); } }, true);
ACTS['tour-replay'] = () => { tourStart(0); return false; };
{ const t = store.get('tour', null); if (onb.done && Number.isInteger(t?.step)) tourStart(Math.min(Math.max(0, t.step), TOUR.length - 1), !!t.first); } // a reload resumes
