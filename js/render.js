'use strict';
/* PixiJS (WebGL) renderer. Game logic lives in game.js and is untouched by rendering;
   this file only reads state and positions GPU sprites every frame. */
let app = null;
const R = {};
const hex = c => ((c[0] | 0) << 16) | ((c[1] | 0) << 8) | (c[2] | 0);

const GROUND_VERT = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;
const GROUND_FRAG = `
precision highp float;
in vec2 vUV;
uniform vec2 uRes;
uniform vec4 uView;
uniform vec3 uCam;
uniform vec3 uHaze;
uniform float uTime;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
void main() {
  vec2 px = vUV * uRes;
  float hor = uView.x, F = uView.y, L = uView.z;
  float q = (px.y - hor) / (uCam.y * F) - 1.0 / L;
  if (q <= 0.00002) discard;
  float dz = 1.0 / q;
  float s = F * (1.0 + dz / L) / dz;
  vec2 w = vec2(uCam.x + (px.x - uRes.x * 0.5) / s, uCam.z + dz);
  float big = fbm(w * 0.012);
  float mid = fbm(w * 0.06 + 3.0);
  vec3 gA = vec3(0.33, 0.43, 0.19), gB = vec3(0.47, 0.54, 0.24), dry = vec3(0.62, 0.57, 0.33), dirt = vec3(0.47, 0.39, 0.27);
  vec3 c = mix(gA, gB, mid);
  c = mix(c, dry, smoothstep(0.5, 0.72, big) * 0.8);
  c = mix(c, dirt, smoothstep(0.66, 0.78, fbm(w * 0.035 + 9.0)) * 0.75);
  float wave = sin(w.y * 0.07 + w.x * 0.025 - uTime * 1.3 + mid * 5.0) * 0.5 + 0.5;
  c *= 0.9 + 0.16 * wave;
  float d1 = clamp(s / 25.0, 0.0, 1.0), d2 = clamp(s / 120.0, 0.0, 1.0), d3 = clamp(s / 400.0, 0.0, 1.0);
  c *= mix(1.0, 0.82 + 0.36 * fbm(w * 0.45), d1);
  c *= mix(1.0, 0.85 + 0.3 * noise(w * vec2(3.0, 9.0)), d2);
  c *= mix(1.0, 0.8 + 0.4 * noise(w * vec2(14.0, 30.0)), d3);
  float trample = exp(-pow((w.x - uCam.x * 0.0) / 60.0, 2.0)) * 0.0;
  c = mix(c, dirt, trample);
  float f = clamp(1.0 - exp(-dz / 1500.0), 0.0, 0.72);
  float hz = smoothstep(0.0, 1.0, clamp((dz - 600.0) / 2500.0, 0.0, 1.0));
  c = mix(c, uHaze, max(f, hz * 0.9));
  gl_FragColor = vec4(c, 1.0);
}`;

class Pool {
  constructor(parent) { this.p = parent; this.a = []; this.i = 0; }
  begin() { this.i = 0; }
  get(name) {
    let s = this.a[this.i];
    if (!s) { s = new PIXI.Sprite(); this.p.addChild(s); this.a.push(s); }
    this.i++;
    const m = ART.meta[name];
    s.texture = ART.tex[name]; s.anchor.set(m.ax, m.ay);
    s.visible = true; s.rotation = 0; s.skew.set(0, 0); s.alpha = 1; s.tint = 0xffffff; s.blendMode = 'normal'; s.zIndex = 0;
    return s;
  }
  end() { for (let k = this.i; k < this.a.length; k++) this.a[k].visible = false; }
}

function fogTint(dz) {
  const f = fogf(dz);
  return hex([255 - (255 - 214) * f, 255 - (255 - 200) * f, 255 - (255 - 176) * f]);
}
function fogAlpha(dz) { return 1 - fogf(dz) * 0.8; }

async function initRenderer() {
  app = new PIXI.Application();
  await app.init({ width: W, height: H, antialias: true, background: 0x000000, resolution: 1, autoStart: false, preference: 'webgl', preserveDrawingBuffer: true });
  app.ticker.stop();
  app.canvas.id = 'world';
  document.body.insertBefore(app.canvas, document.body.firstChild);
  buildArt();
  buildScene();
  window.onWorldResize = () => { app.renderer.resize(W, H); };
}

function sp(name, parent) {
  const s = new PIXI.Sprite(ART.tex[name]); const m = ART.meta[name];
  s.anchor.set(m.ax, m.ay); if (parent) parent.addChild(s); return s;
}

