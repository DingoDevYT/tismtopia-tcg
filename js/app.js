// App shell: screens, saved decks and PeerJS networking.
// The host is player 0 and runs the rules engine; the guest (player 1) sends actions and gets the full state back.
// shortcut: the guest receives the whole state (including the host's hand), fine between friends; hide it if strangers ever play.
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('tismtopia.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tismtopia.' + k, JSON.stringify(v)); } catch { /* private mode: decks last this visit only */ } },
};
const uid = () => Math.random().toString(36).slice(2, 10);
// New players own nothing and earn their first deck from 8 free starter packs (js/onboard.js). A save from before that
// (a collection but no onboarding record) is marked legacy once, here: it keeps every free starter deck, topped up on each load.
let onb = store.get('onboard', null);
if (!onb || typeof onb !== 'object') store.set('onboard', onb = store.get('collection', null) ? { done: true, legacy: true } : { opened: 0 });
let decks = store.get('decks', null);
// Old saves can hold placeholder cards that no longer exist: drop those, then add back any missing free starter.
decks = (Array.isArray(decks) ? decks : []).map(d => ({ ...d, captain: CARD[d.captain]?.type === 'captain' ? d.captain : CAPTAINS[0].id,
  cards: Object.fromEntries(Object.entries(swapDeck({ ...d.cards })).filter(([id]) => CARD[id] && CARD[id].type !== 'captain')) })).filter(d => Object.keys(d.cards).length && !/^All-Stars [AB]$/.test(d.name)); // retired 20-card starters
if (onb.legacy) decks.unshift(...STARTERS.filter(s => !decks.some(d => d.name === s.name)).map(s => ({ id: uid(), ...structuredClone(s) })));
if (!decks.length) decks.push({ id: uid(), name: 'My Deck', captain: null, cards: {} }); // a new player's stand-in until the starter packs make the real one
let myName = store.get('name', 'Player');
const ui = { view: 'home', deckId: store.get('deck', decks[0].id), filter: 'all', zoom: null, sheet: null, defPick: null, defOrder: [], toast: '', code: '', status: '', joinCode: '', tut: null };
// `state` is the authoritative game (rules run on it); `game` is what's on screen, which trails it while animations play.
let peer = null, conn = null, isHost = false, me = 0, state = null, game = null, guest = null, toastTimer, bot = false, botTimer;

const $app = document.getElementById('app');
const deck = () => decks.find(d => d.id === ui.deckId) || decks[0];
const saveDecks = () => store.set('decks', decks);
const own = id => (typeof owned === 'function' ? owned(id) : MAX_COPIES); // collection lives in packs.js
// Your best finish for each Character in a deck, so foils show in battle (and to your opponent).
const finishesFor = d => (typeof bestFinish === 'function' ? Object.fromEntries(Object.keys(d.cards).map(id => [id, bestFinish(id)]).filter(([, f]) => f !== 'normal')) : {});
const cleanFin = f => Object.fromEntries(Object.entries(f && typeof f === 'object' ? f : {}).filter(([id, v]) => CARD[id]?.type === 'character' && ['rev', 'holo', 'full'].includes(v)));
const count = d => Object.values(d.cards).reduce((a, b) => a + b, 0);
const json = a => esc(JSON.stringify(a));
const cost = n => `<span class="cost">${n}${ICON.action}</span>`;
const btn = (a, label, cls = '') => `<button class="btn ${cls}" data-act="do" data-a="${json(a)}">${label}</button>`;
const stepper = (label, minus, plus) => `<div class="stepper neu"><button data-act="do" data-a="${json(minus)}" aria-label="Less">−</button><span>${label}</span><button data-act="do" data-a="${json(plus)}" aria-label="More">+</button></div>`;
const sheet = (html, closable = true) => `<div class="dim"${closable ? ' data-act="close"' : ''}></div><div class="sheet"><div class="grab"></div>${html}</div>`;
const header = t => `<h1 class="title">${t}</h1><div class="rainbow"></div>`;
// Phone: the search box / filter chips hide behind this button (state in ui.fopen); CSS always shows them on wider screens.
const filtersToggle = () => `<button class="btn sm filters-toggle" data-act="filters" aria-expanded="${!!ui.fopen}">Filters${ICON.chevron}</button>`;
const tappable = (act, extra) => `data-act="${act}" ${extra} tabindex="0" role="button"`;

function toast(msg) {
  const changed = msg !== ui.toast;
  ui.toast = msg; render();
  if (changed) $app.querySelector('.toast:not(.wait)')?.classList.add('enter');
  clearTimeout(toastTimer);
  // Remove just the toast rather than re-rendering, so running card animations aren't cut off.
  toastTimer = setTimeout(() => { ui.toast = ''; $app.querySelector('.toast:not(.wait)')?.remove(); }, 2800);
}

function copy(text, what) {
  navigator.clipboard.writeText(text).then(() => toast(`${what} copied.`), () => prompt(`Copy the ${what.toLowerCase()}:`, text));
}

// ---------------- views ----------------
const tabbar = on => `<nav class="tabbar">${[['home', 'home'], ['search', 'collection'], ['cards', 'deck'], ['battle', 'lobby'], ['people', 'social'], ['rules', 'rules']].map(([icon, view]) =>
  `<button class="${view === on ? 'on' : ''}" data-act="go" data-to="${view}" aria-label="${view}">${ICON[icon]}</button>`).join('')}</nav>`;

