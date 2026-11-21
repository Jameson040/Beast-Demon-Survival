'use strict';
const cv = document.getElementById('hud'), ctx = cv.getContext('2d'), ov = document.getElementById('ov');
let W = 0, H = 0, F = 0, HOR = 0, DPR = 1, U = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = cv.width = Math.floor(innerWidth * DPR);
  H = cv.height = Math.floor(innerHeight * DPR);
  F = Math.min(H * 1.15, W * 0.9);
  HOR = H * 0.36;
  U = H / 900;
  if (window.onWorldResize) window.onWorldResize();
}
addEventListener('resize', resize); resize();

const GRAV = 9.81, LTELE = 550, DEMON_START = 1500, RIDERS = 120, WIN_DIST = 35;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
function gauss() { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * Math.random()); }
const HAZE = [205, 188, 160];
function fogf(dz) { return clamp(1 - Math.exp(-dz / 1500), 0, 0.72); }
function fogc(c, dz, a) {
  const f = fogf(dz);
  const r = c[0] + (HAZE[0] - c[0]) * f | 0, g = c[1] + (HAZE[1] - c[1]) * f | 0, b = c[2] + (HAZE[2] - c[2]) * f | 0;
  return a === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

const DIFFS = {
  easy:   { name: 'Recruit',  frag: 0.6, acc: 1.35, rate: 1.25, targetP: 0.30, carry: 1 },
  normal: { name: 'Scout',    frag: 1.0, acc: 1.0,  rate: 1.0,  targetP: 0.45, carry: 2 },
  hard:   { name: 'Veteran',  frag: 1.5, acc: 0.78, rate: 0.82, targetP: 0.60, carry: 2 }
};
let diffKey = 'normal', cfg = DIFFS.normal;

const cam = { x: 0, y: 3.6, z: -9 };
const P = { x: 0, y: 0, s: 0, dz: 0 };
function proj(x, y, z) {
  const dz = z - cam.z;
  if (dz < 0.4) return false;
  const s = F * (1 + dz / LTELE) / dz;
  P.x = W / 2 + (x - cam.x) * s; P.y = HOR + (cam.y - y) * s; P.s = s; P.dz = dz;
  return true;
}
const yAtDz = dz => HOR + cam.y * F * (1 + dz / LTELE) / dz;

/* ---------------- AUDIO ---------------- */
const SFX = { ac: null, on: true };
function audioInit() {
  if (SFX.ac) { if (SFX.ac.state === 'suspended') SFX.ac.resume(); return; }
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    SFX.ac = ac; SFX.m = ac.createGain(); SFX.m.gain.value = 0.55; SFX.m.connect(ac.destination);
    const len = ac.sampleRate * 2, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    SFX.nb = b;
    const loop = (type, freq, q) => {
      const s = ac.createBufferSource(); s.buffer = b; s.loop = true;
      const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(SFX.m); s.start(); return g;
    };
    SFX.rumble = loop('lowpass', 130, 0.7);
    SFX.wind = loop('bandpass', 700, 0.6);
  } catch (e) { SFX.ac = null; }
}
function nz(dur, type, freq, gain, o) {
  const ac = SFX.ac; if (!ac || !SFX.on) return;
  o = o || {};
  const t = ac.currentTime + (o.delay || 0);
  const s = ac.createBufferSource(); s.buffer = SFX.nb;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = o.q || 1;
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g);
  if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clamp(o.pan || 0, -1, 1); g.connect(p); p.connect(SFX.m); }
  else g.connect(SFX.m);
  s.start(t, Math.random() * 1.5, dur + 0.05);
}
function tone(freq, dur, gain, type, delay, f2) {
  const ac = SFX.ac; if (!ac || !SFX.on) return;
  const t = ac.currentTime + (delay || 0);
  const o = ac.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(SFX.m); o.start(t); o.stop(t + dur + 0.05);
}
const sHoof = () => nz(0.07, 'lowpass', 240, 0.32);
const sWhoosh = (pan, small) => nz(small ? 0.16 : 0.28, 'bandpass', small ? 4200 : 2600, small ? 0.35 : 0.5, { f2: small ? 1200 : 450, q: 2, pan });
const sThud = (pan, v) => nz(0.12, 'lowpass', 700, v, { pan });
function sCrack(delay) { nz(0.7, 'lowpass', 1400, 0.8, { delay, f2: 120 }); tone(52, 0.9, 0.45, 'sine', delay, 28); }
function sDeath() { nz(0.7, 'lowpass', 1100, 1.0, { f2: 80 }); tone(90, 0.6, 0.6, 'triangle', 0, 30); }
function sJump() { nz(0.18, 'lowpass', 400, 0.3); }

/* ---------------- INPUT ---------------- */
const keys = {};
const touch = { l: false, r: false, up: false };
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  if (keys[k]) return;
  keys[k] = true;
  audioInit();
  if (G && G.state === 'play') {
    if (k === ' ') G.wantJump = true;
    if (k === 'shift') G.wantDash = true;
    if (k === 'h') G.radar = !G.radar;
    if (k === 'm') SFX.on = !SFX.on;
    if (k === 'p' || k === 'escape') togglePause();
  } else if (G && G.state === 'pause' && (k === 'p' || k === 'escape')) togglePause();
  else if (k === 'enter' && (!G || G.state === 'over' || G.state === 'win' || G.state === 'menu')) startGame();
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
function touchUpdate(e) {
  touch.l = touch.r = touch.up = false;
  for (const t of e.touches) {
    const x = t.clientX / innerWidth, y = t.clientY / innerHeight;
    if (y < 0.4) touch.up = true;
    else if (x < 0.5) touch.l = true; else touch.r = true;
  }
}
cv.addEventListener('touchstart', e => {
  audioInit(); touchUpdate(e);
  if (e.touches.length >= 2 && G && G.state === 'play') G.wantJump = true;
  e.preventDefault();
}, { passive: false });
cv.addEventListener('touchmove', e => { touchUpdate(e); e.preventDefault(); }, { passive: false });
cv.addEventListener('touchend', e => { touchUpdate(e); e.preventDefault(); }, { passive: false });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (G && G.state === 'play') togglePause(); });

/* ---------------- STATE ---------------- */
let G = null, player, riders, stones, parts, scen, monkey, quad;
const HORSE_COLS = [[107, 63, 34], [128, 70, 36], [60, 40, 30], [150, 140, 130], [90, 55, 30], [40, 30, 25], [170, 120, 70]];

function newGame() {
  cfg = DIFFS[diffKey];
  G = {
    state: 'play', t: 0, demonZ: DEMON_START, slow: 1, shake: 0, wantJump: false, wantDash: false,
    radar: G ? G.radar : true, close: 0, score: 0, pops: [], warn: [], deathT: 0, killer: null,
    stonesThrown: 0, hoofPrev: 0, thudBudget: 0, caption: '', flash: 0
  };
  player = { x: 0, y: 0, z: 0, vx: 0, vy: 0, speed: 15, stam: 1, phase: 0, jumpCD: 0, dashCD: 0, alive: true,
    tumble: 0, tdir: 1, lean: 0, px: 0, py: 0, pz: 0, col: HORSE_COLS[0], isPlayer: true };
  riders = [];
  const COLS = 15, ROWS = Math.ceil(RIDERS / COLS);
  for (let i = 0; i < RIDERS; i++) {
    const c = i % COLS, rw = (i / COLS) | 0;
    let x = (c - (COLS - 1) / 2) * 12 + (rw % 2 ? 6 : 0) + rand(-2.5, 2.5);
    let off = -15 + rw * (170 / ROWS) + rand(-4, 4);
    if (Math.abs(x) < 4 && Math.abs(off) < 12) x += x < 0 ? -6 : 6;
    riders.push({ x, y: 0, z: off, off, lane: x, home: x, vx: 0, speed: 15, phase: rand(0, 6.28), wf: rand(0.2, 0.6), ph: rand(0, 6.28),
      col: HORSE_COLS[(Math.random() * HORSE_COLS.length) | 0], alive: true, tumble: 0, tdir: Math.random() < 0.5 ? -1 : 1, lean: 0, jig: 0 });
  }
  stones = []; parts = []; scen = [];
  monkey = { state: 'idle', t: 0, arm: 1, handfuls: 0, aL: 0.15, bL: 0.05, aR: 0.15, bR: 0.05, holding: false, stock: 2 };
  quad = { x: 40, state: 'toMonkey', carry: cfg.carry, t: 0, phase: 0, dir: -1 };
  initTitans();
  chunks = [];
  genScenery(0, 400);
}

