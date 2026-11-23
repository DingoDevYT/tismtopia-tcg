// App shell: screens, saved decks and PeerJS networking.
// The host is player 0 and runs the rules engine; the guest (player 1) sends actions and gets the full state back.
// shortcut: the guest receives the whole state (including the host's hand), fine between friends; hide it if strangers ever play.
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('tismtopia.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tismtopia.' + k, JSON.stringify(v)); } catch { /* private mode: decks last this visit only */ } },
};
const uid = () => Math.random().toString(36).slice(2, 10);
let decks = store.get('decks', null);
if (!Array.isArray(decks) || !decks.length) decks = [{ id: uid(), ...structuredClone(STARTER) }];
let myName = store.get('name', 'Player');
const ui = { view: 'home', deckId: store.get('deck', decks[0].id), filter: 'all', zoom: null, sheet: null, defPick: null, toast: '', code: '', status: '', joinCode: '', seenRoll: 0 };
let peer = null, conn = null, isHost = false, me = 0, game = null, guest = null, toastTimer;

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
  ui.toast = msg; render();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast = ''; render(); }, 2800);
}

function copy(text, what) {
  navigator.clipboard.writeText(text).then(() => toast(`${what} copied.`), () => prompt(`Copy the ${what.toLowerCase()}:`, text));
}

// ---------------- views ----------------
const tabbar = on => `<nav class="tabbar">${[['home', 'home'], ['cards', 'deck'], ['battle', 'lobby'], ['rules', 'rules']].map(([icon, view]) =>
  `<button class="${view === on ? 'on' : ''}" data-act="go" data-to="${view}" aria-label="${view}">${ICON[icon]}</button>`).join('')}</nav>`;

const deckSelect = withNew => `<label class="deckname neu-in"><select data-change="pick-deck" aria-label="Deck">${decks.map(d =>
  `<option value="${d.id}"${d.id === deck().id ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}${withNew ? '<option value="new">+ New deck</option>' : ''}</select>${ICON.chevron}</label>`;

function viewHome() {
  return `<div class="topbar"><button class="profile neu" data-act="rename-me" aria-label="Change your name">${renderAvatar(CARD[deck().captain] || CAPTAINS[0])}<b>${esc(myName)}</b></button></div>
  <div class="logo"><b>Tismtopia</b><span>TRADING CARD GAME</span></div>
  <section class="hero neu">
    <div class="fan">${CAPTAINS.slice(0, 3).map((c, i) => renderCard(c, { style: `--r:${(i - 1) * 9}deg;--y:${Math.abs(i - 1) * 14}px` })).join('')}</div>
    <div class="row2"><button class="btn primary" data-act="go" data-to="lobby" data-host="1">Host Battle</button><button class="btn" data-act="go" data-to="lobby">Join Battle</button></div>
  </section>
  <div class="tiles">
    <button class="tile neu" data-act="go" data-to="deck">${ICON.cards}<b>Deck Builder</b><small>${decks.length} deck${decks.length > 1 ? 's' : ''}</small></button>
    <button class="tile neu" data-act="go" data-to="rules">${ICON.rules}<b>How to Play</b><small>Rules</small></button>
  </div>${tabbar('home')}`;
}

function viewDeck() {
  const d = deck(), cap = CARD[d.captain], probs = deckProblems(d);
  return `${header(esc(d.name))}
  <div class="panel neu" style="padding:10px 12px"><div class="row2">${deckSelect(true)}
    <button class="btn sm" style="flex:none" data-act="rename-deck">Rename</button><button class="btn sm" style="flex:none" data-act="delete-deck">Delete</button></div></div>
  <div class="captain-slot neu">${cap ? renderCard(cap, { cls: 'mini', attrs: tappable('zoom', `data-id="${cap.id}"`) }) : '<div class="slot" style="width:84px"></div>'}
    <div><small>Captain</small><b>${cap ? cap.name : 'None yet'}</b><p>${cap ? cap.text : 'Your Captain leads your strategy.'}</p>
    <button class="btn sm" data-act="sheet" data-s="captain">${cap ? 'Change captain' : 'Pick a captain'}</button></div></div>
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
  let html = renderBoard(g, me, { glow: live && g.actions ? mine.field.map((_, i) => i) : [], sel: ui.zoom?.zone === 'hand' ? ui.zoom.i : undefined });
  if (g.phase === 'defend' && g.turn !== me) html += defendSheet();
  else if (g.roll && g.roll.seq > ui.seenRoll) html += rollOverlay();
  else html += overlay();
  const banner = g.phase === 'defend' && g.turn === me ? `Waiting for ${g.players[1 - me].name} to pick a defender…` : ui.toast;
  return html + (banner ? `<div class="toast neu">${esc(banner)}</div>` : '');
}

