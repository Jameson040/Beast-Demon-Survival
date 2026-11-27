import {
  CameraState,
  ChunkEntity,
  clamp,
  DEMON_START,
  DiffConfig,
  DiffKey,
  DIFFS,
  FlareEntity,
  fmtT,
  GameSnapshot,
  gauss,
  GRAV,
  GroundScuff,
  HORSE_COLS,
  KillerInfo,
  lerp,
  LeviState,
  LTELE,
  MonkeyState,
  ParticleEntity,
  ProjOut,
  QuadState,
  rand,
  RiderEntity,
  RIDERS,
  RockObstacle,
  Scar,
  SceneryItem,
  SmokePuff,
  StoneEntity,
  TitanEntity,
  ViewState,
  WallSegment,
  WallStructure,
  WIN_DIST,
} from './types';
import {
  applyAudioMix,
  audioInit,
  nz,
  pauseMusic,
  sCrack,
  sDeath,
  sFlare,
  SFX,
  sHoof,
  sJump,
  sRockClip,
  sRockCrash,
  sScream,
  sThrowBoom,
  sVault,
  startMusic,
  switchToCounterattack,
  tone,
  updateHoovesMix,
} from './audio';
import { launchVelocity, stoneDrag, updateShrapnel } from './shrapnel';
import { burstAt, emitAlongPath, prunePuffs } from './smoke';
import {
  createWallSegments,
  formationLane,
  isRouteClear,
  planToWorld,
  REFERENCE_LANDMARKS,
  REFERENCE_TITANS,
  riderBounds,
  SCENE,
} from './scene';

export type EntityStyle = 'classic' | 'upgraded' | 'rigged';

export interface PopupItem {
  text: string;
  t: number;
  x?: number;
  y?: number;
  wx?: number;
  wz?: number;
  col?: string;
}

export interface WarnItem {
  until: number;
  start: number;
}

export interface GameState {
  state: 'menu' | 'play' | 'pause' | 'over' | 'win' | 'freeze';
  t: number;
  demonZ: number;
  slow: number;
  shake: number;
  wantJump: boolean;
  wantDash: boolean;
  radar: boolean;
  close: number;
  vaults: number;
  rockClips: number;
  score: number;
  pops: PopupItem[];
  warn: WarnItem[];
  deathT: number;
  killer: KillerInfo | null;
  fate?: 'dead' | 'serious' | 'light';
  fallDist: number;
  winByLevi?: boolean;
  stonesThrown: number;
  hoofPrev: number;
  thudBudget: number;
  caption: string;
  flash: number;
  rockFlash: number;
  impactFrame?: number;
  smokeEngulf?: number;
  scenZ: number;
  rockZ: number;
  zoom: number;
  zekeDone?: boolean;
  zekeDoneT: number;
  flareStage: number;
  screamStage: number;
}

const SKINS: [number, number, number][] = [
  [214, 160, 128],
  [198, 142, 110],
  [226, 178, 145],
  [180, 126, 96],
  [205, 150, 122],
];

export class GameEngine {
  view: ViewState = { W: 1280, H: 720, F: 828, HOR: 259, DPR: 1, U: 0.8 };
  cam: CameraState = { x: 0, y: 3.6, z: -9 };
  P: ProjOut = { x: 0, y: 0, s: 0, dz: 0 };

  diffKey: DiffKey = 'normal';
  cfg: DiffConfig = DIFFS.normal;

  G!: GameState;
  player!: RiderEntity;
  riders: RiderEntity[] = [];
  stones: StoneEntity[] = [];
  parts: ParticleEntity[] = [];
  scen: SceneryItem[] = [];
  rocks: RockObstacle[] = [];
  walls: WallStructure[] = [];
  wallSegments: WallSegment[] = [];
  flares: FlareEntity[] = [];
  smokePuffs: SmokePuff[] = [];
  scuffs: GroundScuff[] = [];
  scars: Scar[] = [];
  monkey!: MonkeyState;
  quad!: QuadState;
  titans: TitanEntity[] = [];
  levi!: LeviState;
  chunks: ChunkEntity[] = [];

  // Rigged 3D horse and rider are the sole active style.
  horseStyle: EntityStyle = 'rigged';
  riderStyle: EntityStyle = 'rigged';

  keys: Record<string, boolean> = {};
  touch = { l: false, r: false, up: false };

  private nextRockId = 1;
  private onStateChange?: (snap: GameSnapshot) => void;
  private godMode = false;

  constructor(onStateChange?: (snap: GameSnapshot) => void) {
    this.onStateChange = onStateChange;
    this.newGame();
    this.G.state = 'menu';
  }

  setView(width: number, height: number, dpr: number): void {
    this.view.DPR = dpr;
    this.view.W = width;
    this.view.H = height;
    this.view.F = Math.min(height * 1.15, width * 0.9);
    this.view.HOR = height * 0.36;
    this.view.U = height / 900;
  }

  proj(x: number, y: number, z: number): boolean {
    const dz = z - this.cam.z;
    if (dz < 0.4) return false;
    const s = (this.view.F * (1 + dz / LTELE)) / dz;
    this.P.x = this.view.W / 2 + (x - this.cam.x) * s;
    this.P.y = this.view.HOR + (this.cam.y - y) * s;
    this.P.s = s;
    this.P.dz = dz;
    return true;
  }

  closeness(): number {
    return 1 - clamp((this.G.demonZ - this.player.z) / DEMON_START, 0, 1);
  }

  getSnapshot(): GameSnapshot {
    const alive = this.riders.reduce((a, r) => a + (r.alive ? 1 : 0), 0);
    return {
      state: this.G.state,
      diffKey: this.diffKey,
      fate: this.G.fate,
      killer: this.G.killer,
      fallDist: this.G.fallDist,
      winByLevi: this.G.winByLevi,
      distance: Math.round(this.player.z),
      time: this.G.t,
      closeCalls: this.G.close,
      vaults: this.G.vaults,
      rockClips: this.G.rockClips,
      stonesThrown: this.G.stonesThrown,
      companionsAlive: alive,
      score: Math.round(this.G.score),
      diffName: this.cfg.name,
    };
  }

  private emitState(): void {
    if (this.onStateChange) this.onStateChange(this.getSnapshot());
  }

  setDifficulty(k: DiffKey): void {
    this.diffKey = k;
    this.cfg = DIFFS[k];
    this.emitState();
  }

  startGame(): void {
    audioInit();
    this.newGame();
    startMusic(true);
    this.emitState();
  }

  goToMenu(): void {
    this.G.state = 'menu';
    pauseMusic();
    this.emitState();
  }

  togglePause(): void {
    if (this.G.state === 'play') {
      this.G.state = 'pause';
      pauseMusic();
      this.emitState();
    } else if (this.G.state === 'pause') {
      this.G.state = 'play';
      startMusic(false);
      this.emitState();
    }
  }

  toggleMute(): boolean {
    SFX.on = !SFX.on;
    applyAudioMix();
    return SFX.on;
  }

  toggleRadar(): boolean {
    this.G.radar = !this.G.radar;
    return this.G.radar;
  }

  private regimentInfo(): { alive: number; dist: number } {
    let alive = 0;
    let sumZ = 0;
    for (let i = 0; i < this.riders.length; i++) {
      const r = this.riders[i];
      if (r.alive) {
        alive++;
        sumZ += r.z;
      }
    }
    const dist = this.player.alive || alive === 0 ? 0 : Math.max(0, sumZ / alive - this.cam.z);
    return { alive, dist };
  }

  syncAudio(): void {
    const { alive, dist } = this.regimentInfo();
    const playing = this.G.state === 'play';
    updateHoovesMix(alive, this.riders.length, this.player.alive, this.player.speed, playing, dist);
    if (!playing || !SFX.on) {
      if (SFX.rumble) SFX.rumble.gain.value = 0;
      if (SFX.wind) SFX.wind.gain.value = 0;
    }
  }

  newGame(): void {
    this.cfg = DIFFS[this.diffKey];
    const prevRadar = this.G ? this.G.radar : true;
    this.G = {
      state: 'play',
      t: 0,
      demonZ: DEMON_START,
      slow: 1,
      shake: 0,
      wantJump: false,
      wantDash: false,
      radar: prevRadar,
      close: 0,
      vaults: 0,
      rockClips: 0,
      score: 0,
      pops: [],
      warn: [],
      deathT: 0,
      killer: null,
      fallDist: 0,
      stonesThrown: 0,
      hoofPrev: 0,
      thudBudget: 0,
      caption: '',
      flash: 0,
      rockFlash: 0,
      scenZ: 0,
      rockZ: 55,
      zoom: 1,
      zekeDone: false,
      zekeDoneT: 0,
      flareStage: 0,
      screamStage: 0,
    };

    this.player = {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      speed: 15,
      stam: 1,
      phase: 0,
      jumpCD: 0,
      dashCD: 0,
      alive: true,
      tumble: 0,
      tdir: 1,
      lean: 0,
      stumble: 0,
      px: 0,
      py: 0,
      pz: 0,
      col: HORSE_COLS[0],
      isPlayer: true,
    };

    this.riders = [];
    const COLS = 15;
    const ROWS = Math.ceil(RIDERS / COLS);
    for (let i = 0; i < RIDERS; i++) {
      const c = i % COLS;
      const rw = (i / COLS) | 0;
      const home = (c - (COLS - 1) / 2) * 12 + (rw % 2 ? 6 : 0);
      const off = 9 + rw * (160 / ROWS) + rand(-3, 3);
      const bounds = riderBounds(off);
      const x = clamp(formationLane(home, off) + rand(-0.5, 0.5), bounds.min + 1, bounds.max - 1);
      this.riders.push({
        x,
        y: 0,
        z: off,
        off,
        lane: home,
        home,
        vx: 0,
        vy: 0,
        speed: 15,
        phase: rand(0, 6.28),
        wf: rand(0.2, 0.6),
        ph: rand(0, 6.28),
        col: HORSE_COLS[(Math.random() * HORSE_COLS.length) | 0],
        alive: true,
        tumble: 0,
        tdir: Math.random() < 0.5 ? -1 : 1,
        lean: 0,
        stumble: 0,
        jig: 0,
        rockCD: 0,
      });
    }

    this.stones = [];
    this.parts = [];
    this.scen = [];
    this.rocks = [];
    this.walls = [];
    this.wallSegments = [];
    this.flares = [];
    this.smokePuffs = [];
    this.scuffs = [];
    this.scars = [];
    this.chunks = [];
    this.nextRockId = 1;

    this.monkey = {
      state: 'idle',
      t: 0,
      arm: 1,
      handfuls: 0,
      aL: 0.15,
      bL: 0.05,
      aR: 0.15,
      bR: 0.05,
      holding: false,
      stock: 2,
    };
    this.quad = { x: 40, state: 'toMonkey', carry: this.cfg.carry, t: 0, phase: 0, dir: -1 };

    this.initCityWall();
    this.initReferenceLandmarks();
    this.initTitans();
    this.genScenery(0, 440);
    this.genFieldRocks(56, 460);

    this.cam.x = 0;
    this.cam.y = 3.6;
    this.cam.z = -SCENE.cameraStartOffset;
  }

  private initCityWall(): void {
    this.wallSegments = createWallSegments();
    this.walls = [{
      ...SCENE.gate, tex: 'cityGate', scale: 1, flip: false, side: 1,
      sourceId: 'gate_c3naprd', kind: 'gate',
    }];
  }

  private initReferenceLandmarks(): void {
    const variants: Record<string, number> = {};
    for (const item of REFERENCE_LANDMARKS) {
      const index = variants[item.kind] || 0;
      variants[item.kind] = index + 1;
      const point = planToWorld(item);
      // Keep district buildings clear of the charge line, so none fills the camera as the rider passes.
      if (item.kind !== 'pine' && item.kind !== 'rock' && item.kind !== 'shrub' && Math.abs(point.x) < 13) {
        point.x = (point.x < 0 ? -1 : 1) * (13 + (index % 4) * 1.5);
      }
      if (item.kind === 'pine' || item.kind === 'rock') {
        const tree = item.kind === 'pine';
        const scale = tree ? 0.88 + (index % 3) * 0.055 : 0.92 + (index % 3) * 0.06;
        this.rocks.push({
          ...point, id: this.nextRockId++, sourceId: item.id,
          rx: (tree ? 0.65 : 1.48) * scale, rz: (tree ? 0.65 : 1.22) * scale,
          h: (tree ? 16 : 1.95) * scale, jumpable: false,
          tex: tree ? 'treePine' + (index % 2) : 'bigRock' + (index % 4),
          scale, flip: index % 2 === 0, vaulted: false, hitCD: 0, isTree: tree,
        });
      } else if (item.kind === 'shrub') {
        this.scen.push({
          ...point, k: 4, s: 0.85 + (index % 3) * 0.1,
          v: index % 3, f: index % 2 === 0, sourceId: item.id,
        });
      } else {
        const scale = item.kind === 'house' ? 0.64
          : item.kind === 'hall' ? 1 : item.kind === 'tower' ? 0.25 : 0.19;
        const tex = item.kind === 'house' ? 'shiganshinaHouse' + (index % 2)
          : item.kind === 'hall' ? 'districtHall'
            : item.kind === 'tower' ? 'wallTower' + (index % 2) : 'wallRuined';
        this.walls.push({
          ...point, tex, scale, flip: index % 2 === 0,
          side: point.x < 0 ? -1 : 1, sourceId: item.id, kind: item.kind,
          halfWidth: item.kind === 'hall' ? 8 : item.kind === 'tower' ? 2.2 : 3.2,
          halfDepth: item.kind === 'hall' ? 5 : 3,
        });
      }
    }
  }

