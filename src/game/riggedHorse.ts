import * as PIXI from 'pixi.js';
import { ART } from './art';
import horseUrl from './rigged2/horse';
import riderUrl from './rigged2/rider';
import metaJson from './rigged2/meta.json';

// Pre-rendered third-person horse and rider. Atlases are laid out as views (rows) x gallop frames (columns).
export const RIGGED = metaJson as {
  frames: number;
  views: number;
  center: number;
  step: number;
  cell: { w: number; h: number };
  uppm: number;
  groundRow: number;
  clip: string;
};

let started = false;
let loaded = 0;

function addAtlas(name: string, url: string, onLoaded: () => void): void {
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    const base = new PIXI.Texture({ source: new PIXI.ImageSource({ resource: img }) });
    const w = RIGGED.cell.w;
    const h = RIGGED.cell.h;
    for (let v = 0; v < RIGGED.views; v++) {
      for (let f = 0; f < RIGGED.frames; f++) {
        const key = `${name}${v}_${f}`;
        ART.tex[key] = new PIXI.Texture({
          source: base.source,
          frame: new PIXI.Rectangle(f * w, v * h, w, h),
        });
        // Horse and rider share cell geometry and anchor, so they stay locked together.
        ART.meta[key] = { ppm: RIGGED.uppm, ax: 0.5, ay: RIGGED.groundRow / h, wPx: w, hPx: h };
      }
    }
    onLoaded();
  };
  img.src = url;
}

/** Starts loading the atlases once. Rendering falls back to the classic art until they are ready. */
export function ensureRiggedHorse(): void {
  if (started) return;
  started = true;
  const done = () => {
    loaded++;
    if (loaded === 2) ART.tex.riggedReady = ART.tex.rhorse0_0;
  };
  addAtlas('rhorse', horseUrl, done);
  addAtlas('rrider', riderUrl, done);
}
