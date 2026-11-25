# Design pass, Nov 2026: Evils out, sharper Characters, softer openings

Branch `worktree-agent-a993c451fdcfc7a38` (started from `37a48b9`, main `94a8ba7` merged in; tests and the final sims ran on the
merged code). Nothing here is live. See every changed card old next to new in
`design/cards.html` (needs the main checkout's server on port 8123 for art) or the screenshots in `design/shots/`.

**Contents:** 1 Summary · 2 Rule changes · 3 New Items (Evils retired) · 4 Reworked Characters · 5 Boredom riders removed · 6 Supers ·
7 Card audit · 8 Sim results · 9 Engine notes for the lead · 10 Open questions

## 1. Summary

| Owner decision | Done | Where |
|---|---|---|
| Remove Evils, replace with Items that last N turns or N uses | 7 new Items, same card numbers, owners keep copies via `REPLACED` | `js/cards.js` (`EVIL_SWAP`, `REPLACED`), engine in `js/game.js` |
| Rework ~15 bland Characters | 15 reworked (incl. 2 free "soak" cards) | `js/card-overrides.js` (written by `design/patch-overrides.js`) |
| No "opponent +1 Boredom on a hit" riders | All 22 removed (incl. coin-flip ones) | same |
| Weaker early direct hits | Variant (a): no direct attacks on each player's first turn | `NO_DIRECT_UNTIL` in `js/game.js` |
| Defender picks spill-over order | Built on main by another agent (`order` on defend); merged in unchanged | `js/game.js` |
| Moth Super ≥ 5, Super balance | Moth costs 5; Xee, RotGrease, Anonagon, Hamish, Wawa retuned over 5 CAPS rounds | section 6, 8.1 |
| Audit draw / Boredom effects | `test/cards.test.js` plays 55 card effects and checks the numbers | 1 real mismatch fixed (Anna-Lee) |

## 2. Rule changes

- **No direct attacks on each player's first turn** (game turns 1 and 2). An empty field can't be attacked yet; attacks into a blocker
  are fine. Card text in RULES updated. Picked over "half power" because it removes most of the opening burst while adding the least game
  length (table in 8.2).
- **Items with uses.** A new Item kind that stays until it has been used N times (tag shows "N uses" with a three-pip icon). Timed
  Items work as before (turns count down at the end of *your* turn), so "dur 2" covers exactly your opponent's next turn.
- **Evils are retired** from the built-in set. The engine still understands Evils (cleanse, purge, `oppEvilCost`) because submitted
  community cards can still be Evils; see open questions.

## 3. New Items (one per retired Evil)

Every Evil was swapped **in place** (same card number, same name, same rarity, keeps any art/crop). `REPLACED` maps old id → new id, so
collections, decks, favourites and display stands carry over. Starters, the 8 pre-built Captain decks and the pack lists use the new ids.
None of the Evils had art, so the Items show the placeholder too (art still to come).

| Card | Before | After | Why |
|---|---|---|---|
| **Evening Coil**<br>`item_evening_coil_v2` | Evil, forever, cost 1. Vesper stays coiled. Opponent's Evils cost them 1 more Action. | 2 uses, cost 1. Vesper waits, coiled. 2 uses: when one of your Characters blocks an attack, the attacker takes 2 damage. | Evil retired. Was a tax on Evils, which no longer exist. Now a 2-use counter-attack for blockers: Vesper strikes back. |
| **Won't Let You Rest**<br>`item_wont_let_rest_v2` | Evil, forever, cost 2. Fenrik never lets anyone rest. Opponent +1 Boredom at the start of each of their turns. | 3 uses, cost 0. Fenrik keeps everyone going. 3 uses: when one of your Characters attacks, draw a card. | Evil retired. Was +1 Boredom every turn forever (Boredom not from damage). Now a 3-use draw engine for attackers. |
| **Deity Form**<br>`item_deity_form_v2` | Evil, forever, cost 1. Atlas in his deity form looms over the room. Your Characters get +1 DEF while you have 0 Creativity. | 1 use, cost 0. Atlas will not fall. 1 use: the next time an attack would defeat one of your Characters, it stays on 1 HP and the rest of the damage stops. | Evil retired. Was +1 armour at 0 Creativity, rarely on. Now a one-shot save: a Character survives a lethal hit on 1 HP. |
| **Anxious Duo**<br>`item_anxious_duo_v2` | Evil, forever, cost 1. Enoch and his son overthink as a pair. While you have another Enoch on the field, opponent's attacks cost 1 more Action. | 2 turns, cost 0. Enoch and Son overthink everything. On your opponent’s next turn, their attacks cost 1 more Action. | Evil retired. Needed an Enoch on the field. Now a free card: one turn of attack tax on the opponent, no strings. |
| **Pollen Season**<br>`item_pollen_season_v2` | Evil, forever, cost 1. Wiffle is horrendously allergic. Start of opponent's turn: they lose 1 Creativity. | 2 turns, cost 0. Wiffle can’t stop sneezing. Opponent -1 Creativity, and they can’t use their Super on their next turn. | Evil retired. Was -1 Creativity every turn forever. Now a free Super block for one turn plus -1 Creativity: timing matters. |
| **Nicer Mondays**<br>`item_nicer_mondays_v2` | Evil, forever, cost 1. The day we all hate, but a little nicer now. Start of your turn: your Boredom -1. | 3 uses, cost 1. The day we all hate, a little softer. 3 uses: when an attack would give you Boredom, you get 2 less. | Evil retired. Was -1 Boredom every turn forever (best card in the old sim). Now 3 uses of softening attacks that reach your Boredom. |
| **Entity Form**<br>`item_entity_form_v2` | Evil, forever, cost 2. Orpheus drops the human form. Whenever you gain Creativity, gain 1 more. Opponent's attacks cost 1 more Action. | 2 turns, cost 0. Orpheus drops the human form. Your next turn: your attacks get +2 power. | Evil retired. Was an always-on engine plus attack tax. Now a delayed burst: set it up, swing hard next turn. |

## 4. Reworked Characters (IDs, names, art kept)

Aim: one readable hook per card, matching who the OC is. Two are deliberately plain soak cards (owner: a free one-move Character that
exists to take hits is fine).

| Card | Before | After | Why |
|---|---|---|---|
| **The Escapees**<br>`jangle_unnamed_ocs` | FREE, 2 HP, armour 0. When played: +1 Creativity.<br>Pan Bonk (1A, power 2)<br>Great Escape (3A, power 4): On a hit, opponent +1 Boredom. | FREE, 4 HP, armour 0<br>Pan Bonk (1A, power 2) | Bland (+1 Creativity, Boredom rider). Now a FREE one-move soak: 4 HP that exists to take hits. |
| **Alto**<br>`scrunge_alto` | FREE, 2 HP, armour 0<br>Silent Stare (1A, power 2)<br>Sillie Quote (3A, power 3): On a hit, opponent +1 Boredom. | FREE, 2 HP, armour 1. Tough: +1 armour.<br>Silent Stare (1A, power 1) | Bland (Boredom rider). Now a FREE soak with Tough armour and a 1-power poke. Silent, sturdy. |
| **Favourite Villain**<br>`jangle_evil_oc` | cost 1, 4 HP, armour 1. When played: +1 Creativity.<br>Menacing Glare (1A, power 3)<br>Evil Monologue (3A, power 4): On a hit, opponent +1 Boredom. (Nobody asked.) | cost 1, 4 HP, armour 1<br>Menacing Glare (1A, power 3)<br>Evil Monologue (2A, ability): Opponent -2 Creativity, you +2. (Nobody asked.) | Bland (+1 Creativity, Boredom rider). A villain who monologues: steals 2 Creativity. |
| **Fey**<br>`lord_fey` | cost 1, 4 HP, armour 0<br>Claw Rake (1A, power 3)<br>Glowing Stare (3A, power 4): On a hit, opponent +1 Boredom. | cost 1, 4 HP, armour 0<br>Claw Rake (1A, power 3)<br>Glowing Stare (2A, power 3): Ignores armour. | Bland (Boredom rider). Glass cannon whose stare ignores armour: the answer to tanks. |
| **Jeremy**<br>`anonagon_jeremy` | cost 1, 5 HP, armour 0. When played: +1 Creativity.<br>Gust Jab (1A, power 3)<br>Tailwind Swoop (2A, power 4): On a hit, flip a coin. Heads: +1 Creativity. | cost 1, 5 HP, armour 0<br>Gust Jab (1A, power 2): On a hit, +1 Action.<br>Tailwind Swoop (2A, power 4) | Bland (Creativity on play and on a coin). Windweaver tempo: a jab that refunds its Action when it lands. |
| **AJ**<br>`jegg_aj` | FREE, 4 HP, armour 0<br>Lonely Stare (1A, power 2)<br>Strike Back (2A, power 4): On a hit, you gain 1 Creativity. | FREE, 4 HP, armour 0. Lonely: your attacks get +2 power while AJ is your only Character.<br>Lonely Stare (1A, power 2)<br>Strike Back (2A, power 3) | Bland (+1 Creativity on hit). Lonely: hits much harder when he is your only Character. |
| **Brûlée**<br>`jegg_brulee` | cost 1, 4 HP, armour 0. When played: +1 Creativity.<br>Honey Tail (1A, power 3)<br>Fire Breath (3A, power 4): On a hit, opponent +1 Boredom. | cost 1, 4 HP, armour 0<br>Honey Tail (1A, power 2): On a hit, Brûlée heals 1 HP.<br>Fire Breath (2A, power 3): On a hit, 1 damage to each of their other Characters. | Bland (+1 Creativity, Boredom rider). HiveWing: honey heals, fire breath splashes the whole field. |
| **Jenosu**<br>`jegg_jenosu` | cost 1, 5 HP, armour 1<br>Meme Bark (1A, power 3)<br>Zoomies (2A, power 4): On a hit, you gain 1 Creativity. | cost 1, 5 HP, armour 1<br>Meme Bark (1A, power 3)<br>Zoomies (2A, power 3): On a hit, Jenosu can use a move again this turn. | Bland (+1 Creativity on hit). Meme dog zoomies: a hit lets him go again. |
| **Lyra**<br>`jegg_lyra` | cost 1, 5 HP, armour 1. When played: +1 Creativity.<br>Quick Doodle (1A, power 2)<br>Big Finish (3A, power 5): On a hit, flip a coin. Heads: +1 Boredom. | cost 1, 5 HP, armour 1<br>Quick Doodle (1A, power 2)<br>Big Finish (3A, power 4): +3 power if your opponent has 10 or more Boredom. | Bland (+1 Creativity, coin Boredom). Finisher: Big Finish gets +3 once the opponent is at 10 Boredom. |
| **Calytrix**<br>`scrunge_calytrix_and_noli` | cost 1, 6 HP, armour 1. When played: +1 Creativity.<br>Cal Jumper (1A, power 2)<br>Sillies Assemble (3A, power 4): On a hit, opponent +1 Boredom. | cost 1, 6 HP, armour 1<br>Cal Jumper (1A, power 2)<br>Sillies Assemble (2A, power 2): +1 power for each other Character you have, up to +2. | Bland (+1 Creativity, Boredom rider). "Sillies Assemble": stronger with every friend on the field. |
| **Salem**<br>`scrunge_corin` | FREE, 4 HP, armour 0<br>Wing Dust (1A, power 3)<br>Lamp Dive (2A, power 4): On a hit, opponent +1 Boredom. | FREE, 4 HP, armour 0<br>Wing Dust (1A, power 3)<br>Lamp Dive (2A, power 5): On a hit, Salem takes 2 damage. Drawn to the light. | Bland (Boredom rider). Moth to a lamp: a big dive that burns Salem too. |
| **Maxi**<br>`scrunge_maxi` | cost 1, 5 HP, armour 1. When played: +1 Creativity.<br>Silly Face (1A, power 2)<br>Scrung Stare (3A, power 4): On a hit, opponent +1 Boredom. | cost 1, 4 HP, armour 0. Scaredy: can’t block while you have another Character.<br>Silly Face (1A, power 3)<br>Scrung Stare (2A, power 4) | Bland (+1 Creativity, Boredom rider). Scaredy striker: hits well but hides behind others instead of blocking. |
| **Noxx and D'Armen**<br>`scrunge_noxx_darmen` | cost 1, 6 HP, armour 2. When played: +1 Creativity.<br>Dad Hug Block (1A, power 2)<br>Piggyback Tackle (2A, power 4): On a hit, flip a coin. Heads: +1 Creativity. | cost 1, 6 HP, armour 2<br>Dad Hug (1A, ability): Your other Characters heal 2 HP.<br>Piggyback Tackle (2A, power 4) | Bland (+1 Creativity, coin Creativity). Dad and daughter: Dad Hug heals your whole team. |
| **Alek**<br>`scrunge_alek` | cost 1, 7 HP, armour 2<br>Grumble (1A, power 3)<br>House Rules (2A, power 4): On a hit, opponent +1 Boredom. | cost 1, 7 HP, armour 2. House Rules: your opponent’s new Characters can’t attack the turn they’re played.<br>Grumble (1A, power 3)<br>Cane Whack (2A, power 4) | Bland UR tank (Boredom rider). Old man House Rules: enemy newcomers wait a turn before attacking. |
| **Arhakoth**<br>`jimmy_arhakoth` | cost 2, 7 HP, armour 3. Can't be killed: Tough, +1 armour.<br>Squish (1A, power 3)<br>Unkillable Slam (3A, power 5): On a hit, opponent +1 Boredom. | cost 2, 7 HP, armour 3. Tough. Can’t be killed: once per game, an attack that would defeat Arhakoth leaves it on 1 HP.<br>Squish (1A, power 3)<br>Unkillable Slam (3A, power 5) | Bland UR tank (Boredom rider). "Can’t be killed", for real: survives one lethal hit per game. |
| **Anna-Lee**<br>`scrunge_anna_lee` | cost 1, 4 HP, armour 0. Start of your turn: +1 Creativity.<br>Tapioca Toss (1A, power 2)<br>Brown Sugar Rush (2A, power 3): On a hit: +1 Creativity. | cost 1, 4 HP, armour 0. When played and at the start of your turn: +1 Creativity.<br>Tapioca Toss (1A, power 2)<br>Brown Sugar Rush (2A, power 3): On a hit: +1 Creativity. | Text fix: it also gave +1 Creativity when played, which the text didn’t say. |

## 5. "+1 Boredom on a hit" riders removed

Replaced with something else that fits, or with nothing where the move was already good for its cost.

| Card | Before | After | Why |
|---|---|---|---|
| **Fenrik**<br>`jangle_fenrik` | cost 1, 6 HP, armour 0. Whenever this lands a hit: +1 Creativity.<br>Won't Shut Up (1A, power 2): On a hit, opponent +1 Boredom.<br>Sad Howl (3A, power 5): On a hit, opponent +1 Boredom. | cost 1, 6 HP, armour 0. Whenever this lands a hit: +1 Creativity.<br>Won't Shut Up (1A, power 2): On a hit, opponent -1 Creativity.<br>Sad Howl (3A, power 5) | Boredom riders removed. Won’t Shut Up now drains 1 Creativity instead. |
| **Enoch**<br>`jangle_enoch` | cost 1, 4 HP, armour 1. Your attacks get +1 power while you have another Enoch on the field.<br>Grumble (1A, power 2)<br>Hard Stare (3A, power 4): On a hit, opponent +1 Boredom. | cost 1, 4 HP, armour 1. Your attacks get +1 power while you have another Enoch on the field.<br>Grumble (1A, power 2)<br>Hard Stare (3A, power 4): On a hit, 1 more damage to the blocker. | Boredom rider removed: 1 more damage to the blocker instead. |
| **anxiø**<br>`jegg_anxio` | cost 1, 6 HP, armour 3. Tough: +1 armour.<br>Worried Stomp (1A, power 2)<br>Panic Crush (3A, power 4): On a hit, opponent +1 Boredom and you +1 Creativity. | cost 1, 6 HP, armour 3. Tough: +1 armour.<br>Worried Stomp (1A, power 2)<br>Panic Crush (3A, power 4): On a hit, you gain 1 Creativity. | Boredom rider removed; keeps the Creativity. |
| **Pomegranate**<br>`jegg_pomegranate` | FREE, 2 HP, armour 0. When played: draw a card.<br>Seed Spit (1A, power 2)<br>Juicy Burst (3A, power 4): On a hit, opponent +1 Boredom. | FREE, 2 HP, armour 0. When played: draw a card.<br>Seed Spit (1A, power 2)<br>Juicy Burst (3A, power 5) | Boredom rider removed: +1 power instead. |
| **Sapphire**<br>`jegg_sapphire` | cost 2, 5 HP, armour 0. When played: opponent +1 Boredom.<br>Ice Shard (1A, power 2)<br>Frost Breath (2A, power 5): On a hit, opponent +1 Boredom. | cost 2, 5 HP, armour 0. When played: opponent +1 Boredom.<br>Ice Shard (1A, power 2)<br>Frost Breath (2A, power 5) | Boredom rider removed (already a strong 5-power move for 2). |
| **Yooperlite**<br>`jegg_yooperlite` | cost 1, 4 HP, armour 0. Whenever this lands a hit: +1 Creativity.<br>Molten Drip (1A, power 2)<br>Lava Bloom (3A, power 4): On a hit, opponent +1 Boredom. | cost 1, 4 HP, armour 0. Whenever this lands a hit: +1 Creativity.<br>Molten Drip (1A, power 2)<br>Lava Bloom (3A, power 4): On a hit, 1 more damage to the blocker. | Boredom rider removed: 1 more damage to the blocker instead. |
| **Atlas**<br>`scrunge_atlas` | cost 1, 6 HP, armour 1. When played: +1 Creativity.<br>Sunbeam (1A, power 2)<br>Deity Form (3A, power 6): On a hit, flip a coin. Heads: +1 Boredom. | cost 1, 6 HP, armour 1. When played: +1 Creativity.<br>Sunbeam (1A, power 2)<br>Deity Form (3A, power 6) | Coin Boredom removed (6 power for 3 stands on its own). |
| **Monterey**<br>`scrunge_monterey` | FREE, 2 HP, armour 0<br>Nibble (1A, power 2)<br>Monterey Jack Attack (2A, power 3): On a hit, flip a coin. Heads: +1 Boredom. | FREE, 2 HP, armour 0<br>Nibble (1A, power 2)<br>Monterey Jack Attack (2A, power 3): On a hit, flip a coin. Heads: 1 more damage to the blocker. | Coin Boredom becomes coin damage. |
| **Ivy, Nimbus and Kipper**<br>`scrunge_scugs` | cost 1, 6 HP, armour 1. When played: +1 Creativity.<br>Slug Slam (1A, power 2)<br>Three-Way Squish (2A, power 4): On a hit, flip a coin. Heads: opponent +1 Boredom. | cost 1, 6 HP, armour 1. When played: +1 Creativity.<br>Slug Slam (1A, power 2)<br>Three-Way Squish (2A, power 4): On a hit, flip a coin. Heads: 1 more damage to the blocker. | Coin Boredom becomes coin damage. |
| **Wiffle**<br>`scrunge_wiffle_v2` | cost 1, 4 HP, armour 0<br>Horn Bonk (1A, power 3)<br>Ring Flourish (3A, power 5): On a hit, opponent +1 Boredom. | cost 1, 4 HP, armour 0<br>Horn Bonk (1A, power 3)<br>Ring Flourish (3A, power 5) | Boredom rider removed. |
| **Abigaia**<br>`jegg_abigaia_v2` | FREE, 4 HP, armour 0<br>Stab (1A, power 3)<br>Fire! (3A, power 4): On a hit, opponent +1 Boredom. | FREE, 4 HP, armour 0<br>Stab (1A, power 3)<br>Fire! (3A, power 5) | Boredom rider removed: +1 power instead. |
| **Dizzy**<br>`jangle_dizzy` | FREE, 2 HP, armour 0. Can't attack the turn it's played.<br>Dizzy Spin (1A, power 3)<br>Gummy Breath (2A, power 4): On a hit, flip a coin. Heads: +1 Boredom for them. Tails: +1 Creativity for you. | FREE, 2 HP, armour 0. Can't attack the turn it's played.<br>Dizzy Spin (1A, power 3)<br>Gummy Breath (2A, power 4): On a hit, flip a coin. Heads: 1 more damage to the blocker. Tails: +1 Creativity. | Coin Boredom becomes coin damage. |

## 6. Supers

| Card | Before | After | Why |
|---|---|---|---|
| **Moth**<br>`captain_moth` | 4 Creativity: Wing Dust. Opponent -4 Creativity, and clear 2 of your Boredom. | 5 Creativity: Wing Dust. Opponent -4 Creativity, and clear 3 of your Boredom. | Owner: genuinely nerf. Super costs 5 (was 4); clears 3 Boredom (was 2) so it still does something when it lands. |
| **Xee**<br>`captain_xee` | 6 Creativity: Supernova. Opponent +4 Boredom and -3 Creativity. | 6 Creativity: Supernova. Opponent +3 Boredom and -2 Creativity. | Was the top Captain (~70%): +3 Boredom and -2 Creativity (was +4 and -3). |
| **RotGrease**<br>`captain_rotgrease` | 3 Creativity: Grind. Opponent +2 Boredom. | 4 Creativity: Grind. Opponent +2 Boredom. | Second best (62%): costs 4 (was 3). |
| **Anonagon**<br>`captain_anonagon` | 4 Creativity: Crunch Time. +3 Actions this turn. | 4 Creativity: Crunch Time. +4 Actions this turn. | Weakest by far (~30%): +4 Actions (was +3), same cost 4. His win rate swings hugely with Actions per Creativity (+3 for 3: ~37%, +3 for 2: 70%); +4 for 4 lands at 52%. |
| **Hamish**<br>`captain_hamish` | 3 Creativity: Plot Twist. Opponent -3 Creativity and +1 Boredom. | 5 Creativity: Plot Twist. Opponent -3 Creativity and +2 Boredom. | Swings hard on Boredom: +2 Boredom (was +1) but costs 5 (was 3). At cost 3 it won 78%. |
| **Wawa**<br>`captain_wawa` | 2 Creativity: Random Button. Flip a coin. Heads: opponent +3 Boredom. Tails: you +1 Boredom. | 3 Creativity: Random Button. Flip a coin. Heads: opponent +3 Boredom. Tails: nothing happens. | Tails no longer gives you Boredom, it just misses; costs 3 (was 2) to pay for that. |

## 7. Card audit (`test/cards.test.js`, runs inside `node test/game.test.js`)

- Reads each card's text, plays it on a mid-game board and checks the meters moved exactly as written: hand and deck size for draws,
  both Boredom meters, both Creativity meters, Actions. Covers every Item played from hand, every "When played:" text, every Super,
  every Character ability and "On a hit" text (attacking a 0-armour blocker), every start-of-turn text, and Bee Swarm-style
  "start of each of their next N turns" (counts the triggers). 55 effects in total. Coin flips are covered by the existing scripted tests.
- **Found:** Anna-Lee's text said only "Start of your turn: +1 Creativity" but she also gave +1 Creativity when played. Text fixed to
  say both. Everything else matched (Stolen WiFi Password and Brain Dump really draw 3, etc.).
- Also tests each new mechanic (uses counting down and the Item leaving, next-turn Items, Super block, attack tax, last stand,
  Boredom guard, counter-damage, pierce, splash, heal-all, re-ready, per-ally and late power, shy, enemy summoning sickness, unkillable)
  and the first-turn direct-hit rule.

## 8. Sim results

All with Boredom 15, Creativity capped at the Super cost, greedy bots. "Before" = base commit `37a48b9`. Raw logs in `design/sim/`.
Run them again with `node tools/simpar.js caps 1600 1,2,3` and `node tools/simpar.js starters|health 400 7`.

### 8.1 Captains (CAPS mode: each Captain on random decks vs random decks; target 45-55%)

Final, on the merged code (`design/sim/final-caps.txt`, 2 seeds, 3204 games):

| Captain | Super (final) | Before | **After** | seed 1 / seed 2 |
|---|---|---|---|---|
| Xee | 6: +3 Boredom, -2 Creativity | 69.5% | **57.4%** | 54 / 60 |
| Hamish | 5: -3 Creativity, +2 Boredom | 51.0% | **54.0%** | 49 / 59 |
| Anonagon | 4: +4 Actions | 29.5% | **52.0%** | 52 / 52 |
| RotGrease | 4: +2 Boredom | 62.0% | **47.3%** | 50 / 44 |
| Abby | 4: +2 Actions, clear 2 Boredom (unchanged) | 54.5% | **45.2%** | 45 / 45 |
| SnazzyRhyno | 5: +2 Actions, +2 Boredom (unchanged) | 48.5% | **44.7%** | 46 / 43 |
| Wawa | 3: coin, heads +3 Boredom, tails nothing | 45.5% | **43.9%** | 45 / 42 |
| Moth | 5: -4 Creativity, clear 3 Boredom | 46.0% | **41.7%** | 41 / 42 |

Spread went from 29.5-69.5% to 41.7-57.4%. Not all inside 45-55% yet: next nudges I'd try are Xee -1 Creativity drain only
(+3 Boredom, -1 Creativity) and Moth drawing a card on its Super (it must stay at cost 5). Seed-to-seed noise is about ±4 points at
this sample size, so treat anything within 45-55 as on target.

How it got there (all seeds pooled; i1 = first pass with the lead's proposed Supers; i6 onwards on the merged code):

| Captain | Before (3200) | i1 (3200) | i2 (3200) | i3 (4800) | i4 (4800) | i5 (4800) | i6 (4800) | i7 (3200) | final (3204) |
|---|---|---|---|---|---|---|---|---|---|
| Xee | 69.5% | 49.8 | 55.3 | 56.5 | 57.0 | 55.2 | 53.8 | 60.5 | 57.4 |
| RotGrease | 62.0% | 50.8 | 60.0 | 49.0 | 50.8 | 47.8 | 46.7 | 50.3 | 47.3 |
| Abby | 54.5% | 51.5 | 49.8 | 50.7 | 50.5 | 48.3 | 43.3 | 48.3 | 45.2 |
| Hamish | 51.0% | 45.8 | 41.0 | 77.7 | 60.5 | 51.5 | 50.0 | 51.3 | 54.0 |
| SnazzyRhyno | 48.5% | 49.0 | 51.3 | 49.8 | 49.2 | 48.3 | 48.5 | 58.0 | 44.7 |
| Moth | 46.0% | 36.3 | 46.5 | 46.8 | 45.5 | 44.2 | 42.2 | 44.3 | 41.7 |
| Wawa | 45.5% | 49.5 | 46.0 | 67.3 | 46.0 | 48.3 | 47.3 | 51.3 | 43.9 |
| Anonagon | 29.5% | 58.8 | 40.3 | 15.2 | 36.5 | 68.0 | 69.8 | 36.0 | 52.0 |

Anonagon per round: i1 +3 Actions & draw 2 for 3 · i2 +3 & draw 1 for 3 · i3 +2 & draw 2 for 3 · i4 +3 & draw 2 for 3 · i5 +4 for 3 ·
i6 +3 for 2 · i7 +2 & draw 1 for 2 · final +4 for 4.

What moved between rounds: i2 capped Calytrix (it had been feeding Action-heavy decks, which inflated Anonagon in i1). Hamish's and
Wawa's Boredom per Creativity is very sensitive (+2 Boredom for 3 Creativity won 78%). Anonagon swings with Actions per Creativity:
+2 Actions for 3 = 15%, +3 for 3 = ~38%, +4 for 3 = 68%, +3 for 2 = 70%, +4 for 4 = 52%. Because CAPS is zero-sum, one Captain
being far off moves everyone else (Xee and SnazzyRhyno jumped when Anonagon was weak in i7).

### 8.2 Whole-game health

| Setting | Before | After | Change |
|---|---|---|---|
| Starter decks: average game length (turns) | 14.6 | 20.0 | +5.4 |
| Starter decks: first player wins | 35% | 38% | +3 pts |
| Starter decks: Boredom dealt by end of turn 4 (both players) | 6.2 | 3.1 | halved |
| Starter decks: share of Boredom from direct hits | 17.5% | 18% | same |
| Random decks: average game length | 40.7 | 47.1 | +6.4 |
| Random decks: first player wins | 49.7% | 50.2% | same |

(400 starter games per row, greedy vs greedy; random decks 300 before / 400 after. Run on the merged code before the last Anonagon
tweak; the starter decks don't use Anonagon, and in random decks he is 1 Captain in 8.)

Direct-hit variants, measured after the card changes (400 games each), which picked rule (a):

| Variant | Starter: turns | Starter: 1st player wins | Starter: Boredom by T4 | Starter: direct share | Random: turns | Random: Boredom by T4 |
|---|---|---|---|---|---|---|
| no change | 19.9 | 41% | 4.4 | 25% | 38.0 | 1.18 |
| **(a) no direct attacks on first turns** | 21.8 | 38.5% | 3.0 | 18% | 39.0 | 0.89 |
| (b) direct attacks at half power | 24.2 | 38% | 3.05 | 11% | 39.9 | 0.93 |
| (c) both | 24.3 | 41% | 3.0 | 9% | 39.2 | 0.92 |

(a) and (b) cut the early Boredom equally, but (b) adds 4+ turns to every game and makes the rule harder to explain. Option tested for
game length: HP scale 1.0 on starters = 18.9 turns but the first player wins only 33%.

### 8.3 Cards (random decks, 900 games, `design/sim/iter2-cards.txt`)

"Edge" = win rate when played minus when held but not played; the average card sits around -7, so read it relatively. After the
second pass none of the reworked Characters is an outlier (the first pass caught Calytrix at +31 with 62 damage per play: no field
limit, fixed with the +2 cap). The new Items moved from the bottom (-11 to -20) towards Bee Swarm's level (-9) once Anxious Duo, Deity
Form, Entity Form, Won't Let You Rest and Pollen Season became free and Evening Coil hits for 2.

## 9. Engine notes for the lead

New card keys (all documented at the top of `js/cards.js`):

| Key | On | Meaning |
|---|---|---|
| `uses: n` | Item | stays until used n times; effect entry gets `uses`, the UI shows it (`renderFx` passes `e.uses`) |
| `next: true` | Item | its mod/triggers only work on your turns after the one it was played |
| `onAttack` / `onDefend` | Item | ops when one of your Characters attacks / blocks (onDefend's target = the attacker); each spends a use |
| `boreGuard: n` | Item | an attack that would give you Boredom gives n less (spends a use) |
| `lastStand: true` | Item | next Character an attack would defeat stays on 1 HP and the rest of that damage stops (spends a use) |
| `mod.oppNoSuper` | any source | opponent can't use their Super |
| `mod.oppSick` | any source | opponent's Characters can't attack the turn they're played |
| `mod.if: 'alone'` | any mod | only while it's your only Character |
| `pierce`, `perAlly: n`, `late: n` | attack move | ignores armour · +n power per other Character you have · +n power while opponent has 10+ Boredom (`movePower`) |
| `shy` | Character | can't be picked to block while you have a Character that isn't shy (`canBlock`) |
| `unkillable` | Character | once per game an attack that would defeat it leaves it on 1 HP (`f.saved`) |
| `['splash', n]`, `['ready']`, `['healAll', n]` | ops | n damage to each other enemy · this Character may move again · your other Characters heal n |

- Defend/attack code: only small insertions (power via `movePower`, armour via a local `arm()` for pierce, `guardBore` before Boredom,
  the 1-HP save, the `onDefend` trigger, the `canBlock` check). Merged with main's `order` and source tags: the two conflicts were
  side-by-side additions and both are kept. Item triggers tag their events (`src` = the Item, `when: 'attack' | 'defend'`), and
  `causeWhen` in `js/app.js` labels them "When attacking" / "When blocking".
- Bots: the practice bot (`js/app.js`), the ranked bots (`js/ranked.js`: `rkBlockers`, used by `rkBlock`, the low-tier random block and
  the safety fallback) and `tools/sim.js` only pick blockers that `canBlock` allows. Ranked pools are the pre-built decks; all 11 pass
  `deckProblems` with the new Item ids (test in `test/game.test.js`).
- UI follow-ups (not done, someone else's area): the move button and defend preview still show `power + statsOf().bonus`, so they
  don't include `perAlly`/`late` (use `movePower`); the defend picker should grey out shy Characters (`canBlock`); a "next turn" Item
  could show "from next turn" on its tag. The ranked bots' damage estimates also use `power + bonus` (fine, just slightly off for
  Calytrix/Lyra).
- `tools/audit-cards.js` (finds effects that change nothing) loads overrides and uses a turn-3 board now; it reports no wasted cards.
- `tools/sim.js`: `DIRECT=<until>,<half>`, `HEALTH=1|starters`; `tools/simpar.js` runs CAPS/HEALTH across processes and merges.
  `tools/simcards.js` now loads overrides and the Evil swap (it was reading raw cards-data, so new/overridden cards were missing).
- Line endings: this worktree checked out CRLF (`core.autocrlf=true`), which broke an existing test regex on `cloud.js`. I normalised
  the working files to LF; committed content is unchanged apart from the real edits.

## 10. Open questions for the owner

1. **Game length went up, not down.** Removing the Boredom riders (and the forever-Boredom Evils) is the main cause; the first-turn
   rule adds about 2 turns (8.2). Boredom 15 is your call, so I didn't touch it. I tried the obvious lever, HP scale 1.0 (from 1.2): it
   only saves about 1 turn and makes going first worse (33% win). Better candidates, untested: Boredom 12, or +1 power on the cheap
   (1-Action) attacks. Which would you like simmed?
2. **Going first.** On the old rules the second player won ~65% of starter-deck games (the first player gets 1 Action and 5 cards).
   After this pass it's ~60%: the first-turn rule mostly protects the first player, who used to eat the opening burst. Still lopsided;
   worth giving the first player 2 Actions on turn 1?
3. **Community Evils.** Built-in Evils are gone, but the card submission screen still offers "Evil" and the engine still runs them
   (cleanse, purge). Keep Evils as a community-only type, or turn submitted Evils into "Item, N uses" too?
4. **Item art.** None of the 7 Evils had art, so the new Items show the placeholder. Same names, so any Vesper / Fenrik / Atlas / Enoch /
   Wiffle / Orpheus art would fit.
5. **Soak cards.** The Escapees (4 HP) and Alto (Tough) are free, one-move bodies that exist to take hits, as you suggested. OK for
   two of them, or should one stay a normal attacker?
6. **"Can't be killed" Arhakoth** survives one lethal hit per game. Per game feels right for "can't be killed"; per turn was much too
   strong in testing on paper (it shrugs off one attack every turn).
7. **Maxi "Scaredy"** can't block while you have another Character. A fun downside, but it's the first card that limits blocking;
   the defend screen should grey him out (UI follow-up).
8. **Field size.** The engine has no limit on Characters in play (the bot stops at 3, and the board draws 3 slots). That's why
   Calytrix's "+1 per friend" needed a cap of +2. Is there meant to be a field limit?
