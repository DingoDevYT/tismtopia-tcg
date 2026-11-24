// Puts the review tool's accepted cards into the game:  node tools/apply-cards.js
// Writes js/cards-data.js (CAPTAINS, CARDS, STARTERS) and copies each card's chosen art to art/local/ (git-ignored,
// so the art stays on this computer; anyone without it sees the placeholder icon).
const fs = require('fs'), path = require('path'), os = require('os');
const root = path.join(__dirname, '..');
const ART = process.env.TISM_ART || path.join(os.homedir(), 'Downloads', 'arte TismTopia');
const ROLE_ADJ = { Tank: { hp: 2, def: 1 }, Bruiser: { hp: 1 }, 'Glass Cannon': { def: -2 }, Fodder: { hp: -1, def: -2 }, Engine: { def: -1 } };
const DMG_BONUS = 1; // balance knob: every attack move does this much more than its drafted power, so armour doesn't cancel small hits
const META = ['source', 'note', 'owner', 'folder', 'error', 'check', 'changes', 'evidence', 'artIssues', 'extraArt', 'baseId', 'suggestedArt', 'from', 'no', 'art', 'crop'];

const dec = JSON.parse(fs.readFileSync(path.join(root, 'review', 'decisions.json'), 'utf8'));
const drafts = fs.readdirSync(path.join(root, 'review', 'drafts')).filter(f => f.endsWith('.json'))
  .flatMap(f => JSON.parse(fs.readFileSync(path.join(root, 'review', 'drafts', f), 'utf8')));
fs.mkdirSync(path.join(root, 'art', 'local'), { recursive: true });
// Balance/design rewrites of already-accepted cards (review/proposals/*.json, arrays of full cards) replace the accepted text; art stays.
const pdir = path.join(root, 'review', 'proposals'), prop = {};
if (fs.existsSync(pdir)) for (const f of fs.readdirSync(pdir).filter(f => f.endsWith('.json'))) for (const c of JSON.parse(fs.readFileSync(path.join(pdir, f), 'utf8'))) prop[c.id] = c;

const owner = {}, cards = [];
for (const d of drafts) {
  const r = dec[d.id];
  // shortcut: lore Bits/Evils go in unless denied, so the starters have some before they're reviewed; require 'accepted' once they are.
  const item = d.type === 'bit' || d.type === 'evil';
  if (item ? r?.status === 'denied' : r?.status !== 'accepted') continue;
  const c = structuredClone(prop[d.id] || r?.card || d);
  if (c.type === 'captain' && !d.id.startsWith('captain_')) continue; // old OC captains: Captains are the people now
  for (const k of META) delete c[k];
  c.id = d.id;
  c.name = c.name.replace(/[,\s]+$/, '');
  const hitWord = t => t && t.replace(/[Bb]reak-through/g, m => (m[0] === 'B' ? 'Hit' : 'hit')).replace(/breaks through/g, 'lands a hit');
  c.text = hitWord(c.text); for (const m of c.moves || []) m.text = hitWord(m.text);
  delete c.main; // no Main Characters: Characters have roles instead
  const adj = ROLE_ADJ[c.role]; // balance knob: role decides toughness, so Tanks and Glass Cannons feel different
  if (adj && c.type === 'character') { c.hp = Math.max(1, c.hp + (adj.hp || 0)); c.def = Math.min(16, Math.max(8, c.def + (adj.def || 0))); }
  for (const m of c.moves || []) if (!m.ability && m.power != null) m.power += DMG_BONUS;
  if (c.disadv && c.text) c.text = c.text.replace(/Attacks against .*? roll twice and keep the lower\./, 'Tough: +1 armour.');
  owner[c.id] = r?.owner || d.owner || '';
  const a = r?.art || {}, src = a.path ? path.join(ART, a.path) : a.file ? path.join(ART, r?.folder || d.folder, a.file) : null;
  if (src && fs.existsSync(src)) {
    const rel = `art/local/${c.id}${path.extname(src).toLowerCase()}`;
    const dst = path.join(root, rel); // only re-copy when the source changed, so tools/shrink-art.ps1 results stick
    if (!fs.existsSync(dst) || fs.statSync(src).mtimeMs > fs.statSync(dst).mtimeMs) fs.copyFileSync(src, dst);
    c.art = rel;
    c.crop = { x: a.x ?? 50, y: a.y ?? 50, zoom: a.zoom ?? 1 };
  } else if (!item) console.warn(`no art for ${c.id}${src ? ` (missing ${src})` : ''}`);
  cards.push(c);
}