function genScenery(z0, z1) {
  for (let z = Math.ceil(z0 / 10) * 10; z < z1; z += 10) {
    const n = 22 + (Math.random() * 8 | 0);
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      const k = r < 0.72 ? 0 : r < 0.84 ? 3 : r < 0.93 ? 1 : r < 0.985 ? 4 : 2;
      const x = k === 0 || k === 3 ? rand(-70, 70) : rand(-160, 160);
      scen.push({ x, z: z + rand(0, 10), k, s: rand(0.6, 1.4), v: (Math.random() * 4) | 0, f: Math.random() < 0.5 });
    }
  }
  G.scenZ = z1;
}

/* ---------------- MONKEY / QUAD ---------------- */
function armHand(side, a, b) {
  const sx = side * 3.8, sy = 15.0, L = 6.6;
  const ex = sx + side * Math.sin(a) * L, ey = sy - Math.cos(a) * L;
  const a2 = a + b;
  return [ex, ey, ex + side * Math.sin(a2) * L, ey - Math.cos(a2) * L];
}
function closeness() { return 1 - clamp((G.demonZ - player.z) / DEMON_START, 0, 1); }

function updateMonkey(dt) {
  const m = monkey;
  if (m.state === 'cut') { updateCut(dt); return; }
  const rm = cfg.rate * (0.6 + 0.4 * (1 - closeness())) * (player.alive ? 1 : 0.5);
  m.t += dt;
  let tL = [0.15 + Math.sin(G.t * 1.1) * 0.06, 0.05], tR = [0.15 + Math.sin(G.t * 1.1 + 1) * 0.06, 0.05];
  const thr = m.arm;
  const setT = (side, v) => { if (side > 0) tR = v; else tL = v; };
  switch (m.state) {
    case 'idle':
      G.caption = m.stock > 0 ? '' : 'The Beast waits for boulders...';
      if (m.stock > 0 && m.t > 0.3 * rm) { m.state = 'pick'; m.t = 0; }
      break;
    case 'pick':
      G.caption = 'The Beast grabs a boulder';
      setT(1, [0.55, 0.35]);
      if (m.t > 0.7 * rm) { m.stock--; m.holding = true; m.state = 'crush'; m.t = 0; }
      break;
    case 'crush':
      G.caption = 'CRUSHING';
      tL = [0.6, -2.0]; tR = [0.6, -2.0];
      if (m.t > 0.3 && m.holding) {
        m.holding = false;
        const dz = G.demonZ - 1.5;
        for (let i = 0; i < 60; i++) parts.push({ x: rand(-1.5, 1.5), y: 8.5 + rand(-1, 1), z: dz, vx: rand(-9, 9), vy: rand(-2, 10), vz: rand(-6, 6), life: 0, max: rand(1, 2.2), size: rand(0.25, 0.7), col: [120, 110, 100], g: 1 });
        for (let i = 0; i < 14; i++) parts.push({ x: rand(-2, 2), y: 8.5, z: dz, vx: rand(-3, 3), vy: rand(0, 3), vz: rand(-2, 2), life: 0, max: rand(1.5, 3), size: rand(2, 4), col: [170, 150, 120], dust: 1 });
        sCrack(Math.min((G.demonZ - player.z) / 343, 4));
        G.shake = Math.max(G.shake, 0.15 * closeness() + 0.03);
        m.handfuls = 3; m.arm = Math.random() < 0.5 ? 1 : -1;
      }
      if (m.t > 0.8 * rm) { m.state = 'windup'; m.t = 0; }
      break;
    case 'windup':
      G.caption = 'WINDING UP';
      setT(thr, [2.6, 0.45]); setT(-thr, [0.5, -1.2]);
      if (m.t > 0.55 * rm) { m.state = 'throw'; m.t = 0; m.thrown = false; }
      break;
    case 'throw': {
      G.caption = 'THROWING';
      const k = clamp(m.t / 0.22, 0, 1);
      const a = lerp(2.6, -0.35, k), b = lerp(0.45, -0.25, k);
      if (thr > 0) { m.aR = a; m.bR = b; } else { m.aL = a; m.bL = b; }
      setT(thr, [a, b]); setT(-thr, [0.5, -1.2]);
      if (!m.thrown && k > 0.42) {
        m.thrown = true;
        const h = armHand(thr, a, b);
        volley(h[2], h[3], G.demonZ - 1.5);
        m.handfuls--;
      }
      if (m.t > 0.3) { m.state = 'recover'; m.t = 0; }
      break;
    }
    case 'recover':
      setT(thr, [0.3, 0.1]); setT(-thr, [0.5, -1.2]);
      if (m.t > 0.35 * rm) {
        m.t = 0;
        if (m.handfuls > 0) { m.arm = -m.arm; m.state = 'windup'; }
        else m.state = 'idle';
      }
      break;
  }
  if (m.state !== 'throw') {
    const r = Math.min(1, dt * 9);
    m.aL = lerp(m.aL, tL[0], r); m.bL = lerp(m.bL, tL[1], r);
    m.aR = lerp(m.aR, tR[0], r); m.bR = lerp(m.bR, tR[1], r);
  }
}

function updateQuad(dt) {
  const q = quad, sp = (9 + 6 * closeness()) * (player.alive ? 1 : 2);
  q.t += dt;
  if (monkey.state === 'cut' && monkey.t > 2) { q.dir = 1; q.x += 14 * dt; q.phase += 14 * dt * 0.9; return; }
  if (q.state === 'toMonkey') {
    q.dir = -1; q.x -= sp * dt; q.phase += sp * dt * 0.9;
    if (q.x <= 16) { q.x = 16; q.state = 'drop'; q.t = 0; }
  } else if (q.state === 'drop') {
    if (q.t > 0.8 && q.carry > 0) { q.carry--; monkey.stock = Math.min(monkey.stock + 1, 5); q.t = 0.4; }
    if (q.carry === 0 && q.t > 0.6) { q.state = 'toPile'; q.t = 0; }
  } else if (q.state === 'toPile') {
    q.dir = 1; q.x += sp * dt; q.phase += sp * dt * 0.9;
    if (q.x >= 54) { q.x = 54; q.state = 'load'; q.t = 0; }
  } else if (q.state === 'load') {
    if (q.t > 1.1) { q.carry = cfg.carry; q.state = 'toMonkey'; q.t = 0; }
  }
}

