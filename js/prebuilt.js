// Pre-built decks: the free starters plus one deck per Captain. Own as many copies of each card as a deck uses (any finish) and it's
// complete: a one-time coin reward, it joins My decks (not editable; "Copy to customise" makes your own version), and the copies it needs
// can't be sold (keep() in js/economy.js). The Decks tab becomes a list (view 'decks'); tapping one of My decks opens the old editor ('deck').
// Save: 'pbClaimed' (ids of completed decks, reward paid) and a deck's optional `pre` (which pre-built it is); both checked by cleanSave (js/cloud.js).

// ---------------- pure helpers (also used by cleanSave in js/cloud.js and by test/game.test.js) ----------------
const PB_REWARD = { starter: 1000, captain: 2500 }, PB_NEAR = 0.8; // "Almost there" from 80% (32/40)
const PB_CAP = [
  { id: 'supernova', captain: 'captain_xee', name: 'Supernova', theme: 'Stack Creativity, then light the 6-cost Supernova.', cards: { scrunge_nexus: 3, scrunge_anna_lee: 3, jangle_chi_chi: 3, scrunge_wiffle_v3: 3, item_here_comes_sun: 3, scrunge_atlas: 2, item_deity_form_v2: 2, item_entity_form_v2: 1, scrunge_orpheus: 3, jegg_sapphire: 3, item_bee_swarm: 3, jangle_vesper: 2, scrunge_wiffle_v2: 3, item_wiffle_soup: 3, scrunge_alek: 1, item_brain_dump: 2 } },
  { id: 'rust-wall', captain: 'captain_rotgrease', name: 'Rust Wall', theme: 'Big armour up front, Boredom ticking every turn.', cards: { jimmy_arhakoth: 1, scrunge_maxos: 2, jegg_anxio: 2, scrunge_noxx_darmen: 2, lord_osric_hayden: 3, jangle_enoch: 2, jangle_enoch_son: 2, item_anxious_duo_v2: 2, item_wont_let_rest_v2: 3, item_bee_swarm: 3, item_pollen_season_v2: 3, item_nap_time: 3, item_nicer_mondays_v2: 2, scrunge_monday: 3, item_reasonable_take: 3, jangle_rose: 3, scrunge_toru: 1 } },
  { id: 'butter-brigade', captain: 'captain_abby', name: 'Butter Brigade', theme: 'Assemble the Butter crew: every buddy hits harder.', cards: { scrunge_custard: 3, scrunge_whippie: 3, scrunge_monterey: 3, item_butter: 3, scrunge_calytrix_and_noli: 2, jegg_u2: 3, item_u2_flyover: 3, scrunge_mayree: 3, jegg_abigaia: 3, jegg_jenosu: 2, jegg_lyra: 3, item_wiffle_soup: 3, item_nicer_mondays_v2: 2, jegg_pomegranate: 2, scrunge_wiffle_salamander: 2 } },
  { id: 'plot-twist', captain: 'captain_hamish', name: 'Plot Twist', theme: 'Draw the whole story and starve their Creativity.', cards: { jangle_grim: 3, item_wifi_password: 3, item_brain_dump: 3, scrunge_caerus: 3, jangle_rose: 3, item_pollen_season_v2: 3, jangle_evil_oc: 3, jegg_abigaia: 2, jegg_abigaia_v2: 2, scrunge_snoob: 3, lord_fey: 2, lord_fey_v2: 2, jangle_drow_paladin: 1, scrunge_june: 3, jegg_poinsettia: 2, item_hidden_blade: 2 } },
  { id: 'chain-reaction', captain: 'captain_snazzyrhyno', name: 'Chain Reaction', theme: 'Extra Actions into one huge turn.', cards: { scrunge_nexus: 3, jegg_u2: 3, item_u2_flyover: 3, scrunge_dusk: 3, scrunge_acer: 3, scrunge_caerus: 2, jangle_water_dog: 3, scrunge_robo_cat_girl: 2, jangle_fenrik: 3, item_here_comes_sun: 2, item_hidden_blade: 3, scrunge_maxi: 3, jegg_brulee: 3, anonagon_jeremy: 1, item_wifi_password: 3 } },
  { id: 'coin-toss-carnival', captain: 'captain_wawa', name: 'Coin Toss Carnival', theme: 'Every card flips a coin. Heads, you win.', cards: { jangle_dizzy: 3, scrunge_bobby: 3, scrunge_monterey: 3, scrunge_robo_cat_girl: 2, scrunge_wiffle_salamander: 2, scrunge_monday: 3, scrunge_alek: 1, jegg_lyra: 3, scrunge_atlas: 2, anonagon_jeremy: 2, scrunge_wiffle_v3: 3, scrunge_noxx_darmen: 2, scrunge_scugs: 2, item_bee_swarm: 3, item_u2_flyover: 3, jangle_unnamed_ocs: 3 } },
  { id: 'night-light', captain: 'captain_moth', name: 'Night Light', theme: 'Drain their Creativity, calm your own Boredom.', cards: { scrunge_corin: 3, jangle_vesper: 2, item_evening_coil_v2: 2, jangle_rose: 3, item_pollen_season_v2: 3, item_nap_time: 3, item_reasonable_take: 3, scrunge_june: 3, scrunge_mayree: 3, item_nicer_mondays_v2: 3, jangle_enoch: 2, jangle_enoch_son: 2, scrunge_custard: 2, jegg_yooperlite: 3, jangle_drow_paladin: 1, scrunge_dusk: 2 } },
  { id: 'crunch-time', captain: 'captain_anonagon', name: 'Crunch Time', theme: 'All-nighter: draw, ramp Actions, ship it.', cards: { anonagon_jeremy: 2, jegg_u2: 3, item_u2_flyover: 3, scrunge_nexus: 3, item_brain_dump: 3, item_wifi_password: 3, jangle_grim: 3, jegg_pomegranate: 3, scrunge_orpheus: 2, item_entity_form_v2: 1, jangle_chi_chi: 3, scrunge_anna_lee: 3, jegg_jenosu: 2, scrunge_toru: 3, jimmy_arhakoth: 1, item_here_comes_sun: 2 } },
];
const pbSlug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
// Starters first (their lists live in js/cards-data.js, so a rebalance there carries over), then the Captain decks.
const PB_DECKS = [...STARTERS.map(s => ({ id: 'starter-' + pbSlug(s.name), kind: 'starter', name: s.name, captain: s.captain, cards: s.cards, theme: 'Starter deck: all HEEHN Starter Pack cards.' })),
  ...PB_CAP.map(d => ({ ...d, kind: 'captain' }))].map(d => ({ ...d, reward: PB_REWARD[d.kind] }));
