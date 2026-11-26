// Written by editor.html: per-card overrides (art, crop = normal/holo/reverse, cropFull = full art/rainbow, balance tweaks), applied on top of cards-data.js.
const OVERRIDES = {
 "scrunge_snoob": {
  "art": "art/local/scrunge_snoob-custom.png?v=1795493852774",
  "crop": {
   "x": 12,
   "y": 34,
   "zoom": 1.9
  },
  "cropFull": {
   "x": 18.73,
   "y": 41.7,
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
  "cropFull": {
   "x": 23.55,
   "y": 18.21,
   "zoom": 1.37
  }
 },
 "scrunge_bobby": {
  "art": "art/local/scrunge_bobby-custom.png?v=1795493881516",
  "crop": {
   "x": 88.51,
   "y": 22.03,
   "zoom": 1.21
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
  ],
  "cropFull": {
   "x": 75.37,
   "y": 30.86,
   "zoom": 1.4
  }
 },
 "scrunge_monterey": {
  "art": "art/local/scrunge_monterey-custom.png?v=1795493895281",
  "crop": {
   "x": 88,
   "y": 16.416191892228152,
   "zoom": 2.2
  },
  "cropFull": {
   "x": 95.26,
   "y": 16.85,
   "zoom": 1.57
  },
  "moves": [
   {
    "name": "Nibble",
    "cost": 1,
    "power": 2
   },
   {
    "name": "Monterey Jack Attack",
    "cost": 2,
    "power": 3,
    "text": "On a hit, flip a coin. Heads: 1 more damage to the blocker.",
    "onHit": [
     [
      "flip",
      [
       [
        "hp",
        "target",
        1
       ]
      ]
     ]
    ]
   }
  ]
 },
 "scrunge_whippie": {
  "art": "art/local/scrunge_whippie-custom.png?v=1795493910487",
  "crop": {
   "x": 24,
   "y": 21,
   "zoom": 2.1
  },
  "cropFull": {
   "x": 31.85,
   "y": 33.61,
   "zoom": 1.42
  }
 },
 "scrunge_toru": {
  "crop": {
   "x": 26,
   "y": 17.36627720099815,
   "zoom": 4
  },
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
  ],
  "cropFull": {
   "x": 27.72,
   "y": 18.9,
   "zoom": 3.08
  }
 },
 "scrunge_noxx_darmen": {
  "crop": {
   "x": 52.008253355340635,
   "y": 25,
   "zoom": 1
  },
  "cropFull": {
   "x": 51.76,
   "y": 25.09,
   "zoom": 1.3
  },
  "role": "Tank",
  "text": "",
  "onPlay": [],
  "moves": [
   {
    "name": "Dad Hug",
    "cost": 2,
    "ability": true,
    "text": "Your other Characters heal 3 HP.",
    "ops": [
     [
      "healAll",
      3
     ]
    ]
   },
   {
    "name": "Piggyback Tackle",
    "cost": 2,
    "power": 4
   }
  ]
 },
 "scrunge_robo_cat_girl": {
  "crop": {
   "x": 40,
   "y": 48.81594300434664,
   "zoom": 1.2
  },
  "cropFull": {
   "x": 12.67,
   "y": 50,
   "zoom": 1
  }
 },
 "jangle_bee_boy": {
  "crop": {
   "x": 8,
   "y": 11.389838556784975,
   "zoom": 2.3
  },
  "cropFull": {
   "x": 5.2,
   "y": 12.3,
   "zoom": 1.93
  }
 },
 "jimmy_arhakoth": {
  "cost": 2,
  "cropFull": {
   "x": 50.7,
   "y": 100,
   "zoom": 1.16
  },
  "art": "art/local/jimmy_arhakoth-custom.png?v=1795514960029",
  "crop": {
   "x": 64.4,
   "y": 52.3,
   "zoom": 1.42
  },
  "role": "Tank",
  "unkillable": true,
  "text": "Can’t be killed: once per game, an attack that would defeat Arhakoth leaves it on 1 HP.",
  "moves": [
   {
    "name": "Squish",
    "cost": 1,
    "power": 3
   },
   {
    "name": "Unkillable Slam",
    "cost": 3,
    "power": 5
   }
  ],
  "disadv": false
 },
 "jegg_abigaia_v2": {
  "name": "Abigaia",
  "moves": [
   {
    "name": "Stab",
    "cost": 1,
    "power": 3
   },
   {
    "name": "Fire!",
    "cost": 3,
    "power": 5
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
  ],
  "cropFull": {
   "x": 50,
   "y": 100,
   "zoom": 1.48
  }
 },
 "jangle_fenrik": {
  "moves": [
   {
    "name": "Won't Shut Up",
    "cost": 1,
    "power": 2,
    "text": "On a hit, opponent -1 Creativity.",
    "onHit": [
     [
      "goof",
      "opp",
      -1
     ]
    ]
   },
   {
    "name": "Sad Howl",
    "cost": 3,
    "power": 5
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
  ],
  "art": "art/local/jangle_drow_paladin-custom.png?v=1795518528066",
  "crop": {
   "x": 64.17,
   "y": 58.57,
   "zoom": 4
  },
  "cropFull": {
   "x": 65.46,
   "y": 100,
   "zoom": 1.48
  }
 },
 "scrunge_corin": {
  "moves": [
   {
    "name": "Wing Dust",
    "cost": 1,
    "power": 3
   },
   {
    "name": "Lamp Dive",
    "cost": 2,
    "power": 5,
    "text": "On a hit, Salem takes 2 damage. Drawn to the light.",
    "onHit": [
     [
      "hp",
      "self",
      2
     ]
    ]
   }
  ],
  "cropFull": {
   "x": 100,
   "y": 100,
   "zoom": 1.29
  },
  "art": "art/local/scrunge_corin-custom.png?v=1795574739888",
  "crop": {
   "x": 100,
   "y": 61.82,
   "zoom": 1.67
  },
  "role": "Glass Cannon"
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
    "name": "Cane Whack",
    "cost": 2,
    "power": 4
   }
  ],
  "cropFull": {
   "x": 100,
   "y": 11.35,
   "zoom": 1.29
  },
  "role": "Tank",
  "mod": {
   "oppSick": 1
  },
  "text": "House Rules: your opponent’s new Characters can’t attack the turn they’re played."
 },
 "scrunge_nexus": {
  "cost": 2,
  "cropFull": {
   "x": 81.96,
   "y": 4.38,
   "zoom": 1.25
  }
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
    "power": 5
   }
  ],
  "hp": 4,
  "cropFull": {
   "x": 13.4,
   "y": 20,
   "zoom": 1.75
  }
 },
 "jangle_chi_chi": {
  "art": "art/local/jangle_chi_chi-custom.png?v=1795516669173"
 },
 "jangle_enoch_son": {
  "cropFull": {
   "x": 7.4,
   "y": 0,
   "zoom": 2.08
  }
 },
 "jangle_enoch": {
  "crop": {
   "x": 17.38,
   "y": 69.8,
   "zoom": 4
  },
  "cropFull": {
   "x": 13.5,
   "y": 88.31,
   "zoom": 2.321
  },
  "art": "art/local/jangle_enoch-custom.png?v=1795518672798",
  "moves": [
   {
    "name": "Grumble",
    "cost": 1,
    "power": 2
   },
   {
    "name": "Hard Stare",
    "cost": 3,
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
 "jangle_grim": {
  "cropFull": {
   "x": 37,
   "y": 38.6,
   "zoom": 2.16
  }
 },
 "jangle_rose": {
  "cropFull": {
   "x": 27.7,
   "y": 29.9,
   "zoom": 1.37
  }
 },
 "jangle_unnamed_ocs": {
  "crop": {
   "x": 52.9,
   "y": 14.87,
   "zoom": 1.7
  },
  "cropFull": {
   "x": 49,
   "y": 17.3,
   "zoom": 1.45
  },
  "role": "Soak",
  "cost": 0,
  "hp": 3,
  "text": "",
  "onPlay": [],
  "moves": [
   {
    "name": "Pan Bonk",
    "cost": 1,
    "power": 2
   }
  ]
 },
 "jangle_vesper": {
  "cropFull": {
   "x": 0,
   "y": 0,
   "zoom": 1.48
  }
 },
 "lord_osric_hayden": {
  "crop": {
   "x": 53.2,
   "y": 4.53,
   "zoom": 1.76
  },
  "cropFull": {
   "x": 50,
   "y": 0,
   "zoom": 1.32
  }
 },
 "jegg_aj": {
  "cropFull": {
   "x": 1.9,
   "y": 50.1,
   "zoom": 2.57
  },
  "role": "Loner",
  "mod": {
   "atk": 2,
   "if": "alone"
  },
  "text": "Lonely: your attacks get +2 power while AJ is your only Character.",
  "moves": [
   {
    "name": "Lonely Stare",
    "cost": 1,
    "power": 2
   },
   {
    "name": "Strike Back",
    "cost": 2,
    "power": 3
   }
  ]
 },
 "jegg_anxio": {
  "cropFull": {
   "x": 0,
   "y": 50,
   "zoom": 1
  },
  "moves": [
   {
    "name": "Worried Stomp",
    "cost": 1,
    "power": 2
   },
   {
    "name": "Panic Crush",
    "cost": 3,
    "power": 4,
    "text": "On a hit, you gain 1 Creativity.",
    "onHit": [
     [
      "goof",
      "me",
      1
     ]
    ]
   }
  ],
  "disadv": false,
  "text": ""
 },
 "jegg_brulee": {
  "cropFull": {
   "x": 0,
   "y": 50,
   "zoom": 1
  },
  "role": "Blaster",
  "text": "",
  "onPlay": [],
  "moves": [
   {
    "name": "Honey Tail",
    "cost": 1,
    "power": 2,
    "text": "On a hit, Brûlée heals 1 HP.",
    "onHit": [
     [
      "hp",
      "self",
      -1
     ]
    ]
   },
   {
    "name": "Fire Breath",
    "cost": 2,
    "power": 3,
    "text": "On a hit, 1 damage to each of their other Characters.",
    "onHit": [
     [
      "splash",
      1
     ]
    ]
   }
  ]
 },
 "jegg_jenosu": {
  "cropFull": {
   "x": 0,
   "y": 50,
   "zoom": 1
  },
  "role": "Bruiser",
  "moves": [
   {
    "name": "Meme Bark",
    "cost": 1,
    "power": 3
   },
   {
    "name": "Zoomies",
    "cost": 2,
    "power": 3,
    "text": "On a hit, Jenosu can use a move again this turn.",
    "onHit": [
     [
      "ready"
     ]
    ]
   }
  ]
 },
 "jegg_lyra": {
  "cropFull": {
   "x": 55.6,
   "y": 13.4,
   "zoom": 1.75
  },
  "role": "Finisher",
  "text": "",
  "onPlay": [],
  "moves": [
   {
    "name": "Quick Doodle",
    "cost": 1,
    "power": 2
   },
   {
    "name": "Big Finish",
    "cost": 3,
    "power": 4,
    "text": "+3 power if your opponent has 10 or more Boredom.",
    "late": 3
   }
  ]
 },
 "jegg_pomegranate": {
  "cropFull": {
   "x": 46.8,
   "y": 16.7,
   "zoom": 1.53
  },
  "moves": [
   {
    "name": "Seed Spit",
    "cost": 1,
    "power": 2
   },
   {
    "name": "Juicy Burst",
    "cost": 3,
    "power": 5
   }
  ]
 },
 "jegg_u2": {
  "cropFull": {
   "x": 50,
   "y": 0,
   "zoom": 1.48
  }
 },
 "jegg_yooperlite": {
  "cropFull": {
   "x": 50,
   "y": 0,
   "zoom": 1.24
  },
  "moves": [
   {
    "name": "Molten Drip",
    "cost": 1,
    "power": 2
   },
   {
    "name": "Lava Bloom",
    "cost": 3,
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
 "scrunge_acer": {
  "art": "art/local/scrunge_acer-custom.png?v=1795576433589",
  "crop": {
   "x": 50,
   "y": 12,
   "zoom": 1.2
  },
  "cropFull": {
   "x": 50,
   "y": 0,
   "zoom": 1
  }
 },
 "scrunge_anna_lee": {
  "cropFull": {
   "x": 43.07,
   "y": 4.42,
   "zoom": 1.85
  },
  "text": "When played and at the start of your turn: +1 Creativity."
 },
 "scrunge_atlas": {
  "cropFull": {
   "x": 83.47,
   "y": 5.2,
   "zoom": 2.9
  },
  "moves": [
   {
    "name": "Sunbeam",
    "cost": 1,
    "power": 2
   },
   {
    "name": "Deity Form",
    "cost": 3,
    "power": 6
   }
  ]
 },
 "scrunge_calytrix_and_noli": {
  "cropFull": {
   "x": 28.79,
   "y": 12.62,
   "zoom": 2.82
  },
  "role": "Leader",
  "text": "",
  "onPlay": [],
  "moves": [
   {
    "name": "Cal Jumper",
    "cost": 1,
    "power": 2
   },
   {
    "name": "Sillies Assemble",
    "cost": 2,
    "power": 2,
    "text": "+1 power for each other Character you have, up to +2.",
    "perAlly": 1,
    "allyMax": 2
   }
  ]
 },
 "scrunge_monday": {
  "cropFull": {
   "x": 13.68,
   "y": 8.2,
   "zoom": 3.65
  }
 },
 "scrunge_orpheus": {
  "cropFull": {
   "x": 3.49,
   "y": 0.26,
   "zoom": 2.34
  }
 },
 "scrunge_maxi": {
  "cropFull": {
   "x": 0,
   "y": 100,
   "zoom": 1.57
  },
  "role": "Striker",
  "def": 12,
  "hp": 3,
  "shy": true,
  "text": "Scaredy: can’t block while you have another Character.",
  "onPlay": [],
  "moves": [
   {
    "name": "Silly Face",
    "cost": 1,
    "power": 3
   },
   {
    "name": "Scrung Stare",
    "cost": 2,
    "power": 4
   }
  ]
 },
 "scrunge_maxos": {
  "cropFull": {
   "x": 0,
   "y": 1.05,
   "zoom": 1.45
  }
 },
 "scrunge_mayree": {
  "cropFull": {
   "x": 80.13,
   "y": 17.73,
   "zoom": 2.14
  },
  "art": "art/local/scrunge_mayree-custom.png?v=1795517897737",
  "crop": {
   "x": 8.31,
   "y": 51.81,
   "zoom": 3.42
  }
 },
 "scrunge_scugs": {
  "cropFull": {
   "x": 44.07,
   "y": 50,
   "zoom": 1
  },
  "art": "art/local/scrunge_scugs-custom.png?v=1795517442090",
  "crop": {
   "x": 62.98,
   "y": 58.8,
   "zoom": 1.19
  },
  "moves": [
   {
    "name": "Slug Slam",
    "cost": 1,
    "power": 2
   },
   {
    "name": "Three-Way Squish",
    "cost": 2,
    "power": 4,
    "text": "On a hit, flip a coin. Heads: 1 more damage to the blocker.",
    "onHit": [
     [
      "flip",
      [
       [
        "hp",
        "target",
        1
       ]
      ]
     ]
    ]
   }
  ]
 },
 "scrunge_wiffle_salamander": {
  "art": "art/local/scrunge_wiffle_salamander-custom.png?v=1795517846279",
  "crop": {
   "x": 58.01,
   "y": 81.93,
   "zoom": 1.45
  },
  "cropFull": {
   "x": 55.44,
   "y": 50,
   "zoom": 1
  }
 },
 "scrunge_wiffle_v2": {
  "cropFull": {
   "x": 44.82,
   "y": 71.1,
   "zoom": 1
  },
  "art": "art/local/scrunge_wiffle_v2-custom.png?v=1795515363413",
  "crop": {
   "x": 44.83,
   "y": 59.31,
   "zoom": 1
  },
  "moves": [
   {
    "name": "Horn Bonk",
    "cost": 1,
    "power": 3
   },
   {
    "name": "Ring Flourish",
    "cost": 3,
    "power": 5
   }
  ]
 },
 "scrunge_wiffle_v3": {
  "crop": {
   "x": 41.98,
   "y": 25.4,
   "zoom": 1.81
  },
  "cropFull": {
   "x": 32.02,
   "y": 45.18,
   "zoom": 1
  },
  "art": "art/local/scrunge_wiffle_v3-custom.png?v=1795517767139"
 },
 "scrunge_dusk": {
  "art": "art/local/scrunge_dusk.png?v=1795576433589",
  "crop": {
   "x": 31.77,
   "y": 14.31,
   "zoom": 1.394
  },
  "cropFull": {
   "x": 19.52,
   "y": 0,
   "zoom": 1.162
  }
 },
 "scrunge_june": {
  "art": "art/local/scrunge_june.png?v=1795576433589",
  "crop": {
   "x": 51.47,
   "y": 12,
   "zoom": 1.2
  },
  "cropFull": {
   "x": 54.35,
   "y": 0,
   "zoom": 1.24
  }
 },
 "lord_fey": {
  "art": "art/local/lord_fey.png?v=1795577074263",
  "crop": {
   "x": 71.57,
   "y": 13.75,
   "zoom": 4
  },
  "cropFull": {
   "x": 71.01,
   "y": 0,
   "zoom": 1.162
  },
  "role": "Glass Cannon",
  "moves": [
   {
    "name": "Claw Rake",
    "cost": 1,
    "power": 3
   },
   {
    "name": "Glowing Stare",
    "cost": 2,
    "power": 3,
    "text": "Ignores armour.",
    "pierce": true
   }
  ]
 },
 "lord_fey_v2": {
  "art": "art/local/lord_fey_v2.png?v=1795577074263",
  "crop": {
   "x": 27.78,
   "y": 8.5,
   "zoom": 1.859
  },
  "cropFull": {
   "x": 49.67,
   "y": 0,
   "zoom": 1.822
  }
 },
 "scrunge_alto": {
  "role": "Soak",
  "cost": 0,
  "hp": 2,
  "disadv": true,
  "text": "Tough: +1 armour.",
  "moves": [
   {
    "name": "Silent Stare",
    "cost": 1,
    "power": 1
   }
  ]
 },
 "jangle_evil_oc": {
  "role": "Thief",
  "text": "",
  "onPlay": [],
  "moves": [
   {
    "name": "Menacing Glare",
    "cost": 1,
    "power": 3
   },
   {
    "name": "Evil Monologue",
    "cost": 2,
    "ability": true,
    "text": "Opponent -2 Creativity, you +2. (Nobody asked.)",
    "ops": [
     [
      "goof",
      "opp",
      -2
     ],
     [
      "goof",
      "me",
      2
     ]
    ]
   }
  ]
 },
 "anonagon_jeremy": {
  "role": "Skirmisher",
  "text": "",
  "onPlay": [],
  "moves": [
   {
    "name": "Gust Jab",
    "cost": 1,
    "power": 2,
    "text": "On a hit, +1 Action.",
    "onHit": [
     [
      "actions",
      "me",
      1
     ]
    ]
   },
   {
    "name": "Tailwind Swoop",
    "cost": 2,
    "power": 4
   }
  ]
 },
 "jangle_dizzy": {
  "moves": [
   {
    "name": "Dizzy Spin",
    "cost": 1,
    "power": 3
   },
   {
    "name": "Gummy Breath",
    "cost": 2,
    "power": 4,
    "text": "On a hit, flip a coin. Heads: 1 more damage to the blocker. Tails: +1 Creativity.",
    "onHit": [
     [
      "flip",
      [
       [
        "hp",
        "target",
        1
       ]
      ],
      [
       [
        "goof",
        "me",
        1
       ]
      ]
     ]
    ]
   }
  ]
 },
 "captain_moth": {
  "goof": 5,
  "text": "Super, 5 Creativity: Wing Dust. Opponent -4 Creativity, and clear 3 of your Boredom.",
  "ability": [
   [
    "goof",
    "opp",
    -4
   ],
   [
    "bore",
    "me",
    -3
   ]
  ]
 },
 "captain_xee": {
  "text": "Super, 6 Creativity: Supernova. Opponent +3 Boredom and -2 Creativity.",
  "ability": [
   [
    "bore",
    "opp",
    3
   ],
   [
    "goof",
    "opp",
    -2
   ]
  ]
 },
 "captain_rotgrease": {
  "goof": 4,
  "text": "Super, 4 Creativity: Grind. Opponent +2 Boredom.",
  "ability": [
   [
    "bore",
    "opp",
    2
   ]
  ]
 },
 "captain_anonagon": {
  "goof": 4,
  "text": "Super, 4 Creativity: Crunch Time. +4 Actions this turn.",
  "ability": [
   [
    "actions",
    "me",
    4
   ]
  ]
 },
 "captain_hamish": {
  "text": "Super, 5 Creativity: Plot Twist. Opponent -3 Creativity and +2 Boredom.",
  "ability": [
   [
    "goof",
    "opp",
    -3
   ],
   [
    "bore",
    "opp",
    2
   ]
  ],
  "goof": 5
 },
 "captain_wawa": {
  "text": "Super, 3 Creativity: Random Button. Flip a coin. Heads: opponent +3 Boredom. Tails: nothing happens.",
  "ability": [
   [
    "flip",
    [
     [
      "bore",
      "opp",
      3
     ]
    ],
    []
   ]
  ],
  "goof": 3
 }
};
for (const c of [...CAPTAINS, ...CARDS]) Object.assign(c, OVERRIDES[c.id] || {});