function volley(hx, hy, hz) {
  const dist = hz - player.z, cl = closeness();
  const n = Math.round((50 + 100 * cl) * cfg.frag * rand(0.8, 1.2));
  const alive = riders.filter(r => r.alive);
  const pool = player.alive ? alive.concat([player]) : alive;
  if (!pool.length) return;
  const nt = 3 + ((Math.random() * 4) | 0);
  const tgts = [];
  if (player.alive && Math.random() < cfg.targetP + 0.3 * cl) tgts.push(player);
  while (tgts.length < nt) tgts.push(pool[(Math.random() * pool.length) | 0]);
  const sigma = (3.0 + dist * 0.012) * cfg.acc * (player.alive ? 1 : 0.45);
  const baseVh = rand(80, 105);
  let minT = 1e9, atPlayer = false;
  for (let i = 0; i < n; i++) {
    const wide = Math.random() < (player.alive ? 0.3 : 0.08);
    const tgt = tgts[i % tgts.length];
    const cx = wide ? rand(-90, 90) - tgt.x + player.x * 0.3 : 0, cz = wide ? rand(-20, 170) - (tgt.z - player.z) : 0;
    const bullet = Math.random() < 0.15, chunk = !bullet && Math.random() < 0.05;
    const vh = baseVh * rand(0.88, 1.12) * (bullet ? 1.2 : chunk ? 0.9 : 1);
    let T = Math.hypot(tgt.x - hx, tgt.z - hz) / vh;
    let px = tgt.x + tgt.vx * T * rand(0.2, 0.9), pz = tgt.z + tgt.speed * T;
    T = Math.hypot(px - hx, pz - hz) / vh;
    pz = tgt.z + tgt.speed * T;
    const tx = px + cx + gauss() * sigma, tz = pz + cz + gauss() * sigma * 1.2, ty = rand(0.2, 2.3);
    const T2 = Math.hypot(tx - hx, tz - hz) / vh;
    const vy = (ty - hy + 0.5 * GRAV * T2 * T2) / T2;
    const r = bullet ? rand(0.008, 0.014) : chunk ? rand(0.07, 0.14) : rand(0.02, 0.035);
    const delay = rand(0, 0.14);
    stones.push({ x: hx + rand(-0.6, 0.6), y: hy + rand(-0.6, 0.6), z: hz, vx: (tx - hx) / T2, vy, vz: (tz - hz) / T2, r, delay, bounced: false, life: 0, near: false, bullet });
    if (tgt === player && !wide) { atPlayer = true; if (T2 + delay < minT) minT = T2 + delay; }
  }
  G.stonesThrown += n;
  if (atPlayer) G.warn.push({ until: G.t + minT, start: G.t });
}

/* ---------------- UPDATE ---------------- */
function segBox(o, d, mn, mx) {
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return false; }
    else {
      let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i];
      if (a > b) { const t = a; a = b; b = t; }
      if (a > t0) t0 = a; if (b < t1) t1 = b;
      if (t0 > t1) return false;
    }
  }
  return true;
}

function killPlayer(s) {
  if (!player.alive) return;
  player.alive = false; player.tdir = s.vx > 0 ? 1 : -1;
  G.killer = { kmh: Math.hypot(s.vx, s.vy, s.vz) * 3.6, inch: s.r * 2 / 0.0254, part: s.hitPart };
  G.deathT = 0; G.slow = 0.18; G.shake = 0.8; G.flash = 1;
  const chunk = s.r > 0.06, r = Math.random();
  if (s.hitPart === 'the rider') G.fate = chunk || r < 0.55 ? 'dead' : r < 0.86 ? 'serious' : 'light';
  else G.fate = (chunk && r < 0.5) || r < 0.15 ? 'dead' : r < 0.55 ? 'serious' : 'light';
  G.fallDist = G.demonZ - player.z;
  sDeath();
  for (let i = 0; i < 30; i++) parts.push({ x: player.x + rand(-0.6, 0.6), y: rand(0.2, 1.5), z: player.z + rand(-1, 1), vx: rand(-3, 3), vy: rand(0, 3), vz: rand(-2, 4) + player.speed * 0.5, life: 0, max: rand(1, 2.5), size: rand(0.4, 1), col: [150, 125, 95], dust: 1 });
}