function buildScene() {
  const st = app.stage;
  R.root = new PIXI.Container(); st.addChild(R.root);
  R.sky = new PIXI.Container(); R.root.addChild(R.sky);
  R.skySpr = sp('sky', R.sky);
  R.sun = sp('glow', R.sky); R.sun.blendMode = 'add'; R.sun.tint = 0xffe2b0;
  R.sunCore = sp('glow', R.sky); R.sunCore.blendMode = 'add'; R.sunCore.tint = 0xfff4dc;
  R.clouds = [];
  for (let i = 0; i < 9; i++) R.clouds.push({ s: sp('cloud' + (i % 5), R.sky), x: Math.random(), y: rand(0.08, 0.62), k: rand(0.6, 1.4), sp: rand(0.6, 1.4) });
  R.mtns = [0, 1, 2].map(i => { const t = new PIXI.TilingSprite({ texture: ART.tex['mtn' + i], width: 100, height: 360 }); R.sky.addChild(t); return t; });
  R.horizon = sp('glow', R.sky); R.horizon.blendMode = 'add'; R.horizon.tint = 0xffd9a0;

  const geom = new PIXI.Geometry({ attributes: { aPosition: [0, 0, 1, 0, 1, 1, 0, 1], aUV: [0, 0, 1, 0, 1, 1, 0, 1] }, indexBuffer: [0, 1, 2, 0, 2, 3] });
  R.groundShader = PIXI.Shader.from({
    gl: { vertex: GROUND_VERT, fragment: GROUND_FRAG },
    resources: { gu: {
      uRes: { value: [W, H], type: 'vec2<f32>' }, uView: { value: [HOR, F, LTELE, 0], type: 'vec4<f32>' },
      uCam: { value: [0, 3.6, 0], type: 'vec3<f32>' }, uHaze: { value: [214 / 255, 196 / 255, 166 / 255], type: 'vec3<f32>' }, uTime: { value: 0, type: 'f32' }
    } }
  });
  R.ground = new PIXI.Mesh({ geometry: geom, shader: R.groundShader });
  R.root.addChild(R.ground);

  R.decals = new PIXI.Container(); R.root.addChild(R.decals);
  R.shadowPool = new Pool(R.decals);
  R.world = new PIXI.Container(); R.world.sortableChildren = true; R.root.addChild(R.world);
  R.pool = new Pool(R.world);
  R.lines = new PIXI.Graphics(); R.root.addChild(R.lines);
  R.rays = new PIXI.Container(); R.root.addChild(R.rays);
  R.rayS = [];
  for (let i = 0; i < 6; i++) { const r = sp('ray', R.rays); r.blendMode = 'add'; R.rayS.push({ s: r, a: rand(-0.6, 0.6), w: rand(0.5, 1.6), ph: rand(0, 6) }); }

  buildBeast(); buildQuad();

  R.fx = new PIXI.Graphics(); st.addChild(R.fx);
  R.grade = new PIXI.ColorMatrixFilter();
  R.grade.contrast(0.12, false);
  R.grade.saturate(0.1, true);
  R.blur = new PIXI.BlurFilter({ strength: 0, quality: 3 });
  R.root.filters = [R.grade];
  R.letter = 0;
}