const PB_BY = new Map(PB_DECKS.map(d => [d.id, d]));
const pbKnown = id => typeof id === 'string' && PB_BY.has(id);
const pbOwn = (col, id) => (Object.hasOwn(col, id) && col[id]?.n) || 0;
const pbSize = d => Object.values(d.cards).reduce((a, n) => a + n, 0);
const pbHave = (d, col) => Object.entries(d.cards).reduce((a, [id, n]) => a + Math.min(n, pbOwn(col, id)), 0);
const pbState = (d, col) => { const h = pbHave(d, col), t = pbSize(d); return h >= t ? 'done' : h >= t * PB_NEAR ? 'near' : 'lock'; };
const pbMissing = (d, col) => Object.entries(d.cards).filter(([id, n]) => pbOwn(col, id) < n).map(([id, n]) => ({ id, n, need: n - pbOwn(col, id) }));
// Newly complete decks: claimed once, paid once. Returns the decks, the coins and the new claimed list (the old one is not changed).
const pbSettle = (col, claimed) => { const done = PB_DECKS.filter(d => !claimed.includes(d.id) && pbState(d, col) === 'done');
  return { done, pay: done.reduce((a, d) => a + d.reward, 0), claimed: [...claimed, ...done.map(d => d.id)] }; };
// Copies that can't be sold: the most any completed pre-built deck uses.
const pbKeepOf = (id, claimed) => Math.max(0, ...claimed.map(k => PB_BY.get(k)?.cards[id] || 0));
// Untrusted list (save file, cloud): an array of short strings, else null. Ids that aren't pre-built decks (any more) are dropped.
const pbCleanClaimed = v => (Array.isArray(v) && v.length <= 100 && v.every(x => typeof x === 'string' && x.length <= 40) ? [...new Set(v.filter(pbKnown))] : null);

