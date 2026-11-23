// Validates card drafts against the game's card rules. Run: node tools/check-drafts.js review/drafts/<file>.json
// Prints every problem, or "OK: n cards". Exit code 1 when anything is wrong.
const fs = require('fs');
const file = process.argv[2];
if (!file) { console.error('usage: node tools/check-drafts.js <drafts.json>'); process.exit(2); }

let cards;
try { cards = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`Not valid JSON: ${e.message}`); process.exit(1); }
if (!Array.isArray(cards)) { console.error('The file must be a JSON array of cards.'); process.exit(1); }

const errs = [], ids = new Set();
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const MOD_KEYS = ['atk', 'def', 'if', 'oppAttackCost', 'oppEvilCost', 'goofBonus', 'actions'];

function steps(list, where) {
  if (list === undefined) return;
  if (!Array.isArray(list)) return errs.push(`${where}: must be a list of steps like [["bore","opp",1]]`);
  for (const st of list) {
    if (!Array.isArray(st)) { errs.push(`${where}: each step must be an array`); continue; }
    const [what, a1, a2] = st;
    if (what === 'flip') { steps(a1, `${where} > flip heads`); if (a2 !== undefined) steps(a2, `${where} > flip tails`); continue; }
    if (what === 'hp') { if (!['target', 'self'].includes(a1) || !int(a2, 1, 3)) errs.push(`${where}: hp step must be ["hp","target"|"self",1-3]`); continue; }
    if (!['goof', 'bore', 'draw', 'actions'].includes(what)) { errs.push(`${where}: unknown step "${what}" (allowed: goof, bore, draw, actions, hp, flip)`); continue; }
    if (!['me', 'opp'].includes(a1)) errs.push(`${where}: "${what}" needs "me" or "opp"`);
    if (!Number.isInteger(a2) || a2 === 0 || Math.abs(a2) > 4) errs.push(`${where}: "${what}" amount must be a whole number from -4 to 4, not 0`);
  }
}
function mod(m, where) {
  if (m === undefined) return;
  if (typeof m !== 'object' || Array.isArray(m)) return errs.push(`${where}: mod must be an object`);
  for (const [k, v] of Object.entries(m)) {
    if (!MOD_KEYS.includes(k)) errs.push(`${where}: unknown mod "${k}" (allowed: ${MOD_KEYS.join(', ')})`);
    else if (k === 'if' ? v !== 'noGoof' : !int(v, 1, 3)) errs.push(`${where}: mod ${k} has a bad value`);
  }
}

for (const [n, c] of cards.entries()) {
  const at = `card ${n + 1} (${c?.name ?? c?.id ?? '?'})`;
  if (!c || typeof c !== 'object') { errs.push(`${at}: not an object`); continue; }
  if (!/^[a-z0-9_]{3,40}$/.test(c.id || '')) errs.push(`${at}: id must be lowercase letters, digits and _ (e.g. "scrunge_orpheus")`);
  else if (ids.has(c.id)) errs.push(`${at}: duplicate id "${c.id}"`); else ids.add(c.id);
  if (!str(c.folder, 200)) errs.push(`${at}: folder must be the exact art folder name`);
  if (!str(c.name, 24)) errs.push(`${at}: name must be 1-24 characters`);
  if (c.text !== undefined && c.text !== '' && !str(c.text, 140)) errs.push(`${at}: text must be at most 140 characters`);
  if (c.note !== undefined && typeof c.note !== 'string') errs.push(`${at}: note must be a string`);
  if (c.type === 'character') {
    if (!int(c.def, 8, 16)) errs.push(`${at}: def must be 8-16`);
    if (!int(c.hp, 2, 5)) errs.push(`${at}: hp must be 2-5`);
    if (c.main !== undefined && typeof c.main !== 'boolean') errs.push(`${at}: main must be true/false`);
    for (const k of ['disadv', 'sick']) if (c[k] !== undefined && typeof c[k] !== 'boolean') errs.push(`${at}: ${k} must be true/false`);
    for (const k of ['onPlay', 'onBreak', 'onTurnStart', 'onOppTurnStart']) steps(c[k], `${at} ${k}`);
    mod(c.mod, `${at} mod`);
    if (!Array.isArray(c.moves) || c.moves.length < 1 || c.moves.length > 3) { errs.push(`${at}: moves must be a list of 1-3 moves`); continue; }
    if (!c.moves.some(m => m && m.cost <= 1)) errs.push(`${at}: needs at least one move costing 0 or 1`);
    for (const [k, m] of c.moves.entries()) {
      const mw = `${at} move ${k + 1}`;
      if (!m || typeof m !== 'object') { errs.push(`${mw}: not an object`); continue; }
      if (!str(m.name, 24)) errs.push(`${mw}: name must be 1-24 characters`);
      if (!int(m.cost, 0, 3)) errs.push(`${mw}: cost must be 0-3`);
      if (m.text !== undefined && !str(m.text, 140)) errs.push(`${mw}: text must be at most 140 characters`);
      if (m.once !== undefined && typeof m.once !== 'boolean') errs.push(`${mw}: once must be true/false`);
      if (m.ability) { if (!Array.isArray(m.ops) || !m.ops.length) errs.push(`${mw}: an ability needs ops`); steps(m.ops, `${mw} ops`); if (!m.text) errs.push(`${mw}: an ability needs text`); }
      else { if (!int(m.power, 0, 5)) errs.push(`${mw}: power must be 0-5`); steps(m.onHit, `${mw} onHit`); if (m.onHit && !m.text) errs.push(`${mw}: describe onHit in text`); }
      if (m.cost === 0 && !m.once) errs.push(`${mw}: a free move must be once: true`);
    }
  } else if (c.type === 'captain') {
    if (!str(c.style, 16)) errs.push(`${at}: captain needs a style (1-16 chars, e.g. "Aggro")`);
    if (!str(c.text, 140)) errs.push(`${at}: captain needs text`);
    steps(c.ability, `${at} ability`);
    mod(c.mod, `${at} mod`);
    if (!c.ability && !c.mod) errs.push(`${at}: captain needs an ability (with once) or a mod`);
  } else errs.push(`${at}: type must be "character" or "captain"`);
}

if (errs.length) { console.log(errs.join('\n')); process.exit(1); }
console.log(`OK: ${cards.length} cards`);
