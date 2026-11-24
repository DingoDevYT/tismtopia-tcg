// Music and fanfares. The tracks live in audio/local/ and are never uploaded (they aren't ours to publish),
// so the public site is silent and anyone with the files gets the soundtrack. Loops crossfade; fanfares cut in.
const MUSIC = {
  title: 'title', home: 'home', packs: 'choose-pack', open: 'pack-opening', collection: 'my-cards', build: 'my-cards',
  deck: 'choose-deck', lobby: 'battle-menu', rules: 'home', battle: 'battle', winning: 'battle-winning', losing: 'battle-losing', results: 'battle-results',
};
const VOL = 0.55, FADE = 1400;
let musicOn = store.get('music', true), unlocked = false, cur = null, curKey = '', wantKey = '', fanfaring = false, titleDone = false;
let lastPhase = null, lastReveal = '';
const tracks = {}; // one Audio per track, created on demand and reused
const track = name => (tracks[name] ||= Object.assign(new Audio(`audio/local/${name}.mp3`), { preload: 'auto' }));

function fade(el, to, ms, done) { // timer-based so fades still finish when the tab isn't being painted
  const from = el.volume, t0 = Date.now();
  clearInterval(el._fade);
  el._fade = setInterval(() => { const k = Math.min(1, (Date.now() - t0) / ms); el.volume = Math.max(0, Math.min(1, from + (to - from) * k)); if (k >= 1) { clearInterval(el._fade); done?.(); } }, 30);
}
function playLoop(key) {
  wantKey = key;
  if (!musicOn || !unlocked || fanfaring || key === curKey) return;
  const name = MUSIC[key]; if (!name) return;
  const next = track(name);
  if (cur && cur !== next) { const old = cur; fade(old, 0, FADE, () => old.pause()); }
  next.loop = true; if (next.paused) { next.volume = 0; next.currentTime = cur === next ? next.currentTime : 0; next.play().catch(() => {}); }
  fade(next, VOL, FADE);
  cur = next; curKey = key;
}
function fanfare(name) {
  if (!musicOn || !unlocked) return;
  fanfaring = true;
  if (cur) { cur.pause(); cur.volume = 0; } curKey = '';             // fanfares cut in, no fade
  Object.values(tracks).forEach(t => { if (t !== cur && !t.loop) { t.pause(); } });
  const f = track(name); f.loop = false; f.currentTime = 0; f.volume = VOL; f.play().catch(() => {});
  f.onended = () => { fanfaring = false; playLoop(wantKey); };
}

// Which loop fits the screen right now (battle music reacts to who is closer to being bored out).
function musicKey() {
  const v = ui.view;
  if (v !== 'home') titleDone = true;
  if (v === 'home' && !titleDone) return 'title';
  if (v === 'game' && game) {
    if (game.phase === 'over') return 'results';
    const mine = game.players[me].bore, theirs = game.players[1 - me].bore, close = BORE_MAX - 3;
    if (mine >= close && mine > theirs) return 'losing';
    if (theirs >= close && theirs > mine) return 'winning';
    return 'battle';
  }
  return MUSIC[v] ? v : 'home';
}
function syncMusic() {
  // fanfares: game end, and rare pulls as they're revealed
  if (ui.view === 'game' && game) {
    if (game.phase === 'over' && lastPhase && lastPhase !== 'over') fanfare(game.winner === me ? 'victory' : 'defeat');
    lastPhase = game.phase;
  } else lastPhase = null;
  const o = ui.open;
  if (ui.view === 'open' && o?.stage === 'reveal') {
    const c = o.cards[o.i], tag = o.pack + o.cards.map(x => x.id).join() + o.i;
    if (tag !== lastReveal) {
      lastReveal = tag;
      const name = c.finish === 'full' ? (c.rarity === 'UR' ? 'fanfare-crown' : 'fanfare-2star') : c.rarity === 'UR' ? 'fanfare-1star' : c.rarity === 'R' || c.finish !== 'normal' ? 'fanfare-4diamond' : '';
      if (name) fanfare(name);
    }
  }
  playLoop(musicKey());
}

