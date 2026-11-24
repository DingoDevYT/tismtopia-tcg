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
  },
  "moves": [
   {
    "name": "Bonk",
    "cost": 1,
    "power": 2
   },
   {
    "name": "Bobby Barrage",
    "cost": 2,
    "power": 3,
    "text": "On a hit, flip a coin. Heads: 3 more damage.",
    "onHit": [
     [
      "flip",
      [
       [
        "hp",
        "target",
        3
       ]
      ]
     ]
    ]
   }
  ]
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
  "rainbow": true,
  "moves": [
   {
    "name": "Nudge",
    "cost": 1,
    "power": 2
   },
   {
    "name": "Toru Tumble",
    "cost": 2,
    "power": 3,
    "text": "On a hit, Toru heals 2 HP.",
    "onHit": [
     [
      "hp",
      "self",
      -2
     ]
    ]
   }
  ]
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
 },
 "scrunge_sage": {
  "moves": [
   {
    "name": "Cat Nap Swipe",
    "cost": 1,
    "power": 2
   },
   {
    "name": "Cat Nap",
    "cost": 1,
    "ability": true,
    "once": true,
    "text": "Your Boredom -1 and +1 Creativity. Once per turn.",
    "ops": [
     [
      "bore",
      "me",
      -1
     ],
     [
      "goof",
      "me",
      1
     ]
    ]
   }
  ]
 },
 "jegg_poinsettia": {
  "moves": [
   {
    "name": "Hidden Blade",
    "cost": 1,
    "power": 3
   },
   {
    "name": "Royal Stab",
    "cost": 2,
    "power": 4,
    "text": "On a hit, 1 more damage to the blocker.",
    "onHit": [
     [
      "hp",
      "target",
      1
     ]
    ]
   }
  ]
 },
 "jangle_fenrik": {
  "moves": [
   {
    "name": "Won't Shut Up",
    "cost": 1,
    "power": 2,
    "text": "On a hit, opponent +1 Boredom.",
    "onHit": [
     [
      "bore",
      "opp",
      1
     ]
    ]
   },
   {
    "name": "Sad Howl",
    "cost": 3,
    "power": 5,
    "text": "On a hit, opponent +1 Boredom.",
    "onHit": [
     [
      "bore",
      "opp",
      1
     ]
    ]
   }
  ]
 },
 "jangle_drow_paladin": {
  "moves": [
   {
    "name": "Sword Bonk",
    "cost": 1,
    "power": 3
   },
   {
    "name": "Holy Smite",
    "cost": 2,
    "power": 4,
    "text": "On a hit, 2 more damage to the blocker.",
    "onHit": [
     [
      "hp",
      "target",
      2
     ]
    ]
   }
  ]
 },
 "scrunge_corin": {
  "moves": [
   {
    "name": "Hair Flip",
    "cost": 1,
    "power": 3
   },
   {
    "name": "Bby Glow",
    "cost": 2,
    "power": 4,
    "text": "On a hit, opponent +1 Boredom.",
    "onHit": [
     [
      "bore",
      "opp",
      1
     ]
    ]
   }
  ]
 },
 "jangle_water_dog": {
  "onPlay": [
   [
    "draw",
    "me",
    1
   ]
  ],
  "text": "When played: draw a card."
 },
 "scrunge_alek": {
  "moves": [
   {
    "name": "Grumble",
    "cost": 1,
    "power": 3
   },
   {
    "name": "Old Man Rules",
    "cost": 2,
    "power": 4,
    "text": "On a hit, opponent +1 Boredom.",
    "onHit": [
     [
      "bore",
      "opp",
      1
     ]
    ]
   }
  ]
 },
 "scrunge_nexus": {
  "cost": 2
 },
 "scrunge_caerus": {
  "moves": [
   {
    "name": "Card Toss",
    "cost": 1,
    "power": 3,
    "text": "On a hit, draw a card.",
    "onHit": [
     [
      "draw",
      "me",
      1
     ]
    ]
   },
   {
    "name": "Ace Up Sleeve",
    "cost": 1,
    "ability": true,
    "once": true,
    "text": "+2 Actions. Once per turn.",
    "ops": [
     [
      "actions",
      "me",
      2
     ]
    ]
   }
  ]
 },
 "jegg_sapphire": {
  "moves": [
   {
    "name": "Ice Shard",
    "cost": 1,
    "power": 2
   },
   {
    "name": "Frost Breath",
    "cost": 2,
    "power": 5,
    "text": "On a hit, opponent +1 Boredom.",
    "onHit": [
     [
      "bore",
      "opp",
      1
     ]
    ]
   }
  ],
  "hp": 4
 }
};
for (const c of [...CAPTAINS, ...CARDS]) Object.assign(c, OVERRIDES[c.id] || {});