/* ---------- the beast rig ---------- */
function buildBeast() {
  const mk = new PIXI.Container(); R.world.addChild(mk);
  const B = { mk };
  B.shin = [sp('mShin', mk), sp('mShin', mk)];
  B.foot = [sp('mFoot', mk), sp('mFoot', mk)];
  B.kneeStump = [sp('mStump', mk), sp('mStump', mk)];
  B.body = new PIXI.Container(); mk.addChild(B.body);
  B.drop = new PIXI.Container(); B.body.addChild(B.drop);
  const d = B.drop;
  B.thigh = [sp('mThigh', d), sp('mThigh', d)];
  B.upper = [sp('mUpper', d), null]; B.fore = [sp('mFore', d), null]; B.hand = [sp('mHand', d), null];
  B.torso = sp('mTorso', d);
  B.upper[1] = sp('mUpper', d); B.fore[1] = sp('mFore', d); B.hand[1] = sp('mHand', d);
  B.armStump = sp('mStump', d);
  B.held = sp('boulder', d);
  B.head = sp('mHead', d);
  B.eyeGlow = sp('glow', d); B.eyeGlow.blendMode = 'add'; B.eyeGlow.tint = 0xffa020;
  B.eye = [sp('mEye', d), sp('mEye', d)];
  B.eyeCut = [sp('mEyeCut', d), sp('mEyeCut', d)];
  B.slashes = []; for (let i = 0; i < 5; i++) { const s = sp('slash', d); s.blendMode = 'add'; B.slashes.push(s); }
  B.alpha = new PIXI.AlphaFilter({ alpha: 1 });
  mk.filters = [B.alpha];
  R.B = B;
}
function scaleTo(s, name) { const m = ART.meta[name]; s.scale.set(1 / m.ppm); }
function limb(s, name, x0, y0, x1, y1) {
  const m = ART.meta[name];
  const dx = x1 - x0, dy = -(y1 - y0), len = Math.hypot(dx, dy);
  s.position.set(x0, -y0); s.rotation = Math.atan2(dy, dx) - Math.PI / 2;
  s.scale.set(1 / m.ppm, (len + m.wd) / m.tot / m.ppm);
}
function updateBeast() {
  const B = R.B, m = monkey;
  if (!proj(0, 0, G.demonZ)) { B.mk.visible = false; return; }
  B.mk.visible = true;
  const s = P.s, dz = P.dz;
  B.mk.position.set(P.x, P.y); B.mk.scale.set(s); B.mk.zIndex = -dz;
  B.alpha.alpha = fogAlpha(dz);
  const tint = fogTint(dz);
  const cut = m.state === 'cut';
  const br = cut ? 0 : Math.sin(G.t * 2) * 0.15, sw = cut ? 0 : Math.sin(G.t * 0.9) * 0.25;
  for (let i = 0; i < 2; i++) {
    const sd = i ? 1 : -1;
    if (m.legsCut) limb(B.shin[i], 'mShin', sd * 3.6, 4.0, sd * 3.1, 0.6);
    else limb(B.shin[i], 'mShin', sd * 3.6, 4.4, sd * 3.1, 0.6);
    B.foot[i].position.set(sd * 3.4, -0.45); scaleTo(B.foot[i], 'mFoot');
    B.kneeStump[i].visible = !!m.legsCut; B.kneeStump[i].position.set(sd * 3.6, -4.1); B.kneeStump[i].scale.set(1.1 / MPPM, 0.5 / MPPM);
  }
  B.body.position.set(cut ? 14 * m.tip : 0, 0); B.body.rotation = cut ? m.tip * 1.45 : 0;
  B.drop.position.set(0, cut ? m.drop * 4.2 : 0);
  for (let i = 0; i < 2; i++) { const sd = i ? 1 : -1; limb(B.thigh[i], 'mThigh', sd * 2.2, 8, sd * 3.6, m.legsCut ? 4.6 : 4.4); }
  B.torso.position.set(sw * 0.3, -(11.8 + br)); scaleTo(B.torso, 'mTorso');
  const arms = [[-1, m.aL, m.bL], [1, m.aR, m.bR]];
  for (let i = 0; i < 2; i++) {
    const [sd, a, b] = arms[i];
    const h = armHand(sd, a, b);
    const gone = sd > 0 && m.armCut;
    B.upper[i].visible = B.fore[i].visible = B.hand[i].visible = !gone;
    if (!gone) {
      limb(B.upper[i], 'mUpper', sd * 3.8 + sw * 0.3, 15 + br, h[0], h[1]);
      limb(B.fore[i], 'mFore', h[0], h[1], h[2], h[3]);
      B.hand[i].position.set(h[2], -h[3]); scaleTo(B.hand[i], 'mHand');
    }
  }
  B.armStump.visible = !!m.armCut;
  if (m.armCut) {
    const ex = 3.8 + Math.sin(m.aR) * 1.6, ey = 15 - Math.cos(m.aR) * 1.6;
    B.armStump.position.set(ex, -ey); B.armStump.scale.set(1 / MPPM);
  }
  const hr = armHand(1, m.aR, m.bR);
  const holding = m.holding && ((m.state === 'pick' && m.t > 0.4) || m.state === 'crush');
  B.held.visible = holding;
  if (holding) {
    if (m.state === 'crush') B.held.position.set(0.8, -8.7); else B.held.position.set(hr[2], -(hr[3] + 0.6));
    B.held.scale.set(2 / 160);
  }
  const hx = sw * 0.5, hy = 17.3 + br;
  B.head.position.set(hx, -hy); scaleTo(B.head, 'mHead');
  const glow = m.state === 'windup' || m.state === 'throw' ? 1 : 0.7;
  for (let i = 0; i < 2; i++) {
    const sd = i ? 1 : -1;
    B.eye[i].visible = !m.eyesCut; B.eyeCut[i].visible = !!m.eyesCut;
    B.eye[i].position.set(hx + sd * 0.62, -(hy + 0.12)); B.eye[i].scale.set(sd / MPPM, 1 / MPPM); B.eye[i].rotation = sd * 0.12;
    B.eyeCut[i].position.set(hx + sd * 0.62, -(hy + 0.1)); B.eyeCut[i].scale.set(1 / MPPM);
  }
  B.eyeGlow.visible = !m.eyesCut; B.eyeGlow.position.set(hx, -(hy + 0.1)); B.eyeGlow.scale.set(3.4 / 128, 1.2 / 128); B.eyeGlow.alpha = 0.5 * glow + Math.sin(G.t * 3) * 0.08;
  let si = 0;
  const slash = (x0, y0, x1, y1, a) => { const s = B.slashes[si++]; if (!s) return; s.visible = true; s.alpha = a; s.position.set((x0 + x1) / 2, -(y0 + y1) / 2); s.rotation = Math.atan2(-(y1 - y0), x1 - x0); s.scale.set(Math.hypot(x1 - x0, y1 - y0) / 512, 1 / 16 * 0.6); };
  if (cut && m.t < 2) {
    const h = armHand(1, m.aR, m.bR);
    for (let i = 0; i < 3; i++) { const p = armPoint(h, Math.random()); slash(p[0] - 1.8, p[1] + rand(-0.7, 0.7), p[0] + 1.8, p[1] + rand(-0.7, 0.7), 0.5 + m.flash * 0.5); }
  }
  if (m.eyesCut && m.t < 3.2) slash(hx - 2.8, hy + 0.35, hx + 2.8, hy - 0.1, clamp(1 - (m.t - 2.6) / 0.6, 0, 1));
  if (m.legsCut && m.t < 3.9) slash(-6.5, 4.6, 6.5, 4.2, clamp(1 - (m.t - 3.4) / 0.5, 0, 1));
  for (; si < B.slashes.length; si++) B.slashes[si].visible = false;
  for (const c of [B.shin[0], B.shin[1], B.foot[0], B.foot[1], B.thigh[0], B.thigh[1], B.torso, B.upper[0], B.upper[1], B.fore[0], B.fore[1], B.hand[0], B.hand[1], B.head, B.held]) c.tint = tint;
}