// Sound effects (audio/local/sfx/, same rule as the music): played by comparing state before and after each render.
const sfx = name => { if (!musicOn || !unlocked) return; const a = new Audio(`audio/local/sfx/${name}.wav`); a.volume = 0.7; a.play().catch(() => {}); };
let prev = null, prevOpen = '';
function syncSfx() {
  if (ui.view === 'game' && game) {
    const snap = { turn: game.turn, turnNo: game.turnNo, hands: game.players.map(p => p.hand.length), fx: game.players.map(p => p.effects.length),
      fields: game.players.map(p => p.field.map(f => f.hp)), bore: game.players.map(p => p.bore) };
    if (prev) {
      if (snap.turnNo !== prev.turnNo || snap.turn !== prev.turn) sfx(snap.turn === me ? 'PlayerTurnBegin' : 'OpponentTurnBegin');
      const lostHp = snap.fields.flat().reduce((a, b) => a + b, 0) < prev.fields.flat().reduce((a, b) => a + b, 0);
      const fainted = snap.fields.some((f, i) => f.length < prev.fields[i].length);
      if (fainted) sfx('knockOut_002');
      else if (lostHp) sfx(prev.fields.flat().reduce((a, b) => a + b, 0) - snap.fields.flat().reduce((a, b) => a + b, 0) >= 4 ? 'colorlessAttackBig' : 'colorlessAttackSmall');
      else if (snap.fields.some((f, i) => f.length > prev.fields[i].length)) sfx('pokemonPlay');
      else if (snap.fx.some((n, i) => n > prev.fx[i])) sfx('PlayTrainer');
      else if (snap.bore.some((n, i) => n > prev.bore[i])) sfx('damageToken');
      else if (snap.hands[me] > prev.hands[me]) sfx('cardDraw');
    }
    prev = snap;
  } else prev = null;
  const o = ui.open, tag = ui.view === 'open' && o ? o.stage + o.i : '';
  if (tag && tag !== prevOpen) {
    if (o.stage === 'deck') sfx('packopen_4_ripopen');
    else if (o.stage === 'reveal') sfx(o.cards[o.i].rarity === 'UR' || o.cards[o.i].finish !== 'normal' ? 'packopen_11_rarereveal' : 'packopen_6_A_cardflip');
    else if (o.stage === 'summary') sfx('packopen_2_handreveal');
  }
  prevOpen = tag;
}
addEventListener('click', e => { if (e.target.closest('button')) sfx('ui_button_1'); }, { capture: true });

// Hook into every screen change.
const renderNoMusic = render;
render = function () { renderNoMusic(); syncMusic(); syncSfx(); };

// Browsers only allow sound after a tap: the first one anywhere starts the music.
addEventListener('pointerdown', () => { if (!unlocked) { unlocked = true; syncMusic(); } }, { capture: true });
// Phones: pause when the app is in the background, pick up again when it comes back.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) Object.values(tracks).forEach(t => t.pause());
  else if (musicOn && unlocked) { if (fanfaring) { fanfaring = false; } curKey = ''; syncMusic(); }
});

// Title screen: browsers block sound until the first tap, so the game opens on the logo and that tap starts the music.
const title = Object.assign(document.createElement('div'), { className: 'title-screen',
  innerHTML: '<img src="art/logo.png" alt="Tismtopia TCG"><p>Tap anywhere to start</p>' });
title.addEventListener('pointerdown', () => { title.classList.add('gone'); setTimeout(() => title.remove(), 400); });
document.body.append(title);

// Mute button, always in the corner.
const muteBtn = Object.assign(document.createElement('button'), { className: 'mute-btn neu', type: 'button' });
const drawMute = () => {
  muteBtn.setAttribute('aria-label', musicOn ? 'Mute music' : 'Play music');
  muteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 9h4l5-4v14l-5-4H4z"/>${musicOn
    ? '<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    : '<path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'}</svg>`;
};
muteBtn.addEventListener('click', () => {
  musicOn = !musicOn; store.set('music', musicOn); drawMute();
  if (!musicOn) { Object.values(tracks).forEach(t => fade(t, 0, 300, () => t.pause())); curKey = ''; fanfaring = false; }
  else { unlocked = true; syncMusic(); }
});
drawMute();
document.body.append(muteBtn);
