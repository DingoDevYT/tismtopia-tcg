// Pull odds, card values and the pack-opening look. Pure (no DOM, no storage): test/game.test.js runs it in node.
// Loaded after cards.js and pack-sets.js, before packs.js and economy.js.
const FINS = ['normal', 'holo', 'rev', 'full', 'rainbow']; // star 0/1, 2, 3, 4, 5
// Stars: 0 Items/Evils and Common Characters, 1 rarer Characters (normal), 2 holo, 3 reverse holo, 4 full art, 5 rainbow.
const starN = (id, f = 'normal') => ({ holo: 2, rev: 3, full: 4, rainbow: 5 }[f] ?? (CARD[id]?.type !== 'character' || (CARD[id]?.rarity || 'C') === 'C' ? 0 : 1));
const starsOf = (id, f) => { const n = starN(id, f); return n ? '★'.repeat(n) : '☆'; };

// Which finishes a card can come in. Items and Evils: normal only. Characters: normal, holo and reverse always; full art and rainbow
// only when switched on. A card with a `finishes` list (community cards, or a built-in toggled in editor.html) uses that list;
// a built-in without one has full art + rainbow when it has a full-art crop (cropFull).
const cardFins = c => !c || c.type !== 'character' ? ['normal'] : Array.isArray(c.finishes) ? FINS.filter(f => f === 'normal' || c.finishes.includes(f)) : c.cropFull ? FINS : FINS.slice(0, 3);
// A finish the card can't have drops to the best one it can (shop stock, forced test pulls).
const allowFin = (c, f) => { const ok = cardFins(c); for (let i = FINS.indexOf(f); i > 0; i--) if (ok.includes(FINS[i])) return FINS[i]; return 'normal'; };

// Each pull picks one (card, finish) from the pack, weighted ONLY by its star level: same stars = same chance.
// Slots 1-4 use STAR_W, slot 5 LAST_W (always 1★ or better). Packs differ only by their cards (and price).
const STAR_W = [1, 0.15, 0.03, 0.012, 0.003, 0.0003], LAST_W = [0, 1, 0.3, 0.12, 0.035, 0.004];
const SLOTS = [STAR_W, STAR_W, STAR_W, STAR_W, LAST_W];
const packEntries = pk => CARDS.filter(c => c.type !== 'captain' && (!pk || typeof PACK_SET === 'undefined' || !PACK_SET[pk] || PACK_SET[pk].includes(c.id)))
  .flatMap(c => cardFins(c).map(f => ({ c, f, s: starN(c.id, f) })));
const slotWeights = (w, list) => (list.some(e => w[e.s] > 0) ? w : STAR_W); // a pack with no 1★+ card: the last slot falls back to the normal weights
function pullSlot(w, list, rnd = Math.random) {
  w = slotWeights(w, list); let x = rnd() * list.reduce((a, e) => a + w[e.s], 0);
  for (const e of list) if ((x -= w[e.s]) < 0) return e;
  return list.findLast(e => w[e.s] > 0);
}
// The maths behind the odds list. per[k][s] = chance slot k gives one given (card, finish) of s stars; each[s] = chance a pack holds it;
// any[s] = chance a pack holds at least one s★ card; expect[s] = average number of s★ cards per pack (they add up to 5).
function packOdds(pk) {
  const list = packEntries(pk), n = [0, 0, 0, 0, 0, 0]; list.forEach(e => n[e.s]++);
  const per = SLOTS.map(w => { w = slotWeights(w, list); const tot = n.reduce((a, k, s) => a + k * w[s], 0); return w.map(x => (tot ? x / tot : 0)); });
  const each = n.map((_, s) => 1 - per.reduce((m, p) => m * (1 - p[s]), 1));
  const any = n.map((k, s) => 1 - per.reduce((m, p) => m * (1 - k * p[s]), 1));
  const expect = n.map((k, s) => per.reduce((a, p) => a + k * p[s], 0));
  const value = per.reduce((a, p) => a + list.reduce((b, e) => b + p[e.s] * cardValue(e.c.id, e.f), 0), 0); // average sell value of a pack's cards
  return { list, n, per, each, any, expect, value };
}
// Chance a pack holds this card in any finish (the "Find it in …" button).
const cardChance = (id, pk) => { const o = packOdds(pk), ss = o.list.filter(e => e.c.id === id).map(e => e.s); return 1 - o.per.reduce((m, p) => m * (1 - ss.reduce((a, s) => a + p[s], 0)), 1); };

