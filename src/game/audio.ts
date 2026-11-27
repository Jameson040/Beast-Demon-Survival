import { clamp } from './types';
import hooves1Url from '../assets/audio/hooves_1.mp3';
import hooves120Url from '../assets/audio/hooves_120.mp3';
import screamUrl from '../assets/audio/scream_120.mp3';
import musicUrl from '../assets/audio/the_last_charge.mp3';
import counterattackUrl from '../assets/audio/the_giants_fall.mp3';
import playerHitUrl from '../assets/audio/player_hit_fall.mp3';
import stonePass1Url from '../assets/audio/stone_pass_1.mp3';
import stonePass2Url from '../assets/audio/stone_pass_2.mp3';
import stonePass3Url from '../assets/audio/stone_pass_3.mp3';
import stonePass4Url from '../assets/audio/stone_pass_4.mp3';

export interface AudioMix {
  master: number;
  music: number;
  hooves: number;
  screams: number;
  sfx: number;
}

export const MIX: AudioMix = {
  master: 0.85,
  music: 0.42,
  hooves: 0.55,
  screams: 0.78,
  sfx: 0.75,
};

interface HoofLayer {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export interface AudioSystem {
  ac: AudioContext | null;
  on: boolean;
  m: GainNode | null;
  sfxGain: GainNode | null;
  musicGain: GainNode | null;
  musicDuck: GainNode | null;
  musicGain1: GainNode | null;
  musicGain2: GainNode | null;
  hoovesGain: GainNode | null;
  hoovesFilter: BiquadFilterNode | null;
  screamGain: GainNode | null;
  nb: AudioBuffer | null;
  rumble: GainNode | null;
  wind: GainNode | null;
  musicEl: HTMLAudioElement | null;
  musicEl2: HTMLAudioElement | null;
  musicSrc: MediaElementAudioSourceNode | null;
  musicSrc2: MediaElementAudioSourceNode | null;
  activeTrack: 1 | 2;
  bufHooves1: AudioBuffer | null;
  bufHooves120: AudioBuffer | null;
  bufScream: AudioBuffer | null;
  bufPlayerHit: AudioBuffer | null;
  bufStonePass: AudioBuffer[];
  hoof120Layer: HoofLayer | null;
  hoof1Layers: HoofLayer[];
  loadingBufs: boolean;
  lastWhooshT: number;
}

export const SFX: AudioSystem = {
  ac: null,
  on: true,
  m: null,
  sfxGain: null,
  musicGain: null,
  musicDuck: null,
  musicGain1: null,
  musicGain2: null,
  hoovesGain: null,
  hoovesFilter: null,
  screamGain: null,
  nb: null,
  rumble: null,
  wind: null,
  musicEl: null,
  musicEl2: null,
  musicSrc: null,
  musicSrc2: null,
  activeTrack: 1,
  bufHooves1: null,
  bufHooves120: null,
  bufScream: null,
  bufPlayerHit: null,
  bufStonePass: [],
  hoof120Layer: null,
  hoof1Layers: [],
  loadingBufs: false,
  lastWhooshT: -1,
};

async function loadBuf(ac: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    return await ac.decodeAudioData(arr);
  } catch {
    return null;
  }
}

function startHoofLayers(): void {
  const ac = SFX.ac;
  const hg = SFX.hoovesGain;
  if (!ac || !hg || SFX.hoof120Layer || !SFX.bufHooves1 || !SFX.bufHooves120) return;

  const mkLoop = (buf: AudioBuffer, offset: number, rate: number, panVal: number): HoofLayer => {
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    const g = ac.createGain();
    g.gain.value = 0;
    src.connect(g);
    if (ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = panVal;
      g.connect(p);
      p.connect(hg);
    } else {
      g.connect(hg);
    }
    src.start(0, offset % Math.max(0.1, buf.duration));
    return { src, gain: g };
  };

  SFX.hoof120Layer = mkLoop(SFX.bufHooves120, 0, 1.0, 0);
  const offsets: [number, number, number][] = [
    [0.0, 1.0, 0.0],
    [0.37, 0.97, -0.45],
    [0.91, 1.03, 0.45],
    [1.48, 0.94, -0.22],
  ];
  SFX.hoof1Layers = offsets.map(([off, rate, pan]) => mkLoop(SFX.bufHooves1!, off, rate, pan));
}

