# Design pass, Nov 2026: Evils out, sharper Characters, softer openings

Branch `worktree-agent-a993c451fdcfc7a38` (base `37a48b9`). Nothing here is live. See every changed card old next to new in
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
| Defender picks spill-over order | **Not done here** (moved to another agent by the lead) | — |
| Moth Super ≥ 5, Super balance | Moth 5, Xee, RotGrease, Anonagon changed; re-checked in CAPS | section 6 |
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

CARDLIST_ITEMS

## 4. Reworked Characters (IDs, names, art kept)

Aim: one readable hook per card, matching who the OC is. Two are deliberately plain soak cards (owner: a free one-move Character that
exists to take hits is fine).

CARDLIST_CHARS

## 5. "+1 Boredom on a hit" riders removed

Replaced with something else that fits, or with nothing where the move was already good for its cost.

CARDLIST_RIDERS

## 6. Supers

CARDLIST_CAPS

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

All with Boredom 15, Creativity capped at the Super cost, greedy bots. "Before" = base commit `37a48b9`.

SIMTABLES

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
  the 1-HP save, the `onDefend` trigger, the `canBlock` check). No restructuring, so the spill-over-order work can land on top cleanly.
- UI follow-ups (not done, someone else's area): the move button and defend preview still show `power + statsOf().bonus`, so they
  don't include `perAlly`/`late` (use `movePower`); the defend picker should grey out shy Characters (`canBlock`); a "next turn" Item
  could show "from next turn" on its tag. The in-app bot already skips shy blockers (one-line change in `js/app.js`).
- `tools/sim.js`: `DIRECT=<until>,<half>`, `HEALTH=1|starters`; `tools/simpar.js` runs CAPS/HEALTH across processes and merges.
  `tools/simcards.js` now loads overrides and the Evil swap (it was reading raw cards-data, so new/overridden cards were missing).
- Line endings: this worktree checked out CRLF (`core.autocrlf=true`), which broke an existing test regex on `cloud.js`. I normalised
  the working files to LF; committed content is unchanged apart from the real edits.

## 10. Open questions for the owner

1. **Game length.** Removing the Boredom riders (and the forever-Boredom Evil) makes starter-deck games longer, and the first-turn rule
   adds a little more (numbers in 8.2). Boredom 15 is your call, so I didn't touch it. If you want games shorter again, the cleanest
   lever is HP: section 8.2 shows HP scale 1.0 (from 1.2). Want that, or a few more 1-power bumps on cheap attacks instead?
2. **Going first.** Starter-deck games were already won by the second player ~60% of the time (the first player gets 1 Action and
   5 cards). No direct attacks on turn 1 takes a little more from the first player. Worth giving the first player 2 Actions on turn 1?
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