const killPlayerReal = killPlayer;
function update(dt) {
  G.t += dt;
  const p = player;
  p.px = p.x; p.py = p.y; p.pz = p.z;

  if (p.alive) {
    const steer = ((keys.d || keys.arrowright || touch.r) ? 1 : 0) - ((keys.a || keys.arrowleft || touch.l) ? 1 : 0);
    const air = p.y > 0.01;
    const tvx = steer * 7.5;
    p.vx += (tvx - p.vx) * Math.min(1, dt * (air ? 1.2 : 4.2));
    p.dashCD -= dt; p.jumpCD -= dt;
    if (G.wantDash && p.dashCD <= 0 && p.stam >= 0.22 && !air) {
      const dir = steer || (p.vx >= 0 ? 1 : -1);
      p.vx = dir * 15; p.stam -= 0.22; p.dashCD = 0.7; nz(0.2, 'lowpass', 500, 0.35);
    }
    if (G.wantJump && !air && p.jumpCD <= 0 && p.stam >= 0.12) { p.vy = 4.8; p.stam -= 0.12; p.jumpCD = 0.4; sJump(); }
    G.wantDash = G.wantJump = false;
    const sprint = (keys.w || keys.arrowup || touch.up) && p.stam > 0.02;
    const rein = keys.s || keys.arrowdown;
    const ts = sprint ? 21 : rein ? 9 : 15;
    p.speed += (ts - p.speed) * Math.min(1, dt * 1.3);
    if (sprint) p.stam -= dt * 0.2; else p.stam += dt * (rein ? 0.18 : 0.1);
    p.stam = clamp(p.stam, 0, 1);
    p.x += p.vx * dt;
    if (Math.abs(p.x) > 100) { p.x = clamp(p.x, -100, 100); p.vx = 0; }
    p.vy -= GRAV * 1.6 * dt; p.y += p.vy * dt;
    if (p.y <= 0) { if (air) { sHoof(); sHoof(); } p.y = 0; p.vy = 0; }
    p.z += p.speed * dt;
    const ph0 = p.phase;
    p.phase += p.speed * dt * 1.8;
    if (!air) {
      const beats = [0, 0.9, 2.6, 3.3];
      for (const b of beats) {
        const a = Math.floor((ph0 - b) / 6.2832), c = Math.floor((p.phase - b) / 6.2832);
        if (c > a) sHoof();
      }
    }
    p.lean = lerp(p.lean, -p.vx * 0.035, Math.min(1, dt * 6));
    if (!air && Math.random() < dt * 9 && parts.length < 1350) parts.push({ x: p.x + rand(-0.4, 0.4), y: 0.1, z: p.z - 1.3, vx: rand(-0.8, 0.8) - p.vx * 0.2, vy: rand(0.3, 1.4), vz: p.speed * 0.55, life: 0, max: rand(0.6, 1.2), size: rand(0.35, 0.8), col: [168, 145, 108], dust: 1 });
    G.score += p.speed * dt;
    if (p.z >= G.demonZ - WIN_DIST) winGame();
  } else {
    G.deathT += dt;
    p.tumble += dt;
    p.speed = Math.max(0, p.speed - 16 * dt);
    p.z += p.speed * dt; p.vx *= 0.95; p.x += p.vx * dt; p.y = Math.max(0, p.y - 3 * dt);
    if (G.fate === 'dead') { if (G.deathT > 2.6 && G.state === 'play') gameOver(); }
    else {
      if (!levi.active && G.deathT > 2) { levi.active = true; levi.phase = 'fly'; setLeviHop(); }
      if (G.zekeDone && G.zekeDoneT > (G.fate === 'serious' ? 2 : 4) && G.state === 'play') gameOver();
    }
  }
  if (p.alive && G.zekeDone && G.zekeDoneT > 3 && G.state === 'play') winGame(true);
  G.slow = Math.min(1, G.slow + dt * 0.5);

  const pc = player.alive ? player : null;
  for (const r of riders) {
    if (r.alive) {
      const want = clamp((p.z + r.off - r.z) * 0.08, -3, 3);
      r.speed = lerp(r.speed, 15 + want + Math.sin(G.t * r.wf + r.ph) * 0.6, Math.min(1, dt * 2));
      if (Math.random() < dt * 0.12) r.lane = clamp(r.lane + rand(-3, 3), -100, 100);
      r.lane += (r.home - r.lane) * dt * 0.05;
      let tx = r.lane + Math.sin(G.t * r.wf * 1.7 + r.ph) * 2;
      if (pc && Math.abs(r.z - p.z) < 3.5 && Math.abs(r.x - p.x) < 2.2) tx = r.x + (r.x >= p.x ? 3 : -3);
      const tvx = clamp((tx - r.x) * 1.5, -6, 6);
      r.vx = lerp(r.vx, tvx, Math.min(1, dt * 3));
      r.x += r.vx * dt; r.z += r.speed * dt; r.phase += r.speed * dt * 1.8;
      r.lean = lerp(r.lean, -r.vx * 0.035, Math.min(1, dt * 5));
      if (r.z - cam.z < 220 && r.z > cam.z && Math.random() < dt * 4 && parts.length < 1300) parts.push({ x: r.x + rand(-0.4, 0.4), y: 0.15, z: r.z - 1.2, vx: rand(-0.6, 0.6), vy: rand(0.3, 1.2), vz: r.speed * 0.6, life: 0, max: rand(0.8, 1.6), size: rand(0.5, 1.0), col: [168, 145, 108], dust: 1 });
      if (r.z > G.demonZ - 20) { r.z = G.demonZ - 20; r.speed = 0; }
    } else {
      r.tumble += dt; r.speed = Math.max(0, r.speed - 18 * dt); r.z += r.speed * dt; r.vx *= 0.9;
    }
  }

  updateMonkey(dt);
  updateQuad(dt);
  updateTitans(dt);
  updateChunks(dt);
  if (G.zekeDone) G.zekeDoneT += dt;

  G.thudBudget = 3;
  const pmin = [-0.4, 0.15, -1.25], pmax = [0.4, 2.45, 1.25];
  const o = [0, 0, 0], d = [0, 0, 0], mn = [0, 0, 0], mx = [0, 0, 0];
  for (let i = stones.length - 1; i >= 0; i--) {
    const s = stones[i];
    if (s.delay > 0) { s.delay -= dt; continue; }
    const ox = s.x, oy = s.y, oz = s.z;
    s.life += dt;
    s.vy -= GRAV * dt;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    let dead = false;
    if (s.y <= s.r) {
      const ndz = s.z - cam.z;
      if (!s.bounced && s.vy < -1) {
        s.y = s.r; s.vy = -s.vy * 0.22; s.vx *= 0.4; s.vz *= 0.4; s.bounced = true;
        if (ndz > 0 && ndz < 350 && parts.length < 1400) {
          const k = s.r > 0.06 ? 5 : 2;
          for (let j = 0; j < k; j++) parts.push({ x: s.x, y: 0.1, z: s.z, vx: rand(-1.5, 1.5), vy: rand(0.5, 2.5), vz: s.vz * 0.05 + rand(-1, 1), life: 0, max: rand(0.6, 1.3), size: rand(0.25, 0.6) * (s.r > 0.06 ? 2 : 1), col: [140, 118, 85], dust: 1 });
        }
        if (ndz > 0 && ndz < 40 && G.thudBudget-- > 0) sThud((s.x - cam.x) / 20, 0.25 * (1 - ndz / 40));
      } else dead = true;
    }
    if (s.life > 40 || s.z < cam.z - 5) dead = true;

    if (!dead && p.alive && s.y < 4 && Math.abs(s.z - p.z) < 6) {
      const rx0 = ox - p.px, ry0 = oy - p.py, rz0 = oz - p.pz;
      const rx1 = s.x - p.x, ry1 = s.y - p.y, rz1 = s.z - p.z;
      o[0] = rx0; o[1] = ry0; o[2] = rz0; d[0] = rx1 - rx0; d[1] = ry1 - ry0; d[2] = rz1 - rz0;
      mn[0] = pmin[0] - s.r; mn[1] = pmin[1] - s.r; mn[2] = pmin[2] - s.r;
      mx[0] = pmax[0] + s.r; mx[1] = pmax[1] + s.r; mx[2] = pmax[2] + s.r;
      if (segBox(o, d, mn, mx)) {
        const k = rz0 !== rz1 ? clamp(rz0 / (rz0 - rz1), 0, 1) : 0;
        const hy = ry0 + (ry1 - ry0) * k;
        s.hitPart = hy > 1.55 ? 'the rider' : 'the horse';
        killPlayer(s); dead = true;
      } else if (!s.near && rz0 > 0 && rz1 <= 0) {
        const k = rz0 / (rz0 - rz1);
        const lx = rx0 + (rx1 - rx0) * k, ly = ry0 + (ry1 - ry0) * k;
        const dd = Math.abs(lx);
        if (ly > -0.3 && ly < 3.6) {
          if (dd < 1.5) {
            s.near = true; G.close++; G.score += 25;
            G.pops.push({ text: dd < 0.8 ? 'CLOSE!!' : 'close', t: 0, x: W / 2 + lx * 140 * U, y: H * 0.55 });
            G.shake = Math.max(G.shake, 0.06);
          }
          if (dd < 4) sWhoosh(clamp(lx / 3, -1, 1), s.bullet);
        }
      }
    }
    if (!dead && s.y < 2.6) {
      const zlo = Math.min(oz, s.z) - 1.3, zhi = Math.max(oz, s.z) + 1.3;
      for (let j = 0; j < riders.length; j++) {
        const r = riders[j];
        if (!r.alive || r.z < zlo || r.z > zhi) continue;
        if (Math.abs(r.x - s.x) < 0.42 + s.r) {
          r.alive = false; r.tdir = s.vx > 0 ? 1 : -1; r.tumble = 0; dead = true;
          const ndz = r.z - cam.z;
          if (ndz < 400 && parts.length < 1400) for (let q = 0; q < 10; q++) parts.push({ x: r.x + rand(-0.5, 0.5), y: rand(0.2, 1.4), z: r.z, vx: rand(-2, 2), vy: rand(0, 2.5), vz: r.speed * 0.4 + rand(-1, 1), life: 0, max: rand(1, 2), size: rand(0.4, 0.9), col: [150, 125, 95], dust: 1 });
          if (ndz < 60) { sThud((r.x - cam.x) / 25, 0.5); G.pops.push({ text: 'Rider down', t: 0, wx: r.x, wz: r.z }); }
          break;
        }
      }
    }
    if (dead) { stones[i] = stones[stones.length - 1]; stones.pop(); }
  }

  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i];
    q.life += dt;
    if (q.dust) { q.vx *= 0.97; q.vz *= 0.97; q.vy = q.vy * 0.97 + 0.2 * dt; q.size += dt * 0.8; }
    else q.vy -= GRAV * dt;
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    if (q.y < 0 && !q.dust) { q.y = 0; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
    if (q.life > q.max) { parts[i] = parts[parts.length - 1]; parts.pop(); }
  }

  if (G.scenZ < p.z + 420) genScenery(G.scenZ, G.scenZ + 60);
  if (scen.length && Math.random() < 0.2) scen = scen.filter(o => o.z > cam.z - 2);

  G.warn = G.warn.filter(w => w.until > G.t);
  for (const pp of G.pops) pp.t += dt;
  G.pops = G.pops.filter(pp => pp.t < 1.2);
  G.shake = Math.max(0, G.shake - dt * 1.5);
  G.flash = Math.max(0, G.flash - dt * 1.5);

  const tx = p.x * 0.85;
  cam.x = lerp(cam.x, tx, Math.min(1, dt * 5));
  cam.z = p.z - 9 + (p.alive ? 0 : Math.min(G.deathT * 2, 3));
  cam.y = 3.6 + p.y * 0.4 + (p.alive ? Math.sin(p.phase * 2) * 0.03 : Math.min(G.deathT, 1.5));
  if (!p.alive && G.fate !== 'dead') {
    const k = clamp((G.deathT - 1.4) / 1.6, 0, 1), e = k * k * (3 - 2 * k);
    cam.x = lerp(cam.x, p.x, e); cam.z = lerp(cam.z, p.z + 0.6, e); cam.y = lerp(cam.y, 0.75 + Math.sin(G.t * 1.3) * 0.03, e);
    let zt = 1;
    if (G.fate === 'light' && (levi.phase === 'final' || levi.phase === 'cut')) zt = clamp((G.demonZ - p.z) / 260, 1, 4.5);
    G.zoom = lerp(G.zoom || 1, zt, Math.min(1, dt * 0.8));
  } else G.zoom = 1;
  if (G.shake > 0) { cam.x += rand(-1, 1) * G.shake * 0.5; cam.y += rand(-1, 1) * G.shake * 0.3; }

  if (SFX.ac) {
    const alive = riders.reduce((a, r) => a + (r.alive ? 1 : 0), 0);
    SFX.rumble.gain.value = SFX.on && G.state === 'play' ? 0.15 + 0.5 * alive / RIDERS : 0;
    SFX.wind.gain.value = SFX.on && G.state === 'play' ? 0.03 + (p.speed - 9) * 0.006 : 0;
  }
}

