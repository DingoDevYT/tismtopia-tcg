// Ranked: an Elo rating (start 1000) that moves in ranked games only. Real players (matchmaking, below) count fully, K = 32;
// ranked bots count half, K = 16. Practice (Battle vs bot) and casual online battles never change it.
// Save key 'rank' = { r: rating, g: ranked games, w: ranked wins, pk: peak rating }, checked by cleanSave (js/cloud.js); the rating
// is published in your profiles row's summary (js/social.js) so Social and profiles show your badge.
// shortcut: ratings are self-reported by each client (both players update their own at game end); fine for a friends' server.

// ---------------- pure helpers (also used by cleanSave in js/cloud.js, test/game.test.js and tools/simranked.js) ----------------
const RK_TIERS = [['bronze', 'Bronze', 0], ['silver', 'Silver', 1000], ['gold', 'Gold', 1200], ['platinum', 'Platinum', 1400], ['diamond', 'Diamond', 1600], ['master', 'Master', 1800]];
const RK_GLYPH = { bronze: 'circle', silver: 'four-pointed-star', gold: 'five-pointed-star', platinum: 'six-pointed-star', diamond: 'diamond', master: 'crown_a' }; // art/icons
const RK_START = 1000, RK_MAX = 5000, RK_K = { pvp: 32, bot: 16 };
// Ranked bots, one per tier: a fixed difficulty and rating; the Captain and deck are drawn at random each fight (rkBotDeck).
const RK_BOTS = [
  { r: 900, ps: 'Plays the first thing it can and blocks with whoever is in front.' },
  { r: 1100, ps: 'The practice bot: fills its field and hits hard, but only blocks well half the time.' },
  { r: 1300, ps: 'Blocks with whoever loses least and saves Actions for hits that land.' },
  { r: 1500, ps: 'Weighs every move and times its Super.' },
  { r: 1700, ps: 'Plans its turn two moves deep and always sees the kill.' },
  { r: 1900, ps: 'Plans two moves deep through more lines than any other bot, with the strongest decks.' },
];
const rkTierIx = r => { let i = 0; RK_TIERS.forEach(([, , lo], k) => { if (r >= lo) i = k; }); return i; };
const rkExpect = (me, opp) => 1 / (1 + 10 ** ((opp - me) / 400)); // Elo expected score
// Rounded away from zero on both sides, so one player's gain is exactly the other's loss.
const rkDelta = (me, opp, won, k) => { const x = k * ((won ? 1 : 0) - rkExpect(me, opp)); return Math.sign(x) * Math.round(Math.abs(x)); };
const rkNew = () => ({ r: RK_START, g: 0, w: 0, pk: RK_START });
// Untrusted (save file, cloud) -> a clean copy, or null when the shape is wrong.
function rkClean(v) {
  const int = (x, hi) => Number.isInteger(x) && x >= 0 && x <= hi;
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k => !['r', 'g', 'w', 'pk'].includes(k))) return null;
  if (!int(v.r, RK_MAX) || !int(v.g, 1e7) || !int(v.w, 1e7) || v.w > v.g || !int(v.pk, RK_MAX)) return null;
  return { r: v.r, g: v.g, w: v.w, pk: Math.max(v.pk, v.r) };
}
// After a game: res = { kind: 'pvp' | 'bot', opp: their rating, won }. Anything else (practice, casual) leaves the rating as it was.
function rkSettle(rank, res) {
  if (!res || !Object.hasOwn(RK_K, res.kind) || !Number.isFinite(res.opp)) return rank;
  const r = Math.min(RK_MAX, Math.max(0, rank.r + rkDelta(rank.r, res.opp, res.won, RK_K[res.kind])));
  return { r, g: rank.g + 1, w: rank.w + (res.won ? 1 : 0), pk: Math.max(rank.pk, r) };
}