const deckSelect = withNew => `<label class="deckname neu-in"><select data-change="pick-deck" aria-label="Deck">${decks.map(d =>
  `<option value="${d.id}"${d.id === deck().id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}${withNew ? '<option value="new">+ New deck</option>' : ''}</select>${ICON.chevron}</label>`;

// Home showcase: three Characters with art in rare finishes (holo, full-art holo, reverse holo).
let heroPick = null;
const heroCards = () => {
  const withArt = CARDS.filter(c => c.type === 'character' && c.art);
  const pick = withArt.length >= 3 ? withArt : CARDS.filter(c => c.type === 'character');
  // three random Characters, picked once per visit, all shown as 5-star rainbows
  heroPick ||= [...pick].sort(() => Math.random() - 0.5).slice(0, 3);
  return heroPick.map(c => [c, 'v-full v-holo v-rainbow']);
};
function viewHome() {
  return `<div class="topbar"><button class="profile neu" data-act="rename-me" aria-label="Change your name">${renderAvatar(CARD[deck().captain] || CAPTAINS[0])}<b>${esc(myName)}</b></button></div>
  <div class="logo"><img src="art/logo.png" alt="Tismtopia"><span>TRADING CARD GAME</span></div>
  <section class="hero neu">
    <div class="fan">${heroCards().map(([c, v], i) => renderCard(v.includes('v-full') ? { ...c, crop: null } : c, { cls: v, style: `--r:${(i - 1) * 9}deg;--y:${Math.abs(i - 1) * 14}px;--d:${-i * 1.7}s` })).join('')}</div>
    <div class="row2"><button class="btn primary" data-act="go" data-to="lobby" data-host="1">Host Battle</button><button class="btn" data-act="go" data-to="lobby">Join Battle</button></div>
  </section>
  <div class="tiles">
    <button class="tile neu" data-act="tutorial">${ICON.school}<b>Tutorial</b><small>Learn by playing</small></button>
    <button class="tile neu" data-act="bot">${ICON.bot}<b>Practice</b><small>Play vs the bot</small></button>
    <button class="tile neu" data-act="go" data-to="lobby">${ICON.battle}<b>Battle</b><small>Play a friend</small></button>
    <button class="tile neu" data-act="go" data-to="packs">${ICON.main}<b>Open Packs</b><small>${typeof ownedCount === 'function' ? ownedCount() : 0} of ${CARDS.length} owned</small></button>
    <button class="tile neu" data-act="go" data-to="collection">${ICON.search}<b>Collection</b><small>Your cards</small></button>
    <button class="tile neu" data-act="go" data-to="deck">${ICON.cards}<b>Deck Builder</b><small>${decks.length} deck${decks.length > 1 ? 's' : ''}</small></button>
    <button class="tile neu" data-act="go" data-to="rules">${ICON.rules}<b>How to Play</b><small>Rules</small></button>
  </div>${tabbar('home')}`;
}

function viewDeck() {
  const d = deck(), cap = CARD[d.captain], probs = deckProblems(d);
  return `${header('Decks')}
  <div class="panel neu" style="padding:10px 12px"><div class="row2">${deckSelect(true)}
    <button class="btn sm" style="flex:none" data-act="rename-deck">Rename</button><button class="btn sm" style="flex:none" data-act="delete-deck">Delete</button></div></div>
  <div class="captain-slot neu">${cap ? renderCard(cap, { attrs: tappable('zoom', `data-id="${cap.id}"`) }) : '<div class="slot"></div>'}
    <div><small>Captain</small><b>${cap ? cap.name : 'None yet'}</b><p>${cap ? `${cap.style} playstyle` : 'Your Captain leads your strategy.'}</p>
    <button class="btn sm" data-act="sheet" data-s="captain">${cap ? 'Change' : 'Pick a captain'}</button></div></div>
  <div class="checks">${probs.length ? probs.slice(0, 3).map(p => `<span class="bad">${esc(p)}</span>`).join('') : `<span>${ICON.check}Ready to battle</span>`}</div>
  <div class="grid">${Object.entries(d.cards).map(([id, n]) => `<div class="cell">${typeof pile === 'function' ? pile(id, n, '', tappable('zoom', `data-id="${id}"`)) : renderCard(CARD[id], { cls: 'mini', attrs: tappable('zoom', `data-id="${id}"`) })}<span class="count">×${n}</span></div>`).join('')
    || '<p class="muted center" style="grid-column:1/-1">No cards yet. Tap Add cards.</p>'}</div>
  <div class="bar"><button class="btn sm" data-act="copy-deck">Copy code</button><button class="btn sm" data-act="import-deck">Import</button><button class="btn primary sm" style="margin-left:auto" data-act="go" data-to="build">Add cards</button></div>
  ${tabbar('deck')}${overlay()}`;
}

function viewBuild() {
  const d = deck(), n = count(d), list = CARDS.filter(c => ui.filter === 'all' || c.type === ui.filter);
  return `${header('Add Cards')}
  <div class="panel neu filter-panel${ui.fopen ? ' open' : ''}">${filtersToggle()}<div class="fbody"><div class="chips">${['all', 'character', 'bit', 'evil'].map(f =>
    `<button class="chip${ui.filter === f ? ' on' : ''}" data-act="filter" data-f="${f}">${f === 'all' ? 'All' : LABEL[f]}</button>`).join('')}</div></div></div>
  <div class="grid">${list.map(c => `<div class="cell${own(c.id) ? '' : ' locked'}">${typeof pile === 'function' ? pile(c.id, Math.min(3, own(c.id)), '', tappable('zoom', `data-id="${c.id}"`)) : renderCard(c, { attrs: tappable('zoom', `data-id="${c.id}"`) })}
    <div class="stepper neu"><button data-act="step" data-id="${c.id}" data-d="-1" aria-label="Remove ${esc(c.name)}">−</button><span>${d.cards[c.id] || 0}/${Math.min(c.main ? 1 : MAX_COPIES, own(c.id))}</span><button data-act="step" data-id="${c.id}" data-d="1" aria-label="Add ${esc(c.name)}">+</button></div></div>`).join('')}</div>
  <div class="bar"><b>${n}/${DECK_SIZE}</b><div class="progress"><i style="width:${Math.min(100, (n / DECK_SIZE) * 100)}%"></i></div><button class="btn primary sm" data-act="go" data-to="deck">Done</button></div>
  ${overlay()}`;
}

function viewLobby() {
  const probs = deckProblems(deck()), ok = !probs.length, dis = ok ? '' : ' disabled';
  return `${header('Battle')}
  <div class="panel neu"><small class="lbl">Your deck</small>${deckSelect(false)}
    ${ok ? '' : `<p class="muted" style="margin:8px 0 0;color:var(--accent)">Not legal yet: ${esc(probs[0])}</p>`}</div>
  ${ui.code ? `<div class="panel neu"><small class="lbl">Hosting</small><div class="code neu-in">${ui.code}</div>
      <p class="muted center">${esc(ui.status)} <span class="spin"></span></p>
      <div class="row2"><button class="btn" data-act="copy-link">Copy invite link</button><button class="btn" data-act="cancel">Cancel</button></div></div>`
    : `<div class="panel neu"><small class="lbl">Host a battle</small><button class="btn primary wide" data-act="host"${dis}>Create room</button></div>
    <div class="or">or</div>
    <div class="panel neu"><small class="lbl">Join a friend</small>
      <input class="input" id="join-code" placeholder="ROOM CODE" maxlength="6" autocomplete="off" autocapitalize="characters" value="${esc(ui.joinCode)}" aria-label="Room code">
      <button class="btn primary wide" data-act="join"${dis}>Join</button>
      ${ui.status ? `<p class="muted center" style="margin:10px 0 0">${esc(ui.status)}</p>` : ''}</div>`}
  ${tabbar('lobby')}`;
}

const viewRules = () => `${header('How to Play')}
  <div class="scroll rules"><button class="btn wide tour-again" data-act="tour-replay">Replay the tour</button>${RULES.map(([h, t, ic, ex]) => {
    if (h === 'Coins' && typeof PAY !== 'undefined') t = `Finished battles pay coins. Beating the bot: ${PAY.bot[0]}, losing to it: ${PAY.bot[1]}. Playing a friend: ${PAY.player[0]} for a win, ${PAY.player[1]} for a loss.`;
    return `<section class="rule neu"><span class="rule-ic">${ICON[ic] || ''}</span><div><h3>${h}</h3><p>${t}</p>${ex ? `<p class="ex"><b>Example:</b> ${ex}</p>` : ''}</div></section>`;
  }).join('')}</div>
  ${tabbar('rules')}`;

function viewGame() {
  const g = game, mine = g.players[me], live = g.turn === me && g.phase === 'play';
  if (g.phase === 'over') return viewOver();
  const glow = live ? mine.field.flatMap((f, i) => (canUseAny(g, me, f) ? [i] : [])) : [];
  let html = renderBoard(g, me, { glow, sel: ui.zoom?.zone === 'hand' ? ui.zoom.i : undefined, superReady: superReady(g) });
  if (g.phase === 'defend' && g.turn !== me) html += defendSheet();
  else html += overlay();
  const wait = g.phase === 'defend' && g.turn === me;
  const banner = wait ? `Waiting for ${g.players[1 - me].name} to pick a blocker…` : ui.toast;
  return html + (banner ? `<div class="toast neu${wait ? ' wait' : ''}">${esc(banner)}</div>` : '') + coach();
}

// ---------------- tutorial: a guided bot battle; each step waits for `done(game)` or a Next tap ----------------
const MY = '.side:nth-child(4)';
// The tutorial Character: the first starter card with a 1-Action attack that can be used straight away.
const TC = CARD[Object.keys(STARTER.cards).find(id => CARD[id].type === 'character' && !CARD[id].sick && (CARD[id].cost ?? 1) <= 1 && CARD[id].moves.some(m => m.cost === 1 && !m.ability))];
const TM = TC.moves.find(m => m.cost === 1 && !m.ability);
const TUT = [
  { text: `Welcome to Tismtopia! Bore your opponent out: whoever reaches ${BORE_MAX} Boredom loses. This quick battle shows you how.`, next: true },
  { text: 'This is you: your Captain card and your meters. Boredom (grey) is your health: fill it up and you lose. Creativity (orange) is your hype: you gain 1 every turn, then spend it on your Captain\'s Super (the marked notch).', sel: `${MY} .hud`, next: true },
  { text: "Actions are the lightning bolts. Playing a card costs 1 (the number on the card) and each move shows its cost. Each turn you get 2 more, and unspent ones are saved up to 5. (In a real game the first player's very first turn has just 1; this lesson gives you 2.)", sel: '.pips', next: true },
  { text: `Tap ${TC.name} in your hand, then tap Play.`, sel: () => (ui.zoom ? '.dim [data-a*=\'"play"\']' : `.hand .card[data-id="${TC.id}"]`), done: g => g.players[0].field.length > 0 },
  { text: `Characters attack with moves, each costing Actions. Tap ${TC.name} on the field and use ${TM.name} (1 Action). Nobody can block, so its damage goes straight to their Boredom.`,
    sel: () => (ui.zoom ? '.dim [data-a*=\'"attack"\']' : `${MY} .field .card`), done: g => g.players[1].bore > 0 },
  { text: "Their Boredom went up by the attack's damage. You're out of Actions, so tap End Turn.", sel: '[data-act=end]', done: g => g.turn === 1 },
  { text: "The bot's turn. When it attacks, you pick which of your Characters blocks: tap one, then tap Block. The blocker takes the attack's power minus its armour (the shield number).",
    sel: () => (game.phase !== 'defend' ? null : ui.defPick != null ? '.sheet [data-a*=\'"defend"\']' : '.sheet .field .card'), done: g => !!g.roll || (g.turn === 0 && g.turnNo > 2) },
  { text: 'The blue shield number is armour: it soaks up that much of every hit. If armour covers the whole hit, you see "Blocked!" and nothing gets through.', next: true },
  { text: 'Overkill: damage past a Character’s HP spills to your next Character (its armour counts too), and only what is left after the whole field becomes Boredom. Watch for the streak between cards.', next: true },
  { text: 'At the start of each of your turns you draw a card, get 2 Actions and gain 1 Creativity. A banner tells you, and a +1 pops up on the meter.', sel: `${MY} .meter.goof`, next: true },
  { text: "Creativity is spent on your Captain's Super (once per turn, no Actions needed). The notch on the bar is its cost, and it lights up when you can afford it. Then a glowing SUPER button appears on your Captain: tap it to see what it does, then tap Use Super.", sel: `${MY} .hud .card.cap`, next: true },
  { text: 'Items come in two kinds. Instant Items (lightning tag) do their thing when played, then vanish. Timed Items (hourglass tag) stay and count down turns when you end your turn.', sel: '.hand', next: true },
  { text: 'Some Items stay in play: the tag shows the turns or uses left, and they leave when it runs out. Tap your meters any time for the log and tools.', next: true },
  { text: "That's the basics! Finish this battle against the bot, then build your own deck.", next: 'Got it' },
];

function coach() {
  if (ui.tut == null || !game) return '';
  while (TUT[ui.tut]?.done?.(game)) ui.tut++;
  const s = TUT[ui.tut];
  if (!s) return (ui.tut = null), '';
  return `<div class="coach neu"><p>${s.text}</p><div class="row2"><button class="btn sm" data-act="tut-skip">Skip tutorial</button>${s.next ? `<button class="btn sm primary" data-act="tut-next">${s.next === true ? 'Next' : s.next}</button>` : ''}</div></div>`;
}

// ---------------- bot: adds a Character, attacks with its strongest, plays Items/Evils, uses abilities, blocks with its toughest ----------------
// shortcut: greedy, no lookahead; fine for practice, not a real opponent.
// Each battle the bot takes a random starter deck and a random Captain, so it isn't the same opponent every time (the tutorial keeps one fixed).
const botDeck = tutorial => tutorial ? STARTERS[1] : { ...STARTERS[Math.floor(Math.random() * STARTERS.length)], captain: CAPTAINS[Math.floor(Math.random() * CAPTAINS.length)].id };
const best = (idx, score) => idx.reduce((b, i) => (score(i) > score(b) ? i : b), idx[0]);

function startBot(tutorial) {
  if (!tutorial && deckProblems(deck()).length) return toast('Fix your deck first.');
  leave(true); bot = true; isHost = true; me = 0;
  const d = tutorial ? STARTER : deck(), g = newGame([{ captain: d.captain, cards: d.cards, finishes: finishesFor(d) }, botDeck(tutorial)], [myName, 'Bot']);
  if (tutorial) {
    g.turn = 0; g.actions = 2; g.log = ['Tutorial battle: you go first.']; // 2 Actions so you can play and attack in the first turn
    g.players[0].hand[0] = TC.id;
  }
  g.players[0].pfp = myPfp(); g.players[1].pfp = g.players[1].captain; // profile pictures (js/social.js); the bot's is its Captain
  ui.tut = tutorial ? 0 : null;
  state = game = null; setGame(g); botSoon();
}

const botSoon = (ms = 1100) => { clearTimeout(botTimer); botTimer = setTimeout(botMove, ms); }; // a pause between the bot's actions so each one can be seen

function botMove() {
  const g = state;
  if (!bot || !g || g.phase === 'over') return;
  if (game !== g) return botSoon(300); // wait until the screen has caught up with the last move
  const B = g.players[1], n = g.actions, all = B.field.map((_, i) => i);
  let a = null;
  if (g.phase === 'defend' && g.turn === 0) {
    const mv = CARD[g.players[0].field[g.pending.i].id].moves[g.pending.m], pw = mv.power + statsOf(g, 0, g.players[0].field[g.pending.i]).bonus;
    a = { type: 'defend', i: best(all.filter(i => canBlock(g, 1, i)), i => { const d = Math.max(0, pw - statsOf(g, 1, B.field[i]).def); return (d < B.field[i].hp ? 100 : 0) - d * 10 + B.field[i].hp; }) }; // shy Characters can't block (canBlock)
    if (typeof rkOrder === 'function') a.order = rkOrder(g, 1, a.i); // least-loss spill order (js/ranked.js)
  } else if (g.turn === 1 && g.phase === 'play') {
    const hc = B.hand.findIndex(id => CARD[id].type === 'character'), canPlay = hc >= 0 && B.field.length < 3;
    // Every move it can afford right now; attacks score by power per Action, abilities are a fallback.
    const moves = all.flatMap(i => CARD[B.field[i].id].moves.map((mv, m) => ({ i, m, mv, c: moveCost(g, 1, mv) })))
      .filter(x => !moveBlock(g, 1, B.field[x.i], x.m));
    const boost = moves.find(x => x.mv.ability && x.c === 0); // free Action-givers first
    const attacks = moves.filter(x => !x.mv.ability), abil = moves.find(x => x.mv.ability);
    const spell = B.hand.findIndex(id => CARD[id].type !== 'character' && playCost(g, 1, CARD[id]) <= n);
    const cap = CARD[B.captain];
    if (boost) a = { type: 'attack', i: boost.i, m: boost.m };
    else if (cap.ability && B.goof >= (cap.goof || 0) && !(cap.once && g.capUsed)) a = { type: 'ability', i: -1 };
    else if (n >= 2 && canPlay) a = { type: 'play', i: hc };
    else if (attacks.length) { const x = attacks[best(attacks.map((_, k) => k), k => attacks[k].mv.power / attacks[k].c + attacks[k].mv.power * 0.1)]; a = { type: 'attack', i: x.i, m: x.m }; }
    else if (spell >= 0) a = { type: 'play', i: spell };
    else if (n && canPlay) a = { type: 'play', i: hc };
    else if (abil) a = { type: 'attack', i: abil.i, m: abil.m };
    else a = { type: 'end' };
  }
  if (a && !act(1, a) && a.type !== 'end') act(1, { type: 'end' });
}

function viewOver() {
  const g = game, mine = g.players[me], opp = g.players[1 - me];
  return `<div class="victory">${pfpAvatar(mine.pfp || mine.captain, ' xl')}<small>vs. ${esc(opp.name)} (${CARD[opp.captain].name})</small>
    <h1 class="big">${g.winner === me ? 'Victory!' : 'Defeat'}</h1><div class="rainbow"></div>
    <div class="stats-list neu-in">
      <div><span>Your Boredom</span><b>${mine.bore}/${BORE_MAX}</b></div>
      <div><span>${esc(opp.name)}'s Boredom</span><b>${opp.bore}/${BORE_MAX}</b></div>
      <div><span>Turns played</span><b>${g.turnNo}</b></div>
      <div><span>Boredom inflicted</span><b><span class="bore-i">${ICON.bore}</span>${mine.stats.bore}</b></div>
      <div><span>Creativity built</span><b><span class="goof-i">${ICON.goof}</span>${mine.stats.goof}</b></div>
    </div>
    <div class="row2"><button class="btn primary" data-act="rematch"${conn || bot ? '' : ' disabled'}>Rematch</button><button class="btn" data-act="leave">Home</button></div></div>
    ${ui.toast ? `<div class="toast neu">${esc(ui.toast)}</div>` : ''}`;
}

// Zoomed card, captain picker or adjust sheet on top of the current view.
function overlay() {
  if (ui.sheet === 'captain') return sheet(`<h2>Choose your Captain</h2>
    <div class="grid caps">${CAPTAINS.map(c => renderCard(c, { cls: c.id === deck().captain ? 'picked' : '', attrs: tappable('captain', `data-id="${c.id}"`) })).join('')}</div>
    <button class="btn wide" data-act="close">Close</button>`);
  if (ui.sheet === 'adjust' && game) return adjustSheet();
  if (ui.sheet === 'super' && game) return superSheet();
  if (ui.sheet?.startsWith('fx:') && game) { // phone: a side's active Items/Evils, full size
    const who = ui.sheet.slice(3), t = game.players[who === 'me' ? me : 1 - me];
    return sheet(`<h2>${who === 'me' ? 'Your' : `${esc(t.name)}'s`} effects</h2>
      <div class="grid fxs">${t.effects.map((e, i) => renderCard(CARD[e.id], { turns: e.turns, attrs: pick(who, 'fx', i) })).join('')}</div>
      <button class="btn wide" data-act="close">Close</button>`);
  }
  if (!ui.zoom) return '';
  if (ui.zoom.id) return `<div class="dim" data-act="close">${renderCard(CARD[ui.zoom.id], { cls: 'zoom' })}<button class="btn sm" data-act="close">Close</button></div>`;
  return zoomGame(ui.zoom);
}

function zoomGame(z) {
  const w = z.who === 'me' ? me : 1 - me, t = game.players[w];
  if (z.zone === 'cap') {
    const c = CARD[t.captain], can = w === me && game.turn === me && game.phase === 'play' && c.ability && t.goof >= (c.goof || 0) && !(c.once && game.capUsed);
    return `<div class="dim" data-act="close">${renderCard(c, { cls: 'zoom' })}<div class="row2">${can ? btn({ type: 'ability', i: -1 }, `${ICON.super}Super: ${c.goof} Creativity`, 'primary') : ''}
      <button class="btn" data-act="sheet" data-s="adjust">Meters, log &amp; tools</button></div><button class="btn sm" data-act="close">Close</button></div>`;
  }
  const item = { hand: t.hand, field: t.field, fx: t.effects }[z.zone]?.[z.i];
  if (item === undefined) { ui.zoom = null; return ''; }
  const c = CARD[item.id ?? item], live = game.turn === me && game.phase === 'play', mine = w === me;
  const remove = btn({ type: 'discard', who: w, zone: z.zone, i: z.i }, z.zone === 'hand' ? 'Discard' : 'Remove');
  let rows = '';
  if (z.zone === 'hand') rows = `<div class="row2">${live ? btn({ type: 'play', i: z.i }, `Play ${cost(playCost(game, me, c))}`, 'primary') : ''}${remove}</div>`;
  if (z.zone === 'field') {
    // One button per move; greyed out when it can't be used right now.
    const bonus = statsOf(game, w, item).bonus;
    const acts = c.moves.map((mv, m) => {
      const n = moveCost(game, me, mv), why = moveBlock(game, me, item, m);
      const label = `<span class="mb-name">${mv.name}${why ? `<small>${why}</small>` : ''}</span>${mv.ability ? '' : `<span class="mb-pow">${mv.power + bonus}</span>`}${n ? cost(n) : '<span class="cost">Free</span>'}`;
      return why ? `<button class="btn move-btn" disabled>${label}</button>` : btn({ type: 'attack', i: z.i, m }, label, `move-btn${m === 0 ? ' primary' : ''}`);
    });
    rows = (mine && live ? `<div class="row2">${acts.join('')}</div>` : '')
      + `<div class="row2">${stepper(`HP ${item.hp}`, { type: 'hp', who: w, i: z.i, d: -1 }, { type: 'hp', who: w, i: z.i, d: 1 })}${remove}</div>`;
  }
  if (z.zone === 'fx') rows = `<div class="row2">${!mine && live && c.type === 'evil' ? btn({ type: 'cleanse', i: z.i }, `Cleanse ${cost(2)}`, 'primary') : ''}${item.turns != null ? stepper(`${item.turns} turn${item.turns > 1 ? 's' : ''}`, { type: 'turns', who: w, i: z.i, d: -1 }, { type: 'turns', who: w, i: z.i, d: 1 }) : ''}${remove}</div>`;
  const stats = z.zone === 'field' ? statsOf(game, w, item) : {};
  return `<div class="dim" data-act="close">${renderCard(finCard(t, item.id ?? item), { cls: 'zoom' + finCls(t, item.id ?? item), hp: item.hp, turns: item.turns, ...stats })}${rows}<button class="btn sm" data-act="close">Close</button></div>`;
}

// Your Captain's Super can be used right now (the engine's rule in game.js 'ability').
const superReady = (g = game) => { const t = g.players[me], c = CARD[t.captain]; return g.turn === me && g.phase === 'play' && !!c.ability && t.goof >= (c.goof || 0) && !(c.once && g.capUsed); };
// "Super, 6 Creativity: Supernova. Opponent +4 Boredom…" -> { name: 'Supernova', effect: 'Opponent +4 Boredom…' }
const superInfo = c => { const m = /^Super,\s*\d+\s*Creativity:\s*([^.!]+)[.!]\s*([\s\S]*)$/.exec(c.text || ''); return m ? { name: m[1].trim(), effect: m[2].trim() } : { name: 'Super', effect: c.text || '' }; };

// Confirm popup for the SUPER button: what the Super does and what it costs, then Use Super / Not now.
function superSheet() {
  if (!superReady()) { ui.sheet = null; return ''; } // no longer usable (turn ended, Creativity changed)
  const c = CARD[game.players[me].captain], s = superInfo(c);
  return sheet(`<div class="super-ask"><div class="super-art">${ICON.captain}${c.art ? `<img ${assetSrc(c.art)} alt="" onerror="this.remove()">` : ''}</div>
      <div><small>${esc(c.name)}'s Super</small><h2>${esc(s.name)}</h2><span class="super-cost"><span class="goof">${ICON.goof}</span>${c.goof || 0} Creativity</span></div></div>
    <p class="super-what"><b>What it does</b>${esc(s.effect)}</p>
    <div class="row2"><button class="btn" data-act="close">Not now</button>${btn({ type: 'ability', i: -1 }, `${ICON.super}Use Super`, 'primary')}</div>`);
}

function adjustSheet() {
  const g = game, cap = CARD[g.players[me].captain], live = g.turn === me && g.phase === 'play' && cap.ability && g.players[me].goof >= (cap.goof || 0) && !(cap.once && g.capUsed);
  const meters = [['goof', 'Creativity', 'goof'], ['bore', 'Boredom', 'bore']];
  return sheet(`<h2>Adjust</h2><p class="muted center" style="margin-bottom:12px">Card text runs by itself. Use these for anything it misses; both players see every change.</p>
    ${[me, 1 - me].map(w => `<div class="adj neu-in"><b>${esc(g.players[w].name)}${w === me ? ' (you)' : ''}</b>
      ${meters.map(([icon, label, key]) => `<div class="adj-row"><span><span class="${icon}">${ICON[icon]}</span>${label}</span>${stepper(g.players[w][key],
        { type: 'adjust', who: w, key, d: -1 }, { type: 'adjust', who: w, key, d: 1 })}</div>`).join('')}</div>`).join('')}
    <div class="adj neu-in"><div class="adj-row"><span><span class="point">${ICON.action}</span>Actions this turn</span>${stepper(g.actions,
      { type: 'adjust', who: me, key: 'actions', d: -1 }, { type: 'adjust', who: me, key: 'actions', d: 1 })}</div></div>
    <div class="row2">${btn({ type: 'draw' }, 'Draw a card')}${live ? btn({ type: 'ability', i: -1 }, `${cap.name}'s Super`, 'primary') : ''}</div>
    <small class="lbl" style="margin-top:18px">Log</small><div class="log">${g.log.slice(-15).reverse().map(l => `<p>${esc(l)}</p>`).join('')}</div>
    <div class="row2" style="margin-top:14px"><button class="btn" data-act="leave-battle">Leave battle</button><button class="btn primary" data-act="close">Done</button></div>`);
}

// The defend picker's maths, straight from the engine (apply on a copy): who takes how much if `b` blocks and the spill follows `order`.
// multi: some other Character would take damage, so the defender picks the order by hand. shown: the blocker and the ordered ones.
// left: damage still unplaced after them; done: nobody unordered would be hit (the rest stops at armour or becomes Boredom).
function defView(g = game, b = ui.defPick, order = ui.defOrder || []) {
  const run = o => { try { return apply(g, me, { type: 'defend', i: b, order: o }, () => 0.5).events.find(e => e.k === 'attack').roll; } catch { return null; } };
  const r = b == null ? null : run(order), r0 = r && run([]);
  if (!r) return null;
  const af = g.players[g.turn].field[g.pending.i], power = CARD[af.id].moves[g.pending.m].power + statsOf(g, g.turn, af).bonus, shown = r.hits.slice(0, order.length + 1);
  let left = power; for (const h of shown) { const through = Math.max(0, left - h.def); left = through ? through - h.taken : 0; }
  return { multi: r0.hits.length > 1, shown, left, done: r.hits.length <= shown.length, bore: r.bore };
}
const NTH = n => ['1st', '2nd', '3rd', '4th', '5th'][n] || `${n + 1}th`;

function defendSheet() {
  const g = game, af = g.players[g.turn].field[g.pending.i], ac = CARD[af.id], A = statsOf(g, g.turn, af), mine = g.players[me].field, pickI = ui.defPick, order = ui.defOrder || [];
  const mv = ac.moves[g.pending.m], power = mv.power + A.bonus, dmg = f => Math.max(0, power - statsOf(g, me, f).def), pick = mine[pickI];
  const v = pick ? defView() : null, ordering = !!v?.multi, nth = NTH(order.length + 1); // the blocker is 1st
  const marks = i => { // badge + damage chip on each Character already placed in the order
    const k = ordering ? v.shown.findIndex(h => h.i === i) : -1, h = v?.shown[k];
    return k < 0 ? '' : `<span class="ord${k ? '' : ' blk'}">${k + 1}</span><span class="dmgc${h.taken ? '' : ' safe'}">−${h.taken}${h.ko ? '<em>KO</em>' : ''}</span>`;
  };
  const cls = i => (i === pickI && !ordering ? ' picked' : '') + (ordering && v.shown.some(h => h.i === i && h.ko) ? ' ko-will' : '')
    + (ordering && !v.done && i !== pickI && !order.includes(i) && mine[i].hp > 0 ? ' next-pick' : '');
  const cards = mine.map((f, i) => renderCard(finCard(g.players[me], f.id), { cls: 'mini' + finCls(g.players[me], f.id) + cls(i), hp: f.hp, ...statsOf(g, me, f),
    attrs: tappable('defpick', `data-i="${i}" data-nth="${nth}"`) }).replace(/<\/div>$/, `${marks(i)}</div>`)).join('');
  const head = ordering ? `<div class="order-head"><h2>${v.done ? 'Damage order' : 'Who takes the rest?'}</h2><button data-act="defreset">Reset</button></div>` : '<h2>Pick a blocker</h2>';
  const body = ordering ? `<div class="spill neu-in">${v.shown.map((h, k) => { const f = mine[h.i], arm = statsOf(g, me, f).def;
      return `<div><i class="${k ? '' : 'blk'}">${k ? k + 1 : ICON.def}</i><span>${esc(CARD[f.id].name)}${k ? '' : ' <small>blocks</small>'}${arm ? ` <small>· armour ${arm}</small>` : ''}</span><b class="${h.taken ? '' : 'safe'}">${h.taken ? `−${h.taken}${h.ko ? ' · KO' : ''}` : 'Blocked'}</b></div>`; }).join('')}${v.done
      ? `<div><i class="bo">${ICON.bore}</i><span>Your Boredom</span><b class="bo">+${v.bore}</b></div>`
      : `<div class="left"><i class="bo">?</i><span>${v.left} damage left over: tap who takes it ${nth}</span></div>`}</div>`
    : `<p class="muted center" style="margin:10px 0 12px">${pick ? (dmg(pick) > pick.hp ? `${CARD[pick.id].name} is defeated and ${dmg(pick) - pick.hp} damage goes to your Boredom.` : dmg(pick) === pick.hp ? `${CARD[pick.id].name} takes ${dmg(pick)} and is defeated.` : `${CARD[pick.id].name} takes ${dmg(pick)} damage after armour.`) : 'Armour (the shield) blocks that much of each hit. Damage past a blocker’s HP spills to your other Characters (you pick the order), then to your Boredom.'}</p>`;
  const go = !pick ? '<button class="btn wide" disabled>Tap a Character</button>'
    : !ordering ? btn({ type: 'defend', i: pickI }, `Block with ${CARD[pick.id].name}`, 'primary wide')
    : v.done ? btn({ type: 'defend', i: pickI, order }, 'Confirm order', 'primary wide') : `<button class="btn wide" disabled>Tap a Character for the ${nth} spot</button>`;
  return sheet(`<div class="attacker neu">${renderCard(ac, { cls: 'mini', hp: af.hp, ...A })}<div><small>Incoming attack</small><br><b>${ac.name}</b> uses <b>${mv.name}</b>: ${power} damage${mv.text ? `<br><small>${mv.text}</small>` : ''}</div></div>
    ${head}<div class="field">${cards}</div>${body}${go}`, false);
}

function render() {
  const scrolls = [...$app.querySelectorAll('.grid, .scroll, .sheet')].map(el => el.scrollTop);
  const appTop = $app.dataset.view === ui.view ? $app.scrollTop : 0; // collection / deck / add-cards scroll as a whole screen
  const focus = document.activeElement?.id;
  const views = { home: viewHome, deck: viewDeck, build: viewBuild, lobby: viewLobby, rules: viewRules, game: viewGame, packs: () => viewPacks(), open: () => (ui.open ? viewOpen() : viewPacks()), collection: () => viewCollection(), shop: () => viewShop(), profile: () => viewProfile(), submit: () => viewSubmit(), review: () => viewReview(), welcome: () => viewWelcome(), social: () => viewSocial(), player: () => viewPlayer(), showcase: () => viewShowcase(), decks: () => viewDecks(), pb: () => viewPb(), ranked: () => viewRanked() };
  if (ui.view === 'game' && !game) ui.view = 'home';
  $app.dataset.view = ui.view;
  $app.innerHTML = views[ui.view]() + (ui.toast && ui.view !== 'game' ? `<div class="toast neu">${esc(ui.toast)}</div>` : '');
  $app.querySelectorAll('.grid, .scroll, .sheet').forEach((el, i) => { el.scrollTop = scrolls[i] || 0; });
  $app.scrollTop = appTop;
  const sel = ui.view === 'game' && ui.tut != null && TUT[ui.tut]?.sel;
  if (sel) $app.querySelector(typeof sel === 'function' ? sel() : sel)?.classList.add('coach-target');
  if (focus) document.getElementById(focus)?.focus();
  // Entry animations only when an overlay first appears, not on every re-render.
  const key = [ui.view, JSON.stringify(ui.zoom), ui.sheet, game?.phase === 'defend' && game.turn !== me].join('|');
  if (key !== lastOverlay) { lastOverlay = key; $app.querySelectorAll('.dim, .sheet, .card.zoom').forEach(el => el.classList.add('enter')); }
}
let lastOverlay = '';

// ---------------- animations: `pre` plays on the old board (attacks, hits, KOs), `post` on the new one ----------------
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fxLayer = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'fx' }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const whoOf = pi => (pi === me ? 'me' : 'opp');
const fieldEl = (pi, i) => $app.querySelector(`.card[data-who="${whoOf(pi)}"][data-zone="field"][data-i="${i}"]`);
const hudEl = pi => $app.querySelector(`.side:nth-child(${pi === me ? 4 : 2}) .hud`);
let bannerQ = Promise.resolve();

function flash(el, cls, ms = 700) {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
function floatText(el, text, cls, nudge = 0, icon = '') { // icon: an ICON svg string shown before the text
  if (!el) return;
  const r = el.getBoundingClientRect(), f = document.createElement('div');
  f.className = `floater ${cls}`; f.innerHTML = `${icon}<span>${esc(text)}</span>`;
  f.style.left = `${r.left + r.width / 2}px`; f.style.top = `${r.top + r.height * 0.3 - nudge}px`;
  fxLayer.append(f); setTimeout(() => f.remove(), 1900);
}
const banner = (html, cls) => { bannerQ = bannerQ.then(async () => {
  const b = Object.assign(document.createElement('div'), { className: `banner ${cls}`, innerHTML: `<span>${html}</span>` });
  fxLayer.append(b); await sleep(950); setTimeout(() => b.remove(), 600);
}); };
// tag = [icon key, label] shown under the card, e.g. Instant vs timed Items.
function splash(id, tag) {
  const d = Object.assign(document.createElement('div'), { className: 'splash', innerHTML: renderCard(CARD[id]) + (tag ? `<div class="splash-tag">${ICON[tag[0]]}<span>${esc(tag[1])}</span></div>` : '') });
  fxLayer.append(d); setTimeout(() => d.remove(), 1400);
}
const castTag = c => (c.type === 'captain' ? ['super', `Super! ${c.name}`] : c.type === 'evil' ? ['forever', 'Evil: stays until cleansed']
  : isInstant(c) ? ['instant', 'Instant: used up'] : ['time', `Item: lasts ${c.dur} turn${c.dur > 1 ? 's' : ''}`]);
// A thin streak from one element to another (spill-over travelling to the next Character or the Boredom meter).
function streakFx(from, to) {
  if (!from || !to) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), x1 = a.left + a.width / 2, y1 = a.top + a.height / 2, x2 = b.left + b.width / 2, y2 = b.top + b.height / 2;
  const d = Object.assign(document.createElement('div'), { className: 'streak' });
  d.style.cssText = `left:${x1}px;top:${y1}px;width:${Math.hypot(x2 - x1, y2 - y1)}px;--a:${Math.atan2(y2 - y1, x2 - x1)}rad`;
  fxLayer.append(d); setTimeout(() => d.remove(), 600);
}
// A move's coin flip: a small coin spins mid-board, then shows Heads/Tails. Queued so multiple flips play in turn.
const coinToss = heads => { bannerQ = bannerQ.then(async () => {
  const d = Object.assign(document.createElement('div'), { className: `toss ${heads ? 'heads' : 'tails'}`, innerHTML: `<div class="coin">${heads ? ICON.main : ICON.point}</div><b>${heads ? 'Heads!' : 'Tails'}</b>` });
  fxLayer.append(d); await sleep(1100); setTimeout(() => d.remove(), 400);
}); };
function coinFlip(s) {
  const d = Object.assign(document.createElement('div'), { className: 'coinflip',
    innerHTML: `<div class="coin">${ICON.main}</div><b>${s.turn === me ? 'You go first!' : `${esc(s.players[s.turn].name)} goes first`}</b>` });
  fxLayer.append(d); setTimeout(() => d.remove(), 2300);
}
// A layer pinned over a board element (shield, die), sized to it so its contents can use cqw.
function overlayOn(el, html, cls) {
  const r = el.getBoundingClientRect(), o = document.createElement('div');
  o.className = `fx-on ${cls}`; o.innerHTML = html;
  Object.assign(o.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  fxLayer.append(o);
  return o;
}

// Spin a die through random faces, settling on each roll in turn (two rolls when the defender forces a reroll).
async function spin(die, rolls) {
  for (const n of rolls) {
    die.classList.add('rolling');
    for (let k = 0; k < 9; k++) { die.textContent = 1 + Math.floor(Math.random() * 20); await sleep(55); }
    die.textContent = n; die.classList.remove('rolling'); flash(die, 'land', 450);
    await sleep(rolls.length > 1 ? 380 : 120);
  }
}

// The attacker leaps at a target element and back; resolves at the moment of impact.
function jump(el, target) {
  if (!el || !target) return sleep(0);
  const a = el.getBoundingClientRect(), b = target.getBoundingClientRect();
  el.style.setProperty('--dx', `${b.left + b.width / 2 - (a.left + a.width / 2)}px`);
  el.style.setProperty('--dy', `${b.top + b.height / 2 - (a.top + a.height / 2)}px`);
  flash(el, 'jump', 620);
  return sleep(270);
}

// Thanos-snap: tiles of a clone drift off and fade, sweeping left to right.
function disintegrate(el) {
  if (!el) return;
  const r = el.getBoundingClientRect(), clone = el.cloneNode(true), cols = 6, rows = 8;
  clone.className = clone.className.replace(/\b(hurt|glow|jump|sel)\b/g, '');
  clone.style.cssText = `--cw:${r.width}px;margin:0;transform:none;translate:none;scale:none`;
  const wrap = Object.assign(document.createElement('div'), { className: 'dust' });
  Object.assign(wrap.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const t = document.createElement('div');
    t.className = 'dust-bit';
    t.style.cssText = `clip-path:inset(${(y * 100) / rows}% ${100 - ((x + 1) * 100) / cols}% ${100 - ((y + 1) * 100) / rows}% ${(x * 100) / cols}%);`
      + `--tx:${30 + Math.random() * 70}px;--ty:${-30 - Math.random() * 70}px;--rz:${Math.random() * 60 - 30}deg;--d:${((x / cols) * 0.45 + Math.random() * 0.2).toFixed(2)}s`;
    t.append(clone.cloneNode(true));
    wrap.append(t);
  }
  el.style.visibility = 'hidden';
  fxLayer.append(wrap);
  setTimeout(() => wrap.remove(), 1900);
}

async function attackAnim(e, ev) {
  const atkEl = fieldEl(e.p, e.i);
  if (!atkEl) return;
  if (e.direct) { // nobody to block: the hit goes straight to their Boredom
    floatText(atkEl, `${e.move} ${e.power}`, 'atk', 0, ICON.atk);
    await jump(atkEl, hudEl(1 - e.p)); flash(hudEl(1 - e.p), 'hit', 450); await sleep(300); return;
  }
  const defEl = fieldEl(e.target.p, e.target.i), r = e.roll, hits = r.hits || [], absorbed = Math.min(r.atk, r.def), tp = e.target.p;
  if (!defEl) return;
  // The sequence: shield shows the blocker's armour, attacker lunges, impact on the blocker, then spill streaks onward (all within ~1.2s).
  const shield = overlayOn(defEl, `<div class="shield">${ICON.def}<b>${r.def}</b></div>`, 'shield-on');
  await sleep(240);
  floatText(atkEl, `${e.move} ${r.atk}`, 'atk', 0, ICON.atk);
  await jump(atkEl, defEl);
  if (r.hit) { shield.classList.add('shatter'); flash(defEl, 'hurt', 600); floatText(defEl, `−${hits[0]?.taken ?? r.dmg}`, 'dmg', absorbed ? 30 : 0, ICON.hp); }
  else { shield.classList.add('block'); flash(defEl, 'bump', 500); floatText(defEl, 'Blocked!', 'blocked', 30, ICON.block); if (typeof sfx === 'function') sfx('colorlessAttackSmall'); }
  if (absorbed) floatText(defEl, `${absorbed} blocked`, 'blocked', 0, ICON.def);
  setTimeout(() => shield.remove(), 450);
  let t = 0, from = defEl;
  const at = (fn) => { t += 140; setTimeout(fn, t); };
  for (const h of hits.slice(1)) { // overkill: a streak to the next Character, then its own hit or block
    const el = fieldEl(tp, h.i), src = from; if (el) from = el;
    at(() => { streakFx(src, el); setTimeout(() => {
      if (h.taken) { flash(el, 'hurt', 600); floatText(el, `−${h.taken}`, 'dmg', 0, ICON.hp); } else { flash(el, 'bump', 500); floatText(el, 'Blocked!', 'blocked', 0, ICON.block); }
    }, 130); });
  }
  if (r.bore) at(() => { // spill past the whole field: a streak to the Boredom meter, which pulses
    streakFx(from, hudEl(tp)); flash(hudEl(tp)?.querySelector('.meter.bore'), 'bump', 600);
    if (typeof sfx === 'function') sfx('damageToken');
  });
  const extra = new Map(); // extra damage from the card's own effect (e.g. "2 more damage to the blocker")
  ev.filter(x => x.k === 'hit' && x.extra).forEach(x => extra.set(`${x.p}:${x.i}`, [x, (extra.get(`${x.p}:${x.i}`)?.[1] || 0) + 1]));
  for (const [x, n] of extra.values()) at(() => { const el = fieldEl(x.p, x.i); flash(el, 'hurt', 600); floatText(el, `−${n}`, 'dmg', 0, ICON.hp); });
  await sleep(Math.min(800, Math.max(380, t + 240)));
  ev.filter(x => x.k === 'hit' && x.ko).forEach(k => disintegrate(fieldEl(k.p, k.i))); // the dust plays on while the new board shows
}

async function preAnimate(ev) {
  $app.querySelectorAll('.dim, .sheet, .toast.wait').forEach(el => el.remove()); // e.g. the defend picker
  const atk = ev.find(e => e.k === 'attack');
  if (atk) return attackAnim(atk, ev);
  const hits = ev.filter(e => e.k === 'hit'); // manual HP changes
  for (const e of hits) {
    const el = fieldEl(e.p, e.i);
    if (e.ko) disintegrate(el); else { flash(el, 'hurt', 600); floatText(el, '−1', 'dmg', 0, ICON.hp); }
  }
  await sleep(450);
}

// Full-screen Super cut-in (either side): the screen dims, a band with the Captain's art slashes across with the Super's name, then fades.
// Purely visual (state has already moved on); tap anywhere skips. Reduced motion: a short plain fade with the name. Resolves when it's gone.
function superCutIn(e, s) {
  const c = CARD[e.id], info = superInfo(c), mine = e.p === me, d = document.createElement('div');
  d.className = `cutin ${mine ? 'mine' : 'theirs'}${calm ? ' calm' : ''}`;
  d.setAttribute('role', 'status');
  d.innerHTML = `<div class="cutin-band"><div class="cutin-art">${ICON.captain}${c.art ? `<img ${assetSrc(c.art)} alt="" onerror="this.remove()">` : ''}</div>
    <div class="cutin-text"><small>${ICON.super}${mine ? '' : `${esc(s.players[e.p].name)}: `}${esc(c.name)}'s Super</small><b style="--n:${Math.max(6, ...info.name.split(/\s+/).map(w => w.length))}">${esc(info.name)}</b></div></div>`; // --n: longest word, so it fits without breaking
  return new Promise(res => {
    let done = false;
    const end = () => { if (done) return; done = true; d.classList.add('out'); setTimeout(() => d.remove(), 220); res(); };
    d.addEventListener('pointerdown', ev => { ev.preventDefault(); end(); });
    fxLayer.append(d);
    if (typeof sfx === 'function') sfx('packopen_11_rarereveal');
    setTimeout(end, calm ? 900 : 1100);
  });
}
const superCast = ev => ev.find(e => e.k === 'cast' && CARD[e.id]?.type === 'captain');

