// Card submissions: the safe effect menu, the card built from a submit form, a rough power score, and the .tismcard.json format.
// No screen code here, so the owner's editor.html can load and check submitted files too. Everything a player typed is untrusted:
// cfClean() clamps it, cfBuild() turns only menu choices into effects (never code), and cfSafe() escapes text before renderCard() shows it.
const CF_TRIG = { '': 'None', play: 'When played', hit: 'On a hit', turn: 'Start of your turn', passive: 'Passive (always on)' };
const CF_EFF = {
  goof: ['Gain Creativity', n => ['goof', 'me', n]],
  bore: ['Opponent +Boredom', n => ['bore', 'opp', n]],
  calm: ['Your Boredom −', n => ['bore', 'me', -n]],
  draw: ['Draw cards', n => ['draw', 'me', n]],
  act: ['+Actions', n => ['actions', 'me', n]],
  heal: ['Heal self', n => ['hp', 'self', -n]], // game.js 'hp': positive n = damage, negative = heal

  dmg: ['Extra damage to the blocker', n => ['hp', 'target', n]],
  atk: ['Your attacks +power', n => ({ atk: n })],
  def: ['Your Characters +DEF', n => ({ def: n })],
  tax: ["Opponent's attacks cost more", n => ({ oppAttackCost: n })],
};
const CF_BASIC = ['goof', 'bore', 'calm', 'draw', 'act'];
// Effects each slot offers: a passive by its trigger, an attack's on-hit effect, an ability move.
const CF_OK = { play: CF_BASIC, turn: CF_BASIC, hit: [...CF_BASIC, 'heal'], passive: ['atk', 'def', 'tax'], onHit: [...CF_BASIC, 'heal', 'dmg'], ability: [...CF_BASIC, 'heal'] };
const CF_FINS = ['holo', 'rev', 'full', 'rainbow'];
const CF_BG = ['glow', 'rays', 'stars', 'dots', 'sky', 'flames', 'grid', 'plain']; // background templates, drawn in art-tools.js
// Items are Instant (when played) or last a few turns (start of your turn / passive); Evils always last.
const cfTrigs = (type, dur) => (type === 'character' ? ['', 'play', 'hit', 'turn', 'passive'] : type === 'bit' && !dur ? ['play'] : ['turn', 'passive']);