/* ---------------- RENDER ---------------- */



function ell(x, y, rx, ry, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, 6.2832); ctx.fill(); }
function line(x0, y0, x1, y1, w, col) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }







/* ---------------- PURE TITANS + THE UNSEEN SOLDIER ---------------- */
let titans = [], levi = { active: false };
const ARC_R = 150, SKINS = [[214, 160, 128], [198, 142, 110], [226, 178, 145], [180, 126, 96], [205, 150, 122]];
function initTitans() {
  titans = [];
  const ZR = 700;
  const ratio = th => (-ARC_R * Math.cos(th)) / (ZR - ARC_R * Math.sin(th));
  const TH_MAX = 75 * Math.PI / 180, u0 = ratio(0), u1 = ratio(TH_MAX);
  const solve = u => { let a = 0, b = TH_MAX; for (let n = 0; n < 40; n++) { const m = (a + b) / 2; if (ratio(m) < u) a = m; else b = m; } return (a + b) / 2; };
  for (let i = 0; i < 20; i++) {
    const left = i < 10, k = i % 10;
    const thL = solve(lerp(u0, u1, k / 9));
    const th = left ? thL : Math.PI - thL;
    const h = rand(13.5, 16.5);
    titans.push({
      x: -ARC_R * Math.cos(th), z: G.demonZ - ARC_R * Math.sin(th), h,
      fat: rand(0.8, 1.35), head: rand(0.085, 0.12), col: SKINS[(Math.random() * SKINS.length) | 0],
      hair: Math.random() < 0.7 ? [[40, 28, 20], [70, 50, 30], [20, 18, 16], [120, 90, 50]][(Math.random() * 4) | 0] : null,
      ph: rand(0, 6.28), grin: rand(0.5, 1), lean: rand(-0.06, 0.06),
      state: 'stand', fall: 0, fdir: -1, down: 0, steamT: 0, slash: 0, left
    });
  }
  levi = { active: false, hidden: false, order: titans.filter(t => t.left).sort((a, b) => a.x - b.x), idx: 0, x: -260, y: 6, z: G.demonZ - 180, fx: 0, fy: 0, fz: 0, t: 0, dur: 1, phase: 'wait', announced: false };
}

function updateTitans(dt) {
  for (const t of titans) {
    t.slash = Math.max(0, t.slash - dt * 2);
    if (t.state === 'falling') {
      t.fall += dt / 2.8;
      if (t.fall >= 1) {
        t.fall = 1; t.state = 'down';
        const dz = t.z - player.z;
        const delay = Math.min(Math.max(dz, 0) / 343, 5);
        nz(1.2, 'lowpass', 300, 0.5 * clamp(1 - dz / 1600, 0.2, 1), { delay, f2: 40, pan: clamp((t.x - cam.x) / 200, -1, 1) });
        tone(38, 1.2, 0.35, 'sine', delay, 22);
        const ex = t.x + t.fdir * t.h * 0.6;
        for (let i = 0; i < 26; i++) parts.push({ x: ex + rand(-t.h * 0.5, t.h * 0.5), y: rand(0, 2), z: t.z + rand(-3, 3), vx: rand(-3, 3), vy: rand(0.5, 3), vz: rand(-2, 2), life: 0, max: rand(2, 4), size: rand(3, 6), col: [175, 155, 120], dust: 1 });
      }
    } else if (t.state === 'down') {
      t.down += dt; t.steamT -= dt;
      if (t.steamT <= 0 && t.down < 40 && parts.length < 1400) {
        t.steamT = 0.25;
        parts.push({ x: t.x + t.fdir * rand(0, t.h * 0.9), y: rand(0.5, 2), z: t.z + rand(-1.5, 1.5), vx: rand(-0.5, 0.5), vy: rand(2, 4), vz: 0, life: 0, max: rand(3, 5), size: rand(2.5, 5), col: [240, 238, 232], dust: 1 });
      }
    }
  }
  const L = levi;
  if (!L.active) { if (player.z > 220) { L.active = true; L.phase = 'fly'; setLeviHop(); } return; }
  if (L.hidden || L.phase === 'cut') return;
  L.t += player.alive ? dt : dt * 1.5;
  if (L.phase === 'fly' || L.phase === 'final') {
    const k = clamp(L.t / L.dur, 0, 1);
    const e = k * k * (3 - 2 * k);
    L.x = lerp(L.sx, L.fx, e); L.z = lerp(L.sz, L.fz, e);
    L.y = lerp(L.sy, L.fy, e) + Math.sin(k * Math.PI) * 12;
    if (parts.length < 1400 && L.z - cam.z < 1400) parts.push({ x: L.x, y: L.y, z: L.z, vx: rand(-0.5, 0.5), vy: rand(-0.3, 0.3), vz: rand(-0.5, 0.5), life: 0, max: 0.9, size: 1.2, col: [245, 245, 245], dust: 1 });
    if (k >= 1) {
      if (L.phase === 'final') { startZekeCut(); return; }
      const tt = L.order[L.idx];
      tt.state = 'falling'; tt.fdir = Math.random() < 0.75 ? -1 : 1; tt.slash = 1;
      for (let i = 0; i < 18; i++) parts.push({ x: tt.x, y: tt.h * 0.84, z: tt.z + 0.6, vx: rand(-4, 4), vy: rand(-1, 4), vz: rand(-2, 2), life: 0, max: rand(1.5, 3), size: rand(1, 2.2), col: [250, 245, 240], dust: 1 });
      nz(0.15, 'highpass', 3000, 0.12 * clamp(1 - (tt.z - player.z) / 1500, 0.15, 1), { delay: Math.min((tt.z - player.z) / 343, 5) });
      if (!L.announced) { L.announced = true; G.pops.push({ text: 'A Titan on the left is falling...', t: -1.5, x: W / 2, y: H * 0.3 }); }
      L.idx++; L.phase = 'perch'; L.t = 0;
    }
  } else if (L.phase === 'perch') {
    const tt = L.order[L.idx - 1];
    L.x = tt.x; L.z = tt.z; L.y = tt.h * 0.9;
    const ridersLeft = riders.some(r => r.alive);
    if (L.idx >= L.order.length && !player.alive && ridersLeft) {
      L.wait = (L.wait || 0) + dt;
      L.killT = (L.killT || 0) - dt;
      if (L.wait > 5 && L.killT <= 0) {
        L.killT = 0.45;
        const al = riders.filter(r => r.alive), r = al[(Math.random() * al.length) | 0];
        r.alive = false; r.tumble = 0;
        for (let q = 0; q < 10; q++) parts.push({ x: r.x + rand(-0.5, 0.5), y: rand(0.2, 1.4), z: r.z, vx: rand(-2, 2), vy: rand(0, 2.5), vz: rand(-1, 1), life: 0, max: rand(1, 2), size: rand(0.4, 0.9), col: [150, 125, 95], dust: 1 });
      }
    } else if (L.t > 3.2) {
      if (L.idx < L.order.length) { L.phase = 'fly'; setLeviHop(); }
      else { L.phase = 'final'; L.t = 0; L.sx = L.x; L.sy = L.y; L.sz = L.z; L.fx = -6; L.fy = 16; L.fz = G.demonZ + 2; L.dur = 2.4; }
    }
  }
}
function setLeviHop() {
  const L = levi, tt = L.order[L.idx];
  L.t = 0; L.sx = L.x; L.sy = L.y; L.sz = L.z;
  L.fx = tt.x; L.fy = tt.h * 0.86; L.fz = tt.z + 0.8;
  L.dur = clamp(Math.hypot(L.fx - L.sx, L.fz - L.sz) / 22, 1.2, 4);
}