function viewOver() {
  const g = game, mine = g.players[me], opp = g.players[1 - me];
  return `<div class="victory">${renderAvatar(CARD[mine.captain], ' xl')}<small>vs. ${esc(opp.name)} (${CARD[opp.captain].name})</small>
    <h1 class="big">${g.winner === me ? 'Victory!' : 'Defeat'}</h1><div class="rainbow"></div>
    <div class="stats-list neu-in">
      <div><span>Your points</span>${coins(mine.points)}</div>
      <div><span>${esc(opp.name)}'s points</span>${coins(opp.points)}</div>
      <div><span>Turns played</span><b>${g.turnNo}</b></div>
      <div><span>Boredom inflicted</span><b><span class="bore-i">${ICON.bore}</span>${mine.stats.bore}</b></div>
      <div><span>Goofiness built</span><b><span class="goof-i">${ICON.goof}</span>${mine.stats.goof}</b></div>
    </div>
    <div class="row2"><button class="btn primary" data-act="rematch"${conn ? '' : ' disabled'}>Rematch</button><button class="btn" data-act="leave">Home</button></div></div>
    ${ui.toast ? `<div class="toast neu">${esc(ui.toast)}</div>` : ''}`;
}

// Zoomed card, captain picker or adjust sheet on top of the current view.
function overlay() {
  if (ui.sheet === 'captain') return sheet(`<h2>Choose your Captain</h2>
    <div class="grid g2">${CAPTAINS.map(c => renderCard(c, { cls: c.id === deck().captain ? 'picked' : '', attrs: tappable('captain', `data-id="${c.id}"`) })).join('')}</div>
    <button class="btn wide" data-act="close">Close</button>`);
  if (ui.sheet === 'adjust' && game) return adjustSheet();
  if (!ui.zoom) return '';
  if (ui.zoom.id) return `<div class="dim" data-act="close">${renderCard(CARD[ui.zoom.id], { cls: 'zoom' })}<button class="btn sm" data-act="close">Close</button></div>`;
  return zoomGame(ui.zoom);
}

function zoomGame(z) {
  const w = z.who === 'me' ? me : 1 - me, t = game.players[w];
  const item = { hand: t.hand, field: t.field, fx: t.effects }[z.zone]?.[z.i];
  if (item === undefined) { ui.zoom = null; return ''; }
  const c = CARD[item.id ?? item], live = game.turn === me && game.phase === 'play', mine = w === me;
  const remove = btn({ type: 'discard', who: w, zone: z.zone, i: z.i }, z.zone === 'hand' ? 'Discard' : 'Remove');
  let rows = '';
  if (z.zone === 'hand') rows = `<div class="row2">${live ? btn({ type: 'play', i: z.i }, `Play ${cost(1)}`, 'primary') : ''}${remove}</div>`;
  if (z.zone === 'field') rows = (mine && live ? `<div class="row2">${btn({ type: 'attack', i: z.i }, `${ICON.atk}Attack ${cost(1)}`, 'primary')}${btn({ type: 'ability', i: z.i }, `${ICON.bit}Ability ${cost(1)}`)}</div>` : '')
    + `<div class="row2">${stepper(`HP ${item.hp}`, { type: 'hp', who: w, i: z.i, d: -1 }, { type: 'hp', who: w, i: z.i, d: 1 })}${remove}</div>`;
  if (z.zone === 'fx') rows = `<div class="row2">${item.turns != null ? stepper(`${item.turns} turn${item.turns > 1 ? 's' : ''}`, { type: 'turns', who: w, i: z.i, d: -1 }, { type: 'turns', who: w, i: z.i, d: 1 }) : ''}${remove}</div>`;
  return `<div class="dim" data-act="close">${renderCard(c, { cls: 'zoom', hp: item.hp, turns: item.turns })}${rows}<button class="btn sm" data-act="close">Close</button></div>`;
}

