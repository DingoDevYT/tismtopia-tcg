// The card list. Edit freely. Give a card art with `art: 'art/some-file.png'`;
// without it the card shows its type icon as a placeholder.
// PLACEHOLDERS ONLY: swap in the real Tismtopia people and OCs.
//
// Characters have `moves`, like Pokemon attacks. Each costs Actions:
//   attack: { name, cost, power, text?, onHit? }  roll d20 + power vs the defender's DEF; a break-through takes 1 HP
//           and deals `power` Boredom, then runs onHit. With no defenders it goes straight to Boredom (and onHit).
//   ability: { name, cost, ability: true, text, ops }  no roll, just runs ops.
//   Any move can be `once: true` (once per turn). Cost 0 is allowed (shown as "Free").
// Effect lists (onPlay, onBreak, onTurnStart, onOppTurnStart, onHit, ops, a Captain's ability) hold steps:
//   [what, who, amount]   what: 'goof' | 'bore' | 'draw' | 'actions'   who: 'me' | 'opp'
//   ['hp', 'target' | 'self', n]   extra HP damage to the defender, or to the attacker itself
//   ['flip', headsSteps, tailsSteps?]   flip a coin and run one list
// Card-level extras:
//   mod: passive while the card is in play (a Captain's always is):
//     atk: +n power on your attacks   def: +n DEF for your Characters (`if: 'noGoof'`: only while you have 0 Goofiness)
//     oppAttackCost / oppEvilCost: extra Actions your opponent pays to attack / play Evils
//     goofBonus: extra Goofiness whenever you gain some
//     actions: +n Actions at the start of each of your turns
//   sick: can't attack the turn it's played.  disadv: attacks against it roll twice and keep the lower.
//   once: (Captains) ability usable once per turn.
// Anything these can't express still works by hand from the Adjust panel.
const DECK_SIZE = 20; // shortcut: the rules don't set a deck size yet, change once decided

const CAPTAINS = [
  { id: 'cap_lurker', type: 'captain', name: 'The Lurker', style: 'Defensive', text: 'Your Characters get +2 DEF while you have 0 Goofiness.', mod: { def: 2, if: 'noGoof' } },
  { id: 'cap_gremlin', type: 'captain', name: 'Keyboard Gremlin', style: 'Aggro', text: 'Once per turn, spend 1 Action: opponent +1 Boredom.', ability: [['bore', 'opp', 1]], once: true },
  { id: 'cap_mod', type: 'captain', name: 'Sleepless Mod', style: 'Control', text: 'Evil cards your opponent plays cost 2 Actions.', mod: { oppEvilCost: 1 } },
  { id: 'cap_clown', type: 'captain', name: 'Certified Clown', style: 'Goofy', text: 'Whenever you gain Goofiness, gain 1 more.', mod: { goofBonus: 1 } },
  { id: 'cap_poweruser', type: 'captain', name: 'Power User', style: 'Tempo', text: '+1 Action at the start of each of your turns.', mod: { actions: 1 } },
];

