import { clamp } from './types';

export interface AudioSystem {
  ac: AudioContext | null;
  on: boolean;
  m: GainNode | null;
  nb: AudioBuffer | null;
  rumble: GainNode | null;
  wind: GainNode | null;
}

export const SFX: AudioSystem = {
  ac: null,
  on: true,
  m: null,
  nb: null,
  rumble: null,
  wind: null,
};

export function audioInit(): void {
  if (SFX.ac) {
    if (SFX.ac.state === 'suspended') {
      SFX.ac.resume().catch(() => {});
    }
    return;
  }
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new AudioCtx();
    SFX.ac = ac;
    SFX.m = ac.createGain();
    SFX.m.gain.value = 0.55;
    SFX.m.connect(ac.destination);

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
      g.connect(SFX.m!);
      s.start();
      return g;
    };
    SFX.rumble = loop('lowpass', 130, 0.7);
    SFX.wind = loop('bandpass', 700, 0.6);
  } catch {
    SFX.ac = null;
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
  if (!ac || !SFX.on || !SFX.nb || !SFX.m) return;
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
    p.connect(SFX.m);
  } else {
    g.connect(SFX.m);
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
  if (!ac || !SFX.on || !SFX.m) return;
  const t = ac.currentTime + (delay || 0);
  const o = ac.createOscillator();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(Math.max(0.001, gain), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(SFX.m);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sHoof = () => nz(0.07, 'lowpass', 240, 0.32);
export const sWhoosh = (pan: number, small: boolean) =>
  nz(small ? 0.16 : 0.28, 'bandpass', small ? 4200 : 2600, small ? 0.35 : 0.5, {
    f2: small ? 1200 : 450,
    q: 2,
    pan,
  });
export const sThud = (pan: number, v: number) => nz(0.12, 'lowpass', 700, v, { pan });
export function sCrack(delay: number): void {
  nz(0.7, 'lowpass', 1400, 0.8, { delay, f2: 120 });
  tone(52, 0.9, 0.45, 'sine', delay, 28);
}
export function sDeath(): void {
  nz(0.7, 'lowpass', 1100, 1.0, { f2: 80 });
  tone(90, 0.6, 0.6, 'triangle', 0, 30);
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
  nz(0.55, 'lowpass', 950, 0.95, { f2: 95 });
  nz(0.32, 'bandpass', 1900, 0.5, { f2: 340, q: 1.2 });
  tone(78, 0.55, 0.62, 'sawtooth', 0, 26);
  tone(190, 0.25, 0.28, 'triangle', 0.04, 65);
}
export function sRockRicochet(pan: number, vol: number): void {
  nz(0.14, 'bandpass', 2400, Math.min(0.42, vol), { f2: 650, q: 2.5, pan });
  tone(640, 0.08, Math.min(0.14, vol * 0.4), 'triangle', 0, 280);
}
export function sFlare(pan: number): void {
  nz(0.16, 'lowpass', 620, 0.28, { pan, f2: 180 });
  nz(0.85, 'bandpass', 1400, 0.16, { delay: 0.05, f2: 2600, q: 4, pan });
}