  /* ---------------- MEADOW SCENERY & FLANKING TREELINE ---------------- */
  private genScenery(z0: number, z1: number): void {
    const zLimit = Math.min(z1, DEMON_START + 40);
    for (let z = Math.ceil(z0 / 10) * 10; z < zLimit; z += 10) {
      // Rich meadow grass, wildflowers, pebbles & occasional bushes
      const n = 24 + ((Math.random() * 8) | 0);
      for (let i = 0; i < n; i++) {
        const r = Math.random();
        const k = r < 0.68 ? 0 : r < 0.81 ? 3 : r < 0.9 ? 1 : 4;
        const x = k === 0 || k === 3 ? rand(-78, 78) : rand(-175, 175);
        this.scen.push({
          x,
          z: z + rand(0, 10),
          k,
          s: rand(0.65, 1.38),
          v: (Math.random() * 4) | 0,
          f: Math.random() < 0.5,
        });
      }

    }
    this.G.scenZ = z1;
  }

  /* ---------------- TIERED COLLIDABLE FIELD ROCKS ---------------- */
  private genFieldRocks(z0: number, z1: number): void {
    const zMax = Math.min(z1, DEMON_START - 135);
    const step = Math.round(20 / this.cfg.rockDensity);
    for (let z = Math.ceil(z0 / step) * step; z < zMax; z += step) {
      // 1 to 3 well-spaced rocks per forward band across the 180m field width
      const count = Math.random() < 0.35 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        // Slightly bias some rocks into the central corridor so the player actively steers & jumps!
        const central = i === 0 && Math.random() < 0.72;
        const x = central ? rand(-38, 38) : rand(-84, 84);
        const rzPos = z + rand(0, step * 0.85);
        const bounds = riderBounds(rzPos);
        if (x < bounds.min + 3 || x > bounds.max - 3 || !isRouteClear(x, rzPos, 2.2)) continue;

        // Guarantee fair clearance from other collidable rocks/trees (never an unfair wall!)
        let tooClose = false;
        for (let k = this.rocks.length - 1; k >= 0; k--) {
          const o = this.rocks[k];
          if (Math.abs(o.z - rzPos) > 20) continue;
          if (Math.hypot(o.x - x, o.z - rzPos) < 10.0) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue;

        const jumpable = Math.random() < 0.64;
        const scale = jumpable ? rand(0.86, 1.12) : rand(0.82, 1.12);
        const v = (Math.random() * 4) | 0;
        const rock: RockObstacle = {
          id: this.nextRockId++,
          x,
          z: rzPos,
          rx: (jumpable ? 0.92 : 1.48) * scale,
          rz: (jumpable ? 0.76 : 1.22) * scale,
          h: (jumpable ? 0.82 : 1.95) * scale,
          jumpable,
          tex: (jumpable ? 'lowRock' : 'bigRock') + v,
          scale,
          flip: Math.random() < 0.5,
          vaulted: false,
          hitCD: 0,
        };
        this.rocks.push(rock);

        // Ground-dress the rock's base with grass & small pebbles so it feels deeply embedded in the earth!
        for (let d = 0; d < 2; d++) {
          this.scen.push({
            x: x + rand(-rock.rx * 1.15, rock.rx * 1.15),
            z: rzPos + rand(-0.6, 0.7),
            k: d === 0 ? 0 : 1,
            s: rand(0.65, 1.1),
            v: (Math.random() * 4) | 0,
            f: Math.random() < 0.5,
          });
        }
      }
    }
    this.G.rockZ = z1;
  }

  /* ---------------- SIGNAL FLARES & SCOUT WAR CRIES ---------------- */
  /** Three salvos fired at 10 s, 20 s, and 35 s by all Scouts still alive and riding. */
  private static readonly FLARE_TIMES = [10, 20, 35];
  /** Battle screams trigger right before each flare salvo (three times total). */
  private static readonly SCREAM_TIMES = [7.5, 17.5, 32.5];
  private static readonly SMOKE: [number, number, number] = [30, 220, 85];

  /** Every living rider fires together; canisters scatter over a 100 m radius around the Beast. */
  private fireSignalSalvo(): void {
    const col = GameEngine.SMOKE;
    let index = 0;
    const shoot = (x: number, z: number) => {
      const angle = index * 2.39996 + this.G.flareStage * 0.63;
      const radius = 15 + 85 * Math.sqrt(((index * 0.618034) % 1 + 1) % 1);
      // One canister in eight leaves a visible plume, so the plumes read as separate clouds.
      const emit = index % 8 === 0;
      index++;
      const aim = {
        x: Math.cos(angle) * radius,
        y: 1.6 + (index % 5) * 0.28,
        z: this.G.demonZ + Math.sin(angle) * radius,
      };
      const from = { x, y: 2.3, z };
      const dist = Math.hypot(aim.x - x, aim.z - z);
      const T = clamp(dist / 125, 2.5, 10.8);
      const v = launchVelocity(from, aim, T, 0.012);
      this.flares.push({
        ...from,
        vx: v.vx,
        vy: v.vy,
        vz: v.vz,
        life: 0,
        max: T,
        col,
        emitT: 0,
        tx: aim.x,
        ty: aim.y,
        tz: aim.z,
        flightT: T,
        emit,
      });
    };
    if (this.player.alive) shoot(this.player.x, this.player.z);
    for (const r of this.riders) if (r.alive) shoot(r.x, r.z);
    if (index === 0) return;
    sFlare(0);
    this.G.caption = 'GREEN SMOKE — THE BEAST IS BLINDED';
    this.G.pops.push({ text: 'Signal flare!', t: -0.4, x: this.view.W / 2, y: this.view.H * 0.28, col: 'rgba(120,230,150,' });
  }

