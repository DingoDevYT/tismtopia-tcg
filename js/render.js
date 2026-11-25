// Render helpers shared by the mockups and the game. Each returns an HTML string.
const esc = s => String(s).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
const LABEL = { captain: 'Captain', character: 'Character', main: 'Main Character', bit: 'Item', evil: 'Evil' };
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
  goof: '<g transform="scale(3.8772) translate(-1.75 -1.96)"><path d="M6.439 5.763c.094.151.32.188.405.031a.724.724 0 0 0 .058-.16c.058-.226-.01-.54-.144-1.167l-.013-.063-.016-.083a.28.28 0 0 1 .066-.223l.05-.052.89-.89a.7.7 0 0 0-.99-.991l-.89.89-.052.05a.28.28 0 0 1-.225.066l-.081-.016-.063-.012c-.627-.135-.94-.202-1.167-.144a.7.7 0 0 0-.159.057c-.158.084-.121.313.031.407.308.192.74.512 1.264 1.036s.844.955 1.036 1.264M2.9 6.666a.28.28 0 0 0 .262.072c.279-.067.432-.089.53-.01a.3.3 0 0 1 .045.045c.073.09.06.228.005.467-.012.051-.018.077-.02.1a.3.3 0 0 0 .057.2c.014.018.031.036.066.07.359.36.539.54.7.543.027.001.04 0 .067-.004.158-.023.352-.273.74-.77a4 4 0 0 1 .396-.436l.155-.149c.068-.064.067-.172.038-.261l-.001-.004-.001-.001-.002-.005-.026-.06a3 3 0 0 0-.152-.278c-.157-.253-.438-.636-.923-1.12-.484-.485-.868-.766-1.12-.923a2.6 2.6 0 0 0-.338-.178l-.005-.002h-.002V3.96L3.37 3.96l-.012-.004c-.083-.03-.183-.031-.244.032l-.155.164a4 4 0 0 1-.437.396c-.497.387-.746.582-.77.74a.3.3 0 0 0-.004.067.36.36 0 0 0 .072.187c.095.142.143.213.241.245l.043.01c.102.018.201-.036.4-.143.224-.12.362-.168.448-.13.069.03.124.085.154.154.047.108-.044.305-.246.651a.28.28 0 0 0 .042.337"/></g>', // Creativity: paintbrush (Game Icon Pack, art/icons/paintbrush.svg)
  bore: '<g transform="scale(3.9933) translate(-1.99 -2)"><path d="M5 5.704a2.95 2.95 0 0 1 1.906.701l.031.03.013.013h.001l.001.001.001.001.064.08a.5.5 0 0 1-.692.69l-.076-.06-.002-.001v-.001l-.008-.006q-.017-.016-.057-.047a1.947 1.947 0 0 0-2.42.047l-.01.005a.5.5 0 1 1-.705-.707l.002-.001.014-.014.031-.03q.04-.035.107-.088A2.947 2.947 0 0 1 5 5.705M3.753 7.158zh-.001zm-.23-4.344a.4.4 0 0 1 .567.566l-.155.155c-.12.12-.18.18-.185.253v.032c.006.073.066.133.185.253l.155.155a.401.401 0 0 1-.566.566l-.155-.155c-.12-.12-.18-.18-.253-.185h-.032c-.073.006-.133.065-.253.185l-.155.155a.401.401 0 0 1-.566-.566l.155-.155c.12-.12.18-.18.185-.253v-.032c-.006-.073-.065-.133-.185-.253L2.11 3.38a.4.4 0 0 1 .566-.566l.155.155c.12.12.18.18.253.185h.032c.073-.006.133-.066.253-.185zm3.8 0a.401.401 0 0 1 .567.566l-.155.155c-.12.12-.18.18-.185.253v.032c.006.073.065.133.185.253l.155.155a.4.4 0 0 1-.566.566l-.155-.155c-.12-.12-.18-.18-.253-.185h-.032c-.073.006-.133.065-.253.185l-.155.155a.4.4 0 0 1-.566-.566l.155-.155c.12-.12.18-.18.185-.253v-.032c-.006-.073-.066-.133-.185-.253L5.91 3.38a.401.401 0 0 1 .566-.566l.155.155c.12.12.18.18.253.185h.032c.073-.006.133-.066.253-.185z"/></g>', // Boredom: X-eyes face (Game Icon Pack, art/icons/emoji-17.svg)
  point: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zm0 4.5l1.7 3.5 3.8.5-2.8 2.7.7 3.8L12 15.2 8.6 17l.7-3.8-2.8-2.7 3.8-.5z"/>',
  action: '<path d="M13.5 2L4.5 13.5h6.2L9.5 22l9-11.5h-6.2z"/>',
  time: '<path d="M6 2h12v2.2c0 3-2.4 5.1-4.4 7.8 2 2.7 4.4 4.8 4.4 7.8V22H6v-2.2c0-3 2.4-5.1 4.4-7.8C8.4 9.3 6 7.2 6 4.2z"/>',
  uses: '<circle cx="5" cy="12" r="3"/><circle cx="12" cy="12" r="3"/><circle cx="19" cy="12" r="3"/>', // Items with uses: three pips
  forever: G('<path stroke-width="2.6" d="M12 12c-2-2.6-3.6-4-5.6-4a4 4 0 0 0 0 8c2 0 3.6-1.4 5.6-4s3.6-4 5.6-4a4 4 0 0 1 0 8c-2 0-3.6-1.4-5.6-4z"/>'),
  // rules and battle feedback
  super: '<path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20zM13.5 5.5l-5 8H12l-1 5 5-8h-3.5z"/>',
  instant: G('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>'),
  spill: G('<path d="M5 4v6a4 4 0 0 0 4 4h9M14 9.5l4.5 4.5-4.5 4.5"/>'),
  draw: G('<rect x="4" y="3" width="10" height="14" rx="2"/><path d="M18 8v10M15 15.5l3 3 3-3"/>'),
  block: G('<path d="M12 3l7.5 2.8v5.7c0 4.6-3.2 8.2-7.5 9.3-4.3-1.1-7.5-4.7-7.5-9.3V5.8z"/><path d="M9 12l2.2 2.2L15.5 10"/>'),
  turn: G('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
  // ui
  bot:'<circle cx="12" cy="3.6" r="1.7"/>' + G('<rect x="4" y="8" width="16" height="11.5" rx="3.5"/><path d="M12 8V5.5M9.5 12.5v2M14.5 12.5v2M2 12.5v3M22 12.5v3"/>'),
  school: '<path d="M12 3.5L1.5 8.8 12 14l10.5-5.2z"/>' + G('<path d="M6 11.3v4.5c0 1.6 2.7 3.2 6 3.2s6-1.6 6-3.2v-4.5M21.5 9v5.5"/>'),
  check: G('<path stroke-width="3" d="M5 12.5l4.5 4.5L19 7.5"/>'),
  chevron: G('<path stroke-width="2.4" d="M6 9l6 6 6-6"/>'),
  search: G('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
  cart: G('<path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H6.6"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>'),
  home: G('<path d="M4 11l8-7 8 7v9h-5v-5h-6v5H4z"/>'),
  cards: G('<rect x="5" y="3" width="11" height="16" rx="2"/><path d="M19 6v13a2 2 0 0 1-2 2H8"/>'),
  battle: G('<path d="M5 5l10 10M19 5L9 15M13 17l4-4M11 17l-4-4M16 16l3 3M8 16l-3 3"/>'),
  rules: G('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7M8 11h5"/>'),
  moon: G('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/>'),
  sun: G('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>'),
}).map(([k, d]) => [k, `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`]));
// Social tab: Game Icon Pack "user-group" (from review/icons, see its README), inlined with its own viewBox.
ICON.people = '<svg class="i" viewBox="1.10 1.17 7.76 7.76" aria-hidden="true"><path d="M6.206 5.593c.092.017.145.06.25.144.566.455.603 1.118.603 1.227 0 .166-.167.83-2.08.83-1.912 0-2.079-.664-2.079-.83 0-.109.036-.772.602-1.227.105-.084.158-.127.25-.144l.04-.005c.093-.007.205.04.427.138a1.9 1.9 0 0 0 1.52 0c.222-.097.334-.145.427-.138zm-4.214-.505c.093-.007.204.041.426.138l.078.034c.136.063.165.165.083.29l-.045.066a2.5 2.5 0 0 0-.433 1.348c0 .114-.099.214-.208.182-.71-.205-.792-.566-.792-.682 0-.109.035-.772.601-1.227.105-.084.158-.127.25-.144zm6.014.005c.092.017.145.06.25.144.566.455.602 1.118.602 1.227 0 .117-.083.477-.794.682-.109.032-.206-.068-.206-.182l-.004-.106a2.53 2.53 0 0 0-.431-1.242l-.044-.065c-.083-.126-.054-.228.083-.291l.077-.034c.222-.097.334-.145.427-.138zM4.979 2.8c.623 0 1.129.488 1.16 1.102q.003-.02.005-.039-.002.026-.003.05.002.026.003.05A1.164 1.164 0 1 1 4.979 2.8m-1.8-.5c.122 0 .183 0 .239.048.035.03.064.082.07.128.008.073-.044.152-.15.31a1.95 1.95 0 0 0-.313 1.282c.029.27.043.404-.039.472a.2.2 0 0 1-.036.024c-.095.05-.174.005-.333-.083A1.161 1.161 0 0 1 3.18 2.3m3.6 0a1.164 1.164 0 0 1 .562 2.182c-.159.088-.239.131-.333.082a.2.2 0 0 1-.036-.024c-.082-.068-.068-.203-.04-.472q.012-.101.011-.205c0-.398-.119-.768-.323-1.077-.105-.158-.157-.237-.148-.31a.22.22 0 0 1 .068-.128c.056-.048.117-.048.24-.048"/></svg>';

