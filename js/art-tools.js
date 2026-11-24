// Card art tools for the submit screen: shrink an upload, spot or remove a plain background, draw background templates, composite.
// Everything works on canvases no bigger than 700 px wide, so each step stays well under a frame budget on desktop.
const atCanvas = (W, H) => Object.assign(document.createElement('canvas'), { width: W, height: H });
const atPixels = cv => cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height);

// A File/Blob or data URL -> canvas at most 700 px wide (and 1400 tall, so a long strip can't blow up the processing time).
async function atLoad(src) {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src, bmp = await createImageBitmap(blob);
  const k = Math.min(1, 700 / bmp.width, 1400 / bmp.height), cv = atCanvas(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k)));
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); bmp.close?.();
  return cv;
}
// Share of see-through pixels (alpha < 128); 3% or more counts as a transparent background.
const atAlpha = cv => { const d = atPixels(cv).data; let t = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 128) t++; return t / (d.length / 4); };

// "Remove background": rainbow.js's flood fill from the edges through edge colours (tol = the colour jump that stops it), then a soft
// 1px edge (alpha from the 3x3 share of background). Returns a new canvas, or null when the mask is under 3% or over 97% of the picture.
function atRemove(cv, tol) {
  const W = cv.width, H = cv.height, n = W * H, img = atPixels(cv), d = img.data, bg = new Uint8Array(n);
  rbBackground(d, W, H, bg, tol);
  let k = 0; for (let i = 0; i < n; i++) k += bg[i];
  if (k < 0.03 * n || k > 0.97 * n) return null;
  const hz = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const x = i % W; hz[i] = bg[i] + bg[x ? i - 1 : i] + bg[x < W - 1 ? i + 1 : i]; }
  for (let i = 0; i < n; i++) d[4 * i + 3] = Math.round(d[4 * i + 3] * (1 - (hz[i] + hz[i < W ? i : i - W] + hz[i >= n - W ? i : i + W]) / 9));
  const out = atCanvas(W, H); out.getContext('2d').putImageData(img, 0, 0);
  return out;
}

const atRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const atMix = (h, t) => `rgb(${atRgb(h).map(v => Math.round(v + ((t < 0 ? 0 : 255) - v) * Math.abs(t))).join(',')})`; // t > 0 toward white, t < 0 toward black
const atHex = (h, s, l) => '#' + [0, 8, 4].map(o => { const k = (o + h / 30) % 12; return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); }).join('');
// The art's main colour as #rrggbb, worked out the same way the card frames are tinted (toneOf in render.js).
function atTint(cv) {
  const key = 'submit:' + Math.random(); toneOf(cv, key);
  const m = /hsl\((\d+) (\d+)%/.exec(TONE[key] || ''); delete TONE[key];
  return m ? atHex(+m[1], +m[2] / 100, 0.55) : '#e5535d';
}

const AT_BG_NAME = { glow: 'Glow', rays: 'Sunburst', stars: 'Stars', dots: 'Halftone', sky: 'Sky', flames: 'Flames', grid: 'Neon grid', plain: 'Plain' };
// A background template (names in CF_BG, js/cardfile.js) drawn at W x H in the tint colour. Seeded, so the same picture every redraw.
function atBg(tpl, tint, W, H) {
  const cv = atCanvas(W, H), g = cv.getContext('2d'), T = k => atMix(tint, k), m = Math.max(W, H);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const grad = (gr, stops) => { stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
  const fill = st => { g.fillStyle = st; g.fillRect(0, 0, W, H); };
  const vert = stops => fill(grad(g.createLinearGradient(0, 0, 0, H), stops));
  const dot = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  if (tpl === 'plain') fill(tint);
  else if (tpl === 'glow') fill(grad(g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, m * 0.75), [[0, T(0.8)], [0.45, tint], [1, T(-0.45)]]));
  else if (tpl === 'rays') {
    const cx = W / 2, cy = H * 0.45; fill(T(0.2)); g.fillStyle = T(0.55);
    for (let k = 0; k < 18; k++) { const a = (k * Math.PI) / 9; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, m * 1.5, a, a + Math.PI / 18); g.fill(); }
    fill(grad(g.createRadialGradient(cx, cy, 0, cx, cy, m * 0.7), [[0, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]));
  } else if (tpl === 'stars') {
    vert([[0, T(-0.85)], [1, T(-0.5)]]); g.fillStyle = '#fff';
    for (let k = 0; k < (W * H) / 700; k++) { g.globalAlpha = 0.35 + rnd() * 0.65; dot(rnd() * W, rnd() * H, rnd() < 0.93 ? 0.4 + rnd() * 1.2 : 1.5 + rnd() * 2); }
    g.globalAlpha = 1;
    for (let k = 0; k < 7; k++) { const x = rnd() * W, y = rnd() * H, r = m * (0.015 + rnd() * 0.02); g.beginPath(); for (let p = 0; p < 8; p++) { const a = (p * Math.PI) / 4, rr = p % 2 ? r * 0.22 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); }
  } else if (tpl === 'dots') {
    fill(T(0.82)); g.fillStyle = T(0.1); const step = Math.max(10, W / 26);
    for (let y = 0, row = 0; y < H + step; y += step, row++) for (let x = 0; x < W + step; x += step) {
      const r = step * 0.5 * (1 - Math.hypot(x / W - 0.1, y / H - 0.05) / 1.3); if (r > 0.6) dot(x + (row % 2 ? step / 2 : 0), y, r);
    }
  } else if (tpl === 'sky') {
    vert([[0, T(0.1)], [0.75, T(0.7)], [1, '#ffffff']]); g.fillStyle = 'rgba(255,255,255,.85)';
    for (let c = 0; c < 6; c++) { const cx = rnd() * W, cy = H * (0.12 + rnd() * 0.8), r = m * (0.04 + rnd() * 0.05); for (let p = 0; p < 6; p++) dot(cx + (p - 2.5) * r * 0.75, cy - Math.sin((p / 5) * Math.PI) * r * 0.7, r * (0.7 + rnd() * 0.5)); }
  } else if (tpl === 'flames') {
    vert([[0, T(-0.75)], [0.5, tint], [1, '#ffb347']]);
    [['rgba(255,80,40,.55)', 0.75], ['rgba(255,150,40,.6)', 0.55], ['rgba(255,225,110,.7)', 0.35]].forEach(([c, h]) => {
      g.fillStyle = c; g.beginPath(); g.moveTo(0, H); const w = W / 7;
      for (let x = 0; x < W + w; x += w) { const top = H * (1 - h * (0.6 + rnd() * 0.4)); g.quadraticCurveTo(x + w * 0.1, H - (H - top) * 0.45, x + w * 0.5, top); g.quadraticCurveTo(x + w * 0.9, H - (H - top) * 0.45, x + w, H); }
      g.lineTo(W, H); g.fill();
    });
  } else if (tpl === 'grid') {
    const hz = H * 0.55; vert([[0, T(-0.85)], [0.55, T(-0.55)], [1, T(-0.85)]]);
    fill(grad(g.createRadialGradient(W / 2, hz, 0, W / 2, hz, W * 0.7), [[0, T(0.1)], [1, 'rgba(0,0,0,0)']]));
    g.strokeStyle = T(0.4); g.lineWidth = Math.max(1, W / 320); g.shadowColor = tint; g.shadowBlur = W / 50;
    for (let k = -12; k <= 12; k++) { g.beginPath(); g.moveTo(W / 2 + (k * W) / 24, hz); g.lineTo(W / 2 + (k * W) / 3, H); g.stroke(); }
    for (let k = 0; k < 12; k++) { const y = hz + (H - hz) * (k / 12) ** 2; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  }
  return cv;
}
// Background under the cut-out, both the same size.
const atCompose = (cut, bg) => { const cv = atCanvas(cut.width, cut.height), g = cv.getContext('2d'); g.drawImage(bg, 0, 0); g.drawImage(cut, 0, 0); return cv; };
// Canvas -> Blob: WebP keeps transparency and stays small; browsers that can't write WebP (Safari) get PNG with transparency, JPEG without.
const atBlob = (cv, alpha) => new Promise(res => cv.toBlob(b => (b?.type === 'image/webp' ? res(b) : cv.toBlob(res, alpha ? 'image/png' : 'image/jpeg', 0.88)), 'image/webp', 0.88));
const atDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