/* ---------------- THE BEAST IS CUT DOWN ---------------- */
let chunks = [];
function startZekeCut() {
  const m = monkey;
  m.state = 'cut'; m.t = 0; m.holding = false; m.armCut = false; m.eyesCut = false; m.legsCut = false;
  m.drop = 0; m.tip = 0; m.landed = false; m.flash = 0;
  levi.phase = 'cut'; levi.hidden = false; levi.carry = false;
  G.pops.push({ text: 'Something reached the Beast...', t: -1.5, x: W / 2, y: H * 0.3 });
}
function zekeSound(fn) { fn(Math.min(Math.max(G.demonZ - player.z, 0) / 343, 4)); }
function armPoint(h, u) {
  if (u < 0.5) { const k = u / 0.5; return [lerp(3.8, h[0], k), lerp(15, h[1], k)]; }
  const k = (u - 0.5) / 0.5; return [lerp(h[0], h[2], k), lerp(h[1], h[3], k)];
}
function updateCut(dt) {
  const m = monkey, L = levi, Z = G.demonZ;
  m.t += dt; const t = m.t;
  m.flash = Math.max(0, m.flash - dt * 3);
  const r = Math.min(1, dt * 4);
  if (!m.armCut) { m.aR = lerp(m.aR, 0.45, r); m.bR = lerp(m.bR, 0.2, r); }
  m.aL = lerp(m.aL, m.legsCut ? 1.8 + Math.sin(t * 6) * 0.4 : 0.3, r); m.bL = lerp(m.bL, m.legsCut ? 0.6 : 0.1, r);
  G.caption = '';
  const gas = () => { if (parts.length < 1400) parts.push({ x: L.x, y: L.y, z: L.z, vx: rand(-0.4, 0.4), vy: rand(-0.3, 0.3), vz: rand(-0.4, 0.4), life: 0, max: 0.8, size: 0.9, col: [245, 245, 245], dust: 1 }); };
  if (t < 2.0) {
    const h = armHand(1, m.aR, m.bR);
    const p = armPoint(h, 1 - t / 2);
    L.x = p[0] + Math.cos(t * 16) * 1.8; L.y = p[1] + Math.sin(t * 16) * 0.8; L.z = Z - 1.5 - Math.sin(t * 16) * 1.8;
    gas();
    if (Math.random() < dt * 14) m.flash = 1;
  } else if (!m.armCut) {
    m.armCut = true;
    const h = armHand(1, m.aR, m.bR);
    for (let i = 0; i < 12; i++) {
      const u0 = i / 12, u1 = (i + 1) / 12, a = armPoint(h, u0), b = armPoint(h, u1);
      chunks.push({ x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: Z - 1.5, vx: rand(-3, 3) + 1.5, vy: rand(-1, 4), vz: rand(-2.5, 2.5),
        a: Math.atan2(b[1] - a[1], b[0] - a[0]), va: rand(-2.5, 2.5), len: Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.95, th: lerp(1.9, 1.4, u0), hand: i === 11, steamT: 0, landed: false });
    }
    zekeSound(d => { nz(0.5, 'highpass', 2500, 0.25, { delay: d }); nz(0.4, 'lowpass', 900, 0.4, { delay: d + 0.1 }); });
    G.pops.push({ text: 'His arm... in pieces!', t: -1, x: W / 2, y: H * 0.34 });
  }
  if (t >= 2.0 && t < 2.6) { L.x = lerp(6, 1.5, (t - 2) / 0.6); L.y = lerp(10, 17.5, (t - 2) / 0.6); L.z = Z - 3; gas(); }
  if (t >= 2.6 && !m.eyesCut) {
    m.eyesCut = true; m.flash = 1;
    zekeSound(d => { nz(0.3, 'highpass', 3500, 0.3, { delay: d }); tone(180, 1.4, 0.25, 'sawtooth', d, 70); });
    for (let i = 0; i < 12; i++) parts.push({ x: rand(-1.2, 1.2), y: 17.3, z: Z - 3, vx: rand(-2, 2), vy: rand(-2, 2), vz: rand(-1, 1), life: 0, max: rand(1, 2), size: rand(0.5, 1), col: [140, 20, 20], g: 1 });
  }
  if (t >= 2.6 && t < 3.4) { const k = (t - 2.6) / 0.8; L.x = lerp(1.5, -3.4, k); L.y = lerp(17.5, 4.5, k); L.z = Z - 3; gas(); }
  if (t >= 3.4 && !m.legsCut) {
    m.legsCut = true; m.flash = 1;
    zekeSound(d => nz(0.4, 'highpass', 2500, 0.25, { delay: d }));
    for (const sd of [-1, 1]) for (let i = 0; i < 10; i++) parts.push({ x: sd * 3.5, y: 4.4, z: Z - 1, vx: rand(-2, 2), vy: rand(0, 3), vz: rand(-1, 1), life: 0, max: rand(2, 3), size: rand(2, 3.5), col: [240, 238, 232], dust: 1 });
  }
  if (m.legsCut) m.drop = clamp((t - 3.4) / 0.7, 0, 1);
  if (t > 3.4 && t < 7.4) { L.x = lerp(L.x, -2, dt * 2); L.y = lerp(L.y, 14 + Math.sin(t * 3) * 2, dt * 2); L.z = Z - 6; gas(); }
  if (t > 4.2) {
    const k = clamp((t - 4.2) / 1.9, 0, 1);
    m.tip = k * k;
    if (k >= 1 && !m.landed) {
      m.landed = true; G.shake = Math.max(G.shake, 0.5 * closeness() + 0.1);
      zekeSound(d => { nz(1.6, 'lowpass', 400, 0.9, { delay: d, f2: 30 }); tone(32, 1.8, 0.6, 'sine', d, 18); });
      for (let i = 0; i < 50; i++) parts.push({ x: rand(-2, 22), y: rand(0, 3), z: Z + rand(-6, 6), vx: rand(-5, 5), vy: rand(0.5, 4), vz: rand(-4, 4), life: 0, max: rand(3, 5), size: rand(4, 8), col: [175, 155, 120], dust: 1 });
    }
  }
  if (t > 5.5 && parts.length < 1400 && Math.random() < dt * 12) parts.push({ x: rand(0, 18), y: rand(1, 4), z: G.demonZ + rand(-3, 3), vx: rand(-0.5, 0.5), vy: rand(2, 5), vz: 0, life: 0, max: rand(3, 6), size: rand(4, 8), col: [240, 238, 232], dust: 1 });
  if (t > 7.4) {
    L.carry = true;
    const k = t - 7.4;
    L.x = lerp(14, 4, Math.min(k / 2, 1)); L.y = 4 + Math.min(k, 2) * 4; L.z = Z - 4;
    gas();
    G.caption = 'The Beast has fallen.';
  }
  if (t > 8.6 && !G.zekeDone) { G.zekeDone = true; G.zekeDoneT = 0; }
}