function buildQuad() {
  const c = new PIXI.Container(); R.world.addChild(c);
  R.Q = { c, body: sp('quad0', c), rocks: [sp('boulder', c), sp('boulder', c)] };
}
function updateQuadSpr() {
  const Q = R.Q, q = quad;
  if (!proj(q.x, 0, G.demonZ + 8)) { Q.c.visible = false; return; }
  Q.c.visible = true;
  Q.c.position.set(P.x, P.y); Q.c.scale.set(P.s * q.dir, P.s); Q.c.zIndex = -P.dz;
  Q.c.alpha = fogAlpha(P.dz);
  const f = ((Math.floor(q.phase / (Math.PI * 2) * 6) % 6) + 6) % 6;
  Q.body.texture = ART.tex['quad' + f]; Q.body.scale.set(1 / 30); Q.body.tint = fogTint(P.dz);
  for (let i = 0; i < 2; i++) {
    const r = Q.rocks[i];
    r.visible = i < q.carry;
    r.position.set(-0.4 + i * 2.1 - (q.carry - 1) * 1.05, -5.0); r.scale.set(2 / 160); r.tint = fogTint(P.dz);
  }
}

/* ---------- per-frame ---------- */
function put(name, x, y, scale, z) {
  const s = R.pool.get(name);
  s.position.set(x, y); s.scale.set(scale); s.zIndex = z;
  return s;
}

function drawRiderSprites(o) {
  if (o.coat === undefined) o.coat = Math.max(0, HORSE_COLS.indexOf(o.col));
  if (!o.alive) {
    if (!proj(o.x, 0, o.z)) return;
    const s = P.s, dz = P.dz, tint = fogTint(dz), al = fogAlpha(dz);
    const ang = Math.min(o.tumble * 3, 1.45) * o.tdir;
    const h = put('horseFall', P.x, P.y, s / HPPM * 0.9, -dz);
    h.rotation = o.tumble < 0.5 ? ang * 0.3 : 0; h.tint = hexMul(o.col, tint); h.alpha = al;
    const rx = o.tdir * Math.min(o.tumble * 4, 1.6), ry = Math.max(0.1, 1.8 - o.tumble * 4);
    const r = put('riderFall', P.x + rx * s, P.y - ry * s, s / HPPM, -dz + 0.01);
    r.rotation = o.tdir * Math.max(0, 1 - o.tumble * 2) * 1.2; r.tint = tint; r.alpha = al;
    return;
  }
  if (!proj(o.x, o.y, o.z - 1.0)) return;
  const rx = P.x, ry = P.y, rs = P.s, dz = P.dz;
  if (rs * 2.5 < 1.5) return;
  proj(o.x, o.y, o.z + 1.1);
  const dx = P.x - rx;
  const tint = fogTint(dz), al = fogAlpha(dz);
  const f = ((Math.floor(o.phase / (Math.PI * 2) * 8) % 8) + 8) % 8;
  const yaw = dx / rs + 1.7 * (o.vx || 0) / Math.max(4, o.speed || 15);
  o.yawS = o.yawS === undefined ? yaw : lerp(o.yawS, yaw, 0.25);
  const vi = clamp(Math.round(o.yawS / 0.4) + 2, 0, HORSE_VIEWS.length - 1);
  const h = put(`horse${vi}_${f}`, rx, ry, rs / HPPM, -dz);
  h.skew.x = Math.asin(clamp(-(o.yawS - HORSE_VIEWS[vi]) / 0.74, -0.3, 0.3));
  h.tint = hexMul(o.col, tint); h.alpha = al;
  const phq = f / 8 * Math.PI * 2;
  const bob = Math.sin(phq * 2) * 0.04 + Math.sin(phq * 2 - 0.6) * 0.025;
  const sx = rx + o.yawS * 0.43 * rs, sy = ry - (1.6 + bob) * rs;
  const cf = ((Math.floor(o.phase / (Math.PI * 2) * 6 + (o.ph || 0)) % 6) + 6) % 6;
  const r = put('rider' + cf, sx, sy, rs * 0.9 / HPPM, -dz + 0.01);
  r.rotation = o.lean + Math.sin(phq * 2 + 0.4) * 0.025; r.skew.x = clamp(o.vx * 0.012, -0.12, 0.12) - o.yawS * 0.15; r.tint = tint; r.alpha = al;
  if (dz < 260 && proj(o.x, 0, o.z)) {
    const sh = R.shadowPool.get('shadow'); sh.position.set(P.x, P.y); sh.scale.set(P.s * 1.4 / 128, P.s * 0.6 / 64 * (1 - o.y * 0.2)); sh.alpha = 0.35 * al;
  }
}
function hexMul(c, tint) {
  const tr = (tint >> 16) & 255, tg = (tint >> 8) & 255, tb = tint & 255;
  const k = 1 / 236;
  return hex([clamp(c[0] * k * tr, 0, 255), clamp(c[1] * k * tg, 0, 255), clamp(c[2] * k * tb, 0, 255)]);
}

