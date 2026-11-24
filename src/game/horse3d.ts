import * as PIXI from 'pixi.js';
import { ART } from './art';
import { clamp } from './types';

/*
 * "Upgraded" horse and rider.
 *
 * These are an optional alternative to the original sprites (which stay untouched and remain the default).
 * Each horse and rider is modelled as simple 3D primitives (ellipsoids, tubes, polygons) in metres,
 * rotated around the vertical axis and rasterised once per view angle and gallop frame. Because the
 * horse and rider are generated from the same model with the same angle, a turn is a true 3D turn
 * rather than a skewed flat sprite.
 */

type V3 = [number, number, number];
type RGB = [number, number, number];
type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

export const UPPM = 120; // texture pixels per metre
export const SADDLE_H = 1.6; // saddle height above ground in metres
export const UPGRADED_VIEWS = 7;
export const UPGRADED_FRAMES = 8;
export const UPGRADED_VIEW_STEP = 0.33; // radians between view angles

const HW = 380;
const HH = 400;
const HGX = 190; // horse ground origin in its texture
const HGY = 372;
const RW = 150;
const RH = 200;
const RGX = 75; // rider saddle origin in its texture
const RGY = 124;
const TAU = Math.PI * 2;
const BASE: RGB = [238, 230, 220];

const CANVASES: Record<string, HTMLCanvasElement> = {};
let built = false;

function cnv(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const css = (c: RGB, k = 1, a = 1): string =>
  `rgba(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0},${a})`;

interface Frame {
  a: number;
  ox: number;
  oy: number;
}

function rot(p: V3, a: number): V3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}

// Returns screen x, screen y and depth (larger depth = further from the camera).
function proj(p: V3, F: Frame): V3 {
  const q = rot(p, F.a);
  return [F.ox + q[0] * UPPM, F.oy - q[1] * UPPM, q[2]];
}