// ---------- the ranked bots: one policy per tier, all asking the real rules engine (apply) what is legal ----------
const rkTry = (s, p, a) => { try { return apply(s, p, a); } catch { return null; } };
const RK_END = { type: 'end' };
// Every legal action for p this turn (each hand card once, every move, the Super, cleanses).
function rkOptions(s, p) {
  const me = s.players[p], out = [], seen = new Set();
  me.hand.forEach((id, i) => { if (!seen.has(id)) { seen.add(id); out.push({ type: 'play', i }); } });
  me.field.forEach((f, i) => (CARD[f.id].moves || []).forEach((_, m) => out.push({ type: 'attack', i, m })));
  if (CARD[me.captain].ability) out.push({ type: 'ability', i: -1 });
  s.players[1 - p].effects.forEach((e, i) => { if (CARD[e.id].type === 'evil') out.push({ type: 'cleanse', i }); });
  return out.filter(a => rkTry(s, p, a));
}
const rkKind = (s, p, a) => (a.type === 'play' ? CARD[s.players[p].hand[a.i]].type
  : a.type === 'attack' ? (CARD[s.players[p].field[a.i].id].moves[a.m].ability ? 'move' : 'attack') : a.type);
const rkBest = (list, score) => list.reduce((b, x) => (score(x) > score(b) ? x : b), list[0]);
// Board score from p's side (the same weights as tools/sim.js).
function rkVal(s, p) {
  if (s.phase === 'over') return s.winner === p ? 1e6 : -1e6;
  const side = x => x.goof * 0.6 - x.bore * 2.5 + x.field.reduce((n, f) => n + 1.5 + f.hp * 0.8, 0) + x.hand.length * 0.6 + x.effects.length * 2.2;
  return side(s.players[p]) - side(s.players[1 - p]) + (s.turn === p ? s.actions : s.players[p].bank) * 0.5;
}
// Defender p picks the blocker that loses least (survives if it can, takes the least damage).
function rkBlock(s, p) {
  const af = s.players[1 - p].field[s.pending.i], pw = CARD[af.id].moves[s.pending.m].power + statsOf(s, 1 - p, af).bonus, F = s.players[p].field;
  return rkBest(F.map((_, i) => i), i => { const d = Math.max(0, pw - statsOf(s, p, F[i]).def); return (d < F[i].hp ? 100 : 0) - d * 10 + F[i].hp; });
}
// Resolve a declared attack with the defender's best block, for lookahead.
const rkResolve = (n, p) => (n && n.phase === 'defend' ? rkTry(n, 1 - p, { type: 'defend', i: rkBlock(n, 1 - p) }) || n : n);

