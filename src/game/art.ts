import * as PIXI from 'pixi.js';
import { clamp, lerp, HORSE_VIEWS, HPPM, TPPM, MPPM } from './types';

export interface ArtMeta {
  ppm: number;
  ax: number;
  ay: number;
  h?: number;
  nape?: number;
  cy?: number;
  len?: number;
  wd?: number;
  tot?: number;
  wPx?: number;
  hPx?: number;
}

export const ART: {
  tex: Record<string, PIXI.Texture>;
  meta: Record<string, ArtMeta>;
} = {
  tex: {},
  meta: {},
};

function cnv(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function mkTex(c: HTMLCanvasElement): PIXI.Texture {
  return new PIXI.Texture({
    source: new PIXI.CanvasSource({ resource: c, autoGenerateMipmaps: true }),
  });
}

function reg(name: string, c: HTMLCanvasElement, ppm = 1, ax = 0.5, ay = 0.5): void {
  ART.tex[name] = mkTex(c);
  ART.meta[name] = { ppm, ax, ay, wPx: c.width, hPx: c.height };
}

function rng(seed: number): () => number {
  let s = ((seed * 2654435761) >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

function rgba(c: number[], a?: number): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a === undefined ? 1 : a})`;
}

function sh(c: number[], k: number): number[] {
  return [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)];
}

function mix3(a: number[], b: number[], t: number): number[] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function radial(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  stops: [number, string][]
): CanvasGradient {
  const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}

function ellipseP(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rot = 0
): void {
  g.beginPath();
  g.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, Math.PI * 2);
}

function poly(g: CanvasRenderingContext2D, pts: [number, number][]): void {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

function capsule(
  g: CanvasRenderingContext2D,
  x: number,
  y0: number,
  y1: number,
  w0: number,
  w1: number
): void {
  g.beginPath();
  g.moveTo(x - w0 / 2, y0);
  g.lineTo(x - w1 / 2, y1);
  g.arc(x, y1, w1 / 2, Math.PI, 0, true);
  g.lineTo(x + w0 / 2, y0);
  g.arc(x, y0, w0 / 2, 0, Math.PI, true);
  g.closePath();
}

function furStrokes(
  g: CanvasRenderingContext2D,
  n: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  cols: string[],
  len: number,
  ang: number,
  width: number,
  rnd: () => number
): void {
  for (let i = 0; i < n; i++) {
    const x = x0 + rnd() * w;
    const y = y0 + rnd() * h;
    const a = ang + (rnd() - 0.5) * 0.85;
    const l = len * (0.5 + rnd());
    g.strokeStyle = cols[(rnd() * cols.length) | 0];
    g.lineWidth = width * (0.55 + rnd() * 0.85);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(
      x + Math.cos(a) * l * 0.5 + (rnd() - 0.5) * l * 0.35,
      y + Math.sin(a) * l * 0.5,
      x + Math.cos(a) * l,
      y + Math.sin(a) * l
    );
    g.stroke();
  }
}

/* ---------- 1. FX & PROJECTILES ---------- */
function artFX(): void {
  // Small human silhouette extracted from the nape before the Cart Titan's rescue.
  {
    const c = cnv(80, 112), g = c.getContext('2d')!;
    g.fillStyle = '#704b32';
    ellipseP(g, 40, 75, 20, 26); g.fill();
    g.strokeStyle = '#9c6a47'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(24, 68); g.lineTo(15, 91);
    g.moveTo(56, 68); g.lineTo(65, 91); g.stroke();
    g.fillStyle = '#c69a75'; ellipseP(g, 40, 36, 18, 22); g.fill();
    g.fillStyle = '#57402a';
    g.beginPath(); g.ellipse(40, 27, 18, 15, 0, Math.PI, Math.PI * 2); g.fill();
    g.fillStyle = '#36251b';
    ellipseP(g, 33, 39, 2, 3); g.fill(); ellipseP(g, 47, 39, 2, 3); g.fill();
    reg('zeke', c, 45, 0.5, 1);
  }
  let c = cnv(128, 128);
  let g = c.getContext('2d')!;
  g.fillStyle = radial(g, 64, 64, 64, [
    [0, 'rgba(255,255,255,1)'],
    [0.32, 'rgba(255,255,255,0.58)'],
    [0.7, 'rgba(255,255,255,0.14)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  g.fillRect(0, 0, 128, 128);
  reg('glow', c);

  // Volumetric painterly dust/smoke clouds (4 variants)
  for (let v = 0; v < 4; v++) {
    c = cnv(128, 128);
    g = c.getContext('2d')!;
    const r = rng(11 + v * 17);
    for (let i = 0; i < 20; i++) {
      const x = 64 + (r() - 0.5) * 58;
      const y = 64 + (r() - 0.5) * 50;
      const rr = 16 + r() * 32;
      g.fillStyle = radial(g, x - rr * 0.12, y - rr * 0.14, rr, [
        [0, 'rgba(255,255,255,0.34)'],
        [0.58, 'rgba(255,255,255,0.14)'],
        [1, 'rgba(255,255,255,0)'],
      ]);
      g.fillRect(0, 0, 128, 128);
    }
    reg('dust' + v, c);
  }

  // Soft elliptical contact shadow
  c = cnv(128, 64);
  g = c.getContext('2d')!;
  g.save();
  g.scale(1, 0.5);
  g.fillStyle = radial(g, 64, 64, 64, [
    [0, 'rgba(18,14,10,0.92)'],
    [0.52, 'rgba(18,14,10,0.52)'],
    [1, 'rgba(18,14,10,0)'],
  ]);
  g.fillRect(0, 0, 128, 128);
  g.restore();
  reg('shadow', c);

  // Ground impact crater scuff
  c = cnv(96, 48);
  g = c.getContext('2d')!;
  g.save();
  g.scale(1, 0.5);
  g.fillStyle = radial(g, 48, 48, 46, [
    [0, 'rgba(54,42,28,0.72)'],
    [0.45, 'rgba(78,62,42,0.42)'],
    [0.78, 'rgba(110,92,64,0.18)'],
    [1, 'rgba(110,92,64,0)'],
  ]);
  g.fillRect(0, 0, 96, 96);
  g.restore();
  reg('scuff', c);

  // 3 multi-faceted jagged shrapnel stone variants
  for (let v = 0; v < 3; v++) {
    c = cnv(48, 48);
    g = c.getContext('2d')!;
    const r = rng(70 + v * 23);
    const pts: [number, number][] = [];
    const n = 7 + v;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.25;
      const rr = 15 + r() * 7;
      pts.push([24 + Math.cos(a) * rr, 24 + Math.sin(a) * rr]);
    }
    g.fillStyle = radial(g, 29, 17, 24, [
      [0, '#cfc4b2'],
      [0.42, '#7d7366'],
      [0.82, '#443d36'],
      [1, '#26211d'],
    ]);
    poly(g, pts);
    g.fill();
    // Sunlit upper-right facet highlight
    g.save();
    g.clip();
    g.fillStyle = 'rgba(255,238,210,0.38)';
    poly(g, [
      [24, 24],
      pts[0],
      pts[n - 1],
      pts[n - 2],
    ]);
    g.fill();
    g.strokeStyle = 'rgba(28,22,18,0.55)';
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(pts[1][0], pts[1][1]);
    g.lineTo(24, 24);
    g.lineTo(pts[Math.floor(n / 2)][0], pts[Math.floor(n / 2)][1]);
    g.stroke();
    g.restore();
    reg('stone' + v, c);
  }
  ART.tex['stone'] = ART.tex['stone0'];
  ART.meta['stone'] = ART.meta['stone0'];

  // Motion streak for incoming shrapnel
  c = cnv(128, 18);
  g = c.getContext('2d')!;
  let lg = g.createLinearGradient(0, 0, 128, 0);
  lg.addColorStop(0, 'rgba(255,245,230,0)');
  lg.addColorStop(0.65, 'rgba(255,235,210,0.42)');
  lg.addColorStop(1, 'rgba(255,250,240,0.88)');
  g.fillStyle = lg;
  g.beginPath();
  g.moveTo(0, 9);
  g.lineTo(128, 2);
  g.lineTo(128, 16);
  g.closePath();
  g.fill();
  reg('streak', c, 1, 1, 0.5);

  // Steel blade slash arc
  c = cnv(512, 36);
  g = c.getContext('2d')!;
  g.fillStyle = radial(g, 256, 18, 256, [
    [0, 'rgba(255,255,255,0.65)'],
    [0.5, 'rgba(220,245,255,0.28)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  g.save();
  g.scale(1, 0.14);
  g.fillRect(0, 0, 512, 260);
  g.restore();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, 18);
  g.quadraticCurveTo(256, 9, 512, 18);
  g.quadraticCurveTo(256, 25, 0, 18);
  g.fill();
  reg('slash', c);

  // Golden-hour sunbeam ray
  c = cnv(128, 1024);
  g = c.getContext('2d')!;
  lg = g.createLinearGradient(0, 0, 0, 1024);
  lg.addColorStop(0, 'rgba(255,240,200,0.0)');
  lg.addColorStop(0.14, 'rgba(255,236,192,0.52)');
  lg.addColorStop(0.65, 'rgba(255,226,176,0.18)');
  lg.addColorStop(1, 'rgba(255,226,176,0)');
  g.fillStyle = lg;
  g.beginPath();
  g.moveTo(52, 0);
  g.lineTo(76, 0);
  g.lineTo(128, 1024);
  g.lineTo(0, 1024);
  g.closePath();
  g.fill();
  reg('ray', c, 1, 0.5, 0);
}

/* ---------- 2. SKY, CLOUDS, MOUNTAINS & DISTANT WALL SILHOUETTE ---------- */
function artSky(): void {
  let c = cnv(4, 512);
  let g = c.getContext('2d')!;
  const lg = g.createLinearGradient(0, 0, 0, 512);
  lg.addColorStop(0, '#344a70');
  lg.addColorStop(0.28, '#627692');
  lg.addColorStop(0.56, '#b89a84');
  lg.addColorStop(0.78, '#dfb78a');
  lg.addColorStop(0.92, '#efc898');
  lg.addColorStop(1, '#f3d4a4');
  g.fillStyle = lg;
  g.fillRect(0, 0, 4, 512);
  reg('sky', c, 1, 0, 0);

  // Painterly sunlit cumulus clouds (5 variants)
  for (let v = 0; v < 5; v++) {
    c = cnv(680, 250);
    g = c.getContext('2d')!;
    const r = rng(100 + v * 19);
    const blobs: [number, number, number][] = [];
    for (let i = 0; i < 30; i++) {
      const t = r();
      blobs.push([
        80 + t * 520,
        158 - Math.sin(t * Math.PI) * (44 + r() * 64) + r() * 22,
        28 + r() * 58 * Math.sin(t * Math.PI + 0.25),
      ]);
    }
    // Warm violet-mauve cloud base shadows
    for (const [x, y, rr] of blobs) {
      g.fillStyle = radial(g, x - rr * 0.1, y + rr * 0.34, rr * 1.25, [
        [0, 'rgba(155,126,132,0.58)'],
        [0.65, 'rgba(165,134,132,0.22)'],
        [1, 'rgba(165,134,132,0)'],
      ]);
      g.fillRect(0, 0, 680, 250);
    }
    // Sunlit golden-cream cloud crowns (lit from upper-right)
    for (const [x, y, rr] of blobs) {
      g.fillStyle = radial(g, x + rr * 0.18, y - rr * 0.32, rr, [
        [0, 'rgba(255,248,234,0.96)'],
        [0.55, 'rgba(252,226,196,0.62)'],
        [1, 'rgba(242,204,178,0)'],
      ]);
      g.fillRect(0, 0, 680, 250);
    }
    reg('cloud' + v, c, 1, 0.5, 0.6);
  }

  // 3 Mountain ridges with golden-hour sunlit slopes & distant pine treelines
  const layers = [
    { top: [136, 146, 166], bot: [198, 182, 166], amp: 155, k: [2, 5, 11, 23], base: 0.62, seed: 3 },
    { top: [108, 116, 124], bot: [176, 162, 142], amp: 112, k: [3, 7, 13, 29], base: 0.53, seed: 7 },
    { top: [74, 86, 62], bot: [138, 134, 98], amp: 64, k: [4, 9, 17, 41], base: 0.38, seed: 13 },
  ];
  layers.forEach((L, li) => {
    c = cnv(2048, 360);
    g = c.getContext('2d')!;
    const r = rng(L.seed);
    const ph = L.k.map(() => r() * 6.28);
    const am = L.k.map((_, i) => 1 / (i + 1.2));
    const hAt = (x: number) => {
      let v = 0;
      for (let i = 0; i < L.k.length; i++) {
        v += Math.sin((x / 2048) * 6.2832 * L.k[i] + ph[i]) * am[i];
      }
      return 360 - (L.base * 360 + v * L.amp * 0.5);
    };
    const mg = g.createLinearGradient(0, 50, 0, 360);
    mg.addColorStop(0, rgba(L.top));
    mg.addColorStop(1, rgba(L.bot));
    g.fillStyle = mg;
    g.beginPath();
    g.moveTo(0, 360);
    for (let x = 0; x <= 2048; x += 4) {
      const jagged = li === 2 ? Math.sin(x * 0.85) * 3.5 + Math.sin(x * 2.1) * 2.5 : 0;
      g.lineTo(x, hAt(x) + jagged);
    }
    g.lineTo(2048, 360);
    g.closePath();
    g.fill();

    g.save();
    g.clip();
    // Sunlit right-facing slopes (sun is at upper-right)
    for (let x = 0; x < 2048; x += 2) {
      const d = hAt(x + 6) - hAt(x - 6);
      if (d > 0) {
        g.fillStyle = `rgba(255,232,192,${Math.min(0.28, d * 0.012)})`;
        g.fillRect(x, hAt(x), 2, 70 + d * 2.5);
      } else {
        g.fillStyle = `rgba(38,44,58,${Math.min(0.16, -d * 0.008)})`;
        g.fillRect(x, hAt(x), 2, 50);
      }
    }
    // Distant forested foothills on foreground ridge
    if (li === 2) {
      for (let i = 0; i < 1200; i++) {
        const x = r() * 2048;
        const y = hAt(x) + r() * 54;
        const col = r() < 0.35 ? 'rgba(62,78,44,' : 'rgba(42,54,32,';
        g.fillStyle = `${col}${0.22 + r() * 0.32})`;
        g.beginPath();
        g.arc(x, y, 2 + r() * 5, 0, 6.29);
        g.fill();
      }
    }
    const fog = g.createLinearGradient(0, 195, 0, 360);
    fog.addColorStop(0, 'rgba(224,200,164,0)');
    fog.addColorStop(1, 'rgba(224,200,164,0.72)');
    g.fillStyle = fog;
    g.fillRect(0, 0, 2048, 360);
    g.restore();
    reg('mtn' + li, c, 1, 0, 1);
  });
}

/* ---------- 3. MONUMENTAL CITY WALL (WALL MARIA / SHIGANSHINA) ---------- */
function artCityWall(): void {
  const WPPM = 12; // 12 px per meter -> 50m wall = 600px tall!

  // Helper to paint weathered Wall Maria ashlar stone blocks & rain streaks
  const paintMasonry = (
    g: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    w: number,
    h: number,
    r: () => number,
    sunSide: number
  ) => {
    const baseGrad = g.createLinearGradient(x0, y0, x0 + w, y0);
    if (sunSide > 0) {
      baseGrad.addColorStop(0, '#857c6e');
      baseGrad.addColorStop(0.55, '#a89d8b');
      baseGrad.addColorStop(0.88, '#c8ba9f');
      baseGrad.addColorStop(1, '#dfd0b2');
    } else {
      baseGrad.addColorStop(0, '#787064');
      baseGrad.addColorStop(0.45, '#9d9383');
      baseGrad.addColorStop(0.86, '#bdb09a');
      baseGrad.addColorStop(1, '#d8c8ab');
    }
    g.fillStyle = baseGrad;
    g.fillRect(x0, y0, w, h);

    // Ashlar stone block grid
    const rowH = 22;
    for (let row = 0; row * rowH < h; row++) {
      const y = y0 + row * rowH;
      const offset = (row % 2) * 26;
      for (let bx = -offset; bx < w; bx += 52) {
        const shade = (r() - 0.5) * 24;
        g.fillStyle =
          shade > 0
            ? `rgba(255,244,224,${shade / 260})`
            : `rgba(38,32,26,${-shade / 210})`;
        g.fillRect(x0 + bx + 1, y + 1, 50, rowH - 2);
      }
      // Horizontal mortar seam
      g.fillStyle = 'rgba(42,36,30,0.34)';
      g.fillRect(x0, y, w, 1.5);
      // Warm sunlit lip below seam
      g.fillStyle = 'rgba(255,242,218,0.14)';
      g.fillRect(x0, y + 1.5, w, 1);
    }
    // Vertical stone joints
    g.fillStyle = 'rgba(42,36,30,0.24)';
    for (let row = 0; row * rowH < h; row++) {
      const y = y0 + row * rowH;
      const offset = (row % 2) * 26;
      for (let bx = -offset; bx < w; bx += 52) {
        if (bx > 0 && bx < w) g.fillRect(x0 + bx, y, 1.4, rowH);
      }
    }

    // Vertical rainwater stains & age weathering
    for (let i = 0; i < 36; i++) {
      const sx = x0 + r() * w;
      const sy = y0 + r() * (h * 0.45);
      const sw = 4 + r() * 14;
      const shh = 60 + r() * (h * 0.65);
      const sg = g.createLinearGradient(0, sy, 0, sy + shh);
      sg.addColorStop(0, 'rgba(46,40,34,0.28)');
      sg.addColorStop(0.7, 'rgba(54,48,40,0.12)');
      sg.addColorStop(1, 'rgba(54,48,40,0)');
      g.fillStyle = sg;
      g.fillRect(sx, sy, sw, shh);
    }

    // Cracks & battle scars
    g.strokeStyle = 'rgba(34,28,22,0.55)';
    g.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) {
      let cx = x0 + 25 + r() * (w - 50);
      let cy = y0 + 40 + r() * (h - 100);
      g.beginPath();
      g.moveTo(cx, cy);
      for (let s = 0; s < 5; s++) {
        cx += (r() - 0.5) * 22;
        cy += 12 + r() * 24;
        g.lineTo(cx, cy);
      }
      g.stroke();
    }

    // Moss / grass staining along the ground foundation
    const mossG = g.createLinearGradient(0, y0 + h - 75, 0, y0 + h);
    mossG.addColorStop(0, 'rgba(54,68,36,0)');
    mossG.addColorStop(0.55, 'rgba(52,66,34,0.34)');
    mossG.addColorStop(1, 'rgba(42,54,28,0.68)');
    g.fillStyle = mossG;
    g.fillRect(x0, y0 + h - 75, w, 75);
  };

  // A seamless curtain face for world-space wall meshes, rather than front-facing billboards.
  {
    const c = cnv(384, 640);
    const g = c.getContext('2d')!;
    paintMasonry(g, 0, 20, 384, 620, rng(1167), 1);
    for (let x = 0; x < 384; x += 96) {
      g.fillStyle = 'rgba(32,27,22,0.3)';
      g.fillRect(x, 36, 10, 604);
      g.fillStyle = '#afa38d';
      g.fillRect(x + 10, 30, 14, 610);
      g.fillStyle = 'rgba(255,240,209,0.38)';
      g.fillRect(x + 20, 30, 4, 610);
    }
    g.fillStyle = '#c8b99d';
    g.fillRect(0, 20, 384, 12);
    g.fillStyle = '#e2d0af';
    g.fillRect(0, 20, 384, 3);
    for (let x = 0; x < 384; x += 32) {
      g.fillStyle = '#b4a58d';
      g.fillRect(x, 0, 20, 22);
      g.fillStyle = '#d6c5a6';
      g.fillRect(x + 15, 0, 5, 22);
    }
    reg('curtainWall', c, 12, 0.5, 1);
    ART.tex.curtainWall.source.style.addressMode = 'repeat';
  }

  {
    const k = 24;
    const c = cnv(34 * k, 50 * k);
    const g = c.getContext('2d')!;
    const cx = c.width / 2;
    paintMasonry(g, 0, 0, c.width, c.height, rng(1182), 1);
    const arch = () => {
      g.beginPath();
      g.moveTo(cx - 9 * k, c.height);
      g.lineTo(cx - 9 * k, c.height - 7 * k);
      g.ellipse(cx, c.height - 7 * k, 9 * k, 5 * k, 0, Math.PI, 2 * Math.PI);
      g.lineTo(cx + 9 * k, c.height);
      g.closePath();
    };
    arch();
    g.strokeStyle = '#584939';
    g.lineWidth = 2 * k;
    g.stroke();
    g.strokeStyle = '#d2c0a0';
    g.lineWidth = 0.8 * k;
    g.stroke();
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = '#000';
    arch();
    g.fill();
    g.restore();
    // Recessed portcullis remains raised; the actual opening is transparent.
    g.fillStyle = '#302820';
    for (let x = cx - 8.5 * k; x < cx + 9 * k; x += 1.1 * k) {
      const t = (x - cx) / (9 * k);
      const top = c.height - 7 * k - 5 * k * Math.sqrt(1 - t * t);
      g.fillRect(x, top, 0.12 * k, 0.65 * k);
    }
    g.fillStyle = '#627451';
    for (const side of [-1, 1]) {
      const x = cx + side * 13 * k;
      poly(g, [[x - k, 28 * k], [x + k, 28 * k], [x + k, 35 * k], [x, 36 * k], [x - k, 35 * k]]);
      g.fill();
    }
    reg('cityGate', c, k, 0.5, 1);
  }

  // 2 Monumental 50m City Wall Segments (wallSeg0, wallSeg1)
  for (let v = 0; v < 2; v++) {
    const Wc = 540;
    const Hc = 660;
    const c = cnv(Wc, Hc);
    const g = c.getContext('2d')!;
    const r = rng(1200 + v * 37);

    const wallTop = 76;
    const wallH = Hc - wallTop;

    // Main 50m wall curtain
    paintMasonry(g, 16, wallTop, Wc - 32, wallH, r, 1);

    // Massive vertical Wall Maria stone buttresses (3 pillars)
    const buttX = [16, Wc / 2 - 36, Wc - 88];
    for (const bx of buttX) {
      const bw = 72;
      // Drop shadow cast to the left of each buttress (sun from right)
      const ds = g.createLinearGradient(bx - 28, 0, bx, 0);
      ds.addColorStop(0, 'rgba(20,16,12,0)');
      ds.addColorStop(1, 'rgba(20,16,12,0.44)');
      g.fillStyle = ds;
      g.fillRect(bx - 28, wallTop + 8, 28, wallH - 8);

      // Buttress body (slightly battered wider at base)
      g.save();
      poly(g, [
        [bx + 4, wallTop - 6],
        [bx + bw - 4, wallTop - 6],
        [bx + bw + 6, Hc],
        [bx - 6, Hc],
      ]);
      g.clip();
      paintMasonry(g, bx - 6, wallTop - 6, bw + 12, wallH + 6, r, 1);
      // Highlight sunlit right bevel of buttress
      g.fillStyle = 'rgba(255,238,204,0.36)';
      g.fillRect(bx + bw - 10, wallTop - 6, 16, wallH + 6);
      // Shaded left bevel of buttress
      g.fillStyle = 'rgba(30,24,18,0.28)';
      g.fillRect(bx - 6, wallTop - 6, 14, wallH + 6);
      g.restore();

      // Buttress cornice cap
      g.fillStyle = '#c8ba9f';
      g.fillRect(bx, wallTop - 12, bw, 10);
      g.fillStyle = 'rgba(255,244,218,0.45)';
      g.fillRect(bx, wallTop - 12, bw, 3);
      g.fillStyle = 'rgba(35,28,22,0.45)';
      g.fillRect(bx, wallTop - 2, bw, 4);
    }

    // Upper parapet gallery & decorative machicolation band
    g.fillStyle = '#b9ac94';
    g.fillRect(10, wallTop - 26, Wc - 20, 28);
    g.fillStyle = 'rgba(255,242,212,0.34)';
    g.fillRect(10, wallTop - 26, Wc - 20, 5);
    g.fillStyle = 'rgba(32,26,20,0.48)';
    g.fillRect(10, wallTop + 1, Wc - 20, 8);

    // Corbel arches along parapet underside
    for (let x = 22; x < Wc - 30; x += 28) {
      g.fillStyle = 'rgba(32,26,20,0.52)';
      g.beginPath();
      g.arc(x + 10, wallTop + 2, 9, Math.PI, 0);
      g.fill();
    }

    // Crenellations / Merlons along the crown
    for (let x = 14; x < Wc - 24; x += 38) {
      g.fillStyle = '#c5b79e';
      g.fillRect(x, wallTop - 44, 24, 20);
      g.fillStyle = 'rgba(255,245,222,0.42)';
      g.fillRect(x + 17, wallTop - 44, 7, 20);
      g.fillRect(x, wallTop - 44, 24, 3);
      g.fillStyle = 'rgba(42,35,28,0.32)';
      g.fillRect(x, wallTop - 44, 5, 20);
    }

    // Mounted Garrison Wall Cannon silhouette on top rail (v === 0)
    if (v === 0) {
      g.fillStyle = '#383430';
      g.fillRect(195, wallTop - 52, 42, 12);
      g.fillRect(225, wallTop - 56, 48, 9);
      g.beginPath();
      g.arc(208, wallTop - 42, 10, 0, Math.PI * 2);
      g.fill();
    }

    // Subtle recessed defensive archways mid-wall
    for (const ax of [158, 372]) {
      g.fillStyle = 'rgba(36,30,26,0.42)';
      g.beginPath();
      g.arc(ax, wallTop + 150, 26, Math.PI, 0);
      g.lineTo(ax + 26, wallTop + 225);
      g.lineTo(ax - 26, wallTop + 225);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(225,212,188,0.22)';
      g.lineWidth = 3;
      g.stroke();
    }

    // Soft grounded grass/dirt blend at bottom edge
    const bot = g.createLinearGradient(0, Hc - 22, 0, Hc);
    bot.addColorStop(0, 'rgba(62,76,40,0)');
    bot.addColorStop(1, 'rgba(62,76,40,0.45)');
    g.fillStyle = bot;
    g.fillRect(0, Hc - 22, Wc, 22);

    reg('wallSeg' + v, c, WPPM, 0.5, 0.99);
  }

  // 2 Towering Shiganshina Bastion Watchtowers (wallTower0, wallTower1)
  for (let v = 0; v < 2; v++) {
    const Wc = 340;
    const Hc = 780;
    const c = cnv(Wc, Hc);
    const g = c.getContext('2d')!;
    const r = rng(1400 + v * 53);

    const towerTop = 190;
    const towerW = 216;
    const tx0 = (Wc - towerW) / 2;

    // Main stone tower shaft
    g.save();
    poly(g, [
      [tx0 + 8, towerTop],
      [tx0 + towerW - 8, towerTop],
      [tx0 + towerW + 14, Hc],
      [tx0 - 14, Hc],
    ]);
    g.clip();
    paintMasonry(g, tx0 - 14, towerTop, towerW + 28, Hc - towerTop, r, 1);
    // Cylindrical/octagonal shading for 3D monumentality
    const cyl = g.createLinearGradient(tx0 - 14, 0, tx0 + towerW + 14, 0);
    cyl.addColorStop(0, 'rgba(24,20,16,0.42)');
    cyl.addColorStop(0.28, 'rgba(24,20,16,0.08)');
    cyl.addColorStop(0.75, 'rgba(255,238,205,0.16)');
    cyl.addColorStop(1, 'rgba(255,238,205,0.34)');
    g.fillStyle = cyl;
    g.fillRect(tx0 - 14, towerTop, towerW + 28, Hc - towerTop);
    g.restore();

    // Narrow gothic arrow-slits & upper lookout windows
    for (const wy of [towerTop + 72, towerTop + 210, towerTop + 365]) {
      for (const wx of [Wc / 2 - 44, Wc / 2, Wc / 2 + 44]) {
        g.fillStyle = '#241e19';
        g.beginPath();
        g.arc(wx, wy, 7, Math.PI, 0);
        g.lineTo(wx + 7, wy + 28);
        g.lineTo(wx - 7, wy + 28);
        g.closePath();
        g.fill();
        g.strokeStyle = 'rgba(235,222,196,0.35)';
        g.lineWidth = 2;
        g.stroke();
      }
    }

    // Overhanging wooden/stone turret gallery
    g.fillStyle = '#aba08e';
    g.fillRect(tx0 - 10, towerTop - 32, towerW + 20, 36);
    g.fillStyle = 'rgba(255,244,218,0.32)';
    g.fillRect(tx0 - 10, towerTop - 32, towerW + 20, 5);
    g.fillStyle = 'rgba(28,22,18,0.5)';
    g.fillRect(tx0 - 10, towerTop + 2, towerW + 20, 10);

    // Steep European slate watchtower spire roof
    const roofG = g.createLinearGradient(tx0 - 20, 0, tx0 + towerW + 20, 0);
    roofG.addColorStop(0, '#2d343e');
    roofG.addColorStop(0.45, '#434d5a');
    roofG.addColorStop(0.82, '#646e78');
    roofG.addColorStop(1, '#858882');
    g.fillStyle = roofG;
    poly(g, [
      [Wc / 2, 28],
      [tx0 + towerW + 24, towerTop - 28],
      [tx0 - 24, towerTop - 28],
    ]);
    g.fill();

    // Roof slate shingle ridges
    g.strokeStyle = 'rgba(20,24,30,0.35)';
    g.lineWidth = 1.5;
    for (let i = 1; i < 10; i++) {
      const k = i / 10;
      const y = lerp(28, towerTop - 28, k);
      const hw = lerp(4, towerW / 2 + 24, k);
      g.beginPath();
      g.moveTo(Wc / 2 - hw, y);
      g.lineTo(Wc / 2 + hw, y);
      g.stroke();
    }
    // Sunlit right roof eave rim
    g.strokeStyle = 'rgba(255,228,184,0.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(Wc / 2, 28);
    g.lineTo(tx0 + towerW + 24, towerTop - 28);
    g.stroke();

    // Spire finial & fluttering Survey Corps / Garrison pennant
    g.strokeStyle = '#3a342c';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(Wc / 2, 4);
    g.lineTo(Wc / 2, 34);
    g.stroke();
    // Fluttering banner hanging on tower face
    const banCol = v === 0 ? '#2b6b3a' : '#8c3530';
    const bx = Wc / 2;
    const by = towerTop + 125;
    g.fillStyle = banCol;
    poly(g, [
      [bx - 22, by],
      [bx + 22, by],
      [bx + 20, by + 95],
      [bx, by + 114],
      [bx - 20, by + 95],
    ]);
    g.fill();
    g.strokeStyle = 'rgba(235,216,170,0.65)';
    g.lineWidth = 2;
    g.stroke();
    // Simple crest mark on banner
    g.fillStyle = 'rgba(240,236,226,0.85)';
    g.beginPath();
    g.arc(bx, by + 48, 10, 0, Math.PI * 2);
    g.fill();

    reg('wallTower' + v, c, WPPM, 0.5, 0.99);
  }

  // Ruined outer perimeter rampart (for mid-field far flanks)
  {
    const Wc = 420;
    const Hc = 340;
    const c = cnv(Wc, Hc);
    const g = c.getContext('2d')!;
    const r = rng(1555);
    g.save();
    poly(g, [
      [18, 95],
      [120, 68],
      [215, 78],
      [288, 128],
      [350, 118],
      [402, 165],
      [410, Hc],
      [10, Hc],
    ]);
    g.clip();
    paintMasonry(g, 10, 60, 400, Hc - 60, r, 1);
    g.restore();
    // Jagged broken sunlit top edge
    g.strokeStyle = 'rgba(246,230,198,0.55)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(18, 95);
    g.lineTo(120, 68);
    g.lineTo(215, 78);
    g.lineTo(288, 128);
    g.lineTo(350, 118);
    g.lineTo(402, 165);
    g.stroke();
    reg('wallRuined', c, WPPM, 0.5, 0.99);
  }

  // Shiganshina half-timbered terracotta-roofed town houses (2 variants, gives colossal scale to the wall!)
  const HP = 26;
  for (let v = 0; v < 2; v++) {
    const Wc = 280;
    const Hc = 300;
    const c = cnv(Wc, Hc);
    const g = c.getContext('2d')!;
    const bw = v === 0 ? 196 : 220;
    const bx = (Wc - bw) / 2;
    const wallY = 140;

    // Warm weathered plaster walls
    const wg = g.createLinearGradient(bx, 0, bx + bw, 0);
    wg.addColorStop(0, '#a89a84');
    wg.addColorStop(0.6, '#d6c9b2');
    wg.addColorStop(1, '#ede0c8');
    g.fillStyle = wg;
    g.fillRect(bx, wallY, bw, Hc - wallY);

    // Stone plinth foundation
    g.fillStyle = '#7c7468';
    g.fillRect(bx - 3, Hc - 34, bw + 6, 34);

    // Dark medieval timber cross-beams
    g.strokeStyle = '#4c3826';
    g.lineWidth = 5;
    g.strokeRect(bx + 2, wallY + 2, bw - 4, Hc - wallY - 36);
    g.beginPath();
    g.moveTo(bx, wallY + 62);
    g.lineTo(bx + bw, wallY + 62);
    g.moveTo(bx + bw * 0.33, wallY);
    g.lineTo(bx + bw * 0.33, Hc - 34);
    g.moveTo(bx + bw * 0.67, wallY);
    g.lineTo(bx + bw * 0.67, Hc - 34);
    g.moveTo(bx + 4, wallY + 62);
    g.lineTo(bx + bw * 0.33, wallY + 4);
    g.moveTo(bx + bw - 4, wallY + 62);
    g.lineTo(bx + bw * 0.67, wallY + 4);
    g.stroke();

    // Recessed shuttered windows
    for (const wy of [wallY + 18, wallY + 80]) {
      for (const wx of [bx + bw * 0.16, bx + bw * 0.5, bx + bw * 0.84]) {
        g.fillStyle = '#2d241e';
        g.fillRect(wx - 11, wy, 22, 30);
        g.strokeStyle = '#6c5238';
        g.lineWidth = 2;
        g.strokeRect(wx - 11, wy, 22, 30);
      }
    }

    // Iconic Shiganshina warm terracotta clay-tile pitched roof!
    const rg = g.createLinearGradient(bx - 18, 30, bx + bw + 18, wallY + 14);
    rg.addColorStop(0, '#843b2a');
    rg.addColorStop(0.55, '#b65438');
    rg.addColorStop(1, '#d87a52');
    g.fillStyle = rg;
    poly(g, [
      [Wc / 2, 26],
      [bx + bw + 20, wallY + 12],
      [bx - 20, wallY + 12],
    ]);
    g.fill();

    // Terracotta tile rows
    g.strokeStyle = 'rgba(64,22,14,0.34)';
    g.lineWidth = 1.6;
    for (let i = 1; i <= 7; i++) {
      const k = i / 8;
      const y = lerp(26, wallY + 12, k);
      const hw = lerp(6, bw / 2 + 20, k);
      g.beginPath();
      g.moveTo(Wc / 2 - hw, y);
      g.lineTo(Wc / 2 + hw, y);
      g.stroke();
    }
    // Sunlit roof ridge highlight
    g.strokeStyle = 'rgba(255,222,174,0.52)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(Wc / 2, 26);
    g.lineTo(bx + bw + 20, wallY + 12);
    g.stroke();

    // Chimney
    g.fillStyle = '#8b7b6a';
    g.fillRect(bx + bw * 0.68, 44, 20, 44);
    g.fillStyle = '#c4b49c';
    g.fillRect(bx + bw * 0.68 - 3, 40, 26, 7);

    reg('shiganshinaHouse' + v, c, HP, 0.5, 0.99);
  }

  {
    const c = cnv(500, 330);
    const g = c.getContext('2d')!;
    g.fillStyle = '#b8aa91';
    g.fillRect(32, 150, 436, 178);
    g.fillStyle = '#4c3829';
    for (let x = 36; x < 470; x += 71) g.fillRect(x, 150, 6, 178);
    g.fillRect(32, 215, 436, 6);
    const roof = g.createLinearGradient(35, 45, 450, 180);
    roof.addColorStop(0, '#773d2d');
    roof.addColorStop(1, '#ca7850');
    g.fillStyle = roof;
    poly(g, [[84, 24], [408, 24], [490, 160], [12, 160]]);
    g.fill();
    g.strokeStyle = '#7a4933';
    g.lineWidth = 3;
    for (let y = 42; y < 160; y += 18) {
      g.beginPath();
      g.moveTo(84 - (y - 24) * 0.52, y);
      g.lineTo(408 + (y - 24) * 0.6, y);
      g.stroke();
    }
    g.fillStyle = '#382b21';
    for (let x = 60; x < 460; x += 65) g.fillRect(x, 178, 20, 29);
    g.fillRect(224, 249, 52, 79);
    reg('districtHall', c, 30, 0.5, 0.99);
  }
}

/* ---------- 4. SCENERY: TREES, BUSHES, MEADOW GRASS & TIERED FIELD ROCKS ---------- */
function artScenery(): void {
  const greens = [
    [68, 92, 36],
    [88, 114, 46],
    [108, 128, 56],
    [56, 78, 30],
    [134, 140, 68],
  ];

  // Lush meadow grass tufts (4 variants)
  for (let v = 0; v < 4; v++) {
    const c = cnv(108, 84);
    const g = c.getContext('2d')!;
    const r = rng(200 + v * 13);
    g.lineCap = 'round';
    for (let i = 0; i < 32; i++) {
      const x = 54 + (r() - 0.5) * 60;
      const h = 28 + r() * 46;
      const lean = (r() - 0.5) * 34 + 6; // slight golden-afternoon breeze lean
      const col = greens[(r() * greens.length) | 0];
      const grad = g.createLinearGradient(x, 84, x + lean, 84 - h);
      grad.addColorStop(0, rgba(sh(col, 0.68)));
      grad.addColorStop(0.7, rgba(sh(col, 1.05)));
      grad.addColorStop(1, rgba(sh(col, 1.32)));
      g.strokeStyle = grad;
      g.lineWidth = 1.4 + r() * 2.1;
      g.beginPath();
      g.moveTo(x, 84);
      g.quadraticCurveTo(x + lean * 0.32, 84 - h * 0.62, x + lean, 84 - h);
      g.stroke();
    }
    reg('grass' + v, c, 84, 0.5, 1);
  }

  // Meadow wildflowers (4 variants)
  const fcols = [
    [248, 244, 232],
    [245, 212, 76],
    [186, 138, 206],
    [235, 124, 88],
  ];
  for (let v = 0; v < 4; v++) {
    const c = cnv(104, 80);
    const g = c.getContext('2d')!;
    const r = rng(300 + v * 17);
    g.lineCap = 'round';
    for (let i = 0; i < 20; i++) {
      const x = 52 + (r() - 0.5) * 66;
      const h = 22 + r() * 36;
      const dx = (r() - 0.5) * 14 + 4;
      g.strokeStyle = rgba(greens[(r() * 5) | 0]);
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x, 80);
      g.quadraticCurveTo(x + dx * 0.4, 80 - h * 0.55, x + dx, 80 - h);
      g.stroke();
      if (r() < 0.65) {
        g.fillStyle = rgba(fcols[v]);
        g.beginPath();
        g.arc(x + dx, 80 - h, 2.6 + r() * 2.2, 0, 6.29);
        g.fill();
        g.fillStyle = 'rgba(255,248,210,0.85)';
        g.beginPath();
        g.arc(x + dx + 0.8, 80 - h - 0.8, 1.1, 0, 6.29);
        g.fill();
      }
    }
    reg('flower' + v, c, 84, 0.5, 1);
  }

  // Painterly rock-drawing helper with faceted planes, sunlit ridge, crevices, moss & base grass
  const paintBoulder = (
    c: HTMLCanvasElement,
    seed: number,
    heightRatio: number,
    mossy: boolean
  ) => {
    const g = c.getContext('2d')!;
    const Wc = c.width;
    const Hc = c.height;
    const r = rng(seed);
    const cx = Wc / 2;
    const baseY = Hc * 0.91;

    // Build rugged polygonal rock silhouette
    const pts: [number, number][] = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const a = Math.PI + t * Math.PI;
      const ridgeBump = Math.sin(t * Math.PI * 3 + seed) * 0.08;
      const rx = Wc * (0.42 + (r() - 0.5) * 0.07);
      const ry = Hc * (heightRatio + ridgeBump + (r() - 0.5) * 0.1);
      pts.push([cx + Math.cos(a) * rx, baseY + Math.sin(a) * ry]);
    }
    // Slight uneven grounded bottom contour
    pts.push([cx + Wc * 0.28, baseY + Hc * 0.03]);
    pts.push([cx - Wc * 0.25, baseY + Hc * 0.025]);

    // Ground contact AO beneath rock
    g.fillStyle = radial(g, cx, baseY + 3, Wc * 0.45, [
      [0, 'rgba(20,16,12,0.58)'],
      [0.7, 'rgba(20,16,12,0.22)'],
      [1, 'rgba(20,16,12,0)'],
    ]);
    g.save();
    g.scale(1, 0.28);
    g.fillRect(0, (baseY + 3) / 0.28 - Wc * 0.45, Wc, Wc * 0.9);
    g.restore();

    // Base granite shading (warm sunlit right-top, cool slate left-bottom)
    const rg = g.createLinearGradient(Wc * 0.12, Hc * 0.12, Wc * 0.88, Hc * 0.88);
    rg.addColorStop(0, '#6a655c');
    rg.addColorStop(0.42, '#8b8376');
    rg.addColorStop(0.75, '#b6aa96');
    rg.addColorStop(1, '#585249');
    g.fillStyle = rg;
    poly(g, pts);
    g.fill();

    g.save();
    g.clip();

    // Chiseled geological facet planes
    const peak = pts[Math.floor(n * 0.55)];
    // Left shaded face
    g.fillStyle = 'rgba(34,32,36,0.42)';
    poly(g, [
      pts[0],
      pts[2],
      peak,
      [cx - Wc * 0.04, baseY + 10],
    ]);
    g.fill();

    // Right sunlit warm golden-hour face (makes boulders pop clearly on the field!)
    const sunG = g.createLinearGradient(cx, Hc * 0.1, Wc * 0.95, baseY);
    sunG.addColorStop(0, 'rgba(255,240,210,0.58)');
    sunG.addColorStop(0.55, 'rgba(232,212,178,0.26)');
    sunG.addColorStop(1, 'rgba(180,160,130,0)');
    g.fillStyle = sunG;
    poly(g, [
      peak,
      pts[n - 3],
      pts[n - 2],
      pts[n - 1],
      [cx + Wc * 0.08, baseY],
    ]);
    g.fill();

    // Rock grain & mineral speckles
    for (let i = 0; i < 65; i++) {
      const sx = Wc * 0.08 + r() * Wc * 0.84;
      const sy = Hc * 0.12 + r() * Hc * 0.78;
      g.fillStyle = r() < 0.5 ? 'rgba(250,242,226,0.16)' : 'rgba(32,28,24,0.22)';
      g.beginPath();
      g.arc(sx, sy, 1.5 + r() * 4.5, 0, 6.29);
      g.fill();
    }

    // Crisp geological cracks & strata
    g.strokeStyle = 'rgba(28,24,20,0.62)';
    g.lineWidth = Math.max(1.8, Wc * 0.011);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(peak[0], peak[1]);
    g.lineTo(cx + (r() - 0.5) * Wc * 0.12, baseY - Hc * 0.34);
    g.lineTo(cx - Wc * 0.08 + r() * Wc * 0.2, baseY + 4);
    g.moveTo(cx + (r() - 0.5) * Wc * 0.08, baseY - Hc * 0.34);
    g.lineTo(cx + Wc * 0.26, baseY - Hc * 0.16);
    g.stroke();

    // Warm rim highlight along upper-right ridge
    g.strokeStyle = 'rgba(255,242,214,0.55)';
    g.lineWidth = Math.max(2, Wc * 0.014);
    g.beginPath();
    g.moveTo(pts[Math.floor(n * 0.45)][0], pts[Math.floor(n * 0.45)][1] + 2);
    for (let i = Math.floor(n * 0.5); i < n - 1; i++) {
      g.lineTo(pts[i][0] - 1, pts[i][1] + 2);
    }
    g.stroke();

    // Moss / lichen patches on older field boulders
    if (mossy) {
      for (let i = 0; i < 12; i++) {
        const mx = cx + (r() - 0.5) * Wc * 0.6;
        const my = baseY - r() * Hc * 0.42;
        g.fillStyle = `rgba(${68 + (r() * 28) | 0},${92 + (r() * 30) | 0},${42 + (r() * 18) | 0},${0.35 + r() * 0.3})`;
        ellipseP(g, mx, my, 5 + r() * 14, 3 + r() * 7, (r() - 0.5) * 0.8);
        g.fill();
      }
    }

    // Dark grounded base occlusion
    const bAO = g.createLinearGradient(0, baseY - Hc * 0.2, 0, baseY + 10);
    bAO.addColorStop(0, 'rgba(24,22,16,0)');
    bAO.addColorStop(1, 'rgba(24,22,16,0.55)');
    g.fillStyle = bAO;
    g.fillRect(0, baseY - Hc * 0.2, Wc, Hc * 0.3);
    g.restore();

    // Rooted meadow grass tufts hugging the bottom edge of the rock
    g.lineCap = 'round';
    const tuftN = Math.round(Wc * 0.14);
    for (let i = 0; i < tuftN; i++) {
      const gx = cx + (r() - 0.5) * Wc * 0.78;
      const gh = 8 + r() * (Hc * 0.14);
      g.strokeStyle = rgba(greens[(r() * greens.length) | 0], 0.82);
      g.lineWidth = 1.6 + r() * 1.4;
      g.beginPath();
      g.moveTo(gx, baseY + 4);
      g.quadraticCurveTo(gx + (r() - 0.5) * 8, baseY - gh * 0.5, gx + (r() - 0.5) * 14, baseY - gh);
      g.stroke();
    }
  };

  // Tier 0: Small decorative field stones/pebbles (non-collidable)
  for (let v = 0; v < 4; v++) {
    const c = cnv(112, 68);
    paintBoulder(c, 400 + v * 29, 0.52, false);
    reg('pebble' + v, c, 90, 0.5, 0.92);
    ART.tex['rock' + v] = ART.tex['pebble' + v];
    ART.meta['rock' + v] = ART.meta['pebble' + v];
  }

  // Tier 1: Jumpable Field Rocks (visual h ~ 0.88m at scale 1.0, cleanly cleared by 1.05m horse leap!)
  for (let v = 0; v < 4; v++) {
    const c = cnv(212, 120);
    paintBoulder(c, 440 + v * 31, 0.66, v % 2 === 0);
    reg('lowRock' + v, c, 88, 0.5, 0.92);
  }

  // Tier 2: Large Solid Field Boulders / Crags (visual h ~ 2.4m at scale 1.0, unmistakably impassable!)
  for (let v = 0; v < 4; v++) {
    const c = cnv(308, 252);
    paintBoulder(c, 480 + v * 43, 0.78, true);
    reg('bigRock' + v, c, 82, 0.5, 0.92);
  }

  // Lush Painterly Broadleaf Meadow Oaks (treeOak0, treeOak1)
  for (let v = 0; v < 2; v++) {
    const Wc = 440;
    const Hc = 520;
    const c = cnv(Wc, Hc);
    const g = c.getContext('2d')!;
    const r = rng(510 + v * 47);

    // Trunk & gnarled oak boughs with root flare
    const drawBark = (x0: number, y0: number, x1: number, y1: number, w0: number, w1: number) => {
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      const tg = g.createLinearGradient(x0 - nx * w0, y0 - ny * w0, x0 + nx * w0, y0 + ny * w0);
      tg.addColorStop(0, '#332418');
      tg.addColorStop(0.55, '#543c28');
      tg.addColorStop(0.88, '#7a5c3e');
      tg.addColorStop(1, '#98744f');
      g.fillStyle = tg;
      poly(g, [
        [x0 - nx * (w0 / 2), y0 - ny * (w0 / 2)],
        [x1 - nx * (w1 / 2), y1 - ny * (w1 / 2)],
        [x1 + nx * (w1 / 2), y1 + ny * (w1 / 2)],
        [x0 + nx * (w0 / 2), y0 + ny * (w0 / 2)],
      ]);
      g.fill();
    };

    const tx = Wc / 2 + (v === 0 ? -6 : 8);
    // Root flares
    drawBark(tx - 10, Hc - 44, tx - 38, Hc - 2, 16, 6);
    drawBark(tx + 10, Hc - 44, tx + 42, Hc - 2, 16, 6);
    drawBark(tx, Hc - 30, tx + 6, Hc - 2, 22, 14);
    // Main trunk
    drawBark(tx, Hc - 8, tx + (v === 0 ? 6 : -8), Hc - 205, 42, 26);

    // Primary & secondary limbs
    const boughs: [number, number, number, number, number, number][] = [
      [tx + 2, Hc - 188, tx - 92, Hc - 295, 20, 8],
      [tx + 4, Hc - 196, tx + 96, Hc - 305, 19, 8],
      [tx, Hc - 200, tx - 14, Hc - 355, 17, 7],
      [tx - 48, Hc - 246, tx - 125, Hc - 265, 11, 4],
      [tx + 52, Hc - 252, tx + 132, Hc - 270, 11, 4],
    ];
    for (const [x0, y0, x1, y1, w0, w1] of boughs) drawBark(x0, y0, x1, y1, w0, w1);

    // Multi-layered painterly foliage clusters (back shadow -> mid -> sunlit gold-green crowns!)
    const clusters: { x: number; y: number; rx: number; ry: number }[] = [];
    for (let i = 0; i < 62; i++) {
      const a = r() * Math.PI * 2;
      const dist = Math.sqrt(r());
      const cx = Wc / 2 + Math.cos(a) * 165 * dist;
      const cy = 205 + Math.sin(a) * 135 * dist - (1 - dist) * 28;
      if (cy > 340) continue;
      clusters.push({ x: cx, y: cy, rx: 22 + r() * 34, ry: 18 + r() * 26 });
    }
    // Pass 1: Deep forest-shadow canopy mass
    for (const cl of clusters) {
      g.fillStyle = radial(g, cl.x, cl.y + 8, cl.rx * 1.15, [
        [0, 'rgba(30,48,22,0.92)'],
        [0.75, 'rgba(38,58,26,0.75)'],
        [1, 'rgba(38,58,26,0)'],
      ]);
      ellipseP(g, cl.x, cl.y + 8, cl.rx * 1.1, cl.ry * 1.05);
      g.fill();
    }
    // Pass 2: Rich mid-meadow olive canopy
    for (const cl of clusters) {
      const col = mix3([52, 78, 32], [86, 112, 46], r());
      g.fillStyle = radial(g, cl.x + 6, cl.y - 4, cl.rx, [
        [0, rgba(col, 0.94)],
        [0.72, rgba(sh(col, 0.8), 0.72)],
        [1, rgba(col, 0)],
      ]);
      ellipseP(g, cl.x + 4, cl.y - 3, cl.rx * 0.95, cl.ry * 0.9);
      g.fill();
    }
    // Pass 3: Sunlit golden-hour upper-right leaf highlights
    for (const cl of clusters) {
      if (cl.x < Wc * 0.34 && cl.y > 220) continue;
      const sunFactor = clamp((cl.x / Wc) * 0.8 + (1 - cl.y / 360) * 0.7, 0, 1);
      if (r() > sunFactor + 0.15) continue;
      const col = mix3([118, 138, 56], [174, 168, 76], sunFactor * r());
      g.fillStyle = radial(g, cl.x + 12, cl.y - 10, cl.rx * 0.78, [
        [0, rgba(col, 0.88)],
        [0.7, rgba(col, 0.35)],
        [1, rgba(col, 0)],
      ]);
      ellipseP(g, cl.x + 10, cl.y - 9, cl.rx * 0.72, cl.ry * 0.65);
      g.fill();
    }
    // Pass 4: Crisp painterly outer leaf speckles
    for (let i = 0; i < 180; i++) {
      const cl = clusters[(r() * clusters.length) | 0];
      const lx = cl.x + (r() - 0.5) * cl.rx * 1.8;
      const ly = cl.y + (r() - 0.5) * cl.ry * 1.6;
      const lit = lx > Wc * 0.45 && ly < 260;
      g.fillStyle = lit
        ? `rgba(${132 + (r() * 48) | 0},${148 + (r() * 34) | 0},${58 + (r() * 24) | 0},0.85)`
        : `rgba(${42 + (r() * 34) | 0},${64 + (r() * 34) | 0},${26 + (r() * 18) | 0},0.8)`;
      ellipseP(g, lx, ly, 3 + r() * 5, 2 + r() * 4, r() * 3.14);
      g.fill();
    }
    // Grass blades at tree root base
    g.lineCap = 'round';
    for (let i = 0; i < 24; i++) {
      const gx = tx + (r() - 0.5) * 86;
      const gh = 14 + r() * 22;
      g.strokeStyle = rgba(greens[(r() * greens.length) | 0], 0.85);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(gx, Hc);
      g.lineTo(gx + (r() - 0.5) * 14, Hc - gh);
      g.stroke();
    }

    reg('treeOak' + v, c, 34, 0.5, 0.99);
    ART.tex['tree' + v] = ART.tex['treeOak' + v];
    ART.meta['tree' + v] = ART.meta['treeOak' + v];
  }

  // Tall Wall Maria Conifers / Hillside Pines (treePine0, treePine1)
  for (let v = 0; v < 2; v++) {
    const Wc = 320;
    const Hc = 560;
    const c = cnv(Wc, Hc);
    const g = c.getContext('2d')!;
    const r = rng(560 + v * 59);
    const cx = Wc / 2;

    // Rugged reddish-brown pine trunk
    const tg = g.createLinearGradient(cx - 14, 0, cx + 14, 0);
    tg.addColorStop(0, '#342218');
    tg.addColorStop(0.6, '#5c3c28');
    tg.addColorStop(1, '#845a3a');
    g.fillStyle = tg;
    poly(g, [
      [cx - 5, 70],
      [cx + 5, 70],
      [cx + 18, Hc - 2],
      [cx - 18, Hc - 2],
    ]);
    g.fill();

    // Layered pine bough tiers from bottom to crown
    const tiers = 13;
    for (let t = 0; t < tiers; t++) {
      const k = t / (tiers - 1); // 0 = bottom, 1 = spire top
      const y = lerp(Hc - 108, 42, k);
      const halfW = lerp(128, 16, Math.pow(k, 0.86)) * (0.88 + r() * 0.24);
      const droop = lerp(34, 8, k);

      // Deep cool pine under-shadow
      g.fillStyle = `rgba(${28 + (k * 12) | 0},${48 + (k * 12) | 0},${30 + (k * 8) | 0},0.94)`;
      poly(g, [
        [cx, y - 24],
        [cx + halfW, y + droop],
        [cx + halfW * 0.45, y + droop * 0.65],
        [cx, y + droop * 0.95],
        [cx - halfW * 0.45, y + droop * 0.65],
        [cx - halfW, y + droop],
      ]);
      g.fill();

      // Painterly needle fronds across the tier
      const fronds = Math.max(8, Math.round(halfW * 0.35));
      for (let i = 0; i < fronds; i++) {
        const u = (i / (fronds - 1)) * 2 - 1; // -1..1
        const fx = cx + u * halfW * 0.94;
        const fy = y + Math.abs(u) * droop * 0.7 + (r() - 0.5) * 14;
        const lit = u > -0.15;
        const col = lit
          ? mix3([56, 84, 42], [116, 134, 62], clamp((u + 0.2) * 0.8 + k * 0.3, 0, 1))
          : [34, 54, 32];
        g.fillStyle = rgba(col, 0.9);
        ellipseP(g, fx, fy, 10 + r() * 14, 6 + r() * 9, u * 0.45);
        g.fill();
      }
    }

    // Root grass
    for (let i = 0; i < 18; i++) {
      const gx = cx + (r() - 0.5) * 56;
      g.strokeStyle = rgba(greens[(r() * greens.length) | 0], 0.85);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(gx, Hc);
      g.lineTo(gx + (r() - 0.5) * 10, Hc - 12 - r() * 18);
      g.stroke();
    }
    reg('treePine' + v, c, 32, 0.5, 0.99);
  }

  // Windswept dead/autumn battlefield tree (treeDead0)
  {
    const Wc = 340;
    const Hc = 460;
    const c = cnv(Wc, Hc);
    const g = c.getContext('2d')!;
    const r = rng(595);
    g.lineCap = 'round';
    const branch = (x: number, y: number, a: number, l: number, w: number, d: number) => {
      const x2 = x + Math.cos(a) * l;
      const y2 = y + Math.sin(a) * l;
      g.strokeStyle = d > 3 ? '#4c3b2c' : '#634f3d';
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x2, y2);
      g.stroke();
      // Sunlit right highlight on thick branches
      if (w > 5) {
        g.strokeStyle = 'rgba(210,180,140,0.32)';
        g.lineWidth = Math.max(1.5, w * 0.26);
        g.beginPath();
        g.moveTo(x + w * 0.25, y);
        g.lineTo(x2 + w * 0.22, y2);
        g.stroke();
      }
      if (d > 0) {
        branch(x2, y2, a - 0.28 - r() * 0.38, l * 0.73, w * 0.68, d - 1);
        branch(x2, y2, a + 0.26 + r() * 0.36, l * 0.71, w * 0.66, d - 1);
      } else if (r() < 0.45) {
        g.fillStyle = `rgba(${148 + (r() * 45) | 0},${118 + (r() * 35) | 0},${48 + (r() * 20) | 0},0.72)`;
        ellipseP(g, x2, y2, 7 + r() * 10, 5 + r() * 7, r() * 3.14);
        g.fill();
      }
    };
    branch(Wc / 2, Hc - 2, -Math.PI / 2 + 0.06, 138, 24, 5);
    reg('treeDead0', c, 36, 0.5, 0.99);
  }

  // Lush meadow bushes (3 variants)
  for (let v = 0; v < 3; v++) {
    const c = cnv(180, 124);
    const g = c.getContext('2d')!;
    const r = rng(600 + v * 29);
    for (let i = 0; i < 52; i++) {
      const x = 90 + (r() - 0.5) * 136;
      const arch = Math.sin(clamp((x - 16) / 148, 0, 1) * Math.PI);
      const y = 122 - r() * 88 * arch;
      const rr = 10 + r() * 18;
      const lit = clamp((x / 180) * 0.6 + (1 - y / 124) * 0.65, 0, 1);
      const col = mix3([42, 62, 26], [134, 144, 64], lit * (0.4 + r() * 0.6));
      g.fillStyle = rgba(col, 0.92);
      g.beginPath();
      g.arc(x, Math.max(y, 22), rr, 0, 6.29);
      g.fill();
    }
    if (v === 2) {
      for (let i = 0; i < 12; i++) {
        g.fillStyle = 'rgba(246,232,190,0.85)';
        g.beginPath();
        g.arc(44 + r() * 96, 40 + r() * 58, 2.5 + r() * 2, 0, 6.29);
        g.fill();
      }
    }
    reg('bush' + v, c, 62, 0.5, 0.98);
  }

  // Ammo boulder (for Cart Titan, Beast hands, & boulder depot)
  {
    const c = cnv(176, 176);
    const g = c.getContext('2d')!;
    const r = rng(77);
    const pts: [number, number][] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const rr = 74 + r() * 10;
      pts.push([88 + Math.cos(a) * rr, 88 + Math.sin(a) * rr]);
    }
    const lg = g.createRadialGradient(112, 60, 12, 88, 88, 88);
    lg.addColorStop(0, '#cfc3b0');
    lg.addColorStop(0.5, '#8c8375');
    lg.addColorStop(1, '#443e37');
    g.fillStyle = lg;
    poly(g, pts);
    g.fill();
    g.strokeStyle = 'rgba(42,36,30,0.62)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(42, 54);
    g.lineTo(86, 92);
    g.lineTo(132, 74);
    g.moveTo(86, 92);
    g.lineTo(96, 152);
    g.stroke();
    reg('boulder', c, 84, 0.5, 0.5);
  }
}

/* ---------- 5. HORSE & SURVEY CORPS RIDER (10X POLISHED) ---------- */
function drawHorseFrame(g: CanvasRenderingContext2D, coat: number[], ph: number, yw: number): void {
  const cx = 200;
  const gy = 470;
  const k = HPPM;
  const R = (mx: number, my: number): [number, number] => [cx + mx * k, gy - my * k];
  const Fp = (mx: number, my: number): [number, number] => [
    cx + mx * k * 0.8 + yw * k,
    gy - 0.74 * k - my * k * 0.8,
  ];
  const Np = (mx: number, my: number): [number, number] => [
    cx + mx * k * 0.72 + yw * 1.35 * k,
    gy - 1.0 * k - my * k * 0.72,
  ];
  const bob = Math.sin(ph * 2) * 0.04;
  const base = coat;
  const dark = sh(coat, 0.52);
  const mid = sh(coat, 0.82);
  const light = sh(coat, 1.32);
  const hoof = [24, 19, 16];
  const hair = [28, 20, 16];
  const lift = (off: number) => Math.max(0, Math.sin(ph + off)) * 0.44;
  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Front legs (articulated shoulder -> knee -> fetlock -> hoof)
  for (const [lx, off] of [
    [-0.17, 2.6],
    [0.17, 3.3],
  ]) {
    const l = lift(off);
    const a = Fp(lx, 1.02 + bob);
    const kn = Fp(lx * 1.06, 0.46 + l * 0.72);
    const b = Fp(lx * 1.05, l);
    g.strokeStyle = rgba(dark);
    g.lineWidth = 0.092 * k;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(kn[0], kn[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
    g.fillStyle = rgba(hoof);
    ellipseP(g, b[0], b[1], 0.056 * k, 0.042 * k);
    g.fill();
  }

  // Muscular neck, head, bridle & pricked ears
  const n0 = Fp(0, 1.54 + bob);
  const n1 = Np(0, 2.02 + bob + Math.sin(ph) * 0.045);
  const neckG = g.createLinearGradient(n0[0] - 0.18 * k, n0[1], n0[0] + 0.18 * k, n0[1]);
  neckG.addColorStop(0, rgba(mid));
  neckG.addColorStop(0.6, rgba(base));
  neckG.addColorStop(1, rgba(light));
  g.fillStyle = neckG;
  poly(g, [
    [n0[0] - 0.18 * k, n0[1]],
    [n1[0] - 0.095 * k, n1[1]],
    [n1[0] + 0.095 * k, n1[1]],
    [n0[0] + 0.18 * k, n0[1]],
  ]);
  g.fill();
  g.fillStyle = rgba(sh(base, 0.92));
  ellipseP(g, n1[0], n1[1], 0.115 * k, 0.135 * k);
  g.fill();
  // Bridle strap across crown
  g.strokeStyle = 'rgba(52,32,20,0.85)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(n1[0] - 0.1 * k, n1[1]);
  g.lineTo(n1[0] + 0.1 * k, n1[1]);
  g.stroke();
  // Ears
  g.fillStyle = rgba(dark);
  for (const sd of [-1, 1]) {
    poly(g, [
      [n1[0] + sd * 0.05 * k, n1[1] - 0.08 * k],
      [n1[0] + sd * 0.105 * k, n1[1] - 0.25 * k],
      [n1[0] + sd * 0.115 * k, n1[1] - 0.07 * k],
    ]);
    g.fill();
  }
  // Windswept mane strands
  g.strokeStyle = rgba(hair);
  g.lineWidth = 3.2;
  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const x = lerp(n0[0], n1[0], t);
    const y = lerp(n0[1], n1[1], t);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 5, y + 3, x + (8 + Math.sin(ph + i) * 5), y + 8);
    g.stroke();
  }

  // Barrel flanks (left shaded, right catching golden afternoon sun!)
  const side = (sd: number) => {
    const lg = g.createLinearGradient(R(sd * 0.35, 1)[0], 0, R(0, 1)[0], 0);
    lg.addColorStop(0, rgba(sd > 0 ? mid : dark));
    lg.addColorStop(1, rgba(sd > 0 ? light : base));
    g.fillStyle = lg;
    poly(g, [
      R(sd * 0.35, 0.98 + bob),
      R(sd * 0.36, 1.56 + bob),
      Fp(sd * 0.29, 1.62 + bob),
      Fp(sd * 0.29, 1.02 + bob),
    ]);
    g.fill();
  };
  side(-1);
  side(1);

  // Back & Survey Corps saddlecloth / leather saddle
  const tg = g.createLinearGradient(0, R(0, 1.56)[1], 0, Fp(0, 1.62)[1]);
  tg.addColorStop(0, rgba(light));
  tg.addColorStop(1, rgba(base));
  g.fillStyle = tg;
  poly(g, [
    R(-0.36, 1.56 + bob),
    Fp(-0.29, 1.62 + bob),
    Fp(0.29, 1.62 + bob),
    R(0.36, 1.56 + bob),
  ]);
  g.fill();

  // Olive Scout saddlecloth + dark leather saddle flaps
  g.fillStyle = 'rgba(54,68,46,0.92)';
  for (const sd of [-1, 1]) {
    poly(g, [
      Fp(sd * 0.3, 1.57 + bob),
      Fp(sd * 0.31, 1.18 + bob),
      R(sd * 0.37, 1.22 + bob),
      R(sd * 0.37, 1.52 + bob),
    ]);
    g.fill();
  }
  g.fillStyle = 'rgba(56,34,18,0.95)';
  for (const sd of [-1, 1]) {
    poly(g, [
      Fp(sd * 0.29, 1.55 + bob),
      Fp(sd * 0.3, 1.26 + bob),
      R(sd * 0.35, 1.3 + bob),
      R(sd * 0.35, 1.51 + bob),
    ]);
    g.fill();
  }

  // Muscular hind legs
  for (const [lx, off] of [
    [-0.2, 0],
    [0.2, 0.9],
  ]) {
    const l = lift(off);
    const a = R(lx, 1.0 + bob);
    const kn = R(lx * 1.18, 0.52 + l * 0.62);
    const b = R(lx * 1.1, l);
    g.strokeStyle = rgba(lx > 0 ? mid : dark);
    g.lineWidth = 0.125 * k;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(kn[0], kn[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
    g.strokeStyle = rgba(sh(dark, 0.72));
    g.lineWidth = 0.08 * k;
    g.beginPath();
    g.moveTo(kn[0], kn[1]);
    g.lineTo(b[0], b[1] - 0.055 * k);
    g.stroke();
    g.fillStyle = rgba(hoof);
    ellipseP(g, b[0], b[1], 0.068 * k, 0.048 * k);
    g.fill();
  }

  // Sculpted muscular hindquarters (with warm sunlit right rim highlight)
  const rp = R(0, 1.27 + bob);
  for (const sd of [-1, 1]) {
    g.fillStyle = radial(
      g,
      rp[0] + (sd > 0 ? 0.2 : 0.05) * k,
      rp[1] - 0.16 * k,
      0.42 * k,
      [
        [0, rgba(sd > 0 ? sh(light, 1.08) : light)],
        [0.52, rgba(base)],
        [1, rgba(dark)],
      ]
    );
    ellipseP(g, rp[0] + sd * 0.175 * k, rp[1], 0.22 * k, 0.335 * k);
    g.fill();
  }
  // Subtle golden rim sheen on right haunch
  g.strokeStyle = 'rgba(255,234,196,0.34)';
  g.lineWidth = 3.5;
  g.beginPath();
  g.arc(rp[0] + 0.17 * k, rp[1], 0.21 * k, -0.9, 0.8);
  g.stroke();

  g.strokeStyle = rgba(sh(dark, 0.78));
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(rp[0], rp[1] - 0.26 * k);
  g.quadraticCurveTo(rp[0] + 2, rp[1], rp[0], rp[1] + 0.3 * k);
  g.stroke();

  // Flowing horse tail
  const tb = R(0, 1.47 + bob);
  const sw = Math.sin(ph) * 0.14;
  for (let i = 0; i < 26; i++) {
    const o = (i - 13) / 13;
    g.strokeStyle = rgba(sh(hair, 0.75 + (i % 3) * 0.18));
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(tb[0] + o * 4.5, tb[1]);
    g.bezierCurveTo(
      tb[0] + o * 11 + sw * 0.3 * k,
      tb[1] + 0.22 * k,
      tb[0] + o * 17 + sw * 0.85 * k,
      tb[1] + 0.48 * k,
      tb[0] + o * 15 + sw * 1.15 * k,
      tb[1] + 0.76 * k + Math.abs(o) * -10
    );
    g.stroke();
  }
}

function drawRiderFrame(g: CanvasRenderingContext2D, ph: number): void {
  const k = HPPM;
  const cx = 80;
  const oy = 2.52;
  const X = (m: number) => cx + m * k;
  const Y = (m: number) => (oy - m) * k;
  g.lineCap = 'round';
  g.lineJoin = 'round';

  const pants = [222, 214, 198]; // Iconic Survey Corps off-white riding breeches!
  const boot = [34, 24, 18];
  const jacket = [138, 94, 54];
  const strap = [76, 48, 28];
  const metal = [140, 146, 154];

  // Legs, tall riding boots, leather ODM harness & twin steel hip scabbards!
  for (const sd of [-1, 1]) {
    g.strokeStyle = rgba(sh(pants, sd > 0 ? 1.0 : 0.86));
    g.lineWidth = 0.135 * k;
    g.beginPath();
    g.moveTo(X(sd * 0.28), Y(1.5));
    g.lineTo(X(sd * 0.36), Y(1.08));
    g.stroke();

    g.strokeStyle = rgba(boot);
    g.lineWidth = 0.12 * k;
    g.beginPath();
    g.moveTo(X(sd * 0.36), Y(1.1));
    g.lineTo(X(sd * 0.34), Y(0.82));
    g.stroke();

    // ODM thigh straps
    g.strokeStyle = rgba(strap);
    g.lineWidth = 0.024 * k;
    g.beginPath();
    g.moveTo(X(sd * 0.24), Y(1.38));
    g.lineTo(X(sd * 0.39), Y(1.3));
    g.moveTo(X(sd * 0.29), Y(1.22));
    g.lineTo(X(sd * 0.4), Y(1.18));
    g.stroke();

    // ODM hip blade scabbard box + gas cylinder with steel sheen
    g.fillStyle = radial(g, X(sd * 0.32), Y(1.57), 0.14 * k, [
      [0, rgba(sh(metal, 1.45))],
      [0.65, rgba(metal)],
      [1, rgba(sh(metal, 0.55))],
    ]);
    g.fillRect(X(sd * 0.31) - 0.075 * k, Y(1.66), 0.15 * k, 0.23 * k);
    g.strokeStyle = 'rgba(40,44,50,0.7)';
    g.lineWidth = 1.5;
    g.strokeRect(X(sd * 0.31) - 0.075 * k, Y(1.66), 0.15 * k, 0.23 * k);
  }

  // Tan Survey Corps cropped jacket & arms holding reins
  g.fillStyle = rgba(jacket);
  poly(g, [
    [X(-0.2), Y(1.48)],
    [X(0.2), Y(1.48)],
    [X(0.25), Y(2.08)],
    [X(-0.25), Y(2.08)],
  ]);
  g.fill();
  for (const sd of [-1, 1]) {
    g.strokeStyle = rgba(sh(jacket, sd > 0 ? 1.05 : 0.78));
    g.lineWidth = 0.11 * k;
    g.beginPath();
    g.moveTo(X(sd * 0.25), Y(2.02));
    g.lineTo(X(sd * 0.32), Y(1.73));
    g.lineTo(X(sd * 0.19), Y(1.62));
    g.stroke();
    g.fillStyle = '#dcb08c';
    ellipseP(g, X(sd * 0.18), Y(1.62), 0.04 * k, 0.035 * k);
    g.fill();
  }

  // Billowing Emerald Survey Corps Cloak!
  const N = 9;
  const t = ph;
  const bx = (i: number) => -0.35 + (i / (N - 1)) * 0.7;
  const by = (i: number) =>
    1.45 + Math.sin(t + i * 1.2) * 0.044 + Math.sin(t * 0.5 + i * 0.7) * 0.022;
  const capeTop = 2.09;
  const cg = g.createLinearGradient(X(-0.35), Y(capeTop), X(0.35), Y(1.45));
  cg.addColorStop(0, '#22542e');
  cg.addColorStop(0.55, '#2f723e');
  cg.addColorStop(0.88, '#418c50');
  cg.addColorStop(1, '#58a264');
  g.fillStyle = cg;
  g.beginPath();
  g.moveTo(X(-0.26), Y(capeTop));
  g.lineTo(X(0.26), Y(capeTop));
  g.quadraticCurveTo(X(0.35), Y(1.8), X(bx(N - 1)), Y(by(N - 1)));
  for (let i = N - 2; i >= 0; i--) {
    const xm = (bx(i) + bx(i + 1)) / 2;
    g.quadraticCurveTo(X(xm), Y(Math.max(by(i), by(i + 1)) + 0.024), X(bx(i)), Y(by(i)));
  }
  g.quadraticCurveTo(X(-0.35), Y(1.8), X(-0.26), Y(capeTop));
  g.fill();

  // Deep cloth folds & sunlit ridges
  g.strokeStyle = 'rgba(14,42,22,0.58)';
  g.lineWidth = 2.3;
  for (let i = 1; i < N - 1; i += 2) {
    g.beginPath();
    g.moveTo(X(bx(i) * 0.55), Y(capeTop - 0.05));
    g.quadraticCurveTo(X(bx(i) * 0.85 + Math.sin(t + i) * 0.02), Y(1.75), X(bx(i)), Y(by(i) + 0.02));
    g.stroke();
  }
  g.strokeStyle = 'rgba(136,204,142,0.28)';
  g.lineWidth = 2.8;
  for (let i = 2; i < N - 1; i += 2) {
    g.beginPath();
    g.moveTo(X(bx(i) * 0.5), Y(capeTop - 0.05));
    g.quadraticCurveTo(X(bx(i) * 0.8), Y(1.75), X(bx(i)), Y(by(i) + 0.03));
    g.stroke();
  }

  // Iconic "Wings of Freedom" crest subtly painted on the Scout cloak back!
  const wx = X(0) + Math.sin(t) * 1.5;
  const wy = Y(1.82);
  // Dark shield backing
  g.fillStyle = 'rgba(20,32,26,0.55)';
  poly(g, [
    [wx - 0.11 * k, wy - 0.11 * k],
    [wx + 0.11 * k, wy - 0.11 * k],
    [wx + 0.095 * k, wy + 0.04 * k],
    [wx, wy + 0.13 * k],
    [wx - 0.095 * k, wy + 0.04 * k],
  ]);
  g.fill();
  // Slate-blue left wing
  g.fillStyle = '#385896';
  poly(g, [
    [wx + 0.01 * k, wy + 0.09 * k],
    [wx - 0.095 * k, wy - 0.06 * k],
    [wx - 0.02 * k, wy - 0.095 * k],
    [wx + 0.04 * k, wy + 0.04 * k],
  ]);
  g.fill();
  // Bright white right wing overlapping
  g.fillStyle = '#f2efe6';
  poly(g, [
    [wx - 0.01 * k, wy + 0.09 * k],
    [wx + 0.095 * k, wy - 0.06 * k],
    [wx + 0.02 * k, wy - 0.095 * k],
    [wx - 0.04 * k, wy + 0.04 * k],
  ]);
  g.fill();

  // Rolled cloak hood collar, white cravat, neck & head with golden rim light
  g.fillStyle = '#265f34';
  ellipseP(g, X(0), Y(capeTop), 0.245 * k, 0.054 * k);
  g.fill();
  g.fillStyle = '#f2eee4';
  g.fillRect(X(-0.075), Y(capeTop + 0.065), 0.15 * k, 0.062 * k);
  g.fillStyle = '#d8ac88';
  ellipseP(g, X(0), Y(2.17), 0.05 * k, 0.06 * k);
  g.fill();
  g.fillStyle = radial(g, X(0.04), Y(2.34), 0.17 * k, [
    [0, '#6e492e'],
    [0.55, '#422a1b'],
    [1, '#23150d'],
  ]);
  ellipseP(g, X(0), Y(2.29), 0.122 * k, 0.138 * k);
  g.fill();
  g.fillStyle = '#d8ac88';
  ellipseP(g, X(-0.118), Y(2.27), 0.022 * k, 0.04 * k);
  g.fill();
  ellipseP(g, X(0.118), Y(2.27), 0.022 * k, 0.04 * k);
  g.fill();
}

function artRiders(): void {
  HORSE_VIEWS.forEach((yw, vi) => {
    for (let f = 0; f < 8; f++) {
      const c = cnv(400, 480);
      drawHorseFrame(c.getContext('2d')!, [236, 228, 218], (f / 8) * Math.PI * 2, yw);
      reg(`horse${vi}_${f}`, c, HPPM, 200 / 400, 470 / 480);
    }
  });
  for (let f = 0; f < 6; f++) {
    const c = cnv(160, 294);
    drawRiderFrame(c.getContext('2d')!, (f / 6) * Math.PI * 2);
    reg('rider' + f, c, HPPM, 0.5, ((2.52 - 1.45) * HPPM) / 294);
  }

  // Fallen horse
  let c = cnv(420, 200);
  let g = c.getContext('2d')!;
  g.lineCap = 'round';
  g.strokeStyle = '#555';
  g.lineWidth = 14;
  for (const [x, a] of [
    [120, -0.6],
    [170, -0.2],
    [250, 0.3],
    [300, 0.7],
  ]) {
    g.beginPath();
    g.moveTo(x, 120);
    g.lineTo(x + Math.sin(a) * 70, 120 - Math.cos(a) * 70);
    g.stroke();
  }
  g.fillStyle = radial(g, 215, 118, 190, [
    [0, '#e6e0d6'],
    [0.65, '#b6aea2'],
    [1, '#7a7268'],
  ]);
  ellipseP(g, 210, 140, 175, 58);
  g.fill();
  ellipseP(g, 370, 120, 45, 32);
  g.fill();
  // Fallen saddle patch
  g.fillStyle = 'rgba(56,34,18,0.85)';
  ellipseP(g, 215, 118, 48, 22);
  g.fill();
  reg('horseFall', c, HPPM, 0.5, 0.95);

  // Thrown Scout rider
  c = cnv(320, 124);
  g = c.getContext('2d')!;
  g.lineCap = 'round';
  g.strokeStyle = '#dcd4c4';
  g.lineWidth = 22;
  g.beginPath();
  g.moveTo(68, 70);
  g.lineTo(152, 62);
  g.moveTo(64, 52);
  g.lineTo(144, 42);
  g.stroke();
  g.strokeStyle = '#261a12';
  g.lineWidth = 20;
  g.beginPath();
  g.moveTo(50, 72);
  g.lineTo(90, 68);
  g.moveTo(46, 54);
  g.lineTo(86, 48);
  g.stroke();
  g.fillStyle = '#2f6f3e';
  ellipseP(g, 192, 60, 72, 35);
  g.fill();
  g.fillStyle = '#8e5e36';
  g.fillRect(172, 30, 58, 18);
  g.fillStyle = '#2a1a10';
  ellipseP(g, 268, 58, 22, 20);
  g.fill();
  reg('riderFall', c, HPPM, 0.5, 0.7);

  // Captain Levi (ODM spinning blur silhouette with twin gleaming steel blades!)
  c = cnv(180, 180);
  g = c.getContext('2d')!;
  g.lineCap = 'round';
  // Twin ultrahard steel blades
  g.strokeStyle = '#eef4fa';
  g.lineWidth = 3.5;
  g.shadowColor = '#ffffff';
  g.shadowBlur = 6;
  g.beginPath();
  g.moveTo(52, 98);
  g.lineTo(8, 66);
  g.moveTo(128, 98);
  g.lineTo(172, 68);
  g.stroke();
  g.shadowBlur = 0;
  // Swirling emerald Survey Corps cloak
  g.fillStyle = '#2e703d';
  poly(g, [
    [76, 66],
    [104, 66],
    [142, 132],
    [42, 136],
  ]);
  g.fill();
  g.fillStyle = '#ece6d8';
  g.fillRect(78, 118, 10, 36);
  g.fillRect(92, 118, 10, 36);
  g.fillStyle = '#1e1612';
  ellipseP(g, 90, 54, 14, 15);
  g.fill();
  g.strokeStyle = '#70767e';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(68, 108);
  g.lineTo(112, 108);
  g.stroke();
  reg('levi', c, 84, 0.5, 0.5);
}

/* ---------- 6. PURE TITANS (8 HAUNTING VARIANTS) ---------- */
function artTitans(): void {
  const skins = [
    [226, 174, 142],
    [206, 152, 118],
    [236, 192, 162],
    [192, 138, 108],
    [214, 160, 130],
    [224, 168, 150],
    [202, 162, 124],
    [232, 182, 152],
  ];
  for (let v = 0; v < 8; v++) {
    const r = rng(900 + v * 7);
    const h = 15;
    const fat = 0.75 + r() * 0.65;
    const headK = 0.08 + r() * 0.05;
    const armL = 0.9 + r() * 0.35;
    const w = h * 0.3 * fat;
    const k = TPPM;
    const Wc = Math.ceil((w * 1.65 + 4) * k);
    const Hc = Math.ceil((h * 1.14 + 1) * k);
    const c = cnv(Wc, Hc);
    const g = c.getContext('2d')!;
    const cx = Wc / 2;
    const gy = Hc - 0.3 * k;
    const X = (m: number) => cx + m * k;
    const Y = (m: number) => gy - m * k;
    const skin = skins[v];
    const sd = sh(skin, 0.68);
    const sl = sh(skin, 1.14);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const limb = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, wd: number, col: number[]) => {
      g.strokeStyle = rgba(col);
      g.lineWidth = wd * k;
      g.beginPath();
      g.moveTo(X(x0), Y(y0));
      g.quadraticCurveTo(X(x1), Y(y1), X(x2), Y(y2));
      g.stroke();
    };

    for (const s of [-1, 1]) {
      limb(s * w * 0.25, h * 0.48, s * w * 0.36, h * 0.25, s * w * 0.3, 0.35, w * 0.3, sd);
      limb(s * w * 0.25, h * 0.48, s * w * 0.33, h * 0.26, s * w * 0.29, 0.4, w * 0.22, skin);
      g.fillStyle = rgba(sd);
      ellipseP(g, X(s * w * 0.33), Y(0.25), w * 0.2 * k, 0.28 * k);
      g.fill();
    }

    // Torso with collarbones, pectoral/rib anatomy & belly
    g.fillStyle = radial(g, X(w * 0.14), Y(h * 0.68), w * 0.78 * k, [
      [0, rgba(sl)],
      [0.58, rgba(skin)],
      [1, rgba(sd)],
    ]);
    ellipseP(g, X(0), Y(h * 0.62), w * 0.51 * k, h * 0.185 * k);
    g.fill();
    g.fillStyle = radial(g, X(w * 0.1), Y(h * 0.52), w * 0.52 * k, [
      [0, rgba(skin)],
      [1, rgba(sd)],
    ]);
    ellipseP(g, X(0), Y(h * 0.52), w * (0.38 + fat * 0.07) * k, h * 0.085 * k);
    g.fill();

    // Clavicle & rib shadows
    g.strokeStyle = rgba(sh(skin, 0.58), 0.52);
    g.lineWidth = 0.075 * k;
    g.beginPath();
    g.moveTo(X(-w * 0.34), Y(h * 0.74));
    g.quadraticCurveTo(X(0), Y(h * 0.715), X(w * 0.34), Y(h * 0.74));
    g.stroke();
    if (fat < 1.05) {
      for (let i = 0; i < 4; i++) {
        const yy = h * (0.66 - i * 0.03);
        g.beginPath();
        g.moveTo(X(-w * 0.3), Y(yy));
        g.quadraticCurveTo(X(0), Y(yy - 0.28), X(w * 0.3), Y(yy));
        g.stroke();
      }
    }
    g.fillStyle = rgba(sh(skin, 0.54));
    ellipseP(g, X(0), Y(h * 0.5), 0.12 * k, 0.16 * k);
    g.fill();

    // Arms hanging eerily
    for (const s of [-1, 1]) {
      const a = 0.1 + r() * 0.15;
      const L = h * 0.17 * armL;
      const ex = s * (w * 0.5 + Math.sin(a) * L);
      const ey = h * 0.76 - Math.cos(a) * L;
      const hx = ex + s * Math.sin(a * 1.4) * L * 0.95;
      const hy = ey - Math.cos(a * 1.4) * L * 0.95;
      g.strokeStyle = rgba(sd);
      g.lineWidth = w * 0.2 * k;
      g.beginPath();
      g.moveTo(X(s * w * 0.48), Y(h * 0.76));
      g.lineTo(X(ex), Y(ey));
      g.lineTo(X(hx), Y(hy));
      g.stroke();
      g.strokeStyle = rgba(skin);
      g.lineWidth = w * 0.14 * k;
      g.beginPath();
      g.moveTo(X(s * w * 0.46), Y(h * 0.765));
      g.lineTo(X(ex), Y(ey));
      g.lineTo(X(hx), Y(hy));
      g.stroke();
      g.fillStyle = rgba(sd);
      ellipseP(g, X(hx), Y(hy), w * 0.12 * k, w * 0.15 * k);
      g.fill();
    }

    // Head, unnerving wide eyes & frozen grin
    const hr = h * headK;
    const hy = h * 0.8 + hr;
    g.strokeStyle = rgba(skin);
    g.lineWidth = w * 0.22 * k;
    g.beginPath();
    g.moveTo(X(0), Y(h * 0.76));
    g.lineTo(X(0), Y(hy - hr * 0.5));
    g.stroke();
    g.fillStyle = rgba(sd);
    ellipseP(g, X(-hr * 0.95), Y(hy), hr * 0.18 * k, hr * 0.28 * k);
    g.fill();
    ellipseP(g, X(hr * 0.95), Y(hy), hr * 0.18 * k, hr * 0.28 * k);
    g.fill();
    g.fillStyle = radial(g, X(hr * 0.25), Y(hy + hr * 0.3), hr * 1.4 * k, [
      [0, rgba(sl)],
      [0.68, rgba(skin)],
      [1, rgba(sd)],
    ]);
    ellipseP(g, X(0), Y(hy), hr * 0.95 * k, hr * 1.12 * k);
    g.fill();

    const hairStyle = (r() * 4) | 0;
    const hairCol = [
      [40, 28, 20],
      [80, 55, 30],
      [22, 20, 18],
      [130, 95, 55],
    ][(r() * 4) | 0];
    if (hairStyle > 0) {
      g.fillStyle = rgba(hairCol);
      g.beginPath();
      g.ellipse(X(0), Y(hy + hr * 0.25), hr * 1.02 * k, hr * 0.95 * k, 0, Math.PI + 0.15, -0.15);
      g.closePath();
      g.fill();
      if (hairStyle === 2) {
        g.fillRect(X(-hr * 1.0), Y(hy + hr * 0.3), hr * 0.25 * k, hr * 1.2 * k);
        g.fillRect(X(hr * 0.75), Y(hy + hr * 0.3), hr * 0.25 * k, hr * 1.2 * k);
      }
      if (hairStyle === 3) {
        g.fillRect(X(-hr * 0.95), Y(hy + hr * 0.35), hr * 1.9 * k, hr * 0.25 * k);
      }
    }
    const eyeW = hr * (0.18 + r() * 0.1);
    for (const s of [-1, 1]) {
      g.fillStyle = 'rgba(70,40,34,0.35)';
      ellipseP(g, X(s * hr * 0.36), Y(hy + hr * 0.02), eyeW * 1.2 * k, eyeW * 1.0 * k);
      g.fill();
      g.fillStyle = '#f5f0e8';
      ellipseP(g, X(s * hr * 0.36), Y(hy + hr * 0.05), eyeW * k, eyeW * 0.8 * k);
      g.fill();
      g.fillStyle = '#18100e';
      ellipseP(g, X(s * hr * 0.36 + (r() - 0.5) * eyeW * 0.55), Y(hy + hr * 0.05), eyeW * 0.27 * k, eyeW * 0.27 * k);
      g.fill();
    }
    g.strokeStyle = rgba(sh(skin, 0.5));
    g.lineWidth = 0.05 * k;
    g.beginPath();
    g.moveTo(X(0), Y(hy));
    g.lineTo(X(-hr * 0.08), Y(hy - hr * 0.25));
    g.stroke();

    const grin = 0.45 + r() * 0.5;
    const mw = hr * (0.5 + r() * 0.25);
    g.fillStyle = '#5a241e';
    g.beginPath();
    g.moveTo(X(-mw), Y(hy - hr * 0.38));
    g.quadraticCurveTo(X(0), Y(hy - hr * (0.38 + grin * 0.55)), X(mw), Y(hy - hr * 0.38));
    g.quadraticCurveTo(X(0), Y(hy - hr * (0.38 + grin * 0.2)), X(-mw), Y(hy - hr * 0.38));
    g.fill();
    g.fillStyle = '#f0eadb';
    g.beginPath();
    g.moveTo(X(-mw * 0.9), Y(hy - hr * 0.4));
    g.quadraticCurveTo(X(0), Y(hy - hr * (0.4 + grin * 0.3)), X(mw * 0.9), Y(hy - hr * 0.4));
    g.quadraticCurveTo(X(0), Y(hy - hr * (0.4 + grin * 0.15)), X(-mw * 0.9), Y(hy - hr * 0.4));
    g.fill();
    g.strokeStyle = 'rgba(90,40,30,0.6)';
    g.lineWidth = 1;
    for (let i = -4; i <= 4; i++) {
      const x = (i / 4) * mw * 0.85;
      g.beginPath();
      g.moveTo(X(x), Y(hy - hr * 0.4));
      g.lineTo(X(x), Y(hy - hr * (0.4 + grin * 0.25 * (1 - Math.abs(i) / 5))));
      g.stroke();
    }

    // Golden-hour sunlit rim along right edge
    g.globalCompositeOperation = 'source-atop';
    const rim = g.createLinearGradient(X(-w), 0, X(w), 0);
    rim.addColorStop(0, 'rgba(28,18,16,0.16)');
    rim.addColorStop(0.72, 'rgba(255,220,170,0.0)');
    rim.addColorStop(1, 'rgba(255,226,176,0.42)');
    g.fillStyle = rim;
    g.fillRect(0, 0, Wc, Hc);
    g.globalCompositeOperation = 'source-over';

    reg('titan' + v, c, TPPM, 0.5, gy / Hc);
    ART.meta['titan' + v].h = h;
    ART.meta['titan' + v].nape = hy;

    const back = cnv(Wc, Hc);
    const bg = back.getContext('2d')!;
    bg.drawImage(c, 0, 0);
    bg.fillStyle = radial(bg, X(w * 0.15), Y(h * 0.67), w * k, [
      [0, rgba(sl)], [0.58, rgba(skin)], [1, rgba(sd)],
    ]);
    ellipseP(bg, X(0), Y(h * 0.63), w * 0.5 * k, h * 0.175 * k);
    bg.fill();
    bg.strokeStyle = rgba(sh(skin, 0.63), 0.6);
    bg.lineWidth = 0.065 * k;
    bg.beginPath();
    bg.moveTo(X(0), Y(h * 0.76));
    bg.lineTo(X(0), Y(h * 0.5));
    for (const side of [-1, 1]) {
      bg.moveTo(X(side * w * 0.34), Y(h * 0.71));
      bg.quadraticCurveTo(X(side * w * 0.16), Y(h * 0.64), X(side * w * 0.3), Y(h * 0.59));
    }
    bg.stroke();
    bg.fillStyle = rgba(hairStyle > 0 ? hairCol : skin);
    ellipseP(bg, X(0), Y(hy), hr * 0.96 * k, hr * 1.13 * k);
    bg.fill();
    if (hairStyle > 0) {
      bg.strokeStyle = rgba(sh(hairCol, 1.4));
      bg.lineWidth = Math.max(1, k * 0.024);
      for (let strand = -5; strand <= 5; strand++) {
        bg.beginPath();
        bg.moveTo(X(strand * hr * 0.13), Y(hy + hr * 0.65));
        bg.quadraticCurveTo(X(strand * hr * 0.18), Y(hy), X(strand * hr * 0.1), Y(hy - hr * 0.8));
        bg.stroke();
      }
    }
    reg('titanBack' + v, back, TPPM, 0.5, gy / Hc);
  }
}

/* ---------- 7. THE BEAST TITAN (10X POLISHED RIG) ---------- */
const FUR = [
  [108, 70, 40],
  [92, 58, 32],
  [132, 88, 52],
  [76, 48, 28],
  [154, 108, 66],
];
const furCols = FUR.map(c => rgba(c));

function furPart(
  name: string,
  wm: number,
  hm: number,
  drawPath: (g: CanvasRenderingContext2D, k: number) => void,
  opts?: {
    seed?: number;
    ang?: number;
    ax?: number;
    ay?: number;
    inner?: (g: CanvasRenderingContext2D, k: number, r: () => number) => void;
  }
): void {
  const o = opts || {};
  const k = MPPM;
  const c = cnv(wm * k + 10, hm * k + 10);
  const g = c.getContext('2d')!;
  const r = rng(name.length * 31 + (o.seed || 1));
  g.translate(5, 5);
  drawPath(g, k);
  g.save();
  g.clip();
  g.fillStyle = radial(g, wm * k * 0.58, hm * k * 0.28, Math.max(wm, hm) * k, [
    [0, rgba(FUR[4])],
    [0.48, rgba(FUR[0])],
    [1, rgba(FUR[3])],
  ]);
  g.fillRect(0, 0, wm * k, hm * k);
  furStrokes(
    g,
    wm * hm * 38,
    -12,
    -12,
    wm * k + 24,
    hm * k + 24,
    furCols,
    0.36 * k,
    o.ang === undefined ? Math.PI / 2 : o.ang,
    2.1,
    r
  );
  if (o.inner) o.inner(g, k, r);
  // Dramatic golden-hour right-side rim lighting + left shadow
  const sg = g.createLinearGradient(0, 0, wm * k, 0);
  sg.addColorStop(0, 'rgba(26,14,6,0.42)');
  sg.addColorStop(0.45, 'rgba(0,0,0,0)');
  sg.addColorStop(0.84, 'rgba(255,224,174,0.12)');
  sg.addColorStop(1, 'rgba(255,228,176,0.34)');
  g.fillStyle = sg;
  g.fillRect(0, 0, wm * k, hm * k);
  g.restore();

  // Shaggy fur silhouette tufts around perimeter
  g.strokeStyle = rgba(FUR[3]);
  g.lineWidth = 2.2;
  for (let i = 0; i < wm * hm * 4; i++) {
    const a = r() * 6.283;
    const cx = (wm * k) / 2;
    const cy = (hm * k) / 2;
    const x = cx + Math.cos(a) * wm * k * 0.48;
    const y = cy + Math.sin(a) * hm * k * 0.48;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * 7 + (r() - 0.5) * 5, y + Math.sin(a) * 7 + 5);
    g.stroke();
  }
  ART.tex[name] = mkTex(c);
  ART.meta[name] = {
    ppm: k,
    ax: o.ax === undefined ? 0.5 : (o.ax * wm * k + 5) / c.width,
    ay: o.ay === undefined ? 0.5 : (o.ay * hm * k + 5) / c.height,
  };
}

function limbPart(name: string, wd: number, len: number): void {
  const tot = len + wd;
  furPart(
    name,
    wd,
    tot,
    (g, k) => capsule(g, (wd * k) / 2, (wd * k) / 2, (tot - wd / 2) * k, wd * k, wd * k * 0.84),
    { ax: 0.5, ay: (wd / 2) / tot }
  );
  ART.meta[name].len = len;
  ART.meta[name].wd = wd;
  ART.meta[name].tot = tot;
}

function artBeast(): void {
  furPart(
    'mTorso',
    10.4,
    12.2,
    (g, k) => {
      ellipseP(g, 5.2 * k, 6.3 * k, 4.95 * k, 5.9 * k);
    },
    {
      inner: (g, k, r) => {
        // Pale muscular barrel chest & abdomen
        g.fillStyle = radial(g, 5.3 * k, 5.2 * k, 3.8 * k, [
          [0, 'rgba(186,142,102,0.96)'],
          [0.65, 'rgba(154,112,76,0.72)'],
          [1, 'rgba(150,108,72,0)'],
        ]);
        ellipseP(g, 5.2 * k, 5.7 * k, 3.0 * k, 3.7 * k);
        g.fill();
        // Pectoral & sternum definition
        g.strokeStyle = 'rgba(82,52,30,0.58)';
        g.lineWidth = 3.5;
        g.beginPath();
        g.moveTo(3.0 * k, 4.1 * k);
        g.quadraticCurveTo(5.2 * k, 4.9 * k, 7.4 * k, 4.1 * k);
        g.moveTo(5.2 * k, 4.7 * k);
        g.lineTo(5.2 * k, 8.3 * k);
        g.stroke();
        furStrokes(
          g,
          440,
          2 * k,
          2.5 * k,
          6.4 * k,
          6.2 * k,
          ['rgba(196,156,116,0.52)', 'rgba(116,80,50,0.52)'],
          0.26 * k,
          Math.PI / 2,
          1.6,
          r
        );
      },
    }
  );
  ART.meta.mTorso.cy = 11.8;

  // Head with iconic Beast Titan pointed elfin ears, deep brow, gaunt bearded snout & eerie smirk!
  furPart(
    'mHead',
    6.0,
    5.4,
    (g, k) => {
      // Pointed Beast Titan ears
      poly(g, [
        [0.85 * k, 2.55 * k],
        [0.08 * k, 1.95 * k],
        [0.95 * k, 3.15 * k],
      ]);
      g.fill();
      poly(g, [
        [5.15 * k, 2.55 * k],
        [5.92 * k, 1.95 * k],
        [5.05 * k, 3.15 * k],
      ]);
      g.fill();
      ellipseP(g, 3.0 * k, 2.7 * k, 2.35 * k, 2.55 * k);
    },
    {
      inner: (g, k) => {
        const ox = 0.5;
        // Exposed pale skin face mask
        g.fillStyle = radial(g, (2.6 + ox) * k, 3.0 * k, 1.95 * k, [
          [0, '#d2a27a'],
          [0.68, '#ac7e58'],
          [1, 'rgba(150,108,72,0)'],
        ]);
        g.beginPath();
        g.moveTo((1.0 + ox) * k, 2.25 * k);
        g.quadraticCurveTo((2.5 + ox) * k, 1.55 * k, (4.0 + ox) * k, 2.25 * k);
        g.quadraticCurveTo((4.2 + ox) * k, 3.9 * k, (2.5 + ox) * k, 4.8 * k);
        g.quadraticCurveTo((0.8 + ox) * k, 3.9 * k, (1.0 + ox) * k, 2.25 * k);
        g.fill();
        // Heavy brow ridge
        g.fillStyle = '#362014';
        g.beginPath();
        g.moveTo((0.9 + ox) * k, 2.3 * k);
        g.quadraticCurveTo((2.5 + ox) * k, 1.8 * k, (4.1 + ox) * k, 2.3 * k);
        g.lineTo((4.0 + ox) * k, 2.62 * k);
        g.quadraticCurveTo((2.5 + ox) * k, 2.2 * k, (1.0 + ox) * k, 2.62 * k);
        g.fill();
        // Deep shadowed eye sockets
        g.fillStyle = 'rgba(26,12,6,0.86)';
        ellipseP(g, (1.8 + ox) * k, 2.8 * k, 0.56 * k, 0.24 * k, 0.2);
        g.fill();
        ellipseP(g, (3.2 + ox) * k, 2.8 * k, 0.56 * k, 0.24 * k, -0.2);
        g.fill();
        // Flat ape nose
        g.fillStyle = '#7c523a';
        ellipseP(g, (2.5 + ox) * k, 3.5 * k, 0.6 * k, 0.4 * k);
        g.fill();
        g.fillStyle = '#26140a';
        ellipseP(g, (2.3 + ox) * k, 3.55 * k, 0.1 * k, 0.07 * k);
        g.fill();
        ellipseP(g, (2.7 + ox) * k, 3.55 * k, 0.1 * k, 0.07 * k);
        g.fill();
        // Sinister toothy grin
        g.strokeStyle = '#24120a';
        g.lineWidth = 0.1 * k;
        g.beginPath();
        g.moveTo((1.55 + ox) * k, 4.08 * k);
        g.quadraticCurveTo((2.5 + ox) * k, 4.44 * k, (3.65 + ox) * k, 3.92 * k);
        g.stroke();
        g.strokeStyle = 'rgba(246,238,220,0.82)';
        g.lineWidth = 0.055 * k;
        g.beginPath();
        g.moveTo((1.85 + ox) * k, 4.13 * k);
        g.quadraticCurveTo((2.5 + ox) * k, 4.34 * k, (3.35 + ox) * k, 4.02 * k);
        g.stroke();
      },
    }
  );
  ART.meta.mHead.cy = 17.3;

  limbPart('mUpper', 2.15, 6.6);
  limbPart('mFore', 1.8, 6.6);
  limbPart('mThigh', 2.75, 3.9);
  limbPart('mShin', 2.55, 3.9);
  furPart(
    'mHand',
    2.65,
    2.65,
    (g, k) => {
      ellipseP(g, 1.32 * k, 1.32 * k, 1.26 * k, 1.26 * k);
    },
    {
      inner: (g, k) => {
        g.strokeStyle = 'rgba(36,22,12,0.75)';
        g.lineWidth = 3.2;
        for (let i = 0; i < 4; i++) {
          g.beginPath();
          g.moveTo((0.6 + i * 0.45) * k, 1.72 * k);
          g.lineTo((0.6 + i * 0.45) * k, 2.45 * k);
          g.stroke();
        }
      },
    }
  );

  let c = cnv(3.5 * MPPM, 1.35 * MPPM);
  let g = c.getContext('2d')!;
  g.fillStyle = radial(g, c.width * 0.55, c.height * 0.3, c.width * 0.6, [
    [0, '#523624'],
    [1, '#22140c'],
  ]);
  ellipseP(g, c.width / 2, c.height / 2, c.width / 2 - 2, c.height / 2 - 2);
  g.fill();
  reg('mFoot', c, MPPM, 0.5, 0.5);

  c = cnv(1.35 * MPPM, 0.65 * MPPM);
  g = c.getContext('2d')!;
  g.fillStyle = '#ffe278';
  g.shadowColor = '#ffb020';
  g.shadowBlur = 10;
  g.beginPath();
  g.moveTo(4, c.height * 0.55);
  g.quadraticCurveTo(c.width * 0.5, 2, c.width - 4, c.height * 0.25);
  g.quadraticCurveTo(c.width * 0.5, c.height * 0.75, 4, c.height * 0.55);
  g.fill();
  reg('mEye', c, MPPM, 0.5, 0.5);

  c = cnv(1.4 * MPPM, 1.4 * MPPM);
  g = c.getContext('2d')!;
  g.strokeStyle = '#921010';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(6, c.height * 0.5);
  g.lineTo(c.width - 6, c.height * 0.45);
  g.moveTo(c.width * 0.55, 6);
  g.lineTo(c.width * 0.5, c.height - 4);
  g.stroke();
  reg('mEyeCut', c, MPPM, 0.5, 0.5);

  c = cnv(2.3 * MPPM, 2.3 * MPPM);
  g = c.getContext('2d')!;
  g.fillStyle = radial(g, c.width / 2, c.height / 2, c.width / 2, [
    [0, '#f4ece0'],
    [0.24, '#ca3c32'],
    [0.78, '#7e1a14'],
    [1, 'rgba(90,20,15,0)'],
  ]);
  g.fillRect(0, 0, c.width, c.height);
  reg('mStump', c, MPPM, 0.5, 0.5);

  furPart(
    'mChunk',
    1.95,
    1.25,
    (g, k) => {
      g.beginPath();
      g.rect(0, 0, 1.95 * k, 1.25 * k);
    },
    {
      ang: 0,
      inner: (g, k) => {
        g.fillStyle = '#9e2a22';
        g.fillRect(0, 0, 0.2 * k, 1.25 * k);
        g.fillRect(1.75 * k, 0, 0.2 * k, 1.25 * k);
        g.fillStyle = '#efe2d0';
        g.beginPath();
        g.arc(0.1 * k, 0.62 * k, 0.13 * k, 0, 6.29);
        g.arc(1.85 * k, 0.62 * k, 0.13 * k, 0, 6.29);
        g.fill();
      },
    }
  );
}

/* ---------- 8. QUADRUPED CARRIER (CART TITAN) ---------- */
function artQuad(): void {
  const k = 32;
  for (let f = 0; f < 6; f++) {
    const c = cnv(13.5 * k, 7.2 * k);
    const g = c.getContext('2d')!;
    const X = (m: number) => (6.6 + m) * k;
    const Y = (m: number) => (6.8 - m) * k;
    const ph = (f / 6) * Math.PI * 2;
    const body = [194, 154, 126]; // More faithful eerie Cart Titan pale flesh + dark harness!
    const dark = [118, 86, 68];
    const harness = [78, 54, 38];
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const legs: [number, number][] = [
      [2.8, 0],
      [1.9, Math.PI],
      [-2.4, Math.PI / 2],
      [-3.2, Math.PI * 1.5],
    ];
    legs.forEach(([lx, o], i) => {
      const sw = Math.sin(ph + o) * 0.72;
      const up = Math.max(0, Math.cos(ph + o)) * 0.45;
      g.strokeStyle = rgba(i % 2 ? sh(dark, 0.8) : dark);
      g.lineWidth = 0.76 * k;
      g.beginPath();
      g.moveTo(X(lx), Y(2.5));
      g.lineTo(X(lx + sw * 0.5 + 0.3), Y(1.2 + up));
      g.lineTo(X(lx + sw), Y(up + 0.1));
      g.stroke();
      g.fillStyle = rgba(sh(dark, 0.68));
      ellipseP(g, X(lx + sw + 0.2), Y(up + 0.1), 0.45 * k, 0.18 * k);
      g.fill();
    });

    const bob = Math.sin(ph * 2) * 0.08;
    // Hunched pale quadrupedal torso
    g.fillStyle = radial(g, X(0.6), Y(3.6 + bob), 4.6 * k, [
      [0, rgba(sh(body, 1.15))],
      [0.68, rgba(body)],
      [1, rgba(dark)],
    ]);
    ellipseP(g, X(0), Y(2.9 + bob), 4.2 * k, 1.48 * k);
    g.fill();
    ellipseP(g, X(-0.5), Y(3.6 + bob), 3.0 * k, 0.98 * k);
    g.fill();

    // Wooden & leather boulder-carrying pack harness on its back
    g.fillStyle = rgba(harness);
    g.fillRect(X(-2.9), Y(4.45 + bob), 5.6 * k, 0.62 * k);
    g.strokeStyle = '#382418';
    g.lineWidth = 3;
    g.strokeRect(X(-2.9), Y(4.45 + bob), 5.6 * k, 0.62 * k);
    // Straps wrapping belly
    g.lineWidth = 0.22 * k;
    g.beginPath();
    g.moveTo(X(-1.6), Y(4.1 + bob));
    g.lineTo(X(-1.6), Y(1.8 + bob));
    g.moveTo(X(1.4), Y(4.1 + bob));
    g.lineTo(X(1.4), Y(1.8 + bob));
    g.stroke();

    // Elongated Cart Titan head & snout with dark shaggy hair
    g.fillStyle = radial(g, X(4.6), Y(2.6), 1.65 * k, [
      [0, rgba(sh(body, 1.12))],
      [1, rgba(dark)],
    ]);
    ellipseP(g, X(4.5), Y(2.3 + bob), 1.38 * k, 0.92 * k);
    g.fill();
    // Long protruding snout
    g.fillStyle = rgba(sh(body, 0.92));
    ellipseP(g, X(5.6), Y(1.95 + bob), 1.0 * k, 0.44 * k);
    g.fill();
    // Dark shaggy black hair draping neck & crown
    g.fillStyle = '#221c1a';
    g.beginPath();
    g.ellipse(X(4.1), Y(2.95 + bob), 1.2 * k, 0.58 * k, -0.25, 0, Math.PI * 2);
    g.fill();
    // Teeth
    g.fillStyle = '#f2ead8';
    for (let i = 0; i < 6; i++) {
      poly(g, [
        [X(4.95 + i * 0.22), Y(2.02 + bob)],
        [X(5.05 + i * 0.22), Y(1.76 + bob)],
        [X(5.15 + i * 0.22), Y(2.02 + bob)],
      ]);
      g.fill();
    }
    // Haunting eye
    g.fillStyle = '#f8f2e8';
    g.beginPath();
    g.arc(X(4.95), Y(2.58 + bob), 0.17 * k, 0, 6.29);
    g.fill();
    g.fillStyle = '#181210';
    g.beginPath();
    g.arc(X(5.0), Y(2.58 + bob), 0.08 * k, 0, 6.29);
    g.fill();

    reg('quad' + f, c, k, 0.5, 6.8 / 7.2);
  }
}

/* ---------- 9. SHRAPNEL SHARDS & IMPACT SCARS ---------- */
function artShards(): void {
  for (let v = 0; v < 4; v++) {
    const c = cnv(96, 96);
    const g = c.getContext('2d')!;
    const r = rng(1700 + v * 31);
    const n = 8 + v;
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.32;
      const rr = 24 + r() * 16 - (i % 2) * 5;
      pts.push([48 + Math.cos(a) * rr, 48 + Math.sin(a) * rr]);
    }
    const lg = g.createLinearGradient(18, 14, 78, 82);
    lg.addColorStop(0, '#dcd3c3');
    lg.addColorStop(0.45, '#8f8577');
    lg.addColorStop(1, '#3d3731');
    g.fillStyle = lg;
    poly(g, pts);
    g.fill();
    g.save();
    poly(g, pts);
    g.clip();
    for (let i = 0; i < 3; i++) {
      const p0 = pts[(i * 3 + v) % n];
      const p1 = pts[(i * 3 + v + 1) % n];
      g.fillStyle = i % 2 ? 'rgba(255,240,214,0.22)' : 'rgba(24,20,18,0.25)';
      g.beginPath();
      g.moveTo(48, 48);
      g.lineTo(p0[0], p0[1]);
      g.lineTo(p1[0], p1[1]);
      g.closePath();
      g.fill();
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(92,78,58,${0.2 + r() * 0.3})`;
      g.beginPath();
      g.arc(20 + r() * 56, 20 + r() * 56, 1 + r() * 2.2, 0, 6.29);
      g.fill();
    }
    g.restore();
    reg('shard' + v, c, 96, 0.5, 0.5);
  }
}

