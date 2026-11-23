// Render helpers shared by the mockups and the game. Each returns an HTML string.
const CARD = Object.fromEntries([...CAPTAINS, ...CARDS].map(c => [c.id, c]));
const esc = s => String(s).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const TYPE = { captain: 'Captain', character: 'Character', bit: 'Bit', evil: 'Evil' };

const ICON = Object.fromEntries(Object.entries({
  home: '<path d="M4 11l8-7 8 7v9h-5v-5h-6v5H4z"/>',
  cards: '<rect x="5" y="3" width="11" height="16" rx="2"/><path d="M19 6v13a2 2 0 0 1-2 2H8"/>',
  battle: '<path d="M5 5l10 10M19 5L9 15M13 17l4-4M11 17l-4-4M16 16l3 3M8 16l-3 3"/>',
  rules: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7M8 11h5"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
}).map(([k, d]) => [k, `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`]));

// c = card data (null = face-down). o: { cls, hp, turns, style }
function renderCard(c, o = {}) {
  const cls = o.cls ? ' ' + o.cls : '', style = o.style ? ` style="${o.style}"` : '';
  if (!c) return `<div class="card back${cls}"${style}><div class="frame"><b>T</b></div></div>`;
  const art = /\.(png|jpe?g|webp|gif|svg)$/i.test(c.art) ? `<img src="${c.art}" alt="">` : c.art;
  const turns = o.turns ?? c.dur;
  const foot = c.type === 'character'
    ? `<div class="stats"><span class="st atk"><i>ATK</i>${c.atk}</span><span class="st def"><i>DEF</i>${c.def}</span><span class="st hp${o.hp < c.hp ? ' hurt' : ''}"><i>HP</i>${o.hp ?? c.hp}</span></div>`
    : `<div class="badge">${c.type === 'bit' ? `⏱ ${turns} turn${turns > 1 ? 's' : ''}` : c.type === 'evil' ? '∞ Forever' : c.style}</div>`;
  return `<div class="card k-${c.main ? 'main' : c.type}${cls}"${style} data-id="${c.id}"><div class="frame">
    <span class="ribbon">${c.main ? '★ Main Character' : TYPE[c.type]}</span>
    <div class="art">${art}</div>
    <div class="body"><div class="name">${c.name}</div><div class="text">${c.text}</div>${foot}</div>
  </div></div>`;
}

const dots = (n, max = 5) => Array.from({ length: max }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
const meter = (k, v) => `<div class="meter ${k}" title="${k === 'goof' ? 'Goofiness' : 'Boredom'} ${v}/5"><span>${k === 'goof' ? '😂' : '😴'}</span>${dots(v)}</div>`;

function renderHud(p) {
  const cap = CARD[p.captain];
  return `<div class="hud neu"><div class="avatar">${cap.art}</div>
    <div class="who"><b>${esc(p.name)}</b><small>${cap.name}</small></div>
    <div class="meters"><div class="pts" title="Points ${p.points}/5">${dots(p.points)}</div>${meter('goof', p.goof)}${meter('bore', p.bore)}</div></div>`;
}

function renderField(p, glow = []) {
  const cards = p.field.map((f, i) => renderCard(CARD[f.id], { hp: f.hp, cls: 'mini' + (glow.includes(i) ? ' glow' : '') })).join('');
  return `<div class="field">${cards}${'<div class="slot"></div>'.repeat(Math.max(0, 3 - p.field.length))}</div>`;
}

const renderFx = p => `<div class="effects">${p.effects.map(e => {
  const c = CARD[e.id];
  return `<span class="fx ${c.type}">${c.art} ${c.name}${c.type === 'bit' ? ` · ${e.turns}` : ''}</span>`;
}).join('')}</div>`;

function renderHand(ids, sel) {
  const mid = (ids.length - 1) / 2;
  return `<div class="hand">${ids.map((id, i) => renderCard(CARD[id], {
    cls: 'mini' + (i === sel ? ' sel' : ''), style: `--r:${(i - mid) * 6}deg;--y:${Math.abs(i - mid) * 6}px`,
  })).join('')}</div>`;
}

// s = game state, me = my player index. o: { glow: [my field indexes], sel: hand index }
function renderBoard(s, me, o = {}) {
  const you = s.players[me], opp = s.players[1 - me];
  return `<div class="board">
    <div class="opp-hand">${renderCard(null).repeat(opp.hand.length)}</div>
    <div class="side">${renderHud(opp)}${renderFx(opp)}${renderField(opp)}</div>
    <div class="mid neu">
      <div class="pile">${renderCard(null)}<span>${you.deck.length}</span></div>
      <div class="turn"><b>${s.turn === me ? 'Your turn' : `${esc(opp.name)}'s turn`}</b>
        <div class="pips">${Array.from({ length: Math.max(2, s.actions) }, (_, i) => `<i class="${i < s.actions ? 'on' : ''}">⚡</i>`).join('')}</div></div>
      <button class="btn end"${s.turn === me ? '' : ' disabled'}>End Turn</button>
    </div>
    <div class="side">${renderField(you, o.glow)}${renderFx(you)}${renderHud(you)}</div>
    ${renderHand(you.hand, o.sel)}
  </div>`;
}
