'use strict';
/* Procedural art: every texture in the game is painted here once at startup on 2D canvases,
   then uploaded to the GPU as PixiJS textures. Replace any entry with a PNG later and the
   renderer will not care, as long as the ppm / anchor metadata stays consistent. */
const ART = { tex: {}, meta: {} };
const COATS = [[118, 70, 38], [140, 78, 40], [62, 42, 32], [160, 150, 138], [96, 60, 34], [44, 34, 28], [182, 130, 78]];

function cnv(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function mkTex(c) { return new PIXI.Texture({ source: new PIXI.CanvasSource({ resource: c, autoGenerateMipmaps: true }) }); }
function reg(name, c, ppm, ax, ay) { ART.tex[name] = mkTex(c); ART.meta[name] = { ppm: ppm || 1, ax: ax === undefined ? 0.5 : ax, ay: ay === undefined ? 0.5 : ay }; }
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function rgba(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a === undefined ? 1 : a})`; }
function sh(c, k) { return [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)]; }
function mix3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

function radial(g, x, y, r, stops) { const gr = g.createRadialGradient(x, y, 0, x, y, r); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; }
function ellipseP(g, x, y, rx, ry, rot) { g.beginPath(); g.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot || 0, 0, Math.PI * 2); }
function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
function capsule(g, x, y0, y1, w0, w1) {
  g.beginPath();
  g.moveTo(x - w0 / 2, y0); g.lineTo(x - w1 / 2, y1);
  g.arc(x, y1, w1 / 2, Math.PI, 0, true);
  g.lineTo(x + w0 / 2, y0);
  g.arc(x, y0, w0 / 2, 0, Math.PI, true);
  g.closePath();
}
function furStrokes(g, n, x0, y0, w, h, cols, len, ang, width, rnd) {
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * w, y = y0 + rnd() * h;
    const a = ang + (rnd() - 0.5) * 0.8, l = len * (0.5 + rnd());
    g.strokeStyle = cols[(rnd() * cols.length) | 0]; g.lineWidth = width * (0.6 + rnd() * 0.8);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * l * 0.3, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}

/* ---------- generic FX ---------- */
function artFX() {
  let c = cnv(128, 128), g = c.getContext('2d');
  g.fillStyle = radial(g, 64, 64, 64, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]); g.fillRect(0, 0, 128, 128);
  reg('glow', c);
  for (let v = 0; v < 4; v++) {
    c = cnv(128, 128); g = c.getContext('2d'); const r = rng(11 + v);
    for (let i = 0; i < 16; i++) {
      const x = 64 + (r() - 0.5) * 60, y = 64 + (r() - 0.5) * 50, rr = 18 + r() * 30;
      g.fillStyle = radial(g, x, y, rr, [[0, 'rgba(255,255,255,0.32)'], [0.6, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
      g.fillRect(0, 0, 128, 128);
    }
    reg('dust' + v, c);
  }
  c = cnv(128, 64); g = c.getContext('2d');
  g.save(); g.scale(1, 0.5); g.fillStyle = radial(g, 64, 64, 64, [[0, 'rgba(0,0,0,0.9)'], [0.55, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(0, 0, 128, 128); g.restore();
  reg('shadow', c);
  c = cnv(40, 40); g = c.getContext('2d');
  g.fillStyle = radial(g, 15, 14, 20, [[0, '#a59a8c'], [0.45, '#5d544a'], [1, '#2a2420']]);
  g.beginPath(); g.moveTo(20, 3); g.lineTo(34, 10); g.lineTo(37, 25); g.lineTo(26, 36); g.lineTo(9, 34); g.lineTo(3, 20); g.lineTo(8, 8); g.closePath(); g.fill();
  reg('stone', c);
  c = cnv(128, 16); g = c.getContext('2d');
  let lg = g.createLinearGradient(0, 0, 128, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(255,255,255,0.75)');
  g.fillStyle = lg; g.beginPath(); g.moveTo(0, 8); g.lineTo(128, 2); g.lineTo(128, 14); g.closePath(); g.fill();
  reg('streak', c, 1, 1, 0.5);
  c = cnv(512, 32); g = c.getContext('2d');
  g.fillStyle = radial(g, 256, 16, 256, [[0, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]); g.save(); g.scale(1, 0.12); g.fillRect(0, 0, 512, 280); g.restore();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, 16); g.quadraticCurveTo(256, 9, 512, 16); g.quadraticCurveTo(256, 22, 0, 16); g.fill();
  reg('slash', c);
  c = cnv(128, 1024); g = c.getContext('2d');
  lg = g.createLinearGradient(0, 0, 0, 1024); lg.addColorStop(0, 'rgba(255,240,200,0.0)'); lg.addColorStop(0.15, 'rgba(255,240,200,0.5)'); lg.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = lg; g.beginPath(); g.moveTo(54, 0); g.lineTo(74, 0); g.lineTo(128, 1024); g.lineTo(0, 1024); g.closePath(); g.fill();
  reg('ray', c, 1, 0.5, 0);
}

/* ---------- sky / backdrop ---------- */
function artSky() {
  let c = cnv(4, 512), g = c.getContext('2d');
  const lg = g.createLinearGradient(0, 0, 0, 512);
  lg.addColorStop(0, '#3e5478'); lg.addColorStop(0.35, '#7d8aa0'); lg.addColorStop(0.68, '#d4ae86'); lg.addColorStop(0.9, '#ecc596'); lg.addColorStop(1, '#efcf9f');
  g.fillStyle = lg; g.fillRect(0, 0, 4, 512);
  reg('sky', c, 1, 0, 0);
  for (let v = 0; v < 5; v++) {
    c = cnv(640, 240); g = c.getContext('2d'); const r = rng(100 + v);
    const blobs = [];
    for (let i = 0; i < 26; i++) { const t = r(); blobs.push([80 + t * 480, 150 - Math.sin(t * Math.PI) * (40 + r() * 60) + r() * 20, 30 + r() * 55 * Math.sin(t * Math.PI + 0.3)]); }
    for (const [x, y, rr] of blobs) { g.fillStyle = radial(g, x, y + rr * 0.3, rr * 1.2, [[0, 'rgba(170,140,140,0.55)'], [1, 'rgba(170,140,140,0)']]); g.fillRect(0, 0, 640, 240); }
    for (const [x, y, rr] of blobs) { g.fillStyle = radial(g, x - rr * 0.2, y - rr * 0.35, rr, [[0, 'rgba(255,244,228,0.95)'], [0.6, 'rgba(250,222,196,0.6)'], [1, 'rgba(240,200,180,0)']]); g.fillRect(0, 0, 640, 240); }
    reg('cloud' + v, c, 1, 0.5, 0.6);
  }
  const layers = [
    { top: [150, 156, 170], bot: [196, 182, 168], amp: 150, k: [2, 5, 11, 23], base: 0.62, rough: 0.05, seed: 3 },
    { top: [118, 124, 128], bot: [176, 164, 146], amp: 110, k: [3, 7, 13, 29], base: 0.55, rough: 0.07, seed: 7 },
    { top: [84, 92, 72], bot: [140, 136, 104], amp: 60, k: [4, 9, 17, 41], base: 0.4, rough: 0.14, seed: 13 }
  ];
  layers.forEach((L, li) => {
    c = cnv(2048, 360); g = c.getContext('2d'); const r = rng(L.seed);
    const ph = L.k.map(() => r() * 6.28), am = L.k.map((_, i) => 1 / (i + 1.2));
    const hAt = x => { let v = 0; for (let i = 0; i < L.k.length; i++) v += Math.sin(x / 2048 * 6.2832 * L.k[i] + ph[i]) * am[i]; return 360 - (L.base * 360 + v * L.amp * 0.5); };
    const lg = g.createLinearGradient(0, 60, 0, 360); lg.addColorStop(0, rgba(L.top)); lg.addColorStop(1, rgba(L.bot));
    g.fillStyle = lg; g.beginPath(); g.moveTo(0, 360);
    for (let x = 0; x <= 2048; x += 4) g.lineTo(x, hAt(x) + (li === 2 ? Math.sin(x * 0.9) * 3 + Math.sin(x * 2.3) * 2 : 0));
    g.lineTo(2048, 360); g.closePath(); g.fill();
    g.save(); g.clip();
    for (let x = 0; x < 2048; x += 2) {
      const d = hAt(x + 6) - hAt(x - 6);
      if (d > 0) { g.fillStyle = `rgba(255,236,205,${Math.min(0.22, d * 0.01)})`; g.fillRect(x, hAt(x), 2, 60 + d * 2); }
    }
    if (li === 2) for (let i = 0; i < 900; i++) { const x = r() * 2048, y = hAt(x) + r() * 40; g.fillStyle = `rgba(50,62,40,${0.25 + r() * 0.3})`; g.beginPath(); g.arc(x, y, 2 + r() * 4, 0, 6.29); g.fill(); }
    const fog = g.createLinearGradient(0, 200, 0, 360); fog.addColorStop(0, 'rgba(225,200,165,0)'); fog.addColorStop(1, 'rgba(225,200,165,0.65)');
    g.fillStyle = fog; g.fillRect(0, 0, 2048, 360);
    g.restore();
    reg('mtn' + li, c, 1, 0, 1);
  });
}

/* ---------- scenery ---------- */
function artScenery() {
  const greens = [[74, 96, 40], [92, 116, 50], [110, 128, 58], [64, 84, 34], [128, 136, 70]];
  for (let v = 0; v < 4; v++) {
    const c = cnv(96, 72), g = c.getContext('2d'), r = rng(200 + v);
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      const x = 48 + (r() - 0.5) * 50, h = 30 + r() * 38, lean = (r() - 0.5) * 30;
      const col = greens[(r() * greens.length) | 0];
      g.strokeStyle = rgba(sh(col, 0.8 + r() * 0.4)); g.lineWidth = 1.5 + r() * 2;
      g.beginPath(); g.moveTo(x, 72); g.quadraticCurveTo(x + lean * 0.3, 72 - h * 0.6, x + lean, 72 - h); g.stroke();
    }
    reg('grass' + v, c, 80, 0.5, 1);
  }
  const fcols = [[245, 240, 230], [240, 210, 80], [180, 130, 200], [230, 120, 90]];
  for (let v = 0; v < 4; v++) {
    const c = cnv(96, 72), g = c.getContext('2d'), r = rng(300 + v);
    g.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const x = 48 + (r() - 0.5) * 60, h = 20 + r() * 30;
      g.strokeStyle = rgba(greens[(r() * 5) | 0]); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, 72); g.lineTo(x + (r() - 0.5) * 10, 72 - h); g.stroke();
      if (r() < 0.6) { g.fillStyle = rgba(fcols[v]); g.beginPath(); g.arc(x + (r() - 0.5) * 8, 72 - h, 2.5 + r() * 2, 0, 6.29); g.fill(); }
    }
    reg('flower' + v, c, 80, 0.5, 1);
  }
  for (let v = 0; v < 4; v++) {
    const c = cnv(128, 80), g = c.getContext('2d'), r = rng(400 + v);
    const pts = []; const n = 9;
    for (let i = 0; i < n; i++) { const a = Math.PI + i / (n - 1) * Math.PI; pts.push([64 + Math.cos(a) * (50 + r() * 10), 76 + Math.sin(a) * (40 + r() * 25)]); }
    g.fillStyle = radial(g, 50, 30, 80, [[0, '#b3aa9a'], [0.6, '#7f776b'], [1, '#4d473f']]); poly(g, pts); g.fill();
    g.strokeStyle = 'rgba(40,35,30,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(40 + r() * 20, 30); g.lineTo(60, 55); g.lineTo(55 + r() * 20, 76); g.stroke();
    g.fillStyle = 'rgba(80,100,50,0.6)'; for (let i = 0; i < 20; i++) g.fillRect(14 + r() * 100, 70 + r() * 8, 2, -4 - r() * 8);
    reg('rock' + v, c, 80, 0.5, 0.95);
  }
  for (let v = 0; v < 2; v++) {
    const c = cnv(320, 480), g = c.getContext('2d'), r = rng(500 + v);
    g.strokeStyle = '#4a3828'; g.lineCap = 'round';
    const branch = (x, y, a, l, w, d) => {
      const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
      g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      if (d > 0) { branch(x2, y2, a - 0.3 - r() * 0.4, l * 0.72, w * 0.68, d - 1); branch(x2, y2, a + 0.3 + r() * 0.4, l * 0.7, w * 0.68, d - 1); }
      else if (v === 1) { g.fillStyle = `rgba(70,96,46,${0.5 + r() * 0.4})`; g.beginPath(); g.arc(x2, y2, 10 + r() * 14, 0, 6.29); g.fill(); }
    };
    branch(160, 480, -Math.PI / 2 + (r() - 0.5) * 0.1, 150, 22, 6);
    reg('tree' + v, c, 40, 0.5, 1);
  }
  for (let v = 0; v < 2; v++) {
    const c = cnv(160, 110), g = c.getContext('2d'), r = rng(600 + v);
    for (let i = 0; i < 40; i++) {
      const x = 80 + (r() - 0.5) * 120, y = 110 - r() * 80 * Math.sin(((x - 20) / 120) * Math.PI), rr = 10 + r() * 16;
      const col = mix3([56, 76, 34], [120, 132, 62], r() * (1 - y / 110) + 0.2);
      g.fillStyle = rgba(col); g.beginPath(); g.arc(x, Math.max(y, 20), rr, 0, 6.29); g.fill();
    }
    reg('bush' + v, c, 60, 0.5, 1);
  }
  const c = cnv(160, 160), g = c.getContext('2d');
  const lg = g.createRadialGradient(56, 56, 10, 80, 80, 80);
  lg.addColorStop(0, '#b4ab9d'); lg.addColorStop(0.5, '#878074'); lg.addColorStop(1, '#4a453e');
  g.fillStyle = lg; const r = rng(77); const pts = [];
  for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; const rr = 70 + r() * 9; pts.push([80 + Math.cos(a) * rr, 80 + Math.sin(a) * rr]); }
  poly(g, pts); g.fill();
  g.strokeStyle = 'rgba(50,45,40,0.6)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(40, 50); g.lineTo(80, 85); g.lineTo(120, 70); g.moveTo(80, 85); g.lineTo(90, 140); g.stroke();
  reg('boulder', c, 80, 0.5, 0.5);
}

/* ---------- horse & rider (seen from behind) ---------- */
const HPPM = 160;
const HORSE_VIEWS = [-0.8, -0.4, 0, 0.4, 0.8];
function drawHorseFrame(g, coat, ph, yw) {
  const cx = 200, gy = 470, k = HPPM;
  const R = (mx, my) => [cx + mx * k, gy - my * k];
  const Fp = (mx, my) => [cx + mx * k * 0.8 + yw * k, gy - 0.74 * k - my * k * 0.8];
  const Np = (mx, my) => [cx + mx * k * 0.72 + yw * 1.35 * k, gy - 1.0 * k - my * k * 0.72];
  const bob = Math.sin(ph * 2) * 0.04;
  const base = coat, dark = sh(coat, 0.55), light = sh(coat, 1.3), hoof = [28, 22, 18], hair = [30, 22, 18];
  const lift = off => Math.max(0, Math.sin(ph + off)) * 0.42;
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [lx, off] of [[-0.17, 2.6], [0.17, 3.3]]) {
    const l = lift(off), a = Fp(lx, 1.0 + bob), kn = Fp(lx * 1.05, 0.45 + l * 0.7), b = Fp(lx * 1.05, l);
    g.strokeStyle = rgba(dark); g.lineWidth = 0.1 * k * 0.8;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(kn[0], kn[1]); g.lineTo(b[0], b[1]); g.stroke();
    g.fillStyle = rgba(hoof); ellipseP(g, b[0], b[1], 0.055 * k, 0.04 * k); g.fill();
  }
  const n0 = Fp(0, 1.55 + bob), n1 = Np(0, 2.0 + bob + Math.sin(ph) * 0.04);
  g.fillStyle = rgba(base);
  poly(g, [[n0[0] - 0.17 * k, n0[1]], [n1[0] - 0.09 * k, n1[1]], [n1[0] + 0.09 * k, n1[1]], [n0[0] + 0.17 * k, n0[1]]]); g.fill();
  g.fillStyle = rgba(sh(base, 0.9)); ellipseP(g, n1[0], n1[1], 0.11 * k, 0.13 * k); g.fill();
  g.fillStyle = rgba(dark);
  for (const sd of [-1, 1]) poly(g, [[n1[0] + sd * 0.05 * k, n1[1] - 0.08 * k], [n1[0] + sd * 0.1 * k, n1[1] - 0.24 * k], [n1[0] + sd * 0.11 * k, n1[1] - 0.07 * k]]), g.fill();
  g.strokeStyle = rgba(hair); g.lineWidth = 3;
  for (let i = 0; i < 9; i++) { const t = i / 8, x = lerp(n0[0], n1[0], t), y = lerp(n0[1], n1[1], t); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (6 + Math.sin(ph + i) * 4), y + 6); g.stroke(); }
  const side = (sd) => {
    const lg = g.createLinearGradient(R(sd * 0.34, 1)[0], 0, R(0, 1)[0], 0);
    lg.addColorStop(0, rgba(dark)); lg.addColorStop(1, rgba(base));
    g.fillStyle = lg; poly(g, [R(sd * 0.34, 0.98 + bob), R(sd * 0.35, 1.56 + bob), Fp(sd * 0.28, 1.62 + bob), Fp(sd * 0.28, 1.02 + bob)]); g.fill();
  };
  side(-1); side(1);
  const tg = g.createLinearGradient(0, R(0, 1.56)[1], 0, Fp(0, 1.62)[1]);
  tg.addColorStop(0, rgba(light)); tg.addColorStop(1, rgba(base));
  g.fillStyle = tg; poly(g, [R(-0.35, 1.56 + bob), Fp(-0.28, 1.62 + bob), Fp(0.28, 1.62 + bob), R(0.35, 1.56 + bob)]); g.fill();
  g.fillStyle = 'rgba(60,35,20,0.9)';
  for (const sd of [-1, 1]) poly(g, [Fp(sd * 0.3, 1.55 + bob), Fp(sd * 0.3, 1.2 + bob), R(sd * 0.36, 1.25 + bob), R(sd * 0.36, 1.5 + bob)]), g.fill();
  for (const [lx, off] of [[-0.2, 0], [0.2, 0.9]]) {
    const l = lift(off), a = R(lx, 1.0 + bob), kn = R(lx * 1.18, 0.52 + l * 0.6), b = R(lx * 1.1, l);
    g.strokeStyle = rgba(dark); g.lineWidth = 0.12 * k;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(kn[0], kn[1]); g.lineTo(b[0], b[1]); g.stroke();
    g.strokeStyle = rgba(sh(dark, 0.7)); g.lineWidth = 0.08 * k;
    g.beginPath(); g.moveTo(kn[0], kn[1]); g.lineTo(b[0], b[1] - 0.06 * k); g.stroke();
    g.fillStyle = rgba(hoof); ellipseP(g, b[0], b[1], 0.065 * k, 0.045 * k); g.fill();
  }
  const rp = R(0, 1.27 + bob);
  for (const sd of [-1, 1]) {
    g.fillStyle = radial(g, rp[0] + sd * 0.12 * k, rp[1] - 0.15 * k, 0.4 * k, [[0, rgba(light)], [0.55, rgba(base)], [1, rgba(dark)]]);
    ellipseP(g, rp[0] + sd * 0.17 * k, rp[1], 0.215 * k, 0.33 * k); g.fill();
  }
  g.strokeStyle = rgba(sh(dark, 0.8)); g.lineWidth = 2;
  g.beginPath(); g.moveTo(rp[0], rp[1] - 0.26 * k); g.quadraticCurveTo(rp[0] + 2, rp[1], rp[0], rp[1] + 0.3 * k); g.stroke();
  const tb = R(0, 1.47 + bob), sw = Math.sin(ph) * 0.12;
  for (let i = 0; i < 22; i++) {
    const o = (i - 11) / 11;
    g.strokeStyle = rgba(sh(hair, 0.8 + (i % 3) * 0.15)); g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(tb[0] + o * 4, tb[1]);
    g.bezierCurveTo(tb[0] + o * 10 + sw * 0.3 * k, tb[1] + 0.2 * k, tb[0] + o * 16 + sw * 0.8 * k, tb[1] + 0.45 * k, tb[0] + o * 14 + sw * 1.1 * k, tb[1] + 0.72 * k + Math.abs(o) * -10);
    g.stroke();
  }
}
function drawRiderFrame(g, ph) {
  const k = HPPM, cx = 72, oy = 2.5;
  const X = m => cx + m * k, Y = m => (oy - m) * k;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const pants = [62, 38, 22], boot = [26, 19, 15], jacket = [128, 86, 50], strap = [150, 110, 60], metal = [120, 124, 130];
  for (const sd of [-1, 1]) {
    g.strokeStyle = rgba(pants); g.lineWidth = 0.14 * k;
    g.beginPath(); g.moveTo(X(sd * 0.28), Y(1.5)); g.lineTo(X(sd * 0.36), Y(1.08)); g.stroke();
    g.strokeStyle = rgba(boot); g.lineWidth = 0.12 * k;
    g.beginPath(); g.moveTo(X(sd * 0.36), Y(1.1)); g.lineTo(X(sd * 0.34), Y(0.82)); g.stroke();
    g.strokeStyle = rgba(strap); g.lineWidth = 0.025 * k;
    g.beginPath(); g.moveTo(X(sd * 0.25), Y(1.38)); g.lineTo(X(sd * 0.38), Y(1.3)); g.moveTo(X(sd * 0.3), Y(1.22)); g.lineTo(X(sd * 0.39), Y(1.18)); g.stroke();
    g.fillStyle = radial(g, X(sd * 0.3), Y(1.56), 0.12 * k, [[0, rgba(sh(metal, 1.4))], [1, rgba(sh(metal, 0.6))]]);
    g.fillRect(X(sd * 0.3) - 0.07 * k, Y(1.64), 0.14 * k, 0.2 * k);
  }
  g.fillStyle = rgba(jacket);
  poly(g, [[X(-0.2), Y(1.47)], [X(0.2), Y(1.47)], [X(0.25), Y(2.08)], [X(-0.25), Y(2.08)]]); g.fill();
  for (const sd of [-1, 1]) {
    g.strokeStyle = rgba(sh(jacket, 0.8)); g.lineWidth = 0.11 * k;
    g.beginPath(); g.moveTo(X(sd * 0.25), Y(2.02)); g.lineTo(X(sd * 0.31), Y(1.73)); g.lineTo(X(sd * 0.19), Y(1.62)); g.stroke();
    g.fillStyle = 'rgba(220,180,150,1)'; ellipseP(g, X(sd * 0.18), Y(1.62), 0.04 * k, 0.035 * k); g.fill();
  }
  const N = 9, t = ph;
  const bx = i => -0.33 + i / (N - 1) * 0.66;
  const by = i => 1.46 + Math.sin(t + i * 1.2) * 0.04 + Math.sin(t * 0.5 + i * 0.7) * 0.02;
  const capeTop = 2.08;
  const cg = g.createLinearGradient(0, Y(capeTop), 0, Y(1.46));
  cg.addColorStop(0, '#3a7d47'); cg.addColorStop(1, '#245c32');
  g.fillStyle = cg;
  g.beginPath(); g.moveTo(X(-0.25), Y(capeTop)); g.lineTo(X(0.25), Y(capeTop));
  g.quadraticCurveTo(X(0.33), Y(1.8), X(bx(N - 1)), Y(by(N - 1)));
  for (let i = N - 2; i >= 0; i--) { const xm = (bx(i) + bx(i + 1)) / 2; g.quadraticCurveTo(X(xm), Y(Math.max(by(i), by(i + 1)) + 0.02), X(bx(i)), Y(by(i))); }
  g.quadraticCurveTo(X(-0.33), Y(1.8), X(-0.25), Y(capeTop)); g.fill();
  g.strokeStyle = 'rgba(15,50,25,0.55)'; g.lineWidth = 2.2;
  for (let i = 1; i < N - 1; i += 2) { g.beginPath(); g.moveTo(X(bx(i) * 0.55), Y(capeTop - 0.05)); g.quadraticCurveTo(X(bx(i) * 0.85 + Math.sin(t + i) * 0.02), Y(1.75), X(bx(i)), Y(by(i) + 0.02)); g.stroke(); }
  g.strokeStyle = 'rgba(120,190,130,0.25)'; g.lineWidth = 3;
  for (let i = 2; i < N - 1; i += 2) { g.beginPath(); g.moveTo(X(bx(i) * 0.5), Y(capeTop - 0.05)); g.quadraticCurveTo(X(bx(i) * 0.8), Y(1.75), X(bx(i)), Y(by(i) + 0.03)); g.stroke(); }
  g.fillStyle = '#2b6a3a'; ellipseP(g, X(0), Y(capeTop), 0.24 * k, 0.05 * k); g.fill();
  g.fillStyle = '#efece4'; g.fillRect(X(-0.075), Y(capeTop + 0.065), 0.15 * k, 0.06 * k);
  g.fillStyle = '#d8ac88'; ellipseP(g, X(0), Y(2.17), 0.05 * k, 0.06 * k); g.fill();
  g.fillStyle = radial(g, X(-0.03), Y(2.33), 0.16 * k, [[0, '#5a3b25'], [1, '#2a1a10']]);
  ellipseP(g, X(0), Y(2.29), 0.12 * k, 0.135 * k); g.fill();
  g.fillStyle = '#d8ac88'; ellipseP(g, X(-0.118), Y(2.27), 0.022 * k, 0.04 * k); g.fill(); ellipseP(g, X(0.118), Y(2.27), 0.022 * k, 0.04 * k); g.fill();
}
function artRiders() {
  HORSE_VIEWS.forEach((yw, vi) => { for (let f = 0; f < 8; f++) {
    const c = cnv(400, 480); drawHorseFrame(c.getContext('2d'), [236, 228, 218], f / 8 * Math.PI * 2, yw);
    reg(`horse${vi}_${f}`, c, HPPM, 200 / 400, 470 / 480);
  } });
  if (false) {
  }
  for (let f = 0; f < 6; f++) {
    const c = cnv(144, 290); drawRiderFrame(c.getContext('2d'), f / 6 * Math.PI * 2);
    reg('rider' + f, c, HPPM, 0.5, (2.5 - 1.45) * HPPM / 290);
  }
  let c = cnv(420, 200), g = c.getContext('2d');
  g.lineCap = 'round';
  g.strokeStyle = '#555'; g.lineWidth = 14;
  for (const [x, a] of [[120, -0.6], [170, -0.2], [250, 0.3], [300, 0.7]]) { g.beginPath(); g.moveTo(x, 120); g.lineTo(x + Math.sin(a) * 70, 120 - Math.cos(a) * 70); g.stroke(); }
  g.fillStyle = radial(g, 200, 120, 190, [[0, '#ddd'], [1, '#888']]); ellipseP(g, 210, 140, 175, 58); g.fill();
  ellipseP(g, 370, 120, 45, 32); g.fill();
  reg('horseFall', c, HPPM, 0.5, 0.95);
  c = cnv(320, 120); g = c.getContext('2d'); g.lineCap = 'round';
  g.strokeStyle = '#3e2616'; g.lineWidth = 22; g.beginPath(); g.moveTo(60, 70); g.lineTo(150, 62); g.moveTo(60, 50); g.lineTo(140, 40); g.stroke();
  g.fillStyle = '#2f6b3a'; ellipseP(g, 190, 60, 70, 34); g.fill();
  g.fillStyle = '#8a5a32'; g.fillRect(170, 30, 60, 18);
  g.fillStyle = '#2a1a10'; ellipseP(g, 268, 58, 22, 20); g.fill();
  reg('riderFall', c, HPPM, 0.5, 0.7);
  c = cnv(160, 160); g = c.getContext('2d'); g.lineCap = 'round';
  g.strokeStyle = '#d9dde2'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 90); g.lineTo(8, 70); g.moveTo(120, 90); g.lineTo(152, 72); g.stroke();
  g.fillStyle = '#2f6b3a'; poly(g, [[70, 60], [95, 60], [130, 120], [40, 125]]); g.fill();
  g.fillStyle = '#e8e2d4'; g.fillRect(70, 110, 9, 34); g.fillRect(84, 110, 9, 34);
  g.fillStyle = '#2a1a10'; ellipseP(g, 82, 48, 13, 14); g.fill();
  g.strokeStyle = '#6a6e74'; g.lineWidth = 6; g.beginPath(); g.moveTo(62, 100); g.lineTo(100, 100); g.stroke();
  reg('levi', c, 80, 0.5, 0.5);
}

/* ---------- pure titans ---------- */
const TPPM = 36;
function artTitans() {
  const skins = [[226, 172, 140], [206, 150, 116], [236, 190, 160], [190, 134, 104], [214, 158, 128], [222, 166, 150], [200, 160, 120], [230, 180, 150]];
  for (let v = 0; v < 8; v++) {
    const r = rng(900 + v * 7), h = 15, fat = 0.75 + r() * 0.65, headK = 0.08 + r() * 0.05, armL = 0.9 + r() * 0.35;
    const w = h * 0.3 * fat, k = TPPM, Wc = Math.ceil((w * 1.6 + 4) * k), Hc = Math.ceil((h * 1.12 + 1) * k);
    const c = cnv(Wc, Hc), g = c.getContext('2d');
    const cx = Wc / 2, gy = Hc - 0.3 * k;
    const X = m => cx + m * k, Y = m => gy - m * k;
    const skin = skins[v], sd = sh(skin, 0.72), sl = sh(skin, 1.12);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const limb = (x0, y0, x1, y1, x2, y2, wd, col) => { g.strokeStyle = rgba(col); g.lineWidth = wd * k; g.beginPath(); g.moveTo(X(x0), Y(y0)); g.quadraticCurveTo(X(x1), Y(y1), X(x2), Y(y2)); g.stroke(); };
    for (const s of [-1, 1]) {
      limb(s * w * 0.25, h * 0.48, s * w * 0.36, h * 0.25, s * w * 0.3, 0.35, w * 0.3, sd);
      limb(s * w * 0.25, h * 0.48, s * w * 0.33, h * 0.26, s * w * 0.29, 0.4, w * 0.22, skin);
      g.fillStyle = rgba(sd); ellipseP(g, X(s * w * 0.33), Y(0.25), w * 0.2 * k, 0.28 * k); g.fill();
    }
    g.fillStyle = radial(g, X(-w * 0.15), Y(h * 0.68), w * 0.75 * k, [[0, rgba(sl)], [0.6, rgba(skin)], [1, rgba(sd)]]);
    ellipseP(g, X(0), Y(h * 0.62), w * 0.5 * k, h * 0.18 * k); g.fill();
    g.fillStyle = radial(g, X(-w * 0.1), Y(h * 0.52), w * 0.5 * k, [[0, rgba(skin)], [1, rgba(sd)]]);
    ellipseP(g, X(0), Y(h * 0.52), w * (0.38 + fat * 0.06) * k, h * 0.08 * k); g.fill();
    g.strokeStyle = rgba(sh(skin, 0.6), 0.5); g.lineWidth = 0.08 * k;
    if (fat < 1) for (let i = 0; i < 4; i++) { const yy = h * (0.66 - i * 0.03); g.beginPath(); g.moveTo(X(-w * 0.3), Y(yy)); g.quadraticCurveTo(X(0), Y(yy - 0.3), X(w * 0.3), Y(yy)); g.stroke(); }
    g.fillStyle = rgba(sh(skin, 0.55)); ellipseP(g, X(0), Y(h * 0.5), 0.12 * k, 0.16 * k); g.fill();
    for (const s of [-1, 1]) {
      const a = 0.1 + r() * 0.15, L = h * 0.17 * armL;
      const ex = s * (w * 0.5 + Math.sin(a) * L), ey = h * 0.76 - Math.cos(a) * L;
      const hx = ex + s * Math.sin(a * 1.4) * L * 0.95, hy = ey - Math.cos(a * 1.4) * L * 0.95;
      g.strokeStyle = rgba(sd); g.lineWidth = w * 0.2 * k;
      g.beginPath(); g.moveTo(X(s * w * 0.48), Y(h * 0.76)); g.lineTo(X(ex), Y(ey)); g.lineTo(X(hx), Y(hy)); g.stroke();
      g.strokeStyle = rgba(skin); g.lineWidth = w * 0.14 * k;
      g.beginPath(); g.moveTo(X(s * w * 0.46), Y(h * 0.765)); g.lineTo(X(ex), Y(ey)); g.lineTo(X(hx), Y(hy)); g.stroke();
      g.fillStyle = rgba(sd); ellipseP(g, X(hx), Y(hy), w * 0.12 * k, w * 0.15 * k); g.fill();
    }
    const hr = h * headK, hy = h * 0.8 + hr;
    g.strokeStyle = rgba(skin); g.lineWidth = w * 0.22 * k; g.beginPath(); g.moveTo(X(0), Y(h * 0.76)); g.lineTo(X(0), Y(hy - hr * 0.5)); g.stroke();
    g.fillStyle = rgba(sd); ellipseP(g, X(-hr * 0.95), Y(hy), hr * 0.18 * k, hr * 0.28 * k); g.fill(); ellipseP(g, X(hr * 0.95), Y(hy), hr * 0.18 * k, hr * 0.28 * k); g.fill();
    g.fillStyle = radial(g, X(-hr * 0.3), Y(hy + hr * 0.3), hr * 1.4 * k, [[0, rgba(sl)], [0.7, rgba(skin)], [1, rgba(sd)]]);
    ellipseP(g, X(0), Y(hy), hr * 0.95 * k, hr * 1.12 * k); g.fill();
    const hairStyle = (r() * 4) | 0, hairCol = [[40, 28, 20], [80, 55, 30], [22, 20, 18], [130, 95, 55]][(r() * 4) | 0];
    if (hairStyle > 0) {
      g.fillStyle = rgba(hairCol);
      g.beginPath(); g.ellipse(X(0), Y(hy + hr * 0.25), hr * 1.0 * k, hr * 0.95 * k, 0, Math.PI + 0.15, -0.15); g.closePath(); g.fill();
      if (hairStyle === 2) { g.fillRect(X(-hr * 1.0), Y(hy + hr * 0.3), hr * 0.25 * k, hr * 1.2 * k); g.fillRect(X(hr * 0.75), Y(hy + hr * 0.3), hr * 0.25 * k, hr * 1.2 * k); }
      if (hairStyle === 3) { g.fillRect(X(-hr * 0.95), Y(hy + hr * 0.35), hr * 1.9 * k, hr * 0.25 * k); }
    }
    const eyeW = hr * (0.18 + r() * 0.1);
    for (const s of [-1, 1]) {
      g.fillStyle = '#f4efe6'; ellipseP(g, X(s * hr * 0.36), Y(hy + hr * 0.05), eyeW * k, eyeW * 0.8 * k); g.fill();
      g.fillStyle = '#1a1210'; ellipseP(g, X(s * hr * 0.36 + (r() - 0.5) * eyeW * 0.6), Y(hy + hr * 0.05), eyeW * 0.28 * k, eyeW * 0.28 * k); g.fill();
    }
    g.strokeStyle = rgba(sh(skin, 0.5)); g.lineWidth = 0.05 * k;
    g.beginPath(); g.moveTo(X(0), Y(hy)); g.lineTo(X(-hr * 0.08), Y(hy - hr * 0.25)); g.stroke();
    const grin = 0.45 + r() * 0.5, mw = hr * (0.5 + r() * 0.25);
    g.fillStyle = '#5a2620';
    g.beginPath(); g.moveTo(X(-mw), Y(hy - hr * 0.38)); g.quadraticCurveTo(X(0), Y(hy - hr * (0.38 + grin * 0.55)), X(mw), Y(hy - hr * 0.38)); g.quadraticCurveTo(X(0), Y(hy - hr * (0.38 + grin * 0.2)), X(-mw), Y(hy - hr * 0.38)); g.fill();
    g.fillStyle = '#efe9da';
    g.beginPath(); g.moveTo(X(-mw * 0.9), Y(hy - hr * 0.4)); g.quadraticCurveTo(X(0), Y(hy - hr * (0.4 + grin * 0.3)), X(mw * 0.9), Y(hy - hr * 0.4)); g.quadraticCurveTo(X(0), Y(hy - hr * (0.4 + grin * 0.15)), X(-mw * 0.9), Y(hy - hr * 0.4)); g.fill();
    g.strokeStyle = 'rgba(90,40,30,0.6)'; g.lineWidth = 1;
    for (let i = -4; i <= 4; i++) { const x = i / 4 * mw * 0.85; g.beginPath(); g.moveTo(X(x), Y(hy - hr * 0.4)); g.lineTo(X(x), Y(hy - hr * (0.4 + grin * 0.25 * (1 - Math.abs(i) / 5)))); g.stroke(); }
    g.globalCompositeOperation = 'source-atop';
    const rim = g.createLinearGradient(X(-w), 0, X(w), 0);
    rim.addColorStop(0, 'rgba(255,220,170,0.0)'); rim.addColorStop(0.8, 'rgba(255,220,170,0.0)'); rim.addColorStop(1, 'rgba(255,220,170,0.35)');
    g.fillStyle = rim; g.fillRect(0, 0, Wc, Hc);
    g.globalCompositeOperation = 'source-over';
    reg('titan' + v, c, TPPM, 0.5, gy / Hc);
    ART.meta['titan' + v].h = h; ART.meta['titan' + v].nape = hy;
  }
}

/* ---------- the beast (rigged parts) ---------- */
const MPPM = 48;
const FUR = [[112, 74, 42], [96, 62, 34], [132, 90, 54], [82, 52, 30], [150, 104, 64]];
const furCols = FUR.map(c => rgba(c));
function furPart(name, wm, hm, drawPath, opts) {
  opts = opts || {};
  const k = MPPM, c = cnv(wm * k + 8, hm * k + 8), g = c.getContext('2d'), r = rng(name.length * 31 + (opts.seed || 1));
  g.translate(4, 4);
  drawPath(g, k);
  g.save(); g.clip();
  g.fillStyle = radial(g, wm * k * 0.4, hm * k * 0.3, Math.max(wm, hm) * k, [[0, rgba(FUR[2])], [0.6, rgba(FUR[0])], [1, rgba(FUR[3])]]);
  g.fillRect(0, 0, wm * k, hm * k);
  furStrokes(g, wm * hm * 30, -10, -10, wm * k + 20, hm * k + 20, furCols, 0.35 * k, opts.ang === undefined ? Math.PI / 2 : opts.ang, 2, r);
  if (opts.inner) opts.inner(g, k, r);
  const sg = g.createLinearGradient(0, 0, wm * k, 0);
  sg.addColorStop(0, 'rgba(30,15,5,0.35)'); sg.addColorStop(0.45, 'rgba(0,0,0,0)'); sg.addColorStop(0.85, 'rgba(255,220,170,0.08)'); sg.addColorStop(1, 'rgba(30,15,5,0.25)');
  g.fillStyle = sg; g.fillRect(0, 0, wm * k, hm * k);
  g.restore();
  g.strokeStyle = rgba(FUR[3]); g.lineWidth = 2;
  for (let i = 0; i < wm * hm * 3; i++) {
    const a = r() * 6.283, cx = wm * k / 2, cy = hm * k / 2;
    const x = cx + Math.cos(a) * wm * k * 0.48, y = cy + Math.sin(a) * hm * k * 0.48;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 6 + (r() - 0.5) * 4, y + Math.sin(a) * 6 + 4); g.stroke();
  }
  ART.tex[name] = mkTex(c);
  ART.meta[name] = { ppm: k, ax: opts.ax === undefined ? 0.5 : (opts.ax * wm * k + 4) / c.width, ay: opts.ay === undefined ? 0.5 : (opts.ay * hm * k + 4) / c.height };
}
function limbPart(name, wd, len) {
  const tot = len + wd;
  furPart(name, wd, tot, (g, k) => capsule(g, wd * k / 2, wd * k / 2, (tot - wd / 2) * k, wd * k, wd * k * 0.85), { ax: 0.5, ay: (wd / 2) / tot });
  ART.meta[name].len = len; ART.meta[name].wd = wd; ART.meta[name].tot = tot;
}
function artBeast() {
  furPart('mTorso', 10, 12, (g, k) => { ellipseP(g, 5 * k, 6.2 * k, 4.8 * k, 5.8 * k); }, {
    inner: (g, k, r) => {
      g.fillStyle = radial(g, 4.6 * k, 5.2 * k, 3.6 * k, [[0, 'rgba(176,132,92,0.95)'], [0.7, 'rgba(150,108,72,0.7)'], [1, 'rgba(150,108,72,0)']]);
      ellipseP(g, 5 * k, 5.6 * k, 2.9 * k, 3.6 * k); g.fill();
      g.strokeStyle = 'rgba(90,60,35,0.5)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(3 * k, 4 * k); g.quadraticCurveTo(5 * k, 4.8 * k, 7 * k, 4 * k); g.moveTo(5 * k, 4.6 * k); g.lineTo(5 * k, 8 * k); g.stroke();
      furStrokes(g, 400, 2 * k, 2.5 * k, 6 * k, 6 * k, ['rgba(190,150,110,0.5)', 'rgba(120,85,55,0.5)'], 0.25 * k, Math.PI / 2, 1.5, r);
    }
  });
  ART.meta.mTorso.cy = 11.8;
  furPart('mHead', 5, 5.2, (g, k) => { ellipseP(g, 2.5 * k, 2.6 * k, 2.3 * k, 2.5 * k); }, {
    inner: (g, k) => {
      g.fillStyle = radial(g, 2.4 * k, 3.0 * k, 1.9 * k, [[0, '#c89870'], [0.7, '#a87a54'], [1, 'rgba(150,108,72,0)']]);
      g.beginPath(); g.moveTo(1.0 * k, 2.2 * k); g.quadraticCurveTo(2.5 * k, 1.5 * k, 4.0 * k, 2.2 * k); g.quadraticCurveTo(4.2 * k, 3.8 * k, 2.5 * k, 4.7 * k); g.quadraticCurveTo(0.8 * k, 3.8 * k, 1.0 * k, 2.2 * k); g.fill();
      g.fillStyle = '#3a2416';
      g.beginPath(); g.moveTo(0.9 * k, 2.25 * k); g.quadraticCurveTo(2.5 * k, 1.75 * k, 4.1 * k, 2.25 * k); g.lineTo(4.0 * k, 2.55 * k); g.quadraticCurveTo(2.5 * k, 2.15 * k, 1.0 * k, 2.55 * k); g.fill();
      g.fillStyle = 'rgba(30,15,8,0.8)';
      ellipseP(g, 1.8 * k, 2.75 * k, 0.55 * k, 0.22 * k, 0.2); g.fill(); ellipseP(g, 3.2 * k, 2.75 * k, 0.55 * k, 0.22 * k, -0.2); g.fill();
      g.fillStyle = '#7a5038'; ellipseP(g, 2.5 * k, 3.45 * k, 0.6 * k, 0.4 * k); g.fill();
      g.fillStyle = '#2a160c'; ellipseP(g, 2.3 * k, 3.5 * k, 0.1 * k, 0.07 * k); g.fill(); ellipseP(g, 2.7 * k, 3.5 * k, 0.1 * k, 0.07 * k); g.fill();
      g.strokeStyle = '#2a160c'; g.lineWidth = 0.09 * k;
      g.beginPath(); g.moveTo(1.6 * k, 4.0 * k); g.quadraticCurveTo(2.5 * k, 4.35 * k, 3.6 * k, 3.85 * k); g.stroke();
      g.strokeStyle = 'rgba(240,230,210,0.7)'; g.lineWidth = 0.05 * k;
      g.beginPath(); g.moveTo(1.9 * k, 4.05 * k); g.quadraticCurveTo(2.5 * k, 4.25 * k, 3.3 * k, 3.95 * k); g.stroke();
    }
  });
  ART.meta.mHead.cy = 17.3;
  limbPart('mUpper', 2.1, 6.6);
  limbPart('mFore', 1.75, 6.6);
  limbPart('mThigh', 2.7, 3.9);
  limbPart('mShin', 2.5, 3.9);
  furPart('mHand', 2.6, 2.6, (g, k) => { ellipseP(g, 1.3 * k, 1.3 * k, 1.25 * k, 1.25 * k); }, {
    inner: (g, k) => { g.strokeStyle = 'rgba(40,25,15,0.7)'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo((0.6 + i * 0.45) * k, 1.7 * k); g.lineTo((0.6 + i * 0.45) * k, 2.4 * k); g.stroke(); } }
  });
  let c = cnv(3.4 * MPPM, 1.3 * MPPM), g = c.getContext('2d');
  g.fillStyle = radial(g, c.width * 0.4, c.height * 0.3, c.width * 0.6, [[0, '#4a3020'], [1, '#22140c']]); ellipseP(g, c.width / 2, c.height / 2, c.width / 2 - 2, c.height / 2 - 2); g.fill();
  reg('mFoot', c, MPPM, 0.5, 0.5);
  c = cnv(1.3 * MPPM, 0.6 * MPPM); g = c.getContext('2d');
  g.fillStyle = '#ffe070'; g.shadowColor = '#ffb020'; g.shadowBlur = 8;
  g.beginPath(); g.moveTo(4, c.height * 0.55); g.quadraticCurveTo(c.width * 0.5, 2, c.width - 4, c.height * 0.25); g.quadraticCurveTo(c.width * 0.5, c.height * 0.75, 4, c.height * 0.55); g.fill();
  reg('mEye', c, MPPM, 0.5, 0.5);
  c = cnv(1.4 * MPPM, 1.4 * MPPM); g = c.getContext('2d');
  g.strokeStyle = '#8a1010'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(6, c.height * 0.5); g.lineTo(c.width - 6, c.height * 0.45); g.moveTo(c.width * 0.55, 6); g.lineTo(c.width * 0.5, c.height - 4); g.stroke();
  reg('mEyeCut', c, MPPM, 0.5, 0.5);
  c = cnv(2.2 * MPPM, 2.2 * MPPM); g = c.getContext('2d');
  g.fillStyle = radial(g, c.width / 2, c.height / 2, c.width / 2, [[0, '#f0e6d8'], [0.25, '#c43a30'], [0.8, '#7a1a14'], [1, 'rgba(90,20,15,0)']]);
  g.fillRect(0, 0, c.width, c.height);
  reg('mStump', c, MPPM, 0.5, 0.5);
  furPart('mChunk', 1.9, 1.2, (g, k) => { g.beginPath(); g.rect(0, 0, 1.9 * k, 1.2 * k); }, {
    ang: 0, inner: (g, k) => { g.fillStyle = '#9a2a22'; g.fillRect(0, 0, 0.18 * k, 1.2 * k); g.fillRect(1.72 * k, 0, 0.18 * k, 1.2 * k); g.fillStyle = '#e8dccb'; g.beginPath(); g.arc(0.09 * k, 0.6 * k, 0.12 * k, 0, 6.29); g.arc(1.81 * k, 0.6 * k, 0.12 * k, 0, 6.29); g.fill(); }
  });
}

/* ---------- carrier (quadruped) ---------- */
function artQuad() {
  const k = 30;
  for (let f = 0; f < 6; f++) {
    const c = cnv(13 * k, 7 * k), g = c.getContext('2d');
    const X = m => (6.5 + m) * k, Y = m => (6.6 - m) * k, ph = f / 6 * Math.PI * 2;
    const body = [96, 78, 66], dark = [60, 48, 40], plate = [130, 112, 96];
    g.lineCap = 'round'; g.lineJoin = 'round';
    const legs = [[2.8, 0], [1.9, Math.PI], [-2.4, Math.PI / 2], [-3.2, Math.PI * 1.5]];
    legs.forEach(([lx, o], i) => {
      const sw = Math.sin(ph + o) * 0.7, up = Math.max(0, Math.cos(ph + o)) * 0.45;
      g.strokeStyle = rgba(i % 2 ? sh(dark, 0.8) : dark); g.lineWidth = 0.8 * k;
      g.beginPath(); g.moveTo(X(lx), Y(2.5)); g.lineTo(X(lx + sw * 0.5 + 0.3), Y(1.2 + up)); g.lineTo(X(lx + sw), Y(up + 0.1)); g.stroke();
      g.fillStyle = rgba(sh(dark, 0.6)); ellipseP(g, X(lx + sw + 0.2), Y(up + 0.1), 0.45 * k, 0.18 * k); g.fill();
    });
    const bob = Math.sin(ph * 2) * 0.08;
    g.fillStyle = radial(g, X(0.5), Y(3.6 + bob), 4.5 * k, [[0, rgba(sh(body, 1.25))], [0.7, rgba(body)], [1, rgba(dark)]]);
    ellipseP(g, X(0), Y(2.9 + bob), 4.2 * k, 1.5 * k); g.fill();
    ellipseP(g, X(-0.5), Y(3.6 + bob), 3.0 * k, 1.0 * k); g.fill();
    for (let i = -3; i <= 3; i++) { g.fillStyle = rgba(plate); ellipseP(g, X(i * 0.95), Y(4.35 - Math.abs(i) * 0.17 + bob), 0.42 * k, 0.32 * k); g.fill(); g.strokeStyle = rgba(dark); g.lineWidth = 2; g.stroke(); }
    g.strokeStyle = rgba(body); g.lineWidth = 0.5 * k;
    g.beginPath(); g.moveTo(X(-4), Y(2.9)); g.quadraticCurveTo(X(-5.5), Y(2.1), X(-6.1), Y(0.9 + Math.sin(ph) * 0.2)); g.stroke();
    g.fillStyle = radial(g, X(4.6), Y(2.6), 1.6 * k, [[0, rgba(sh(body, 1.2))], [1, rgba(dark)]]);
    ellipseP(g, X(4.6), Y(2.25 + bob), 1.35 * k, 0.9 * k); g.fill();
    g.fillStyle = rgba(sh(dark, 0.8)); ellipseP(g, X(5.5), Y(1.85 + bob), 0.85 * k, 0.4 * k); g.fill();
    g.fillStyle = '#efe6d0'; for (let i = 0; i < 5; i++) poly(g, [[X(5.0 + i * 0.22), Y(1.95 + bob)], [X(5.1 + i * 0.22), Y(1.7 + bob)], [X(5.2 + i * 0.22), Y(1.95 + bob)]]), g.fill();
    g.fillStyle = '#ff6a30'; g.shadowColor = '#ff4010'; g.shadowBlur = 6; g.beginPath(); g.arc(X(4.95), Y(2.55 + bob), 0.15 * k, 0, 6.29); g.fill(); g.shadowBlur = 0;
    reg('quad' + f, c, k, 0.5, 6.6 / 7);
  }
}

function buildArt() {
  artFX(); artSky(); artScenery(); artRiders(); artTitans(); artBeast(); artQuad();
}