function updateChunks(dt) {
  for (const c of chunks) {
    if (!c.landed) {
      c.vy -= GRAV * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.a += c.va * dt;
      if (c.y < c.th * 0.5) {
        c.y = c.th * 0.5; c.vy = -c.vy * 0.25; c.vx *= 0.5; c.vz *= 0.5; c.va *= 0.5;
        if (Math.abs(c.vy) < 1) { c.landed = true; c.vy = 0; }
        for (let i = 0; i < 4; i++) parts.push({ x: c.x, y: 0.3, z: c.z, vx: rand(-2, 2), vy: rand(0.5, 2), vz: rand(-1, 1), life: 0, max: rand(2, 3), size: rand(2, 4), col: [175, 155, 120], dust: 1 });
      }
    } else {
      c.steamT -= dt;
      if (c.steamT <= 0 && parts.length < 1400) { c.steamT = 0.5; parts.push({ x: c.x, y: c.y, z: c.z, vx: 0, vy: rand(1.5, 3), vz: 0, life: 0, max: 3, size: rand(1.5, 3), col: [240, 238, 232], dust: 1 }); }
    }
  }
}








function drawHUD() {
  const p = player, u = U;
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${0.45 + (p.speed - 15) * 0.02})`);
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  if (G.flash > 0) { ctx.fillStyle = `rgba(160,0,0,${G.flash * 0.45})`; ctx.fillRect(0, 0, W, H); }
  if (!p.alive) {
    ctx.textAlign = 'center';
    if (G.fate === 'dead') {
      ctx.fillStyle = `rgba(0,0,0,${clamp((G.deathT - 0.4) / 1.2, 0, 1)})`; ctx.fillRect(0, 0, W, H);
      return;
    }
    const pulse = (Math.sin(G.t * (G.fate === 'serious' ? 5 : 3)) + 1) / 2;
    const rv = ctx.createRadialGradient(W / 2, H / 2, H * (G.fate === 'serious' ? 0.15 : 0.35), W / 2, H / 2, H * 0.9);
    rv.addColorStop(0, 'rgba(0,0,0,0)');
    rv.addColorStop(1, G.fate === 'serious' ? `rgba(90,0,0,${0.75 + pulse * 0.2})` : `rgba(40,0,0,${0.35 + pulse * 0.1})`);
    ctx.fillStyle = rv; ctx.fillRect(0, 0, W, H);
    if (G.fate === 'serious' && G.zekeDone) { ctx.fillStyle = `rgba(0,0,0,${clamp(G.zekeDoneT / 2, 0, 1)})`; ctx.fillRect(0, 0, W, H); }
    const lines = G.fate === 'serious'
      ? [[3, 'Can\'t... move...'], [9, 'Titans... falling? Someone is out there...'], [99, '']]
      : [[3, 'Thrown from the saddle. Still breathing.'], [9, 'Look... on the left. The Titans are going down.'], [99, '']];
    let msg = '';
    for (const [tt, s] of lines) if (G.deathT > tt - 6 && G.deathT < tt) msg = s;
    if (monkey.state === 'cut') msg = G.fate === 'serious' ? (monkey.t > 3 ? 'The stones... stopped...' : '') : (monkey.t < 2 ? 'Someone is on the Beast!' : monkey.t < 7.4 ? '' : 'He cut the Beast down.');
    if (msg && G.deathT > 2) {
      ctx.font = `italic ${20 * u}px Georgia`; ctx.fillStyle = 'rgba(240,230,210,0.9)';
      ctx.fillText(msg, W / 2, H * 0.82);
    }
    ctx.font = `${13 * u}px Georgia`; ctx.fillStyle = G.fate === 'serious' ? '#e66' : '#eb8';
    ctx.fillText(G.fate === 'serious' ? 'SERIOUSLY INJURED' : 'LIGHTLY INJURED', W / 2, H * 0.12);
    ctx.textAlign = 'left';
  }

  ctx.textBaseline = 'middle';
  const dist = Math.max(0, G.demonZ - p.z - WIN_DIST);
  const bw = W * 0.4, bx = (W - bw) / 2, by = 26 * u;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(bx - 8 * u, by - 14 * u, bw + 16 * u, 46 * u);
  ctx.fillStyle = '#3a2a1a'; ctx.fillRect(bx, by, bw, 6 * u);
  const prog = 1 - dist / (DEMON_START - WIN_DIST);
  ctx.fillStyle = '#2f6b3a'; ctx.fillRect(bx, by, bw * prog, 6 * u);
  ctx.fillStyle = '#d9c08a'; ctx.beginPath(); ctx.arc(bx + bw * prog, by + 3 * u, 6 * u, 0, 6.29); ctx.fill();
  ctx.fillStyle = '#c44'; ctx.fillRect(bx + bw - 3 * u, by - 6 * u, 6 * u, 18 * u);
  ctx.font = `${15 * u}px Georgia`; ctx.textAlign = 'center'; ctx.fillStyle = '#eee';
  ctx.fillText(`THE BEAST  ${Math.round(dist).toLocaleString()} m`, W / 2, by + 20 * u);
  if (G.caption) {
    ctx.font = `italic ${13 * u}px Georgia`;
    ctx.fillStyle = G.caption === 'THROWING' || G.caption === 'WINDING UP' ? '#f96' : '#cba';
    ctx.fillText(G.caption, W / 2, by + 44 * u);
  }

  const alive = riders.reduce((a, r) => a + (r.alive ? 1 : 0), 0);
  ctx.textAlign = 'left'; ctx.font = `${15 * u}px Georgia`;
  const tl = [`RIDERS  ${alive + (p.alive ? 1 : 0)} / ${RIDERS + 1}`, `TIME  ${fmtT(G.t)}`, `CLOSE CALLS  ${G.close}`, `SCORE  ${Math.round(G.score)}`];
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(10 * u, 10 * u, 190 * u, 92 * u);
  ctx.fillStyle = '#eee';
  tl.forEach((s, i) => ctx.fillText(s, 20 * u, (28 + i * 21) * u));

  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(10 * u, H - 62 * u, 220 * u, 52 * u);
  ctx.fillStyle = '#eee'; ctx.fillText(`${Math.round(p.speed * 3.6)} km/h`, 20 * u, H - 46 * u);
  ctx.fillStyle = '#333'; ctx.fillRect(20 * u, H - 30 * u, 200 * u, 10 * u);
  ctx.fillStyle = p.stam > 0.25 ? '#c9a24a' : '#c44'; ctx.fillRect(20 * u, H - 30 * u, 200 * u * p.stam, 10 * u);
  ctx.font = `${11 * u}px Georgia`; ctx.fillStyle = '#ccc'; ctx.fillText('STAMINA', 120 * u, H - 46 * u);

  if (G.warn.length && p.alive) {
    const w = G.warn.reduce((a, b) => a.until < b.until ? a : b);
    const eta = w.until - G.t;
    const fl = (Math.sin(G.t * (eta < 1.5 ? 30 : 12)) + 1) / 2;
    ctx.textAlign = 'center'; ctx.font = `bold ${22 * u}px Georgia`;
    ctx.fillStyle = `rgba(255,${60 + fl * 80 | 0},40,${0.6 + fl * 0.4})`;
    ctx.fillText(`INCOMING AT YOU  ${eta.toFixed(1)}s`, W / 2, H * 0.2);
  }

  if (G.radar && p.alive) {
    const rw = Math.min(W * 0.5, 520 * u), rx = (W - rw) / 2, ry = H - 30 * u, RANGE = 12, HOR_T = 1.4;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(rx, ry - 12 * u, rw, 24 * u);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (let m = -RANGE; m <= RANGE; m += 2) ctx.fillRect(rx + (m + RANGE) / (2 * RANGE) * rw, ry - 12 * u, 1, 24 * u);
    for (const s of stones) {
      if (s.delay > 0) continue;
      const rel = s.z - p.z; if (rel < 0) continue;
      const close = p.speed - s.vz; if (close <= 0) continue;
      const tc = rel / close; if (tc > HOR_T) continue;
      const y = s.y + s.vy * tc - 0.5 * GRAV * tc * tc - p.y;
      if (y < -0.5 || y > 3) continue;
      const x = s.x + s.vx * tc - p.x;
      if (Math.abs(x) > RANGE) continue;
      const a = 1 - tc / HOR_T;
      ctx.fillStyle = `rgba(255,${(200 * (1 - a)) | 0},40,${0.25 + a * 0.75})`;
      ctx.fillRect(rx + (x + RANGE) / (2 * RANGE) * rw - 1.5 * u, ry - (4 + a * 8) * u, 3 * u, (8 + a * 16) * u);
    }
    ctx.fillStyle = '#6fae7a'; ctx.fillRect(rx + rw / 2 - 0.4 / RANGE * rw / 2, ry - 14 * u, 0.8 / RANGE * rw / 2, 28 * u);
    ctx.font = `${10 * u}px Georgia`; ctx.fillStyle = '#ccc'; ctx.textAlign = 'center';
    ctx.fillText("SCOUT'S EYE  (H)", W / 2, ry - 20 * u);
  }

  ctx.textAlign = 'center';
  for (const pp of G.pops) {
    let x = pp.x, y = pp.y;
    if (pp.wx !== undefined) { if (!proj(pp.wx, 3, pp.wz)) continue; x = P.x; y = P.y; }
    const a = 1 - pp.t / 1.2;
    ctx.font = `bold ${(pp.text === 'CLOSE!!' ? 26 : 16) * u}px Georgia`;
    ctx.fillStyle = pp.text === 'Rider down' ? `rgba(230,120,100,${a})` : `rgba(255,230,140,${a})`;
    ctx.fillText(pp.text, x, y - pp.t * 40 * u);
  }
  if (G.state === 'pause') { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H); ctx.font = `${40 * u}px Georgia`; ctx.fillStyle = '#d9c08a'; ctx.fillText('PAUSED', W / 2, H / 2); }
}
const fmtT = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/* ---------------- FLOW ---------------- */
function showMenu() {
  ov.className = '';
  ov.innerHTML = `<div class="panel">
    <h1>BEAST DEMON SURVIVAL</h1>
    <div class="sub">1,500 metres of open field. One hundred and twenty riders. One Beast.</div>
    <p>Gallop straight at the 20 m Beast. His quadruped carrier hauls boulders; he crushes each into a fistful of shrapnel and hurls it at pitcher speed. One hit on you or your horse ends it. Reach him alive.</p>
    <table>
      <tr><td>A / D  &larr; &rarr;</td><td>Steer the horse (it has momentum)</td></tr>
      <tr><td>W / &uarr;</td><td>Spur: sprint (drains stamina, shifts where volleys land)</td></tr>
      <tr><td>S / &darr;</td><td>Rein in: slow down, recover stamina</td></tr>
      <tr><td>SHIFT</td><td>Side-dash burst (stamina)</td></tr>
      <tr><td>SPACE</td><td>Jump low, skipping stones (stamina)</td></tr>
      <tr><td>H / M / P</td><td>Scout's Eye radar / Mute / Pause</td></tr>
    </table>
    <p style="font-size:13px;color:#aa9">Watch the shadows racing across the grass and the red ticks on Scout's Eye: they show where stones will cross your line in the next 1.4 s. Riders ahead of you soak up stones.</p>
    <div class="btns" id="diffs"></div>
    <div class="btns"><button id="go">RIDE OUT (Enter)</button></div>
    <div class="hint">Touch: hold left or right half to steer, top of screen to sprint, two fingers to jump.</div>
  </div>`;
  const dd = document.getElementById('diffs');
  for (const k in DIFFS) {
    const b = document.createElement('button'); b.className = 'alt' + (k === diffKey ? ' sel' : ''); b.textContent = DIFFS[k].name;
    b.onclick = () => { diffKey = k; showMenu(); };
    dd.appendChild(b);
  }
  document.getElementById('go').onclick = startGame;
}
function startGame() { audioInit(); newGame(); ov.className = 'hide'; ov.innerHTML = ''; }
function togglePause() {
  if (G.state === 'play') G.state = 'pause';
  else if (G.state === 'pause') G.state = 'play';
}
function endPanel(title, body) {
  ov.className = '';
  ov.innerHTML = `<div class="panel"><h2>${title}</h2>${body}
    <div class="btns"><button id="again">RIDE AGAIN (Enter)</button><button class="alt" id="menu">MENU</button></div></div>`;
  document.getElementById('again').onclick = startGame;
  document.getElementById('menu').onclick = () => { G.state = 'menu'; showMenu(); };
}
function stats() {
  const alive = riders.filter(r => r.alive).length;
  return `<div class="stats">Distance ridden: ${Math.round(player.z)} m of ${DEMON_START - WIN_DIST}<br>
    Time: ${fmtT(G.t)} &nbsp; Close calls: ${G.close}<br>
    Stones thrown: ${G.stonesThrown.toLocaleString()}<br>
    Companions still riding: ${alive} / ${RIDERS}<br>
    Score: ${Math.round(G.score)} &nbsp; (${cfg.name})</div>`;
}
function gameOver() {
  G.state = 'over';
  const k = G.killer;
  const hit = `<p>A ${k.inch.toFixed(1)}-inch fragment hit ${k.part} at <b>${Math.round(k.kmh)} km/h</b>, ${Math.round(G.fallDist)} m from the Beast.</p>`;
  if (G.fate === 'dead') endPanel('KILLED INSTANTLY', `${hit}<p><i>You never saw what happened next.</i></p>${stats()}`);
  else if (G.fate === 'serious') endPanel('GRAVELY WOUNDED', `${hit}<p><i>Through blood and blur you saw Titans falling one after another... then the stones stopped. Someone must have killed the Beast.</i></p>${stats()}`);
  else endPanel('THROWN, BUT ALIVE', `${hit}<p><i>From the grass you watched a lone soldier cut through the Titans, take the Beast's arm apart and slash his eyes. The Beast fell.</i></p>${stats()}`);
}
function winGame(byLevi) {
  G.state = 'win';
  const alive = riders.filter(r => r.alive).length;
  G.score += 1000 + alive * 10;
  if (byLevi) endPanel('THE BEAST HAS FALLEN', `<p>You survived long enough. A lone soldier reached the Beast and cut him down.</p>${stats()}`);
  else endPanel('YOU REACHED THE BEAST', `<p>You survived the bombardment and closed to striking distance.</p>${stats()}`);
}