// ---------------- browser only ----------------
let pbClaimed = pbCleanClaimed(store.get('pbClaimed', [])) || [];
const pbKeep = id => pbKeepOf(id, pbClaimed);
const PB_LOCK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 10.5h13v10h-13z"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3h-2.3v-3a1.7 1.7 0 0 0-3.4 0v3z"/></svg>';
const pbSame = (a, b) => a.captain === b.captain && JSON.stringify(Object.entries(a.cards).sort()) === JSON.stringify(Object.entries(b.cards).sort());
// A deck marked pre-built always matches its list; a mark for a deck that no longer exists is dropped (it becomes a normal deck).
for (const d of decks) if (d.pre !== undefined) { const p = PB_BY.get(d.pre); if (p) Object.assign(d, { captain: p.captain, cards: { ...p.cards } }); else delete d.pre; }
// Your copy in My decks: the one marked as it, else an untouched identical deck (a starter from the free packs or a legacy save).
const pbMine = p => decks.find(d => d.pre === p.id) || decks.find(d => pbSame(d, p));
const pbAdd = p => { let d = pbMine(p); if (!d) { d = { id: uid(), name: p.name, captain: p.captain, cards: { ...p.cards }, pre: p.id }; decks.push(d); } return d; };

// ---------- completion: checked on every render once nothing is mid-way (a pack still being revealed, a battle, the save question) ----------
let pbQ = [], pbBought = null, pbTimer = 0; // celebrations waiting: { ids, pay, last }; pbBought = the card just bought in the Shop
const pbCalm = () => onb.done && !(typeof gateUp === 'function' && gateUp()) && ui.view !== 'game' && !ui.cloudAsk && !ui.resetBusy && !(ui.view === 'open' && ui.open && ui.open.stage !== 'summary');
const pbTourOn = () => Number.isInteger(store.get('tour', null)?.step); // js/tour.js: a tour waiting or running; the sheet waits until it ends
function pbLast(done) {
  const o = ui.view === 'open' && ui.open?.stage === 'summary' && !ui.open.free && !ui.open.demo ? ui.open : null;
  const src = o ? [...o.cards].reverse().map(c => ({ id: c.id, from: `from this ${PACKS.find(k => k.id === o.pack)?.name || ''} pack` })) : pbBought ? [{ id: pbBought, from: 'bought in the Shop' }] : [];
  return src.find(s => done.some(p => p.cards[s.id])) || null;
}
function pbCheck() {
  const r = pbSettle(coll, pbClaimed); if (!r.done.length) return;
  pbClaimed = r.claimed; store.set('pbClaimed', pbClaimed);
  r.done.forEach(pbAdd); saveDecks();
  setCoins(coins + r.pay);
  pbQ.push({ ids: r.done.map(p => p.id), pay: r.pay, last: pbLast(r.done) });
}