function adjustSheet() {
  const g = game, live = g.turn === me && g.phase === 'play';
  const meters = [['goof', 'Goofiness', 'goof'], ['bore', 'Boredom', 'bore'], ['point', 'Points', 'points']];
  return sheet(`<h2>Adjust</h2><p class="muted center" style="margin-bottom:12px">Apply card effects by hand. Both players see every change.</p>
    ${[me, 1 - me].map(w => `<div class="adj neu-in"><b>${esc(g.players[w].name)}${w === me ? ' (you)' : ''}</b>
      ${meters.map(([icon, label, key]) => `<div class="adj-row"><span><span class="${icon}">${ICON[icon]}</span>${label}</span>${stepper(g.players[w][key],
        { type: 'adjust', who: w, key, d: -1 }, { type: 'adjust', who: w, key, d: 1 })}</div>`).join('')}</div>`).join('')}
    <div class="adj neu-in"><div class="adj-row"><span><span class="point">${ICON.action}</span>Actions this turn</span>${stepper(g.actions,
      { type: 'adjust', who: me, key: 'actions', d: -1 }, { type: 'adjust', who: me, key: 'actions', d: 1 })}</div></div>
    <div class="row2">${btn({ type: 'draw' }, 'Draw a card')}${live ? btn({ type: 'ability', i: -1 }, `Captain ability ${cost(1)}`) : ''}</div>
    <small class="lbl" style="margin-top:18px">Log</small><div class="log">${g.log.slice(-15).reverse().map(l => `<p>${esc(l)}</p>`).join('')}</div>`);
}

function defendSheet() {
  const g = game, af = g.players[g.turn].field[g.pending.i], ac = CARD[af.id], mine = g.players[me].field, pickI = ui.defPick;
  return sheet(`<div class="attacker neu">${renderCard(ac, { cls: 'mini', hp: af.hp })}<div><small>Incoming attack</small><br><b>${ac.name}</b> attacks with <b>${ac.atk} ATK</b></div></div>
    <h2>Pick a defender</h2>
    <div class="field">${mine.map((f, i) => renderCard(CARD[f.id], { cls: 'mini' + (i === pickI ? ' picked' : ''), hp: f.hp, attrs: tappable('defpick', `data-i="${i}"`) })).join('')}</div>
    <p class="muted center" style="margin:10px 0 12px">They roll d20 + ${ac.atk}. It breaks through if that reaches your defender's DEF.</p>
    ${mine[pickI] ? btn({ type: 'defend', i: pickI }, `Defend with ${CARD[mine[pickI].id].name}`, 'primary wide') : '<button class="btn wide" disabled>Tap a Character</button>'}`, false);
}

function rollOverlay() {
  const r = game.roll, A = CARD[r.a], D = CARD[r.d], defender = game.players[1 - r.by];
  return `<div class="dim">
    <div class="duel">${renderCard(A, { cls: 'mini', hp: Math.max(0, r.aHp) })}<span class="vs">VS</span>${renderCard(D, { cls: 'mini', hp: Math.max(0, r.dHp) })}</div>
    <div class="d20">${r.die}</div>
    <div class="math neu">${r.die} + <b>${r.atk} ATK</b> = <b>${r.total}</b> vs <b>${r.def} DEF</b></div>
    <div class="result neu"><b${r.hit ? '' : ' class="miss"'}>${r.hit ? 'Breaks through!' : 'Blocked!'}</b>
      <small>${r.hit ? `${D.name} −1 ${ICON.hp} · ${esc(defender.name)} +${r.atk} ${ICON.bore}` : `${A.name} −1 ${ICON.hp}`}</small></div>
    <button class="btn primary" data-act="seen-roll">Continue</button></div>`;
}

