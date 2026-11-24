import type { GameEngine } from './engine';
import { sRockRicochet, sThud, sWhoosh } from './audio';
import { clamp, GRAV, lerp, rand, RockObstacle, Scar, StoneEntity } from './types';

/** Air drag for shrapnel, per second. Dense chunks keep their speed, small fragments shed it. */
export function stoneDrag(bullet: boolean, chunk: boolean): number {
  return bullet ? 0.022 : chunk ? 0.03 : 0.04;
}

/**
 * Launch velocity that reaches `to` exactly after `T` seconds under linear drag `k`.
 * This is the closed-form solution of v' = -k·v - g, so volleys still land where they are aimed.
 */
export function launchVelocity(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  T: number,
  k: number,
  gravity = GRAV
): { vx: number; vy: number; vz: number } {
  const dk = (1 - Math.exp(-k * T)) / k;
  const gk = gravity / k;
  return {
    vx: (to.x - from.x) / dk,
    vy: (to.y - from.y + gk * T) / dk - gk,
    vz: (to.z - from.z) / dk,
  };
}

/** One explicit step of free flight: drag, gravity, translation and tumble. */
export function integrateAir(s: StoneEntity, dt: number): void {
  const damp = Math.exp(-(s.k ?? 0.03) * dt);
  s.vx *= damp;
  s.vz *= damp;
  s.vy = s.vy * damp - GRAV * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.z += s.vz * dt;
  s.ax = (s.ax ?? 0) + (s.wx ?? 0) * dt;
  s.ay = (s.ay ?? 0) + (s.wy ?? 0) * dt;
  s.az = (s.az ?? 0) + (s.wz ?? 0) * dt;
}

const BIN = 8;
const MAX_SCARS = 260;
const MAX_REST = 150;
const PLOW = 2.0;        // 1/s: speed-proportional resistance while a fragment ploughs turf
const ROLL = 1.6;        // m/s²: constant rolling resistance
const SPIN_DECAY = 0.2;  // 1/s

let binSource: RockObstacle[] | null = null;
let binCount = -1;
const bins = new Map<number, RockObstacle[]>();

// Boulders are indexed in 8 m depth bands, so each fragment only tests the boulders near it.
function refreshBins(rocks: RockObstacle[]): void {
  if (binSource === rocks && binCount === rocks.length) return;
  binSource = rocks;
  binCount = rocks.length;
  bins.clear();
  for (const r of rocks) {
    if (r.isTree) continue;
    const key = Math.floor(r.z / BIN);
    const list = bins.get(key);
    if (list) list.push(r);
    else bins.set(key, [r]);
  }
}

function segBox(o: number[], d: number[], mn: number[], mx: number[]): boolean {
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return false;
    } else {
      let a = (mn[i] - o[i]) / d[i];
      let b = (mx[i] - o[i]) / d[i];
      if (a > b) {
        const t = a;
        a = b;
        b = t;
      }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return false;
    }
  }
  return true;
}

function addScar(eng: GameEngine, sc: Scar): void {
  eng.scars.push(sc);
  if (eng.scars.length > MAX_SCARS) eng.scars.splice(0, eng.scars.length - MAX_SCARS);
}

function spray(eng: GameEngine, x: number, y: number, z: number, vx: number, vz: number, n: number, size: number): void {
  for (let j = 0; j < n && eng.parts.length < 1400; j++) {
    eng.parts.push({
      x,
      y: Math.max(0.05, y),
      z,
      vx: vx + rand(-1.4, 1.4),
      vy: rand(0.4, 2.4),
      vz: vz + rand(-1, 1),
      life: 0,
      max: rand(0.6, 1.4),
      size: size * rand(0.7, 1.3),
      col: [150, 128, 96],
      dust: 1,
    });
  }
}