// ---------- the "Deck complete!" sheet (one deck), or one combined summary when several finish together ----------
const pbConfetti = () => `<div class="pb-confetti">${Array.from({ length: 26 }, (_, i) => `<i style="left:${(i * 37) % 100}%;--r:${(i * 47) % 180}deg;--d:${((i * 0.29) % 2.4).toFixed(2)}s;--x:${((i * 23) % 60) - 30}px;--c:${['#ff8fb4', '#ffcd75', '#8ee3ae', '#74ccf7', '#ad98f5', '#f2b51e'][i % 6]}"></i>`).join('')}</div>`;
function pbCeleHtml() {
  const q = pbQ[0], list = q.ids.map(id => PB_BY.get(id)).filter(Boolean), reward = `<div class="reward neu-in pb-reward">${COIN}<b>+${fmt(q.t0 ? q.pay : 0)}</b></div>`;
  if (list.length === 1) {
    const p = list[0], cap = CARD[p.captain], l = q.last && CARD[q.last.id], mine = pbMine(p);
    return `<div class="pb-cele-wrap"><div class="pb-dim" data-act="pb-later"></div><div class="sheet pb-cele" role="dialog" aria-label="Deck complete"><div class="grab"></div>
      <div class="pb-burst">${renderCard(cap)}<span class="pb-done-badge">${ICON.check}</span></div>
      <h1 class="pb-big">Deck complete!</h1><div class="pb-sub">${esc(cap.name)}'s ${esc(p.name)} deck · ${pbSize(p)}/${pbSize(p)}</div>
      ${l ? `<div class="pb-last neu-in">${renderCard(l, { cls: 'mini' })}<div><b>The last card: ${esc(l.name)}</b><small>${esc(q.last.from)}</small></div></div>` : ''}
      ${reward}<div class="row2"><button class="btn" data-act="pb-later">Later</button>${mine && mine.id === deck().id ? '<button class="btn primary" data-act="pb-later">Already your deck</button>' : `<button class="btn primary" data-act="pb-use" data-id="${p.id}" data-cele="1">Use this deck</button>`}</div>
      <small class="pb-foot">${esc(p.name)} is ${mine && !mine.pre ? 'already' : 'now'} in My decks. Copy it any time to change cards.</small></div>${calm ? '' : pbConfetti()}</div>`;
  }
  return `<div class="pb-cele-wrap"><div class="pb-dim" data-act="pb-later"></div><div class="sheet pb-cele" role="dialog" aria-label="Decks complete"><div class="grab"></div>
    <h1 class="pb-big">${list.length} decks complete!</h1><div class="pb-sub">Every card for these pre-built decks is in your collection.</div>
    <div class="pb-multi">${list.map(p => `<div class="pb-mrow neu-in">${renderAvatar(CARD[p.captain])}<span><b>${esc(p.name)}</b><small>${esc(CARD[p.captain].name)} · ${p.kind === 'starter' ? 'Starter' : 'Captain'} deck</small></span><span class="pb-coin">${COIN}${fmt(p.reward)}</span></div>`).join('')}</div>
    ${reward}<div class="row2"><button class="btn" data-act="pb-later">Later</button><button class="btn primary" data-act="pb-see">See my decks</button></div>
    <small class="pb-foot">They're in My decks now. Copy one any time to change cards.</small></div>${calm ? '' : pbConfetti()}</div>`;
}
// Coins are already paid; the number counts up once, with the reward sounds.
function pbCount() {
  const q = pbQ[0]; clearInterval(pbTimer); if (q.t0 && Date.now() - q.t0 > 1400) return;
  // behind the title screen (js/audio.js) at load: count up after the tap that starts the sound
  if (!q.t0 && typeof title !== 'undefined' && title.isConnected && !title.classList.contains('gone')) return void (pbTimer = setInterval(() => { if (!title.isConnected || title.classList.contains('gone')) { clearInterval(pbTimer); if (pbQ[0] === q) pbCount(); } }, 200));
  if (!q.t0) { q.t0 = calm ? 1 : Date.now(); if (typeof sfx === 'function') { sfx('versus_rewards_2_barfillsparkle'); setTimeout(() => sfx('ui_reward_coinreward'), 1300); } if (calm) return; }
  const tick = () => { const b = $app.querySelector('.pb-reward b'), k = Math.min(1, (Date.now() - q.t0) / 1300); if (!b) return clearInterval(pbTimer);
    b.textContent = '+' + fmt(q.pay * (1 - (1 - k) ** 3)); if (k >= 1) { clearInterval(pbTimer); b.parentElement.classList.add('done'); } };
  tick(); pbTimer = setInterval(tick, 30);
}

