// Music and fanfares. The tracks live in audio/local/ on the owner's PC (git-ignored); the public site has only the encrypted copies
// in assets/, which js/assets.js decrypts for signed-in members (a track may start a moment late on a first visit). Loops crossfade; fanfares cut in.
const MUSIC = {
  title: 'title', home: 'home', packs: 'choose-pack', open: 'pack-opening', collection: 'my-cards', build: 'my-cards',
  deck: 'choose-deck', lobby: 'battle-menu', rules: 'home', battle: 'battle', winning: 'battle-winning', losing: 'battle-losing', results: 'battle-results',
};
let VOL = store.get('volume', 0.5); const FADE = 1400;
let musicOn = VOL > 0, unlocked = false, cur = null, curKey = '', wantKey = '', fanfaring = false, titleDone = false;
let lastPhase = null, lastReveal = '';
const tracks = {}; // one Audio per track, created on demand and reused
// locked (js/assets.js): no src until the track is decrypted; asking again fills it in
const track = name => { const t = (tracks[name] ||= Object.assign(new Audio(), { preload: 'auto' })), u = !t.src && assetUrl(`audio/local/${name}.mp3`); if (u) t.src = u; return t; };

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
  const f = track(name); if (!f.src) return; // not decrypted yet: skipped (it would never end, and the music would wait for it)
  fanfaring = true;
  if (cur) { cur.pause(); cur.volume = 0; } curKey = '';             // fanfares cut in, no fade
  Object.values(tracks).forEach(t => { if (t !== cur && !t.loop) { t.pause(); } });
  f.loop = false; f.currentTime = 0; f.volume = VOL; f.play().catch(() => {});
  f.onended = () => { fanfaring = false; playLoop(wantKey); };
}

// Which loop fits the screen right now (battle music reacts to who is closer to being bored out).
function musicKey() {
  const v = ui.view;
  if (v !== 'home') titleDone = true;
  if (v === 'home' && !titleDone) return 'title';
  if (v === 'game' && game) {
    if (game.phase === 'over') return 'results';
    const mine = game.players[me].bore, theirs = game.players[1 - me].bore, close = BORE_MAX - 5; // the winning/losing music starts 5 Boredom from the end
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
    const c = o.cards[o.i], look = pullLook(c), bigPull = !!look.cine, tag = o.pack + o.cards.map(x => x.id).join() + o.i + (bigPull && !c.cine ? 'cine' : '');
    if (tag !== lastReveal) {
      lastReveal = tag;
      const name = look.fan; // by stars (pullLook, js/odds.js), never the rarity letter
      stopRoll();
      if (bigPull && !c.cine) drumAudio = sfx('packopen_10_drumroll', true); // build-up during the aura; the fanfare waits for the reveal
      else if (o.god && o.i === 0) fanfare('fanfare-crown'); // god pack: the biggest fanfare as the first card lands
      else if (name) fanfare(name);
    }
  }
  if (!(ui.view === 'open' && o?.stage === 'reveal')) stopRoll();
  playLoop(musicKey());
}

// Sound effects (audio/local/sfx/, same rule as the music; one not decrypted yet is skipped): played by comparing state before and after each render.
const sfx = (name, loop) => { if (!musicOn || !unlocked) return; const u = assetUrl(`audio/local/sfx/${name}.wav`); if (!u) return; const a = new Audio(u); a.volume = Math.min(1, VOL * 1.3); a.loop = !!loop; a.play().catch(() => {}); return a; };
let drumAudio = null; // the drumroll loops for the whole aura cutscene, then stops on the reveal
const stopRoll = () => { if (drumAudio) { drumAudio.pause(); drumAudio = null; } };
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
    else if (o.stage === 'reveal') sfx(pullLook(o.cards[o.i]).flip);
    else if (o.stage === 'summary') sfx('packopen_2_handreveal');
  }
  prevOpen = tag;
}
addEventListener('click', e => { if (e.target.closest('button')) sfx('ui_button_1'); }, { capture: true });

// Hook into every screen change.
const renderNoMusic = render;
render = function () { renderNoMusic(); syncMusic(); syncSfx(); };

