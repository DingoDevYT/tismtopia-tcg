// Writes design/cards-old.js for design/cards.html: the base commit's version of every card this design pass changed, and why it changed.
// Run from the repo root: node design/make-cards-page.js [base commit, default 37a48b9]
const fs = require('fs'), vm = require('vm'), { execSync } = require('child_process');
const base = process.argv[2] || '37a48b9';
const old = {}, now = {};
const load = (get, out) => { const x = { structuredClone }; vm.runInNewContext(['js/cards-data.js', 'js/card-overrides.js', 'js/cards.js'].map(get).join('\n;\n') + ';this.A = [...CAPTAINS, ...CARDS];', x); for (const c of x.A) out[c.id] = c; };
load(f => execSync(`git show ${base}:${f}`, { encoding: 'utf8', maxBuffer: 1 << 26 }), old);
load(f => fs.readFileSync(f, 'utf8'), now);
const WHY = {
  item_evening_coil: 'Evil retired. Was a tax on Evils, which no longer exist. Now a 2-use counter-attack for blockers: Vesper strikes back.',
  item_wont_let_rest: 'Evil retired. Was +1 Boredom every turn forever (Boredom not from damage). Now a 3-use draw engine for attackers.',
  item_deity_form: 'Evil retired. Was +1 armour at 0 Creativity, rarely on. Now a one-shot save: a Character survives a lethal hit on 1 HP.',
  item_anxious_duo: 'Evil retired. Needed an Enoch on the field. Now one turn of attack tax on the opponent, no strings.',
  item_pollen_season: 'Evil retired. Was -1 Creativity every turn forever. Now a Super block for one turn plus -1 Creativity: timing matters.',
  item_nicer_mondays: 'Evil retired. Was -1 Boredom every turn forever (best card in the old sim). Now 3 uses of softening attacks that reach your Boredom.',
  item_entity_form: 'Evil retired. Was an always-on engine plus attack tax. Now a delayed burst: set it up, swing hard next turn.',
  jangle_unnamed_ocs: 'Bland (+1 Creativity, Boredom rider). Now a FREE one-move soak: 4 HP that exists to take hits.',
  scrunge_alto: 'Bland (Boredom rider). Now a FREE soak with Tough armour and a 1-power poke. Silent, sturdy.',
  jangle_evil_oc: 'Bland (+1 Creativity, Boredom rider). A villain who monologues: steals 2 Creativity.',
  lord_fey: 'Bland (Boredom rider). Glass cannon whose stare ignores armour: the answer to tanks.',
  anonagon_jeremy: 'Bland (Creativity on play and on a coin). Windweaver tempo: a jab that refunds its Action when it lands.',
  jegg_aj: 'Bland (+1 Creativity on hit). Lonely: hits much harder when he is your only Character.',
  jegg_brulee: 'Bland (+1 Creativity, Boredom rider). HiveWing: honey heals, fire breath splashes the whole field.',
  jegg_jenosu: 'Bland (+1 Creativity on hit). Meme dog zoomies: a hit lets him go again.',
  jegg_lyra: 'Bland (+1 Creativity, coin Boredom). Finisher: Big Finish gets +3 once the opponent is at 10 Boredom.',
  scrunge_calytrix_and_noli: 'Bland (+1 Creativity, Boredom rider). "Sillies Assemble": stronger with every friend on the field.',
  scrunge_corin: 'Bland (Boredom rider). Moth to a lamp: a big dive that burns Salem too.',
  scrunge_maxi: 'Bland (+1 Creativity, Boredom rider). Scaredy striker: hits well but hides behind others instead of blocking.',
  scrunge_noxx_darmen: 'Bland (+1 Creativity, coin Creativity). Dad and daughter: Dad Hug heals your whole team.',
  scrunge_alek: 'Bland UR tank (Boredom rider). Old man House Rules: enemy newcomers wait a turn before attacking.',
  jimmy_arhakoth: 'Bland UR tank (Boredom rider). "Can’t be killed", for real: survives one lethal hit per game.',
  jangle_fenrik: 'Boredom riders removed. Won’t Shut Up now drains 1 Creativity instead.',
  jangle_enoch: 'Boredom rider removed: 1 more damage to the blocker instead.',
  jegg_anxio: 'Boredom rider removed; keeps the Creativity.',
  jegg_pomegranate: 'Boredom rider removed: +1 power instead.',
  jegg_sapphire: 'Boredom rider removed (already a strong 5-power move for 2).',
  jegg_yooperlite: 'Boredom rider removed: 1 more damage to the blocker instead.',
  scrunge_atlas: 'Coin Boredom removed (6 power for 3 stands on its own).',
  scrunge_monterey: 'Coin Boredom becomes coin damage.',
  scrunge_scugs: 'Coin Boredom becomes coin damage.',
  scrunge_wiffle_v2: 'Boredom rider removed.',
  jegg_abigaia_v2: 'Boredom rider removed: +1 power instead.',
  jangle_dizzy: 'Coin Boredom becomes coin damage.',
  scrunge_anna_lee: 'Text fix: it also gave +1 Creativity when played, which the text didn’t say.',
  captain_moth: 'Owner: genuinely nerf. Super costs 5 (was 4) and drains 3 (was 4).',
  captain_xee: 'Was the top Captain: +3 Boredom (was +4).',
  captain_rotgrease: 'Second best: costs 4 (was 3), adds -1 Creativity.',
  captain_anonagon: 'Weakest by far: costs 3 (was 4) and also draws 2 cards.',
};
const pairs = Object.keys(WHY).map(id => [id, now[id] ? id : Object.keys(now).find(k => k === id + '_v2'), WHY[id]]);
for (const [o, n] of pairs) if (!old[o] || !now[n]) throw new Error('missing ' + o + ' / ' + n);
// only fields the renderer reads
const keep = c => JSON.parse(JSON.stringify(c));
fs.writeFileSync('design/cards-old.js', `// Generated by design/make-cards-page.js from ${base}: the old version of each changed card, and why it changed.\nconst OLD = ${JSON.stringify(Object.fromEntries(pairs.map(([o]) => [o, keep(old[o])])))};\nconst PAIRS = ${JSON.stringify(pairs)};\n`);
console.log(pairs.length, 'pairs');
