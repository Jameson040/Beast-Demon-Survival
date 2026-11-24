import { clamp, DEMON_START } from './types';
import type { WallSegment, WorldPoint } from './types';

export interface PlanPoint {
  x: number;
  y: number;
}

export type LandmarkKind = 'pine' | 'shrub' | 'rock' | 'ruin' | 'tower' | 'hall' | 'house';

export interface ReferenceLandmark extends PlanPoint {
  id: string;
  kind: LandmarkKind;
}

export interface ReferenceTitan extends PlanPoint {
  id: string;
  number: number;
  rotationDeg: number;
}

export const REFERENCE = {
  format: 'groundtruth.scene.v1',
  gate: { x: 52, y: 76 },
  spawn: { x: 51, y: 70 },
  boss: { x: 52, y: -61 },
  wall: { center: { x: 56, y: -24 }, radius: 100, startAngleDeg: 0, sweepDeg: 180 },
} as const;

// Placement only: keep the existing 1,500 m ride and all independently sized assets.
export const SCENE = {
  lateralScale: 2.15,
  depthScale: DEMON_START / (REFERENCE.gate.y - REFERENCE.boss.y),
  gate: { x: 0, z: 0 },
  boss: { x: 0, z: DEMON_START },
  gateHalfWidth: 17,
  gateOpeningHalfWidth: 9,
  wallHeight: 50,
  wallThickness: 3.2,
  cameraStartOffset: 34,
  cameraRideOffset: 9,
} as const;

export function planToWorld(point: PlanPoint): WorldPoint {
  return {
    x: (point.x - REFERENCE.gate.x) * SCENE.lateralScale,
    z: (REFERENCE.gate.y - point.y) * SCENE.depthScale,
  };
}

export function worldToPlan(point: WorldPoint): PlanPoint {
  return {
    x: point.x / SCENE.lateralScale + REFERENCE.gate.x,
    y: REFERENCE.gate.y - point.z / SCENE.depthScale,
  };
}

// Object coordinates are authoritative. In particular, do not fill slots 10 and 11.
export const REFERENCE_TITANS: readonly ReferenceTitan[] = [
  { id: 'titan_pm8exe0', number: 1, x: -37.347, y: -29.48, rotationDeg: 230 },
  { id: 'titan_aqb1rqn', number: 2, x: -29.288, y: -35.753, rotationDeg: 234.21 },
  { id: 'titan_yve4v4w', number: 3, x: -20.791, y: -41.417, rotationDeg: 238.42 },
  { id: 'titan_scsvsdn', number: 4, x: -11.9, y: -46.442, rotationDeg: 242.63 },
  { id: 'titan_htii37d', number: 5, x: -2.664, y: -50.8, rotationDeg: 246.84 },
  { id: 'titan_ig5al11', number: 6, x: 6.867, y: -54.469, rotationDeg: 251.05 },
  { id: 'titan_oa07vqh', number: 7, x: 16.641, y: -57.428, rotationDeg: 255.26 },
  { id: 'titan_l4dqj8x', number: 8, x: 26.606, y: -59.661, rotationDeg: 259.47 },
  { id: 'titan_utipp3t', number: 9, x: 36.709, y: -61.156, rotationDeg: 263.68 },
  { id: 'titan_y1da8rq', number: 12, x: 67.291, y: -61.156, rotationDeg: 276.32 },
  { id: 'titan_xgbh1yz', number: 13, x: 77.394, y: -59.661, rotationDeg: 280.53 },
  { id: 'titan_w42o9wk', number: 14, x: 87.359, y: -57.428, rotationDeg: 284.74 },
  { id: 'titan_2uvbt2q', number: 15, x: 97.133, y: -54.469, rotationDeg: 288.95 },
  { id: 'titan_qf44zmd', number: 16, x: 106.664, y: -50.8, rotationDeg: 293.16 },
  { id: 'titan_i74pvyv', number: 17, x: 115.9, y: -46.442, rotationDeg: 297.37 },
  { id: 'titan_8o389zj', number: 18, x: 124.791, y: -41.417, rotationDeg: 301.58 },
  { id: 'titan_bs064y6', number: 19, x: 133.288, y: -35.753, rotationDeg: 305.79 },
  { id: 'titan_w8sz1t7', number: 20, x: 141.347, y: -29.48, rotationDeg: 310 },
];

