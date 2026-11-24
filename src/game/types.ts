export const GRAV = 9.81;
export const LTELE = 550;
export const DEMON_START = 1500;
export const RIDERS = 120;
export const WIN_DIST = 35;

export const HORSE_COLS: [number, number, number][] = [
  [114, 68, 36],
  [136, 76, 38],
  [64, 44, 34],
  [162, 152, 140],
  [94, 58, 34],
  [44, 34, 28],
  [178, 126, 74],
];

export const COATS: [number, number, number][] = [
  [120, 72, 40],
  [142, 80, 42],
  [64, 44, 34],
  [164, 154, 142],
  [98, 62, 36],
  [46, 36, 30],
  [184, 132, 80],
];

export const HORSE_VIEWS = [-0.8, -0.4, 0, 0.4, 0.8];
export const HPPM = 160;
export const TPPM = 38;
export const MPPM = 56;

export const HAZE: [number, number, number] = [212, 194, 164];

export type DiffKey = 'easy' | 'normal' | 'hard';

export interface DiffConfig {
  name: string;
  frag: number;
  acc: number;
  rate: number;
  targetP: number;
  carry: number;
  rockDensity: number;
}

export const DIFFS: Record<DiffKey, DiffConfig> = {
  easy: { name: 'Recruit', frag: 0.6, acc: 1.35, rate: 1.25, targetP: 0.30, carry: 1, rockDensity: 0.72 },
  normal: { name: 'Scout', frag: 1.0, acc: 1.0, rate: 1.0, targetP: 0.45, carry: 2, rockDensity: 1.0 },
  hard: { name: 'Veteran', frag: 1.5, acc: 0.78, rate: 0.82, targetP: 0.60, carry: 2, rockDensity: 1.28 },
};

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function gauss(): number {
  let u = 0;
  while (!u) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * Math.random());
}

export function fogf(dz: number): number {
  return clamp(1 - Math.exp(-dz / 1500), 0, 0.72);
}

export function fogc(c: [number, number, number], dz: number, a?: number): string {
  const f = fogf(dz);
  const r = (c[0] + (HAZE[0] - c[0]) * f) | 0;
  const g = (c[1] + (HAZE[1] - c[1]) * f) | 0;
  const b = (c[2] + (HAZE[2] - c[2]) * f) | 0;
  return a === undefined ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}

