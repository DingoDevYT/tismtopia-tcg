// The card list. Edit freely: `art` is an emoji or an image path like 'art/vc-goblin.png'.
// PLACEHOLDERS ONLY: swap in the real Tismtopia people and OCs.
const DECK_SIZE = 20; // shortcut: the rules don't set a deck size yet, change once decided

const CAPTAINS = [
  { id: 'cap_lurker', type: 'captain', name: 'The Lurker', art: '👀', style: 'Defensive', text: 'Your Characters get +2 DEF while you have 0 Goofiness.' },
  { id: 'cap_gremlin', type: 'captain', name: 'Keyboard Gremlin', art: '⌨️', style: 'Aggro', text: 'Once per turn, spend 1 Action: opponent +1 Boredom.' },
  { id: 'cap_mod', type: 'captain', name: 'Sleepless Mod', art: '🛡️', style: 'Control', text: 'Evil cards your opponent plays cost 2 Actions.' },
  { id: 'cap_clown', type: 'captain', name: 'Certified Clown', art: '🤡', style: 'Goofy', text: 'Whenever you gain Goofiness, gain 1 more.' },
];

const CARDS = [
  { id: 'c_vc_goblin', type: 'character', name: 'VC Goblin', art: '🎧', atk: 2, def: 12, hp: 3, text: 'When played: +1 Goofiness.' },
  { id: 'c_reply_guy', type: 'character', name: 'Reply Guy', art: '💬', atk: 1, def: 10, hp: 4, text: 'Ability (1 Action): opponent +1 Boredom.' },
  { id: 'c_lagger', type: 'character', name: 'Laggy Larry', art: '📶', atk: 1, def: 14, hp: 2, text: 'Attacks against Larry roll twice and keep the lower.' },
  { id: 'c_night_owl', type: 'character', name: '3AM Night Owl', art: '🦉', atk: 3, def: 8, hp: 2, text: "Can't attack the turn it's played." },
  { id: 'm_sticker', type: 'character', main: true, name: 'Sticker Spammer', art: '🌈', atk: 2, def: 13, hp: 4, text: 'Whenever this breaks through: +1 Goofiness.' },
  { id: 'b_ping', type: 'bit', name: '@everyone Ping', art: '🔔', dur: 1, text: 'Opponent +2 Boredom.' },
  { id: 'b_brainrot', type: 'bit', name: 'Brainrot Hour', art: '🌀', dur: 2, text: 'Your Characters get +1 ATK.' },
  { id: 'b_voice_crack', type: 'bit', name: 'Voice Crack', art: '🎤', dur: 1, text: '+2 Goofiness.' },
  { id: 'e_slowmode', type: 'evil', name: 'Slowmode', art: '🐌', text: "Opponent's attacks cost 2 Actions." },
  { id: 'e_read', type: 'evil', name: 'Left on Read', art: '📭', text: "Start of opponent's turn: they gain +1 Boredom." },
];
