// ===================== .tismcard.json payload, version 1 =====================
// The downloaded card file and the cloud submission use this same object. To read an untrusted file call cfRead(obj) from
// js/cardfile.js: it rejects anything without kind 'tismcard' and v 1, clamps `form`, REBUILDS `card` from it (the file's own
// `card` is never trusted), and keeps image/cutout only if they are data:image/(png|jpeg|webp);base64 URLs.
// {
//   v: 1,                                   number, format version
//   kind: 'tismcard',                       string, always this
//   created: '2026-11-24T12:00:00.000Z',    ISO time the file was made
//   form: {                                 what the player picked; every value is clamped by cfClean()
//     type: 'character' | 'bit' | 'evil',   (bit = Item; Captains can't be submitted)
//     name: string <= 22, credit: string <= 30 ("whose OC is this"), notes: string <= 300 (to the reviewer),
//     hp: 1-8, def: 8-16                    Characters (printed HP and DEF, like cards-data.js)
//     cost: 0-3                             Actions to play (Evils 1-3)
//     dur: 0-3                              Items: 0 = Instant, 1-3 = lasts that many turns; 0 for the others
//     fx: { trig, eff, n }                  the card's one effect (a Character's optional passive):
//         trig: '' (none) | 'play' | 'hit' (whenever this lands a hit) | 'turn' (start of your turn) | 'passive'
//         eff:  'goof' (+n Creativity) | 'bore' (opponent +n Boredom) | 'calm' (your Boredom -n) | 'draw' | 'act' (+n Actions)
//               | 'heal' (self, on a hit) | 'atk' | 'def' | 'tax' (opponent's attacks cost n more; these three are passive only) | ''
//         n: 1-3
//     moves: [ { name: string <= 20, cost: 1-3, ability: bool, power: 1-6 (ignored for abilities),
//                eff: '' | 'goof'|'bore'|'calm'|'draw'|'act'|'heal'|'dmg' (dmg = n more damage to the blocker, attacks only), n: 1-3 } ]
//                                         1-2 moves, Characters only (Items/Evils carry one default move that is ignored)
//     fins: { holo, rev, full, rainbow }    booleans: finishes the player allows (all false for Items/Evils; normal is always allowed)
//     crop: { x: 0-100, y: 0-100, zoom: 1-4 }   art crop for normal / holo / reverse holo
//     cropFull: { x, y, zoom }              art crop for full art / rainbow
//     anyway: bool                          ticked "Submit anyway" on a Too strong card
//   },
//   card: { ... }                           game card in the js/cards-data.js shape built from form by cfBuild():
//         id 'sub_<name>', type, name, cost, hp, def, text, moves [{ name, cost, power | ability: true, text, onHit | ops }],
//         one of onPlay | onBreak | onTurnStart | mod, dur (Items), artist (= credit), crop, cropFull, finishes ['normal', ...]
//   bg: { tpl: 'glow'|'rays'|'stars'|'dots'|'sky'|'flames'|'grid'|'plain', tint: '#rrggbb' } | null
//                                         background template drawn behind a transparent cut-out (null = the art's own background)
//   image: 'data:image/webp;base64,...'     the art as shown on the card (background composited in), <= 700 px wide ('' = none;
//                                         png/jpeg where the browser can't encode webp)
//   cutout: 'data:image/webp;base64,...'    the transparent character on its own, same size ('' when the art has its own background)
// }
// Cloud: the `submissions` row holds card = this object with image/cutout replaced by storage paths ('<uid>/<uuid>.webp'),
// image_path = the image's path, note = form.notes. Pictures live in the private `submissions` bucket.
// Example (image shortened):
// {"v":1,"kind":"tismcard","created":"2026-11-24T12:00:00.000Z",
//  "form":{"type":"character","name":"Bee Boy","credit":"the jangle jingler","notes":"","hp":4,"def":13,"cost":1,"dur":0,
//   "fx":{"trig":"play","eff":"goof","n":1},"moves":[{"name":"Bonk","cost":1,"ability":false,"power":2,"eff":"","n":1},
//   {"name":"Big Bonk","cost":2,"ability":false,"power":4,"eff":"bore","n":1}],"fins":{"holo":true,"rev":false,"full":false,"rainbow":true},
//   "crop":{"x":50,"y":30,"zoom":1.4},"cropFull":{"x":50,"y":50,"zoom":1},"anyway":false},
//  "card":{"id":"sub_bee_boy","type":"character","name":"Bee Boy","cost":1,"onPlay":[["goof","me",1]],"hp":4,"def":13,
//   "text":"When played: +1 Creativity.","moves":[{"name":"Bonk","cost":1,"power":2},{"name":"Big Bonk","cost":2,"power":4,
//   "onHit":[["bore","opp",1]],"text":"On a hit, opponent +1 Boredom."}],"artist":"the jangle jingler",
//   "crop":{"x":50,"y":30,"zoom":1.4},"cropFull":{"x":50,"y":50,"zoom":1},"finishes":["normal","holo","rainbow"]},
//  "bg":{"tpl":"rays","tint":"#e5535d"},"image":"data:image/webp;base64,UklGR...","cutout":"data:image/webp;base64,UklGR..."}
// ============================================================================