const cfInt = (v, lo, hi, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const cfNum = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.round(Math.min(hi, Math.max(lo, v)) * 10) / 10 : d; };
const cfStr = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '');
const cfBg = b => (b && CF_BG.includes(b.tpl) && /^#[0-9a-f]{6}$/i.test(b.tint) ? { tpl: b.tpl, tint: b.tint.toLowerCase() } : null);

// A form from the screen, a saved draft or a file -> the same shape with every value in range and unknown keys dropped.
function cfClean(f) {
  f = f && typeof f === 'object' ? f : {};
  const type = ['character', 'bit', 'evil'].includes(f.type) ? f.type : 'character', dur = type === 'bit' ? cfInt(f.dur, 0, 3, 0) : 0;
  const pick = (list, v) => (list.includes(v) ? v : list[0]), trig = pick(cfTrigs(type, dur), f.fx?.trig), ok = CF_OK[trig] || [];
  const crop = c => ({ x: cfNum(c?.x, 0, 100, 50), y: cfNum(c?.y, 0, 100, 50), zoom: cfNum(c?.zoom, 1, 4, 1) });
  return {
    type, name: cfStr(f.name, 22), credit: cfStr(f.credit, 30), notes: cfStr(f.notes, 300),
    hp: cfInt(f.hp, 1, 8, 3), def: cfInt(f.def, 8, 16, 10), cost: cfInt(f.cost, type === 'evil' ? 1 : 0, 3, 1), dur,
    fx: { trig, eff: ok.length ? pick(ok, f.fx?.eff) : '', n: cfInt(f.fx?.n, 1, 3, 1) },
    moves: (Array.isArray(f.moves) && f.moves.length ? f.moves : [{}]).slice(0, 2).map(m => {
      const ability = m?.ability === true, list = CF_OK[ability ? 'ability' : 'onHit'];
      return { name: cfStr(m?.name, 20), cost: cfInt(m?.cost, 1, 3, 1), ability, power: cfInt(m?.power, 1, 6, 2), eff: list.includes(m?.eff) ? m.eff : '', n: cfInt(m?.n, 1, 3, 1) };
    }),
    fins: Object.fromEntries(CF_FINS.map(k => [k, type === 'character' && f.fins?.[k] === true])),
    crop: crop(f.crop), cropFull: crop(f.cropFull), anyway: f.anyway === true,
  };
}

// Card text in the wording the existing cards use ("When played: +1 Creativity.", "On a hit, opponent +1 Boredom.").
// where: play | turn | break (passive "on a hit") | hit (a move's on-hit) | now (ability move, Instant Item) | passive
function cfSay(eff, n, where, who) {
  const s = n > 1 ? 's' : '';
  const p = { goof: `+${n} Creativity`, bore: `opponent +${n} Boredom`, calm: `your Boredom -${n}`, draw: n > 1 ? `draw ${n} cards` : 'draw a card', act: `+${n} Action${s}`,
    heal: `${who} heals ${n} HP`, dmg: `${n} more damage to the blocker`, atk: `your attacks get +${n} power`, def: `your Characters get +${n} DEF`, tax: `opponent's attacks cost ${n} more Action${s}` }[eff];
  if (where === 'hit') return `On a hit, ${eff === 'goof' ? `you gain ${n} Creativity` : eff === 'act' ? `you gain ${n} Action${s}` : p}.`;
  const t = (eff === 'act' && (where === 'play' || where === 'now') ? `${p} this turn` : eff === 'goof' && where === 'now' ? `gain ${n} Creativity` : p) + '.';
  const lead = { play: 'When played: ', turn: 'Start of your turn: ', break: 'Whenever this lands a hit: ' }[where];
  return lead ? lead + t : t[0].toUpperCase() + t.slice(1);
}

// Clean form -> card data in the cards-data.js shape (crop for normal/holo/reverse, cropFull for full art/rainbow, plus finishes). Text stays plain: escape with cfSafe to show it.
function cfBuild(f) {
  const name = f.name || 'Unnamed card', who = f.name || 'This Character', e = f.fx, eff = CF_EFF[e.eff];
  const c = { id: 'sub_' + (name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'card'), type: f.type, name, cost: f.cost };
  const hook = { play: 'onPlay', hit: 'onBreak', turn: 'onTurnStart' }[e.trig];
  if (eff) { if (e.trig === 'passive') c.mod = eff[1](e.n); else c[hook] = [eff[1](e.n)]; }
  if (f.type === 'character') {
    Object.assign(c, { hp: f.hp, def: f.def, text: eff ? cfSay(e.eff, e.n, e.trig === 'hit' ? 'break' : e.trig, who) : '' });
    c.moves = f.moves.map(m => {
      const me = CF_EFF[m.eff], mv = { name: m.name || 'Move', cost: m.cost };
      if (m.ability) Object.assign(mv, { ability: true, ops: me ? [me[1](m.n)] : [], text: me ? cfSay(m.eff, m.n, 'now', who) : '' });
      else { mv.power = m.power; if (me) Object.assign(mv, { onHit: [me[1](m.n)], text: cfSay(m.eff, m.n, 'hit', who) }); }
      return mv;
    });
  } else {
    if (f.type === 'bit') c.dur = f.dur || 1;
    c.text = eff ? cfSay(e.eff, e.n, e.trig === 'play' ? 'now' : e.trig, who) : '';
  }
  return Object.assign(c, { artist: f.credit, crop: f.crop, cropFull: f.cropFull, finishes: ['normal', ...CF_FINS.filter(k => f.fins[k])] });
}

// renderCard() puts names and text into HTML as they are, so a submitted card is escaped first.
const cfSafe = c => ({ ...c, name: esc(c.name), text: esc(c.text || ''), artist: esc(c.artist || ''), moves: c.moves?.map(m => ({ ...m, name: esc(m.name), text: m.text ? esc(m.text) : '' })) });

// Rough power score, compared with the real cards of the same type: Weak (bottom quarter), Fair, Strong (top quarter), Too strong (above all of them).
const cfOps = ops => (ops || []).reduce((s, [w, who, n]) => s + (w === 'flip' ? (cfOps(who) + cfOps(n)) / 2 : w === 'sac' ? -2 : w === 'purge' ? n
  : w === 'hp' ? (who === 'target' ? 0.8 : 0.5) * Math.abs(n) : (who === 'opp' ? -1 : 1) * n * ({ goof: 0.6, bore: -1.2, draw: 0.9, actions: 1 }[w] || 0)), 0);
const cfMod = m => (m ? Object.entries(m).reduce((s, [k, n]) => s + (typeof n === 'number' ? n * ({ atk: 2.5, def: 2.5, oppAttackCost: 2, oppEvilCost: 1, goofBonus: 1.5, actions: 2.5 }[k] || 0) : 0), 0) * (m.if ? 0.5 : 1) : 0);
function cfScore(c) {
  const cost = c.cost ?? 1, turnly = cfOps(c.onTurnStart) + cfOps(c.onOppTurnStart);
  if (c.type === 'character') return maxHp(c) + 2 * baseArmor(c) + cfOps(c.onPlay) + 2 * turnly + 0.6 * cfOps(c.onBreak) + cfMod(c.mod) - 1.5 * (cost - 1) - (c.sick ? 1 : 0)
    + (c.moves || []).reduce((s, m) => s + (m.ability ? 1.5 * cfOps(m.ops) : 2 * m.power + 0.6 * cfOps(m.onHit)) / Math.max(1, m.cost), 0);
  const evil = c.type === 'evil', dur = c.dur || 1;
  return cfOps(c.onPlay) + (evil ? 3 : dur - 1) * turnly + cfMod(c.mod) * (evil ? 1.5 : 0.6 * dur) - 1.2 * cost;
}
const CF_BANDS = [['Weak', 'Weaker than most cards: add HP, power or an effect.'], ['Fair', 'In line with most cards in the game.'],
  ['Strong', 'Stronger than most cards, like a rare. Fine if that is the idea.'], ['Too strong', 'Stronger than every card in the game. Lower HP, power or effects, or tick "Submit anyway".']];
const cfRef = {};
function cfBand(c) {
  const ref = (cfRef[c.type] ||= CARDS.filter(x => x.type === c.type).map(cfScore).sort((a, b) => a - b)), s = cfScore(c), top = ref[ref.length - 1];
  const at = q => ref[Math.floor(q * (ref.length - 1))];
  return { band: s > top + 0.5 ? 3 : s > at(0.75) ? 2 : s >= at(0.25) ? 1 : 0, pct: Math.max(4, Math.min(100, (100 * (s - ref[0])) / (top * 1.25 - ref[0] || 1))) };
}

// Missing pieces, as { field: message } (moves are "m0name", "m1eff", ...).
function cfErrors(f, hasArt) {
  const e = {};
  if (!f.name) e.name = 'Give the card a name.';
  if (!f.credit) e.credit = 'Say whose OC this is.';
  if (!hasArt) e.art = 'Add a picture.';
  if (f.type === 'character') f.moves.forEach((m, i) => { if (!m.name) e[`m${i}name`] = 'Name this move.'; if (m.ability && !m.eff) e[`m${i}eff`] = 'An ability needs an effect.'; });
  if (cfBand(cfBuild(f)).band === 3 && !f.anyway) e.anyway = 'Tick "Submit anyway" to send a card this strong.';
  return e;
}

// The .tismcard.json file and the cloud submission share this shape. The cloud row stores image/cutout as storage paths instead of data URLs.
const cfPayload = (form, art = {}) => { const f = cfClean(form); return { v: 1, kind: 'tismcard', created: new Date().toISOString(), form: f, card: cfBuild(f), bg: cfBg(art.bg), image: art.image || '', cutout: art.cutout || '' }; };
// An untrusted file -> { form, card, image, cutout, bg }; the card is rebuilt from the clamped form, never taken from the file.
function cfRead(o) {
  if (!o || typeof o !== 'object' || o.kind !== 'tismcard' || o.v !== 1 || !o.form || typeof o.form !== 'object') throw new Error('This is not a Tismtopia card file.');
  const img = k => (typeof o[k] === 'string' && o[k].length < 8e6 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(o[k]) ? o[k] : '');
  const form = cfClean(o.form);
  return { form, card: cfBuild(form), image: img('image'), cutout: img('cutout'), bg: cfBg(o.bg) };
}