// Art crop is a focus point (x, y in %) plus zoom (>= 1), applied with CSS so the original image stays untouched.
const cropStyle = cr => {
  if (!cr) return '';
  const num = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+v) ? +v : d)); // 0 is a valid edge, so no `|| default`
  const x = num(cr.x, 50, 0, 100), y = num(cr.y, 50, 0, 100), z = num(cr.zoom, 1, 1, 4);
  return ` style="object-position:${x}% ${y}%;transform:scale(${z});transform-origin:${x}% ${y}%"`;
};

// A Character move, Pokemon style: Action pips, name, power (or "Ability"), effect text underneath.
const renderMove = (mv, bonus = 0) => `<div class="move"><div class="mv-top"><span class="mv-cost">${mv.cost ? ICON.action.repeat(mv.cost) : '<em>Free</em>'}</span><b>${mv.name}</b>${mv.ability
  ? '<span class="mv-tag">Ability</span>' : `<span class="mv-pow${bonus > 0 ? ' buff' : ''}" title="Damage">${mv.power + bonus}</span>`}</div>${mv.text ? `<div class="mv-text">${mv.text}</div>` : ''}</div>`;

// c = card data (null = face-down). o: { cls, hp, def, bonus (live values; buffs show green), turns, style, attrs }
// Character cards take their art's main colour: averaged once per image (saturated pixels count most), then cached.
const TONE = {};
const hsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0]; const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [Math.round(h * 60 + 360) % 360, Math.round(100 * d / (1 - Math.abs(2 * l - 1)))]; };
function tone(img) {
  const src = img.getAttribute('src');
  toneOf(img, src);
  if (TONE[src]) img.closest('.frame')?.setAttribute('style', TONE[src]);
}
function toneOf(img, src) {
  if (!(src in TONE)) {
    try {
      const cv = document.createElement('canvas'), x = cv.getContext('2d'); cv.width = cv.height = 24;
      x.drawImage(img, 0, 0, 24, 24);
      const d = x.getImageData(0, 0, 24, 24).data; let r = 0, g = 0, b = 0, w = 0;
      for (let i = 0; i < d.length; i += 4) { const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), k = (mx ? (mx - mn) / mx : 0) ** 2 * (mx / 255) * (d[i + 3] / 255) + 0.002; r += d[i] * k; g += d[i + 1] * k; b += d[i + 2] * k; w += k; }
      const [h, s] = hsl(r / w, g / w, b / w), S = Math.max(40, Math.min(80, s));
      TONE[src] = s < 10 ? '' : `--frame:linear-gradient(180deg,hsl(${h} ${S}% 82%),hsl(${h} ${S}% 52%));--tint:hsl(${h} ${S}% 30%)`; // grey art keeps the default blue
    } catch { TONE[src] = ''; }
  }
}