const SCEN_TEX = [v => 'grass' + v, v => 'rock' + v, v => 'tree' + (v & 1), v => 'flower' + v, v => 'bush' + (v & 1)];
function renderWorld() {
  if (!app) return;
  const yInf = HOR + cam.y * F / LTELE;
  const z = G.zoom || 1;
  R.root.scale.set(1); R.root.position.set(0, 0);
  if (z > 1.001 && proj(0, 10, G.demonZ)) {
    const k = clamp((z - 1) / 0.6, 0, 1);
    const tx = lerp(P.x, W / 2, k), ty = lerp(P.y, H * 0.42, k);
    R.root.scale.set(z); R.root.position.set(tx - P.x * z, ty - P.y * z);
  }
  const hurt = !player.alive && G.fate === 'serious' && G.deathT > 1;
  if (hurt) { R.blur.strength = (5 + 3 * Math.sin(G.t * 1.7)) * U; R.root.filters = [R.grade, R.blur]; }
  else R.root.filters = [R.grade];

  R.skySpr.position.set(-W, -H * 0.6); R.skySpr.width = 3 * W; R.skySpr.height = yInf + H * 0.6 + 2;
  const sunX = W * 0.76 - cam.x * 0.25, sunY = yInf * 0.42;
  R.sun.position.set(sunX, sunY); R.sun.scale.set(4.5 * U); R.sun.alpha = 0.45;
  R.sunCore.position.set(sunX, sunY); R.sunCore.scale.set(1.3 * U); R.sunCore.alpha = 0.95;
  for (const c of R.clouds) {
    const x = (((c.x - cam.x * 0.0003 + G.t * 0.0015 * c.sp) % 1.4) + 1.4) % 1.4 - 0.2;
    c.s.position.set(x * W, c.y * yInf); c.s.scale.set(U * c.k * 1.3); c.s.alpha = 0.85;
  }
  const ms = [0.62, 0.48, 0.3], par = [0.4, 0.9, 1.8];
  for (let i = 0; i < 3; i++) {
    const t = R.mtns[i], sc = U * ms[i] * 1.2;
    t.position.set(-W, yInf - 360 * sc + 2); t.width = 3 * W; t.height = 360 * sc;
    t.tileScale.set(sc); t.tilePosition.x = -cam.x * par[i] * U * 2 + i * 300;
  }
  R.horizon.position.set(W / 2, yInf); R.horizon.scale.set(3 * W / 128, 90 * U / 128); R.horizon.alpha = 0.35;
  for (const r of R.rayS) {
    r.s.position.set(sunX, sunY); r.s.rotation = r.a + Math.sin(G.t * 0.1 + r.ph) * 0.05;
    r.s.scale.set(r.w * 3 * U, H * 1.4 / 1024); r.s.alpha = 0.05 + Math.sin(G.t * 0.3 + r.ph) * 0.025;
  }

  const gu = R.groundShader.resources.gu.uniforms;
  gu.uRes = [W, H]; gu.uView = [HOR, F, LTELE, 0]; gu.uCam = [cam.x, cam.y, cam.z]; gu.uTime = G.t;
  R.ground.scale.set(W, H);

  R.pool.begin(); R.shadowPool.begin();
  for (const o of scen) {
    const dz = o.z - cam.z;
    if (dz < 0.6 || dz > (o.k === 0 || o.k === 3 ? 160 : 600)) continue;
    if (!proj(o.x, 0, o.z)) continue;
    const name = SCEN_TEX[o.k](o.v), m = ART.meta[name];
    const s = put(name, P.x, P.y, P.s / m.ppm * o.s, -dz);
    if (o.f) s.scale.x *= -1;
    s.tint = fogTint(dz); s.alpha = fogAlpha(dz);
  }
  for (const r of riders) drawRiderSprites(r);
  drawRiderSprites(player);

  for (const t of titans) {
    if (t.v === undefined) t.v = titans.indexOf(t) % 8;
    if (!proj(t.x, 0, t.z)) continue;
    const name = 'titan' + t.v;
    const s = put(name, P.x, P.y, P.s / TPPM * (t.h / 15), -P.dz);
    let ang = 0, al = fogAlpha(P.dz);
    if (t.state === 'falling') ang = t.fdir * t.fall * t.fall * 1.52;
    else if (t.state === 'down') { ang = t.fdir * 1.52; al *= clamp(1 - (t.down - 20) / 25, 0.25, 1); }
    else ang = t.lean + Math.sin(G.t * 0.7 + t.ph) * 0.03;
    s.rotation = ang; s.tint = fogTint(P.dz); s.alpha = al;
    if (t.slash > 0) {
      const sl = put('slash', P.x + Math.sin(ang) * t.h * 0.86 * P.s, P.y - Math.cos(ang) * t.h * 0.86 * P.s, 1, -P.dz + 0.5);
      sl.scale.set(7 * P.s / 512, Math.max(0.15, 1.2 * P.s / 16)); sl.blendMode = 'add'; sl.alpha = t.slash; sl.rotation = ang - 0.1;
    }
  }

  updateBeast();
  updateQuadSpr();
  {
    const zz = G.demonZ + 12;
    for (let i = 0; i < 7; i++) {
      const x = 57 + (i % 4) * 2.1, y = 1 + Math.floor(i / 4) * 1.7;
      if (!proj(x, y, zz)) continue;
      const s = put('boulder', P.x, P.y, P.s * 2 / 160, -P.dz); s.tint = fogTint(P.dz); s.alpha = fogAlpha(P.dz);
    }
    for (let i = 0; i < monkey.stock; i++) {
      if (!proj(8 + i * 2.2, 1, G.demonZ - 1)) continue;
      const s = put('boulder', P.x, P.y, P.s * 2 / 160, -P.dz); s.tint = fogTint(P.dz); s.alpha = fogAlpha(P.dz);
    }
  }
  for (const c of chunks) {
    if (!proj(c.x, c.y, c.z)) continue;
    const s = put(c.hand ? 'mHand' : 'mChunk', P.x, P.y, P.s / MPPM, -P.dz);
    if (!c.hand) s.scale.x = P.s / MPPM * (c.len / 1.9);
    s.rotation = -c.a; s.tint = fogTint(P.dz); s.alpha = fogAlpha(P.dz);
  }

  for (const s of stones) {
    if (s.delay > 0) continue;
    if (!proj(s.x, s.y, s.z)) continue;
    const x1 = P.x, y1 = P.y, sc = P.s, dz = P.dz;
    if (dz > 1700) continue;
    const rr = Math.max(dz > 500 ? 0.9 : 1.5 * U, s.r * sc * 2.4);
    const st = put('stone', x1, y1, rr * 2 / 40, -dz);
    st.rotation = s.life * 9; st.tint = s.r > 0.06 ? 0xd8d0c4 : 0xffffff; st.alpha = fogAlpha(dz);
    if (proj(s.x - s.vx * 0.04, s.y - s.vy * 0.04, s.z - s.vz * 0.04)) {
      const ddx = x1 - P.x, ddy = y1 - P.y, len = Math.hypot(ddx, ddy);
      if (len > 2) {
        const k = put('streak', x1, y1, 1, -dz - 0.01);
        k.scale.set(len / 128, rr * 1.8 / 16); k.rotation = Math.atan2(ddy, ddx); k.tint = 0x6a5e50; k.alpha = 0.55 * fogAlpha(dz);
      }
    }
    if (dz < 260 && s.y < 80 && proj(s.x, 0, s.z)) {
      const sh = R.shadowPool.get('shadow');
      const w = Math.max(0.2, s.r * 5) * P.s;
      sh.position.set(P.x, P.y); sh.scale.set(w / 128 * 2, w * 0.7 / 64); sh.alpha = 0.6 * (1 - s.y / 80);
    }
  }

  for (const q of parts) {
    if (!proj(q.x, q.y, q.z)) continue;
    if (q.v === undefined) { q.v = (Math.random() * 4) | 0; q.rot = Math.random() * 6.28; }
    const a = clamp(1 - q.life / q.max, 0, 1);
    if (q.dust) {
      const rr = Math.max(1.2, q.size * P.s * 0.5);
      const s = put('dust' + q.v, P.x, P.y, rr * 2.6 / 128, -P.dz);
      s.rotation = q.rot + q.life * 0.3; s.tint = hex(q.col); s.alpha = Math.min(1, a * 1.6) * 0.55 * fogAlpha(P.dz) * Math.min(1, q.life * 6);
    } else {
      const rr = Math.max(0.8, q.size * P.s * 0.25);
      const s = put('stone', P.x, P.y, rr * 2 / 40, -P.dz);
      s.rotation = q.life * 6; s.tint = hex(q.col); s.alpha = a * fogAlpha(P.dz);
    }
  }

  R.lines.clear();
  if (levi.active && !levi.hidden && proj(levi.x, levi.y, levi.z)) {
    const lx = P.x, ly = P.y, ls = P.s, dz = P.dz;
    const s = put('levi', lx, ly, Math.max(6 * U, 1.9 * ls) / 160, -dz + 0.2);
    s.rotation = levi.phase === 'fly' || levi.phase === 'final' ? G.t * 7 : levi.phase === 'cut' ? G.t * 12 : 0;
    s.tint = fogTint(dz); s.alpha = fogAlpha(dz);
    if (levi.carry) { const c = put('stone', lx + 4 * U, ly + 3 * U, Math.max(4 * U, ls) / 40, -dz + 0.21); c.tint = 0xc8a080; }
    let tgt = null;
    if (levi.phase === 'fly') { const tt = levi.order[levi.idx]; if (tt) tgt = [tt.x, tt.h * 0.85, tt.z]; }
    else if (levi.phase === 'final') tgt = [-6, 16, G.demonZ];
    else if (levi.phase === 'cut' && monkey.t < 7.4) tgt = [rand(-4, 4), rand(6, 16), G.demonZ - 1];
    if (tgt && proj(tgt[0], tgt[1], tgt[2])) {
      R.lines.moveTo(lx, ly).lineTo(P.x, P.y).stroke({ width: Math.max(1, U), color: 0x2a2a2a, alpha: 0.55 * fogAlpha(dz) });
    }
  }

  R.pool.end(); R.shadowPool.end();

  const fx = R.fx; fx.clear();
  if (player.alive && player.speed > 17 && G.state === 'play') {
    const k = (player.speed - 17) / 4;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, r0 = H * (0.42 + Math.random() * 0.2), r1 = r0 + H * (0.15 + Math.random() * 0.3);
      fx.moveTo(W / 2 + Math.cos(a) * r0 * 1.4, H * 0.5 + Math.sin(a) * r0).lineTo(W / 2 + Math.cos(a) * r1 * 1.4, H * 0.5 + Math.sin(a) * r1);
    }
    fx.stroke({ width: 1.5 * U, color: 0xfff4e0, alpha: 0.18 * k });
  }
  const cine = (monkey.state === 'cut') || (!player.alive && G.fate === 'light' && (levi.phase === 'final' || levi.phase === 'cut'));
  R.letter = lerp(R.letter, cine ? 1 : 0, 0.04);
  if (R.letter > 0.01) {
    const bh = H * 0.1 * R.letter;
    fx.rect(0, 0, W, bh).fill({ color: 0x000000 }); fx.rect(0, H - bh, W, bh).fill({ color: 0x000000 });
  }
  app.renderer.render(app.stage);
}