  private updateFlares(dt: number): void {
    const sMark = GameEngine.SCREAM_TIMES[this.G.screamStage];
    if (sMark !== undefined && this.G.t >= sMark) {
      this.G.screamStage++;
      const { alive, dist } = this.regimentInfo();
      const aliveTotal = (this.player.alive ? 1 : 0) + alive;
      if (aliveTotal > 0) sScream(aliveTotal / (this.riders.length + 1), dist);
    }
    const tMark = GameEngine.FLARE_TIMES[this.G.flareStage];
    if (tMark !== undefined && this.G.t >= tMark) {
      this.G.flareStage++;
      this.fireSignalSalvo();
    }
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const fl = this.flares[i];
      fl.life += dt;
      const damp = Math.exp(-0.012 * dt);
      fl.vx *= damp;
      fl.vz *= damp;
      fl.vy = fl.vy * damp - GRAV * dt;
      fl.x += fl.vx * dt;
      fl.y += fl.vy * dt;
      fl.z += fl.vz * dt;
      if (fl.life >= fl.flightT) {
        if (fl.emit) burstAt(this.smokePuffs, fl.tx, fl.ty, fl.tz, this.G.t, 8);
        this.flares.splice(i, 1);
        continue;
      }
      if (fl.emit) emitAlongPath(this.smokePuffs, fl, dt, this.G.t);
    }
    prunePuffs(this.smokePuffs, this.G.t);
  }

  /* ---------------- MONKEY / QUAD ---------------- */
  armHand(side: number, a: number, b: number): [number, number, number, number] {
    const sx = side * 3.8;
    const sy = 15.0;
    const L = 6.6;
    const ex = sx + side * Math.sin(a) * L;
    const ey = sy - Math.cos(a) * L;
    const a2 = a + b;
    return [ex, ey, ex + side * Math.sin(a2) * L, ey - Math.cos(a2) * L];
  }

  private updateMonkey(dt: number): void {
    const m = this.monkey;
    if (m.state === 'cut') {
      this.updateCut(dt);
      return;
    }
    const rm = this.cfg.rate * (0.6 + 0.4 * (1 - this.closeness()));
    m.t += dt;
    let tL: [number, number] = [0.15 + Math.sin(this.G.t * 1.1) * 0.06, 0.05];
    let tR: [number, number] = [0.15 + Math.sin(this.G.t * 1.1 + 1) * 0.06, 0.05];
    const setT = (side: number, v: [number, number]) => {
      if (side > 0) tR = v;
      else tL = v;
    };

    const hasTargets = this.player.alive || this.riders.some(r => r.alive);

    switch (m.state) {
      case 'idle':
        if (!hasTargets) {
          this.G.caption = 'All riders have fallen...';
          break;
        }
        this.G.caption = m.stock > 0 ? '' : 'The Beast waits for boulders...';
        if (m.stock > 0 && m.t > 1.6 * rm) {
          m.state = 'pick';
          m.t = 0;
        }
        break;
      case 'pick':
        if (!hasTargets) {
          m.holding = false;
          m.state = 'idle';
          m.t = 0;
          break;
        }
        this.G.caption = 'The Beast grabs a boulder';
        setT(-1, [0.55, 0.35]);
        if (m.t > 1.1 * rm) {
          m.stock--;
          m.holding = true;
          m.state = 'crush';
          m.t = 0;
        }
        break;
      case 'crush':
        this.G.caption = 'CRUSHING';
        tL = [0.6, -2.0];
        tR = [0.6, -2.0];
        if (m.t > 0.55 && m.holding) {
          m.holding = false;
          const dz = this.G.demonZ - 1.5;
          for (let i = 0; i < 60; i++) {
            this.parts.push({
              x: rand(-1.5, 1.5),
              y: 8.5 + rand(-1, 1),
              z: dz,
              vx: rand(-9, 9),
              vy: rand(-2, 10),
              vz: rand(-6, 6),
              life: 0,
              max: rand(1, 2.2),
              size: rand(0.25, 0.7),
              col: [120, 110, 100],
              g: 1,
            });
          }
          for (let i = 0; i < 14; i++) {
            this.parts.push({
              x: rand(-2, 2),
              y: 8.5,
              z: dz,
              vx: rand(-3, 3),
              vy: rand(0, 3),
              vz: rand(-2, 2),
              life: 0,
              max: rand(1.5, 3),
              size: rand(2, 4),
              col: [170, 150, 120],
              dust: 1,
            });
          }
          sCrack(Math.min((this.G.demonZ - this.player.z) / 343, 4));
          this.G.shake = Math.max(this.G.shake, 0.15 * this.closeness() + 0.03);
          m.handfuls = 3;
          m.arm = -1;
        }
        if (m.t > 1.25 * rm) {
          m.state = 'windup';
          m.t = 0;
        }
        break;
      case 'windup':
        this.G.caption = 'WINDING UP';
        setT(-1, [1.85, 0.55]);
        setT(1, [0.45, -1.4]);
        if (m.t > 0.95 * rm) {
          m.state = 'throw';
          m.t = 0;
          m.thrown = false;
        }
        break;
      case 'throw': {
        this.G.caption = 'THROWING';
        const k = clamp(m.t / 0.24, 0, 1);
        const a = lerp(1.85, -0.75, k);
        const b = lerp(0.55, -0.15, k);
        m.aL = a;
        m.bL = b;
        setT(-1, [a, b]);
        setT(1, [0.45, -1.4]);
        if (!m.thrown && k > 0.42) {
          m.thrown = true;
          const h = this.armHand(-1, a, b);
          this.volley(h[2], h[3], this.G.demonZ - 1.5);
          sThrowBoom(
            Math.min((this.G.demonZ - this.player.z) / 343, 4.5),
            0.75 + 0.25 * this.closeness()
          );
          m.handfuls--;
        }
        if (m.t > 0.3) {
          m.state = 'recover';
          m.t = 0;
        }
        break;
      }
      case 'recover':
        setT(-1, [0.45, -0.9]);
        setT(1, [0.45, -1.4]);
        if (m.t > 1.05 * rm) {
          m.t = 0;
          if (m.handfuls > 0 && hasTargets) {
            m.arm = -1;
            m.state = 'windup';
          } else {
            m.handfuls = 0;
            m.state = 'idle';
          }
        }
        break;
    }
    if (m.state !== 'throw') {
      const r = Math.min(1, dt * 9);
      m.aL = lerp(m.aL, tL[0], r);
      m.bL = lerp(m.bL, tL[1], r);
      m.aR = lerp(m.aR, tR[0], r);
      m.bR = lerp(m.bR, tR[1], r);
    }
  }

  private updateQuad(dt: number): void {
    const q = this.quad;
    const sp = 9 + 6 * this.closeness();
    q.t += dt;
    if (this.monkey.state === 'cut') {
      if (this.monkey.t > 9.4 && !this.monkey.rescued) {
        q.dir = -1;
        q.x = lerp(q.x, 11, Math.min(1, dt * 2.8));
        q.phase += 14 * dt;
      } else if (this.monkey.rescued) {
        q.dir = 1;
        q.x += 23 * dt;
        q.phase += 20 * dt;
      }
      return;
    }
    if (q.state === 'toMonkey') {
      q.dir = -1;
      q.x -= sp * dt;
      q.phase += sp * dt * 0.9;
      if (q.x <= 16) {
        q.x = 16;
        q.state = 'drop';
        q.t = 0;
      }
    } else if (q.state === 'drop') {
      if (q.t > 0.8 && q.carry > 0) {
        q.carry--;
        this.monkey.stock = Math.min(this.monkey.stock + 1, 5);
        q.t = 0.4;
      }
      if (q.carry === 0 && q.t > 0.6) {
        q.state = 'toPile';
        q.t = 0;
      }
    } else if (q.state === 'toPile') {
      q.dir = 1;
      q.x += sp * dt;
      q.phase += sp * dt * 0.9;
      if (q.x >= 54) {
        q.x = 54;
        q.state = 'load';
        q.t = 0;
      }
    } else if (q.state === 'load') {
      if (q.t > 1.1) {
        q.carry = this.cfg.carry;
        q.state = 'toMonkey';
        q.t = 0;
      }
    }
  }

  private volley(hx: number, hy: number, hz: number): void {
    const dist = hz - this.player.z;
    const cl = this.closeness();
    const n = Math.round((55 + 100 * cl) * this.cfg.frag * rand(0.85, 1.2));
    const alive = this.riders.filter(r => r.alive);
    const pool = this.player.alive ? alive.concat([this.player]) : alive;
    if (!pool.length) return;

    // Sort living targets left-to-right so the sweep follows actual rider positions across X and Z
    const sorted = pool.slice().sort((a, b) => a.x - b.x);
    const count = sorted.length;
    // As fewer Scouts remain, Beast focuses his sweep tightly onto their clusters instead of empty grass
    const focusK = clamp(count / 32, 0, 1);
    const minX = sorted[0].x - lerp(2.5, 6, focusK);
    const maxX = sorted[count - 1].x + lerp(2.5, 6, focusK);

    const aimAtPlayer = this.player.alive && Math.random() < this.cfg.targetP + 0.3 * cl;
    const baseSigma = (3.0 + dist * 0.012) * this.cfg.acc * (this.player.alive ? 1 : 0.45);
    const sigma = baseSigma * lerp(0.32, 1.0, focusK);
    const zJitter = lerp(2.5, 11.0, focusK);
    // Straight, baseball-like fastball speed (flat trajectory, not high mortar arc)
    const baseVh = rand(205, 250);
    let minT = 1e9;
    let atPlayer = false;

    for (let i = 0; i < n; i++) {
      const u = i / Math.max(1, n - 1);
      const isPlayerSlice = aimAtPlayer && Math.random() < 0.12;
      const sweepTgt = sorted[Math.min(count - 1, Math.floor(u * count))];
      const tgt = isPlayerSlice ? this.player : sweepTgt;
      // Blend between full-width sweep and focused target X as riders thin out
      const sweepX = lerp(tgt.x, lerp(minX, maxX, u), focusK * 0.65);

      const bullet = Math.random() < 0.15;
      const chunk = !bullet && Math.random() < 0.05;
      const vh = baseVh * rand(0.92, 1.08) * (bullet ? 1.15 : chunk ? 0.92 : 1);

      let T = Math.hypot((isPlayerSlice ? tgt.x : sweepX) - hx, tgt.z - hz) / vh;
      const px = isPlayerSlice
        ? tgt.x + tgt.vx * T * rand(0.2, 0.9)
        : sweepX + tgt.vx * T * 0.5 + gauss() * (sigma * 0.72);
      let pz = tgt.z + tgt.speed * T;
      T = Math.hypot(px - hx, pz - hz) / vh;
      pz = tgt.z + tgt.speed * T;

      const tx = isPlayerSlice ? px + gauss() * sigma : px;
      const tz = pz + gauss() * sigma * 0.9 + (isPlayerSlice ? 0 : rand(-zJitter, zJitter));
      const ty = rand(0.25, 2.25);
      const T2 = Math.hypot(tx - hx, tz - hz) / vh;
      const kd = stoneDrag(bullet, chunk);
      const lv = launchVelocity({ x: hx, y: hy, z: hz }, { x: tx, y: ty, z: tz }, T2, kd);
      const vy = lv.vy;
      const r = bullet ? rand(0.008, 0.014) : chunk ? rand(0.07, 0.14) : rand(0.02, 0.035);
      const delay = u * 0.18 + rand(0, 0.04);
      this.stones.push({
        x: hx + rand(-0.6, 0.6),
        y: hy + rand(-0.6, 0.6),
        z: hz,
        vx: lv.vx,
        vy,
        vz: lv.vz,
        r,
        delay,
        bounced: false,
        life: 0,
        near: false,
        bullet,
        v: (Math.random() * 4) | 0,
        k: kd,
        e: 0.16 + rand(0, 0.12),
        wx: rand(-14, 14),
        wy: rand(-14, 14),
        wz: rand(-14, 14),
        ax: rand(0, 6.28),
        ay: rand(0, 6.28),
        az: rand(0, 6.28),
        rest: false,
        skid: 0,
        bounces: 0,
      });
      if (isPlayerSlice) {
        atPlayer = true;
        if (T2 + delay < minT) minT = T2 + delay;
      }
    }
    this.G.stonesThrown += n;
    if (atPlayer) this.G.warn.push({ until: this.G.t + minT, start: this.G.t });
  }

  /* ---------------- COLLISION & DEATH HELPERS ---------------- */
  sprayBlood(x: number, y: number, z: number, vx: number, vy: number, vz: number, count: number): void {
    for (let i = 0; i < count && this.parts.length < 1400; i++) {
      const dark = Math.random() < 0.45;
      this.parts.push({
        x: x + rand(-0.25, 0.25),
        y: Math.max(0.15, y + rand(-0.3, 0.3)),
        z: z + rand(-0.25, 0.25),
        vx: vx + rand(-3.8, 3.8),
        vy: vy + rand(1.0, 4.8),
        vz: vz + rand(-3.0, 3.0),
        life: 0,
        max: rand(0.55, 1.35),
        size: rand(0.08, 0.22),
        col: dark ? [102, 8, 10] : [156, 14, 18],
        g: 1,
      });
    }
  }

  addBloodPool(x: number, z: number, r: number): void {
    this.scars.push({
      x,
      z,
      r,
      kind: 2,
      ang: rand(0, 6.28),
      len: 0,
      a: rand(0.78, 0.96),
    });
    if (this.scars.length > 280) this.scars.splice(0, this.scars.length - 280);
  }

  launchFallenRider(ent: RiderEntity, impactVx: number, impactVz = 0, speedScale = 1): void {
    const dir = ent.tdir || (Math.random() < 0.5 ? -1 : 1);
    ent.tdir = dir;
    ent.tumble = 0;
    ent.rx = ent.x;
    ent.ry = Math.max(1.35, ent.y + 1.35);
    ent.rz = ent.z;
    const frontalHit = impactVz < -25;
    // Frontal supersonic stone impact knocks rider sideways & slightly back relative to the coasting horse;
    // rock crash pitches rider forward/sideways off the halted horse with realistic inertia.
    ent.rvx = dir * rand(3.0, 6.2) + clamp(impactVx * 0.15, -4, 4);
    ent.rvy = frontalHit ? rand(2.8, 5.0) : rand(3.6, 5.8);
    ent.rvz = frontalHit
      ? ent.speed * rand(0.18, 0.42) * speedScale
      : ent.speed * rand(0.48, 0.72) * speedScale;
    ent.rrot = dir * rand(0.4, 1.1);
    ent.rlanded = false;
    ent.hlanded = false;
    ent.deadSeed = Math.random();
    ent.vx = -dir * rand(0.8, 2.2);
  }

  private updateFallenRider(ent: RiderEntity, dt: number): void {
    ent.tumble += dt;
    ent.speed = Math.max(0, ent.speed - 16 * dt);
    ent.z += ent.speed * dt;
    ent.vx *= Math.exp(-3.5 * dt);
    ent.x += ent.vx * dt;
    ent.y = Math.max(0, ent.y - 3.5 * dt);

    const ndz = ent.z - this.cam.z;
    if (!ent.hlanded && ent.tumble > 0.34) {
      ent.hlanded = true;
      if (ndz > -5 && ndz < 340) {
        this.addBloodPool(ent.x + rand(-0.4, 0.4), ent.z + rand(-0.4, 0.4), rand(0.65, 1.05));
        for (let i = 0; i < 6 && this.parts.length < 1400; i++) {
          this.parts.push({
            x: ent.x + rand(-0.9, 0.9),
            y: 0.15,
            z: ent.z + rand(-0.9, 0.9),
            vx: rand(-2, 2),
            vy: rand(0.4, 1.8),
            vz: ent.speed * 0.25 + rand(-1, 1),
            life: 0,
            max: rand(0.7, 1.4),
            size: rand(0.45, 0.95),
            col: [152, 128, 96],
            dust: 1,
          });
        }
      }
    }

    if (ent.rx === undefined || ent.rz === undefined) return;
    ent.ry = ent.ry ?? 0;
    ent.rvx = ent.rvx ?? 0;
    ent.rvy = ent.rvy ?? 0;
    ent.rvz = ent.rvz ?? 0;
    ent.rrot = ent.rrot ?? 0;

    if (ent.ry > 0 || ent.rvy > 0) {
      ent.rx += ent.rvx * dt;
      ent.rz += ent.rvz * dt;
      ent.rvy -= GRAV * 1.45 * dt;
      ent.ry += ent.rvy * dt;
      ent.rrot += ent.tdir * 7.2 * dt;
      if (ndz > 0 && ndz < 300 && ent.ry > 0.25 && Math.random() < dt * 16) {
        this.sprayBlood(ent.rx, ent.ry, ent.rz, ent.rvx * 0.2, 0.5, ent.rvz * 0.2, 1);
      }
      if (ent.ry <= 0) {
        ent.ry = 0;
        if (!ent.rlanded) {
          ent.rlanded = true;
          if (ndz > -5 && ndz < 340) {
            this.addBloodPool(ent.rx, ent.rz, rand(0.55, 0.9));
            this.sprayBlood(ent.rx, 0.2, ent.rz, ent.rvx * 0.25, 1.8, ent.rvz * 0.25, 8);
          }
        }
        if (ent.rvy < -3.6) {
          ent.rvy = -ent.rvy * 0.22;
          ent.rvx *= 0.6;
          ent.rvz *= 0.6;
        } else {
          ent.rvy = 0;
        }
      }
    } else {
      const skidDamp = Math.exp(-5.5 * dt);
      ent.rvx *= skidDamp;
      ent.rvz *= skidDamp;
      ent.rx += ent.rvx * dt;
      ent.rz += ent.rvz * dt;
      // Wrap tumble angle into [-PI, PI] so fallen Scouts settle flat horizontally
      const twoPi = Math.PI * 2;
      ent.rrot = ((((ent.rrot + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
      const targetRot = ent.tdir * 0.08;
      ent.rrot = lerp(ent.rrot, targetRot, Math.min(1, dt * 10));
    }
  }

  killPlayerByStone(s: StoneEntity): void {
    if (!this.player.alive || this.godMode) return;
    this.player.alive = false;
    this.player.tdir = s.vx > 0 ? 1 : -1;
    this.launchFallenRider(this.player, s.vx, s.vz, 0.9);
    this.sprayBlood(
      this.player.x,
      1.5,
      this.player.z,
      s.vx * 0.12,
      s.vy * 0.08 + 2.2,
      s.vz * 0.12 + this.player.speed * 0.4,
      20
    );
    this.G.killer = {
      type: 'stone',
      kmh: Math.hypot(s.vx, s.vy, s.vz) * 3.6,
      inch: (s.r * 2) / 0.0254,
      part: s.hitPart || 'the horse',
    };
    this.G.deathT = 0;
    this.G.slow = 0.18;
    this.G.shake = 0.85;
    this.G.flash = 1;
    this.G.impactFrame = 2;
    const chunk = s.r > 0.06;
    const r = Math.random();
    if (s.hitPart === 'the rider') {
      this.G.fate = chunk || r < 0.55 ? 'dead' : r < 0.86 ? 'serious' : 'light';
    } else {
      this.G.fate = (chunk && r < 0.5) || r < 0.15 ? 'dead' : r < 0.55 ? 'serious' : 'light';
    }
    this.G.fallDist = this.G.demonZ - this.player.z;
    sDeath();
    this.emitState();
    for (let i = 0; i < 30; i++) {
      this.parts.push({
        x: this.player.x + rand(-0.6, 0.6),
        y: rand(0.2, 1.5),
        z: this.player.z + rand(-1, 1),
        vx: rand(-3, 3),
        vy: rand(0, 3),
        vz: rand(-2, 4) + this.player.speed * 0.5,
        life: 0,
        max: rand(1, 2.5),
        size: rand(0.4, 1),
        col: [150, 125, 95],
        dust: 1,
      });
    }
  }

  /* ---------------- ROCK / TREE COLLISION WITH PLAYER ---------------- */
  private killPlayerByRock(rock: RockObstacle): void {
    if (!this.player.alive || this.godMode) return;
    const p = this.player;
    p.alive = false;
    p.tdir = p.x >= rock.x ? 1 : -1;
    this.G.killer = {
      type: rock.isTree ? 'tree' : 'rock',
      kmh: p.speed * 3.6,
      rockH: rock.h,
      part: 'the horse',
    };
    this.G.deathT = 0;
    this.G.slow = 0.16;
    this.G.shake = 0.95;
    this.G.flash = 0.9;
    this.G.rockFlash = 0.85;
    this.G.impactFrame = 2;
    // Thrown over a rock -> often injured in the grass so you witness Levi's assault, fatal at full sprint into crag/tree
    const hardHit = p.speed > 18.2 && !rock.jumpable;
    const r = Math.random();
    if (hardHit) {
      this.G.fate = r < 0.30 ? 'dead' : r < 0.70 ? 'serious' : 'light';
    } else {
      this.G.fate = r < 0.12 ? 'dead' : r < 0.48 ? 'serious' : 'light';
    }
    this.G.fallDist = this.G.demonZ - p.z;
    this.launchFallenRider(p, p.tdir * 5.0, 0, 1.0);
    this.sprayBlood(p.x, 1.2, p.z, p.tdir * 3.5, 2.8, p.speed * 0.4, 16);
    p.vx = p.tdir * rand(2.5, 4.5);
    sRockCrash();
    this.emitState();

    // Explosive dirt cloud & flying granite rock chips!
    for (let i = 0; i < 26; i++) {
      this.parts.push({
        x: rock.x + rand(-rock.rx * 0.6, rock.rx * 0.6),
        y: rand(0.2, Math.min(rock.h, 1.8)),
        z: rock.z + rand(-0.6, 0.8),
        vx: rand(-5, 5),
        vy: rand(1.0, 5.2),
        vz: rand(-2, 6) + p.speed * 0.35,
        life: 0,
        max: rand(1.1, 2.4),
        size: rand(0.5, 1.25),
        col: [158, 134, 102],
        dust: 1,
      });
    }
    for (let i = 0; i < 16; i++) {
      this.parts.push({
        x: rock.x + rand(-0.5, 0.5),
        y: rand(0.3, Math.min(rock.h, 1.5)),
        z: rock.z,
        vx: rand(-7, 7),
        vy: rand(2.5, 8.0),
        vz: rand(-3, 5) + p.speed * 0.25,
        life: 0,
        max: rand(0.7, 1.5),
        size: rand(0.14, 0.34),
        col: rock.isTree ? [96, 68, 44] : [132, 124, 112],
      });
    }
    this.scuffs.push({ x: p.x, z: rock.z + 1.2, r: 1.9, alpha: 0.7 });
  }

  private resolvePlayerRockCollisions(dt: number): void {
    const p = this.player;
    if (!p.alive) return;
    const pHalfW = 0.44;
    const pHalfL = 1.12;

    for (let i = 0; i < this.rocks.length; i++) {
      const rock = this.rocks[i];
      if (rock.hitCD > 0) rock.hitCD = Math.max(0, rock.hitCD - dt);
      const dz = rock.z - p.z;
      if (dz < -(rock.rz + pHalfL + 0.5) || dz > rock.rz + pHalfL + 0.5) continue;
      const dx = p.x - rock.x;
      const sumX = rock.rx + pHalfW;
      if (Math.abs(dx) >= sumX) continue;

      // Swept/overlap check in Z
      const prevZ = p.pz ?? p.z;
      const zMin = Math.min(prevZ, p.z) - pHalfL;
      const zMax = Math.max(prevZ, p.z) + pHalfL;
      if (zMax < rock.z - rock.rz || zMin > rock.z + rock.rz) continue;

      // 1. Clean Jump Vault over a jumpable rock!
      if (rock.jumpable && p.y >= rock.h * 0.7) {
        if (!rock.vaulted) {
          rock.vaulted = true;
          this.G.vaults++;
          this.G.score += 45;
          p.stam = clamp((p.stam ?? 1) + 0.07, 0, 1);
          sVault();
          this.G.pops.push({
            text: 'VAULT! +45',
            t: 0,
            x: this.view.W / 2,
            y: this.view.H * 0.52,
            col: 'rgba(155,245,175,',
          });
          for (let q = 0; q < 8; q++) {
            this.parts.push({
              x: p.x + rand(-0.4, 0.4),
              y: rock.h + 0.1,
              z: rock.z,
              vx: rand(-1.6, 1.6),
              vy: rand(0.5, 2.2),
              vz: p.speed * 0.3,
              life: 0,
              max: rand(0.5, 1.0),
              size: rand(0.3, 0.65),
              col: [190, 175, 138],
              dust: 1,
            });
          }
        }
        continue;
      }

      if (rock.hitCD > 0) continue;

      // 2. Determine Hoof-Clip (late jump graze on low rock), Glancing Side-Clip, vs Head-On Impact!
      const lat = Math.abs(dx) / sumX;
      const hoofGraze = rock.jumpable && p.y > 0.24;
      const glancing = hoofGraze || lat >= 0.56 || p.speed <= 10.8;

      if (glancing) {
        // Visceral glancing deflection / hoof-scrape stumble off the rock!
        const pushDir = dx === 0 ? (p.vx >= 0 ? 1 : -1) : dx > 0 ? 1 : -1;
        if (!hoofGraze) {
          const bounds = riderBounds(p.z);
          p.x = clamp(rock.x + pushDir * (sumX + 0.14), bounds.min, bounds.max);
          p.vx = pushDir * Math.max(9.5, Math.abs(p.vx) + 5.8);
        } else {
          p.vy = Math.max(p.vy, 2.2);
        }
        p.speed = Math.max(5.5, p.speed * (hoofGraze ? 0.72 : 0.58));
        p.stam = clamp((p.stam ?? 1) - (hoofGraze ? 0.14 : 0.2), 0, 1);
        p.stumble = 0.6;
        rock.hitCD = 0.55;
        this.G.rockClips++;
        this.G.shake = Math.max(this.G.shake, hoofGraze ? 0.28 : 0.36);
        this.G.rockFlash = hoofGraze ? 0.45 : 0.6;
        sRockClip(clamp((rock.x - this.cam.x) / 18, -1, 1));

        this.G.pops.push({
          text: hoofGraze
            ? 'HOOF CLIP!'
            : lat >= 0.56
              ? rock.isTree
                ? 'TREE CLIP!'
                : 'ROCK CLIP!'
              : 'STUMBLED!',
          t: 0,
          x: this.view.W / 2 + pushDir * 60 * this.view.U,
          y: this.view.H * 0.54,
          col: 'rgba(255,178,92,',
        });

        for (let q = 0; q < 14; q++) {
          this.parts.push({
            x: rock.x + pushDir * rock.rx * 0.85,
            y: rand(0.15, Math.min(rock.h, 1.3)),
            z: rock.z + rand(-0.4, 0.4),
            vx: pushDir * rand(1.5, 6.5) + rand(-1.5, 1.5),
            vy: rand(0.8, 3.8),
            vz: p.speed * 0.3 + rand(-1.5, 1.5),
            life: 0,
            max: rand(0.6, 1.3),
            size: q < 7 ? rand(0.35, 0.75) : rand(0.1, 0.22),
            col: q < 7 ? [164, 142, 108] : [126, 118, 106],
            dust: q < 7 ? 1 : undefined,
          });
        }
      } else {
        // Direct high-speed head-on impact -> Catastrophic crash!
        this.killPlayerByRock(rock);
        return;
      }
    }
  }

  /* ---------------- MAIN UPDATE LOOP ---------------- */
  update(dt: number): void {
    this.G.t += dt;
    const p = this.player;
    p.px = p.x;
    p.py = p.y;
    p.pz = p.z;
    p.stumble = Math.max(0, p.stumble - dt * 1.4);

    if (p.alive) {
      const steer =
        (this.keys.d || this.keys.arrowright || this.touch.r ? 1 : 0) -
        (this.keys.a || this.keys.arrowleft || this.touch.l ? 1 : 0);
      const air = p.y > 0.01;
      const tvx = steer * 7.8;
      p.vx += (tvx - p.vx) * Math.min(1, dt * (air ? 1.3 : 4.4));
      p.dashCD = (p.dashCD || 0) - dt;
      p.jumpCD = (p.jumpCD || 0) - dt;

      if (this.G.wantDash && p.dashCD <= 0 && (p.stam ?? 0) >= 0.22 && !air) {
        const dir = steer || (p.vx >= 0 ? 1 : -1);
        p.vx = dir * 15.5;
        p.stam = (p.stam ?? 0) - 0.22;
        p.dashCD = 0.7;
        nz(0.2, 'lowpass', 500, 0.35);
      }
      if (this.G.wantJump && !air && p.jumpCD <= 0 && (p.stam ?? 0) >= 0.12) {
        // Tuned athletic horse leap (~1.05m peak height) so jumping over low field rocks feels crisp!
        p.vy = 5.75;
        p.stam = (p.stam ?? 0) - 0.12;
        p.jumpCD = 0.38;
        sJump();
      }
      this.G.wantDash = false;
      this.G.wantJump = false;

      const sprint = (this.keys.w || this.keys.arrowup || this.touch.up) && (p.stam ?? 0) > 0.02;
      const rein = !!(this.keys.s || this.keys.arrowdown);
      const ts = sprint ? 21 : rein ? 9 : 15;
      p.speed += (ts - p.speed) * Math.min(1, dt * 1.35);
      if (sprint) p.stam = (p.stam ?? 0) - dt * 0.2;
      else p.stam = (p.stam ?? 0) + dt * (rein ? 0.18 : 0.1);
      p.stam = clamp(p.stam ?? 0, 0, 1);

      p.x += p.vx * dt;
      const bounds = riderBounds(p.z);
      if (p.x < bounds.min || p.x > bounds.max) {
        p.x = clamp(p.x, bounds.min, bounds.max);
        p.vx = 0;
      }
      p.vy -= GRAV * 1.6 * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        if (air) {
          sHoof();
          sHoof();
        }
        p.y = 0;
        p.vy = 0;
      }
      p.z += p.speed * dt;
      const ph0 = p.phase;
      p.phase += p.speed * dt * 1.8;
      if (!air) {
        const beats = [0, 0.9, 2.6, 3.3];
        for (const b of beats) {
          const a = Math.floor((ph0 - b) / 6.2832);
          const c = Math.floor((p.phase - b) / 6.2832);
          if (c > a) {
            sHoof();
            if (p.speed > 13) {
              const count = Math.random() < 0.65 ? 2 : 1;
              for (let ci = 0; ci < count; ci++) {
                this.parts.push({
                  x: p.x + rand(-0.35, 0.35),
                  y: 0.12,
                  z: p.z - 0.45,
                  vx: rand(-1.2, 1.2),
                  vy: rand(1.8, 3.6),
                  vz: -p.speed * 0.35 + rand(-2, 2),
                  life: 0,
                  max: rand(0.45, 0.75),
                  size: rand(0.08, 0.16),
                  col: Math.random() < 0.45 ? [98, 128, 44] : [94, 70, 46],
                  dust: 0,
                });
              }
            }
          }
        }
      }
      const stumbleTilt = p.stumble > 0 ? Math.sin(this.G.t * 34) * p.stumble * 0.22 : 0;
      p.lean = lerp(p.lean, -p.vx * 0.035 + stumbleTilt, Math.min(1, dt * 7));

      if (!air && Math.random() < dt * 9 && this.parts.length < 1350) {
        this.parts.push({
          x: p.x + rand(-0.4, 0.4),
          y: 0.1,
          z: p.z - 1.3,
          vx: rand(-0.8, 0.8) - p.vx * 0.2,
          vy: rand(0.3, 1.4),
          vz: p.speed * 0.55,
          life: 0,
          max: rand(0.6, 1.2),
          size: rand(0.35, 0.8),
          col: [168, 145, 108],
          dust: 1,
        });
      }

      // Check Player vs Field Rocks & Edge Trees!
      this.resolvePlayerRockCollisions(dt);

      this.G.score += p.speed * dt;
      if (p.alive && p.z >= this.G.demonZ - WIN_DIST) this.winGame(false);
    } else {
      this.G.deathT += dt;
      this.updateFallenRider(p, dt);
      if (this.G.fate === 'dead') {
        if (this.G.deathT > 2.6 && this.G.state === 'play') this.gameOver();
      } else {
        if (!this.levi.active && this.G.deathT > 2) {
          this.levi.active = true;
          this.levi.phase = 'fly';
          this.setLeviHop();
        }
        if (
          this.G.zekeDone &&
          this.G.zekeDoneT > (this.G.fate === 'serious' ? 2 : 4) &&
          this.G.state === 'play'
        ) {
          this.gameOver();
        }
      }
    }

    if (p.alive && this.G.zekeDone && this.G.zekeDoneT > 3 && this.G.state === 'play') {
      this.winGame(true);
    }
    this.G.slow = Math.min(1, this.G.slow + dt * 0.5);

    // Update 120 Companion Riders (with smart Rock Avoidance, Dynamic Vaulting & Rock Collisions!)
    const pc = this.player.alive ? this.player : null;
    let aliveRiders = 0;
    for (let ri = 0; ri < this.riders.length; ri++) {
      if (this.riders[ri].alive) aliveRiders++;
    }
    const tighten = lerp(0.52, 1, clamp(aliveRiders / Math.max(1, this.riders.length * 0.75), 0, 1));
    for (let ri = 0; ri < this.riders.length; ri++) {
      const r = this.riders[ri];
      if (r.alive) {
        r.rockCD = Math.max(0, (r.rockCD || 0) - dt);
        r.stumble = Math.max(0, r.stumble - dt * 1.6);
        const want = clamp((p.z + (r.off || 0) - r.z) * 0.08, -3, 3);
        r.speed = lerp(
          r.speed,
          15 + want + Math.sin(this.G.t * (r.wf || 0.3) + (r.ph || 0)) * 0.6,
          Math.min(1, dt * 2)
        );
        if (Math.random() < dt * 0.12) r.lane = clamp((r.lane || 0) + rand(-3, 3), -96, 96);
        const targetHome = (r.home || 0) * tighten;
        r.lane = (r.lane || 0) + (targetHome - (r.lane || 0)) * dt * 0.06;
        let tx = formationLane(
          (r.lane || 0) + Math.sin(this.G.t * (r.wf || 0.3) * 1.7 + (r.ph || 0)) * 2,
          r.z
        );
        if (pc && Math.abs(r.z - p.z) < 3.5 && Math.abs(r.x - p.x) < 2.2) {
          tx = r.x + (r.x >= p.x ? 3 : -3);
        }
        for (const structure of this.walls) {
          if (structure.kind === 'gate' || structure.halfWidth === undefined) continue;
          const dz = structure.z - r.z;
          if (dz > -3 && dz < 22 && Math.abs(r.x - structure.x) < structure.halfWidth + 2) {
            tx = structure.x + (r.x >= structure.x ? 1 : -1) * (structure.halfWidth + 3);
          }
        }

        // Look ahead for field rocks & steer / jump / collide!
        for (let k = 0; k < this.rocks.length; k++) {
          const rock = this.rocks[k];
          const dz = rock.z - r.z;
          if (dz < -1.4 || dz > 22) continue;
          const dx = r.x - rock.x;
          const avoidX = rock.rx + 1.4;
          if (dz > 0 && Math.abs(dx) < avoidX + 0.8) {
            const side = dx >= 0 ? 1 : -1;
            const urgency = 1 - dz / 22;
            tx = rock.x + side * (avoidX + 1.4 * urgency);
          }

          // Actual NPC vs Rock collision check
          if (Math.abs(dz) < rock.rz + 0.95 && Math.abs(dx) < rock.rx + 0.38 && r.rockCD <= 0) {
            if (rock.jumpable && r.y <= 0.05 && Math.random() < 0.65) {
              // Dynamic athletic NPC vault!
              r.vy = 5.3;
              r.rockCD = 0.6;
            } else if (r.y < rock.h * 0.7) {
              const lat = Math.abs(dx) / (rock.rx + 0.38);
              if (lat >= 0.45) {
                // Glancing shove
                const side = dx >= 0 ? 1 : -1;
                r.x = rock.x + side * (rock.rx + 0.5);
                r.vx = side * 7.5;
                r.speed *= 0.72;
                r.stumble = 0.45;
                r.rockCD = 0.65;
              } else {
                // Direct NPC crash on rock!
                r.alive = false;
                r.tdir = dx >= 0 ? 1 : -1;
                this.launchFallenRider(r, r.tdir * 4.5, 0, 1.0);
                const ndz = r.z - this.cam.z;
                if (ndz > 0 && ndz < 350 && this.parts.length < 1400) {
                  this.sprayBlood(r.x, 1.1, r.z, r.tdir * 3, 2.5, r.speed * 0.4, 14);
                  for (let q = 0; q < 12; q++) {
                    this.parts.push({
                      x: r.x + rand(-0.6, 0.6),
                      y: rand(0.2, 1.3),
                      z: r.z,
                      vx: rand(-2.5, 2.5),
                      vy: rand(0.4, 3.0),
                      vz: r.speed * 0.35 + rand(-1, 1),
                      life: 0,
                      max: rand(1.0, 2.0),
                      size: rand(0.45, 1.0),
                      col: [154, 130, 98],
                      dust: 1,
                    });
                  }
                }
                if (ndz > 0 && ndz < 65) {
                  sRockClip(clamp((r.x - this.cam.x) / 25, -1, 1));
                  this.G.pops.push({
                    text: 'Horse struck rock!',
                    t: 0,
                    wx: r.x,
                    wz: r.z,
                    col: 'rgba(236,155,105,',
                  });
                }
                break;
              }
            }
          }
        }

        if (!r.alive) continue;

        const bounds = riderBounds(r.z);
        tx = clamp(tx, bounds.min + 1, bounds.max - 1);
        const tvx = clamp((tx - r.x) * 1.6, -6.5, 6.5);
        r.vx = lerp(r.vx, tvx, Math.min(1, dt * 3.2));
        r.x = clamp(r.x + r.vx * dt, bounds.min, bounds.max);
        r.z += r.speed * dt;
        if (r.y > 0 || r.vy > 0) {
          r.vy -= GRAV * 1.6 * dt;
          r.y += r.vy * dt;
          if (r.y <= 0) {
            r.y = 0;
            r.vy = 0;
          }
        }
        r.phase += r.speed * dt * 1.8;
        r.lean = lerp(r.lean, -r.vx * 0.035, Math.min(1, dt * 5));
        if (
          r.y <= 0.01 &&
          r.z - this.cam.z < 220 &&
          r.z > this.cam.z &&
          Math.random() < dt * 4 &&
          this.parts.length < 1300
        ) {
          this.parts.push({
            x: r.x + rand(-0.4, 0.4),
            y: 0.15,
            z: r.z - 1.2,
            vx: rand(-0.6, 0.6),
            vy: rand(0.3, 1.2),
            vz: r.speed * 0.6,
            life: 0,
            max: rand(0.8, 1.6),
            size: rand(0.5, 1.0),
            col: [168, 145, 108],
            dust: 1,
          });
        }
        if (r.z > this.G.demonZ - 20) {
          r.z = this.G.demonZ - 20;
          r.speed = 0;
        }
      } else {
        this.updateFallenRider(r, dt);
      }
    }

    this.updateFlares(dt);
    this.updateMonkey(dt);
    this.updateQuad(dt);
    this.updateTitans(dt);
    this.updateChunks(dt);
    if (this.G.zekeDone) this.G.zekeDoneT += dt;

    updateShrapnel(this, dt);
    // Particles
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.life += dt;
      if (q.dust) {
        q.vx *= 0.97;
        q.vz *= 0.97;
        q.vy = q.vy * 0.97 + (q.flare ? 0.55 : 0.2) * dt;
        q.size += dt * (q.flare ? 1.35 : 0.8);
      } else {
        q.vy -= GRAV * dt;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      if (q.y < 0 && !q.dust) {
        q.y = 0;
        q.vy *= -0.3;
        q.vx *= 0.6;
        q.vz *= 0.6;
      }
      if (q.life > q.max) {
        this.parts[i] = this.parts[this.parts.length - 1];
        this.parts.pop();
      }
    }

    // Stream scenery & field rocks ahead, cull behind
    if (this.G.scenZ < p.z + 440) this.genScenery(this.G.scenZ, this.G.scenZ + 60);
    if (this.G.rockZ < p.z + 460) this.genFieldRocks(this.G.rockZ, this.G.rockZ + 80);
    if (this.scen.length && Math.random() < 0.2) {
      this.scen = this.scen.filter(o => o.z > this.cam.z - 2);
    }
    if (this.rocks.length && Math.random() < 0.12) {
      this.rocks = this.rocks.filter(o => o.z > this.cam.z - 8);
    }
    if (this.scuffs.length && Math.random() < 0.1) {
      this.scuffs = this.scuffs.filter(s => s.z > this.cam.z - 4);
    }

    this.G.warn = this.G.warn.filter(w => w.until > this.G.t);
    for (const pp of this.G.pops) pp.t += dt;
    this.G.pops = this.G.pops.filter(pp => pp.t < 1.2);
    this.G.shake = Math.max(0, this.G.shake - dt * 1.5);
    this.G.flash = Math.max(0, this.G.flash - dt * 1.5);
    this.G.rockFlash = Math.max(0, this.G.rockFlash - dt * 2.2);

    // Camera tracking (identical cinematic framing & grass-level injured POV zoom!)
    const tx = p.x * 0.85;
    this.cam.x = lerp(this.cam.x, tx, Math.min(1, dt * 5));
    const intro = clamp(this.G.t / 2.8, 0, 1);
    const followDistance = lerp(SCENE.cameraStartOffset, SCENE.cameraRideOffset, intro * intro * (3 - 2 * intro));
    this.cam.z = p.z - followDistance;
    this.cam.y =
      3.6 +
      p.y * 0.4 +
      (p.alive ? Math.sin(p.phase * 2) * 0.03 : 0);

    if (!p.alive && this.G.fate !== 'dead') {
      const k = clamp((this.G.deathT - 0.5) / 1.4, 0, 1);
      const e = k * k * (3 - 2 * k);
      const breath = Math.sin(this.G.t * 1.45);
      const beat = Math.pow(
        Math.max(0, Math.sin(this.G.t * (this.G.fate === 'serious' ? 3.8 : 2.4))),
        6
      );
      this.cam.x = lerp(this.cam.x, (p.rx ?? p.x) + Math.sin(this.G.t * 0.7) * 0.08, e);
      this.cam.z = lerp(this.cam.z, (p.rz ?? p.z) + 0.6, e);
      this.cam.y = lerp(this.cam.y, Math.max(0.75, (p.ry ?? 0) + 0.65) + breath * 0.035 + beat * 0.015, e);
      const tiltTarget = p.tdir * (this.G.fate === 'serious' ? 0.07 : 0.03) + breath * 0.008;
      this.cam.rot = lerp(this.cam.rot || 0, tiltTarget * e, Math.min(1, dt * 3));
      let zt = this.G.fate === 'serious' ? 1 + beat * 0.025 : 1;
      if (this.levi.phase === 'final' || this.levi.phase === 'cut') {
        zt = clamp((this.G.demonZ - p.z) / 240, 1.6, 4.4);
      }
      this.G.zoom = lerp(this.G.zoom || 1, zt, Math.min(1, dt * 1.4));
    } else {
      this.G.zoom = 1;
    }

    // Non-linear trauma shake (trauma^2) with rotational roll kick
    const trauma = this.G.shake;
    const trauma2 = trauma * trauma;
    if (trauma2 > 0.0001) {
      this.cam.x += rand(-1, 1) * trauma2 * 0.85;
      this.cam.y += rand(-1, 1) * trauma2 * 0.52;
      this.cam.rot = (this.cam.rot || 0) + rand(-1, 1) * trauma2 * 0.042;
    }

    // Dynamic banking roll when galloping and steering
    if (p.alive) {
      const bankTarget = clamp(-p.vx * 0.0024, -0.024, 0.024);
      this.cam.rot = lerp(this.cam.rot || 0, bankTarget, Math.min(1, dt * 8));

      // Dynamic Smoke Screen Engulfment calculation: riding through signal puffs
      let smokeDensity = 0;
      const px = p.x;
      const pz = p.z;
      const puffs = this.smokePuffs;
      const puffLen = puffs.length;
      for (let pi = 0; pi < puffLen; pi++) {
        const sp = puffs[pi];
        const age = this.G.t - sp.born;
        if (age < 0 || age > 18) continue;
        const dz = sp.z - pz;
        if (Math.abs(dz) > 5) continue;
        const dx = sp.x - px;
        if (Math.abs(dx) > 4.5) continue;
        const rad = 2.2 + age * 0.35;
        const dist = Math.hypot(dx, dz);
        if (dist < rad) {
          smokeDensity += (1 - dist / rad) * Math.min(1, age * 0.6) * Math.max(0, 1 - age / 16);
        }
      }
      this.G.smokeEngulf = lerp(this.G.smokeEngulf || 0, clamp(smokeDensity, 0, 1), Math.min(1, dt * 6));
    } else {
      if (this.G.fate === 'dead') {
        this.cam.rot = lerp(this.cam.rot || 0, 0, Math.min(1, dt * 4));
      }
      this.G.smokeEngulf = 0;
    }

    if (SFX.ac && SFX.rumble && SFX.wind) {
      const alive = this.riders.reduce((a, r) => a + (r.alive ? 1 : 0), 0);
      SFX.rumble.gain.value =
        SFX.on && this.G.state === 'play' ? 0.15 + (0.5 * alive) / RIDERS : 0;
      SFX.wind.gain.value =
        SFX.on && this.G.state === 'play' ? 0.03 + (p.speed - 9) * 0.006 : 0;
    }
  }

  /* ---------------- PURE TITANS + LEVI ---------------- */
  private initTitans(): void {
    this.titans = [];
    for (let i = 0; i < REFERENCE_TITANS.length; i++) {
      const placement = REFERENCE_TITANS[i];
      const point = planToWorld(placement);
      const angle = placement.rotationDeg * Math.PI / 180;
      const left = point.x < SCENE.boss.x;
      const h = rand(13.5, 16.5);
      this.titans.push({
        ...point,
        sourceId: placement.id,
        number: placement.number,
        heading: Math.atan2(Math.cos(angle), -Math.sin(angle)),
        h,
        fat: rand(0.8, 1.35),
        head: rand(0.085, 0.12),
        col: SKINS[(Math.random() * SKINS.length) | 0],
        hair:
          Math.random() < 0.7
            ? ([
                [40, 28, 20],
                [70, 50, 30],
                [20, 18, 16],
                [120, 90, 50],
              ] as [number, number, number][])[(Math.random() * 4) | 0]
            : null,
        ph: rand(0, 6.28),
        grin: rand(0.5, 1),
        lean: rand(-0.06, 0.06),
        state: 'stand',
        fall: 0,
        fdir: -1,
        down: 0,
        steamT: 0,
        slash: 0,
        left,
        v: i % 8,
      });
    }
    this.levi = {
      active: false,
      hidden: false,
      order: this.titans.filter(t => t.left).sort((a, b) => a.x - b.x),
      idx: 0,
      x: this.titans[0].x - 65,
      y: 6,
      z: this.titans[0].z - 55,
      fx: 0,
      fy: 0,
      fz: 0,
      t: 0,
      dur: 1,
      phase: 'wait',
      announced: false,
    };
  }

  private updateTitans(dt: number): void {
    for (const t of this.titans) {
      t.slash = Math.max(0, t.slash - dt * 2);
      if (t.state === 'falling') {
        t.fall += dt / 2.8;
        if (t.fall >= 1) {
          t.fall = 1;
          t.state = 'down';
          const dz = t.z - this.player.z;
          const delay = Math.min(Math.max(dz, 0) / 343, 5);
          nz(1.2, 'lowpass', 300, 0.5 * clamp(1 - dz / 1600, 0.2, 1), {
            delay,
            f2: 40,
            pan: clamp((t.x - this.cam.x) / 200, -1, 1),
          });
          tone(38, 1.2, 0.35, 'sine', delay, 22);
          const ex = t.x + t.fdir * t.h * 0.6;
          for (let i = 0; i < 26; i++) {
            this.parts.push({
              x: ex + rand(-t.h * 0.5, t.h * 0.5),
              y: rand(0, 2),
              z: t.z + rand(-3, 3),
              vx: rand(-3, 3),
              vy: rand(0.5, 3),
              vz: rand(-2, 2),
              life: 0,
              max: rand(2, 4),
              size: rand(3, 6),
              col: [175, 155, 120],
              dust: 1,
            });
          }
        }
      } else if (t.state === 'down') {
        t.down += dt;
        t.steamT -= dt;
        if (t.steamT <= 0 && t.down < 40 && this.parts.length < 1400) {
          t.steamT = 0.25;
          this.parts.push({
            x: t.x + t.fdir * rand(0, t.h * 0.9),
            y: rand(0.5, 2),
            z: t.z + rand(-1.5, 1.5),
            vx: rand(-0.5, 0.5),
            vy: rand(2, 4),
            vz: 0,
            life: 0,
            max: rand(3, 5),
            size: rand(2.5, 5),
            col: [240, 238, 232],
            dust: 1,
          });
        }
      }
    }

    const L = this.levi;
    if (!L.active) {
      if (this.player.z > 220) {
        L.active = true;
        L.phase = 'fly';
        this.setLeviHop();
      }
      return;
    }
    if (L.hidden || L.phase === 'cut') return;
    L.t += dt;
    if (L.phase === 'fly' || L.phase === 'final') {
      const k = clamp(L.t / L.dur, 0, 1);
      const e = k * k * (3 - 2 * k);
      L.x = lerp(L.sx ?? L.x, L.fx, e);
      L.z = lerp(L.sz ?? L.z, L.fz, e);
      L.y = lerp(L.sy ?? L.y, L.fy, e) + Math.sin(k * Math.PI) * 12;
      if (this.parts.length < 1400 && L.z - this.cam.z < 1400) {
        this.parts.push({
          x: L.x,
          y: L.y,
          z: L.z,
          vx: rand(-0.5, 0.5),
          vy: rand(-0.3, 0.3),
          vz: rand(-0.5, 0.5),
          life: 0,
          max: 0.9,
          size: 1.2,
          col: [245, 245, 245],
          dust: 1,
        });
      }
      if (k >= 1) {
        if (L.phase === 'final') {
          this.startZekeCut();
          return;
        }
        const tt = L.order[L.idx];
        tt.state = 'falling';
        tt.fdir = Math.random() < 0.75 ? -1 : 1;
        tt.slash = 1;
        for (let i = 0; i < 18; i++) {
          this.parts.push({
            x: tt.x,
            y: tt.h * 0.84,
            z: tt.z + 0.6,
            vx: rand(-4, 4),
            vy: rand(-1, 4),
            vz: rand(-2, 2),
            life: 0,
            max: rand(1.5, 3),
            size: rand(1, 2.2),
            col: [250, 245, 240],
            dust: 1,
          });
        }
        nz(0.15, 'highpass', 3000, 0.12 * clamp(1 - (tt.z - this.player.z) / 1500, 0.15, 1), {
          delay: Math.min((tt.z - this.player.z) / 343, 5),
        });
        if (!L.announced) {
          L.announced = true;
          this.G.pops.push({
            text: 'A Titan on the left is falling...',
            t: -1.5,
            x: this.view.W / 2,
            y: this.view.H * 0.3,
          });
        }
        L.idx++;
        L.phase = 'perch';
        L.t = 0;
      }
    } else if (L.phase === 'perch') {
      const tt = L.order[L.idx - 1];
      L.x = tt.x;
      L.z = tt.z;
      L.y = tt.h * 0.9;
      let aliveCount = 0;
      for (const r of this.riders) if (r.alive) aliveCount++;
      const ridersLeft = aliveCount > 0;
      if (L.idx >= L.order.length && !this.player.alive && ridersLeft) {
        L.wait = (L.wait || 0) + dt;
        L.killT = (L.killT || 0) - dt;
        if (L.wait > 6 && L.killT <= 0) {
          L.killT = 0.45;
          const al = this.riders.filter(r => r.alive);
          const r = al[(Math.random() * al.length) | 0];
          r.alive = false;
          this.launchFallenRider(r, rand(-4, 4), -200, 0.85);
          this.sprayBlood(r.x, 1.4, r.z, rand(-3, 3), 2.2, r.speed * 0.3, 12);
          for (let q = 0; q < 10; q++) {
            this.parts.push({
              x: r.x + rand(-0.5, 0.5),
              y: rand(0.2, 1.4),
              z: r.z,
              vx: rand(-2, 2),
              vy: rand(0, 2.5),
              vz: rand(-1, 1),
              life: 0,
              max: rand(1, 2),
              size: rand(0.4, 0.9),
              col: [150, 125, 95],
              dust: 1,
            });
          }
        }
      } else {
        const rem = Math.max(0, L.order.length - L.idx);
        const timeLeft = Math.max(1.5, 58 - this.G.t);
        const stepBudget = (timeLeft - 1.8) / Math.max(1, rem + 0.5);
        const perchDur = L.idx >= L.order.length
          ? clamp(timeLeft - 1.8, 0.35, 1.8)
          : clamp(stepBudget * 0.45, 0.45, 2.4);
        if (L.t > perchDur) {
          if (L.idx < L.order.length) {
            L.phase = 'fly';
            this.setLeviHop();
          } else {
            L.phase = 'final';
            L.t = 0;
            L.sx = L.x;
            L.sy = L.y;
            L.sz = L.z;
            L.fx = -6;
            L.fy = 16;
            L.fz = this.G.demonZ + 2;
            L.dur = clamp(58 - this.G.t, 1.0, 2.0);
            switchToCounterattack();
          }
        }
      }
    }
  }

  private setLeviHop(): void {
    const L = this.levi;
    const tt = L.order[L.idx];
    if (!tt) return;
    L.t = 0;
    L.sx = L.x;
    L.sy = L.y;
    L.sz = L.z;
    L.fx = tt.x;
    L.fy = tt.h * 0.86;
    L.fz = tt.z + 0.8;
    const rem = Math.max(1, L.order.length - L.idx);
    const timeLeft = Math.max(2.0, 58 - this.G.t);
    const stepBudget = (timeLeft - 1.8) / (rem + 0.5);
    const baseDur = Math.hypot(L.fx - L.sx, L.fz - L.sz) / 30;
    L.dur = clamp(Math.min(baseDur, stepBudget * 0.55), 0.6, 2.4);
  }

  /* ---------------- THE BEAST IS CUT DOWN ---------------- */
  private startZekeCut(): void {
    switchToCounterattack();
    const m = this.monkey;
    m.state = 'cut';
    m.t = 0;
    m.holding = false;
    m.armCut = false;
    m.eyesCut = false;
    m.legsCut = false;
    m.drop = 0;
    m.tip = 0;
    m.landed = false;
    m.flash = 0;
    m.guardNape = false;
    m.leftArmCut = false;
    m.napeCut = false;
    m.extracted = false;
    m.rescued = false;
    this.levi.phase = 'cut';
    this.levi.hidden = false;
    this.levi.carry = false;
    this.G.pops.push({
      text: 'Levi broke through the smoke...',
      t: -1.5,
      x: this.view.W / 2,
      y: this.view.H * 0.3,
    });
  }

  private zekeSound(fn: (delay: number) => void): void {
    fn(Math.min(Math.max(this.G.demonZ - this.player.z, 0) / 343, 4));
  }

  armPoint(h: [number, number, number, number], u: number, side = 1): [number, number] {
    if (u < 0.5) {
      const k = u / 0.5;
      return [lerp(side * 3.8, h[0], k), lerp(15, h[1], k)];
    }
    const k = (u - 0.5) / 0.5;
    return [lerp(h[0], h[2], k), lerp(h[1], h[3], k)];
  }

  private updateCut(dt: number): void {
    const m = this.monkey;
    const L = this.levi;
    const Z = this.G.demonZ;
    m.t += dt;
    const t = m.t;
    m.flash = Math.max(0, (m.flash || 0) - dt * 3);
    const r = Math.min(1, dt * 7);

    // 1. Right arm raised to shoulder level trying to catch Levi (0..2.0s)
    if (!m.leftArmCut) {
      const reach = Math.sin(t * 9) * 0.14;
      m.aL = lerp(m.aL, 1.55 + reach, r);
      m.bL = lerp(m.bL, -0.35 + reach * 0.5, r);
    }

    // 2. Left arm: braces (0..2.0s), covers nape behind head (2.0..3.2s), flails blindly when eyes cut (3.2s+)
    if (!m.armCut) {
      if (t < 2.0) {
        m.aR = lerp(m.aR, 0.45, r);
        m.bR = lerp(m.bR, 0.25, r);
      } else if (t < 3.2) {
        m.aR = lerp(m.aR, 2.65, r);
        m.bR = lerp(m.bR, -1.55, r);
      } else {
        m.aR = lerp(m.aR, 1.95 + Math.sin(t * 7.2) * 0.48, r);
        m.bR = lerp(m.bR, -0.75 + Math.cos(t * 6.5) * 0.35, r);
      }
    }
    this.G.caption = '';
    const gas = (n = 1) => {
      for (let i = 0; i < n && this.parts.length < 1400; i++) {
        this.parts.push({
          x: L.x + rand(-0.3, 0.3),
          y: L.y + rand(-0.3, 0.3),
          z: L.z + rand(-0.3, 0.3),
          vx: rand(-0.8, 0.8),
          vy: rand(-0.4, 0.6),
          vz: rand(-0.8, 0.8),
          life: 0,
          max: 0.9,
          size: 1.25,
          col: [242, 248, 255],
          dust: 1,
        });
      }
    };

    // Phase 1 (0..2.0s): Beast reaches out with right hand at shoulder level; Levi shreds it into pieces
    if (t < 2.0) {
      const h = this.armHand(-1, m.aL, m.bL);
      const pt = this.armPoint(h, 1 - t / 2, -1);
      L.x = pt[0] + Math.cos(t * 25) * 2.1;
      L.y = pt[1] + Math.sin(t * 25) * 1.0;
      L.z = Z - 1.5 - Math.sin(t * 25) * 2.0;
      gas(2);
      if (Math.random() < dt * 16) m.flash = 1;
    } else if (!m.leftArmCut) {
      m.leftArmCut = true;
      const h = this.armHand(-1, m.aL, m.bL);
      for (let i = 0; i < 12; i++) {
        const u0 = i / 12;
        const u1 = (i + 1) / 12;
        const a = this.armPoint(h, u0, -1);
        const b = this.armPoint(h, u1, -1);
        this.chunks.push({
          x: (a[0] + b[0]) / 2,
          y: (a[1] + b[1]) / 2,
          z: Z - 1.5,
          vx: rand(-3.5, 3.5) - 1.8,
          vy: rand(-1, 4.5),
          vz: rand(-2.5, 2.5),
          a: Math.atan2(b[1] - a[1], b[0] - a[0]),
          va: rand(-3.0, 3.0),
          len: Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.95,
          th: lerp(1.9, 1.4, u0),
          hand: i === 11,
          steamT: 0,
          landed: false,
        });
      }
      this.sprayBlood(h[0], h[1], Z - 1.5, -2, 2, 0, 26);
      this.zekeSound(d => {
        nz(0.5, 'highpass', 2500, 0.25, { delay: d });
        nz(0.4, 'lowpass', 900, 0.4, { delay: d + 0.1 });
      });
      this.G.pops.push({
        text: 'His right arm... in pieces!',
        t: -1,
        x: this.view.W / 2,
        y: this.view.H * 0.34,
      });
    }

    // Phase 2 (2.0..3.2s): Sensing Levi behind, Beast covers nape with left hand -> Levi blinds his eyes!
    if (t >= 2.0 && !m.guardNape) {
      m.guardNape = true;
    }
    if (t >= 2.0 && t < 2.85) {
      const k = (t - 2.0) / 0.85;
      L.x = lerp(-6, 3.2, Math.sin(k * Math.PI * 0.75));
      L.y = lerp(15, 18.2, k);
      L.z = lerp(Z + 3.5, Z - 3.2, k);
      gas(2);
    }
    if (t >= 2.85 && !m.eyesCut) {
      m.eyesCut = true;
      m.flash = 1;
      this.zekeSound(d => {
        nz(0.35, 'highpass', 3500, 0.34, { delay: d });
        tone(180, 1.4, 0.25, 'sawtooth', d, 70);
      });
      this.sprayBlood(0, 17.3, Z - 2.5, 0, 1.5, -2, 28);
      this.G.pops.push({
        text: 'Levi blinds the Beast!',
        t: -1,
        x: this.view.W / 2,
        y: this.view.H * 0.34,
      });
    }

    // Phase 3 (3.2..4.25s): Blinded Beast wanders/staggers while Levi dives to cut his Achilles heels
    if (t >= 2.85 && t < 4.25) {
      const k = (t - 2.85) / 1.4;
      L.x = lerp(3.2, -3.8, k) + Math.sin(k * Math.PI) * 2.5;
      L.y = lerp(18.0, 2.0, k * k);
      L.z = Z - 3.0;
      gas(2);
    }
    if (t >= 4.25 && !m.legsCut) {
      m.legsCut = true;
      m.flash = 1;
      this.zekeSound(d => nz(0.45, 'highpass', 2500, 0.3, { delay: d }));
      this.sprayBlood(-3.2, 2.0, Z - 1, -2, 3, -1, 18);
      this.sprayBlood(3.2, 2.0, Z - 1, 2, 3, -1, 18);
      for (const sd of [-1, 1]) {
        this.chunks.push({
          x: sd * 3.4, y: 2.2, z: Z - 1, vx: sd * 4.5, vy: 3.2, vz: -1,
          a: sd * 0.5, va: sd * 2, len: 2.8, th: 2.3, hand: false, steamT: 0, landed: false,
        });
      }
    }

    // Phase 4 (4.25..6.25s): Beast collapses face-first / head-down onto the ground
    if (m.legsCut) m.drop = clamp((t - 4.25) / 0.8, 0, 1);
    if (t >= 4.5 && t <= 6.25) {
      const k = clamp((t - 4.5) / 1.75, 0, 1);
      m.tip = k * k;
      if (k >= 1 && !m.landed) {
        m.landed = true;
        this.G.shake = Math.max(this.G.shake, 0.65 * this.closeness() + 0.18);
        this.zekeSound(d => {
          nz(1.6, 'lowpass', 400, 0.95, { delay: d, f2: 30 });
          tone(32, 1.8, 0.65, 'sine', d, 18);
        });
        for (let i = 0; i < 60; i++) {
          this.parts.push({
            x: rand(-2, 18),
            y: rand(0, 3),
            z: Z + rand(-6, 6),
            vx: rand(-6, 6),
            vy: rand(0.8, 4.8),
            vz: rand(-4, 4),
            life: 0,
            max: rand(2.5, 4.8),
            size: rand(3.5, 7.5),
            col: [175, 155, 120],
            dust: 1,
          });
        }
      }
    }

    // Phase 5 (6.25..11.2s): Levi surges skyward, dives onto the fallen nape, hacks Zeke out, then 2.6s beat before Cart Titan rescues him!
    if (t >= 6.25 && t < 7.0) {
      const k = (t - 6.25) / 0.75;
      L.x = lerp(-3.5, 10.8, k);
      L.y = lerp(2.5, 24.5, Math.sin(k * Math.PI * 0.5));
      L.z = Z - 2.0;
      gas(2);
    } else if (t >= 7.0 && t < 7.45) {
      const k = (t - 7.0) / 0.45;
      L.x = lerp(10.8, 11.4, k);
      L.y = lerp(24.5, 2.5, k * k);
      L.z = Z - 2.0;
      gas(2);
    } else if (t >= 7.45 && t < 9.1) {
      L.x = 11.4 + Math.cos(t * 34) * 1.8;
      L.y = 2.4 + Math.sin(t * 28) * 1.1;
      L.z = Z - 2.2;
      gas(2);
      if (Math.random() < dt * 18) {
        m.flash = 1;
        this.sprayBlood(11.4, 2.4, Z - 1.5, rand(-2, 2), rand(2, 5), rand(-2, 2), 4);
      }
      if (Math.random() < dt * 6) {
        this.zekeSound(d => nz(0.14, 'highpass', 3200, 0.24, { delay: d }));
      }
    } else if (t >= 9.1 && t < 11.2) {
      // Levi stands over the fallen Beast with Zeke torn free before the Cart Titan lunges in
      L.x = lerp(L.x, 11.2, Math.min(1, dt * 4));
      L.y = lerp(L.y, 2.8, Math.min(1, dt * 4));
      L.z = Z - 2.2;
      gas(1);
    }
    if (t >= 8.6 && !m.extracted) {
      m.extracted = true;
      m.napeCut = true;
      m.armCut = true;
      this.G.pops.push({ text: 'Levi rips Zeke from the nape!', t: -1, x: this.view.W / 2, y: this.view.H * 0.34 });
    }
    if (t > 5.8 && this.parts.length < 1400 && Math.random() < dt * 14) {
      this.parts.push({
        x: rand(2, 16),
        y: rand(1, 3.5),
        z: this.G.demonZ + rand(-3, 3),
        vx: rand(-0.6, 0.6),
        vy: rand(2.2, 5.5),
        vz: 0,
        life: 0,
        max: rand(3, 6),
        size: rand(3.5, 7.5),
        col: [240, 238, 232],
        dust: 1,
      });
    }
    if (t >= 11.2 && !m.rescued) {
      m.rescued = true;
      this.G.pops.push({ text: 'The Cart Titan escapes with Zeke!', t: 0, x: this.view.W / 2, y: this.view.H * 0.34 });
    }
    if (t >= 11.2) {
      L.x = lerp(L.x, 4, Math.min(1, dt * 2.5));
      L.y = lerp(L.y, 4.5, Math.min(1, dt * 2.5));
      L.z = Z - 5;
      gas(1);
    }
    this.G.caption = t < 2.0 ? 'BEAST REACHES TO CATCH — LEVI SHREDS HIS RIGHT ARM'
      : t < 2.85 ? 'SENSING LEVI BEHIND — HE GUARDS HIS NAPE WITH HIS LEFT HAND'
        : t < 3.4 ? 'LEVI TAKES OUT BOTH EYES'
          : t < 4.25 ? 'BLINDED, HE STAGGERS — LEVI DIVES FOR THE ACHILLES HEELS'
            : t < 6.25 ? 'THE BEAST CRASHES HEAD-DOWN TO THE EARTH'
              : t < 7.45 ? 'LEVI SURGES UP AND DIVES ONTO THE NAPE'
                : t < 9.1 ? 'HACK AND SLASH — TEARING ZEKE FROM THE NAPE'
                  : t < 11.2 ? 'ZEKE IS TORN FREE — LEVI HOLDS HIM AT BLADEPOINT'
                    : 'THE CART TITAN SNATCHES ZEKE AWAY';
    if (t > 12.8 && !this.G.zekeDone) {
      this.G.zekeDone = true;
      this.G.zekeDoneT = 0;
    }
  }

  private updateChunks(dt: number): void {
    for (const c of this.chunks) {
      if (!c.landed) {
        c.vy -= GRAV * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.z += c.vz * dt;
        c.a += c.va * dt;
        if (c.y < c.th * 0.5) {
          c.y = c.th * 0.5;
          c.vy = -c.vy * 0.25;
          c.vx *= 0.5;
          c.vz *= 0.5;
          c.va *= 0.5;
          if (Math.abs(c.vy) < 1) {
            c.landed = true;
            c.vy = 0;
          }
          for (let i = 0; i < 4; i++) {
            this.parts.push({
              x: c.x,
              y: 0.3,
              z: c.z,
              vx: rand(-2, 2),
              vy: rand(0.5, 2),
              vz: rand(-1, 1),
              life: 0,
              max: rand(2, 3),
              size: rand(2, 4),
              col: [175, 155, 120],
              dust: 1,
            });
          }
        }
      } else {
        c.steamT -= dt;
        if (c.steamT <= 0 && this.parts.length < 1400) {
          c.steamT = 0.5;
          this.parts.push({
            x: c.x,
            y: c.y,
            z: c.z,
            vx: 0,
            vy: rand(1.5, 3),
            vz: 0,
            life: 0,
            max: 3,
            size: rand(1.5, 3),
            col: [240, 238, 232],
            dust: 1,
          });
        }
      }
    }
  }

  /** After a fatal charge, jump straight to the results instead of waiting out the aftermath. */
  skipToResults(): void {
    if (this.G.state !== 'play' || this.player.alive) return;
    if (this.G.fate === 'dead') {
      this.G.deathT = Math.max(this.G.deathT, 3);
    } else {
      this.G.zekeDone = true;
      this.G.zekeDoneT = 99;
    }
  }

  private gameOver(): void {
    this.G.state = 'over';
    this.emitState();
  }

  private winGame(byLevi: boolean): void {
    switchToCounterattack();
    this.G.state = 'win';
    this.G.winByLevi = byLevi;
    const alive = this.riders.filter(r => r.alive).length;
    this.G.score += 1000 + alive * 10;
    this.emitState();
  }

  /* ---------------- HUD RENDERER (2D OVERLAY CANVAS) ---------------- */
  drawHUD(ctx: CanvasRenderingContext2D): void {
    const { W, H, U } = this.view;
    const p = this.player;
    const u = U;

    // Cinematic vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${0.44 + (p.speed - 15) * 0.018})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // Blood impact flash
    if (this.G.flash > 0) {
      ctx.fillStyle = `rgba(165,0,0,${this.G.flash * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
    // Rock-clip dust/amber flash
    if (this.G.rockFlash > 0) {
      ctx.fillStyle = `rgba(185,126,52,${this.G.rockFlash * 0.28})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Injured / fallen POV overlays (exact iconic Stage 2 dramatic sequence!)
    if (!p.alive) {
      ctx.textAlign = 'center';
      if (this.G.fate === 'dead') {
        ctx.fillStyle = `rgba(0,0,0,${clamp((this.G.deathT - 0.4) / 1.2, 0, 1)})`;
        ctx.fillRect(0, 0, W, H);
        return;
      }
      const pulse = (Math.sin(this.G.t * (this.G.fate === 'serious' ? 5 : 3)) + 1) / 2;
      if (this.G.fate === 'serious') {
        // Clear blood-red tint instead of unreadable blur
        ctx.fillStyle = `rgba(115,8,8,${0.14 + pulse * 0.1})`;
        ctx.fillRect(0, 0, W, H);
      }
      const rv = ctx.createRadialGradient(
        W / 2,
        H / 2,
        H * (this.G.fate === 'serious' ? 0.22 : 0.35),
        W / 2,
        H / 2,
        H * 0.92
      );
      rv.addColorStop(0, 'rgba(0,0,0,0)');
      rv.addColorStop(
        1,
        this.G.fate === 'serious'
          ? `rgba(110,0,0,${0.62 + pulse * 0.18})`
          : `rgba(40,0,0,${0.35 + pulse * 0.1})`
      );
      ctx.fillStyle = rv;
      ctx.fillRect(0, 0, W, H);

      // Heavy eyelids closing and fluttering open during serious injury (stays wide open once Levi engages Beast)
      if (
        this.G.fate === 'serious' &&
        this.G.deathT > 1.2 &&
        this.levi.phase !== 'final' &&
        this.monkey.state !== 'cut'
      ) {
        const cyc = (this.G.deathT - 1.2) % 4.4;
        let shut = 0;
        if (cyc > 3.1 && cyc < 4.2) {
          const b = (cyc - 3.1) / 1.1;
          shut = Math.sin(b * Math.PI) * 0.44;
        }
        const lidH = H * (0.06 + shut);
        const topG = ctx.createLinearGradient(0, 0, 0, lidH + 34 * u);
        topG.addColorStop(0, 'rgba(8,2,2,0.96)');
        topG.addColorStop(0.75, 'rgba(18,4,4,0.88)');
        topG.addColorStop(1, 'rgba(18,4,4,0)');
        ctx.fillStyle = topG;
        ctx.fillRect(0, 0, W, lidH + 34 * u);

        const botG = ctx.createLinearGradient(0, H, 0, H - lidH - 34 * u);
        botG.addColorStop(0, 'rgba(8,2,2,0.96)');
        botG.addColorStop(0.75, 'rgba(18,4,4,0.88)');
        botG.addColorStop(1, 'rgba(18,4,4,0)');
        ctx.fillStyle = botG;
        ctx.fillRect(0, H - lidH - 34 * u, W, lidH + 34 * u);
      }
      if (this.G.fate === 'serious' && this.G.zekeDone) {
        ctx.fillStyle = `rgba(0,0,0,${clamp(this.G.zekeDoneT / 2, 0, 1)})`;
        ctx.fillRect(0, 0, W, H);
      }
      const lines: [number, string][] =
        this.G.fate === 'serious'
          ? [
              [3, "Can't... move..."],
              [9, 'Titans... falling? Someone is out there...'],
              [99, ''],
            ]
          : [
              [3, 'Thrown from the saddle. Still breathing.'],
              [9, 'Look... on the left. The Titans are going down.'],
              [99, ''],
            ];
      let msg = '';
      for (const [tt, s] of lines) if (this.G.deathT > tt - 6 && this.G.deathT < tt) msg = s;
      if (this.monkey.state === 'cut') {
        msg =
          this.G.fate === 'serious'
            ? this.monkey.t > 3
              ? 'The stones... stopped...'
              : ''
            : this.monkey.t < 2
              ? 'Someone is on the Beast!'
              : this.monkey.t < 7.4
                ? ''
                : 'He cut the Beast down.';
      }
      if (msg && this.G.deathT > 2) {
        ctx.font = `italic ${20 * u}px Georgia`;
        ctx.fillStyle = 'rgba(244,234,214,0.92)';
        ctx.fillText(msg, W / 2, H * 0.82);
      }
      ctx.font = `${13 * u}px Georgia`;
      ctx.fillStyle = this.G.fate === 'serious' ? '#e66' : '#eb8';
      ctx.fillText(
        this.G.fate === 'serious' ? 'SERIOUSLY INJURED' : 'LIGHTLY INJURED',
        W / 2,
        H * 0.12
      );
      ctx.textAlign = 'left';
    }

    ctx.textBaseline = 'middle';

    // Top Distance Bar (sized cleanly so right-side tool buttons never overlap at narrow viewports)
    const dist = Math.max(0, this.G.demonZ - p.z - WIN_DIST);
    const bw = Math.min(W * 0.30, 380 * u);
    const bx = W < 1050 ? Math.max(175, W * 0.36 - bw * 0.5) : (W - bw) / 2;
    const by = 26 * u;
    ctx.fillStyle = 'rgba(14,10,6,0.52)';
    ctx.fillRect(bx - 10 * u, by - 14 * u, bw + 20 * u, 46 * u);
    ctx.strokeStyle = 'rgba(138,96,56,0.45)';
    ctx.lineWidth = Math.max(1, u);
    ctx.strokeRect(bx - 10 * u, by - 14 * u, bw + 20 * u, 46 * u);

    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(bx, by, bw, 6 * u);
    const prog = 1 - dist / (DEMON_START - WIN_DIST);
    ctx.fillStyle = '#2f6b3a';
    ctx.fillRect(bx, by, bw * prog, 6 * u);
    ctx.fillStyle = '#e4ca92';
    ctx.beginPath();
    ctx.arc(bx + bw * prog, by + 3 * u, 6 * u, 0, 6.29);
    ctx.fill();
    ctx.fillStyle = '#c84238';
    ctx.fillRect(bx + bw - 3 * u, by - 6 * u, 6 * u, 18 * u);
    ctx.font = `${15 * u}px Georgia`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2eadc';
    ctx.fillText(`THE BEAST   ${Math.round(dist).toLocaleString()} m`, W / 2, by + 20 * u);

    if (this.G.caption) {
      ctx.font = `italic ${13.5 * u}px Georgia`;
      ctx.fillStyle =
        this.G.caption === 'THROWING' || this.G.caption === 'WINDING UP' ? '#ff9c64' : '#d6c4a8';
      ctx.fillText(this.G.caption, W / 2, by + 44 * u);
    }

    // Top-left Telemetry Panel
    const alive = this.riders.reduce((a, r) => a + (r.alive ? 1 : 0), 0);
    ctx.textAlign = 'left';
    ctx.font = `${14.5 * u}px Georgia`;
    const tl = [
      `RIDERS   ${alive + (p.alive ? 1 : 0)} / ${RIDERS + 1}`,
      `TIME   ${fmtT(this.G.t)}`,
      `CLOSE CALLS   ${this.G.close}`,
      `VAULTS   ${this.G.vaults}`,
      `SCORE   ${Math.round(this.G.score)}`,
    ];
    ctx.fillStyle = 'rgba(14,10,6,0.48)';
    ctx.fillRect(10 * u, 10 * u, 200 * u, 114 * u);
    ctx.strokeStyle = 'rgba(138,96,56,0.38)';
    ctx.strokeRect(10 * u, 10 * u, 200 * u, 114 * u);
    ctx.fillStyle = '#eee6d8';
    tl.forEach((s, i) => ctx.fillText(s, 20 * u, (27 + i * 20) * u));

    // Bottom-left Speed & Stamina Panel
    ctx.fillStyle = 'rgba(14,10,6,0.48)';
    ctx.fillRect(10 * u, H - 64 * u, 224 * u, 54 * u);
    ctx.strokeStyle = 'rgba(138,96,56,0.38)';
    ctx.strokeRect(10 * u, H - 64 * u, 224 * u, 54 * u);
    ctx.fillStyle = '#eee6d8';
    ctx.font = `${15 * u}px Georgia`;
    ctx.fillText(`${Math.round(p.speed * 3.6)} km/h`, 20 * u, H - 47 * u);
    ctx.fillStyle = '#2c251d';
    ctx.fillRect(20 * u, H - 30 * u, 204 * u, 10 * u);
    ctx.fillStyle = (p.stam ?? 0) > 0.25 ? '#cea64c' : '#cc443c';
    ctx.fillRect(20 * u, H - 30 * u, 204 * u * (p.stam ?? 0), 10 * u);
    ctx.font = `${11 * u}px Georgia`;
    ctx.fillStyle = '#cfc5b4';
    ctx.fillText('STAMINA', 124 * u, H - 47 * u);

    // Incoming Volley Warning
    if (this.G.warn.length && p.alive) {
      const w = this.G.warn.reduce((a, b) => (a.until < b.until ? a : b));
      const eta = w.until - this.G.t;
      const fl = (Math.sin(this.G.t * (eta < 1.5 ? 30 : 12)) + 1) / 2;
      ctx.textAlign = 'center';
      ctx.font = `bold ${22 * u}px Georgia`;
      ctx.fillStyle = `rgba(255,${(60 + fl * 80) | 0},40,${0.62 + fl * 0.38})`;
      ctx.fillText(`INCOMING AT YOU  ${eta.toFixed(1)}s`, W / 2, H * 0.2);
    }

    // Immediate Rock Ahead Warning (if racing directly at a boulder < 26m ahead!)
    if (p.alive) {
      let nearestRock: RockObstacle | null = null;
      let minDz = 999;
      for (const rk of this.rocks) {
        const rdz = rk.z - p.z;
        if (rdz > 2 && rdz < 28 && Math.abs(rk.x - p.x) < rk.rx + 0.55) {
          if (rdz < minDz) {
            minDz = rdz;
            nearestRock = rk;
          }
        }
      }
      if (nearestRock) {
        const urgent = clamp(1 - minDz / 28, 0, 1);
        ctx.textAlign = 'center';
        ctx.font = `bold ${14.5 * u}px Georgia`;
        ctx.fillStyle = nearestRock.jumpable
          ? `rgba(246,214,120,${0.55 + urgent * 0.45})`
          : `rgba(255,146,84,${0.6 + urgent * 0.4})`;
        ctx.fillText(
          nearestRock.jumpable ? 'ROCK AHEAD — JUMP (SPACE) OR STEER' : 'BOULDER AHEAD — STEER CLEAR',
          W / 2,
          H * 0.255
        );
      }
    }

    // Upgraded Scout's Eye Radar (Shrapnel Ticks + Approaching Field Rocks!)
    if (this.G.radar && p.alive) {
      const rw = Math.min(W * 0.5, 520 * u);
      const rx = (W - rw) / 2;
      const ry = H - 30 * u;
      const RANGE = 12;
      const HOR_T = 1.4;
      ctx.fillStyle = 'rgba(14,10,6,0.52)';
      ctx.fillRect(rx, ry - 13 * u, rw, 26 * u);
      ctx.strokeStyle = 'rgba(138,96,56,0.4)';
      ctx.strokeRect(rx, ry - 13 * u, rw, 26 * u);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      for (let m = -RANGE; m <= RANGE; m += 2) {
        ctx.fillRect(rx + ((m + RANGE) / (2 * RANGE)) * rw, ry - 13 * u, 1, 26 * u);
      }

      // Approaching field rocks on Scout's Eye (within next 2.2 seconds)
      const rockHorZ = Math.max(22, p.speed * 2.2);
      for (const rk of this.rocks) {
        const relZ = rk.z - p.z;
        if (relZ < 0 || relZ > rockHorZ) continue;
        const relX = rk.x - p.x;
        if (Math.abs(relX) > RANGE) continue;
        const prox = 1 - relZ / rockHorZ;
        const mx = rx + ((relX + RANGE) / (2 * RANGE)) * rw;
        const mw = Math.max(4 * u, ((rk.rx * 2) / (2 * RANGE)) * rw);
        const mh = (4 + prox * 7) * u;
        ctx.fillStyle = rk.jumpable
          ? `rgba(222,196,132,${0.32 + prox * 0.65})`
          : `rgba(182,158,136,${0.4 + prox * 0.6})`;
        ctx.beginPath();
        ctx.moveTo(mx - mw / 2, ry + 13 * u);
        ctx.lineTo(mx - mw * 0.25, ry + 13 * u - mh);
        ctx.lineTo(mx + mw * 0.25, ry + 13 * u - mh);
        ctx.lineTo(mx + mw / 2, ry + 13 * u);
        ctx.closePath();
        ctx.fill();
      }

      // Incoming Beast Titan shrapnel ticks
      for (const s of this.stones) {
        if (s.delay > 0) continue;
        const rel = s.z - p.z;
        if (rel < 0) continue;
        const close = p.speed - s.vz;
        if (close <= 0) continue;
        const tc = rel / close;
        if (tc > HOR_T) continue;
        const y = s.y + s.vy * tc - 0.5 * GRAV * tc * tc - p.y;
        if (y < -0.5 || y > 3) continue;
        const x = s.x + s.vx * tc - p.x;
        if (Math.abs(x) > RANGE) continue;
        const a = 1 - tc / HOR_T;
        ctx.fillStyle = `rgba(255,${(200 * (1 - a)) | 0},40,${0.28 + a * 0.72})`;
        ctx.fillRect(
          rx + ((x + RANGE) / (2 * RANGE)) * rw - 1.5 * u,
          ry - (4 + a * 8) * u,
          3 * u,
          (8 + a * 16) * u
        );
      }

      // Player center marker
      ctx.fillStyle = '#73ba80';
      ctx.fillRect(
        rx + rw / 2 - ((0.4 / RANGE) * rw) / 2,
        ry - 15 * u,
        ((0.8 / RANGE) * rw) / 2,
        30 * u
      );
      ctx.font = `${10 * u}px Georgia`;
      ctx.fillStyle = '#d4cab8';
      ctx.textAlign = 'center';
      ctx.fillText("SCOUT'S EYE (H)  —  RED: SHRAPNEL  ·  STONE: FIELD ROCKS", W / 2, ry - 21 * u);
    }

    // Floating popups
    ctx.textAlign = 'center';
    for (const pp of this.G.pops) {
      let x = pp.x ?? W / 2;
      let y = pp.y ?? H * 0.45;
      if (pp.wx !== undefined && pp.wz !== undefined) {
        if (!this.proj(pp.wx, 3, pp.wz)) continue;
        x = this.P.x;
        y = this.P.y;
      }
      const a = clamp(1 - pp.t / 1.2, 0, 1);
      ctx.font = `bold ${(pp.text === 'CLOSE!!' || pp.text === 'VAULT! +45' ? 24 : 16) * u}px Georgia`;
      ctx.fillStyle = pp.col
        ? `${pp.col}${a})`
        : pp.text === 'Rider down'
          ? `rgba(230,120,100,${a})`
          : `rgba(255,230,140,${a})`;
      ctx.fillText(pp.text, x, y - pp.t * 40 * u);
    }

    // Pause banner
    if (this.G.state === 'pause') {
      ctx.fillStyle = 'rgba(0,0,0,0.52)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = `${40 * u}px Georgia`;
      ctx.fillStyle = '#e4ca92';
      ctx.fillText('PAUSED', W / 2, H / 2 - 10 * u);
      ctx.font = `${15 * u}px Georgia`;
      ctx.fillStyle = '#ccc2b2';
      ctx.fillText('Press P or ESC to resume the charge', W / 2, H / 2 + 28 * u);
    }
  }
}