export function applyAudioMix(): void {
  const ac = SFX.ac;
  if (!ac) return;
  const now = ac.currentTime;
  if (SFX.m) SFX.m.gain.setTargetAtTime(SFX.on ? MIX.master : 0, now, 0.04);
  if (SFX.musicGain) SFX.musicGain.gain.setTargetAtTime(MIX.music, now, 0.04);
  if (SFX.hoovesGain) SFX.hoovesGain.gain.setTargetAtTime(MIX.hooves, now, 0.04);
  if (SFX.screamGain) SFX.screamGain.gain.setTargetAtTime(MIX.screams, now, 0.04);
  if (SFX.sfxGain) SFX.sfxGain.gain.setTargetAtTime(MIX.sfx, now, 0.04);
}

export function setAudioMix(key: keyof AudioMix, value: number): void {
  MIX[key] = clamp(value, 0, 1.5);
  applyAudioMix();
}

export function audioInit(): void {
  if (SFX.ac) {
    if (SFX.ac.state === 'suspended') {
      SFX.ac.resume().catch(() => {});
    }
    applyAudioMix();
    return;
  }
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AudioCtx();
    SFX.ac = ac;

    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.16;
    comp.connect(ac.destination);

    SFX.m = ac.createGain();
    SFX.m.gain.value = SFX.on ? MIX.master : 0;
    SFX.m.connect(comp);

    SFX.sfxGain = ac.createGain();
    SFX.sfxGain.gain.value = MIX.sfx;
    SFX.sfxGain.connect(SFX.m);

    SFX.musicGain = ac.createGain();
    SFX.musicGain.gain.value = MIX.music;
    SFX.musicDuck = ac.createGain();
    SFX.musicDuck.gain.value = 1;
    SFX.musicDuck.connect(SFX.musicGain);
    SFX.musicGain.connect(SFX.m);

    SFX.musicGain1 = ac.createGain();
    SFX.musicGain1.gain.value = 1;
    SFX.musicGain1.connect(SFX.musicDuck);

    SFX.musicGain2 = ac.createGain();
    SFX.musicGain2.gain.value = 0;
    SFX.musicGain2.connect(SFX.musicDuck);

    SFX.hoovesGain = ac.createGain();
    SFX.hoovesGain.gain.value = MIX.hooves;
    SFX.hoovesFilter = ac.createBiquadFilter();
    SFX.hoovesFilter.type = 'lowpass';
    SFX.hoovesFilter.frequency.value = 16000;
    SFX.hoovesGain.connect(SFX.hoovesFilter);
    SFX.hoovesFilter.connect(SFX.m);

    SFX.screamGain = ac.createGain();
    SFX.screamGain.gain.value = MIX.screams;
    SFX.screamGain.connect(SFX.m);

    // Track 1: The Last Charge
    const el1 = new Audio(musicUrl);
    el1.loop = true;
    el1.preload = 'auto';
    SFX.musicEl = el1;
    SFX.musicSrc = ac.createMediaElementSource(el1);
    SFX.musicSrc.connect(SFX.musicGain1);

    // Track 2: Counterattack Awakening (Levi vs Beast Titan / Victory)
    const el2 = new Audio(counterattackUrl);
    el2.loop = true;
    el2.preload = 'auto';
    SFX.musicEl2 = el2;
    SFX.musicSrc2 = ac.createMediaElementSource(el2);
    SFX.musicSrc2.connect(SFX.musicGain2);

    const len = ac.sampleRate * 2;
    const b = ac.createBuffer(1, len, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    SFX.nb = b;

    const loop = (type: BiquadFilterType, freq: number, q: number) => {
      const s = ac.createBufferSource();
      s.buffer = b;
      s.loop = true;
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ac.createGain();
      g.gain.value = 0;
      s.connect(f);
      f.connect(g);
      g.connect(SFX.sfxGain!);
      s.start();
      return g;
    };
    SFX.rumble = loop('lowpass', 130, 0.7);
    SFX.wind = loop('bandpass', 700, 0.6);

    if (!SFX.loadingBufs) {
      SFX.loadingBufs = true;
      Promise.all([
        loadBuf(ac, hooves1Url),
        loadBuf(ac, hooves120Url),
        loadBuf(ac, screamUrl),
        loadBuf(ac, playerHitUrl),
        loadBuf(ac, stonePass1Url),
        loadBuf(ac, stonePass2Url),
        loadBuf(ac, stonePass3Url),
        loadBuf(ac, stonePass4Url),
      ]).then(([h1, h120, sc, hit, sp1, sp2, sp3, sp4]) => {
        SFX.bufHooves1 = h1;
        SFX.bufHooves120 = h120;
        SFX.bufScream = sc;
        SFX.bufPlayerHit = hit;
        SFX.bufStonePass = [sp1, sp2, sp3, sp4].filter((x): x is AudioBuffer => !!x);
        startHoofLayers();
      });
    }
  } catch {
    SFX.ac = null;
  }
}

