// Community cards: submissions the owner approved (Supabase RPC approved_cards) join the game for everyone.
// The last good list is kept in localStorage and applied at once on load, then refreshed in the background; pictures come from the
// private bucket with the public key, as blob URLs, cached with the Cache API. Everything from the database is untrusted player input.
const CM_MAX = 200, CM_ART = {}; // CM_ART: image path -> blob URL, kept across list refreshes

// Rarity from strength, so strong cards are rarer. Characters: printed HP + 2 x armour + best attack power, >= 15 UR, >= 12 R, >= 9 U,
// else C (the built-in Commons score 2-10, Uncommons 7-12, Rares 9-16, Ultra Rares 15-18). Items/Evils have neither, so they use the
// submit screen's power score (cfScore; built-ins -0.6 to 2.9): >= 4 UR, >= 2.5 R, >= 1.5 U.
const cmRarity = c => { const ch = c.type === 'character', s = ch ? maxHp(c) + 2 * baseArmor(c) + Math.max(0, ...c.moves.map(m => m.power || 0)) : cfScore(c);
  return ['UR', 'R', 'U'][(ch ? [15, 12, 9] : [4, 2.5, 1.5]).findIndex(t => s >= t)] || 'C'; };

// An approved card object -> the card cardfile.js rebuilds from a clamped form (numbers clamped, text regenerated, effects only from the
// submit menu, which is stricter than runOps' op list), or null when the submit screen couldn't have made it: unknown type, a name
// that is empty or over 22 characters, no moves or more than 2, an unknown op or effect, or more than one card-level effect.
function cmCard(o) {
  if (!o || typeof o !== 'object' || !['character', 'bit', 'evil'].includes(o.type) || typeof o.name !== 'string' || !o.name.trim() || o.name.trim().length > 22) return null;
  // a one-op list (or a passive mod object) -> its menu entry { eff, n }; nothing -> { eff: '' }; anything else -> null
  const eff = (v, keys) => {
    if (v === undefined || (Array.isArray(v) && !v.length)) return { eff: '' };
    const s = JSON.stringify(Array.isArray(v) ? (v.length === 1 ? v[0] : null) : v);
    for (const k of keys) for (let n = 1; n <= 3; n++) if (JSON.stringify(CF_EFF[k][1](n)) === s) return { eff: k, n };
    return null;
  };
  const hooks = [['onPlay', 'play'], ['onBreak', 'hit'], ['onTurnStart', 'turn'], ['mod', 'passive']].filter(([k]) => o[k] !== undefined);
  const [hook, trig = ''] = hooks[0] || [], dur = o.type === 'bit' && hook !== 'onPlay' ? o.dur : 0; // cfBuild gives Instant Items dur 1 too
  const top = hooks.length > 1 || (hook && !cfTrigs(o.type, dur).includes(trig)) ? null : hook ? eff(o[hook], CF_OK[trig]) : { eff: '' };
  if (!top || (o.type !== 'character' && !top.eff)) return null; // the submit screen always gives Items and Evils an effect
  const moves = o.type === 'character' ? o.moves : [];
  if (!Array.isArray(moves) || (o.type === 'character' && (!moves.length || moves.length > 2))) return null;
  const mv = moves.map(m => { const ab = m?.ability === true, e = m && typeof m === 'object' ? eff(ab ? m.ops : m.onHit, CF_OK[ab ? 'ability' : 'onHit']) : null; return e && { name: m.name, cost: m.cost, ability: ab, power: m.power, ...e }; });
  if (mv.includes(null)) return null;
  return cfBuild(cfClean({ type: o.type, name: o.name, credit: o.artist, hp: o.hp, def: o.def, cost: o.cost, dur, fx: { trig, ...top }, moves: mv,
    fins: Object.fromEntries(CF_FINS.map(k => [k, Array.isArray(o.finishes) && o.finishes.includes(k)])), crop: o.crop, cropFull: o.cropFull }));
}