// A name's width in em at the card font (canvas, cached once fonts are in) so CSS can shrink long names to fit one line (--nem).
const NAME_EM = {}; let nameCtx;
const nameEm = s => {
  if (NAME_EM[s]) return NAME_EM[s];
  try { nameCtx ||= document.createElement('canvas').getContext('2d'); nameCtx.font = '900 100px "M PLUS Rounded 1c", system-ui, sans-serif'; const w = +(nameCtx.measureText(s).width / 100).toFixed(3); if (document.fonts?.status === 'loaded') NAME_EM[s] = w; return w; }
  catch { return +(s.length * .55).toFixed(2); }
};

function renderCard(c, o = {}) {
  const cls = o.cls ? ' ' + o.cls : '', style = (o.style ? ` style="${o.style}"` : '') + (o.attrs ? ' ' + o.attrs : '');
  if (!c) return `<div class="card back${cls}"${style}><div class="frame"></div></div>`;
  const kind = kindOf(c), isCh = c.type === 'character', hp = o.hp ?? (isCh ? maxHp(c) : c.hp), turns = o.turns ?? c.dur, uses = o.uses ?? c.uses, def = o.def ?? (isCh ? baseArmor(c) : c.def);
  // Art: art/local/ on the owner's PC, decrypted from assets/ for members elsewhere (js/assets.js); until it's there the placeholder underneath shows.
  // Rainbow cards swap in the repainted art from js/rainbow.js: the cached result straight away, else processed on load (pages without it show the plain art).
  const rbw = /\bv-rainbow\b/.test(cls), rbOn = rbw && typeof RB !== 'undefined', rbUrl = rbOn && RB[c.art];
  const art = `<span class="ph">${ICON[c.type]}</span>${c.art ? `<img ${assetSrc(rbUrl || c.art)} alt="" onerror="this.remove()"${rbOn ? ` data-art="${c.art}"${rbUrl ? ' data-rb="1"' : ' onload="rainbowize(this)"'}` : c.type === 'character' && !c.main ? ' onload="tone(this)"' : ''}${cropStyle(/\bv-full\b/.test(cls) ? c.cropFull : c.crop)}>` : ''}`; // full art has its own crop (cropFull; none = cover)
  // Core numbers sit in one-size chips down the top right: the cost chip ends the title bar, HP (heart) and DEF (shield) stack under it on the art.
  const isChar = c.type === 'character';
  const hpTag = isChar ? `<span class="hp chip${hp < maxHp(c) ? ' hurt' : ''}" title="HP">${ICON.hp}${hp}</span>` : '';
  const defTag = isChar ? `<span class="defb chip${def > baseArmor(c) ? ' buff' : ''}" title="Armour: damage blocked per hit">${ICON.def}<b>${def}</b></span>` : '';
  const chips = isChar ? `<div class="chipstack">${hpTag}${defTag}</div>` : '';
  const body = isChar
    ? `${c.text ? `<div class="text passive">${c.text}</div>` : ''}<div class="moves">${c.moves.map(mv => renderMove(mv, o.bonus)).join('')}</div>`
    : `<div class="text">${c.text}</div><div class="tag">${c.type === 'bit' ? (isInstant(c) ? `${ICON.instant}Instant` : uses ? `${ICON.uses}${uses} use${uses > 1 ? 's' : ''}` : `${ICON.time}${turns} turn${turns > 1 ? 's' : ''}`) : c.type === 'evil' ? `${ICON.forever}Forever` : `${ICON.captain}${c.style}`}</div>`;
  const tv = c.type === 'character' && !c.main && TONE[assetUrl(c.art)]; // tone() keys by the src it loaded from
  // Foil finishes use the holo effect layers (vendor/holo/holo.css): v-holo = rare holo, v-rev = reverse holo, v-full = full-art ultra rare.
  const fin = /\bv-full\b/.test(cls) ? ' data-rarity="rare ultra" data-supertype="pokémon"' : /\bv-rev\b/.test(cls) ? ' data-rarity="reverse holo"' : /\bv-holo\b/.test(cls) ? ' data-rarity="rare holo"' : '';
  const layers = fin ? '<div class="holo__shine"></div><div class="holo__glare"></div>' : '';
  return `<div class="card k-${kind}${cls}${fin ? (/rare ultra/.test(fin) ? ' holo masked' : ' holo') : ''}"${style}${fin} data-id="${c.id}"><div class="frame"${tv ? ` style="${tv}"` : ''}>
    <div class="head"><span class="name" style="--nem:${nameEm(c.name)}">${c.name}</span>${c.type !== 'captain' ? `<span class="pc chip" title="Actions to play">${(c.cost ?? 1) ? `${ICON.action}<b>${c.cost ?? 1}</b>` : '<b class="free">FREE</b>'}</span>` : ''}<span class="type">${ICON[kind]}</span></div>
    <div class="art">${art}${/rare holo"/.test(fin) ? layers : ''}${chips}</div>
    ${body}
    <div class="foot"><span>${c.artist ? `OC: ${c.artist}` : c.role || LABEL[kind]}</span><span>TISM ${c.no}</span></div>${/rare holo"/.test(fin) ? '' : layers}
  </div></div>`;
}