let musicSeq = 0;

export function startMusic(restart = false): void {
  const ac = SFX.ac;
  const el1 = SFX.musicEl;
  const el2 = SFX.musicEl2;
  if (!el1) return;
  musicSeq++;
  if (ac?.state === 'suspended') SFX.ac?.resume().catch(() => {});
  if (restart) {
    SFX.activeTrack = 1;
    if (el2 && !el2.paused) el2.pause();
    if (el2) el2.currentTime = 0;
    el1.currentTime = 0;
    if (ac && SFX.musicGain1 && SFX.musicGain2) {
      const now = ac.currentTime;
      SFX.musicGain1.gain.cancelScheduledValues(now);
      SFX.musicGain1.gain.setValueAtTime(0, now);
      SFX.musicGain1.gain.linearRampToValueAtTime(1, now + 1.4);
      SFX.musicGain2.gain.cancelScheduledValues(now);
      SFX.musicGain2.gain.setValueAtTime(0, now);
    }
    el1.play().catch(() => {});
    return;
  }
  const active = SFX.activeTrack === 2 && el2 ? el2 : el1;
  const activeGain = SFX.activeTrack === 2 ? SFX.musicGain2 : SFX.musicGain1;
  if (ac && activeGain) {
    const now = ac.currentTime;
    activeGain.gain.cancelScheduledValues(now);
    activeGain.gain.setValueAtTime(activeGain.gain.value, now);
    activeGain.gain.linearRampToValueAtTime(1, now + 0.7);
  }
  active.play().catch(() => {});
}

export function pauseMusic(): void {
  const ac = SFX.ac;
  const seq = ++musicSeq;
  if (ac) {
    const now = ac.currentTime;
    if (SFX.musicGain1) {
      SFX.musicGain1.gain.cancelScheduledValues(now);
      SFX.musicGain1.gain.setValueAtTime(SFX.musicGain1.gain.value, now);
      SFX.musicGain1.gain.linearRampToValueAtTime(0, now + 0.55);
    }
    if (SFX.musicGain2) {
      SFX.musicGain2.gain.cancelScheduledValues(now);
      SFX.musicGain2.gain.setValueAtTime(SFX.musicGain2.gain.value, now);
      SFX.musicGain2.gain.linearRampToValueAtTime(0, now + 0.55);
    }
  }
  setTimeout(() => {
    if (musicSeq !== seq) return;
    if (SFX.musicEl && !SFX.musicEl.paused) SFX.musicEl.pause();
    if (SFX.musicEl2 && !SFX.musicEl2.paused) SFX.musicEl2.pause();
  }, 580);
}

export function switchToCounterattack(): void {
  const ac = SFX.ac;
  const el1 = SFX.musicEl;
  const el2 = SFX.musicEl2;
  if (!ac || !el2 || SFX.activeTrack === 2) return;
  const seq = ++musicSeq;
  SFX.activeTrack = 2;
  const now = ac.currentTime;
  el2.currentTime = 0;
  el2.play().catch(() => {});
  // Smooth cross-ducking: Track 1 fades out over 1.6s while Track 2 fades in over 1.4s
  if (SFX.musicGain1) {
    SFX.musicGain1.gain.cancelScheduledValues(now);
    SFX.musicGain1.gain.setValueAtTime(SFX.musicGain1.gain.value, now);
    SFX.musicGain1.gain.linearRampToValueAtTime(0, now + 1.6);
  }
  if (SFX.musicGain2) {
    SFX.musicGain2.gain.cancelScheduledValues(now);
    SFX.musicGain2.gain.setValueAtTime(0, now);
    SFX.musicGain2.gain.linearRampToValueAtTime(1, now + 1.4);
  }
  if (el1) {
    setTimeout(() => {
      if (musicSeq === seq && SFX.activeTrack === 2 && !el1.paused) el1.pause();
    }, 1700);
  }
}

