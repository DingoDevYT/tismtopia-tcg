// App shell: screens, saved decks and PeerJS networking.
// The host is player 0 and runs the rules engine; the guest (player 1) sends actions and gets the full state back.
// shortcut: the guest receives the whole state (including the host's hand), fine between friends; hide it if strangers ever play.
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('tismtopia.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tismtopia.' + k, JSON.stringify(v)); } catch { /* private mode: decks last this visit only */ } },
};
const uid = () => Math.random().toString(36).slice(2, 10);
let decks = store.get('decks', null);
// Old saves can hold placeholder cards that no longer exist: drop those, then add back any missing free starter.
decks = (Array.isArray(decks) ? decks : []).map(d => ({ ...d, captain: CARD[d.captain]?.type === 'captain' ? d.captain : CAPTAINS[0].id,
  cards: Object.fromEntries(Object.entries(d.cards || {}).filter(([id]) => CARD[id] && CARD[id].type !== 'captain')) })).filter(d => Object.keys(d.cards).length);
decks.unshift(...STARTERS.filter(s => !decks.some(d => d.name === s.name)).map(s => ({ id: uid(), ...structuredClone(s) })));
let myName = store.get('name', 'Player');
const ui = { view: 'home', deckId: store.get('deck', decks[0].id), filter: 'all', zoom: null, sheet: null, defPick: null, toast: '', code: '', status: '', joinCode: '', tut: null };
// `state` is the authoritative game (rules run on it); `game` is what's on screen, which trails it while animations play.
let peer = null, conn = null, isHost = false, me = 0, state = null, game = null, guest = null, toastTimer, bot = false, botTimer;

const $app = document.getElementById('app');
const deck = () => decks.find(d => d.id === ui.deckId) || decks[0];
const saveDecks = () => store.set('decks', decks);
const count = d => Object.values(d.cards).reduce((a, b) => a + b, 0);
const json = a => esc(JSON.stringify(a));
const cost = n => `<span class="cost">${n}${ICON.action}</span>`;
const btn = (a, label, cls = '') => `<button class="btn ${cls}" data-act="do" data-a="${json(a)}">${label}</button>`;
const stepper = (label, minus, plus) => `<div class="stepper neu"><button data-act="do" data-a="${json(minus)}" aria-label="Less">−</button><span>${label}</span><button data-act="do" data-a="${json(plus)}" aria-label="More">+</button></div>`;
const sheet = (html, closable = true) => `<div class="dim"${closable ? ' data-act="close"' : ''}></div><div class="sheet"><div class="grab"></div>${html}</div>`;
const header = t => `<h1 class="title">${t}</h1><div class="rainbow"></div>`;
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
const tabbar = on => `<nav class="tabbar">${[['home', 'home'], ['cards', 'deck'], ['battle', 'lobby'], ['rules', 'rules']].map(([icon, view]) =>
  `<button class="${view === on ? 'on' : ''}" data-act="go" data-to="${view}" aria-label="${view}">${ICON[icon]}</button>`).join('')}</nav>`;

const deckSelect = withNew => `<label class="deckname neu-in"><select data-change="pick-deck" aria-label="Deck">${decks.map(d =>
  `<option value="${d.id}"${d.id === deck().id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}${withNew ? '<option value="new">+ New deck</option>' : ''}</select>${ICON.chevron}</label>`;

// Home showcase: three Characters with art in rare finishes (holo, full-art holo, reverse holo).
const heroCards = () => {
  const withArt = CARDS.filter(c => c.type === 'character' && c.art);
  const pick = withArt.length >= 3 ? withArt : CARDS.filter(c => c.type === 'character');
  return [[pick[1], 'v-holo'], [pick[0], 'v-full v-holo'], [pick[2], 'v-rev']].filter(([c]) => c);
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
    <button class="tile neu" data-act="go" data-to="deck">${ICON.cards}<b>Deck Builder</b><small>${decks.length} deck${decks.length > 1 ? 's' : ''}</small></button>
    <button class="tile neu" data-act="go" data-to="rules">${ICON.rules}<b>How to Play</b><small>Rules</small></button>
  </div>${tabbar('home')}`;
}

