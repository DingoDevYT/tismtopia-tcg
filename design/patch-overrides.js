// Applies the design pass's card changes to js/card-overrides.js, keeping the file in editor.html's exact format
// (so the editor can keep saving it). Art/crop fields already there are kept; the fields below replace their old values.
// Run from the repo root: node design/patch-overrides.js
const fs = require('fs'), vm = require('vm');
const F = 'js/card-overrides.js', x = {};
vm.runInNewContext(fs.readFileSync(F, 'utf8').replace(/for \(const c of[\s\S]*$/, '') + ';this.O = OVERRIDES;', x);
const O = x.O;
const m = (name, cost, power, text, onHit) => ({ name, cost, power, ...(text && { text }), ...(onHit && { onHit }) });
const ab = (name, cost, text, ops, extra) => ({ name, cost, ability: true, text, ops, ...extra });
const more1 = 'On a hit, 1 more damage to the blocker.', flipMore = 'On a hit, flip a coin. Heads: 1 more damage to the blocker.';
const CHANGES = {
  // ---- reworked Characters: one clear hook each ----
  jangle_unnamed_ocs: { role: 'Soak', cost: 0, hp: 3, text: '', onPlay: [], moves: [m('Pan Bonk', 1, 2)] },
  scrunge_alto: { role: 'Soak', cost: 0, hp: 2, disadv: true, text: 'Tough: +1 armour.', moves: [m('Silent Stare', 1, 1)] },
  jangle_evil_oc: { role: 'Thief', text: '', onPlay: [], moves: [m('Menacing Glare', 1, 3), ab('Evil Monologue', 2, 'Opponent -2 Creativity, you +2. (Nobody asked.)', [['goof', 'opp', -2], ['goof', 'me', 2]])] },
  lord_fey: { role: 'Glass Cannon', moves: [m('Claw Rake', 1, 3), { ...m('Glowing Stare', 2, 3, 'Ignores armour.'), pierce: true }] },
  anonagon_jeremy: { role: 'Skirmisher', text: '', onPlay: [], moves: [m('Gust Jab', 1, 2, 'On a hit, +1 Action.', [['actions', 'me', 1]]), m('Tailwind Swoop', 2, 4)] },
  jegg_aj: { role: 'Loner', mod: { atk: 2, if: 'alone' }, text: 'Lonely: your attacks get +2 power while AJ is your only Character.', moves: [m('Lonely Stare', 1, 2), m('Strike Back', 2, 3)] },
  jegg_brulee: { role: 'Blaster', text: '', onPlay: [], moves: [m('Honey Tail', 1, 2, 'On a hit, Brûlée heals 1 HP.', [['hp', 'self', -1]]), m('Fire Breath', 2, 3, 'On a hit, 1 damage to each of their other Characters.', [['splash', 1]])] },
  jegg_jenosu: { role: 'Bruiser', moves: [m('Meme Bark', 1, 3), m('Zoomies', 2, 3, 'On a hit, Jenosu can use a move again this turn.', [['ready']])] },
  jegg_lyra: { role: 'Finisher', text: '', onPlay: [], moves: [m('Quick Doodle', 1, 2), { ...m('Big Finish', 3, 4, '+3 power if your opponent has 10 or more Boredom.'), late: 3 }] },
  scrunge_calytrix_and_noli: { role: 'Leader', text: '', onPlay: [], moves: [m('Cal Jumper', 1, 2), { ...m('Sillies Assemble', 2, 2, '+1 power for each other Character you have, up to +2.'), perAlly: 1, allyMax: 2 }] },
  scrunge_corin: { role: 'Glass Cannon', moves: [m('Wing Dust', 1, 3), m('Lamp Dive', 2, 5, 'On a hit, Salem takes 2 damage. Drawn to the light.', [['hp', 'self', 2]])] },
  scrunge_maxi: { role: 'Striker', def: 10, hp: 3, shy: true, text: 'Scaredy: can’t block while you have another Character.', onPlay: [], moves: [m('Silly Face', 1, 3), m('Scrung Stare', 2, 4)] },
  scrunge_noxx_darmen: { role: 'Tank', text: '', onPlay: [], moves: [ab('Dad Hug', 1, 'Your other Characters heal 2 HP.', [['healAll', 2]]), m('Piggyback Tackle', 2, 4)] },
  scrunge_alek: { role: 'Tank', mod: { oppSick: 1 }, text: 'House Rules: your opponent’s new Characters can’t attack the turn they’re played.', moves: [m('Grumble', 1, 3), m('Cane Whack', 2, 4)] },
  jimmy_arhakoth: { role: 'Tank', unkillable: true, text: 'Tough. Can’t be killed: once per game, an attack that would defeat Arhakoth leaves it on 1 HP.', moves: [m('Squish', 1, 3), m('Unkillable Slam', 3, 5)] },
  // ---- "opponent +1 Boredom on a hit" riders removed ----
  jangle_fenrik: { moves: [m("Won't Shut Up", 1, 2, 'On a hit, opponent -1 Creativity.', [['goof', 'opp', -1]]), m('Sad Howl', 3, 5)] },
  jangle_enoch: { moves: [m('Grumble', 1, 2), m('Hard Stare', 3, 4, more1, [['hp', 'target', 1]])] },
  jegg_anxio: { moves: [m('Worried Stomp', 1, 2), m('Panic Crush', 3, 4, 'On a hit, you gain 1 Creativity.', [['goof', 'me', 1]])] },
  jegg_pomegranate: { moves: [m('Seed Spit', 1, 2), m('Juicy Burst', 3, 5)] },
  jegg_sapphire: { moves: [m('Ice Shard', 1, 2), m('Frost Breath', 2, 5)] },
  jegg_yooperlite: { moves: [m('Molten Drip', 1, 2), m('Lava Bloom', 3, 4, more1, [['hp', 'target', 1]])] },
  scrunge_atlas: { moves: [m('Sunbeam', 1, 2), m('Deity Form', 3, 6)] },
  scrunge_monterey: { moves: [m('Nibble', 1, 2), m('Monterey Jack Attack', 2, 3, flipMore, [['flip', [['hp', 'target', 1]]]])] },
  scrunge_scugs: { moves: [m('Slug Slam', 1, 2), m('Three-Way Squish', 2, 4, flipMore, [['flip', [['hp', 'target', 1]]]])] },
  scrunge_wiffle_v2: { moves: [m('Horn Bonk', 1, 3), m('Ring Flourish', 3, 5)] },
  jegg_abigaia_v2: { moves: [m('Stab', 1, 3), m('Fire!', 3, 5)] },
  jangle_dizzy: { moves: [m('Dizzy Spin', 1, 3), m('Gummy Breath', 2, 4, 'On a hit, flip a coin. Heads: 1 more damage to the blocker. Tails: +1 Creativity.', [['flip', [['hp', 'target', 1]], [['goof', 'me', 1]]]])] },
  // ---- text that didn't match what the card does ----
  scrunge_anna_lee: { text: 'When played and at the start of your turn: +1 Creativity.' },
  // ---- Supers ----
  captain_moth: { goof: 5, text: 'Super, 5 Creativity: Wing Dust. Opponent -4 Creativity, and clear 3 of your Boredom.', ability: [['goof', 'opp', -4], ['bore', 'me', -3]] },
  captain_hamish: { goof: 5, text: 'Super, 5 Creativity: Plot Twist. Opponent -3 Creativity and +2 Boredom.', ability: [['goof', 'opp', -3], ['bore', 'opp', 2]] },
  captain_wawa: { goof: 3, text: 'Super, 3 Creativity: Random Button. Flip a coin. Heads: opponent +3 Boredom. Tails: nothing happens.', ability: [['flip', [['bore', 'opp', 3]], []]] },
  captain_xee: { text: 'Super, 6 Creativity: Supernova. Opponent +3 Boredom and -2 Creativity.', ability: [['bore', 'opp', 3], ['goof', 'opp', -2]] },
  captain_rotgrease: { goof: 4, text: 'Super, 4 Creativity: Grind. Opponent +2 Boredom.', ability: [['bore', 'opp', 2]] },
  captain_anonagon: { goof: 2, text: 'Super, 2 Creativity: Crunch Time. +3 Actions this turn.', ability: [['actions', 'me', 3]] },
};
const extra = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : {}; // optional second file of tweaks on top
for (const [id, ch] of Object.entries({ ...CHANGES })) O[id] = { ...(O[id] || {}), ...ch, ...(extra[id] || {}) };
for (const [id, ch] of Object.entries(extra)) if (!CHANGES[id]) O[id] = { ...(O[id] || {}), ...ch };
const text = `// Written by editor.html: per-card overrides (art, crop = normal/holo/reverse, cropFull = full art/rainbow, balance tweaks), applied on top of cards-data.js.\nconst OVERRIDES = ${JSON.stringify(O, null, 1)};\nfor (const c of [...CAPTAINS, ...CARDS]) Object.assign(c, OVERRIDES[c.id] || {});\n`;
fs.writeFileSync(F, text);
console.log('patched', Object.keys(CHANGES).length + Object.keys(extra).filter(k => !CHANGES[k]).length, 'cards');
module.exports = CHANGES;