const CARDS = [
  { id: 'c_vc_goblin', type: 'character', name: 'VC Goblin', def: 12, hp: 3, text: 'When played: +1 Goofiness.', onPlay: [['goof', 'me', 1]], moves: [
    { name: 'Mic Spam', cost: 1, power: 1 },
    { name: 'Unmute Scream', cost: 2, power: 2, text: 'On a break-through, flip a coin. Heads: +2 Boredom.', onHit: [['flip', [['bore', 'opp', 2]]]] }] },
  { id: 'c_reply_guy', type: 'character', name: 'Reply Guy', def: 10, hp: 4, moves: [
    { name: 'Well Actually', cost: 1, ability: true, text: 'Opponent +1 Boredom.', ops: [['bore', 'opp', 1]] },
    { name: 'Ratio', cost: 2, power: 2, text: 'On a break-through, draw a card.', onHit: [['draw', 'me', 1]] }] },
  { id: 'c_lagger', type: 'character', name: 'Laggy Larry', def: 14, hp: 2, text: 'Attacks against Larry roll twice and keep the lower.', disadv: true, moves: [
    { name: 'Delayed Hit', cost: 1, power: 1 },
    { name: 'Rubberband', cost: 2, power: 2, text: 'On a break-through, flip a coin. Heads: 1 more HP damage.', onHit: [['flip', [['hp', 'target', 1]]]] }] },
  { id: 'c_night_owl', type: 'character', name: '3AM Night Owl', def: 8, hp: 2, text: "Can't attack the turn it's played.", sick: true, moves: [
    { name: 'Sleepy Rant', cost: 1, power: 2 },
    { name: 'All-Nighter', cost: 2, power: 4, text: 'On a break-through, Night Owl loses 1 HP too.', onHit: [['hp', 'self', 1]] }] },
  { id: 'm_sticker', type: 'character', main: true, name: 'Sticker Spammer', def: 13, hp: 4, text: 'Whenever this breaks through: +1 Goofiness.', onBreak: [['goof', 'me', 1]], moves: [
    { name: 'Sticker Bomb', cost: 1, power: 1 },
    { name: 'Sticker Storm', cost: 2, power: 2, text: 'On a break-through, flip 2 coins: +1 Boredom per heads.', onHit: [['flip', [['bore', 'opp', 1]]], ['flip', [['bore', 'opp', 1]]]] }] },
  { id: 'c_booster', type: 'character', name: 'Server Booster', def: 9, hp: 3, moves: [
    { name: 'Boost', cost: 0, ability: true, once: true, text: '+1 Action. Once per turn.', ops: [['actions', 'me', 1]] },
    { name: 'Nitro Flex', cost: 2, power: 1, text: 'On a break-through: +1 Goofiness.', onHit: [['goof', 'me', 1]] }] },
  { id: 'b_ping', type: 'bit', name: '@everyone Ping', dur: 1, text: 'Opponent +2 Boredom.', onPlay: [['bore', 'opp', 2]] },
  { id: 'b_energy', type: 'bit', name: 'Energy Drink', dur: 1, text: '+2 Actions this turn.', onPlay: [['actions', 'me', 2]] },
  { id: 'b_caffeine', type: 'bit', name: 'Caffeine IV', dur: 3, text: '+1 Action at the start of your next 2 turns.', onTurnStart: [['actions', 'me', 1]] },
  { id: 'b_brainrot', type: 'bit', name: 'Brainrot Hour', dur: 2, text: 'Your attacks get +1 power.', mod: { atk: 1 } },
  { id: 'b_voice_crack', type: 'bit', name: 'Voice Crack', dur: 1, text: '+2 Goofiness.', onPlay: [['goof', 'me', 2]] },
  { id: 'e_slowmode', type: 'evil', name: 'Slowmode', text: "Opponent's attacks cost 2 Actions.", mod: { oppAttackCost: 1 } },
  { id: 'e_read', type: 'evil', name: 'Left on Read', text: "Start of opponent's turn: they gain +1 Boredom.", onOppTurnStart: [['bore', 'opp', 1]] },
];

// Ready-made legal deck so new players can battle straight away.
const STARTER = { name: 'Starter', captain: 'cap_gremlin', cards: { c_vc_goblin: 3, c_reply_guy: 2, c_lagger: 2, c_night_owl: 2, c_booster: 2, m_sticker: 1,
  b_ping: 1, b_brainrot: 1, b_voice_crack: 1, b_energy: 2, b_caffeine: 1, e_slowmode: 1, e_read: 1 } };

const RULES = [
  ['Goal', 'First to 5 Points wins. Both players start at 0 Points, 0 Goofiness and 0 Boredom.'],
  ['Scoring', "Your Goofiness hits 5: you get 1 Point and it resets. Your opponent's Boredom hits 5: you get 1 Point and theirs resets. Meters cap at 5; extra is lost."],
  ['Your turn', "Draw 1 card (the first player skips this on turn one). You gain 2 Actions; any you don't spend are saved for your next turn, up to 5. Playing a card costs 1. Each Character move costs what's printed next to it. End your turn whenever."],
  ['Combat', "Pick one of your Character's attacks. Roll a d20 and add the attack's power. If it's at least the defender's DEF, the defender loses 1 HP, your opponent gains Boredom equal to the power, and the attack's extra effect happens. If not, your attacker loses 1 HP. No Characters to block? The power goes straight to Boredom."],
  ['Card types', 'Characters stay on the field to attack and defend. Bits are instant and last a set number of turns. Evils last forever unless removed.'],
  ['Card effects', "Card text runs automatically. If something isn't covered, tap a player's bar to change meters or Actions, or tap a card to change its HP or remove it. Both players see every change in the log."],
  ['Deck rules', `${DECK_SIZE} cards plus 1 Captain. Max 3 copies of a card, max 1 of each Main Character.`],
];

[...CAPTAINS, ...CARDS].forEach((c, i) => { c.no = String(i + 1).padStart(3, '0'); });
// Null prototype so ids like "__proto__" from a pasted code or the network look up as missing.
const CARD = Object.assign(Object.create(null), Object.fromEntries([...CAPTAINS, ...CARDS].map(c => [c.id, c])));
