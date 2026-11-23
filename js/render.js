// Render helpers shared by the mockups and the game. Each returns an HTML string.
const esc = s => String(s).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const LABEL = { captain: 'Captain', character: 'Character', main: 'Main Character', bit: 'Bit', evil: 'Evil' };
const kindOf = c => (c.main ? 'main' : c.type);

// Custom icon set, 24x24. Filled glyphs unless wrapped in G() (outlined).
const G = d => `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
const ICON = Object.fromEntries(Object.entries({
  // card types
  character: '<circle cx="12" cy="7.5" r="4.5"/><path d="M3.5 21c0-5 3.8-8 8.5-8s8.5 3 8.5 8z"/>',
  bit: '<path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
  evil: '<path fill-rule="evenodd" d="M4 3c.3 3.2 1.4 5.4 3.2 6.6a7 7 0 1 0 9.6 0C18.6 8.4 19.7 6.2 20 3c-2 1.8-4 2.9-6 3.3a7 7 0 0 0-4 0C8 5.9 6 4.8 4 3zm4.2 10l3.3 1.3-.5 1.5-2.4-.9zm7.6 0l-3.3 1.3.5 1.5 2.4-.9z"/>',
  captain: '<path d="M2.5 8l5 4.5L12 4l4.5 8.5 5-4.5-2 12h-15z"/>',
  main: '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/>',
  // stats
  atk: '<path d="M12 2l1.76 5.75 5.31-2.82-2.82 5.31L22 12l-5.75 1.76 2.82 5.31-5.31-2.82L12 22l-1.76-5.75-5.31 2.82 2.82-5.31L2 12l5.75-1.76-2.82-5.31 5.31 2.82z"/>',
  def: '<path d="M12 2l8.5 3.2v6.3c0 5.2-3.6 9.3-8.5 10.5-4.9-1.2-8.5-5.3-8.5-10.5V5.2z"/>',
  hp: '<path d="M12 21.5S3 16 3 9.6a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6.4-9 11.9-9 11.9z"/>',
  // meters and resources
  goof: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zM6.8 10.4l2-2.6 2 2.6-.9.7-1.1-1.4-1.1 1.4zm6.4 0l2-2.6 2 2.6-.9.7-1.1-1.4-1.1 1.4zM6.8 13h10.4a5.2 5.2 0 0 1-10.4 0z"/>',
  bore: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zM6.5 9.3h4.2V11H6.5zm6.8 0h4.2V11h-4.2zM9 15h6v1.7H9z"/>',
  point: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zm0 4.5l1.7 3.5 3.8.5-2.8 2.7.7 3.8L12 15.2 8.6 17l.7-3.8-2.8-2.7 3.8-.5z"/>',
  action: '<path d="M13.5 2L4.5 13.5h6.2L9.5 22l9-11.5h-6.2z"/>',
  time: '<path d="M6 2h12v2.2c0 3-2.4 5.1-4.4 7.8 2 2.7 4.4 4.8 4.4 7.8V22H6v-2.2c0-3 2.4-5.1 4.4-7.8C8.4 9.3 6 7.2 6 4.2z"/>',
  forever: G('<path stroke-width="2.6" d="M12 12c-2-2.6-3.6-4-5.6-4a4 4 0 0 0 0 8c2 0 3.6-1.4 5.6-4s3.6-4 5.6-4a4 4 0 0 1 0 8c-2 0-3.6-1.4-5.6-4z"/>'),
  // ui
  bot: '<circle cx="12" cy="3.6" r="1.7"/>' + G('<rect x="4" y="8" width="16" height="11.5" rx="3.5"/><path d="M12 8V5.5M9.5 12.5v2M14.5 12.5v2M2 12.5v3M22 12.5v3"/>'),
  school: '<path d="M12 3.5L1.5 8.8 12 14l10.5-5.2z"/>' + G('<path d="M6 11.3v4.5c0 1.6 2.7 3.2 6 3.2s6-1.6 6-3.2v-4.5M21.5 9v5.5"/>'),
  check: G('<path stroke-width="3" d="M5 12.5l4.5 4.5L19 7.5"/>'),
  chevron: G('<path stroke-width="2.4" d="M6 9l6 6 6-6"/>'),
  search: G('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
  home: G('<path d="M4 11l8-7 8 7v9h-5v-5h-6v5H4z"/>'),
  cards: G('<rect x="5" y="3" width="11" height="16" rx="2"/><path d="M19 6v13a2 2 0 0 1-2 2H8"/>'),
  battle: G('<path d="M5 5l10 10M19 5L9 15M13 17l4-4M11 17l-4-4M16 16l3 3M8 16l-3 3"/>'),
  rules: G('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7M8 11h5"/>'),
}).map(([k, d]) => [k, `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`]));

// A Character move, Pokemon style: Action pips, name, power (or "Ability"), effect text underneath.
const renderMove = (mv, bonus = 0) => `<div class="move"><div class="mv-top"><span class="mv-cost">${ICON.action.repeat(mv.cost)}</span><b>${mv.name}</b>${mv.ability
  ? '<span class="mv-tag">Ability</span>' : `<span class="mv-pow${bonus > 0 ? ' buff' : ''}">${mv.power + bonus}</span>`}</div>${mv.text ? `<div class="mv-text">${mv.text}</div>` : ''}</div>`;

// c = card data (null = face-down). o: { cls, hp, def, bonus (live values; buffs show green), turns, style, attrs }
function renderCard(c, o = {}) {
  const cls = o.cls ? ' ' + o.cls : '', style = (o.style ? ` style="${o.style}"` : '') + (o.attrs ? ' ' + o.attrs : '');
  if (!c) return `<div class="card back${cls}"${style}><div class="frame"></div></div>`;
  const kind = kindOf(c), hp = o.hp ?? c.hp, turns = o.turns ?? c.dur, def = o.def ?? c.def;
  const art = c.art ? `<img src="${c.art}" alt="">` : `<span class="ph">${ICON[c.type]}</span>`;
  const isChar = c.type === 'character';
  const body = isChar
    ? `${c.text ? `<div class="text passive">${c.text}</div>` : ''}<div class="moves">${c.moves.map(mv => renderMove(mv, o.bonus)).join('')}</div>`
    : `<div class="text">${c.text}</div>`;
  const foot = isChar
    ? `<div class="stats"><span class="st def${def > c.def ? ' buff' : ''}">${ICON.def}<i>DEF</i><b>${def}</b></span><span class="st hp${hp < c.hp ? ' hurt' : ''}">${ICON.hp}<i>HP</i><b>${hp}</b></span></div>`
    : `<div class="tag">${c.type === 'bit' ? `${ICON.time}${turns} turn${turns > 1 ? 's' : ''}` : c.type === 'evil' ? `${ICON.forever}Forever` : `${ICON.captain}${c.style}`}</div>`;
  return `<div class="card k-${kind}${cls}"${style} data-id="${c.id}"><div class="frame">
    <div class="head"><span class="name">${c.name}</span><span class="type">${ICON[kind]}</span></div>
    <div class="art">${art}</div>
    ${body}
    ${foot}
    <div class="foot"><span>${LABEL[kind]}</span><span>TISM ${c.no}</span></div>
  </div></div>`;
}

const renderAvatar = (c, cls = '') => `<span class="avatar${cls}">${c.art ? `<img src="${c.art}" alt="">` : ICON.captain}</span>`;
const coins = n => `<div class="coins" title="Points ${n}/5">${Array.from({ length: 5 }, (_, i) => `<span class="${i < n ? 'on' : ''}">${ICON.point}</span>`).join('')}</div>`;
const meter = (k, v) => `<div class="meter ${k}"><span>${ICON[k]}${k === 'goof' ? 'Goofiness' : 'Boredom'}</span><b>${v}/5</b>
  <div class="mbar">${Array.from({ length: 5 }, (_, i) => `<i class="${i < v ? 'on' : ''}"></i>`).join('')}</div></div>`;

// Clickable bits carry data-act="card" + who/zone/i; the app reads them with one delegated click handler.
const pick = (who, zone, i) => `data-act="card" data-who="${who}" data-zone="${zone}" data-i="${i}" tabindex="0" role="button"`;

// Player area: their Captain card (tap: read it / use its ability) and a meter panel (tap: log and manual tools).
function renderHud(p, who = 'me') {
  return `<div class="hud">${renderCard(CARD[p.captain], { cls: 'cap', attrs: pick(who, 'cap', 0) })}
    <div class="meters neu" data-act="sheet" data-s="adjust" tabindex="0" role="button" aria-label="${esc(p.name)}: meters, log and manual tools">
      <div class="m-top"><b>${esc(p.name)}</b>${coins(p.points)}</div>${meter('goof', p.goof)}${meter('bore', p.bore)}</div></div>`;
}

// stat(f) -> { def, bonus } with modifiers applied (game.js statsOf); omitted in the mockups.
function renderField(p, glow = [], who = 'me', stat) {
  const cards = p.field.map((f, i) => renderCard(CARD[f.id], { hp: f.hp, ...stat?.(f), cls: 'mini' + (glow.includes(i) ? ' glow' : ''), attrs: pick(who, 'field', i) })).join('');
  return `<div class="field">${cards}${'<div class="slot"></div>'.repeat(Math.max(0, 3 - p.field.length))}</div>`;
}

// Active Bits/Evils: a pool of small readable cards (desktop); on phones an "Effects" button opens them in a sheet.
const renderFx = (p, who = 'me') => `<div class="effects">${p.effects.length ? `<button class="fx-open" data-act="sheet" data-s="fx:${who}">${ICON.bit}Effects<b>${p.effects.length}</b></button>` : ''}
  <div class="fx-pool">${p.effects.map((e, i) => renderCard(CARD[e.id], { cls: 'mini fxc', turns: e.turns, attrs: pick(who, 'fx', i) })).join('')}</div></div>`;

function renderHand(ids, sel) {
  const mid = (ids.length - 1) / 2;
  return `<div class="hand" style="--n:${ids.length}">${ids.map((id, i) => renderCard(CARD[id], {
    cls: 'mini' + (i === sel ? ' sel' : ''), style: `--r:${(i - mid) * 5}deg;--y:${Math.abs(i - mid) * 5}px`, attrs: pick('me', 'hand', i),
  })).join('')}</div>`;
}

// s = game state, me = my player index. o: { glow: [my field indexes], sel: hand index }
function renderBoard(s, me, o = {}) {
  const you = s.players[me], opp = s.players[1 - me], live = s.turn === me && s.phase === 'play';
  const stat = pi => (typeof statsOf === 'function' ? f => statsOf(s, pi, f) : undefined);
  return `<div class="board">
    <div class="opp-hand">${renderCard(null).repeat(opp.hand.length)}</div>
    <div class="side">${renderHud(opp, 'opp')}${renderFx(opp, 'opp')}${renderField(opp, [], 'opp', stat(1 - me))}</div>
    <div class="mid neu">
      <div class="pile">${renderCard(null)}<span>${you.deck.length}</span></div>
      <div class="turn"><b>${s.turn === me ? 'Your turn' : `${esc(opp.name)}'s turn`}</b>
        <div class="pips">${Array.from({ length: Math.max(2, s.actions) }, (_, i) => `<i class="${i < s.actions ? 'on' : ''}">${ICON.action}</i>`).join('')}</div></div>
      <button class="btn end" data-act="end"${live ? '' : ' disabled'}>End Turn</button>
    </div>
    <div class="side">${renderField(you, o.glow, 'me', stat(me))}${renderFx(you)}${renderHud(you, 'me')}</div>
    ${renderHand(you.hand, o.sel)}
  </div>`;
}