const renderAvatar = (c, cls = '') => `<span class="avatar${cls}">${ICON.captain}${c.art ? `<img ${assetSrc(c.art)} alt="" onerror="this.remove()">` : ''}</span>`;
// Boredom is health (lose at BORE_MAX); Creativity fills up to the Captain's Super cost, so a full bar means the Super is ready.
// The Super notch lights up once you can afford it; Boredom turns to warning colours 3 from the end.
const meter = (k, v, max, sup) => `<div class="meter ${k}${k === 'bore' && v >= max - 3 ? ' warn' : ''}"><span title="${k === 'goof' ? 'Creativity' : 'Boredom'}" aria-label="${k === 'goof' ? 'Creativity' : 'Boredom'}">${ICON[k]}</span><b>${v}/${max}</b>
  <div class="mbar"><i style="width:${Math.min(100, 100 * v / max)}%"></i>${sup ? `<u${v >= sup ? ' class="lit"' : ''} style="left:${100 * sup / max}%" title="Super: ${sup}"></u>` : ''}</div></div>`;

// Clickable bits carry data-act="card" + who/zone/i; the app reads them with one delegated click handler.
const pick = (who, zone, i) => `data-act="card" data-who="${who}" data-zone="${zone}" data-i="${i}" tabindex="0" role="button"`;