// ---------------- draws and cause -> effect ----------------
const fxCtr = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
// Cards entering your hand fly out of the deck counter face down, flip edge-on and land face up (staggered); the opponent's hop into their row face down.
function flyDraw(cards, mine) {
  const deckEl = $app.querySelector('.mid .deckn'), [x0, y0] = deckEl ? fxCtr(deckEl) : [0, 0];
  cards.forEach((c, j) => {
    c.classList.remove('pend'); c.style.setProperty('--dd', `${j * 0.18}s`);
    if (calm) return c.classList.add(mine ? 'dfade' : 'odraw');
    if (!mine || !deckEl) return c.classList.add(mine ? 'dfade' : 'odraw');
    const [x1, y1] = fxCtr(c);
    c.style.setProperty('--dx', `${x0 - x1}px`); c.style.setProperty('--dy', `${y0 - y1}px`);
    c.insertAdjacentHTML('beforeend', renderCard(null, { cls: 'cb' }));
    c.classList.add('drawing');
    setTimeout(() => { c.classList.remove('drawing'); c.querySelector(':scope > .cb')?.remove(); }, (j * 0.18 + 0.95) * 1000 + 40);
  });
}
// Effect events carry src (the card) and when (the trigger) from the engine; they group into steps: one per card, trigger and kind of change.
function causeSteps(ev) {
  const out = [];
  for (const e of ev) {
    if (!e.src || !['meter', 'draw', 'actions', 'purge'].includes(e.k)) continue;
    const kind = e.k === 'meter' ? e.key : e.k === 'actions' ? 'act' : e.k, key = JSON.stringify([e.src, e.when, kind, e.p]), last = out[out.length - 1];
    if (last?.key === key && kind !== 'purge') { last.n += e.k === 'draw' ? 1 : e.n; continue; }
    out.push({ key, kind, src: e.src, when: e.when, p: e.p, n: e.k === 'draw' ? 1 : e.n || 0, id: e.id });
  }
  return out;
}
const CAUSE_ICON = { goof: 'goof', bore: 'bore', act: 'action', draw: 'cards', purge: 'evil' };
function causeWhen(st, s) { // the trigger in words, from the viewer's side
  const start = pi => (pi === me ? 'Start of your turn' : `Start of ${s.players[pi].name}'s turn`);
  return { play: 'When played', hit: 'On hit', turn: start(st.src.p), oppTurn: start(1 - st.src.p), move: CARD[st.src.id]?.moves?.[st.src.m]?.name || 'Ability', attack: 'When attacking', defend: 'When blocking' }[st.when] || 'Effect';
}
const causeText = st => { const n = Math.abs(st.n), sg = st.n < 0 ? '−' : '+';
  return st.kind === 'draw' ? `+${n} card${n === 1 ? '' : 's'}` : st.kind === 'act' ? `${sg}${n} Action${n === 1 ? '' : 's'}` : st.kind === 'purge' ? `${CARD[st.id]?.name || 'Evil'} removed` : `${sg}${n} ${METERS[st.kind]}`; };