export function updateHoovesMix(
  aliveRiders: number,
  totalRiders: number,
  playerAlive: boolean,
  playerSpeed: number,
  playing: boolean,
  regimentDist = 0
): void {
  const ac = SFX.ac;
  if (!ac || !SFX.hoof120Layer || !SFX.hoof1Layers.length) return;
  const now = ac.currentTime;
  const totalLiving = aliveRiders + (playerAlive ? 1 : 0);
  if (!playing || !SFX.on || totalLiving <= 0) {
    SFX.hoof120Layer.gain.gain.setTargetAtTime(0, now, 0.18);
    for (const l of SFX.hoof1Layers) l.gain.gain.setTargetAtTime(0, now, 0.18);
    return;
  }

  const frac = aliveRiders / Math.max(1, totalRiders);
  const spd = clamp(playerAlive ? playerSpeed / 15 : 0.9, 0.45, 1.3);
  const distAtten = playerAlive ? 1 : 1 / (1 + Math.max(0, regimentDist) / 70);
  const cutoff = playerAlive
    ? 16000
    : 700 + (16000 - 700) * clamp(1 - Math.max(0, regimentDist) / 260, 0, 1);
  if (SFX.hoovesFilter) SFX.hoovesFilter.frequency.setTargetAtTime(cutoff, now, 0.12);

  const thunder = clamp((frac - 0.38) / 0.52, 0, 1) * 0.88 * spd * distAtten;
  SFX.hoof120Layer.gain.gain.setTargetAtTime(thunder, now, 0.15);

  const l0 = clamp(0.28 + frac * 0.58, 0.25, 0.85) * spd * distAtten;
  const l1 = aliveRiders >= 4 ? clamp((aliveRiders - 3) / 14, 0, 1) * 0.68 * spd * distAtten : 0;
  const l2 = aliveRiders >= 14 ? clamp((aliveRiders - 13) / 22, 0, 1) * 0.62 * spd * distAtten : 0;
  const l3 = aliveRiders >= 30 ? clamp((aliveRiders - 29) / 28, 0, 1) * 0.56 * spd * distAtten : 0;
  const targets = [l0, l1, l2, l3];
  for (let i = 0; i < SFX.hoof1Layers.length; i++) {
    SFX.hoof1Layers[i].gain.gain.setTargetAtTime(targets[i] ?? 0, now, 0.14);
  }
}

export function sScream(aliveRatio: number, regimentDist = 0): void {
  const ac = SFX.ac;
  if (!ac || !SFX.on || !SFX.bufScream || !SFX.screamGain) return;
  const src = ac.createBufferSource();
  src.buffer = SFX.bufScream;
  const distAtten = 1 / (1 + Math.max(0, regimentDist) / 85);
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value =
    1100 + (16000 - 1100) * clamp(1 - Math.max(0, regimentDist) / 240, 0, 1);
  const g = ac.createGain();
  g.gain.value = clamp(0.35 + 0.65 * Math.sqrt(clamp(aliveRatio, 0, 1)), 0.3, 1) * distAtten;
  src.connect(f);
  f.connect(g);
  g.connect(SFX.screamGain);
  src.start();

  if (SFX.musicDuck && distAtten > 0.45) {
    const now = ac.currentTime;
    SFX.musicDuck.gain.setTargetAtTime(1 - 0.35 * distAtten, now, 0.14);
    SFX.musicDuck.gain.setTargetAtTime(1.0, now + 6.5, 1.2);
  }
}