export const fmtT = (t: number) =>
  `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export interface ViewState {
  W: number;
  H: number;
  F: number;
  HOR: number;
  DPR: number;
  U: number;
}

export interface CameraState {
  x: number;
  y: number;
  z: number;
}

export interface ProjOut {
  x: number;
  y: number;
  s: number;
  dz: number;
}

export interface RiderEntity {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  speed: number;
  phase: number;
  alive: boolean;
  tumble: number;
  tdir: number;
  lean: number;
  col: [number, number, number];
  coat?: number;
  yawS?: number;
  stumble: number;
  isPlayer?: boolean;
  // Player-specific
  stam?: number;
  jumpCD?: number;
  dashCD?: number;
  px?: number;
  py?: number;
  pz?: number;
  // NPC-specific
  off?: number;
  lane?: number;
  home?: number;
  wf?: number;
  ph?: number;
  jig?: number;
  rockCD?: number;
}

export interface StoneEntity {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  delay: number;
  bounced: boolean;
  life: number;
  near: boolean;
  bullet: boolean;
  v: number;
  hitPart?: string;
  k?: number;
  e?: number;
  wx?: number;
  wy?: number;
  wz?: number;
  ax?: number;
  ay?: number;
  az?: number;
  rest?: boolean;
  skid?: number;
  bounces?: number;
  rockHit?: number;
  hitCD?: number;
}

export interface Scar {
  x: number;
  z: number;
  r: number;
  kind: 0 | 1;
  ang: number;
  len: number;
  a: number;
}

export interface ParticleEntity {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  col: [number, number, number];
  dust?: number;
  g?: number;
  v?: number;
  rot?: number;
  flare?: number;
}

export interface SceneryItem {
  x: number;
  z: number;
  k: number; // 0=grass, 1=pebble, 2=tree, 3=flower, 4=bush
  s: number;
  v: number;
  f: boolean;
  tex?: string;
  sourceId?: string;
}

export interface RockObstacle {
  id: number;
  x: number;
  z: number;
  rx: number;       // collision half-width (m)
  rz: number;       // collision half-depth (m)
  h: number;        // physical height (m)
  jumpable: boolean;
  tex: string;
  scale: number;
  flip: boolean;
  vaulted: boolean;
  hitCD: number;
  isTree?: boolean;
  sourceId?: string;
}

export interface WorldPoint {
  x: number;
  z: number;
}

export interface WallSegment {
  a: WorldPoint;
  b: WorldPoint;
  height: number;
  thickness: number;
  texture: string;
}

export interface WallStructure {
  x: number;
  z: number;
  tex: string;
  scale: number;
  flip: boolean;
  yOff?: number;
  side: -1 | 1;
  sourceId?: string;
  kind?: 'gate' | 'tower' | 'hall' | 'house' | 'ruin';
  halfWidth?: number;
  halfDepth?: number;
}

export interface FlareEntity {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  col: [number, number, number];
  emitT: number;
  /** World point the canister is aimed at (the Beast). */
  tx: number;
  ty: number;
  tz: number;
  flightT: number;
  emit: boolean;
}

export interface SmokePuff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  born: number;
  r: number;
  seed: number;
}

export interface GroundScuff {
  x: number;
  z: number;
  r: number;
  alpha: number;
}

export interface MonkeyState {
  state: 'idle' | 'pick' | 'crush' | 'windup' | 'throw' | 'recover' | 'cut';
  t: number;
  arm: number;
  handfuls: number;
  aL: number;
  bL: number;
  aR: number;
  bR: number;
  holding: boolean;
  stock: number;
  thrown?: boolean;
  armCut?: boolean;
  eyesCut?: boolean;
  legsCut?: boolean;
  drop?: number;
  tip?: number;
  landed?: boolean;
  flash?: number;
  guardNape?: boolean;
  leftArmCut?: boolean;
  napeCut?: boolean;
  extracted?: boolean;
  rescued?: boolean;
}

export interface QuadState {
  x: number;
  state: 'toMonkey' | 'drop' | 'toPile' | 'load';
  carry: number;
  t: number;
  phase: number;
  dir: number;
}

export interface TitanEntity {
  sourceId: string;
  number: number;
  heading: number;
  x: number;
  z: number;
  h: number;
  fat: number;
  head: number;
  col: [number, number, number];
  hair: [number, number, number] | null;
  ph: number;
  grin: number;
  lean: number;
  state: 'stand' | 'falling' | 'down';
  fall: number;
  fdir: number;
  down: number;
  steamT: number;
  slash: number;
  left: boolean;
  v?: number;
}

export interface LeviState {
  active: boolean;
  hidden: boolean;
  order: TitanEntity[];
  idx: number;
  x: number;
  y: number;
  z: number;
  sx?: number;
  sy?: number;
  sz?: number;
  fx: number;
  fy: number;
  fz: number;
  t: number;
  dur: number;
  phase: 'wait' | 'fly' | 'perch' | 'final' | 'cut';
  announced: boolean;
  wait?: number;
  killT?: number;
  carry?: boolean;
}

export interface ChunkEntity {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  a: number;
  va: number;
  len: number;
  th: number;
  hand: boolean;
  steamT: number;
  landed: boolean;
}

export interface KillerInfo {
  type: 'stone' | 'rock' | 'tree';
  kmh: number;
  inch?: number;
  rockH?: number;
  part: string;
}

export interface GameSnapshot {
  state: 'menu' | 'play' | 'pause' | 'over' | 'win' | 'freeze';
  diffKey: DiffKey;
  fate?: 'dead' | 'serious' | 'light';
  killer?: KillerInfo | null;
  fallDist?: number;
  winByLevi?: boolean;
  distance: number;
  time: number;
  closeCalls: number;
  vaults: number;
  rockClips: number;
  stonesThrown: number;
  companionsAlive: number;
  score: number;
  diffName: string;
}