function hull(points: Pt[]): Pt[] {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function tracePath(g: Ctx, pts: Pt[]): void {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

interface DrawPart {
  z: number;
  draw: (g: Ctx) => void;
}

// Collects primitives for one image, then paints them far-to-near.
class Scene {
  private parts: DrawPart[] = [];

  constructor(private F: Frame) {}

  ellipsoid(c: V3, r: V3, col: RGB): void {
    const F = this.F;
    const cp = proj(c, F);
    const rad = Math.max(r[0], r[1], r[2]) * UPPM;
    const samples: Pt[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = -Math.PI / 2 + (i / 8) * Math.PI;
      for (let j = 0; j < 14; j++) {
        const v = (j / 14) * TAU;
        const q = proj(
          [c[0] + r[0] * Math.cos(u) * Math.cos(v), c[1] + r[1] * Math.sin(u), c[2] + r[2] * Math.cos(u) * Math.sin(v)],
          F
        );
        samples.push([q[0], q[1]]);
      }
    }
    const outline = hull(samples);
    this.parts.push({
      z: cp[2],
      draw: g => {
        // Sunlit from the upper right, like the rest of the valley.
        const gr = g.createRadialGradient(
          cp[0] + rad * 0.38,
          cp[1] - rad * 0.42,
          rad * 0.05,
          cp[0],
          cp[1],
          rad * 1.1
        );
        gr.addColorStop(0, css(mix(col, [255, 252, 246], 0.6)));
        gr.addColorStop(0.5, css(col));
        gr.addColorStop(1, css(col, 0.5));
        g.fillStyle = gr;
        tracePath(g, outline);
        g.fill();
        g.strokeStyle = 'rgba(36,22,12,0.25)';
        g.lineWidth = 1.2;
        g.stroke();
      },
    });
  }

  tube(pts: V3[], rad: number[], col: RGB): void {
    const q = pts.map(p => proj(p, this.F));
    const z = q.reduce((s, p) => s + p[2], 0) / q.length;
    this.parts.push({
      z,
      draw: g => {
        g.lineCap = 'round';
        g.lineJoin = 'round';
        for (let i = 0; i < q.length - 1; i++) {
          const w = (rad[i] + rad[i + 1]) * UPPM;
          const a = q[i];
          const b = q[i + 1];
          const seg = (color: string, width: number, dx = 0) => {
            g.strokeStyle = color;
            g.lineWidth = width;
            g.beginPath();
            g.moveTo(a[0] + dx, a[1]);
            g.lineTo(b[0] + dx, b[1]);
            g.stroke();
          };
          seg(css(col, 0.5), w + 2.5);
          seg(css(col), w);
          seg(css(mix(col, [255, 250, 240], 0.55)), w * 0.32, -w * 0.2);
        }
      },
    });
  }

  poly(pts: V3[], col: RGB): void {
    const q = pts.map(p => proj(p, this.F));
    const z = q.reduce((s, p) => s + p[2], 0) / q.length;
    this.parts.push({
      z,
      draw: g => {
        tracePath(g, q.map(p => [p[0], p[1]] as Pt));
        g.fillStyle = css(col);
        g.fill();
        g.strokeStyle = 'rgba(30,18,10,0.3)';
        g.lineWidth = 1;
        g.stroke();
      },
    });
  }

  custom(z: number, draw: (g: Ctx) => void): void {
    this.parts.push({ z, draw });
  }

  flush(g: Ctx): void {
    this.parts.sort((a, b) => b.z - a.z);
    for (const p of this.parts) p.draw(g);
  }
}

function drawHorse(ph: number, a: number): HTMLCanvasElement {
  const c = cnv(HW, HH);
  const g = c.getContext('2d')!;
  const S = new Scene({ a, ox: HGX, oy: HGY });
  const bob = Math.sin(ph * 2) * 0.04 + Math.sin(ph * 2 - 0.6) * 0.025;
  const B = (y: number) => y + bob;
  const LEG: RGB = [214, 204, 192];
  const HOOF: RGB = [46, 33, 25];
  const MANE: RGB = [60, 40, 26];
  const TAIL: RGB = [66, 44, 28];
  const SADDLE_CLOTH: RGB = [70, 88, 60];
  const LEATHER: RGB = [96, 58, 32];

  // Gallop: hind pair leads, front pair follows. Each leg is hip -> knee -> hoof.
  const legs = [
    { x: -0.2, z: 0.52, off: 1.6 },
    { x: 0.2, z: 0.52, off: 2.4 },
    { x: -0.2, z: -0.6, off: 0 },
    { x: 0.2, z: -0.6, off: 0.7 },
  ];
  for (const L of legs) {
    const p = ph + L.off;
    const reach = 0.28 * Math.sin(p);
    const lift = 0.22 * Math.max(0, Math.cos(p));
    const hip: V3 = [L.x, B(1.14), L.z];
    const knee: V3 = [L.x, 0.56 + 0.1 * Math.max(0, Math.cos(p)), L.z + 0.5 * reach];
    const hoof: V3 = [L.x, 0.035 + lift, L.z + reach];
    S.tube([hip, knee, hoof], [0.15, 0.095, 0.065], LEG);
    S.ellipsoid(hoof, [0.07, 0.045, 0.07], HOOF);
  }

  // Barrel: chest, belly and hindquarters.
  S.ellipsoid([0, B(1.16), 0.5], [0.34, 0.33, 0.42], BASE);
  S.ellipsoid([0, B(1.16), -0.06], [0.38, 0.36, 0.52], BASE);
  S.ellipsoid([0, B(1.2), -0.66], [0.36, 0.36, 0.4], BASE);

  // Saddlecloth and saddle.
  S.ellipsoid([0, B(1.44), 0.02], [0.36, 0.05, 0.5], SADDLE_CLOTH);
  S.ellipsoid([0, B(1.52), 0.05], [0.3, 0.09, 0.36], LEATHER);

  // Neck, skull, muzzle and ears.
  // Neck as a densely overlapping, tapering chain so it reads as one muscular curve.
  for (let i = 0; i <= 6; i++) {
    const k = i / 6;
    const r = 0.23 - 0.1 * k;
    S.ellipsoid([0, B(1.38 + 0.62 * k), 0.6 + 0.6 * k], [r * 0.85, r, r * 1.2], BASE);
  }
  S.ellipsoid([0, B(2.08), 1.36], [0.11, 0.13, 0.22], BASE);
  S.ellipsoid([0, B(2.0), 1.64], [0.085, 0.09, 0.17], BASE);
  for (const sd of [-1, 1]) {
    S.poly(
      [
        [sd * 0.07, B(2.18), 1.3],
        [sd * 0.015, B(2.18), 1.27],
        [sd * 0.045, B(2.36), 1.22],
      ],
      MANE
    );
  }

  // Tail, swaying with the gallop.
  for (const dx of [-0.03, 0, 0.03]) {
    const pts: V3[] = [];
    for (let t = 0; t <= 3; t++) {
      const k = t / 3;
      pts.push([dx + 0.07 * Math.sin(ph + k * 2) * k, B(1.32) - 0.9 * k, -1.0 - 0.38 * k]);
    }
    S.tube(pts, [0.05, 0.05, 0.04, 0.025], TAIL);
  }

  // Mane along the crest of the neck.
  const manePts: V3[] = [];
  for (let t = 0; t <= 4; t++) {
    const k = t / 4;
    manePts.push([0.03 * Math.sin(ph + k * 3) * k, B(1.56 + 0.4 * k), 0.6 + 0.5 * k]);
  }
  S.tube(manePts, [0.03, 0.05, 0.06, 0.06, 0.05], MANE);

  S.flush(g);
  return c;
}

function drawRider(ph: number, a: number): HTMLCanvasElement {
  const c = cnv(RW, RH);
  const g = c.getContext('2d')!;
  const F: Frame = { a, ox: RGX, oy: RGY };
  const S = new Scene(F);
  const bob = Math.sin(ph * 2) * 0.04 + Math.sin(ph * 2 - 0.6) * 0.025;
  const Y = (y: number) => y + bob;
  const JACKET: RGB = [140, 96, 56];
  const BREECH: RGB = [226, 218, 202];
  const BOOT: RGB = [40, 28, 20];
  const SKIN: RGB = [218, 176, 140];
  const HAIR: RGB = [72, 48, 30];
  const STEEL: RGB = [164, 170, 180];

  // Legs astride the horse, boots, and steel ODM hip canisters.
  for (const sd of [-1, 1]) {
    S.tube(
      [
        [sd * 0.12, Y(0.02), 0],
        [sd * 0.3, Y(-0.3), 0.2],
        [sd * 0.31, Y(-0.5), 0.2],
      ],
      [0.085, 0.07, 0.065],
      BREECH
    );
    S.tube(
      [
        [sd * 0.31, Y(-0.42), 0.2],
        [sd * 0.31, Y(-0.6), 0.2],
      ],
      [0.085, 0.09],
      BOOT
    );
    S.ellipsoid([sd * 0.25, Y(0.02), -0.03], [0.03, 0.09, 0.05], STEEL);
  }

  // Pelvis, torso in the tan Survey Corps jacket.
  S.ellipsoid([0, Y(0.04), 0], [0.18, 0.1, 0.13], BREECH);
  S.ellipsoid([0, Y(0.36), 0], [0.19, 0.27, 0.13], JACKET);

  // Arms holding the reins, hands forward.
  for (const sd of [-1, 1]) {
    S.tube(
      [
        [sd * 0.2, Y(0.52), -0.02],
        [sd * 0.28, Y(0.32), 0.1],
        [sd * 0.14, Y(0.22), 0.2],
      ],
      [0.05, 0.042, 0.036],
      JACKET
    );
    S.ellipsoid([sd * 0.14, Y(0.22), 0.2], [0.04, 0.035, 0.035], SKIN);
  }

  // Neck, hair (seen from behind), and a little face on the far side.
  S.tube(
    [
      [0, Y(0.52), 0],
      [0, Y(0.66), 0.02],
    ],
    [0.05, 0.05],
    SKIN
  );
  S.ellipsoid([0, Y(0.76), 0], [0.115, 0.13, 0.12], HAIR);
  S.ellipsoid([0, Y(0.72), 0.085], [0.085, 0.095, 0.05], SKIN);

  // Billowing emerald Survey Corps cloak, hanging from the shoulders behind the rider.
  const capeTop: V3[] = [
    [-0.2, Y(0.6), -0.1],
    [0.2, Y(0.6), -0.1],
  ];
  const hem: V3[] = [];
  for (let i = 0; i <= 8; i++) {
    const k = i / 8;
    const flutter = Math.sin(ph + k * 4.2);
    hem.push([
      0.24 - 0.48 * k + 0.025 * flutter,
      Y(0.05 + 0.03 * Math.sin(ph + k * 3.1)),
      -0.14 - 0.08 * Math.sin(Math.PI * k) + 0.03 * flutter,
    ]);
  }
  const cq = [...capeTop, ...hem].map(p => proj(p, F));
  const capeZ = cq.reduce((s, p) => s + p[2], 0) / cq.length;
  S.custom(capeZ, gc => {
    const minY = Math.min(...cq.map(p => p[1]));
    const maxY = Math.max(...cq.map(p => p[1]));
    const grad = gc.createLinearGradient(0, minY, 0, maxY);
    grad.addColorStop(0, '#2f7a43');
    grad.addColorStop(0.6, '#25663a');
    grad.addColorStop(1, '#183f27');
    gc.fillStyle = grad;
    tracePath(gc, cq.map(p => [p[0], p[1]] as Pt));
    gc.fill();
    gc.strokeStyle = 'rgba(12,40,20,0.5)';
    gc.lineWidth = 1.3;
    gc.stroke();
    gc.strokeStyle = 'rgba(12,44,22,0.45)';
    gc.lineWidth = 2.2;
    const topMid: Pt = [(cq[0][0] + cq[1][0]) / 2, (cq[0][1] + cq[1][1]) / 2];
    for (const i of [2, 4, 6]) {
      gc.beginPath();
      gc.moveTo(topMid[0], topMid[1]);
      gc.lineTo(cq[2 + i][0], cq[2 + i][1]);
      gc.stroke();
    }
    gc.strokeStyle = 'rgba(140,210,150,0.35)';
    gc.lineWidth = 2;
    gc.beginPath();
    gc.moveTo(cq[1][0], cq[1][1]);
    gc.lineTo(cq[2][0], cq[2][1]);
    gc.stroke();
  });

  // Wings of Freedom emblem on the cloak.
  const E = (x: number, y: number): V3 => [x, Y(y), -0.2];
  S.poly([E(-0.075, 0.47), E(0.075, 0.47), E(0.05, 0.36), E(0, 0.31), E(-0.05, 0.36)], [240, 236, 226]);
  S.poly([E(-0.075, 0.47), E(0, 0.47), E(0, 0.31), E(-0.05, 0.36)], [58, 92, 156]);
  S.poly([E(-0.02, 0.42), E(-0.16, 0.5), E(-0.12, 0.39), E(-0.04, 0.38)], [236, 232, 222]);
  S.poly([E(0.02, 0.42), E(0.16, 0.5), E(0.12, 0.39), E(0.04, 0.38)], [236, 232, 222]);

  S.flush(g);
  return c;
}

function register(name: string, c: HTMLCanvasElement, ax: number, ay: number): void {
  CANVASES[name] = c;
  ART.tex[name] = new PIXI.Texture({
    source: new PIXI.CanvasSource({ resource: c, autoGenerateMipmaps: true }),
  });
  ART.meta[name] = { ppm: UPPM, ax, ay, wPx: c.width, hPx: c.height };
}

/** Paints the upgraded horse and rider once, on first use. */
export function ensureUpgradedArt(): void {
  if (built) return;
  built = true;
  for (let v = 0; v < UPGRADED_VIEWS; v++) {
    const a = (v - 3) * UPGRADED_VIEW_STEP;
    for (let f = 0; f < UPGRADED_FRAMES; f++) {
      const ph = (f / UPGRADED_FRAMES) * TAU;
      register(`uhorse${v}_${f}`, drawHorse(ph, a), HGX / HW, HGY / HH);
      register(`urider${v}_${f}`, drawRider(ph, a), RGX / RW, RGY / RH);
    }
  }
}

/** Debug sheet: every view at two gallop frames, with the rider seated. */
export function previewSheet(): string {
  ensureUpgradedArt();
  const scale = 0.5;
  const sheet = cnv(UPGRADED_VIEWS * HW * scale, 2 * HH * scale);
  const g = sheet.getContext('2d')!;
  g.fillStyle = '#c9b48f';
  g.fillRect(0, 0, sheet.width, sheet.height);
  for (let row = 0; row < 2; row++) {
    const f = row === 0 ? 0 : 4;
    for (let v = 0; v < UPGRADED_VIEWS; v++) {
      const x = v * HW * scale;
      const y = row * HH * scale;
      g.drawImage(CANVASES[`uhorse${v}_${f}`], x, y, HW * scale, HH * scale);
      const rx = x + (HGX - RGX) * scale;
      const ry = y + (HGY - SADDLE_H * UPPM - RGY) * scale;
      g.drawImage(CANVASES[`urider${v}_${f}`], rx, ry, RW * scale, RH * scale);
    }
  }
  return sheet.toDataURL('image/png');
}