const CAPTAINS = cards.filter(c => c.type === 'captain'), CARDS = cards.filter(c => c.type !== 'captain');
// Rarity from a rough strength score; tweak any card by giving it "rarity" in its draft.
const steps = l => JSON.stringify(l || []).length / 20;
const score = c => c.type === 'character'
  ? c.hp * 1.4 + Math.max(0, (c.def - 10) / 2) + Math.max(0, ...c.moves.map(m => (m.power || 0) / Math.max(1, m.cost))) * 2 + steps(c.moves.map(m => m.onHit || m.ops)) + (c.mod ? 3 : 0) + (c.onPlay ? 1 : 0) - (c.cost ?? 1) * 0.5
  : (c.cost ?? 1) * 2 + steps(c.onPlay) + steps(c.onTurnStart) + steps(c.onOppTurnStart) + (c.mod ? 3 : 0) + (c.type === 'evil' ? 1.5 : 0);
for (const group of [CARDS.filter(c => c.type === 'character'), CARDS.filter(c => c.type !== 'character')]) {
  const ranked = [...group].sort((a, b) => score(a) - score(b));
  ranked.forEach((c, i) => { const q = i / ranked.length; if (!c.rarity) c.rarity = q < 0.45 ? 'C' : q < 0.75 ? 'U' : q < 0.93 ? 'R' : 'UR'; });
}
// Two mixed starters: deal non-main Characters round-robin by owner so both decks mix everyone's OCs.
// shortcut: no balance pass, the decks change if more cards get accepted; hand-pick them once the card pool settles.
const chars = CARDS.filter(c => c.type === 'character');
const groups = Object.values(chars.filter(c => !c.main).reduce((g, c) => ((g[owner[c.id]] ||= []).push(c), g), {}));
const dealt = [];
for (let i = 0; groups.some(g => g[i]); i++) for (const g of groups) if (g[i]) dealt.push(g[i]);
const mains = chars.filter(c => c.main);
const mainB = mains.find(m => owner[m.id] !== owner[mains[0]?.id]) || mains[1];
const items = CARDS.filter(c => c.type !== 'character');
const fin = path.join(root, 'review', 'sim', 'big', 'decks', 'finalists.json');
const EVOLVED = fs.existsSync(fin) ? [[0, 'Stardust Rush'], [1, 'Combo Engine'], [3, 'The Grind']].map(([i, name]) => ({ ...JSON.parse(fs.readFileSync(fin, 'utf8'))[i], name })) : null;
function grow(d) { // double the evolved list (max 3 copies), fill or trim to the deck size with the most-picked cards
  const ok = id => CARDS.some(c => c.id === id), cards = {};
  for (const [id, n] of Object.entries(d.cards)) if (ok(id)) cards[id] = Math.min(3, n * 2);
  const tot = () => Object.values(cards).reduce((a, b) => a + b, 0), order = CARDS.map(c => c.id);
  for (const id of order) { if (tot() >= DECK_SIZE) break; while ((cards[id] || 0) < 2 && tot() < DECK_SIZE) cards[id] = (cards[id] || 0) + 1; }
  for (const id of Object.keys(cards).reverse()) { while (tot() > DECK_SIZE && cards[id] > 0) cards[id]--; if (!cards[id]) delete cards[id]; }
  return { name: d.name, captain: d.captain, cards };
}
const DECK_SIZE = 40;
const STARTERS = EVOLVED ? EVOLVED.map(grow) : [['All-Stars A', 'captain_anonagon', mains[0]], ['All-Stars B', 'captain_xee', mainB]].map(([name, cap, main], k) => {
  const pick = dealt.filter((_, i) => i % 2 === k), deck = {};
  let n = 0;
  if (main) { deck[main.id] = 1; n = 1; }
  for (const c of items.filter((_, i) => i % 2 === k)) { deck[c.id] = 1; n++; } // half the Bits/Evils each, one copy
  for (const c of pick) { if (n >= 20) break; const take = Math.min(2, 20 - n); deck[c.id] = take; n += take; }
  if (n < 20) throw new Error(`${name}: only ${n} cards available`);
  return { name, captain: CAPTAINS.some(c => c.id === cap) ? cap : CAPTAINS[k].id, cards: deck };
});
if (!EVOLVED) STARTERS.length = 2; // fallback keeps the old two

const line = v => JSON.stringify(v);
fs.writeFileSync(path.join(root, 'js', 'cards-data.js'), `// Generated by tools/apply-cards.js from the review tool's accepted cards. Edit cards in the review tool, then re-run.
const CAPTAINS = [
${CAPTAINS.map(line).join(',\n')},
];

const CARDS = [
${CARDS.map(line).join(',\n')},
];

// Free decks everyone gets.
const STARTERS = ${JSON.stringify(STARTERS, null, 1)};
`);
console.log(`${CAPTAINS.length} captains, ${CARDS.length} cards, ${cards.filter(c => c.art).length} with art;`, STARTERS.map(s => `${s.name}: ${Object.keys(s.cards).length} different`).join(', '));
