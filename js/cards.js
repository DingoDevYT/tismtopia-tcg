// The card list. Edit freely. Give a card art with `art: 'art/some-file.png'`;
// without it the card shows its type icon as a placeholder.
// PLACEHOLDERS ONLY: swap in the real Tismtopia people and OCs.
//
// Effects (all optional; `text` is just what's printed, these make it actually happen):
//   onPlay, onBreak (this breaks through), onTurnStart (start of your turn), onOppTurnStart, ability (costs 1 Action):
//     a list of [what, who, amount]   what: 'goof' | 'bore' | 'draw' | 'actions'   who: 'me' | 'opp'
//   mod: passive while the card is in play (a Captain's always is):
//     atk / def: +n to your Characters, add `if: 'noGoof'` for "only while you have 0 Goofiness"
//     oppAttackCost / oppEvilCost: extra Actions your opponent pays to attack / play Evils
//     goofBonus: extra Goofiness whenever you gain some
//   sick: can't attack the turn it's played.  disadv: attacks against it roll twice and keep the lower.
//   once: (Captains) ability usable once per turn.
// Anything these can't express still works by hand from the Adjust panel.
const DECK_SIZE = 20; // shortcut: the rules don't set a deck size yet, change once decided

const CAPTAINS = [
  { id: 'cap_lurker', type: 'captain', name: 'The Lurker', style: 'Defensive', text: 'Your Characters get +2 DEF while you have 0 Goofiness.', mod: { def: 2, if: 'noGoof' } },
  { id: 'cap_gremlin', type: 'captain', name: 'Keyboard Gremlin', style: 'Aggro', text: 'Once per turn, spend 1 Action: opponent +1 Boredom.', ability: [['bore', 'opp', 1]], once: true },
  { id: 'cap_mod', type: 'captain', name: 'Sleepless Mod', style: 'Control', text: 'Evil cards your opponent plays cost 2 Actions.', mod: { oppEvilCost: 1 } },
  { id: 'cap_clown', type: 'captain', name: 'Certified Clown', style: 'Goofy', text: 'Whenever you gain Goofiness, gain 1 more.', mod: { goofBonus: 1 } },
];

const CARDS = [
  { id: 'c_vc_goblin', type: 'character', name: 'VC Goblin', atk: 2, def: 12, hp: 3, text: 'When played: +1 Goofiness.', onPlay: [['goof', 'me', 1]] },
  { id: 'c_reply_guy', type: 'character', name: 'Reply Guy', atk: 1, def: 10, hp: 4, text: 'Ability (1 Action): opponent +1 Boredom.', ability: [['bore', 'opp', 1]] },
  { id: 'c_lagger', type: 'character', name: 'Laggy Larry', atk: 1, def: 14, hp: 2, text: 'Attacks against Larry roll twice and keep the lower.', disadv: true },
  { id: 'c_night_owl', type: 'character', name: '3AM Night Owl', atk: 3, def: 8, hp: 2, text: "Can't attack the turn it's played.", sick: true },
  { id: 'm_sticker', type: 'character', main: true, name: 'Sticker Spammer', atk: 2, def: 13, hp: 4, text: 'Whenever this breaks through: +1 Goofiness.', onBreak: [['goof', 'me', 1]] },
  { id: 'b_ping', type: 'bit', name: '@everyone Ping', dur: 1, text: 'Opponent +2 Boredom.', onPlay: [['bore', 'opp', 2]] },
  { id: 'b_brainrot', type: 'bit', name: 'Brainrot Hour', dur: 2, text: 'Your Characters get +1 ATK.', mod: { atk: 1 } },
  { id: 'b_voice_crack', type: 'bit', name: 'Voice Crack', dur: 1, text: '+2 Goofiness.', onPlay: [['goof', 'me', 2]] },
  { id: 'e_slowmode', type: 'evil', name: 'Slowmode', text: "Opponent's attacks cost 2 Actions.", mod: { oppAttackCost: 1 } },
  { id: 'e_read', type: 'evil', name: 'Left on Read', text: "Start of opponent's turn: they gain +1 Boredom.", onOppTurnStart: [['bore', 'opp', 1]] },
];

// Ready-made legal deck so new players can battle straight away.
const STARTER = { name: 'Starter', captain: 'cap_gremlin', cards: { c_vc_goblin: 3, c_reply_guy: 3, c_lagger: 2, c_night_owl: 2, m_sticker: 1, b_ping: 3, b_brainrot: 2, b_voice_crack: 2, e_slowmode: 1, e_read: 1 } };

const RULES = [
  ['Goal', 'First to 5 Points wins. Both players start at 0 Points, 0 Goofiness and 0 Boredom.'],
  ['Scoring', "Your Goofiness hits 5: you get 1 Point and it resets. Your opponent's Boredom hits 5: you get 1 Point and theirs resets. Meters cap at 5; extra is lost."],
  ['Your turn', 'Draw 1 card (the first player skips this on turn one). You get 2 Actions. Playing a card, attacking or using an ability costs 1 Action each. End your turn whenever.'],
  ['Combat', "Roll a d20 and add your Character's ATK. If it's at least the defender's DEF, the defender loses 1 HP and your opponent gains Boredom equal to your ATK. If not, your attacker loses 1 HP. No Characters to block? The ATK goes straight to Boredom."],
  ['Card types', 'Characters stay on the field to attack and defend. Bits are instant and last a set number of turns. Evils last forever unless removed.'],
  ['Card effects', "Card text runs automatically. If something isn't covered, tap a player's bar to change meters or Actions, or tap a card to change its HP or remove it. Both players see every change in the log."],
  ['Deck rules', `${DECK_SIZE} cards plus 1 Captain. Max 3 copies of a card, max 1 of each Main Character.`],
];

[...CAPTAINS, ...CARDS].forEach((c, i) => { c.no = String(i + 1).padStart(3, '0'); });
// Null prototype so ids like "__proto__" from a pasted code or the network look up as missing.
const CARD = Object.assign(Object.create(null), Object.fromEntries([...CAPTAINS, ...CARDS].map(c => [c.id, c])));