function artScars(): void {
  for (let v = 0; v < 3; v++) {
    const c = cnv(128, 128);
    const g = c.getContext('2d')!;
    const r = rng(1800 + v * 17);
    g.fillStyle = radial(g, 64, 64, 64, [
      [0, 'rgba(60,44,28,0)'],
      [0.38, 'rgba(60,44,28,0)'],
      [0.6, 'rgba(120,96,64,0.55)'],
      [0.85, 'rgba(120,96,64,0.22)'],
      [1, 'rgba(120,96,64,0)'],
    ]);
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = radial(g, 64, 64, 36, [
      [0, 'rgba(34,24,16,0.92)'],
      [0.55, 'rgba(46,34,22,0.7)'],
      [1, 'rgba(46,34,22,0)'],
    ]);
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(40,30,20,0.55)';
    g.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      const a = r() * Math.PI * 2;
      const r0 = 20 + r() * 8;
      const r1 = 44 + r() * 18;
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0);
      g.lineTo(64 + Math.cos(a + 0.12) * r1, 64 + Math.sin(a + 0.12) * r1);
      g.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const d0 = 36 + r() * 16;
      g.fillStyle = `rgba(${(130 + r() * 40) | 0},${(120 + r() * 36) | 0},${(100 + r() * 30) | 0},0.9)`;
      g.beginPath();
      g.arc(64 + Math.cos(a) * d0, 64 + Math.sin(a) * d0, 1.2 + r() * 2, 0, 6.29);
      g.fill();
    }
    reg('scar' + v, c, 64, 0.5, 0.5);
  }
  const c = cnv(128, 128);
  const g = c.getContext('2d')!;
  const r = rng(1900);
  g.fillStyle = radial(g, 64, 64, 60, [
    [0, 'rgba(48,36,24,0.85)'],
    [0.6, 'rgba(60,46,30,0.5)'],
    [1, 'rgba(60,46,30,0)'],
  ]);
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 22; i++) {
    g.fillStyle = `rgba(140,124,96,${0.2 + r() * 0.3})`;
    g.beginPath();
    g.arc(30 + r() * 68, 52 + r() * 24, 0.8 + r() * 1.6, 0, 6.29);
    g.fill();
  }
  reg('skid', c, 64, 0.5, 0.5);
}