type LandmarkTuple = readonly [id: string, x: number, y: number];
const landmarks = (kind: LandmarkKind, entries: readonly LandmarkTuple[]): ReferenceLandmark[] =>
  entries.map(([id, x, y]) => ({ id, kind, x, y }));

export const REFERENCE_LANDMARKS: readonly ReferenceLandmark[] = [
  ...landmarks('pine', [
    ['pine_en4j8ac', 23, -11], ['pine_ixf75d2', 7, 7], ['pine_b99jpqu', -10, 17],
    ['pine_alc087u', 11, -25], ['pine_ap2t2ny', 75, -11], ['pine_ansn9j6', 117, -13],
    ['pine_wtuaevo', 121, 9], ['pine_di2gugc', 88, 25], ['pine_rs7wmre', 47, 46],
    ['pine_2bjto18', 19, 29], ['pine_5zz9wn0', 9, 37], ['pine_gpzf7xs', 53, -1],
    ['pine_0rr55vu', 64, 32], ['pine_ov13r3c', 105, 54], ['pine_dztl54d', 117, 17],
    ['pine_78canc7', 95, 14], ['pine_lfhk1du', 95, -16],
  ]),
  ...landmarks('shrub', [
    ['shrub_wxndwj7', 24, 16], ['shrub_k8ewiy9', 78, 16], ['shrub_liw43j6', 79, 0],
    ['shrub_uq4pwzx', 57, -16], ['shrub_xnj4rn2', 22, 0], ['shrub_t4oser6', -14, -15],
    ['shrub_coyj5vn', 18, -31], ['shrub_kik7udd', 58, -30], ['shrub_3o3q1bb', 98, -21],
    ['shrub_ncjq0t6', 109, -30], ['shrub_wyd3pyw', 128, -2], ['shrub_6cp6raj', 133, 8],
    ['shrub_ghy9l3t', 106, 20], ['shrub_oci3eb0', 97, 28], ['shrub_9kypjk4', 75, 17],
    ['shrub_ziae658', 69, 18], ['shrub_16bsufp', 55, 35], ['shrub_idodm9e', 44, 41],
    ['shrub_kpaxxc9', 35, 51], ['shrub_a91otw4', 47, 57], ['shrub_hcvb0mh', 65, 55],
    ['shrub_bdgercj', 95, 42], ['shrub_97lc5pc', 114, 38], ['shrub_pety9gy', 51, 19],
  ]),
  ...landmarks('rock', [
    ['rock_lolxe6l', 1, 23], ['rock_c6ur5oi', 34, 8], ['rock_84m4edn', 70, 18],
    ['rock_p46lhzz', 89, 13], ['rock_9d6sjcs', 110, -6], ['rock_ycv6c2e', 130, -7],
    ['rock_4td13y7', 134, -7], ['rock_c2s3u0h', 43, -9], ['rock_5o96uk6', -11, -9],
    ['rock_t80hh28', -6, 13], ['rock_wk9j9ly', 7, 24], ['rock_9rnaauy', 41, 18],
    ['rock_wnx6gzz', 32, 40],
  ]),
  ...landmarks('ruin', [
    ['ruin_5mxkdye', 77, 48], ['ruin_i1rq02z', 102, 38], ['ruin_qcflkp2', 81, 28],
    ['ruin_0rci53h', 79, 13], ['ruin_2dd4imc', 42, 20], ['ruin_p369zql', 30, 37],
    ['ruin_43w4oq8', 9, 47], ['ruin_4lqkvs0', -2, 29],
  ]),
  ...landmarks('tower', [
    ['tower_j9ejpeu', 19, 7], ['tower_j7m0po9', 104, 19],
    ['tower_heoh0m2', 106, 3], ['tower_at5eeix', 88, -2],
  ]),
  ...landmarks('hall', [['hall_viawutu', 26, 22]]),
  ...landmarks('house', [
    ['house_pvpr3u1', 39, 50], ['house_iij3p5c', 32, 52], ['house_c5g8bx0', 26, 52],
    ['house_h6xipj9', 19, 57], ['house_7h4w3jm', 15, 56], ['house_28ozqgy', 31, 63],
    ['house_raz99qw', 54, 58], ['house_ymxgrc4', 69, 61], ['house_hfpuzgz', 84, 61],
    ['house_vk42v2h', 87, 58], ['house_n3tn6tu', 88, 52], ['house_rpebzqz', 88, 48],
    ['house_8exzdty', 87, 44], ['house_btdnew4', 74, 43], ['house_jzy1vi2', 65, 45],
    ['house_featboy', 59, 46], ['house_owldivh', 56, 51], ['house_smav3p6', 85, 36],
    ['house_2w5bdk7', 91, 35], ['house_65gurxt', 75, 36],
  ]),
];