// ---------- Decks tab: My decks + Pre-built decks ----------
const pbStChip = s => s === 'done' ? `<span class="pb-st pb-st-done">${ICON.check}Complete</span>` : s === 'near' ? '<span class="pb-st pb-st-near">Almost there</span>' : `<span class="pb-st pb-st-lock">${PB_LOCK}Locked</span>`;
const pbPct = p => (100 * pbHave(p, coll) / pbSize(p)).toFixed(1);
function pbMyRow(d) {
  const cap = CARD[d.captain], n = count(d), probs = deckProblems(d), on = d.id === deck().id;
  const bad = n !== DECK_SIZE ? (n < DECK_SIZE ? `${DECK_SIZE - n} more card${DECK_SIZE - n > 1 ? 's' : ''}` : `${n - DECK_SIZE} too many`) : (probs[0] || '');
  return `<button class="pb-md neu${on ? ' on' : ''}" data-act="pb-mine" data-id="${esc(d.id)}">${cap ? renderAvatar(cap) : '<span class="avatar"></span>'}<span class="pb-md-t"><b><span class="pb-nm">${esc(d.name)}</span>${d.pre ? '<span class="pb-st pb-st-pre">Pre-built</span>' : ''}</b>
    <small>${cap ? esc(cap.name) + ' · ' : ''}${n}/${DECK_SIZE} · ${probs.length ? `<span class="pb-bad">${esc(bad)}</span>` : '<span class="pb-ok">Ready</span>'}</small></span>${on ? '<span class="pb-use">IN USE</span>' : ''}${ICON.chevron}</button>`;
}
function pbRow(p) {
  const h = pbHave(p, coll), t = pbSize(p), s = pbState(p, coll), cap = CARD[p.captain], got = pbClaimed.includes(p.id);
  const ft = s === 'done' ? `<span class="pb-coin${got ? ' claimed' : ''}">${COIN}${fmt(p.reward)}${got ? ' ✓' : ''}</span><button class="btn sm" data-act="pb-copy" data-id="${p.id}">Copy</button><button class="btn sm primary" data-act="pb-use" data-id="${p.id}">Use</button>`
    : `<span class="pb-coin">${COIN}${fmt(p.reward)}</span><span class="pb-gap">${t - h} card${t - h > 1 ? 's' : ''} to go</span>`;
  return `<div class="pb-row neu pb-${s}" ${tappable('pb-open', `data-id="${p.id}"`)} aria-label="${esc(p.name)}"><div class="pb-ring" style="--p:${pbPct(p)}">${renderAvatar(cap)}${s === 'near' ? '' : `<span class="pb-badge">${s === 'done' ? ICON.check : PB_LOCK}</span>`}</div>
    <div class="pb-main"><div class="pb-t"><b>${esc(p.name)}</b>${pbStChip(s)}</div><small><i>${esc(cap.name)} · ${esc(cap.style)}.</i> ${esc(p.theme)}</small>
      <div class="pb-prog"><div class="progress"><i style="width:${pbPct(p)}%"></i></div><span>${h}/${t}</span></div><div class="pb-ft">${ft}</div></div></div>`;
}
function viewDecks() {
  const R = { done: 0, near: 1, lock: 2 }, st = p => pbState(p, coll), f = ui.pbF || 'all';
  const all = [...PB_DECKS].sort((a, b) => R[st(a)] - R[st(b)] || pbHave(b, coll) - pbHave(a, coll));
  const shown = all.filter(p => f === 'all' || (f === 'starter' ? p.kind === 'starter' : st(p) === f));
  const n = k => all.filter(p => (k === 'starter' ? p.kind === 'starter' : st(p) === k)).length;
  const chip = (k, label, c) => `<button class="chip${f === k ? ' on' : ''}" data-act="pb-filter" data-f="${k}">${label} <b>${c}</b></button>`;
  return `${header('Decks')}
    <div class="lbl2">${ICON.cards}My decks<small>${decks.length}</small></div>
    <div class="pb-mdl">${decks.map(pbMyRow).join('')}</div>
    <div class="pb-newdeck"><button class="btn sm" data-act="pb-new">+ New deck</button><button class="btn sm" data-act="pb-import">Import code</button></div>
    <div class="lbl2">${ICON.cards}Pre-built decks<small>${n('done')} of ${PB_DECKS.length} complete</small></div>
    <div class="pb-chips">${chip('all', 'All', all.length)}${chip('near', 'Almost there', n('near'))}${chip('done', 'Complete', n('done'))}${chip('starter', 'Starters', n('starter'))}</div>
    <div class="pb-list">${shown.map(pbRow).join('') || '<p class="muted center">None here yet.</p>'}</div>
    <div class="pb-pad"></div>${tabbar('deck')}`;
}

