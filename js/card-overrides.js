// Written by editor.html: per-card art, crop and rainbow full-art overrides, applied on top of cards-data.js.
const OVERRIDES = {
 "scrunge_snoob": {
  "rainbow": true,
  "art": "art/local/scrunge_snoob-custom.png?v=1795493852774",
  "crop": {
   "x": 12,
   "y": 34,
   "zoom": 1.9
  }
 },
 "scrunge_custard": {
  "art": "art/local/scrunge_custard-custom.png?v=1795493864639",
  "crop": {
   "x": 16,
   "y": 16.978918539578117,
   "zoom": 2.15
  },
  "rainbow": true
 },
 "scrunge_bobby": {
  "art": "art/local/scrunge_bobby-custom.png?v=1795493881516",
  "rainbow": true,
  "crop": {
   "x": 71,
   "y": 22.590614395493837,
   "zoom": 2.35
  }
 },
 "scrunge_monterey": {
  "art": "art/local/scrunge_monterey-custom.png?v=1795493895281",
  "crop": {
   "x": 88,
   "y": 16.416191892228152,
   "zoom": 2.2
  },
  "rainbow": true
 },
 "scrunge_whippie": {
  "art": "art/local/scrunge_whippie-custom.png?v=1795493910487",
  "crop": {
   "x": 24,
   "y": 21,
   "zoom": 2.1
  },
  "rainbow": true
 },
 "scrunge_toru": {
  "crop": {
   "x": 26,
   "y": 17.36627720099815,
   "zoom": 4
  },
  "rainbow": true
 },
 "scrunge_noxx_darmen": {
  "crop": {
   "x": 52.008253355340635,
   "y": 25,
   "zoom": 1
  },
  "rainbow": true
 },
 "scrunge_maxi": {
  "rainbow": true
 },
 "scrunge_robo_cat_girl": {
  "crop": {
   "x": 40,
   "y": 48.81594300434664,
   "zoom": 1.2
  },
  "rainbow": true
 },
 "scrunge_calytrix_and_noli_v2": {
  "rainbow": true
 },
 "jangle_bee_boy": {
  "crop": {
   "x": 8,
   "y": 11.389838556784975,
   "zoom": 2.3
  }
 },
 "jimmy_arhakoth": {
  "cost": 2
 },
 "jegg_abigaia_v2": {
  "name": "Abigaia"
 }
};
for (const c of [...CAPTAINS, ...CARDS]) Object.assign(c, OVERRIDES[c.id] || {});