export function wallPoint(angle: number): WorldPoint {
  const { center, radius } = REFERENCE.wall;
  return planToWorld({ x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) });
}

export function createWallSegments(): WallSegment[] {
  const segments: WallSegment[] = [];
  const gateAngle = (x: number) => Math.acos(
    (REFERENCE.gate.x + x / SCENE.lateralScale - REFERENCE.wall.center.x) / REFERENCE.wall.radius
  );
  const addWing = (start: number, end: number, gateX: number, reverse: boolean) => {
    const count = Math.ceil((end - start) / (Math.PI / 180));
    const points = Array.from({ length: count + 1 }, (_, i) => wallPoint(start + (end - start) * i / count));
    if (reverse) points.unshift({ x: gateX, z: 0 });
    else points.push({ x: gateX, z: 0 });
    for (let i = 1; i < points.length; i++) {
      segments.push({
        a: points[i - 1], b: points[i], height: SCENE.wallHeight,
        thickness: SCENE.wallThickness, texture: 'curtainWall',
      });
    }
  };
  addWing(0, gateAngle(SCENE.gateHalfWidth), SCENE.gateHalfWidth, false);
  addWing(gateAngle(-SCENE.gateHalfWidth), Math.PI, -SCENE.gateHalfWidth, true);
  return segments;
}

export function riderBounds(z: number): { min: number; max: number } {
  const { wall } = REFERENCE;
  const planY = REFERENCE.gate.y - Math.max(0, z) / SCENE.depthScale;
  const y = clamp((planY - wall.center.y) / wall.radius, 0, 1);
  const halfWidth = wall.radius * Math.sqrt(1 - y * y) * SCENE.lateralScale;
  const centerX = (wall.center.x - REFERENCE.gate.x) * SCENE.lateralScale;
  const min = Math.min(-7.4, centerX - halfWidth + 3);
  const max = Math.max(7.4, centerX + halfWidth - 3);
  return { min: Math.max(-100, min), max: Math.min(100, max) };
}

export function formationLane(lane: number, z: number): number {
  const bounds = riderBounds(z);
  const span = Math.min(90, (bounds.max - bounds.min) / 2 - 1);
  const center = clamp(0, bounds.min + span, bounds.max - span);
  return center + clamp(lane / 90, -1, 1) * span;
}

export function isRouteClear(x: number, z: number, radius: number): boolean {
  if (z < 75 && Math.abs(x) < 12 + radius) return false;
  return !REFERENCE_LANDMARKS.some(landmark => {
    if (landmark.kind === 'shrub') return false;
    const p = planToWorld(landmark);
    const clearance = landmark.kind === 'pine' || landmark.kind === 'rock' ? 4 : 10;
    return Math.abs(p.x - x) < radius + clearance && Math.abs(p.z - z) < 12 + radius;
  });
}