const sideSel = pi => `.side:nth-child(${pi === me ? 4 : 2})`;
// The card that caused it, on screen; if it isn't (phone Effects behind their button, an Instant, a Character defeated meanwhile), a small copy pops up.
function causeSrc(st) {
  const { src } = st, who = whoOf(src.p), q = sel => $app.querySelector(sel);
  let el = st.when === 'play' ? fxLayer.querySelector(`.splash .card[data-id="${src.id}"]`) : null; // a card just played is still big in the middle
  if (!el && src.zone === 'field') { el = fieldEl(src.p, src.i); if (el?.dataset.id !== src.id) el = q(`.card[data-who="${who}"][data-zone="field"][data-id="${src.id}"]`); }
  if (!el && src.zone === 'effects') { el = q(`.fxc[data-who="${who}"][data-i="${src.i}"]`); if (el?.dataset.id !== src.id) el = q(`.fxc[data-who="${who}"][data-id="${src.id}"]`); }
  if (!el && src.zone === 'cap') el = hudEl(src.p)?.querySelector('.cap');
  if (el?.offsetWidth) return el;
  const btn = q(`${sideSel(src.p)} .fx-open`), ref = (src.zone === 'effects' && btn?.offsetWidth ? btn : null) || q(`${sideSel(src.p)} .field`);
  if (!ref || !CARD[src.id]) return null;
  const r = ref.getBoundingClientRect(), d = document.createElement('div');
  d.className = 'fx-peek'; d.innerHTML = renderCard(CARD[src.id], { cls: 'mini' });
  d.style.left = `${Math.max(56, Math.min(innerWidth - 56, r.left + r.width / 2))}px`;
  d.style.top = `${Math.max(70, Math.min(innerHeight - 70, ref === btn ? r.top - 70 : r.top + r.height / 2))}px`;
  fxLayer.append(d); setTimeout(() => d.remove(), 1350);
  return d.querySelector('.card');
}
const causeTarget = st => (st.kind === 'goof' || st.kind === 'bore' ? hudEl(st.p)?.querySelector(`.meter.${st.kind}`) : st.kind === 'act' ? $app.querySelector('.mid .pips')
  : st.kind === 'draw' ? $app.querySelector(st.p === me ? '.mid .deckn' : '.opp-hand') : $app.querySelector(`${sideSel(st.p)} .effects`));
