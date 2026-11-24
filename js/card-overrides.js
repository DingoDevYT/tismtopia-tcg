// Written by editor.html: per-card art, crop and rainbow full-art overrides, applied on top of cards-data.js.
const OVERRIDES = {};
for (const c of [...CAPTAINS, ...CARDS]) Object.assign(c, OVERRIDES[c.id] || {});