// Silver: the practice bot's plan (js/app.js botMove): free boosts, Super when ready, a Character, then the strongest attack per Action.
function rkGold(g, p) {
  const B = g.players[p], n = g.actions, all = B.field.map((_, i) => i);
  const hc = B.hand.findIndex(id => CARD[id].type === 'character'), canPlay = hc >= 0 && B.field.length < 3;
  const moves = all.flatMap(i => CARD[B.field[i].id].moves.map((mv, m) => ({ i, m, mv, c: moveCost(g, p, mv) }))).filter(x => !moveBlock(g, p, B.field[x.i], x.m));
  const boost = moves.find(x => x.mv.ability && x.c === 0), attacks = moves.filter(x => !x.mv.ability), abil = moves.find(x => x.mv.ability);
  const spell = B.hand.findIndex(id => CARD[id].type !== 'character' && playCost(g, p, CARD[id]) <= n), cap = CARD[B.captain];
  if (boost) return { type: 'attack', i: boost.i, m: boost.m };
  if (cap.ability && B.goof >= (cap.goof || 0) && !(cap.once && g.capUsed)) return { type: 'ability', i: -1 };
  if (n >= 2 && canPlay) return { type: 'play', i: hc };
  if (attacks.length) { const x = rkBest(attacks, x => x.mv.power / x.c + x.mv.power * 0.1); return { type: 'attack', i: x.i, m: x.m }; }
  if (spell >= 0) return { type: 'play', i: spell };
  if (n && canPlay) return { type: 'play', i: hc };
  if (abil) return { type: 'attack', i: abil.i, m: abil.m };
  return RK_END;
}
// Gold: fills the field with its toughest Characters, uses Items/Evils, and only attacks where damage gets through
// (otherwise it banks the Actions); free boosts first, and the Super the moment it's ready (timed: only when it helps, Platinum up).
function rkPlat(g, p, timed) {
  const B = g.players[p], O = g.players[1 - p], o = rkOptions(g, p), k = a => rkKind(g, p, a);
  const boost = o.find(a => k(a) === 'move' && moveCost(g, p, CARD[B.field[a.i].id].moves[a.m]) === 0);
  if (boost) return boost;
  const sup = o.find(a => a.type === 'ability'); if (sup && (!timed || rkVal(rkResolve(rkTry(g, p, sup), p), p) > rkVal(g, p))) return sup;
  const chars = o.filter(a => k(a) === 'character');
  if (chars.length && B.field.length < 3) return rkBest(chars, a => { const c = CARD[B.hand[a.i]]; return maxHp(c) + baseArmor(c) * 3; });
  const spell = o.find(a => k(a) === 'bit' || k(a) === 'evil'); if (spell) return spell;
  // expected damage after the weakest blocker's armour (a blocker is picked by the defender, so assume their best armour)
  const arm = O.field.length ? Math.max(...O.field.map(f => statsOf(g, 1 - p, f).def)) : 0;
  const dmg = a => { const mv = CARD[B.field[a.i].id].moves[a.m]; return mv.power + statsOf(g, p, B.field[a.i]).bonus - arm; };
  const atk = o.filter(a => k(a) === 'attack' && dmg(a) > 0);
  if (atk.length) return rkBest(atk, a => dmg(a) * 10 - moveCost(g, p, CARD[B.field[a.i].id].moves[a.m]));
  const cl = o.find(a => a.type === 'cleanse'); if (cl) return cl;
  if (chars.length) return chars[0];
  return RK_END;
}
// Platinum, Diamond and Master: Gold's plan, checked against the other actions on copies of the game (attacks resolved with your best
// block). Each candidate is followed `depth` more actions into the same turn (the best few at each step, or ending the turn);
// the plan wins ties, so the lookahead only overrides it for a clearly better board, and a winning line is always found.
const rkEndV = (n, p) => rkVal(rkTry(n, p, RK_END) || n, p) + 0.5 * n.actions;
function rkScore1(g, p, a) { const n = rkResolve(rkTry(g, p, a), p); return n ? rkVal(n, p) : -Infinity; }
function rkLook(n, p, depth, width) {
  if (!n) return -Infinity;
  if (n.phase === 'over') return rkVal(n, p);
  let v = rkEndV(n, p);
  if (!depth || n.turn !== p || n.phase !== 'play' || Date.now() > rkDeadline) return v; // out of thinking time: judge the board as it stands
  const kids = rkOptions(n, p).map(a => ({ a, v: rkScore1(n, p, a) })).sort((x, y) => y.v - x.v).slice(0, width);
  for (const k of kids) v = Math.max(v, depth > 1 ? rkLook(rkResolve(rkTry(n, p, k.a), p), p, depth - 1, width) : k.v);
  return v;
}
let rkDeadline = Infinity;
function rkDeep(g, p, depth, width) {
  rkDeadline = Date.now() + 450; // about half a second of thinking per action at most, so the page never stalls
  const plan = rkPlat(g, p, true), look = a => rkLook(rkResolve(rkTry(g, p, a), p), p, depth, width);
  const others = rkOptions(g, p).map(a => ({ a, v: rkScore1(g, p, a) })).sort((x, y) => y.v - x.v).slice(0, width + 1).map(x => x.a);
  let best = plan, bestV = (plan.type === 'end' ? rkEndV(g, p) : look(plan)) + 1;
  for (const a of others) { const v = look(a); if (v > bestV) { bestV = v; best = a; } }
  if (best !== plan && rkEndV(g, p) > bestV) best = RK_END;
  return best;
}
// The bot (player p) at a tier picks its next action: a defend when it is blocking, else a play/attack/Super/end.
function rkPick(g, p, tier, rnd = Math.random) {
  if (g.phase === 'defend') {
    const smart = tier >= 2 || (tier === 1 && rnd() < 0.5);
    return { type: 'defend', i: smart ? rkBlock(g, p) : tier === 1 ? Math.floor(rnd() * g.players[p].field.length) : 0 };
  }
  const first = () => rkOptions(g, p).find(a => a.type === 'play' || a.type === 'attack') || RK_END; // the first legal thing, never the Super
  if (tier === 0) return first();
  if (tier === 1) return rkGold(g, p);
  if (tier === 2) return rkPlat(g, p, false);
  return tier === 3 ? rkDeep(g, p, 1, 4) : tier === 4 ? rkDeep(g, p, 2, 6) : rkDeep(g, p, 2, 8); // moves deep x lines per step: Platinum 1 x 4, Diamond 2 x 6, Master 2 x 8
}
// The bot's Captain and deck: a random pre-built list each fight (js/prebuilt.js). Low tiers draw the starters; higher tiers the
// Captain decks, the top tiers only the strongest of them (RK_STRONG: best first, from DECKS=1 node tools/simranked.js).
const RK_STRONG = ['butter-brigade', 'supernova', 'night-light', 'rust-wall', 'chain-reaction', 'plot-twist', 'coin-toss-carnival', 'crunch-time'];
function rkBotPool(tier) {
  const cap = RK_STRONG.map(id => PB_DECKS.find(d => d.id === id)).filter(Boolean), starters = PB_DECKS.filter(d => d.kind === 'starter');
  return tier <= 1 ? starters : tier === 2 ? PB_DECKS : tier === 3 ? cap : cap.slice(0, tier === 4 ? 6 : 4);
}
const rkBotDeck = (tier, rnd = Math.random) => { const pool = rkBotPool(tier), d = pool[Math.floor(rnd() * pool.length)]; return { captain: d.captain, cards: { ...d.cards } }; };