// A meter's number and bar, set by hand while effects are still flying to it (the state already holds the final value).
function setMeter(pi, key, v) {
  const m = hudEl(pi)?.querySelector(`.meter.${key}`); if (!m) return null;
  const max = key === 'goof' ? CARD[game.players[pi].captain].goof || 10 : BORE_MAX;
  m.querySelector('b').textContent = `${v}/${max}`; m.querySelector('.mbar > i').style.width = `${Math.min(100, (100 * v) / max)}%`;
  if (key === 'bore') m.classList.toggle('warn', v >= max - 3);
  return m;
}
// One step: the card pulses gold with a tag (trigger + effect), then an orb that is just the meter's icon flies to what changed, which then updates.
async function causeStep(st, s, fx) {
  const card = causeSrc(st), icon = ICON[CAUSE_ICON[st.kind]], to = causeTarget(st);
  if (card) {
    flash(card, 'cause', 1150);
    const r = card.getBoundingClientRect(), tag = document.createElement('div');
    tag.className = `cause-tag ${st.kind}`; tag.innerHTML = `<small>${esc(causeWhen(st, s))}</small><b>${icon}${esc(causeText(st))}</b>`;
    tag.style.left = `${Math.max(90, Math.min(innerWidth - 90, r.left + r.width / 2))}px`; tag.style.top = `${Math.max(30, Math.min(innerHeight - 34, card.closest('.splash') ? r.top - 22 : r.bottom - 4))}px`; // above a splash, clear of its own label
    setTimeout(() => fxLayer.append(tag), 50); setTimeout(() => tag.remove(), 1400);
  }
  if (calm) { await sleep(500); fx.land(st); await sleep(700); return; } // reduced motion: the glow and tag fade, no flight
  await sleep(450);
  if (card && to) {
    const [cx, cy] = fxCtr(card), [mx, my] = fxCtr(to);
    [0, 50, 100, 150].forEach((lag, k) => setTimeout(() => { // the orb and a short fading trail
      const o = document.createElement('div');
      o.className = `orb ${st.kind}${k ? ' ghost' : ''}`; o.innerHTML = icon;
      Object.assign(o.style, { left: `${cx}px`, top: `${cy}px` }); o.style.setProperty('--dx', `${mx - cx}px`); o.style.setProperty('--dy', `${my - cy}px`);
      if (k) { o.style.setProperty('--s', 1 - k * 0.2); o.style.setProperty('--o', 0.55 - k * 0.14); }
      fxLayer.prepend(o); setTimeout(() => o.remove(), 520);
    }, lag));
    await sleep(500);
  }
  fx.land(st);
  await sleep(250);
}
// What arriving does: the meter ticks to its new number, the Action pips bump, the drawn cards fly out of the deck, the Evil goes.
function causeLander(ev) {
  const shown = new Map(), mk = (p, key) => `${p}:${key}`;
  for (const e of ev) if (e.k === 'meter' && e.src) shown.set(mk(e.p, e.key), (shown.get(mk(e.p, e.key)) ?? game.players[e.p][e.key]) - e.n);
  if (!calm) for (const [k, v] of shown) { const [p, key] = k.split(':'); setMeter(+p, key, v); } // rewind: effects still to come
  const drawn = pi => { const n = ev.filter(e => e.k === 'draw' && e.p === pi).length, els = [...$app.querySelectorAll(pi === me ? '.board > .hand > .card' : '.opp-hand > .card')];
    return n ? els.slice(-n).map((el, j) => ({ el, tagged: !!ev.filter(e => e.k === 'draw' && e.p === pi)[j].src })) : []; };
  const pend = [me, 1 - me].map(pi => { const d = drawn(pi); d.forEach(x => x.tagged && x.el.classList.add('pend')); return { pi, now: d.filter(x => !x.tagged).map(x => x.el), later: d.filter(x => x.tagged).map(x => x.el) }; });
  return {
    pend,
    land(st) {
      if (st.kind === 'goof' || st.kind === 'bore') {
        const k = mk(st.p, st.kind), v = (shown.get(k) ?? game.players[st.p][st.kind] - st.n) + st.n; shown.set(k, v);
        const m = calm ? hudEl(st.p)?.querySelector(`.meter.${st.kind}`) : setMeter(st.p, st.kind, v);
        flash(m?.querySelector('b'), 'tick', 520); flash(m, 'hl', 1400);
      }
      if (st.kind === 'act') flash($app.querySelector('.mid .pips'), 'bump', 600);
      if (st.kind === 'draw') { const P = pend.find(x => x.pi === st.p); flyDraw(P.later.splice(0, st.n), st.p === me); }
      if (st.kind === 'purge') floatText($app.querySelector(sideSel(st.p)), causeText(st), 'blocked', 0, ICON.forever);
    },
  };
}