function viewDeck() {
  const d = deck(), cap = CARD[d.captain], probs = deckProblems(d);
  return `${header(esc(d.name))}
  <div class="panel neu" style="padding:10px 12px"><div class="row2">${deckSelect(true)}
    <button class="btn sm" style="flex:none" data-act="rename-deck">Rename</button><button class="btn sm" style="flex:none" data-act="delete-deck">Delete</button></div></div>
  <div class="captain-slot neu">${cap ? renderCard(cap, { attrs: tappable('zoom', `data-id="${cap.id}"`) }) : '<div class="slot"></div>'}
    <div><small>Captain</small><b>${cap ? cap.name : 'None yet'}</b><p>${cap ? `${cap.style} playstyle` : 'Your Captain leads your strategy.'}</p>
    <button class="btn sm" data-act="sheet" data-s="captain">${cap ? 'Change' : 'Pick a captain'}</button></div></div>
  <div class="checks">${probs.length ? probs.slice(0, 3).map(p => `<span class="bad">${esc(p)}</span>`).join('') : `<span>${ICON.check}Ready to battle</span>`}</div>
  <div class="grid g4">${Object.entries(d.cards).map(([id, n]) => `<div class="cell">${renderCard(CARD[id], { cls: 'mini', attrs: tappable('zoom', `data-id="${id}"`) })}<span class="count">×${n}</span></div>`).join('')
    || '<p class="muted center" style="grid-column:1/-1">No cards yet. Tap Add cards.</p>'}</div>
  <div class="bar"><button class="btn sm" data-act="copy-deck">Copy code</button><button class="btn sm" data-act="import-deck">Import</button><button class="btn primary sm" style="margin-left:auto" data-act="go" data-to="build">Add cards</button></div>
  ${tabbar('deck')}${overlay()}`;
}