// Player area: their Captain card (tap: read it / use its ability) and a meter panel (tap: log and manual tools).
// ready: your Super can be used right now, so a glowing SUPER button sits on the card (it opens the confirm popup).
function renderHud(p, who = 'me', ready = false) {
  const cap = renderCard(CARD[p.captain], { cls: 'cap' + (ready ? ' cap-ready' : ''), attrs: pick(who, 'cap', 0) });
  return `<div class="hud">${ready ? `${cap.slice(0, -6)}<button class="super-btn" data-act="super" aria-label="Use ${esc(CARD[p.captain].name)}'s Super">${ICON.super}<span>SUPER</span></button></div>` : cap}
    <div class="meters neu" data-act="sheet" data-s="adjust" tabindex="0" role="button" aria-label="${esc(p.name)}: meters, log and manual tools">
      <div class="m-top">${p.pfp && typeof pfpAvatar === 'function' ? `<span class="tagav">${pfpAvatar(p.pfp, ' tag')}</span>` : ''}<b>${esc(p.name)}</b>${p.bank ? `<span class="bank" title="Actions saved for next turn">${ICON.action}${p.bank}</span>` : ''}${CARD[p.captain].goof <= p.goof ? '<span class="ready">Super ready</span>' : ''}</div>${meter('goof', p.goof, CARD[p.captain].goof || 10)}${meter('bore', p.bore, BORE_MAX)}</div></div>`;
}

// stat(f) -> { def, bonus } with modifiers applied (game.js statsOf); omitted in the mockups.
// A player's finish for a card in battle (holo / reverse / full art), from the finishes sent with their deck.
const finCls = (p, id) => { const f = p?.fin?.[id]; return f && typeof FINISH_CLS !== 'undefined' && FINISH_CLS[f] ? ' ' + FINISH_CLS[f] : ''; };
const finCard = (p, id) => (p?.fin?.[id] === 'full' ? { ...CARD[id], crop: null } : CARD[id]);
function renderField(p, glow = [], who = 'me', stat) {
  const cards = p.field.map((f, i) => renderCard(finCard(p, f.id), { hp: f.hp, ...stat?.(f), cls: 'mini' + finCls(p, f.id) + (glow.includes(i) ? ' glow' : ''), attrs: pick(who, 'field', i) })).join('');
  return `<div class="field">${cards}${'<div class="slot"></div>'.repeat(Math.max(0, 3 - p.field.length))}</div>`;
}

