// 5★ Rainbow cards: each art is repainted once on a canvas like a rainbow rare (rainbow fills, darker same-hue lines, silver glitter
// background). One image at a time so the UI never stalls; RB maps the art path to the finished object URL ('' = failed, show the original).
const RB = {}, rbQ = new Map();
let rbBusy = 0;
function rainbowize(img) {
  const k = img.dataset.art;
  if (img.dataset.rb || !k) return; // the swapped-in result fires load again
  if (k in RB) { if (RB[k]) img.src = RB[k]; img.dataset.rb = RB[k] ? '1' : 'x'; return; }
  if (!rbQ.has(k)) rbQ.set(k, img);
  rbBusy ||= setTimeout(rbNext);
}
function rbNext() {
  const [k, img] = rbQ.entries().next().value; rbQ.delete(k);
  // the DOM is rebuilt all the time, so the result goes to every copy of this art on screen now, not just the one that queued it
  const done = url => { RB[k] = url; for (const i of document.querySelectorAll('img[data-art]:not([data-rb])')) if (i.dataset.art === k) { if (url) i.src = url; i.dataset.rb = url ? '1' : 'x'; } rbBusy = rbQ.size ? setTimeout(rbNext) : 0; };
  try { rbPaint(img).toBlob(b => done(b ? URL.createObjectURL(b) : ''), 'image/jpeg', .92); } catch (e) { console.warn('rainbow', k, e); done(''); }
}
// one 32-bit noise value per 2x2 cell: the same glitter speck pattern on the character and the background
const rbHash = (x, y) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); return (h ^ h >>> 16) >>> 0; };
// pure hues (HSL s=1 l=.5) every half degree, so hsl -> rgb per pixel is three multiply-adds
const RB_HUE = new Float32Array(2160).map((_, j) => { const k = ([0, 8, 4][j % 3] + (j / 3 | 0) / 60) % 12; return .5 - .5 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); });
// Opaque art: marks its plain background in bg (1 = background) from the RGBA pixels d (W x H). tol = the colour jump that counts as an outline.
// Shared with the submit screen's "remove background" (js/art-tools.js).
function rbBackground(d, W, H, bg, tol = 60) {
  const n = W * H;
  {
    // opaque art: background colours = colours found on all three of the top edge and the upper 60% of each side (the bottom often cuts through
    // the character), or very common overall; one edge alone isn't enough, so a hat or hair touching the top isn't taken for background
    bg.fill(0); const P = [0, 1, 2].map(() => new Uint32Array(4096)), pal = new Uint8Array(4096), bin = i => (d[4 * i] >> 4) << 8 | (d[4 * i + 1] >> 4) << 4 | d[4 * i + 2] >> 4;
    for (let y = 0; y < 3; y++) for (let x = 0; x < W; x++) P[0][bin(y * W + x)]++;
    for (let y = 3; y < .6 * H; y++) for (let x = 0; x < 3; x++) P[1][bin(y * W + x)]++, P[2][bin(y * W + W - 1 - x)]++;
    const [mt, ml, mr] = P.map(p => p.reduce((a, b) => a + b)), m = mt + ml + mr, share = b => (P[0][b] + P[1][b] + P[2][b]) / m;
    for (let b = 0; b < 4096; b++) if (Math.min(P[0][b] / mt, P[1][b] / ml, P[2][b] / mr) >= .01 || share(b) >= .2) for (let r = Math.max(0, (b >> 8) - 1); r <= Math.min(15, (b >> 8) + 1); r++) for (let g = Math.max(0, (b >> 4 & 15) - 1); g <= Math.min(15, (b >> 4 & 15) + 1); g++) for (let c = Math.max(0, (b & 15) - 1); c <= Math.min(15, (b & 15) + 1); c++) pal[r << 8 | g << 4 | c] = 1;
    let edgeL = 0; for (let b = 0; b < 4096; b++) edgeL += share(b) * (.299 * (b >> 8) + .587 * (b >> 4 & 15) + .114 * (b & 15)) * 16 + 8 * share(b); // mean edge brightness
    // flood fill from the border through palette colours, stopping at any sharp colour step (an outline)
    const q = new Int32Array(n); let qn = 0;
    const go = (i, j) => { if (!bg[j] && pal[bin(j)] && (i < 0 || Math.abs(d[4 * i] - d[4 * j]) + Math.abs(d[4 * i + 1] - d[4 * j + 1]) + Math.abs(d[4 * i + 2] - d[4 * j + 2]) < tol)) bg[j] = 1, q[qn++] = j; };
    for (let x = 0; x < W; x++) go(-1, x), go(-1, n - W + x); for (let y = 0; y < H; y++) go(-1, y * W), go(-1, y * W + W - 1);
    for (let h = 0; h < qn; h++) { const i = q[h], x = i % W; if (x) go(i, i - 1); if (x < W - 1) go(i, i + 1); if (i >= W) go(i, i - W); if (i < n - W) go(i, i + W); }
    // the "background" swallowed the picture (or, on a dark background, ran into dark hair and clothes of the same shade): treat it all as subject
    if (qn > (edgeL < 60 ? .75 : .97) * n) bg.fill(0);
  }
}
function rbPaint(img) {
  const W = Math.min(560, img.naturalWidth), H = Math.round(img.naturalHeight * W / img.naturalWidth), n = W * H, cv = document.createElement('canvas');
  cv.width = W; cv.height = H; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, W, H);
  const id = cx.getImageData(0, 0, W, H), d = id.data, L = new Float32Array(n), bg = new Uint8Array(n), clamp = v => v < 0 ? 0 : v > 1 ? 1 : v;
  // luminance as if on white, so see-through pixels read as paper; alpha < 128 counts as background when there is enough of it
  let t = 0; for (let i = 0; i < n; i++) { const a = d[4 * i + 3]; L[i] = 255 + (.299 * d[4 * i] + .587 * d[4 * i + 1] + .114 * d[4 * i + 2] - 255) * a / 255; if (a < 128) bg[i] = 1, t++; }
  if (t < .03 * n) rbBackground(d, W, H, bg);
  // stretch the character's own light range (2nd..98th percentile, at most 2.5x) so dark or murky art still gets readable shading and lines
  const hist = new Uint32Array(256); let ns = 0; for (let i = 0; i < n; i++) if (!bg[i]) hist[L[i] | 0]++, ns++;
  let lo = 0, hi = 255; for (let a = 0, v = 0; v < 256; v++) { a += hist[v]; if (a < .02 * ns) lo = v + 1; if (a < .98 * ns) hi = v + 1; }
  const k = Math.min(2.5, 255 / Math.max(1, hi - lo)); for (let i = 0; i < n; i++) L[i] = Math.max(0, Math.min(255, 255 - (hi - L[i]) * k));
  // integral image of luminance for a cheap box blur: a line is a pixel darker than its surroundings, or a sharp edge between fills
  const r = Math.max(2, Math.round(W / 90)), S = new Float64Array((W + 1) * (H + 1)), W1 = W + 1;
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += L[y * W + x]; S[(y + 1) * W1 + x + 1] = S[y * W1 + x + 1] + row; } }
  // soft background weight: 3x3 count of the mask (0..9), so the cut-out edge is blended over a 1px ring instead of jagged
  const hz = new Uint8Array(n), M = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const x = i % W; hz[i] = bg[i] + bg[x ? i - 1 : i] + bg[x < W - 1 ? i + 1 : i]; }
  for (let i = 0; i < n; i++) M[i] = hz[i] + hz[i < W ? i : i - W] + hz[i >= n - W ? i : i + W];
  let R = 0, G = 0, B = 0; const hsl = (h, s, l) => { const j = 3 * ((h * 2 | 0) % 720), c = (1 - Math.abs(2 * l - 1)) * s * 255; l *= 255; R = l + c * (RB_HUE[j] - .5); G = l + c * (RB_HUE[j + 1] - .5); B = l + c * (RB_HUE[j + 2] - .5); };
  for (let y = 0; y < H; y++) {
    const up = y ? -W : 0, dn = y < H - 1 ? W : 0, y0 = Math.max(0, y - r) * W1, y1 = Math.min(H, y + r + 1) * W1, bh = Math.min(H, y + r + 1) - Math.max(0, y - r);
    for (let x = 0; x < W; x++) {
      const i = y * W + x, o = 4 * i, m = M[i] / 9, hue = (350 + 340 * (.83 * y / H + .22 * x / W)) % 360;
      // glitter: ~14% of cells are specks; c picks the speck's brightness or colour
      const hs = rbHash(x >> 1, y >> 1), g = (hs & 1023) / 1024, c = (hs >>> 10 & 1023) / 1024;
      let sR = 0, sG = 0, sB = 0;
      if (m < 1) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1), Li = L[i], lf = x ? -1 : 0, rt = x < W - 1 ? 1 : 0;
        const blur = (S[y1 + x1] - S[y0 + x1] - S[y1 + x0] + S[y0 + x0]) / ((x1 - x0) * bh);
        const gx = L[i + up + rt] + 2 * L[i + rt] + L[i + dn + rt] - L[i + up + lf] - 2 * L[i + lf] - L[i + dn + lf], gy = L[i + dn + lf] + 2 * L[i + dn] + L[i + dn + rt] - L[i + up + lf] - 2 * L[i + up] - L[i + up + rt];
        const line = Math.max(clamp((blur - Li - 8) / 36), clamp((Math.sqrt(gx * gx + gy * gy) - 40) / 160) * .7);
        // fill: rainbow by position with the original shading as gentle light/dark (no white anywhere); specks are brighter tints, a few off-hue
        let h = hue, s = 1, l = .36 + .36 * Li / 255;
        if (g < .03) h = c * 360, s = .9, l = Math.max(l, .7); else if (g < .14) l += .1 + .12 * c;
        s += (.85 - s) * line; l += (.2 - l) * line; hsl(h, s, Math.min(.95, l)); sR = R; sG = G; sB = B;
      }
      if (m > 0) {
        // background: silver clearly tinted by the local rainbow (pastel, never plain white), same specks in random colours
        if (g < .14) hsl(c * 360, .9, .76); else hsl(hue, .45, .78 + .12 * c);
        sR += (R - sR) * m; sG += (G - sG) * m; sB += (B - sB) * m;
      }
      d[o] = sR; d[o + 1] = sG; d[o + 2] = sB; d[o + 3] = 255;
    }
  }
  cx.putImageData(id, 0, 0);
  return cv;
}
