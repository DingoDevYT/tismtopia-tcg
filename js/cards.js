// The card list. Edit freely. Give a card art with `art: 'art/some-file.png'`;
// without it the card shows its type icon as a placeholder.
// PLACEHOLDERS ONLY: swap in the real Tismtopia people and OCs.
const DECK_SIZE = 20; // shortcut: the rules don't set a deck size yet, change once decided

const CAPTAINS = [
  { id: 'cap_lurker', type: 'captain', name: 'The Lurker', style: 'Defensive', text: 'Your Characters get +2 DEF while you have 0 Goofiness.' },
  { id: 'cap_gremlin', type: 'captain', name: 'Keyboard Gremlin', style: 'Aggro', text: 'Once per turn, spend 1 Action: opponent +1 Boredom.' },
  { id: 'cap_mod', type: 'captain', name: 'Sleepless Mod', style: 'Control', text: 'Evil cards your opponent plays cost 2 Actions.' },
  { id: 'cap_clown', type: 'captain', name: 'Certified Clown', style: 'Goofy', text: 'Whenever you gain Goofiness, gain 1 more.' },
];

const CARDS = [
  { id: 'c_vc_goblin', type: 'character', name: 'VC Goblin', atk: 2, def: 12, hp: 3, text: 'When played: +1 Goofiness.' },
  { id: 'c_reply_guy', type: 'character', name: 'Reply Guy', atk: 1, def: 10, hp: 4, text: 'Ability (1 Action): opponent +1 Boredom.' },
  { id: 'c_lagger', type: 'character', name: 'Laggy Larry', atk: 1, def: 14, hp: 2, text: 'Attacks against Larry roll twice and keep the lower.' },
  { id: 'c_night_owl', type: 'character', name: '3AM Night Owl', atk: 3, def: 8, hp: 2, text: "Can't attack the turn it's played." },
  { id: 'm_sticker', type: 'character', main: true, name: 'Sticker Spammer', atk: 2, def: 13, hp: 4, text: 'Whenever this breaks through: +1 Goofiness.' },
  { id: 'b_ping', type: 'bit', name: '@everyone Ping', dur: 1, text: 'Opponent +2 Boredom.' },
  { id: 'b_brainrot', type: 'bit', name: 'Brainrot Hour', dur: 2, text: 'Your Characters get +1 ATK.' },
  { id: 'b_voice_crack', type: 'bit', name: 'Voice Crack', dur: 1, text: '+2 Goofiness.' },
  { id: 'e_slowmode', type: 'evil', name: 'Slowmode', text: "Opponent's attacks cost 2 Actions." },
  { id: 'e_read', type: 'evil', name: 'Left on Read', text: "Start of opponent's turn: they gain +1 Boredom." },
];

// Ready-made legal deck so new players can battle straight away.
const STARTER = { name: 'Starter', captain: 'cap_gremlin', cards: { c_vc_goblin: 3, c_reply_guy: 3, c_lagger: 2, c_night_owl: 2, m_sticker: 1, b_ping: 3, b_brainrot: 2, b_voice_crack: 2, e_slowmode: 1, e_read: 1 } };

const RULES = [
  ['Goal', 'First to 5 Points wins. Both players start at 0 Points, 0 Goofiness and 0 Boredom.'],
  ['Scoring', "Your Goofiness hits 5: you get 1 Point and it resets. Your opponent's Boredom hits 5: you get 1 Point and theirs resets. Meters cap at 5; extra is lost."],
  ['Your turn', 'Draw 1 card (the first player skips this on turn one). You get 2 Actions. Playing a card, attacking or using an ability costs 1 Action each. End your turn whenever.'],
  ['Combat', "Roll a d20 and add your Character's ATK. If it's at least the defender's DEF, the defender loses 1 HP and your opponent gains Boredom equal to your ATK. If not, your attacker loses 1 HP. No Characters to block? The ATK goes straight to Boredom."],
  ['Card types', 'Characters stay on the field to attack and defend. Bits are instant and last a set number of turns. Evils last forever unless removed.'],
  ['Card effects', "Apply card text by hand: tap a player's bar to change meters or Actions, tap a card to change its HP or remove it. Both players see every change in the log."],
  ['Deck rules', `${DECK_SIZE} cards plus 1 Captain. Max 3 copies of a card, max 1 of each Main Character.`],
];

[...CAPTAINS, ...CARDS].forEach((c, i) => { c.no = String(i + 1).padStart(3, '0'); });
// Null prototype so ids like "__proto__" from a pasted code or the network look up as missing.
const CARD = Object.assign(Object.create(null), Object.fromEntries([...CAPTAINS, ...CARDS].map(c => [c.id, c])));