// ---------- one pre-built deck ----------
const PB_TYPE = { character: 0, bit: 1, evil: 2 };
const pbPackImg = k => `<span class="pb-pkimg" style="--pc:${k.colour}"><img ${assetSrc(`art/local/pack-${k.id}.png`)} alt="" onerror="this.remove()"></span>`;
function viewPb() {
  const p = PB_BY.get(ui.pb); if (!p) { ui.view = 'decks'; return viewDecks(); }
  const h = pbHave(p, coll), t = pbSize(p), s = pbState(p, coll), cap = CARD[p.captain], got = pbClaimed.includes(p.id), mine = s === 'done' && pbMine(p);
  const miss = pbMissing(p, coll), nMiss = miss.reduce((a, m) => a + m.need, 0), packOf = id => PACKS.find(k => PACK_SET[k.id]?.includes(id));
  const groups = PACKS.map(k => ({ k, list: miss.filter(m => packOf(m.id) === k) })).filter(g => g.list.length), loose = miss.filter(m => !packOf(m.id));
  const thumb = m => `<div class="cell${pbOwn(coll, m.id) ? ' pb-part' : ' pb-none'}">${renderCard(CARD[m.id], { cls: 'mini', attrs: tappable('view-card', `data-id="${m.id}"`) })}<span class="pb-need">Need ${m.need}</span></div>`;
  const names = list => list.map(m => esc(CARD[m.id].name) + (m.need > 1 ? ` ×${m.need}` : '')).join(', ');
  const list = Object.entries(p.cards).sort(([a], [b]) => (PB_TYPE[CARD[a].type] ?? 3) - (PB_TYPE[CARD[b].type] ?? 3) || (RANK[CARD[b].rarity || 'C'] - RANK[CARD[a].rarity || 'C']))
    .filter(([id, n]) => ui.pbList !== 'miss' || s === 'done' || pbOwn(coll, id) < n);
  return `<div class="pb-top"><button class="btn sm" data-act="pb-back">‹ Decks</button></div>
    <section class="neu pb-head pb-${s}"><div class="pb-head-top">${renderCard(cap, { attrs: tappable('view-card', `data-id="${cap.id}"`) })}<div><small>Pre-built · ${esc(cap.name)} · ${esc(cap.style)}</small><b class="pb-hn">${esc(p.name)}</b>${pbStChip(s)}<p>${esc(p.theme)}</p></div></div>
      <div class="pb-prog"><div class="progress"><i style="width:${pbPct(p)}%"></i></div><span>${h}/${t} cards</span></div></section>
    ${s === 'done' ? `<section class="neu pb-inlist"><small class="lbl">In My decks</small>${mine ? pbMyRow(mine) : `<button class="btn sm" data-act="pb-use" data-id="${p.id}">Add it to My decks</button>`}
        <p>Pre-built decks can't be edited, so they always match this list. Copy it to swap cards; the copy is yours to change.</p></section>
      <div class="pb-rewardline neu got">${COIN}<span><b>${fmt(p.reward)} coins</b> ${got ? 'collected for completing it.' : 'for completing it.'}</span>${ICON.check}</div>`
    : `<section class="panel neu pb-miss"><small class="lbl">Missing cards · ${nMiss}</small>
        ${groups.map(({ k, list }) => { const n = list.reduce((a, m) => a + m.need, 0);
          return `<div class="pb-mp">${pbPackImg(k)}<div><b>${esc(k.name)}</b><small>${n} card${n > 1 ? 's' : ''}: ${names(list)}</small></div>
            <button class="btn sm primary" data-act="goto-pack" data-p="${k.id}">Open ${COIN}${fmt(price(k.id))}</button><div class="pb-thumbs">${list.map(thumb).join('')}</div></div>`; }).join('')}
        ${loose.length ? `<div class="pb-mp"><span class="pb-pkimg"></span><div><b>Not in a pack</b><small>${names(loose)}</small></div><span></span><div class="pb-thumbs">${loose.map(thumb).join('')}</div></div>` : ''}
        <div class="pb-shopline">Or buy single cards in the <button class="pb-link" data-act="shop">Shop</button>.</div></section>
      <div class="pb-rewardline neu">${COIN}<span>Complete it for <b>${fmt(p.reward)} coins</b> (once) and it becomes a deck you can use.</span></div>`}
    <div class="lbl2">${ICON.cards}Deck list<small>${s === 'done' ? `${t} cards + Captain` : `${Object.keys(p.cards).length} different cards`}</small></div>
    ${s === 'done' ? '' : `<div class="pb-seg"><button class="chip${ui.pbList !== 'miss' ? ' on' : ''}" data-act="pb-list" data-f="all">All ${t}</button><button class="chip${ui.pbList === 'miss' ? ' on' : ''}" data-act="pb-list" data-f="miss">Missing ${nMiss}</button><small class="muted">Tap a card to look</small></div>`}
    <div class="pb-grid">${list.map(([id, n]) => { const k = pbOwn(coll, id), m = n - Math.min(n, k);
      return `<div class="cell${m ? (k ? ' pb-part' : ' pb-none') : ''}">${renderCard(CARD[id], { attrs: tappable('view-card', `data-id="${id}"`) })}<span class="count">${m ? `${k}/${n}` : `×${n}`}</span>${m ? `<span class="pb-need">Need ${m}</span>` : ''}</div>`; }).join('')}</div>
    <div class="bar pb-bar">${s === 'done' ? `<button class="btn" data-act="pb-copy" data-id="${p.id}">Copy to customise</button>${mine && mine.id === deck().id ? '<button class="btn primary" disabled>Your deck now</button>' : `<button class="btn primary" data-act="pb-use" data-id="${p.id}">Use as my deck</button>`}`
      : `<button class="btn" disabled>${PB_LOCK}Use deck</button>${groups.length ? `<button class="btn primary" data-act="goto-pack" data-p="${groups[0].k.id}">Open packs</button>` : '<button class="btn primary" data-act="shop">Shop</button>'}`}</div>
    ${tabbar('deck')}${viewer()}`;
}