let last = performance.now();
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G && (G.state === 'play')) {
    const ff = !player.alive && G.fate !== 'dead' && G.deathT > 3.5 && monkey.state !== 'cut' && levi.phase !== 'final' ? 2.5 : 1;
    const sdt = dt * G.slow * ff;
    const steps = Math.ceil(sdt / 0.0085);
    for (let i = 0; i < steps; i++) { update(sdt / steps); if (G.state !== 'play') break; }
  }
  renderWorld(dt);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (G.state !== 'menu') drawHUD();
  requestAnimationFrame(frame);
}

function boot() {
  const q = new URLSearchParams(location.search);
  newGame(); G.state = 'menu';
  if (q.has('shot')) {
    if (q.has('god')) killPlayer = () => {};
    startGame();
    const T = parseFloat(q.get('shot')) || 0, die = parseFloat(q.get('die') || '-1');
    for (let t = 0; t < T; t += 1 / 60) {
      if (die >= 0 && t >= die && player.alive) { killPlayerReal({ vx: 1, vy: 0, vz: -90, r: 0.03, hitPart: 'the horse' }); G.fate = q.get('fate') || 'light'; }
      const ff = !player.alive && G.fate !== 'dead' && G.deathT > 3.5 && monkey.state !== 'cut' && levi.phase !== 'final' ? 2.5 : 1;
      for (let k = 0; k < 2; k++) update(ff / 120);
      if (G.state !== 'play') { G.state = 'play'; ov.className = 'hide'; break; }
    }
    if (q.has('freeze')) G.state = 'freeze';
  } else showMenu();
  requestAnimationFrame(frame);
}