// Pure (no DOM, no network): replaces the community cards in `cards` (CARDS) and `byId` (CARD) with the valid rows of approved_cards,
// in approval order so card numbers stay put between loads. Returns the cards added. Skips rows that fail cmCard, have a bad uuid or
// image path, or whose id or name is already taken; at most CM_MAX.
function cmRegister(rows, cards, byId) {
  for (let i = cards.length; i--;) if (cards[i].community) { delete byId[cards[i].id]; cards.splice(i, 1); }
  const names = new Set(Object.values(byId).map(c => String(c.name).toLowerCase())), out = [];
  let no = cards.length; // built-in cards are numbered 001..cards.length
  const list = (Array.isArray(rows) ? rows : []).filter(r => r && typeof r === 'object' && typeof r.id === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(r.id))
    .sort((a, b) => String(a.approved_at).localeCompare(String(b.approved_at)) || a.id.localeCompare(b.id));
  for (const r of list) {
    const card = cmCard(r.card), id = 'community_' + r.id.slice(0, 8).toLowerCase();
    if (out.length >= CM_MAX || !card || byId[id] || names.has(card.name.toLowerCase()) || typeof r.image_path !== 'string' || !/^[\w-]{1,64}\/[\w-]{1,64}\.(webp|png|jpe?g)$/i.test(r.image_path)) continue;
    // straight apostrophes become ’ so names like "Duke's" read the same in renderCard and in the esc()aped spots (viewer, toasts, log)
    const c = Object.assign(cfSafe(JSON.parse(JSON.stringify(card).replace(/'/g, '’'))), { id, no: String(++no).padStart(3, '0'), rarity: cmRarity(card), community: true, artPath: r.image_path });
    names.add(card.name.toLowerCase()); cards.push(c); byId[id] = c; out.push(c);
  }
  return out;
}

// ?dev test panel (economy.js): 3 normal copies of every community card, to deck them and play the bot.
function cmGive() {
  const list = CARDS.filter(c => c.community);
  for (const c of list) { const e = (coll[c.id] ||= { n: 0, f: {} }); e.n += 3; e.f.normal = (e.f.normal || 0) + 3; }
  store.set('collection', coll); render();
  return list.length ? `Added 3 of each of ${list.length} community cards` : 'No community cards loaded yet';
}

// ---------------- browser only (the tests load just the functions above) ----------------
if (typeof window !== 'undefined') {
  const cached = store.get('communityCards', null);
  let cmText = JSON.stringify(cached), cmLoading = null, cmHeld = null;
  const cmShow = () => { if (ui.view !== 'open' && ui.view !== 'game') render(); }; // never redraw under a pack tear or a battle animation
  const cmApply = rows => {
    const added = cmRegister(rows, CARDS, CARD), ids = added.map(c => c.id);
    // 5+ community cards get their own pack; fewer join every pack's pool so they can still be pulled
    for (const k in PACK_SET) PACK_SET[k] = PACK_SET[k].filter(id => !id.startsWith('community_'));
    delete PACK_SET.community; if (PACKS.at(-1).id === 'community') PACKS.pop();
    if (ids.length >= 5) { PACK_SET.community = ids; PACKS.push({ id: 'community', name: 'Community Pack', colour: '#d6336c' }); }
    else for (const k in PACK_SET) PACK_SET[k].push(...ids);
    // decks: drop a card taken off the list; put back ones app.js dropped at load because it didn't know them yet (saved decks still hold them)
    const raw = store.get('decks', []);
    for (const d of decks) {
      for (const id in d.cards) if (id.startsWith('community_') && !CARD[id]) delete d.cards[id];
      for (const [id, n] of Object.entries((Array.isArray(raw) && raw.find(x => x?.id === d.id)?.cards) || {})) if (CARD[id]?.community && !(id in d.cards)) d.cards[id] = n;
    }
    added.forEach(c => { c.art = CM_ART[c.artPath]; });
    cmArt(added);
  };
  // Pictures: Cache API first (keyed by the storage URL), else the private bucket with the public key; shown as blob URLs (same-origin, so the rainbow repaint can read them).
  const cmArt = async cards => {
    const need = cards.filter(c => !c.art); if (!need.length || !CLOUD.url) return;
    const box = typeof caches !== 'undefined' ? await caches.open('community-art').catch(() => null) : null; // no Cache API on plain http
    let got = 0;
    await Promise.all(need.map(async c => {
      const url = `${CLOUD.url}/storage/v1/object/authenticated/submissions/${c.artPath}`;
      try {
        let res = await box?.match(url);
        if (!res) { res = await fetch(url, { headers: { apikey: CLOUD.key, authorization: 'Bearer ' + CLOUD.key } }); if (!res.ok) return; await box?.put(url, res.clone()).catch(() => {}); }
        const b = await res.blob(); if (!/^image\/(webp|png|jpeg)$/.test(b.type)) return;
        c.art = CM_ART[c.artPath] ||= URL.createObjectURL(b); got++;
      } catch { /* no picture: the placeholder stays */ }
    }));
    if (got) cmShow();
  };
  // The list itself: 6 s timeout; any failure means no change. A new answer is applied, cached (when small enough) and drawn once.
  const cmFetch = async () => {
    try {
      const r = await fetch(CLOUD.url + '/rest/v1/rpc/approved_cards', { method: 'POST', headers: { apikey: CLOUD.key, 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout?.(6000) });
      const text = r.ok ? await r.text() : '', rows = text.length < 2e6 && JSON.parse(text || 'null');
      if (!Array.isArray(rows) || JSON.stringify(rows) === cmText) return;
      cmText = JSON.stringify(rows); if (text.length < 5e5) store.set('communityCards', rows);
      cmApply(rows); cmShow();
    } catch { /* offline or refused: keep what we have */ }
  };
  const cmLoad = () => (cmLoading ||= cmFetch().finally(() => { cmLoading = null; }));

  // Battles: both players must know the same cards. An unknown id in the other side's deck (hosting) or in the dealt game (joining)
  // refreshes the list once and retries; still unknown = refuse with a toast. Messages that arrive meanwhile wait their turn.
  const cmUnknown = m => { try {
    const ids = isHost ? (m.t === 'hello' && !state && m.deck?.cards && typeof m.deck.cards === 'object' ? Object.keys(m.deck.cards) : [])
      : m.t === 'state' && m.s ? m.s.players.flatMap(p => [p.captain, ...p.deck, ...p.hand, ...p.field.map(f => f.id), ...p.effects.map(e => e.id)]) : [];
    return ids.filter(id => !CARD[id]);
  } catch { return []; } };
  const onMsgNoCommunity = onMsg;
  onMsg = m => {
    if (cmHeld) return void cmHeld.push(m);
    if (!m || typeof m !== 'object') return onMsgNoCommunity(m);
    if (isHost && m.t === 'error' && m.missing) { leave(); return toast(String(m.msg).slice(0, 120)); } // the guest refused our deck
    if (!cmUnknown(m).length) return onMsgNoCommunity(m);
    cmHeld = [m];
    (CLOUD.url ? cmLoad() : Promise.resolve()).then(() => {
      const q = cmHeld; cmHeld = null;
      if (!cmUnknown(q[0]).length) return q.forEach(onMsg);
      toast('Your opponent is using a card you don\'t have yet — both refresh the page');
      conn?.send({ t: 'error', msg: 'Your opponent doesn\'t have one of your cards yet — both refresh the page', missing: true });
      if (!isHost) leave(true);
    });
  };

  // Start-up: the cached list now (so owned cards are there offline), the network in the background.
  if (CLOUD.url && Array.isArray(cached) && cached.length) { cmApply(cached); render(); }
  if (CLOUD.url) cmLoad();
}