// ---------------- browser only ----------------
let rkRank = rkClean(store.get('rank', null)) || rkNew();
// find: the matchmaking search in progress. pvp: the ranked opponent's rating on the host's side (kept for rematches).
// next: what the pre-battle sheet is about to start. settled: the game whose result already moved the rating. res: that result.
const rk = { find: null, pvp: null, next: null, settled: null, res: null };
const rkTierOf = r => RK_TIERS[rkTierIx(r)];
function rkBadge(r, cls = '') { const [k, name] = rkTierOf(r); return `<span class="rk rk-${k}${cls ? ' ' + cls : ''}" title="${name} ${r}">${soIc(RK_GLYPH[k])}</span>`; }
function rkChip(r) { const [k, name] = rkTierOf(r); return `<span class="rkchip tcol-${k}">${rkBadge(r)}${name} <b>${r}</b></span>`; }
function rkProfile(r, games) { const [k, name] = rkTierOf(r); return `<span class="pp-rank tcol-${k}">${rkBadge(r, 'md')}<span class="t"><b>${name}</b><small>Rating ${r} · ${games} ranked game${games === 1 ? '' : 's'}</small></span></span>`; }
function rkMine() { return rkRank.g ? { r: rkRank.r, rg: rkRank.g } : {}; } // published in the profiles summary (js/social.js)
// Where a rating sits in its tier, for the progress bars (Bronze has no floor, so its bar starts at 800).
const rkSpan = r => { const i = rkTierIx(r), nx = RK_TIERS[i + 1]; return { lo: i ? RK_TIERS[i][2] : 800, hi: nx ? nx[2] : null, next: nx?.[1] }; };
const rkPct = (r, s) => (s.hi ? Math.max(0, Math.min(100, (100 * (r - s.lo)) / (s.hi - s.lo))) : 100);
const rkSigned = d => (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0');

// ---------- the Ranked screen (Battle tab → Ranked) ----------
function viewRanked() {
  const R = rkRank, [k, name] = rkTierOf(R.r), s = rkSpan(R.r), lvl = rkBest(RK_BOTS.map((_, i) => i), i => i / 100 - Math.abs(RK_BOTS[i].r - R.r)); // a tie goes to the higher bot
  const pvp = !cloud.user ? '<p class="muted">Sign in with Discord on your Profile to be matched with other Tismtopia players.</p><button class="btn sm" data-act="profile">Open Profile</button>'
    : `<div class="row2"><span class="rk-delta up">Win ${rkSigned(rkDelta(R.r, R.r, true, RK_K.pvp))}</span><span class="rk-delta dn">Loss ${rkSigned(rkDelta(R.r, R.r, false, RK_K.pvp))}</span><button class="btn primary sm" data-act="rk-find">${soIc('sword')}Find match</button></div>`;
  const deckOf = i => (i <= 1 ? 'a random starter deck' : i === 2 ? 'any pre-built deck' : i === 3 ? 'a random Captain deck' : `one of the ${i === 4 ? 6 : 4} strongest Captain decks`);
  return `${header('Ranked')}<div class="rk-wrap">
    <section class="neu me-rank tcol-${k}"><div class="r1">${rkBadge(R.r, 'lg')}<div><b class="tier">${name}</b><span class="rt">${R.r} <small>rating</small></span></div>${pfpAvatar(myPfp(), ' md')}</div>
      <div class="prog"><div class="progress"><i style="width:${rkPct(R.r, s).toFixed(1)}%"></i></div><span>${s.hi ? `${s.hi - R.r} to ${s.next} (${s.hi})` : 'Top tier'} · ${R.g} ranked game${R.g === 1 ? '' : 's'}${R.g ? ` · best ${R.pk}` : ''}</span></div>
      <div class="rk-note">${ICON.bot}<span><b>Bot games count half.</b> Games against real players count fully. Practice and casual battles never change your rating.</span></div></section>
    <section class="neu rk-pvp"><div class="r1"><span class="ico">${soIc('pawns')}</span><div><b>Ranked match</b><small>A real player near your rating</small></div></div>${pvp}</section>
    <div class="lbl2">${ICON.bot}Ranked bots · counts half</div>
    <div class="rk-tiers">${RK_BOTS.map((b, i) => { const [tk, tn, lo] = RK_TIERS[i];
      return `<div class="rk-tier neu tcol-${tk}">${i === lvl ? '<span class="rec">Your level</span>' : ''}<div class="who"><span class="avatar rk-botav">${ICON.bot}</span>${rkBadge(lo)}</div>
        <div><div class="nm"><b>${tn} Bot</b><small>· ${b.r}</small></div><div class="ps">${b.ps}</div><div class="dk">Random Captain, ${deckOf(i)}</div></div>
        <div class="ft"><span class="rk-delta up">Win ${rkSigned(rkDelta(R.r, b.r, true, RK_K.bot))}</span><span class="rk-delta dn">Loss ${rkSigned(rkDelta(R.r, b.r, false, RK_K.bot))}</span><button class="btn sm${i === lvl ? ' primary' : ''}" data-act="rk-fight" data-t="${i}">Fight</button></div></div>`; }).join('')}</div>
  </div>${tabbar('lobby')}`;
}
// The Battle tab: a way in to Ranked, and the search panel while matchmaking runs.
const viewLobbyNoRank = viewLobby;
viewLobby = function () {
  if (rk.find) return `${header('Battle')}<div class="panel neu rk-search"><small class="lbl">Ranked match</small>${rkBadge(rkRank.r, 'md')}
    <p class="muted center">${esc(ui.status || 'Looking for a player near your rating')} <span class="spin"></span></p><p class="muted center"><small>Your rating: ${rkRank.r}. Keep this screen open.</small></p>
    <button class="btn wide" data-act="rk-cancel">Cancel</button></div>${tabbar('lobby')}`;
  const [, name] = rkTierOf(rkRank.r);
  return viewLobbyNoRank().replace('<div class="panel neu"><small class="lbl">Host a battle</small>', m => `<button class="rk-entry neu" data-act="go" data-to="ranked">${rkBadge(rkRank.r, 'md')}<span><b>Ranked</b><small>${name} ${rkRank.r} · real players and ranked bots</small></span>${ICON.chevron}</button>${m}`);
};

// ---------- ranked bots ----------
function rkStartBot(tier) {
  const d = deck(); if (deckProblems(d).length) return toast('Fix your deck first.');
  leave(true); bot = true; isHost = true; me = 0;
  const g = newGame([{ captain: d.captain, cards: d.cards, finishes: finishesFor(d) }, rkBotDeck(tier)], [myName, `${RK_TIERS[tier][1]} Bot`]);
  g.players[0].pfp = myPfp(); g.players[1].pfp = g.players[1].captain;
  g.rk = { kind: 'bot', tier }; g.players[0].rating = rkRank.r; g.players[1].rating = RK_BOTS[tier].r;
  ui.tut = null; state = game = null; setGame(g); botSoon();
}
const startBotNoRank = startBot;
startBot = function (tutorial) { return !tutorial && rk.next?.tier != null ? rkStartBot(rk.next.tier) : startBotNoRank(tutorial); };
const botMoveNoRank = botMove;
botMove = function () {
  const g = state;
  if (!bot || !g || g.phase === 'over' || !g.rk) return botMoveNoRank(); // practice and the tutorial keep the old bot
  if (game !== g) return botSoon(300);
  if (g.phase === 'defend' ? g.turn !== 0 : g.turn !== 1) return;
  let a = null; try { a = rkPick(g, 1, g.rk.tier); } catch (e) { console.warn('ranked bot', e); }
  const safe = g.phase === 'defend' ? { type: 'defend', i: 0 } : RK_END;
  if (!act(1, a || safe) && a && a.type !== safe.type) act(1, safe);
};

// ---------- matchmaking: a members-only Supabase table of waiting players (supabase/schema.sql: matchmaking) ----------
// Each waiting player listens on a fresh PeerJS id and posts it with their rating (one row per player, refreshed every 30 s,
// hidden after 2 minutes). Everyone polls; of two waiting players, the one whose PeerJS id sorts first dials the other, so a pair
// connects once. The dialled player hosts (runs the rules); the guest's hello says it is ranked and carries its rating.
const RK_POLL = 3000, RK_BEAT = 30000, RK_LOOK = 'Looking for a player near your rating';
const rkPost = f => sbRun('Matchmaking', async sb => { need(await sb.from('matchmaking').upsert({ user_id: cloud.user.id, peer: f.id, rating: rkRank.r })); return {}; });
const rkUnpost = f => { if (!f.posted || !cloud.user) return; f.posted = 0; const id = cloud.user.id; sbGet().then(sb => sb?.from('matchmaking').delete().eq('user_id', id)).catch(() => {}); };
function rkFind() {
  if (!cloud.user) return toast('Sign in with Discord to play ranked matches.');
  if (!needPeer()) return;
  leave(true); ui.view = 'lobby'; isHost = true; me = 0; ui.status = 'Connecting…';
  const f = rk.find = { id: ('tismtopia-tcg-rk-' + uid() + uid() + '00000000').slice(0, 33), at: Date.now(), posted: 0, skip: new Set(), timer: 0 };
  peer = new Peer(f.id);
  peer.on('open', () => { if (rk.find !== f) return; ui.status = RK_LOOK; render(); rkTick(f); });
  peer.on('connection', c => { if (conn || rk.find !== f) return c.close(); isHost = true; me = 0; rkUnpost(f); clearTimeout(f.timer); f.timer = setTimeout(() => rkTick(f), RK_POLL); wire(c); }); // polling resumes if this one doesn't turn into a game
  peer.on('error', err => {
    if (rk.find !== f) return;
    if (err.type === 'peer-unavailable' && !isHost) { const c = conn; conn = null; c?.close(); isHost = true; me = 0; clearTimeout(f.timer); f.timer = setTimeout(() => rkTick(f), 500); return; } // that player just left: keep looking
    rkStop("Can't reach the matchmaking server.");
  });
}
async function rkTick(f) {
  clearTimeout(f.timer);
  if (rk.find !== f || state) return;
  if (conn) { f.timer = setTimeout(() => rkTick(f), RK_POLL); return; } // mid-handshake: check again shortly
  const r = await sbRun('Matchmaking', async sb => ({ rows: need(await sb.from('matchmaking').select('user_id, peer, rating').neq('user_id', cloud.user.id).limit(100)) }));
  if (rk.find !== f || state) return;
  if (conn) { f.timer = setTimeout(() => rkTick(f), RK_POLL); return; }
  if (!r.ok) return rkStop('Matchmaking is unavailable right now.');
  const wide = 150 + 50 * Math.floor((Date.now() - f.at) / 10000); // near your rating first, wider the longer you wait
  const near = r.rows.filter(x => typeof x.peer === 'string' && x.peer > f.id && !f.skip.has(x.peer) && Number.isInteger(x.rating) && Math.abs(x.rating - rkRank.r) <= wide);
  if (near.length) {
    const x = rkBest(near, y => -Math.abs(y.rating - rkRank.r)); f.skip.add(x.peer); rkUnpost(f);
    isHost = false; me = 1; ui.status = 'Found a player, connecting…'; render();
    const c = peer.connect(x.peer, { reliable: true }); wire(c);
    f.timer = setTimeout(() => { if (rk.find !== f || state) return; if (conn === c) { conn = null; c.close(); } isHost = true; me = 0; rkTick(f); }, 8000); // no game yet: try the next one
    return;
  }
  if (ui.status !== RK_LOOK) { ui.status = RK_LOOK; if (ui.view === 'lobby') render(); } // back to waiting (e.g. after a handshake that came to nothing)
  if (!f.posted || Date.now() - f.posted > RK_BEAT) { if ((await rkPost(f)).ok) f.posted = Date.now(); else return rkStop('Matchmaking is unavailable right now.'); }
  if (rk.find === f && !conn) f.timer = setTimeout(() => rkTick(f), RK_POLL);
}
function rkStop(msg) { leave(true); ui.view = 'ranked'; if (msg) toast(msg); else render(); }
function rkEndFind() { const f = rk.find; if (!f) return; clearTimeout(f.timer); rkUnpost(f); rk.find = null; }
addEventListener('pagehide', () => { if (rk.find) rkEndFind(); });
// The hello (js/app.js wire / onMsg): the guest says whether it's ranked and its rating; a ranked host only plays ranked guests, and back.
function rkHello() { return rk.find ? { ranked: true, rating: rkRank.r } : {}; }
function rkCheckHello(m) {
  if (!!m.ranked !== !!rk.find) { conn?.send({ t: 'error', msg: rk.find ? 'That was a ranked match.' : "That room isn't ranked." }); const c = conn; setTimeout(() => c?.close(), 300); return false; }
  if (rk.find) rk.pvp = { oppR: Number.isInteger(m.rating) ? Math.min(RK_MAX, Math.max(0, m.rating)) : RK_START };
  return true;
}
function rkGame(g) { // host, every deal (rematches too): a ranked game carries both ratings for the name tags and the result
  if (!rk.pvp) return;
  rkEndFind(); g.rk = { kind: 'pvp' }; g.players[0].rating = rkRank.r; g.players[1].rating = rk.pvp.oppR;
}

// ---------- the result ----------
function rkApply(g, won) {
  const before = rkRank.r, opp = g.players[1 - me].rating;
  rkRank = rkSettle(rkRank, { kind: g.rk.kind, opp, won }); store.set('rank', rkRank);
  const d = rkRank.r - before;
  if (g.rk.kind === 'pvp' && isHost && rk.pvp) rk.pvp.oppR = Math.min(RK_MAX, Math.max(0, rk.pvp.oppR - d)); // their side moved by exactly the opposite
  rk.settled = g; rk.res = { g, kind: g.rk.kind, tier: g.rk.tier, before, d };
  if (typeof soPublishSoon === 'function') soPublishSoon();
  return d;
}
// Leaving a ranked game early is a loss; the player left behind gets the win. shortcut: closing the tab mid-game changes nothing.
function rkForfeit(won) { const g = state; if (!g?.rk || g.phase === 'over' || rk.settled === g || !Number.isFinite(g.players[1 - me].rating)) return ''; return ` Ranked: ${rkSigned(rkApply(g, won))}.`; }
function rkBox(r) {
  const after = r.before + r.d, i = rkTierIx(after), [k, name] = RK_TIERS[i], s = rkSpan(after), from = rkPct(Math.min(r.before, after), s), to = rkPct(Math.max(r.before, after), s);
  return `<div class="rating-box neu-in tcol-${k}"><div class="r1">${rkBadge(after)}<div class="n">${name} <s>${r.before} →</s> ${after}<small>${r.kind === 'bot' ? `vs. the ${RK_TIERS[r.tier][1]} Bot: counts half` : 'vs. a real player: counts fully'}</small></div><span class="${r.d >= 0 ? 'up' : 'dn'}">${rkSigned(r.d)}</span></div>
    <div class="progress"><i style="width:${from.toFixed(1)}%"></i><u class="${r.d >= 0 ? 'up' : 'dn'}" style="width:${(to - from).toFixed(1)}%;margin-left:${from.toFixed(1)}%"></u></div>
    <div class="pl"><span>${name}${i ? ' ' + s.lo : ''}</span><span>${s.hi ? `${s.hi - after} to ${s.next}` : 'Top tier'}</span></div></div>`;
}

Object.assign(ACTS, {
  'rk-fight'(d) { const t = Number(d.t); if (!RK_BOTS[t]) return; openPre('rkbot'); ui.pre.tier = t; },
  'rk-find'() { if (!cloud.user) return toast('Sign in with Discord to play ranked matches.'); openPre('rkfind'); },
  'rk-cancel'() { rkStop(); },
});
// The pre-battle sheet (js/economy.js) picks the deck and Captain, then starts a ranked bot or the search.
const rkPreGo = ACTS['pre-go'];
ACTS['pre-go'] = d => {
  const p = ui.pre; if (!p || !/^rk/.test(p.act)) return rkPreGo(d);
  rk.next = p.act === 'rkbot' ? { tier: p.tier } : { find: true }; p.act = p.act === 'rkbot' ? 'bot' : 'host';
  try { return rkPreGo(d); } finally { rk.next = null; }
};
const hostNoRank = host;
host = function () { return rk.next?.find ? rkFind() : hostNoRank(); };
const leaveNoRank = leave;
leave = function (quiet) { rkEndFind(); rk.pvp = null; return leaveNoRank(quiet); };
const rkRematch = ACTS.rematch;
ACTS.rematch = d => (bot && game?.rk ? rkStartBot(game.rk.tier) : rkRematch(d));
const rkLeaveBattle = ACTS['leave-battle'];
ACTS['leave-battle'] = d => {
  if (!(state?.rk && state.phase !== 'over')) return rkLeaveBattle(d);
  if (!confirm('Leave this ranked battle? It counts as a loss.')) return;
  const msg = rkForfeit(false); leave(); toast('You left the ranked battle.' + msg);
};

const viewOverNoRank = viewOver;
viewOver = function () { const html = viewOverNoRank(); return game.rk ? html.replace(/(<small>vs\. [^<]*)<\/small>/, '$1 · Ranked</small>') : html; };
const renderNoRank = render;
render = function () {
  const g = ui.view === 'game' && game;
  if (g && g.rk && g.phase === 'over' && rk.settled !== g && g === state) rkApply(g, g.winner === me);
  if (g && rk.find && state) rkEndFind();
  renderNoRank();
  // victory / defeat: your rank badge on your picture, then the rating change above the stats
  if (g && g.phase === 'over' && g.rk && rk.res?.g === g) {
    const v = $app.querySelector('.victory'), av = v?.querySelector(':scope > .avatar');
    if (av) { const w = document.createElement('div'); w.className = 'v-av'; av.replaceWith(w); w.append(av); w.insertAdjacentHTML('beforeend', rkBadge(rk.res.before + rk.res.d, 'md')); }
    v?.querySelector('.stats-list')?.insertAdjacentHTML('beforebegin', rkBox(rk.res));
  }
};