// Card value: value(card, finish) = VAL_BASE[stars] x (1 + power adjustment), adjustment from -15% to +15%, rounded to VAL_STEP and kept inside ±15%.
// Power score (cardPower), from the card's own numbers:
//   Character: HP in play + 2 x armour + 2 x best damage per Action of its attack moves + 1.5 with a passive / when-played / start-of-turn effect
//              + 1 with an ability move - 1 per Action of play cost above 1.
//   Item / Evil: its play cost (dearer cards do more).
// The score is scaled between the weakest (-15%) and strongest (+15%) built-in card of the same kind (Characters, or Items + Evils);
// community cards use the same scale, clamped to it, so adding one never changes another card's value.
const VAL_BASE = [15, 40, 100, 250, 700, 3000], VAL_STEP = [1, 1, 5, 5, 10, 50], VAL_SWING = 0.15;
const PASSIVE_KEYS = ['mod', 'onPlay', 'onTurnStart', 'onOppTurnStart', 'onBreak'];
const cardPower = c => c.type !== 'character' ? (c.cost ?? 1) : maxHp(c) + 2 * baseArmor(c)
  + 2 * Math.max(0, ...(c.moves || []).filter(m => !m.ability && m.power).map(m => m.power / Math.max(1, m.cost)))
  + (PASSIVE_KEYS.some(k => c[k]) ? 1.5 : 0) + ((c.moves || []).some(m => m.ability) ? 1 : 0) - Math.max(0, (c.cost ?? 1) - 1);
const powRange = {};
const powerAdj = c => {
  const ch = c.type === 'character', r = powRange[ch] ||= (l => [Math.min(...l), Math.max(...l)])(CARDS.filter(x => !x.community && x.type !== 'captain' && (x.type === 'character') === ch).map(cardPower));
  const z = r[1] > r[0] ? Math.min(1, Math.max(0, (cardPower(c) - r[0]) / (r[1] - r[0]))) : 0.5;
  return VAL_SWING * (2 * z - 1);
};
const cardValue = (id, f = 'normal') => {
  const c = CARD[id]; if (!c) return 0;
  const s = starN(id, f), b = VAL_BASE[s], st = VAL_STEP[s];
  let v = Math.round(b * (1 + powerAdj(c)) / st) * st;
  while (v > b * (1 + VAL_SWING) + 1e-9) v -= st; while (v < b * (1 - VAL_SWING) - 1e-9) v += st; // 1e-9: 100 x 1.15 is 114.999… in floating point
  return v;
};

// Pack opening look and sound, by stars only (an Item is 0★ whatever its rarity letter): edge glint on the stack, reveal background
// class, flip sound, fanfare and the 4★/5★ cutscene. 0 plain, 1 subtle gold, 2 holo, 3 reverse holo, 4 full art cutscene, 5 rainbow big cutscene.
const PULL_LOOK = [
  { edge: '', bg: '', flip: 'packopen_6_A_cardflip', fan: '', cine: '' },
  { edge: 'edge-gold', bg: 'rare s-1', flip: 'packopen_6_A_cardflip', fan: '', cine: '' },
  { edge: 'edge-holo', bg: 'rare s-2', flip: 'packopen_11_rarereveal', fan: 'fanfare-4diamond', cine: '' },
  { edge: 'edge-rev', bg: 'rare s-3', flip: 'packopen_11_rarereveal', fan: 'fanfare-1star', cine: '' },
  { edge: 'edge-full', bg: 'rare s-4', flip: 'packopen_11_rarereveal', fan: 'fanfare-2star', cine: 'pull-4' },
  { edge: 'edge-rainbow', bg: 'rare s-5', flip: 'packopen_11_rarereveal', fan: 'fanfare-rainbow', cine: 'pull-5' },
];
const pullLook = p => PULL_LOOK[starN(p.id, p.finish)];