export function nz(
  dur: number,
  type: BiquadFilterType,
  freq: number,
  gain: number,
  o?: { delay?: number; q?: number; f2?: number; pan?: number }
): void {
  const ac = SFX.ac;
  if (!ac || !SFX.on || !SFX.nb || !SFX.sfxGain) return;
  const opts = o || {};
  const t = ac.currentTime + (opts.delay || 0);
  const s = ac.createBufferSource();
  s.buffer = SFX.nb;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  f.Q.value = opts.q || 1;
  if (opts.f2) f.frequency.exponentialRampToValueAtTime(opts.f2, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(Math.max(0.001, gain), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f);
  f.connect(g);
  if (ac.createStereoPanner) {
    const p = ac.createStereoPanner();
    p.pan.value = clamp(opts.pan || 0, -1, 1);
    g.connect(p);
    p.connect(SFX.sfxGain);
  } else {
    g.connect(SFX.sfxGain);
  }
  s.start(t, Math.random() * 1.5, dur + 0.05);
}

export function tone(
  freq: number,
  dur: number,
  gain: number,
  type?: OscillatorType,
  delay?: number,
  f2?: number
): void {
  const ac = SFX.ac;
  if (!ac || !SFX.on || !SFX.sfxGain) return;
  const t = ac.currentTime + (delay || 0);
  const o = ac.createOscillator();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(Math.max(0.001, gain), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(SFX.sfxGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sHoof = () => {
  if (!SFX.hoof1Layers.length) nz(0.07, 'lowpass', 240, 0.28);
};

export function sWhoosh(pan: number, small: boolean): void {
  const ac = SFX.ac;
  if (ac && SFX.on && SFX.bufStonePass.length && SFX.sfxGain) {
    const now = ac.currentTime;
    if (now - SFX.lastWhooshT < 0.045) return;
    SFX.lastWhooshT = now;
    const buf = SFX.bufStonePass[(Math.random() * SFX.bufStonePass.length) | 0];
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = small ? 1.04 + Math.random() * 0.14 : 0.90 + Math.random() * 0.14;
    const g = ac.createGain();
    g.gain.value = small ? 0.58 : 0.78;
    src.connect(g);
    if (ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      p.connect(SFX.sfxGain);
    } else {
      g.connect(SFX.sfxGain);
    }
    src.start();
    return;
  }
  nz(small ? 0.16 : 0.28, 'bandpass', small ? 4200 : 2600, small ? 0.35 : 0.5, {
    f2: small ? 1200 : 450,
    q: 2,
    pan,
  });
}

export const sThud = (pan: number, v: number) => nz(0.12, 'lowpass', 700, v, { pan });
export function sCrack(delay: number): void {
  nz(0.7, 'lowpass', 1400, 0.8, { delay, f2: 120 });
  tone(52, 0.9, 0.45, 'sine', delay, 28);
}
export function sThrowBoom(delay: number, gainScale = 1): void {
  nz(0.45, 'bandpass', 650, 0.45 * gainScale, { delay, f2: 140, q: 0.9 });
  tone(88, 0.38, 0.28 * gainScale, 'triangle', delay, 32);
}

function playPlayerHitFoley(): void {
  const ac = SFX.ac;
  if (!ac || !SFX.on || !SFX.bufPlayerHit || !SFX.sfxGain) return;
  const src = ac.createBufferSource();
  src.buffer = SFX.bufPlayerHit;
  const g = ac.createGain();
  g.gain.value = 1.0;
  src.connect(g);
  g.connect(SFX.sfxGain);
  src.start();
  if (SFX.musicDuck) {
    const now = ac.currentTime;
    SFX.musicDuck.gain.setTargetAtTime(0.55, now, 0.05);
    SFX.musicDuck.gain.setTargetAtTime(1.0, now + 2.2, 0.6);
  }
}

export function sDeath(): void {
  playPlayerHitFoley();
  nz(0.5, 'lowpass', 900, 0.55, { f2: 80 });
  tone(85, 0.5, 0.4, 'triangle', 0, 28);
}
export function sJump(): void {
  nz(0.18, 'lowpass', 400, 0.3);
}
export function sVault(): void {
  nz(0.22, 'bandpass', 1200, 0.26, { f2: 2400, q: 1.6 });
  tone(320, 0.18, 0.12, 'triangle', 0, 520);
}
export function sRockClip(pan: number): void {
  nz(0.24, 'bandpass', 950, 0.58, { f2: 220, q: 1.4, pan });
  nz(0.14, 'highpass', 1800, 0.32, { pan });
  tone(110, 0.22, 0.38, 'triangle', 0, 48);
}
export function sRockCrash(): void {
  playPlayerHitFoley();
  nz(0.55, 'lowpass', 950, 0.75, { f2: 95 });
  nz(0.32, 'bandpass', 1900, 0.42, { f2: 340, q: 1.2 });
  tone(78, 0.55, 0.5, 'sawtooth', 0, 26);
}
export function sRockRicochet(pan: number, vol: number): void {
  nz(0.14, 'bandpass', 2400, Math.min(0.42, vol), { f2: 650, q: 2.5, pan });
  tone(640, 0.08, Math.min(0.14, vol * 0.4), 'triangle', 0, 280);
}
export function sFlare(pan: number): void {
  nz(0.16, 'lowpass', 620, 0.28, { pan, f2: 180 });
  nz(0.85, 'bandpass', 1400, 0.16, { delay: 0.05, f2: 2600, q: 4, pan });
}