// ---------- actions ----------
const PB_NOEDIT = "Pre-built decks can't be changed. Tap Copy to customise for your own version.";
const pbLocked = () => !!deck().pre;
const pbPick = d => { ui.deckId = d.id; store.set('deck', d.id); };
for (const k of ['step', 'captain', 'rename-deck']) { const f = ACTS[k]; ACTS[k] = d => (pbLocked() ? toast(PB_NOEDIT) : f(d)); }
const pbGo = ACTS.go; ACTS.go = d => (d.to === 'build' && pbLocked() ? toast(PB_NOEDIT) : pbGo(d));
const pbBuy = ACTS.buy; ACTS.buy = d => { const n = pbOwn(coll, d.id), r = pbBuy(d); if (pbOwn(coll, d.id) > n) pbBought = d.id; return r; };
Object.assign(ACTS, {
  'pb-mine'(d) { const x = decks.find(k => k.id === d.id); if (!x) return; if (x.pre) { ui.pb = x.pre; ui.pbList = 'all'; ui.view = 'pb'; return; } pbPick(x); ui.view = 'deck'; },
  'pb-new'() { const name = prompt('Name your new deck', 'New Deck')?.trim(); if (!name) return; const d = { id: uid(), name: name.slice(0, 30), captain: null, cards: {} }; decks.push(d); saveDecks(); pbPick(d); ui.view = 'deck'; },
  'pb-import'() { const n = decks.length; ACTS['import-deck'](); if (decks.length > n) ui.view = 'deck'; },
  'pb-filter'(d) { ui.pbF = d.f; },
  'pb-open'(d) { if (!PB_BY.has(d.id)) return; ui.pb = d.id; ui.pbList = 'all'; ui.view = 'pb'; },
  'pb-list'(d) { ui.pbList = d.f; },
  'pb-back'() { ui.view = 'decks'; ui.viewer = null; },
  'pb-use'(d) {
    const p = PB_BY.get(d.id); if (!p) return;
    if (pbState(p, coll) !== 'done') return toast('Collect every card in this deck first.');
    const x = pbAdd(p); saveDecks(); pbPick(x); if (d.cele) pbQ.shift();
    toast(`${p.name} is your deck for battles now.`);
  },
  'pb-copy'(d) {
    const p = PB_BY.get(d.id); if (!p || pbState(p, coll) !== 'done') return;
    const x = { id: uid(), name: `${p.name} copy`.slice(0, 30), captain: p.captain, cards: { ...p.cards } };
    decks.push(x); saveDecks(); pbPick(x); ui.view = 'deck'; toast(`Made "${x.name}". It's yours to change.`);
  },
  'pb-later'() { pbQ.shift(); },
  'pb-see'() { pbQ.shift(); ui.viewer = null; ui.view = 'decks'; },
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $app.querySelector('.pb-cele-wrap')) { pbQ.shift(); render(); } });