/* ---------- studio: isolated animation renders for video-to-video guides ---------- */
function studioFrame(mode, t, coatIdx) {
  if (!R.studio) {
    R.studio = new PIXI.Container(); app.stage.addChild(R.studio);
    R.stH = new PIXI.Sprite(); R.stR = new PIXI.Sprite(); R.stH2 = new PIXI.Sprite(); R.stR2 = new PIXI.Sprite();
    R.studio.addChild(R.stH, R.stH2, R.stR, R.stR2);
  }
  R.root.visible = false; R.fx.visible = false; R.studio.visible = true;
  app.renderer.background.color = 0xff00ff;
  const set = (s, name) => { const m = ART.meta[name]; s.texture = ART.tex[name]; s.anchor.set(m.ax, m.ay); s.visible = true; s.alpha = 1; s.rotation = 0; s.skew.set(0, 0); };
  const col = COATS[coatIdx || 0], tint = hexMul(col, 0xffffff);
  const rs = H * 0.31, gx = W / 2, gy = H * 0.94;
  const ss = x => x * x * (3 - 2 * x);
  const phase = t * 15 * 1.8;
  let yaw = 0;
  if (mode === 'turnR' || mode === 'turnL') {
    const k = t < 0.5 ? 0 : t < 1.5 ? ss((t - 0.5) / 1) : t < 2.8 ? 1 : t < 3.8 ? 1 - ss((t - 2.8) / 1) : 0;
    yaw = k * 0.8 * (mode === 'turnR' ? 1 : -1);
  }
  const f = ((Math.floor(phase / (Math.PI * 2) * 8) % 8) + 8) % 8;
  const phq = f / 8 * Math.PI * 2;
  const bob = Math.sin(phq * 2) * 0.04 + Math.sin(phq * 2 - 0.6) * 0.025;
  R.stH2.visible = false; R.stR2.visible = false;
  const vi = clamp(Math.round(yaw / 0.4) + 2, 0, 4);
  const lean = -yaw * 0.22;
  const drawUpright = (hx, hy, hs, pitch, riderOff) => {
    set(R.stH, `horse${vi}_${f}`); R.stH.position.set(hx, hy); R.stH.scale.set(hs / HPPM, hs / HPPM * (1 - pitch * 0.35)); R.stH.tint = tint;
    R.stH.skew.x = Math.asin(clamp(-(yaw - HORSE_VIEWS[vi]) / 0.74, -0.3, 0.3));
    set(R.stR, 'rider' + (((Math.floor(phase / (Math.PI * 2) * 6)) % 6 + 6) % 6));
    const ro = riderOff || { x: 0, y: 0, r: 0, s: 1 };
    R.stR.position.set(hx + yaw * 0.43 * hs + ro.x * hs, hy - (1.6 + bob) * hs * (1 - pitch * 0.35) - ro.y * hs);
    R.stR.scale.set(hs * 0.9 * ro.s / HPPM); R.stR.rotation = lean + ro.r + Math.sin(phq * 2 + 0.4) * 0.025; R.stR.tint = 0xffffff;
  };
  if (mode !== 'fall') drawUpright(gx, gy, rs, 0);
  else {
    if (t < 1.0) drawUpright(gx, gy, rs, 0);
    else if (t < 1.6) {
      const k = ss((t - 1.0) / 0.6);
      drawUpright(gx, gy + k * 0.15 * rs, rs, k, { x: 0, y: k * 0.9, r: -k * 0.5, s: 1 - k * 0.15 });
    } else {
      const k = clamp((t - 1.6) / 0.8, 0, 1), e = ss(k);
      R.stH.visible = false; R.stR.visible = false;
      set(R.stH2, 'horseFall'); R.stH2.tint = tint;
      R.stH2.position.set(gx, gy - (1 - e) * 0.5 * rs); R.stH2.scale.set(rs * 0.95 / HPPM); R.stH2.rotation = (1 - e) * 0.9 + (t > 2.4 ? Math.sin((t - 2.4) * 9) * 0.03 * Math.max(0, 1 - (t - 2.4)) : 0);
      R.stH2.alpha = 1;
      const fly = clamp((t - 1.6) / 0.9, 0, 1);
      const rx = -0.9 * fly, ry = 1.9 + 1.2 * Math.sin(fly * Math.PI) - 1.9 * fly + 0.55 * fly;
      if (fly < 1) {
        set(R.stR2, 'rider3'); R.stR2.position.set(gx + rx * rs, gy - ry * rs * 0.9); R.stR2.scale.set(rs * 0.8 / HPPM); R.stR2.rotation = -0.5 - fly * 3.2;
      } else {
        set(R.stR2, 'riderFall'); R.stR2.position.set(gx - 0.9 * rs, gy - 0.5 * rs); R.stR2.scale.set(rs * 0.85 / HPPM); R.stR2.rotation = -0.1;
      }
    }
  }
  app.renderer.render(app.stage);
  return app.canvas.toDataURL('image/png');
}
window.studioFrame = studioFrame;