// Active Items/Evils: a pool of small readable cards (desktop); on phones an "Effects" button opens them in a sheet.
const renderFx = (p, who = 'me') => `<div class="effects">${p.effects.length ? `<button class="fx-open" data-act="sheet" data-s="fx:${who}">${ICON.bit}Effects<b>${p.effects.length}</b></button>` : ''}
  <div class="fx-pool">${p.effects.map((e, i) => renderCard(CARD[e.id], { cls: 'mini fxc', turns: e.turns, uses: e.uses, attrs: pick(who, 'fx', i) })).join('')}</div></div>`;

function renderHand(ids, sel, p) {
  const mid = (ids.length - 1) / 2;
  return `<div class="hand" style="--n:${ids.length}">${ids.map((id, i) => renderCard(finCard(p, id), {
    cls: 'mini' + finCls(p, id) + (i === sel ? ' sel' : ''), style: `--r:${(i - mid) * 5}deg;--y:${Math.abs(i - mid) * 5}px`, attrs: pick('me', 'hand', i),
  })).join('')}</div>`;
}

// s = game state, me = my player index. o: { glow: [my field indexes], sel: hand index, superReady: show the SUPER button on your Captain }
function renderBoard(s, me, o = {}) {
  const you = s.players[me], opp = s.players[1 - me], live = s.turn === me && s.phase === 'play';
  const stat = pi => (typeof statsOf === 'function' ? f => statsOf(s, pi, f) : undefined);
  return `<div class="board">
    <div class="opp-hand">${renderCard(null).repeat(opp.hand.length)}</div>
    <div class="side">${renderHud(opp, 'opp')}${renderFx(opp, 'opp')}${renderField(opp, [], 'opp', stat(1 - me))}</div>
    <div class="mid neu">
      <div class="deckn" role="img" aria-label="${you.deck.length} cards left in your deck">${ICON.cards}<b>${you.deck.length}</b></div>
      <div class="turn${s.turn === me ? '' : ' theirs'}"><b>${s.turn === me ? 'Your turn' : `${esc(opp.name)}'s turn`}</b>
        <div class="pips">${Array.from({ length: Math.max(2, s.actions) }, (_, i) => `<i class="${i < s.actions ? 'on' : ''}">${ICON.action}</i>`).join('')}</div></div>
      <button class="btn end" data-act="end"${live ? '' : ' disabled'}>End Turn</button>
    </div>
    <div class="side">${renderField(you, o.glow, 'me', stat(me))}${renderFx(you)}${renderHud(you, 'me', !!o.superReady)}</div>
    ${renderHand(you.hand, o.sel, you)}
  </div>`;
}

// Preload every card's art, the pack images and the foil textures at start-up so nothing pops in later;
// each art's frame colour is worked out as it arrives, so frames are already tinted on first draw.
const PRELOAD = (() => {
  const arts = [...new Set([...CAPTAINS, ...CARDS].map(c => c.art).filter(Boolean))];
  const extra = ['art/logo.png', 'art/card-back.jpg', ...['heehn', 'empirical', 'foreseen'].map(id => 'art/local/pack-' + id + '.png'),
    ...['illusion.png', 'glitter.png', 'grain.webp', 'galaxy.jpg', 'cosmos-bottom.png', 'cosmos-middle-trans.png', 'cosmos-top-trans.png'].map(f => 'vendor/holo/img/' + f)];
  return [...arts, ...extra].map(src => { const i = new Image(); i.decoding = 'async'; if (arts.includes(src)) i.onload = () => toneOf(i, src); const u = assetUrl(src, true); if (u) i.src = u; return i; }); // locked: queues the decryption instead
})();
// Locked (js/assets.js): each art's frame colour is worked out as it's decrypted instead (rainbow cards never run tone()).
if (typeof addEventListener === 'function') addEventListener('asset', e => { if (!e.detail.startsWith('art/')) return; const u = assetUrl(e.detail), i = new Image(); i.onload = () => toneOf(i, u); i.src = u; });