/** Advances every fragment: flight, ground impact, boulders, the rider and horse, and riders struck. */
export function updateShrapnel(eng: GameEngine, dt: number): void {
  const p = eng.player;
  const cam = eng.cam;
  refreshBins(eng.rocks);
  eng.G.thudBudget = 3;
  const pmin = [-0.4, 0.15, -1.25];
  const pmax = [0.4, 2.45, 1.25];
  const o = [0, 0, 0];
  const d = [0, 0, 0];
  const mn = [0, 0, 0];
  const mx = [0, 0, 0];
  const spin = Math.exp(-SPIN_DECAY * dt);
  let resting = 0;

  for (let i = eng.stones.length - 1; i >= 0; i--) {
    const s = eng.stones[i];
    if (s.delay > 0) {
      s.delay -= dt;
      continue;
    }
    if (s.rest) {
      resting++;
      continue;
    }
    if ((s.hitCD ?? 0) > 0) s.hitCD = Math.max(0, (s.hitCD ?? 0) - dt);
    s.wx = (s.wx ?? 0) * spin;
    s.wy = (s.wy ?? 0) * spin;
    s.wz = (s.wz ?? 0) * spin;
    const ox = s.x;
    const oy = s.y;
    const oz = s.z;
    s.life += dt;
    integrateAir(s, dt);
    let dead = false;
    const rad = s.r;

    // Ground contact: restitution falls with impact speed (turf absorbs hard landings), friction removes
    // tangential speed, and friction couples into spin. Slow contact turns into sliding, rolling and rest.
    if (s.y <= rad) {
      s.y = rad;
      const vn = -s.vy;
      if (vn > 0.6) {
        const e = (s.e ?? 0.2) / (1 + vn / 16);
        s.vy = vn * e;
        const vt = Math.hypot(s.vx, s.vz);
        const loss = Math.min(vt, 0.55 * (1 + e) * vn);
        if (vt > 1e-6) {
          const f = (vt - loss) / vt;
          s.vx *= f;
          s.vz *= f;
        }
        const rr = Math.max(0.01, rad);
        s.wx = (s.wx ?? 0) * 0.4 + (s.vz / rr) * 0.6 + rand(-5, 5);
        s.wz = (s.wz ?? 0) * 0.4 - (s.vx / rr) * 0.6 + rand(-5, 5);
        s.wy = (s.wy ?? 0) * 0.5 + rand(-4, 4);
        s.bounces = (s.bounces ?? 0) + 1;
        const ndz = s.z - cam.z;
        if (ndz > 0 && ndz < 350) {
          spray(eng, s.x, 0.1, s.z, s.vx * 0.05, s.vz * 0.05, rad > 0.06 ? 5 : 2, rad > 0.06 ? 0.55 : 0.3);
          if (vn > 2.2) {
            addScar(eng, {
              x: s.x,
              z: s.z,
              r: clamp(0.22 + 0.9 * rad * Math.sqrt(vn / 10), 0.2, 1.3),
              kind: 0,
              ang: rand(0, 6.28),
              len: 0,
              a: clamp(0.3 + vn * 0.02, 0.3, 0.8),
            });
          }
        }
        if (ndz > 0 && ndz < 40 && eng.G.thudBudget-- > 0) sThud((s.x - cam.x) / 20, 0.25 * (1 - ndz / 40));
      } else {
        s.vy = 0;
        const vt = Math.hypot(s.vx, s.vz);
        if (vt > 0) {
          const nv = Math.max(0, vt - (PLOW * vt + ROLL) * dt);
          const f = nv / vt;
          s.vx *= f;
          s.vz *= f;
          const rr = Math.max(0.01, rad);
          const k = Math.min(1, 6 * dt);
          s.wx = lerp(s.wx ?? 0, s.vz / rr, k);
          s.wz = lerp(s.wz ?? 0, -s.vx / rr, k);
          s.skid = (s.skid ?? 0) + nv * dt;
        }
        if (Math.hypot(s.vx, s.vz) < 0.4) {
          s.rest = true;
          s.vx = 0;
          s.vy = 0;
          s.vz = 0;
          s.wx = 0;
          s.wy = 0;
          s.wz = 0;
          resting++;
          continue;
        }
      }
    }

    // Boulders: a fragment shatters on a hard hit (or a share of soft ones), otherwise it glances off the face.
    if (!dead && s.y < 2.6 && (s.hitCD ?? 0) <= 0) {
      const k0 = Math.floor((Math.min(oz, s.z) - 2.5) / BIN);
      const k1 = Math.floor((Math.max(oz, s.z) + 2.5) / BIN);
      search: for (let kb = k0; kb <= k1; kb++) {
        const list = bins.get(kb);
        if (!list) continue;
        for (const rock of list) {
          const nx = (s.x - rock.x) / rock.rx;
          const nz = (s.z - rock.z) / rock.rz;
          const q = nx * nx + nz * nz;
          const margin = 1 + (2 * rad) / Math.min(rock.rx, rock.rz);
          if (q > margin * margin || s.y > rock.h + rad) continue;
          let ux = nx / rock.rx;
          let uz = nz / rock.rz;
          const ul = Math.hypot(ux, uz) || 1;
          ux /= ul;
          uz /= ul;
          const vn = s.vx * ux + s.vz * uz;
          if (vn >= 0) continue;
          const ndz = rock.z - cam.z;
          if (-vn > 18 || Math.random() < 0.3) {
            dead = true;
            if (ndz > 0 && ndz < 260) spray(eng, s.x, Math.max(0.2, s.y), rock.z, s.vx * 0.2, s.vz * 0.2, 6, 0.3);
            if (ndz > 0 && ndz < 55 && eng.G.thudBudget-- > 0) {
              sRockRicochet((rock.x - cam.x) / 22, 0.35 * (1 - ndz / 55));
            }
            break search;
          }
          const eR = 0.22;
          s.vx -= (1 + eR) * vn * ux;
          s.vz -= (1 + eR) * vn * uz;
          s.wy = (s.wy ?? 0) + rand(-6, 6);
          s.x += ux * 0.06;
          s.z += uz * 0.06;
          s.hitCD = 0.08;
          if (ndz > 0 && ndz < 55 && eng.G.thudBudget-- > 0) sRockRicochet((rock.x - cam.x) / 22, 0.3 * (1 - ndz / 55));
          break search;
        }
      }
    }

    if (!dead && (s.life > 40 || s.z < cam.z - 6)) dead = true;

    // The rider and horse (same hit tests as before).
    if (!dead && p.alive && s.y < 4 && Math.abs(s.z - p.z) < 6) {
      const rx0 = ox - (p.px ?? p.x);
      const ry0 = oy - (p.py ?? p.y);
      const rz0 = oz - (p.pz ?? p.z);
      const rx1 = s.x - p.x;
      const ry1 = s.y - p.y;
      const rz1 = s.z - p.z;
      o[0] = rx0;
      o[1] = ry0;
      o[2] = rz0;
      d[0] = rx1 - rx0;
      d[1] = ry1 - ry0;
      d[2] = rz1 - rz0;
      for (let a = 0; a < 3; a++) {
        mn[a] = pmin[a] - rad;
        mx[a] = pmax[a] + rad;
      }
      if (segBox(o, d, mn, mx)) {
        const k = rz0 !== rz1 ? clamp(rz0 / (rz0 - rz1), 0, 1) : 0;
        const hy = ry0 + (ry1 - ry0) * k;
        s.hitPart = hy > 1.55 ? 'the rider' : 'the horse';
        eng.killPlayerByStone(s);
        dead = true;
      } else if (!s.near && rz0 > 0 && rz1 <= 0) {
        const k = rz0 / (rz0 - rz1);
        const lx = rx0 + (rx1 - rx0) * k;
        const ly = ry0 + (ry1 - ry0) * k;
        const dd = Math.abs(lx);
        if (ly > -0.3 && ly < 3.6) {
          if (dd < 1.5) {
            s.near = true;
            eng.G.close++;
            eng.G.score += 25;
            eng.G.pops.push({
              text: dd < 0.8 ? 'CLOSE!!' : 'close',
              t: 0,
              x: eng.view.W / 2 + lx * 140 * eng.view.U,
              y: eng.view.H * 0.55,
            });
            eng.G.shake = Math.max(eng.G.shake, 0.06);
          }
          if (dd < 4) sWhoosh(clamp(lx / 3, -1, 1), s.bullet);
        }
      }
    }

    // Riders struck by fragments.
    if (!dead && s.y < 2.6) {
      const zlo = Math.min(oz, s.z) - 1.3;
      const zhi = Math.max(oz, s.z) + 1.3;
      for (const rider of eng.riders) {
        if (!rider.alive || rider.z < zlo || rider.z > zhi) continue;
        if (Math.abs(rider.x - s.x) < 0.42 + rad) {
          rider.alive = false;
          rider.tdir = s.vx > 0 ? 1 : -1;
          rider.tumble = 0;
          dead = true;
          const ndz = rider.z - cam.z;
          if (ndz < 400) spray(eng, rider.x, rider.y + 0.6, rider.z, 0, rider.speed * 0.4, 10, 0.6);
          if (ndz < 60) {
            sThud((rider.x - cam.x) / 25, 0.5);
            eng.G.pops.push({ text: 'Rider down', t: 0, wx: rider.x, wz: rider.z });
          }
          break;
        }
      }
    }

    if (dead) {
      eng.stones[i] = eng.stones[eng.stones.length - 1];
      eng.stones.pop();
    }
  }

  // Settled fragments are inert scenery: keep the most recent few.
  if (resting > MAX_REST) {
    let excess = resting - MAX_REST;
    for (let i = 0; i < eng.stones.length && excess > 0; i++) {
      if (eng.stones[i].rest) {
        eng.stones.splice(i, 1);
        i--;
        excess--;
      }
    }
  }
  if (eng.scars.length && Math.random() < 0.2) eng.scars = eng.scars.filter(sc => sc.z > cam.z - 8);
}