function probe() {
  renderWorld();
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(app.canvas, 0, 0);
  let out = `probe W${W} H${H} sprites:${R.pool.i} shadows:${R.shadowPool.i} stones:${stones.length} parts:${parts.length}\n`;
  for (let j = 0; j < 9; j++) {
    const row = [];
    for (let i = 0; i < 12; i++) { const d = g.getImageData((i + 0.5) / 12 * W | 0, (j + 0.5) / 9 * H | 0, 1, 1).data; row.push(((d[0] >> 4).toString(16) + (d[1] >> 4).toString(16) + (d[2] >> 4).toString(16))); }
    out += row.join(' ') + '\n';
  }
  document.getElementById('err').textContent += out;
}
window.addEventListener('load', () => {
  ov.className = ''; ov.innerHTML = '<div class="panel"><h1>BEAST DEMON SURVIVAL</h1><div class="sub">Painting the battlefield...</div></div>';
  setTimeout(() => {
    initRenderer().then(() => { ov.className = 'hide'; if (location.search.includes('studio')) { newGame(); G.state = 'menu'; window.studioReady = true; return; } boot(); if (location.search.includes('probe')) setTimeout(probe, 500); }).catch(e => {
      console.error(e);
      ov.className = ''; ov.innerHTML = `<div class="panel"><h2>WebGL failed to start</h2><p>${String(e && e.message || e)}</p></div>`;
    });
  }, 30);
});
