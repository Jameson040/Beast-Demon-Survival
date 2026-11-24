import * as PIXI from 'pixi.js';
import { ART, buildArt } from './art';
import { PUFF_LIFE, puffAlpha, puffColor, puffPosition, puffRadius } from './smoke';
import { ensureUpgradedArt, SADDLE_H, UPPM } from './horse3d';
import { ensureRiggedHorse, RIGGED } from './riggedHorse';
import { GameEngine } from './engine';
import {
  clamp,
  fogf,
  HORSE_COLS,
  HORSE_VIEWS,
  HPPM,
  lerp,
  LTELE,
  MPPM,
  rand,
  RiderEntity,
  TPPM,
} from './types';

const hex = (c: number[]) => ((c[0] | 0) << 16) | ((c[1] | 0) << 8) | (c[2] | 0);

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
  float big = fbm(w * 0.008);
  float mid = fbm(w * 0.028 + 3.0);
  float clump = fbm(w * 0.11 + 11.0);
  vec3 deep = vec3(0.24, 0.40, 0.15), meadow = vec3(0.46, 0.62, 0.22), sunlit = vec3(0.66, 0.72, 0.28);
  vec3 dry = vec3(0.74, 0.66, 0.34), dirt = vec3(0.52, 0.38, 0.22);
  vec3 c = mix(deep, meadow, mid);
  c = mix(c, sunlit, smoothstep(0.42, 0.72, clump) * 0.58);
  c = mix(c, dry, smoothstep(0.55, 0.78, big) * 0.68);
  c = mix(c, dirt, smoothstep(0.62, 0.8, fbm(w * 0.02 + 9.0)) * 0.52);
  // Worn cavalry track out of the gate, plus a pair of wheel ruts
  float road = exp(-pow(w.x / 11.0, 2.0));
  float rut = exp(-pow((abs(w.x) - 3.2) / 0.55, 2.0)) * 0.35;
  c = mix(c, dirt * vec3(1.05, 0.98, 0.9), (road * 0.42 + rut) * (1.0 - smoothstep(30.0, 1400.0, w.y)));
  // Wind across the grass. High-frequency detail fades with distance so it never becomes a screen grid.
  float wave = sin(w.y * 0.055 + w.x * 0.02 - uTime * 1.1 + mid * 4.0) * 0.5 + 0.5;
  c *= 0.9 + 0.14 * wave;
  float detail = clamp(s / 40.0, 0.0, 1.0);
  c *= mix(1.0, 0.86 + 0.28 * fbm(w * 0.22), detail);
  c += vec3(0.045, 0.032, 0.01) * wave * (1.0 - clamp(dz / 700.0, 0.0, 1.0));
  float f = clamp(1.0 - exp(-dz / 1500.0), 0.0, 0.72);
  float hz = smoothstep(0.0, 1.0, clamp((dz - 600.0) / 2500.0, 0.0, 1.0));
  c = mix(c, uHaze, max(f, hz * 0.9));
  gl_FragColor = vec4(c, 1.0);
}`;

class SpritePool {
  private p: PIXI.Container;
  private a: PIXI.Sprite[] = [];
  private i = 0;

  constructor(parent: PIXI.Container) {
    this.p = parent;
  }

  begin(): void {
    this.i = 0;
  }

  get(name: string): PIXI.Sprite {
    let s = this.a[this.i];
    if (!s) {
      s = new PIXI.Sprite();
      this.p.addChild(s);
      this.a.push(s);
    }
    this.i++;
    const m = ART.meta[name] || ART.meta.stone;
    s.texture = ART.tex[name] || ART.tex.stone;
    s.anchor.set(m.ax, m.ay);
    s.visible = true;
    s.rotation = 0;
    s.skew.set(0, 0);
    s.alpha = 1;
    s.tint = 0xffffff;
    s.blendMode = 'normal';
    s.zIndex = 0;
    return s;
  }

  end(): void {
    for (let k = this.i; k < this.a.length; k++) {
      this.a[k].visible = false;
    }
  }
}

function fogTint(dz: number): number {
  const f = fogf(dz);
  return hex([255 - (255 - 205) * f, 255 - (255 - 226) * f, 255 - (255 - 250) * f]);
}

function fogAlpha(dz: number): number {
  return 1 - fogf(dz) * 0.8;
}

function hexMul(c: number[], tint: number): number {
  const tr = (tint >> 16) & 255;
  const tg = (tint >> 8) & 255;
  const tb = tint & 255;
  const k = 1 / 236;
  return hex([clamp(c[0] * k * tr, 0, 255), clamp(c[1] * k * tg, 0, 255), clamp(c[2] * k * tb, 0, 255)]);
}

function sp(name: string, parent?: PIXI.Container): PIXI.Sprite {
  const s = new PIXI.Sprite(ART.tex[name]);
  const m = ART.meta[name];
  s.anchor.set(m.ax, m.ay);
  if (parent) parent.addChild(s);
  return s;
}

function scaleTo(s: PIXI.Sprite, name: string): void {
  const m = ART.meta[name];
  s.scale.set(1 / m.ppm);
}

function limb(s: PIXI.Sprite, name: string, x0: number, y0: number, x1: number, y1: number): void {
  const m = ART.meta[name];
  const dx = x1 - x0;
  const dy = -(y1 - y0);
  const len = Math.hypot(dx, dy);
  s.position.set(x0, -y0);
  s.rotation = Math.atan2(dy, dx) - Math.PI / 2;
  s.scale.set(1 / m.ppm, (len + (m.wd || 1)) / (m.tot || 1) / m.ppm);
}

const SCEN_TEX: ((v: number) => string)[] = [
  v => 'grass' + (v % 4),
  v => 'pebble' + (v % 4),
  v => 'treeOak' + (v & 1),
  v => 'flower' + (v % 4),
  v => 'bush' + (v % 3),
];

export class WorldRenderer {
  app: PIXI.Application | null = null;
  private destroyed = false;

  private root!: PIXI.Container;
  private sky!: PIXI.Container;
  private skySpr!: PIXI.Sprite;
  private sun!: PIXI.Sprite;
  private sunCore!: PIXI.Sprite;
  private clouds: { s: PIXI.Sprite; x: number; y: number; k: number; sp: number }[] = [];
  private mtns: PIXI.TilingSprite[] = [];
  private horizon!: PIXI.Sprite;

  private groundShader!: PIXI.Shader;
  private ground!: PIXI.Mesh<PIXI.Geometry, PIXI.Shader>;

  private decals!: PIXI.Container;
  private shadowPool!: SpritePool;
  private world!: PIXI.Container;
  private pool!: SpritePool;
  private wallMeshes: PIXI.MeshSimple[] = [];
  private foliageOpacity = new Map<number, number>();
  private lines!: PIXI.Graphics;
  private smokePool!: SpritePool;
  private smokeLayer!: PIXI.Container;
  private rays!: PIXI.Container;
  private rayS: { s: PIXI.Sprite; a: number; w: number; ph: number }[] = [];

  private fx!: PIXI.Graphics;
  private grade!: PIXI.ColorMatrixFilter;
  private blur!: PIXI.BlurFilter;
  private letter = 0;

  private B!: {
    mk: PIXI.Container;
    shin: PIXI.Sprite[];
    foot: PIXI.Sprite[];
    kneeStump: PIXI.Sprite[];
    body: PIXI.Container;
    drop: PIXI.Container;
    thigh: PIXI.Sprite[];
    upper: PIXI.Sprite[];
    fore: PIXI.Sprite[];
    hand: PIXI.Sprite[];
    torso: PIXI.Sprite;
    armStump: PIXI.Sprite;
    leftStump: PIXI.Sprite;
    held: PIXI.Sprite;
    head: PIXI.Sprite;
    eyeGlow: PIXI.Sprite;
    eye: PIXI.Sprite[];
    eyeCut: PIXI.Sprite[];
    slashes: PIXI.Sprite[];
    alpha: PIXI.AlphaFilter;
  };

  private Q!: {
    c: PIXI.Container;
    body: PIXI.Sprite;
    rocks: PIXI.Sprite[];
  };

  async init(mount: HTMLElement, width: number, height: number): Promise<void> {
    const app = new PIXI.Application();
    await app.init({
      width,
      height,
      antialias: true,
      background: 0x000000,
      resolution: 1,
      autoStart: false,
      preference: 'webgl',
      preserveDrawingBuffer: true,
    });
    if (this.destroyed) {
      app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true });
      return;
    }
    this.app = app;
    app.ticker.stop();
    app.canvas.id = 'world';
    app.canvas.className = 'bds-canvas';
    mount.insertBefore(app.canvas, mount.firstChild);

    buildArt();
    this.buildScene(width, height);
  }

  resize(width: number, height: number): void {
    if (this.app) {
      this.app.renderer.resize(width, height);
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.app) {
      if (this.app.canvas.parentElement) {
        this.app.canvas.parentElement.removeChild(this.app.canvas);
      }
      this.app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true });
      this.app = null;
    }
  }

  private buildScene(W: number, H: number): void {
    const st = this.app!.stage;
    this.root = new PIXI.Container();
    st.addChild(this.root);

    this.sky = new PIXI.Container();
    this.root.addChild(this.sky);
    this.skySpr = sp('sky', this.sky);
    this.sun = sp('glow', this.sky);
    this.sun.blendMode = 'add';
    this.sun.tint = 0xfffae8;
    this.sunCore = sp('glow', this.sky);
    this.sunCore.blendMode = 'add';
    this.sunCore.tint = 0xffffff;

    this.clouds = [];
    for (let i = 0; i < 9; i++) {
      this.clouds.push({
        s: sp('cloud' + (i % 5), this.sky),
        x: Math.random(),
        y: rand(0.08, 0.62),
        k: rand(0.6, 1.4),
        sp: rand(0.6, 1.4),
      });
    }
    this.mtns = [0, 1, 2].map(i => {
      const t = new PIXI.TilingSprite({ texture: ART.tex['mtn' + i], width: 100, height: 360 });
      this.sky.addChild(t);
      return t;
    });
    this.horizon = sp('glow', this.sky);
    this.horizon.blendMode = 'add';
    this.horizon.tint = 0xcfe6fc;

    const geom = new PIXI.Geometry({
      attributes: {
        aPosition: [0, 0, 1, 0, 1, 1, 0, 1],
        aUV: [0, 0, 1, 0, 1, 1, 0, 1],
      },
      indexBuffer: [0, 1, 2, 0, 2, 3],
    });
    this.groundShader = PIXI.Shader.from({
      gl: { vertex: GROUND_VERT, fragment: GROUND_FRAG },
      resources: {
        gu: {
          uRes: { value: [W, H], type: 'vec2<f32>' },
          uView: { value: [H * 0.36, Math.min(H * 1.15, W * 0.9), LTELE, 0], type: 'vec4<f32>' },
          uCam: { value: [0, 3.6, 0], type: 'vec3<f32>' },
          uHaze: { value: [205 / 255, 226 / 255, 250 / 255], type: 'vec3<f32>' },
          uTime: { value: 0, type: 'f32' },
        },
      },
    });
    this.ground = new PIXI.Mesh({ geometry: geom, shader: this.groundShader });
    this.root.addChild(this.ground);

    this.decals = new PIXI.Container();
    this.root.addChild(this.decals);
    this.shadowPool = new SpritePool(this.decals);

    this.world = new PIXI.Container();
    this.world.sortableChildren = true;
    this.root.addChild(this.world);
    this.pool = new SpritePool(this.world);
    this.smokeLayer = new PIXI.Container();
    this.root.addChild(this.smokeLayer);
    this.smokePool = new SpritePool(this.smokeLayer);

    this.lines = new PIXI.Graphics();
    this.root.addChild(this.lines);

    this.rays = new PIXI.Container();
    this.root.addChild(this.rays);
    this.rayS = [];
    for (let i = 0; i < 6; i++) {
      const r = sp('ray', this.rays);
      r.blendMode = 'add';
      this.rayS.push({ s: r, a: rand(-0.6, 0.6), w: rand(0.5, 1.6), ph: rand(0, 6) });
    }

    this.buildBeast();
    this.buildQuad();

    this.fx = new PIXI.Graphics();
    st.addChild(this.fx);
    this.grade = new PIXI.ColorMatrixFilter();
    this.grade.contrast(0.11, false);
    this.grade.saturate(0.1, true);
    this.blur = new PIXI.BlurFilter({ strength: 0, quality: 3 });
    this.root.filters = [this.grade];
    this.letter = 0;
  }

  private buildBeast(): void {
    const mk = new PIXI.Container();
    this.world.addChild(mk);
    const shin = [sp('mShin', mk), sp('mShin', mk)];
    const foot = [sp('mFoot', mk), sp('mFoot', mk)];
    const kneeStump = [sp('mStump', mk), sp('mStump', mk)];
    const body = new PIXI.Container();
    mk.addChild(body);
    const drop = new PIXI.Container();
    body.addChild(drop);
    const thigh = [sp('mThigh', drop), sp('mThigh', drop)];
    const upper: PIXI.Sprite[] = [sp('mUpper', drop), null as unknown as PIXI.Sprite];
    const fore: PIXI.Sprite[] = [sp('mFore', drop), null as unknown as PIXI.Sprite];
    const hand: PIXI.Sprite[] = [sp('mHand', drop), null as unknown as PIXI.Sprite];
    const torso = sp('mTorso', drop);
    upper[1] = sp('mUpper', drop);
    fore[1] = sp('mFore', drop);
    hand[1] = sp('mHand', drop);
    const armStump = sp('mStump', drop);
    const leftStump = sp('mStump', drop);
    const held = sp('boulder', drop);
    const head = sp('mHead', drop);
    const eyeGlow = sp('glow', drop);
    eyeGlow.blendMode = 'add';
    eyeGlow.tint = 0xffa020;
    const eye = [sp('mEye', drop), sp('mEye', drop)];
    const eyeCut = [sp('mEyeCut', drop), sp('mEyeCut', drop)];
    const slashes: PIXI.Sprite[] = [];
    for (let i = 0; i < 5; i++) {
      const s = sp('slash', drop);
      s.blendMode = 'add';
      slashes.push(s);
    }
    const alpha = new PIXI.AlphaFilter({ alpha: 1 });
    mk.filters = [alpha];
    this.B = {
      mk,
      shin,
      foot,
      kneeStump,
      body,
      drop,
      thigh,
      upper,
      fore,
      hand,
      torso,
      armStump,
      leftStump,
      held,
      head,
      eyeGlow,
      eye,
      eyeCut,
      slashes,
      alpha,
    };
  }

  private buildQuad(): void {
    const c = new PIXI.Container();
    this.world.addChild(c);
    this.Q = { c, body: sp('quad0', c), rocks: [sp('boulder', c), sp('boulder', c)] };
  }

  private put(name: string, x: number, y: number, scale: number, z: number): PIXI.Sprite {
    const s = this.pool.get(name);
    s.position.set(x, y);
    s.scale.set(scale);
    s.zIndex = z;
    return s;
  }

  private renderCurvedWall(eng: GameEngine): void {
    let used = 0;
    const { cam, view } = eng;
    const near = cam.z + 1;
    let wallDistance = 0;
    for (const segment of eng.wallSegments) {
      const length = Math.hypot(segment.b.x - segment.a.x, segment.b.z - segment.a.z);
      let u0 = wallDistance / 32;
      let u1 = (wallDistance + length) / 32;
      wallDistance += length;
      let ax = segment.a.x;
      let az = segment.a.z;
      let bx = segment.b.x;
      let bz = segment.b.z;
      if (az < near && bz < near) continue;
      if (az < near) {
        const t = (near - az) / (bz - az);
        ax = lerp(ax, bx, t);
        u0 = lerp(u0, u1, t);
        az = near;
      }
      if (bz < near) {
        const t = (near - bz) / (az - bz);
        bx = lerp(bx, ax, t);
        u1 = lerp(u1, u0, t);
        bz = near;
      }

      // Project both ends independently so the wall recedes along the actual map curve.
      eng.proj(ax, 0, az);
      const afx = eng.P.x;
      const afy = eng.P.y;
      eng.proj(bx, 0, bz);
      const bfx = eng.P.x;
      const bfy = eng.P.y;
      if (Math.max(afx, bfx) < -8 || Math.min(afx, bfx) > view.W + 8) continue;
      eng.proj(ax, segment.height, az);
      const atx = eng.P.x;
      const aty = eng.P.y;
      eng.proj(bx, segment.height, bz);

      let mesh = this.wallMeshes[used];
      if (!mesh) {
        mesh = new PIXI.MeshSimple({
          texture: ART.tex[segment.texture],
          vertices: new Float32Array(8),
          uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
          indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
        });
        this.world.addChild(mesh);
        this.wallMeshes.push(mesh);
      }
      used++;
      const v = mesh.vertices;
      v[0] = atx; v[1] = aty;
      v[2] = eng.P.x; v[3] = eng.P.y;
      v[4] = bfx; v[5] = bfy;
      v[6] = afx; v[7] = afy;
      mesh.geometry.getBuffer('aPosition').update();
      const uv = mesh.geometry.uvs;
      uv[0] = u0; uv[2] = u1; uv[4] = u1; uv[6] = u0;
      mesh.geometry.getBuffer('aUV').update();
      const distance = (az + bz) / 2 - cam.z;
      const tangentX = bx - ax;
      const tangentZ = bz - az;
      const light = 0.76 + 0.24 * Math.abs(tangentX) / Math.max(0.01, Math.hypot(tangentX, tangentZ));
      const tint = fogTint(distance);
      mesh.tint = hexMul([236 * light, 232 * light, 224 * light], tint);
      mesh.alpha = fogAlpha(distance);
      mesh.zIndex = -distance - 0.05;
      mesh.visible = true;
    }
    for (let i = used; i < this.wallMeshes.length; i++) this.wallMeshes[i].visible = false;
  }

  private updateBeast(eng: GameEngine): void {
    const B = this.B;
    const m = eng.monkey;
    if (!eng.proj(0, 0, eng.G.demonZ)) {
      B.mk.visible = false;
      return;
    }
    B.mk.visible = true;
    const s = eng.P.s;
    const dz = eng.P.dz;
    B.mk.position.set(eng.P.x, eng.P.y);
    B.mk.scale.set(s);
    B.mk.zIndex = -dz;
    B.alpha.alpha = fogAlpha(dz);
    const tint = fogTint(dz);
    const cut = m.state === 'cut';
    const br = cut ? 0 : Math.sin(eng.G.t * 2) * 0.15;
    const sw = cut ? 0 : Math.sin(eng.G.t * 0.9) * 0.25;

    // Ground contact shadow beneath the 20m Beast
    if (dz < 1650) {
      const sh = this.shadowPool.get('shadow');
      sh.position.set(eng.P.x, eng.P.y);
      sh.scale.set((s * 11) / 128, (s * 4.2) / 64);
      sh.alpha = 0.42 * fogAlpha(dz);
    }

    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1;
      if (m.legsCut) limb(B.shin[i], 'mShin', sd * 3.6, 4.0, sd * 3.1, 0.6);
      else limb(B.shin[i], 'mShin', sd * 3.6, 4.4, sd * 3.1, 0.6);
      B.shin[i].visible = !m.legsCut || (m.tip || 0) < 0.16;
      B.foot[i].visible = B.shin[i].visible;
      B.foot[i].position.set(sd * 3.4, -0.45);
      scaleTo(B.foot[i], 'mFoot');
      B.kneeStump[i].visible = !!m.legsCut && (m.tip || 0) < 0.22;
      B.kneeStump[i].position.set(sd * 3.6, -4.1);
      B.kneeStump[i].scale.set(1.1 / MPPM, 0.5 / MPPM);
    }

    B.body.position.set(cut ? 14 * (m.tip || 0) : 0, 0);
    B.body.rotation = cut ? (m.tip || 0) * 1.45 : 0;
    B.drop.position.set(0, cut ? (m.drop || 0) * 4.2 : 0);

    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1;
      limb(B.thigh[i], 'mThigh', sd * 2.2, 8, sd * 3.6, m.legsCut ? 4.6 : 4.4);
    }
    B.torso.position.set(sw * 0.3, -(11.8 + br));
    scaleTo(B.torso, 'mTorso');

    const arms: [number, number, number][] = [
      [-1, m.aL, m.bL],
      [1, m.aR, m.bR],
    ];
    for (let i = 0; i < 2; i++) {
      const [sd, a, b] = arms[i];
      const h = eng.armHand(sd, a, b);
      const gone = sd > 0 ? !!m.armCut : !!m.leftArmCut;
      B.upper[i].visible = B.fore[i].visible = B.hand[i].visible = !gone;
      if (!gone) {
        limb(B.upper[i], 'mUpper', sd * 3.8 + sw * 0.3, 15 + br, h[0], h[1]);
        limb(B.fore[i], 'mFore', h[0], h[1], h[2], h[3]);
        B.hand[i].position.set(h[2], -h[3]);
        scaleTo(B.hand[i], 'mHand');
      }
    }
    B.armStump.visible = !!m.armCut;
    if (m.armCut) {
      const ex = 3.8 + Math.sin(m.aR) * 1.6;
      const ey = 15 - Math.cos(m.aR) * 1.6;
      B.armStump.position.set(ex, -ey);
      B.armStump.scale.set(1 / MPPM);
    }
    B.leftStump.visible = !!m.leftArmCut;
    if (m.leftArmCut) {
      B.leftStump.position.set(-4.3, -14.1);
      B.leftStump.scale.set(1 / MPPM);
    }
    const hr = eng.armHand(1, m.aR, m.bR);
    const holding = m.holding && ((m.state === 'pick' && m.t > 0.4) || m.state === 'crush');
    B.held.visible = holding;
    if (holding) {
      if (m.state === 'crush') B.held.position.set(0.8, -8.7);
      else B.held.position.set(hr[2], -(hr[3] + 0.6));
      B.held.scale.set(2 / 176);
    }
    const hx = sw * 0.5;
    const hy = 17.3 + br;
    B.head.position.set(hx, -hy);
    scaleTo(B.head, 'mHead');

    const glow = m.state === 'windup' || m.state === 'throw' ? 1 : 0.7;
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1;
      B.eye[i].visible = !m.eyesCut;
      B.eyeCut[i].visible = !!m.eyesCut;
      B.eye[i].position.set(hx + sd * 0.62, -(hy + 0.12));
      B.eye[i].scale.set(sd / MPPM, 1 / MPPM);
      B.eye[i].rotation = sd * 0.12;
      B.eyeCut[i].position.set(hx + sd * 0.62, -(hy + 0.1));
      B.eyeCut[i].scale.set(1 / MPPM);
    }
    B.eyeGlow.visible = !m.eyesCut;
    B.eyeGlow.position.set(hx, -(hy + 0.1));
    B.eyeGlow.scale.set(3.4 / 128, 1.2 / 128);
    B.eyeGlow.alpha = 0.5 * glow + Math.sin(eng.G.t * 3) * 0.08;

    let si = 0;
    const slash = (x0: number, y0: number, x1: number, y1: number, a: number) => {
      const sl = B.slashes[si++];
      if (!sl) return;
      sl.visible = true;
      sl.alpha = a;
      sl.position.set((x0 + x1) / 2, -(y0 + y1) / 2);
      sl.rotation = Math.atan2(-(y1 - y0), x1 - x0);
      sl.scale.set(Math.hypot(x1 - x0, y1 - y0) / 512, (1 / 16) * 0.6);
    };
    if (cut && m.t < 2) {
      const h = eng.armHand(1, m.aR, m.bR);
      for (let i = 0; i < 3; i++) {
        const pt = eng.armPoint(h, Math.random());
        slash(
          pt[0] - 1.8,
          pt[1] + rand(-0.7, 0.7),
          pt[0] + 1.8,
          pt[1] + rand(-0.7, 0.7),
          0.5 + (m.flash || 0) * 0.5
        );
      }
    }
    if (m.eyesCut && m.t < 3.2) {
      slash(hx - 2.8, hy + 0.35, hx + 2.8, hy - 0.1, clamp(1 - (m.t - 2.6) / 0.6, 0, 1));
    }
    if (m.legsCut && m.t < 3.9) {
      slash(-6.5, 4.6, 6.5, 4.2, clamp(1 - (m.t - 3.4) / 0.5, 0, 1));
    }
    if (m.napeCut && m.t < 6.85) {
      slash(-2.8, 17.9, 2.8, 18.2, clamp(1 - (m.t - 6.25) / 0.6, 0, 1));
    }
    for (; si < B.slashes.length; si++) B.slashes[si].visible = false;

    for (const c of [
      B.shin[0],
      B.shin[1],
      B.foot[0],
      B.foot[1],
      B.thigh[0],
      B.thigh[1],
      B.torso,
      B.upper[0],
      B.upper[1],
      B.fore[0],
      B.fore[1],
      B.hand[0],
      B.hand[1],
      B.head,
      B.held,
    ]) {
      c.tint = tint;
    }
  }

  private updateQuadSpr(eng: GameEngine): void {
    const Q = this.Q;
    const q = eng.quad;
    if (!eng.proj(q.x, 0, eng.G.demonZ + 8)) {
      Q.c.visible = false;
      return;
    }
    Q.c.visible = true;
    Q.c.position.set(eng.P.x, eng.P.y);
    Q.c.scale.set(eng.P.s * q.dir, eng.P.s);
    Q.c.zIndex = -eng.P.dz;
    Q.c.alpha = fogAlpha(eng.P.dz);
    const f = ((Math.floor((q.phase / (Math.PI * 2)) * 6) % 6) + 6) % 6;
    Q.body.texture = ART.tex['quad' + f];
    Q.body.scale.set(1 / 32);
    Q.body.tint = fogTint(eng.P.dz);
    for (let i = 0; i < 2; i++) {
      const r = Q.rocks[i];
      r.visible = i < q.carry;
      r.position.set(-0.4 + i * 2.1 - (q.carry - 1) * 1.05, -5.0);
      r.scale.set(2 / 176);
      r.tint = fogTint(eng.P.dz);
    }
  }

  private drawRiderSprites(eng: GameEngine, o: RiderEntity): void {
    if (o.coat === undefined) o.coat = Math.max(0, HORSE_COLS.indexOf(o.col));
    if (!o.alive) {
      if (!eng.proj(o.x, 0, o.z)) return;
      const s = eng.P.s;
      const dz = eng.P.dz;
      const tint = fogTint(dz);
      const al = fogAlpha(dz);
      const ang = Math.min(o.tumble * 3, 1.45) * o.tdir;
      const h = this.put('horseFall', eng.P.x, eng.P.y, (s / HPPM) * 0.9, -dz);
      h.rotation = o.tumble < 0.5 ? ang * 0.3 : 0;
      h.tint = hexMul(o.col, tint);
      h.alpha = al;
      const rx = o.tdir * Math.min(o.tumble * 4, 1.6);
      const ry = Math.max(0.1, 1.8 - o.tumble * 4);
      const r = this.put('riderFall', eng.P.x + rx * s, eng.P.y - ry * s, s / HPPM, -dz + 0.01);
      r.rotation = o.tdir * Math.max(0, 1 - o.tumble * 2) * 1.2;
      r.tint = tint;
      r.alpha = al;
      return;
    }

    if (!eng.proj(o.x, o.y, o.z - 1.0)) return;
    const rx = eng.P.x;
    const ry = eng.P.y;
    const rs = eng.P.s;
    const dz = eng.P.dz;
    if (rs * 2.5 < 1.5) return;
    eng.proj(o.x, o.y, o.z + 1.1);
    const dx = eng.P.x - rx;
    const tint = fogTint(dz);
    const al = fogAlpha(dz);
    const f = ((Math.floor((o.phase / (Math.PI * 2)) * 8) % 8) + 8) % 8;
    const yaw = dx / rs + (1.7 * (o.vx || 0)) / Math.max(4, o.speed || 15);
    o.yawS = o.yawS === undefined ? yaw : lerp(o.yawS, yaw, 0.25);
    const vi = clamp(Math.round(o.yawS / 0.4) + 2, 0, HORSE_VIEWS.length - 1);
    const upH = eng.horseStyle === 'upgraded';
    const upR = eng.riderStyle === 'upgraded';
    // The third option is baked from the rigged 3D horse and its mounted rider.
    const rigH = eng.horseStyle === 'rigged' && ART.tex.rhorse0_0 !== undefined;
    const rigR = eng.riderStyle === 'rigged' && ART.tex.rrider0_0 !== undefined;
    const vi7 = clamp(Math.round(o.yawS / 0.27) + 3, 0, 6);
    const rigView = clamp(Math.round(o.yawS / RIGGED.step) + RIGGED.center, 0, RIGGED.views - 1);
    const rigFrame = ((Math.floor((o.phase / (Math.PI * 2)) * RIGGED.frames) % RIGGED.frames) + RIGGED.frames) % RIGGED.frames;
    const h = rigH
      ? this.put(`rhorse${rigView}_${rigFrame}`, rx, ry, rs / RIGGED.uppm, -dz)
      : upH
        ? this.put(`uhorse${vi7}_${f}`, rx, ry, rs / UPPM, -dz)
        : this.put(`horse${vi}_${f}`, rx, ry, rs / HPPM, -dz);
    if (!upH && !rigH) h.skew.x = Math.asin(clamp(-(o.yawS - HORSE_VIEWS[vi]) / 0.74, -0.3, 0.3));
    if (rigH) h.rotation = -o.lean * 0.3; // lean into turns
    if (o.stumble > 0.01) {
      h.rotation = Math.sin(eng.G.t * 36) * o.stumble * 0.16;
    }
    h.tint = hexMul(o.col, tint);
    h.alpha = al;

    const phq = (f / 8) * Math.PI * 2;
    const bob = Math.sin(phq * 2) * 0.04 + Math.sin(phq * 2 - 0.6) * 0.025;
    const sx = rx + o.yawS * 0.43 * rs;
    const sy = ry - (1.6 + bob) * rs;
    const cf = ((Math.floor((o.phase / (Math.PI * 2)) * 6 + (o.ph || 0)) % 6) + 6) % 6;
    const r = rigR
      ? this.put(`rrider${rigView}_${rigFrame}`, rx, ry, rs / RIGGED.uppm, -dz + 0.01)
      : upR
        ? this.put(`urider${vi7}_${f}`, rx, ry - SADDLE_H * rs, rs / UPPM, -dz + 0.01)
        : this.put('rider' + cf, sx, sy, (rs * 0.9) / HPPM, -dz + 0.01);
    if (rigR) {
      // Baked together with the same rig, view and frame, so the seat is exact.
      r.rotation = -o.lean * 0.35;
      r.skew.set(0, 0);
    } else if (upR) {
      r.rotation = o.lean * 0.5;
      r.skew.set(0, 0);
    } else {
      r.rotation = o.lean + Math.sin(phq * 2 + 0.4) * 0.025;
      r.skew.x = clamp(o.vx * 0.012, -0.12, 0.12) - o.yawS * 0.15;
    }
    r.tint = tint;
    r.alpha = al;

    if (dz < 260 && eng.proj(o.x, 0, o.z)) {
      const sh = this.shadowPool.get('shadow');
      sh.position.set(eng.P.x, eng.P.y);
      const liftK = clamp(1 - o.y * 0.28, 0.35, 1);
      sh.scale.set(((eng.P.s * 1.45) / 128) * liftK, ((eng.P.s * 0.62) / 64) * liftK);
      sh.alpha = 0.36 * al * liftK;
    }
  }

  render(eng: GameEngine): void {
    if (!this.app) return;
    const { W, H, HOR, F, U } = eng.view;
    const cam = eng.cam;
    const G = eng.G;
    ensureRiggedHorse();
    if (eng.horseStyle === 'upgraded' || eng.riderStyle === 'upgraded') ensureUpgradedArt();
    const yInf = HOR + (cam.y * F) / LTELE;
    const z = G.zoom || 1;
    eng.proj(0, 11, G.demonZ);
    const beastTarget = { x: eng.P.x, y: eng.P.y };

    this.root.scale.set(1);
    this.root.position.set(0, 0);
    this.root.pivot.set(0, 0);
    this.root.rotation = 0;
    if (z > 1.001 && eng.proj(0, 10, G.demonZ)) {
      const k = clamp((z - 1) / 0.6, 0, 1);
      const tx = lerp(eng.P.x, W / 2, k);
      const ty = lerp(eng.P.y, H * 0.42, k);
      this.root.scale.set(z);
      this.root.position.set(tx - eng.P.x * z, ty - eng.P.y * z);
    } else if (cam.rot) {
      this.root.pivot.set(W / 2, H / 2);
      this.root.position.set(W / 2, H / 2);
      this.root.rotation = cam.rot;
    }

    const hurt = !eng.player.alive && G.fate === 'serious' && G.deathT > 1;
    if (hurt) {
      this.blur.strength = (5 + 3 * Math.sin(G.t * 1.7)) * U;
      this.root.filters = [this.grade, this.blur];
    } else {
      this.root.filters = [this.grade];
    }

    // Sky, Sun, Clouds & Mountains
    this.skySpr.position.set(-W, -H * 0.6);
    this.skySpr.width = 3 * W;
    this.skySpr.height = yInf + H * 0.6 + 2;
    const sunX = W * 0.76 - cam.x * 0.25;
    const sunY = yInf * 0.42;
    this.sun.position.set(sunX, sunY);
    this.sun.scale.set(4.8 * U);
    this.sun.alpha = 0.46;
    this.sunCore.position.set(sunX, sunY);
    this.sunCore.scale.set(1.35 * U);
    this.sunCore.alpha = 0.96;

    for (const c of this.clouds) {
      const x = ((((c.x - cam.x * 0.0003 + G.t * 0.0015 * c.sp) % 1.4) + 1.4) % 1.4) - 0.2;
      c.s.position.set(x * W, c.y * yInf);
      c.s.scale.set(U * c.k * 1.3);
      c.s.alpha = 0.85;
    }

    const ms = [0.62, 0.48, 0.3];
    const par = [0.4, 0.9, 1.8];
    for (let i = 0; i < 3; i++) {
      const t = this.mtns[i];
      const sc = U * ms[i] * 1.2;
      t.position.set(-W, yInf - 360 * sc + 2);
      t.width = 3 * W;
      t.height = 360 * sc;
      t.tileScale.set(sc);
      t.tilePosition.x = -cam.x * par[i] * U * 2 + i * 300;
    }

    this.horizon.position.set(W / 2, yInf);
    this.horizon.scale.set((3 * W) / 128, (96 * U) / 128);
    this.horizon.alpha = 0.36;

    for (const r of this.rayS) {
      r.s.position.set(sunX, sunY);
      r.s.rotation = r.a + Math.sin(G.t * 0.1 + r.ph) * 0.05;
      r.s.scale.set(r.w * 3 * U, (H * 1.4) / 1024);
      r.s.alpha = 0.05 + Math.sin(G.t * 0.3 + r.ph) * 0.025;
    }

    // Ground Plane Shader
    const gu = (this.groundShader.resources as unknown as {
      gu: {
        uniforms: {
          uRes: number[];
          uView: number[];
          uCam: number[];
          uTime: number;
        };
      };
    }).gu.uniforms;
    gu.uRes = [W, H];
    gu.uView = [HOR, F, LTELE, 0];
    gu.uCam = [cam.x, cam.y, cam.z];
    gu.uTime = G.t;
    this.ground.scale.set(W, H);

    this.pool.begin();
    this.shadowPool.begin();
    this.renderCurvedWall(eng);

    // 0. Ground impact scuffs (crater marks from heavy shrapnel & rock crashes)
    for (const sc of eng.scuffs) {
      const dz = sc.z - cam.z;
      if (dz < 0.8 || dz > 280) continue;
      if (!eng.proj(sc.x, 0, sc.z)) continue;
      const d = this.shadowPool.get('scuff');
      d.position.set(eng.P.x, eng.P.y);
      d.scale.set((eng.P.s * sc.r) / 96, (eng.P.s * sc.r * 0.48) / 48);
      d.alpha = sc.alpha * fogAlpha(dz);
    }

    // 0b. Craters and skid marks left where shrapnel landed (they persist until they pass behind the camera)
    for (const sc of eng.scars) {
      const dz = sc.z - cam.z;
      if (dz < 0.8 || dz > 320) continue;
      if (!eng.proj(sc.x, 0, sc.z)) continue;
      const crater = sc.kind === 0;
      const dc = this.shadowPool.get(crater ? 'scar' + ((Math.floor(sc.x * 13) % 3 + 3) % 3) : 'skid');
      const w = eng.P.s * sc.r * 2.4;
      dc.position.set(eng.P.x, eng.P.y);
      dc.scale.set(w / 128, (w * (crater ? 0.6 : 0.5)) / 128);
      dc.alpha = Math.min(1, sc.a * 1.25) * fogAlpha(dz);
    }

    // 1. Monumental City Wall & Shiganshina Outskirts Structures
    for (const w of eng.walls) {
      const dz = w.z - cam.z;
      if (dz < 1 || dz > 1750) continue;
      if (!eng.proj(w.x, 0, w.z)) continue;
      const m = ART.meta[w.tex];
      if (!m) continue;
      const sc = (eng.P.s / m.ppm) * w.scale;
      const s = this.put(w.tex, eng.P.x, eng.P.y, sc, -dz);
      if (w.flip) s.scale.x *= -1;
      s.tint = fogTint(dz);
      s.alpha = fogAlpha(dz);
      // Ground shadow at wall base
      if (dz < 550) {
        const sh = this.shadowPool.get('shadow');
        const spanW = ((m.wPx || 300) / m.ppm) * w.scale;
        sh.position.set(eng.P.x - spanW * 0.08 * eng.P.s, eng.P.y);
        sh.scale.set((eng.P.s * spanW * 1.15) / 128, (eng.P.s * 6) / 64);
        sh.alpha = 0.32 * fogAlpha(dz);
      }
    }

    // 2. Meadow Flora, Grass, Wildflowers, Pebbles & Flanking Treeline
    for (const o of eng.scen) {
      const dz = o.z - cam.z;
      const maxDz = o.k === 0 || o.k === 3 ? 165 : o.k === 2 ? 920 : 520;
      if (dz < 0.6 || dz > maxDz) continue;
      if (!eng.proj(o.x, 0, o.z)) continue;
      const name = o.tex || SCEN_TEX[o.k](o.v);
      const m = ART.meta[name];
      if (!m) continue;
      const s = this.put(name, eng.P.x, eng.P.y, (eng.P.s / m.ppm) * o.s, -dz);
      if (o.f) s.scale.x *= -1;
      s.tint = fogTint(dz);
      s.alpha = fogAlpha(dz);
      if (o.k === 2 && dz < 420) {
        const sh = this.shadowPool.get('shadow');
        sh.position.set(eng.P.x - eng.P.s * 0.8 * o.s, eng.P.y);
        sh.scale.set((eng.P.s * 7.2 * o.s) / 128, (eng.P.s * 2.2 * o.s) / 64);
        sh.alpha = 0.3 * fogAlpha(dz);
      }
    }

    // 3. Collidable Field Rocks & Edge Trees (crisp contact shadows + full scale readability!)
    for (const rk of eng.rocks) {
      const dz = rk.z - cam.z;
      if (dz < 0.6 || dz > (rk.isTree ? 820 : 480)) continue;
      if (!eng.proj(rk.x, 0, rk.z)) continue;
      const m = ART.meta[rk.tex];
      if (!m) continue;
      const s = this.put(rk.tex, eng.P.x, eng.P.y, (eng.P.s / m.ppm) * rk.scale, -dz);
      if (rk.flip) s.scale.x *= -1;
      s.tint = fogTint(dz);
      s.alpha = fogAlpha(dz);

      if (rk.isTree) {
        const halfWidth = ((m.wPx || 320) / m.ppm) * rk.scale * eng.P.s * 0.44;
        const treeHeight = ((m.hPx || 560) / m.ppm) * rk.scale * eng.P.s;
        const blocksBeast = rk.z < G.demonZ &&
          Math.abs(eng.P.x - beastTarget.x) < halfWidth &&
          beastTarget.y > eng.P.y - treeHeight && beastTarget.y < eng.P.y;
        const targetOpacity = blocksBeast ? 0.28 : 1;
        const opacity = lerp(this.foliageOpacity.get(rk.id) ?? targetOpacity, targetOpacity, 0.12);
        this.foliageOpacity.set(rk.id, opacity);
        s.alpha *= opacity;
      }

      // Strong grounded contact shadow so rocks pop cleanly against sunlit grass
      if (dz < 300) {
        const sh = this.shadowPool.get('shadow');
        const sw = rk.isTree ? 6.5 * rk.scale : rk.rx * 2.55;
        const sd = rk.isTree ? 2.0 * rk.scale : rk.rz * 1.45;
        sh.position.set(eng.P.x - eng.P.s * (rk.isTree ? 0.8 : 0.24 * rk.rx), eng.P.y + eng.P.s * 0.04);
        sh.scale.set((eng.P.s * sw) / 128, (eng.P.s * sd) / 64);
        sh.alpha = (rk.isTree ? 0.34 : 0.48) * fogAlpha(dz);
      }
    }

    // 4. Companion Cavalry & Player
    for (const r of eng.riders) this.drawRiderSprites(eng, r);
    this.drawRiderSprites(eng, eng.player);

    // 5. Pure Titans Arc
    for (const t of eng.titans) {
      if (t.v === undefined) t.v = eng.titans.indexOf(t) % 8;
      if (!eng.proj(t.x, 0, t.z)) continue;
      const towardCamera = Math.sin(t.heading) * (cam.x - t.x) + Math.cos(t.heading) * (cam.z - t.z);
      const name = (towardCamera < 0 ? 'titanBack' : 'titan') + t.v;
      const s = this.put(name, eng.P.x, eng.P.y, (eng.P.s / TPPM) * (t.h / 15), -eng.P.dz);
      const facing = Math.abs(towardCamera) / Math.max(1, Math.hypot(cam.x - t.x, cam.z - t.z));
      s.scale.x *= 0.78 + 0.22 * facing;
      let ang = 0;
      let al = fogAlpha(eng.P.dz);
      if (t.state === 'falling') ang = t.fdir * t.fall * t.fall * 1.52;
      else if (t.state === 'down') {
        ang = t.fdir * 1.52;
        al *= clamp(1 - (t.down - 20) / 25, 0.25, 1);
      } else {
        ang = t.lean + Math.sin(G.t * 0.7 + t.ph) * 0.03;
      }
      s.rotation = ang;
      s.tint = fogTint(eng.P.dz);
      s.alpha = al;
      if (t.slash > 0) {
        const sl = this.put(
          'slash',
          eng.P.x + Math.sin(ang) * t.h * 0.86 * eng.P.s,
          eng.P.y - Math.cos(ang) * t.h * 0.86 * eng.P.s,
          1,
          -eng.P.dz + 0.5
        );
        sl.scale.set((7 * eng.P.s) / 512, Math.max(0.15, (1.2 * eng.P.s) / 16));
        sl.blendMode = 'add';
        sl.alpha = t.slash;
        sl.rotation = ang - 0.1;
      }
    }

    // 6. The Beast Titan, Cart Titan & Boulder Depot
    this.updateBeast(eng);
    this.updateQuadSpr(eng);
    if (eng.monkey.extracted && !eng.monkey.rescued && eng.proj(eng.levi.x + 1, eng.levi.y - 1.4, eng.levi.z)) {
      const captive = this.put('zeke', eng.P.x, eng.P.y, eng.P.s / 45, -eng.P.dz + 0.25);
      captive.tint = fogTint(eng.P.dz);
    }
    if (eng.monkey.rescued && eng.quad.x < 90 && eng.proj(eng.quad.x, 5, G.demonZ + 7)) {
      const captive = this.put('zeke', eng.P.x, eng.P.y, eng.P.s / 45, -eng.P.dz + 0.3);
      captive.tint = fogTint(eng.P.dz);
    }
    {
      const zz = G.demonZ + 12;
      for (let i = 0; i < 7; i++) {
        const x = 57 + (i % 4) * 2.1;
        const y = 1 + Math.floor(i / 4) * 1.7;
        if (!eng.proj(x, y, zz)) continue;
        const s = this.put('boulder', eng.P.x, eng.P.y, (eng.P.s * 2) / 176, -eng.P.dz);
        s.tint = fogTint(eng.P.dz);
        s.alpha = fogAlpha(eng.P.dz);
      }
      for (let i = 0; i < eng.monkey.stock; i++) {
        if (!eng.proj(8 + i * 2.2, 1, G.demonZ - 1)) continue;
        const s = this.put('boulder', eng.P.x, eng.P.y, (eng.P.s * 2) / 176, -eng.P.dz);
        s.tint = fogTint(eng.P.dz);
        s.alpha = fogAlpha(eng.P.dz);
      }
    }

    // 7. Severed Beast Arm Chunks
    for (const c of eng.chunks) {
      if (!eng.proj(c.x, c.y, c.z)) continue;
      const s = this.put(c.hand ? 'mHand' : 'mChunk', eng.P.x, eng.P.y, eng.P.s / MPPM, -eng.P.dz);
      if (!c.hand) s.scale.x = (eng.P.s / MPPM) * (c.len / 1.95);
      s.rotation = -c.a;
      s.tint = fogTint(eng.P.dz);
      s.alpha = fogAlpha(eng.P.dz);
    }

    // 8. Shrapnel: tumbling rock sprites (cosine flip fakes 3D rotation), motion streaks, ground shadows
    for (const s of eng.stones) {
      if (s.delay > 0) continue;
      if (!eng.proj(s.x, s.y, s.z)) continue;
      const x1 = eng.P.x;
      const y1 = eng.P.y;
      const sc = eng.P.s;
      const dz = eng.P.dz;
      if (dz > 1700) continue;
      const rr = Math.max(dz > 500 ? 0.9 : 1.55 * U, s.r * sc * 2.45);
      const flip = 0.45 + 0.55 * Math.abs(Math.cos(s.ax ?? 0));
      const st = this.put('shard' + (s.v % 4), x1, y1, ((rr * 2) / 96) * flip, -dz);
      st.rotation = s.az ?? 0;
      st.tint = s.r > 0.06 ? 0xe2d8ca : 0xffffff;
      st.alpha = fogAlpha(dz);
      const speed = Math.hypot(s.vx, s.vy, s.vz);
      // One continuous streak behind the rock, not a chain of leftover dots.
      if (!s.rest && speed > 12 && eng.proj(s.x - s.vx * 0.08, s.y - s.vy * 0.08, s.z - s.vz * 0.08)) {
        const ddx = x1 - eng.P.x;
        const ddy = y1 - eng.P.y;
        const len = Math.hypot(ddx, ddy);
        if (len > 4) {
          const k = this.put('streak', (x1 + eng.P.x) / 2, (y1 + eng.P.y) / 2, 1, -dz - 0.01);
          k.scale.set(len / 128, Math.max(1.2, rr * 0.35) / 16);
          k.rotation = Math.atan2(ddy, ddx);
          k.tint = 0x6a5e50;
          k.alpha = 0.55 * fogAlpha(dz);
        }
      }
      // One shadow per rock, on the ground under it, moving with it. Far volleys are many rocks, not one rock leaving a trail.
      if (!s.rest && dz < 220 && s.y < 40 && eng.proj(s.x, 0, s.z)) {
        const shd = this.shadowPool.get('shadow');
        const lift = clamp(1 - s.y / 28, 0.35, 1);
        const w = Math.max(0.55, s.r * 8 + 0.35) * eng.P.s * lift;
        shd.position.set(eng.P.x, eng.P.y);
        shd.scale.set(w / 64, (w * 0.42) / 32);
        shd.alpha = 0.55 * lift * fogAlpha(dz);
      }
    }

    // 9. Signal smoke: each canister lays a continuous plume of soft, irregular puffs along its flight.
    // Puffs billow, rise, drift on the breeze, pale with age and disperse after about 18 seconds.
    this.smokePool.begin();
    for (const p of eng.smokePuffs) {
      const age = G.t - p.born;
      if (age < 0 || age >= PUFF_LIFE) continue;
      const a = puffAlpha(age);
      if (a < 0.01) continue;
      const q = puffPosition(p, age);
      const dz = q.z - cam.z;
      if (dz < 0.8 || dz > 1400 || !eng.proj(q.x, q.y, q.z)) continue;
      const rPx = Math.max(1.2, puffRadius(p, age) * eng.P.s);
      const sp = this.smokePool.get('smoke' + (Math.floor(p.seed * 0.64) % 4));
      sp.position.set(eng.P.x, eng.P.y);
      sp.scale.set((2 * rPx) / 256);
      sp.rotation = p.seed;
      sp.tint = hex(puffColor(age));
      sp.alpha = 0.16 * a * fogAlpha(dz);
    }
    this.smokePool.end();

    // Canister heads: a small dark body with a tiny hot spot, not a glowing orb.
    for (const fl of eng.flares) {
      if (!eng.proj(fl.x, fl.y, fl.z)) continue;
      const body = this.put('stone0', eng.P.x, eng.P.y, Math.max(2.2 * U, eng.P.s * 0.1) / 40, -eng.P.dz + 0.2);
      body.tint = 0x2a3a28;
      body.rotation = fl.life * 8;
      const hot = this.put('glow', eng.P.x, eng.P.y, Math.max(1.4 * U, eng.P.s * 0.12) / 128, -eng.P.dz + 0.3);
      hot.blendMode = 'add';
      hot.tint = 0xffd9a0;
      hot.alpha = 0.5;
    }

    // 10. Particles (Dust, Steam, Stone Chips, Flare Smoke)
    for (const q of eng.parts) {
      if (!eng.proj(q.x, q.y, q.z)) continue;
      if (q.v === undefined) {
        q.v = (Math.random() * 4) | 0;
        q.rot = Math.random() * 6.28;
      }
      const a = clamp(1 - q.life / q.max, 0, 1);
      if (q.dust) {
        const rr = Math.max(1.2, q.size * eng.P.s * 0.5);
        const s = this.put('dust' + q.v, eng.P.x, eng.P.y, (rr * 2.6) / 128, -eng.P.dz);
        s.rotation = (q.rot || 0) + q.life * 0.3;
        s.tint = hex(q.col);
        const baseAl = q.flare ? 0.68 : 0.55;
        s.alpha = Math.min(1, a * 1.6) * baseAl * fogAlpha(eng.P.dz) * Math.min(1, q.life * 6);
      } else {
        const rr = Math.max(0.8, q.size * eng.P.s * 0.25);
        const s = this.put('stone0', eng.P.x, eng.P.y, (rr * 2) / 48, -eng.P.dz);
        s.rotation = q.life * 6;
        s.tint = hex(q.col);
        s.alpha = a * fogAlpha(eng.P.dz);
      }
    }

    // 11. Captain Levi & ODM Grapple Wires
    this.lines.clear();
    const levi = eng.levi;
    if (levi.active && !levi.hidden && eng.proj(levi.x, levi.y, levi.z)) {
      const lx = eng.P.x;
      const ly = eng.P.y;
      const ls = eng.P.s;
      const dz = eng.P.dz;
      const s = this.put('levi', lx, ly, Math.max(6 * U, 1.95 * ls) / 180, -dz + 0.2);
      s.rotation =
        levi.phase === 'fly' || levi.phase === 'final'
          ? G.t * 7
          : levi.phase === 'cut'
            ? G.t * 12
            : 0;
      s.tint = fogTint(dz);
      s.alpha = fogAlpha(dz);
      if (levi.carry) {
        const c = this.put('stone0', lx + 4 * U, ly + 3 * U, Math.max(4 * U, ls) / 48, -dz + 0.21);
        c.tint = 0xc8a080;
      }
      let tgt: [number, number, number] | null = null;
      if (levi.phase === 'fly') {
        const tt = levi.order[levi.idx];
        if (tt) tgt = [tt.x, tt.h * 0.85, tt.z];
      } else if (levi.phase === 'final') {
        tgt = [-6, 16, G.demonZ];
      } else if (levi.phase === 'cut' && eng.monkey.t < 7.4) {
        tgt = [rand(-4, 4), rand(6, 16), G.demonZ - 1];
      }
      if (tgt && eng.proj(tgt[0], tgt[1], tgt[2])) {
        this.lines
          .moveTo(lx, ly)
          .lineTo(eng.P.x, eng.P.y)
          .stroke({ width: Math.max(1, U), color: 0x262626, alpha: 0.58 * fogAlpha(dz) });
      }
    }

    this.pool.end();
    this.shadowPool.end();

    // Speedlines & Cinematic Letterbox Bars
    const fx = this.fx;
    fx.clear();
    // Anime Speed Dashes: dynamic wind slashes that intensify with gallop velocity
    if (eng.player.alive && eng.player.speed > 13.5 && G.state === 'play') {
      const k = clamp((eng.player.speed - 13.5) / 6.5, 0, 1);
      const count = Math.floor(12 + 20 * k);
      for (let i = 0; i < count; i++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const startX = W * 0.5 + side * (W * 0.18 + Math.random() * W * 0.36);
        const startY = Math.random() * H;
        const len = (70 + Math.random() * 200) * U * (0.6 + 0.6 * k);
        const angle = Math.atan2(startY - H * 0.45, startX - W * 0.5) + (Math.random() - 0.5) * 0.12;
        const endX = startX + Math.cos(angle) * len;
        const endY = startY + Math.sin(angle) * len;
        fx.moveTo(startX, startY).lineTo(endX, endY);
      }
      fx.stroke({
        width: Math.max(1, (1.2 + 1.6 * k) * U),
        color: 0xffffff,
        alpha: 0.12 + 0.28 * k,
      });
    }

    // Dynamic Smoke Screen Engulfment: riding directly through dense signal plumes
    if (G.smokeEngulf && G.smokeEngulf > 0.04 && eng.player.alive) {
      const gAlpha = Math.min(0.44, G.smokeEngulf * 0.48);
      fx.rect(0, 0, W, H).fill({ color: 0x1db954, alpha: gAlpha });
    }

    // 1-Frame WIT Studio Impact Flash & trauma flashes
    if (G.impactFrame && G.impactFrame > 0) {
      fx.rect(0, 0, W, H).fill({ color: 0xffffff, alpha: 0.95 });
      G.impactFrame--;
    } else if (G.flash > 0) {
      fx.rect(0, 0, W, H).fill({ color: 0x8b0000, alpha: Math.min(0.55, G.flash * 0.45) });
    } else if (G.rockFlash > 0) {
      fx.rect(0, 0, W, H).fill({ color: 0xb45309, alpha: Math.min(0.35, G.rockFlash * 0.3) });
    }

    const cine =
      eng.monkey.state === 'cut' ||
      (!eng.player.alive &&
        G.fate === 'light' &&
        (eng.levi.phase === 'final' || eng.levi.phase === 'cut'));
    this.letter = lerp(this.letter, cine ? 1 : 0, 0.04);
    if (this.letter > 0.01) {
      const bh = H * 0.1 * this.letter;
      fx.rect(0, 0, W, bh).fill({ color: 0x000000 });
      fx.rect(0, H - bh, W, bh).fill({ color: 0x000000 });
    }

    this.app.renderer.render(this.app.stage);
  }
}