function render() {
  const scrolls = [...$app.querySelectorAll('.grid, .scroll, .sheet')].map(el => el.scrollTop);
  const focus = document.activeElement?.id;
  const views = { home: viewHome, deck: viewDeck, build: viewBuild, lobby: viewLobby, rules: viewRules, game: viewGame };
  if (ui.view === 'game' && !game) ui.view = 'home';
  $app.dataset.view = ui.view;
  $app.innerHTML = views[ui.view]() + (ui.toast && ui.view !== 'game' ? `<div class="toast neu">${esc(ui.toast)}</div>` : '');
  $app.querySelectorAll('.grid, .scroll, .sheet').forEach((el, i) => { el.scrollTop = scrolls[i] || 0; });
  if (focus) document.getElementById(focus)?.focus();
}

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
    if (game && game.phase !== 'over') { game = null; ui.view = 'home'; peer?.destroy(); peer = null; ui.code = ''; toast('Your opponent left the battle.'); }
    else if (!game && isHost && ui.code) { ui.status = 'Waiting for a friend to join'; render(); }
    else render();
  });
}

function onMsg(m) {
  if (!m || typeof m !== 'object') return;
  if (isHost) {
    if (m.t === 'hello' && !game) {
      const probs = deckProblems(m.deck);
      if (probs.length) { conn.send({ t: 'error', msg: `Your deck isn't legal: ${probs[0]}` }); return; }
      guest = { name: String(m.name || 'Guest').slice(0, 20), deck: { captain: m.deck.captain, cards: m.deck.cards } };
      startGame();
    } else if (m.t === 'act' && game && m.a && typeof m.a === 'object') act(1, m.a);
    else if (m.t === 'rematch' && game?.phase === 'over') startGame();
  } else if (m.t === 'state' && m.s) setGame(m.s);
  else if (m.t === 'error') toast(String(m.msg));
}

function startGame() {
  const d = deck();
  setGame(newGame([{ captain: d.captain, cards: d.cards }, guest.deck], [myName, guest.name]));
  conn?.send({ t: 'state', s: game });
}

function setGame(s) {
  if (!game || s.seq < game.seq) { ui.zoom = ui.sheet = null; ui.seenRoll = 0; } // a fresh deal
  game = s; ui.view = 'game'; ui.code = ''; ui.status = ''; ui.defPick = null;
  toast(s.log[s.log.length - 1]);
}

function act(p, a) { // host only
  try { setGame(apply(game, p, a)); conn?.send({ t: 'state', s: game }); }
  catch (e) { if (p === me) toast(e.message); else conn?.send({ t: 'error', msg: e.message }); }
}

const doAction = a => (isHost ? act(0, a) : conn?.send({ t: 'act', a }));

function leave(quiet) {
  const c = conn; conn = null; c?.close(); peer?.destroy();
  peer = null; game = null; ui.code = ''; ui.status = ''; ui.zoom = ui.sheet = null;
  if (!quiet) ui.view = 'home';
}

// ---------------- input ----------------
const ACTS = {
  go(d) { ui.view = d.to; ui.zoom = ui.sheet = null; if (d.host) host(); },
  'rename-me'() { const n = prompt('Your name', myName)?.trim(); if (n) { myName = n.slice(0, 20); store.set('name', myName); } },
  filter(d) { ui.filter = d.f; },
  zoom(d) { ui.zoom = { id: d.id }; },
  card(d) { ui.zoom = { who: d.who, zone: d.zone, i: Number(d.i) }; },
  sheet(d) { ui.sheet = d.s; ui.zoom = null; },
  close() { ui.zoom = ui.sheet = null; },
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
  'seen-roll'() { ui.seenRoll = game.roll.seq; },
  rematch() { if (isHost) startGame(); else conn?.send({ t: 'rematch' }); },
  leave() { leave(); },
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