/* ---------- 10. SMOKE PUFFS: irregular billows, not round orbs ---------- */
function vnoise2(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const h = (i: number, j: number) => {
    const q = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
    return q - Math.floor(q);
  };
  const u = xf * xf * (3 - 2 * xf);
  const w = yf * yf * (3 - 2 * yf);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), w);
}

function fbm2(x: number, y: number, s: number): number {
  let sum = 0;
  let amp = 0.5;
  let fx = x;
  let fy = y;
  for (let o = 0; o < 3; o++) {
    sum += amp * vnoise2(fx, fy, s + o * 3.1);
    fx *= 2.03;
    fy *= 2.03;
    amp *= 0.5;
  }
  return sum / 0.875;
}

function smoothstep01(a0: number, b0: number, x: number): number {
  const t = clamp((x - a0) / (b0 - a0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Four smoke puffs: several overlapping cores with a ragged, noise-broken edge. Tinted per instance. */
function artSmoke(): void {
  const N = 256;
  for (let v = 0; v < 4; v++) {
    const c = cnv(N, N);
    const g = c.getContext('2d')!;
    const img = g.createImageData(N, N);
    const d = img.data;
    const r = rng(2100 + v * 37);
    const blobs: [number, number, number, number][] = [];
    for (let i = 0; i < 16; i++) {
      blobs.push([0.5 + (r() - 0.5) * 0.5, 0.5 + (r() - 0.5) * 0.42, 0.12 + r() * 0.2, 0.45 + r() * 0.55]);
    }
    const seed = v * 11.3 + 3;
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const nx = px / N;
        const ny = py / N;
        let acc = 0;
        for (const [bx, by, br, bw] of blobs) {
          const dx = (nx - bx) / br;
          const dy = (ny - by) / (br * 0.8);
          acc += bw * Math.exp(-(dx * dx + dy * dy));
        }
        const e = acc + (fbm2(nx * 5.5, ny * 5.5, seed) - 0.5) * 0.9;
        const idx = (py * N + px) * 4;
        d[idx] = 255;
        d[idx + 1] = 255;
        d[idx + 2] = 255;
        d[idx + 3] = Math.round(255 * smoothstep01(0.2, 0.9, e));
      }
    }
    g.putImageData(img, 0, 0);
    reg('smoke' + v, c, 1, 0.5, 0.5);
  }
}

let artBuilt = false;
export function buildArt(): void {
  if (artBuilt) return;
  artBuilt = true;
  artFX();
  artSky();
  artCityWall();
  artScenery();
  artRiders();
  artTitans();
  artBeast();
  artQuad();
  artShards();
  artScars();
  artSmoke();
}