function viewBuild() {
  const d = deck(), n = count(d), list = CARDS.filter(c => ui.filter === 'all' || c.type === ui.filter);
  return `${header('Add Cards')}
  <div class="panel neu"><div class="chips">${['all', 'character', 'bit', 'evil'].map(f =>
    `<button class="chip${ui.filter === f ? ' on' : ''}" data-act="filter" data-f="${f}">${f === 'all' ? 'All' : LABEL[f]}</button>`).join('')}</div></div>
  <div class="grid">${list.map(c => `<div class="cell">${renderCard(c, { attrs: tappable('zoom', `data-id="${c.id}"`) })}
    <div class="stepper neu"><button data-act="step" data-id="${c.id}" data-d="-1" aria-label="Remove ${esc(c.name)}">−</button><span>${d.cards[c.id] || 0}/${c.main ? 1 : MAX_COPIES}</span><button data-act="step" data-id="${c.id}" data-d="1" aria-label="Add ${esc(c.name)}">+</button></div></div>`).join('')}</div>
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
  <div class="scroll">${RULES.map(([h, t], i) => `<details class="acc neu"${i < 3 ? ' open' : ''}><summary>${h}${ICON.chevron}</summary><p>${t}</p></details>`).join('')}</div>
  ${tabbar('rules')}`;

function viewGame() {
  const g = game, mine = g.players[me], live = g.turn === me && g.phase === 'play';
  if (g.phase === 'over') return viewOver();
  const glow = live ? mine.field.flatMap((f, i) => (canUseAny(g, me, f) ? [i] : [])) : [];
  let html = renderBoard(g, me, { glow, sel: ui.zoom?.zone === 'hand' ? ui.zoom.i : undefined });
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
  { text: 'This is you: your Captain card and your meters. Boredom (grey) is your health: fill it up and you lose. Creativity (orange) is your hype: land hits to build it, then spend it on your Captain\'s Super (the marked notch).', sel: `${MY} .hud`, next: true },
  { text: "Every turn you gain 2 Actions. Playing a card costs 1, and each move shows its cost. Actions you don't spend are saved for next turn (up to 5), so you can save up for big moves.", sel: '.pips', next: true },
  { text: `Tap ${TC.name} in your hand, then tap Play.`, sel: () => (ui.zoom ? '.dim [data-a*=\'"play"\']' : `.hand .card[data-id="${TC.id}"]`), done: g => g.players[0].field.length > 0 },
  { text: `Characters attack with moves, each costing Actions. Tap ${TC.name} on the field and use ${TM.name} (1 Action). Nobody can block, so its damage goes straight to their Boredom.`,
    sel: () => (ui.zoom ? '.dim [data-a*=\'"attack"\']' : `${MY} .field .card`), done: g => g.players[1].bore > 0 },
  { text: "Their Boredom went up by the attack's damage. You're out of Actions, so tap End Turn.", sel: '[data-act=end]', done: g => g.turn === 1 },
  { text: "The bot's turn. When it attacks, you pick which of your Characters blocks. The blocker takes the attack's damage minus its armour (the shield number).",
    sel: () => (game.phase !== 'defend' ? null : ui.defPick != null ? '.sheet [data-a*=\'"defend"\']' : '.sheet .field .card'), done: g => !!g.roll || (g.turn === 0 && g.turnNo > 2) },
  { text: 'Damage that gets through lowers HP; at 0 HP a Character is defeated and its owner gains 3 Boredom. Landing damage also moves 1 Creativity from them to you.', next: true },
  { text: 'Items are instant and last a few turns. Evils stay until removed. Tap your Captain to use its Super once you have enough Creativity, or your meters for the log, manual fixes, or to leave.', next: true },
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
const BOT_DECK = STARTERS[1];
const best = (idx, score) => idx.reduce((b, i) => (score(i) > score(b) ? i : b), idx[0]);

function startBot(tutorial) {
  if (!tutorial && deckProblems(deck()).length) return toast('Fix your deck first.');
  leave(true); bot = true; isHost = true; me = 0;
  const d = tutorial ? STARTER : deck(), g = newGame([{ captain: d.captain, cards: d.cards }, BOT_DECK], [myName, 'Bot']);
  if (tutorial) {
    g.turn = 0; g.log = ['Tutorial battle: you go first.'];
    g.players[0].hand[0] = TC.id;
  }
  ui.tut = tutorial ? 0 : null;
  state = game = null; setGame(g); botSoon();
}

const botSoon = () => { clearTimeout(botTimer); botTimer = setTimeout(botMove, 1100); };

function botMove() {
  const g = state;
  if (!bot || !g || g.phase === 'over') return;
  if (game !== g) return botSoon(); // wait until the screen has caught up with the last move
  const B = g.players[1], n = g.actions, all = B.field.map((_, i) => i);
  let a = null;
  if (g.phase === 'defend' && g.turn === 0) {
    const mv = CARD[g.players[0].field[g.pending.i].id].moves[g.pending.m], pw = mv.power + statsOf(g, 0, g.players[0].field[g.pending.i]).bonus;
    a = { type: 'defend', i: best(all, i => { const d = Math.max(0, pw - statsOf(g, 1, B.field[i]).def); return (d < B.field[i].hp ? 100 : 0) - d * 10 + B.field[i].hp; }) };
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
  return `<div class="victory">${renderAvatar(CARD[mine.captain], ' xl')}<small>vs. ${esc(opp.name)} (${CARD[opp.captain].name})</small>
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
    return `<div class="dim" data-act="close">${renderCard(c, { cls: 'zoom' })}<div class="row2">${can ? btn({ type: 'ability', i: -1 }, `${ICON.main}Super: ${c.goof} Creativity`, 'primary') : ''}
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
  return `<div class="dim" data-act="close">${renderCard(c, { cls: 'zoom', hp: item.hp, turns: item.turns, ...stats })}${rows}<button class="btn sm" data-act="close">Close</button></div>`;
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

function defendSheet() {
  const g = game, af = g.players[g.turn].field[g.pending.i], ac = CARD[af.id], A = statsOf(g, g.turn, af), mine = g.players[me].field, pickI = ui.defPick;
  const mv = ac.moves[g.pending.m], power = mv.power + A.bonus, dmg = f => Math.max(0, power - statsOf(g, me, f).def), pick = mine[pickI];
  return sheet(`<div class="attacker neu">${renderCard(ac, { cls: 'mini', hp: af.hp, ...A })}<div><small>Incoming attack</small><br><b>${ac.name}</b> uses <b>${mv.name}</b>: ${power} damage${mv.text ? `<br><small>${mv.text}</small>` : ''}</div></div>
    <h2>Pick a blocker</h2>
    <div class="field">${mine.map((f, i) => renderCard(CARD[f.id], { cls: 'mini' + (i === pickI ? ' picked' : ''), hp: f.hp, ...statsOf(g, me, f), attrs: tappable('defpick', `data-i="${i}"`) })).join('')}</div>
    <p class="muted center" style="margin:10px 0 12px">${pick ? (dmg(pick) >= pick.hp ? `${CARD[pick.id].name} takes ${dmg(pick)} and is defeated: you gain 3 Boredom.` : `${CARD[pick.id].name} takes ${dmg(pick)} damage after armour.`) : 'Armour (the shield) blocks that much of each hit. A defeated Character gives you 3 Boredom.'}</p>
    ${pick ? btn({ type: 'defend', i: pickI }, `Block with ${CARD[pick.id].name}`, 'primary wide') : '<button class="btn wide" disabled>Tap a Character</button>'}`, false);
}

function render() {
  const scrolls = [...$app.querySelectorAll('.grid, .scroll, .sheet')].map(el => el.scrollTop);
  const focus = document.activeElement?.id;
  const views = { home: viewHome, deck: viewDeck, build: viewBuild, lobby: viewLobby, rules: viewRules, game: viewGame };
  if (ui.view === 'game' && !game) ui.view = 'home';
  $app.dataset.view = ui.view;
  $app.innerHTML = views[ui.view]() + (ui.toast && ui.view !== 'game' ? `<div class="toast neu">${esc(ui.toast)}</div>` : '');
  $app.querySelectorAll('.grid, .scroll, .sheet').forEach((el, i) => { el.scrollTop = scrolls[i] || 0; });
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
function floatText(el, text, cls, nudge = 0) {
  if (!el) return;
  const r = el.getBoundingClientRect(), f = document.createElement('div');
  f.className = `floater ${cls}`; f.textContent = text;
  f.style.left = `${r.left + r.width / 2}px`; f.style.top = `${r.top + r.height * 0.3 - nudge}px`;
  fxLayer.append(f); setTimeout(() => f.remove(), 1900);
}
const banner = (html, cls) => { bannerQ = bannerQ.then(async () => {
  const b = Object.assign(document.createElement('div'), { className: `banner ${cls}`, innerHTML: `<span>${html}</span>` });
  fxLayer.append(b); await sleep(950); setTimeout(() => b.remove(), 600);
}); };
function splash(id) {
  const d = Object.assign(document.createElement('div'), { className: 'splash', innerHTML: renderCard(CARD[id]) });
  fxLayer.append(d); setTimeout(() => d.remove(), 1400);
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
  if (e.direct) { await jump(atkEl, hudEl(1 - e.p)); await sleep(350); return; }
  const defEl = fieldEl(e.target.p, e.target.i), r = e.roll;
  if (!defEl) return;
  const shield = overlayOn(defEl, `<div class="shield">${ICON.def}<b>${r.def}</b></div>`, 'shield-on');
  await sleep(420);
  await jump(atkEl, defEl);
  if (r.hit) { shield.classList.add('shatter'); flash(defEl, 'hurt', 600); floatText(defEl, `−${r.dmg} HP`, 'dmg'); }
  else { shield.classList.add('block'); floatText(defEl, 'Blocked!', 'blocked'); }
  await sleep(560);
  shield.remove();
  const kos = ev.filter(x => x.k === 'hit' && x.ko);
  kos.forEach(k => disintegrate(fieldEl(k.p, k.i)));
  if (kos.length) await sleep(1300);
}

async function preAnimate(ev) {
  $app.querySelectorAll('.dim, .sheet, .toast.wait').forEach(el => el.remove()); // e.g. the defend picker
  const atk = ev.find(e => e.k === 'attack');
  if (atk) return attackAnim(atk, ev);
  const hits = ev.filter(e => e.k === 'hit'); // manual HP changes
  for (const e of hits) {
    const el = fieldEl(e.p, e.i);
    if (e.ko) disintegrate(el); else { flash(el, 'hurt', 600); floatText(el, '−1 HP', 'dmg'); }
  }
  await sleep(hits.some(e => e.ko) ? 1300 : 450);
}

function postAnimate(ev, prev, s) {
  const nudges = new Map();
  for (const e of ev) {
    if (e.k === 'play') flash(e.zone === 'field' ? fieldEl(e.p, e.i) : $app.querySelector(`.fxc[data-who="${whoOf(e.p)}"][data-i="${e.i}"]`), e.zone === 'field' ? 'slam' : 'pop', 700);
    if (e.k === 'cast') splash(e.id);
    if (e.k === 'coin') coinToss(e.heads);
    if (e.k === 'meter') {
      const h = hudEl(e.p), n = nudges.get(h) || 0;
      nudges.set(h, n + 24);
      flash(h?.querySelector(`.meter.${e.key}`), 'bump', 600); flash(h?.querySelector(`.meter.${e.key}`), 'hl', 1400);
      floatText(h?.querySelector('.meters'), `${e.n > 0 ? '+' : ''}${e.n} ${e.key === 'goof' ? 'Creativity' : 'Boredom'}`, e.key, n);
    }
    if (e.k === 'draw' && e.p === me) flash($app.querySelector('.hand .card:last-child'), 'drawn', 650);
    if (e.k === 'turn') banner(e.p === me ? 'Your turn' : `${esc(s.players[e.p].name)}'s turn`, 'turn');
  }
  if (s.phase === 'over' && prev.phase !== 'over') flash($app.querySelector('.big'), 'enter', 1000);
}

// Inspecting a card tilts it toward the pointer with a moving shine.
document.addEventListener('pointermove', e => {
  const c = e.target.closest?.('.card.zoom, .fan .card');
  if (!c || calm) return;
  c.classList.add('held');
  const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  for (const [k, v] of [['--rx', `${((0.5 - y) * 18).toFixed(1)}deg`], ['--ry', `${((x - 0.5) * 22).toFixed(1)}deg`], ['--mx', `${(x * 100).toFixed(0)}%`], ['--my', `${(y * 100).toFixed(0)}%`]]) c.style.setProperty(k, v);
});
document.addEventListener('pointerout', e => {
  const c = e.target.closest?.('.card.zoom, .fan .card');
  if (c && !c.contains(e.relatedTarget)) { c.classList.remove('held'); for (const k of ['--rx', '--ry', '--mx', '--my']) c.style.removeProperty(k); }
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
    if (!isHost) c.send({ t: 'hello', name: myName, deck: { captain: deck().captain, cards: deck().cards } });
    ui.status = 'Connected, dealing…'; render();
  });
  c.on('data', onMsg);
  c.on('close', () => {
    if (conn !== c) return;
    conn = null;
    if (state && state.phase !== 'over') { state = game = null; ui.view = 'home'; peer?.destroy(); peer = null; ui.code = ''; toast('Your opponent left the battle.'); }
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
      guest = { name: String(m.name || 'Guest').slice(0, 20), deck: { captain: m.deck.captain, cards: m.deck.cards } };
      startGame();
    } else if (m.t === 'act' && state && m.a && typeof m.a === 'object') act(1, m.a);
    else if (m.t === 'rematch' && state?.phase === 'over') startGame();
  } else if (m.t === 'state' && m.s) setGame(m.s);
  else if (m.t === 'error') toast(String(m.msg));
}

function startGame() {
  const d = deck();
  setGame(newGame([{ captain: d.captain, cards: d.cards }, guest.deck], [myName, guest.name]));
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
  game = s; ui.view = 'game'; ui.code = ''; ui.status = ''; ui.defPick = null; ui.atk = null;
  toast(s.log[s.log.length - 1]);
  if (calm) return;
  if (!prev) coinFlip(s); else postAnimate(ev, prev, s);
}

function act(p, a) { // host (or bot game) only; returns whether the action was legal
  try { setGame(apply(state, p, a)); conn?.send({ t: 'state', s: state }); }
  catch (e) { if (p === me) toast(e.message); else conn?.send({ t: 'error', msg: e.message }); return false; }
  if (bot) botSoon();
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
  zoom(d) { ui.zoom = { id: d.id }; },
  card(d) { ui.zoom = { who: d.who, zone: d.zone, i: Number(d.i) }; ui.sheet = null; },
  sheet(d) { ui.sheet = d.s; ui.zoom = null; },
  close() { ui.zoom = ui.sheet = ui.atk = null; },
  aim(d) { ui.atk = { i: Number(d.i), m: Number(d.m) }; ui.defPick = null; ui.zoom = null; },
  step(d) {
    const dk = deck(), c = CARD[d.id], n = (dk.cards[d.id] || 0) + Number(d.d);
    if (n > (c.main ? 1 : MAX_COPIES)) return toast(c.main ? 'Main Characters are 1 per deck.' : `Max ${MAX_COPIES} copies.`);
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
  defpick(d) { ui.defPick = Number(d.i); },
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
  ACTS[el.dataset.act]?.(el.dataset);
  render();
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[data-act]:not(button)')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'Enter' && e.target.id === 'join-code') join();
  if (e.key === 'Escape' && (ui.zoom || ui.sheet === 'captain' || ui.sheet === 'adjust')) { ui.zoom = ui.sheet = null; render(); }
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