// ---------- the old editor: a way back to the list, and read-only for a pre-built deck ----------
const viewDeckNoPb = viewDeck;
viewDeck = () => {
  let h = '<div class="pb-top"><button class="btn sm" data-act="pb-back">‹ Decks</button></div>' + viewDeckNoPb(); const d = deck(); if (!d.pre) return h;
  return h.replace(/<button class="btn sm" style="flex:none" data-act="rename-deck">Rename<\/button>/, '<span class="pb-st pb-st-pre">Pre-built</span>')
    .replace(/<button class="btn sm" data-act="sheet" data-s="captain">[^<]*<\/button>/, '')
    .replace(/<button class="btn primary sm"([^>]*)data-act="go" data-to="build">Add cards<\/button>/, `<button class="btn primary sm"$1data-act="pb-copy" data-id="${d.pre}">Copy to customise</button>`);
};

// ---------- selling: say why a copy is kept ----------
const viewerNoPb = viewer;
viewer = () => {
  const v = ui.viewer, html = viewerNoPb(); if (!v || v.shop) return html;
  const n = pbOwn(coll, v.id), k = pbKeep(v.id); if (!n || !k || n > k) return html;
  const names = pbClaimed.map(id => PB_BY.get(id)).filter(p => p?.cards[v.id]).map(p => esc(p.name));
  return html.replace('<button class="btn wide" data-act="close-viewer">', `<p class="pb-kept">${PB_LOCK}<span>Kept for your pre-built deck${names.length > 1 ? 's' : ''} ${names.join(', ')} (uses ${k}). Copies a completed pre-built deck needs can't be sold.</span></p>$&`);
};
const viewOpenNoPb = viewOpen;
viewOpen = () => viewOpenNoPb().replace(/<button class="btn sell-pull" data-act="sell-pull" data-i="(\d+)">[\s\S]*?<\/button>/g, (m, i) => { const c = ui.open.cards[i];
  return c && pbOwn(coll, c.id) - keep(c.id) <= 0 ? `<button class="btn sell-pull" disabled title="${pbKeep(c.id) ? 'A completed pre-built deck needs this copy' : 'Your starter deck needs this copy'}">Kept for a deck</button>` : m; });

// ---------- render: check, point the Decks tab at the list, then the celebration on top ----------
const renderNoPb = render;
render = function () {
  if (pbCalm()) pbCheck();
  pbBought = null;
  renderNoPb();
  $app.querySelectorAll('.tabbar [data-to="deck"], .tile[data-to="deck"]').forEach(b => { b.dataset.to = 'decks'; });
  if (pbQ.length && pbCalm() && !pbTourOn() && !ui.pre) { $app.insertAdjacentHTML('beforeend', pbCeleHtml().replace('pb-cele-wrap', pbQ[0].seen ? 'pb-cele-wrap seen' : 'pb-cele-wrap')); pbQ[0].seen = true; pbCount(); } // slides in once, not on every re-render
};
render();