async function postAnimate(ev, prev, s) {
  const fx = causeLander(ev), steps = causeSteps(ev); // set the board back to before the card effects, before anything shows
  const sup = superCast(ev);
  if (sup) await superCutIn(sup, s); // the effect lands on the meters once the cut-in is gone
  const nudges = new Map(), stack = el => { const n = nudges.get(el) || 0; nudges.set(el, n + 24); return n; }; // labels on one element stack upwards
  const pips = $app.querySelector('.mid .pips');
  for (const P of fx.pend) if (P.now.length) { // plain draws (start of turn, the Draw button): straight away, then one "+N cards" label
    flyDraw(P.now, P.pi === me);
    const n = P.now.length, el = P.pi === me ? $app.querySelector('.hand') : hudEl(P.pi)?.querySelector('.meters');
    setTimeout(() => floatText(el, `+${n} card${n > 1 ? 's' : ''}`, 'draw', 0, ICON.draw), P.pi === me && !calm ? (0.8 + (n - 1) * 0.18) * 1000 : 0);
  }
  for (const e of ev) {
    if (e.k === 'play') {
      flash(e.zone === 'field' ? fieldEl(e.p, e.i) : $app.querySelector(`.fxc[data-who="${whoOf(e.p)}"][data-i="${e.i}"]`), e.zone === 'field' ? 'slam' : 'pop', 700);
      if (e.zone === 'field' && e.p !== me && e.id) splash(e.id, ['character', 'Enters the field']); // show the opponent's played Character
    }
    if (e.k === 'cast') {
      const c = CARD[e.id];
      if (c.type !== 'captain') splash(e.id, castTag(c)); // a Captain's Super had its cut-in instead
      else {
        const cap = hudEl(e.p)?.querySelector('.cap'), target = ev.some(x => x.k === 'meter' && x.p !== e.p) ? 1 - e.p : e.p; // shake whoever it hit
        flash(cap, 'pop', 700); floatText(cap, 'Super!', 'super', 0, ICON.super); flash(hudEl(target), 'hit', 450);
        if (typeof sfx === 'function') sfx('versus_rewards_2_barfillsparkle');
      }
    }
    if (e.k === 'coin') coinToss(e.heads);
    if (e.k === 'declare') floatText(fieldEl(e.p, e.i), `${e.move} ${e.power}`, 'atk', 0, ICON.atk);
    if (e.k === 'move' && e.i != null) floatText(fieldEl(e.p, e.i), e.name, 'atk', 0, ICON.atk);
    if (e.src && ['meter', 'actions', 'purge'].includes(e.k)) continue; // a card effect: its cause -> effect step below shows it
    if (e.k === 'purge') floatText($app.querySelector(`.side:nth-child(${e.p === me ? 4 : 2})`), `${CARD[e.id].name} removed`, 'blocked', 0, ICON.forever);
    if (e.k === 'actions') { flash(pips, 'bump', 600); floatText(pips, `${e.n > 0 ? '+' : '−'}${Math.abs(e.n)} Action${Math.abs(e.n) > 1 ? 's' : ''}`, 'act', stack(pips), ICON.action); }
    if (e.k === 'meter') {
      const h = hudEl(e.p);
      flash(h?.querySelector(`.meter.${e.key}`), 'bump', 600); flash(h?.querySelector(`.meter.${e.key}`), 'hl', 1400);
      floatText(h?.querySelector('.meters'), `${e.n > 0 ? '+' : '−'}${Math.abs(e.n)} ${e.key === 'goof' ? 'Creativity' : 'Boredom'}`, e.key, stack(h), ICON[e.key]);
    }
    if (e.k === 'fatigue') { const h = hudEl(e.p); floatText(h?.querySelector('.meters'), 'Deck empty!', 'bore', stack(h), ICON.draw); }
    if (e.k === 'turn') {
      const gain = ev.find(x => x.k === 'meter' && x.p === e.p && x.key === 'goof' && x.n > 0 && !x.src)?.n || 0, drew = ev.some(x => x.k === 'draw' && x.p === e.p && !x.src); // the turn's own, not card effects
      flash(pips, 'bump', 600);
      banner(`${e.p === me ? 'Your turn' : `${esc(s.players[e.p].name)}'s turn`}<small>${e.actions} ${ICON.action}Action${e.actions === 1 ? '' : 's'}${gain ? ` · +${gain} ${ICON.goof}Creativity` : ''}${drew ? ` · ${ICON.draw}+1 card` : ''}</small>`, 'turn');
    }
  }
  if (s.phase === 'over' && prev.phase !== 'over') flash($app.querySelector('.big'), 'enter', 1000);
  if (!steps.length || ui.view !== 'game' || s.phase === 'over') return;
  // card effects play one after another, once a just-played card has landed and the turn banner / coin flip has had its moment
  await Promise.race([bannerQ, sleep(1200)]);
  if (ev.some(e => e.k === 'play' || e.k === 'cast')) await sleep(350);
  for (const st of steps) { if (game !== s) break; await causeStep(st, s, fx); }
}

// Inspecting a card tilts it toward the pointer with a moving shine.
let tiltBusy = false; // one tilt update per frame, not per pointer event
document.addEventListener('pointermove', e => {
  const c = e.target.closest?.('.card.zoom, .fan .card, .coll-cell .card, .pile > .card:not(.behind)');
  if (!c || calm || tiltBusy) return;
  tiltBusy = true; requestAnimationFrame(() => { tiltBusy = false; });
  c.classList.add('held');
  const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  for (const [k, v] of [['--rx', `${((0.5 - y) * 18).toFixed(1)}deg`], ['--ry', `${((x - 0.5) * 22).toFixed(1)}deg`], ['--mx', `${(x * 100).toFixed(0)}%`], ['--my', `${(y * 100).toFixed(0)}%`], ['--fx', x.toFixed(3)], ['--fy', y.toFixed(3)], ['--fc', Math.min(1, Math.hypot(x - 0.5, y - 0.5) * 2).toFixed(3)], ['--co', 1]]) c.style.setProperty(k, v);
});
document.addEventListener('pointerout', e => {
  const c = e.target.closest?.('.card.zoom, .fan .card, .coll-cell .card, .pile > .card:not(.behind)');
  if (c && !c.contains(e.relatedTarget)) { c.classList.remove('held'); for (const k of ['--rx', '--ry', '--mx', '--my', '--fx', '--fy', '--fc', '--co']) c.style.removeProperty(k); }
});

// ---------------- networking ----------------
const peerId = code => 'tismtopia-tcg-' + code;

function needPeer() {
  if (typeof Peer === 'undefined') { toast("Couldn't load the networking library. Check your connection."); return false; }
  if (deckProblems(deck()).length) { toast('Fix your deck first.'); return false; }
  return true;
}

function host() {
  if (!needPeer()) return;
  leave(true); isHost = true; me = 0;
  const code = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  ui.status = 'Connecting…';
  peer = new Peer(peerId(code));
  peer.on('open', () => { ui.code = code; ui.status = 'Waiting for a friend to join'; render(); });
  peer.on('connection', c => (conn ? c.close() : wire(c)));
  peer.on('error', peerError);
}

function join() {
  const code = ui.joinCode.trim().toUpperCase();
  if (code.length !== 6) return toast('Room codes are 6 characters.');
  if (!needPeer()) return;
  leave(true); isHost = false; me = 1;
  ui.status = 'Connecting…';
  peer = new Peer();
  peer.on('open', () => wire(peer.connect(peerId(code), { reliable: true })));
  peer.on('error', peerError);
}

function peerError(err) {
  const msg = { 'peer-unavailable': 'No battle with that code.', 'unavailable-id': 'That room code is taken, try again.', network: "Can't reach the matchmaking server.",
    'server-error': "Can't reach the matchmaking server.", 'browser-incompatible': "This browser can't do peer-to-peer." }[err.type] || `Connection error (${err.type}).`;
  ui.code = ''; ui.status = msg; toast(msg);
}

function wire(c) {
  conn = c;
  c.on('open', () => {
    if (!isHost) c.send({ t: 'hello', name: myName, pfp: myPfp(), deck: { captain: deck().captain, cards: deck().cards, finishes: finishesFor(deck()) }, ...(typeof rkHello === 'function' ? rkHello() : {}) }); // rkHello: ranked flag + rating (js/ranked.js)
    ui.status = 'Connected, dealing…'; render();
  });
  c.on('data', onMsg);
  c.on('close', () => {
    if (conn !== c) return;
    conn = null;
    if (state && state.phase !== 'over') { const rkMsg = typeof rkForfeit === 'function' ? rkForfeit(true) : ''; state = game = null; ui.view = 'home'; peer?.destroy(); peer = null; ui.code = ''; toast('Your opponent left the battle.' + rkMsg); }
    else if (!state && isHost && ui.code) { ui.status = 'Waiting for a friend to join'; render(); }
    else render();
  });
}

function onMsg(m) {
  if (!m || typeof m !== 'object') return;
  if (isHost) {
    if (m.t === 'hello' && !state) {
      const probs = deckProblems(m.deck);
      if (probs.length) { conn.send({ t: 'error', msg: `Your deck isn't legal: ${probs[0]}` }); return; }
      if (typeof rkCheckHello === 'function' && !rkCheckHello(m)) return; // ranked and casual never mix (js/ranked.js)
      guest = { name: String(m.name || 'Guest').slice(0, 20), pfp: pfpOk(m.pfp) && CARD[m.pfp] ? m.pfp : m.deck.captain, deck: { captain: m.deck.captain, cards: m.deck.cards, finishes: cleanFin(m.deck.finishes) } };
      startGame();
    } else if (m.t === 'act' && state && m.a && typeof m.a === 'object') act(1, m.a);
    else if (m.t === 'rematch' && state?.phase === 'over') startGame();
  } else if (m.t === 'state' && m.s) setGame(m.s);
  else if (m.t === 'error') toast(String(m.msg));
}

function startGame() {
  const d = deck();
  const g = newGame([{ captain: d.captain, cards: d.cards, finishes: finishesFor(d) }, guest.deck], [myName, guest.name]);
  g.players[0].pfp = myPfp(); g.players[1].pfp = guest.pfp; // profile pictures travel with the state, so the guest sees both
  if (typeof rkGame === 'function') rkGame(g); // a ranked match: both ratings ride along (js/ranked.js)
  setGame(g);
  conn?.send({ t: 'state', s: state });
}

// New states apply to `state` at once; the screen catches up in order, animating each step.
let showQ = Promise.resolve();
function setGame(s) {
  const prev = state, fresh = !prev || s.seq < prev.seq;
  state = s;
  showQ = showQ.then(() => present(fresh ? null : prev, s)).catch(console.error);
}

async function present(prev, s) {
  const ev = prev && s.seq > prev.seq ? s.events || [] : [];
  if (!prev) ui.zoom = ui.sheet = null; // a fresh deal
  if (!calm && ui.view === 'game' && game && ev.some(e => e.k === 'attack' || e.k === 'hit')) await preAnimate(ev);
  game = s; ui.view = 'game'; ui.code = ''; ui.status = ''; ui.defPick = null; ui.defOrder = []; ui.atk = null;
  toast(s.log[s.log.length - 1]);
  if (calm) { // reduced motion: the plain Super name fade, drawn cards fade in, card effects show their glow and tag without flights
    if (!prev) return;
    const fx = causeLander(ev);
    if (superCast(ev)) await superCutIn(superCast(ev), s);
    for (const P of fx.pend) flyDraw(P.now, P.pi === me);
    for (const st of causeSteps(ev)) await causeStep(st, s, fx);
    return;
  }
  if (!prev) coinFlip(s); else await postAnimate(ev, prev, s);
}

function act(p, a) { // host (or bot game) only; returns whether the action was legal
  try { setGame(apply(state, p, a)); conn?.send({ t: 'state', s: state }); }
  catch (e) { if (p === me) toast(e.message); else conn?.send({ t: 'error', msg: e.message }); return false; }
  if (bot) botSoon(p === 1 && a.type === 'play' ? 1600 : 1100); // longer after a played card so its splash is readable
  return true;
}

const doAction = a => (isHost ? act(0, a) : conn?.send({ t: 'act', a }));

function leave(quiet) {
  const c = conn; conn = null; c?.close(); peer?.destroy(); clearTimeout(botTimer);
  peer = null; state = game = null; bot = false; ui.tut = null; ui.code = ''; ui.status = ''; ui.zoom = ui.sheet = null;
  if (!quiet) ui.view = 'home';
}

// ---------------- input ----------------
const ACTS = {
  go(d) { ui.view = d.to; ui.zoom = ui.sheet = null; if (d.host) host(); },
  'rename-me'() { const n = prompt('Your name', myName)?.trim(); if (n) { myName = n.slice(0, 20); store.set('name', myName); } },
  filter(d) { ui.filter = d.f; },
  filters() { ui.fopen = !ui.fopen; },
  zoom(d) { ui.zoom = { id: d.id }; },
  card(d) {
    if (d.zone === 'cap' && d.who === 'me' && game && superReady()) { ui.sheet = 'super'; ui.zoom = null; return; } // ready: straight to the Super popup
    ui.zoom = { who: d.who, zone: d.zone, i: Number(d.i) }; ui.sheet = null;
  },
  super() { ui.sheet = 'super'; ui.zoom = null; },
  sheet(d) { ui.sheet = d.s; ui.zoom = null; },
  close() { ui.zoom = ui.sheet = ui.atk = null; },
  aim(d) { ui.atk = { i: Number(d.i), m: Number(d.m) }; ui.defPick = null; ui.defOrder = []; ui.zoom = null; },
  step(d) {
    const dk = deck(), c = CARD[d.id], n = (dk.cards[d.id] || 0) + Number(d.d);
    if (n > (c.main ? 1 : MAX_COPIES)) return toast(c.main ? 'Main Characters are 1 per deck.' : `Max ${MAX_COPIES} copies.`);
    if (Number(d.d) > 0 && n > own(d.id)) return toast(own(d.id) ? `You own ${own(d.id)}. Open packs for more.` : 'You don\'t own this card yet. Open packs to get it.');
    if (Number(d.d) > 0 && count(dk) >= DECK_SIZE) return toast(`Decks are ${DECK_SIZE} cards.`);
    if (n <= 0) delete dk.cards[d.id]; else dk.cards[d.id] = n;
    saveDecks();
  },
  captain(d) { deck().captain = d.id; saveDecks(); ui.sheet = null; },
  'rename-deck'() { const n = prompt('Deck name', deck().name)?.trim(); if (n) { deck().name = n.slice(0, 30); saveDecks(); } },
  'delete-deck'() {
    if (decks.length === 1) return toast('Keep at least one deck.');
    if (!confirm(`Delete "${deck().name}"? This can't be undone.`)) return;
    decks = decks.filter(d => d !== deck()); ui.deckId = decks[0].id; saveDecks(); store.set('deck', ui.deckId);
  },
  'copy-deck'() { const d = deck(); copy(btoa(encodeURIComponent(JSON.stringify({ name: d.name, captain: d.captain, cards: d.cards }))), 'Deck code'); },
  'import-deck'() {
    const code = prompt('Paste a deck code')?.trim();
    if (!code) return;
    try {
      const raw = JSON.parse(decodeURIComponent(atob(code))), cards = {};
      for (const [id, n] of Object.entries(raw.cards || {})) {
        const c = CARD[id];
        if (c && c.type !== 'captain' && Number.isInteger(n) && n > 0) cards[id] = Math.min(n, c.main ? 1 : MAX_COPIES);
      }
      const d = { id: uid(), name: String(raw.name || 'Imported').slice(0, 30), captain: CARD[raw.captain]?.type === 'captain' ? raw.captain : null, cards };
      decks.push(d); ui.deckId = d.id; saveDecks(); store.set('deck', d.id); toast(`Imported "${d.name}".`);
    } catch { toast("That code didn't work."); }
  },
  host() { host(); },
  join() { join(); },
  cancel() { leave(true); },
  'copy-link'() { copy(`${location.origin}${location.pathname}?join=${ui.code}`, 'Invite link'); },
  do(d) {
    const a = JSON.parse(d.a);
    if (!['hp', 'turns', 'adjust', 'draw'].includes(a.type)) ui.zoom = ui.sheet = null;
    doAction(a);
  },
  end() { ui.zoom = ui.sheet = null; doAction({ type: 'end' }); },
  defpick(d) { // first tap: the blocker; if damage would spill, the next taps put the other Characters in order (tap a placed one to take it and those after it back)
    const i = Number(d.i), v = defView();
    if (i === ui.defPick) { ui.defPick = null; ui.defOrder = []; return; }
    const k = ui.defOrder.indexOf(i);
    if (k >= 0) ui.defOrder = ui.defOrder.slice(0, k);
    else if (!v?.multi) { ui.defPick = i; ui.defOrder = []; }
    else if (!v.done && game.players[me].field[i]?.hp > 0) ui.defOrder = [...ui.defOrder, i];
  },
  defreset() { if (ui.defOrder.length) ui.defOrder = []; else ui.defPick = null; },
  rematch() { if (bot) startBot(false); else if (isHost) startGame(); else conn?.send({ t: 'rematch' }); },
  leave() { leave(); },
  'leave-battle'() { if (confirm('Leave this battle?')) leave(); },
  bot() { startBot(false); },
  tutorial() { startBot(true); },
  'tut-next'() { ui.tut = TUT[ui.tut].next === true ? ui.tut + 1 : null; },
  'tut-skip'() { ui.tut = null; },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled || !$app.contains(el)) return;
  if (ACTS[el.dataset.act]?.(el.dataset) !== false) render(); // an action returns false when it animates and renders itself
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-act]:not(button)')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Enter' && e.target.id === 'join-code') join();
  if (e.key === 'Escape' && (ui.zoom || ['captain', 'adjust', 'super'].includes(ui.sheet))) { ui.zoom = ui.sheet = null; render(); }
});
document.addEventListener('input', e => { if (e.target.id === 'join-code') { e.target.value = e.target.value.toUpperCase(); ui.joinCode = e.target.value; } });
document.addEventListener('change', e => {
  if (e.target.dataset.change !== 'pick-deck') return;
  if (e.target.value === 'new') {
    const name = prompt('Name your new deck', 'New Deck')?.trim();
    if (name) { const d = { id: uid(), name: name.slice(0, 30), captain: null, cards: {} }; decks.push(d); ui.deckId = d.id; saveDecks(); }
  } else ui.deckId = e.target.value;
  store.set('deck', ui.deckId); render();
});

const invite = new URLSearchParams(location.search).get('join');
if (invite) { ui.joinCode = invite.toUpperCase().slice(0, 6); ui.view = 'lobby'; history.replaceState(null, '', location.pathname); }
render();
