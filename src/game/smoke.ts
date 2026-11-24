import { clamp, lerp, rand, SmokePuff } from './types';

/**
 * Signal smoke model.
 *
 * A canister burns and releases dense coloured smoke. The plume is laid down continuously along the
 * flight (here: one puff every few metres), each puff starts as a small hot cloud and expands into a
 * billow, rises as warm air, drifts on the breeze, pales as it ages and finally disperses. Puffs are
 * stored once with their birth time and evaluated analytically, so there is no per-frame simulation.
 */

/** A plume stays visible for this many seconds after each puff is released. */
export const PUFF_LIFE = 18;
/** Upper bound on live puffs; the oldest are dropped first. */
export const PUFF_CAP = 4200;
/** A puff is released every this many metres of canister flight. */
export const EMIT_SPACING = 7;

const DRAG = 0.45;   // 1/s: burst velocity bleeds off quickly, the cloud then hangs and drifts
const RISE = 1.1;    // m/s: warm smoke climbs, then levels off as it thins
const WIND_X = 0.9;  // m/s: prevailing breeze across the plain
const WIND_Z = 0.25;

/** Position of a puff `age` seconds after release. */
export function puffPosition(p: SmokePuff, age: number): { x: number; y: number; z: number } {
  const f = (1 - Math.exp(-DRAG * age)) / DRAG;
  const rise = RISE * 6 * (1 - Math.exp(-age / 6));
  const wobble = Math.sin(p.seed + age * 0.7) * 0.9 * clamp(age / 2, 0, 1);
  return {
    x: p.x + p.vx * f + WIND_X * 0.6 * age + wobble,
    y: p.y + p.vy * f + rise,
    z: p.z + p.vz * f + WIND_Z * 0.6 * age + Math.cos(p.seed * 1.3 + age * 0.5) * 0.7,
  };
}

/** World-space radius of a puff: a small hot cloud that billows out over a few seconds. */
export function puffRadius(p: SmokePuff, age: number): number {
  const grow = 1 - Math.exp(-age / 3.5);
  return lerp(1.6, p.r, grow) + 0.03 * Math.max(0, age - 6);
}

/** Opacity: quick to appear, dense while fresh, then thinning to nothing by the end of its life. */
export function puffAlpha(age: number): number {
  const fadeIn = clamp(age / 0.8, 0, 1);
  const fadeOut = 1 - clamp((age - 9) / (PUFF_LIFE - 9), 0, 1);
  return fadeIn * fadeOut * fadeOut;
}

/** Colour: saturated green when fresh, greying as the smoke ages. */
export function puffColor(age: number): [number, number, number] {
  const t = clamp(age / PUFF_LIFE, 0, 1);
  return [lerp(58, 150, t), lerp(186, 170, t), lerp(96, 150, t)];
}

/** Lay puffs along a canister's flight, one per EMIT_SPACING metres travelled. */
export function emitAlongPath(
  out: SmokePuff[],
  fl: { x: number; y: number; z: number; vx: number; vy: number; vz: number; emitT: number },
  dt: number,
  now: number
): void {
  fl.emitT += Math.hypot(fl.vx, fl.vy, fl.vz) * dt;
  while (fl.emitT >= EMIT_SPACING) {
    fl.emitT -= EMIT_SPACING;
    out.push({
      x: fl.x + rand(-0.8, 0.8),
      y: fl.y + rand(-0.6, 0.6),
      z: fl.z + rand(-0.8, 0.8),
      vx: rand(-0.5, 0.5),
      vy: rand(0.3, 0.9),
      vz: rand(-0.5, 0.5),
      born: now,
      r: rand(3.0, 4.4),
      seed: rand(0, 6.283),
    });
  }
}

/** On arrival the canister bursts and its smoke billows outward around the landing point. */
export function burstAt(out: SmokePuff[], x: number, y: number, z: number, now: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
    const s = rand(1.5, 4.5);
    out.push({
      x: x + rand(-1, 1),
      y: y + rand(-0.5, 1.5),
      z: z + rand(-1, 1),
      vx: Math.cos(a) * s,
      vy: rand(0.5, 2),
      vz: Math.sin(a) * s,
      born: now,
      r: rand(4, 6),
      seed: rand(0, 6.283),
    });
  }
}

/** Drop expired puffs (they are released in time order) and enforce the live cap. */
export function prunePuffs(puffs: SmokePuff[], now: number): void {
  let n = 0;
  while (n < puffs.length && now - puffs[n].born >= PUFF_LIFE) n++;
  if (n > 0) puffs.splice(0, n);
  if (puffs.length > PUFF_CAP) puffs.splice(0, puffs.length - PUFF_CAP);
}