// Locked (js/assets.js): the title music and the sound effects are fetched as soon as the key arrives (the sfx behind the art on screen),
// and a loop that was wanted before it was decrypted starts when it arrives.
addEventListener('asset-key', () => {
  ['ui_button_1', 'cardDraw', 'PlayerTurnBegin', 'OpponentTurnBegin', 'pokemonPlay', 'PlayTrainer', 'damageToken', 'colorlessAttackSmall', 'colorlessAttackBig', 'knockOut_002',
    'packopen_4_ripopen', 'packopen_6_A_cardflip', 'packopen_11_rarereveal', 'packopen_2_handreveal', 'packopen_10_drumroll', 'versus_rewards_2_barfillsparkle', 'ui_reward_coinreward']
    .forEach(n => assetUrl(`audio/local/sfx/${n}.wav`, true));
  assetUrl('audio/local/title.mp3');
});
addEventListener('asset', e => { if (cur && !cur.src && e.detail.endsWith('.mp3')) { curKey = ''; syncMusic(); } });
// Browsers only allow sound after a tap: the first one anywhere starts the music.
addEventListener('pointerdown', () => { if (!unlocked) { unlocked = true; syncMusic(); } }, { capture: true });
// Phones: pause when the app is in the background, pick up again when it comes back.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) Object.values(tracks).forEach(t => t.pause());
  else if (musicOn && unlocked) { if (fanfaring) { fanfaring = false; } curKey = ''; syncMusic(); }
});

// Version shown small on the title screens, so a refresh shows whether the new code arrived. Bump the last number with every push; 1.0.0 = public, balanced release.
const APP_VERSION = '0.1.10';
// Title screen: browsers block sound until the first tap, so the game opens on the logo and that tap starts the music.
const title = Object.assign(document.createElement('div'), { className: 'title-screen',
  innerHTML: `<img src="art/logo.png" alt="Tismtopia TCG"><p>Tap anywhere to start</p><small class="ver">v${APP_VERSION}</small>` });
title.addEventListener('pointerdown', () => { title.classList.add('gone'); setTimeout(() => title.remove(), 400); });
document.body.append(title);

// Volume slider, always in the corner (0 = off).
const vol = Object.assign(document.createElement('input'), { type: 'range', min: 0, max: 1, step: 0.05, value: VOL, className: 'vol-slider neu' });
vol.setAttribute('aria-label', 'Volume'); vol.style.setProperty('--v', VOL);
vol.addEventListener('input', () => {
  VOL = +vol.value; store.set('volume', VOL); unlocked = true; vol.style.setProperty('--v', VOL);
  const was = musicOn; musicOn = VOL > 0;
  if (!musicOn) { Object.values(tracks).forEach(t => t.pause()); curKey = ''; fanfaring = false; }
  else if (!was) syncMusic();
  else if (cur) { clearInterval(cur._fade); cur.volume = VOL; }
});
document.body.append(vol);
// Speaker button. Phones: the slider hides behind it and opens as a small popover under it (CSS decides; tap outside closes).
// Wider screens: it sits left of the slider (so the slider reads as volume, not brightness) and mutes / unmutes.
const volBtn = Object.assign(document.createElement('button'), { className: 'vol-btn neu', type: 'button',
  innerHTML: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 9v6h4l5 4V5L7 9z"/><path class="wave" d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' });
volBtn.setAttribute('aria-label', 'Volume'); volBtn.setAttribute('aria-expanded', 'false');
const syncVolBtn = () => volBtn.classList.toggle('off', VOL === 0);
vol.addEventListener('input', syncVolBtn); syncVolBtn();
let volWas = 0.5;
volBtn.addEventListener('click', () => {
  if (matchMedia('(min-width: 520px)').matches) { if (VOL) volWas = VOL; vol.value = VOL ? 0 : volWas; vol.dispatchEvent(new Event('input')); return; }
  volBtn.setAttribute('aria-expanded', String(document.body.classList.toggle('vol-open')));
});
document.addEventListener('pointerdown', e => { if (document.body.classList.contains('vol-open') && !e.target.closest('.vol-slider, .vol-btn')) { document.body.classList.remove('vol-open'); volBtn.setAttribute('aria-expanded', 'false'); } }, true);
document.body.append(volBtn);

// Dark mode toggle, left of the volume control. A device setting (not in the cloud save; Reset keeps it). index.html applies it before first paint.
// The label stays "Dark mode" and aria-pressed carries the state (a toggle's label must not flip with it).
const themeBtn = Object.assign(document.createElement('button'), { className: 'theme-btn neu', type: 'button' });
themeBtn.setAttribute('aria-label', 'Dark mode');
const syncTheme = () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeBtn.innerHTML = dark ? ICON.sun : ICON.moon; themeBtn.setAttribute('aria-pressed', String(dark));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1f2a' : '#e9edf5');
};
themeBtn.addEventListener('click', () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; store.set('theme', t); syncTheme(); });
syncTheme(); document.body.append(themeBtn);
