# Beast Demon Survival

An unofficial *Attack on Titan* (*Shingeki no Kyojin*) fan-made cavalry charge survival game built with **React**, **Vite**, **TypeScript**, **Tailwind CSS**, and **PixiJS**.

> **Fan Project Disclaimer:** This is a non-commercial **fan tribute project** created out of appreciation for *Attack on Titan*. Character names, titans, factions, and battlegrounds referenced in this game (including the Beast Titan / Zeke Yeager, Levi Ackerman, Cart Titan, Survey Corps / Scout Regiment, Pure Titans, and Shiganshina District) belong to their respective owners (Hajime Isayama / Kodansha / Wit Studio / MAPPA). This project is not affiliated with, sponsored by, or endorsed by any official rights holder.

---

## About

Relive the desperate Scout Regiment cavalry charge outside Shiganshina District as ~120 riders gallop across open meadowland toward the Beast Titan while **Levi Ackerman** closes the flank to bring him down.

- **Survive the Barrage**: Dodge incoming boulder volleys, supersonic stone shrapnel splatters, and craters while riding alongside your fellow Scouts.
- **Tactical Smoke Signals**: Three Green Smoke Signal salvos (`10s`, `20s`, `35s`) backed by stacked battle screams across the regiment.
- **Distance-Aware Dynamic Audio**: Hooves, regiment screams, stone pass-by audio clips, and dual-track music transitions with automatic crossfade ducking and distance low-pass attenuation as fallen riders are left behind — plus a live on-screen **Audio Mixer** (`Master`, `Music`, `Hooves`, `Screams`, `SFX & Stones`).
- **Two-Stage Survival & Finale**: Even if struck (`Light` or `Serious` injury), witness Levi's multi-phase takedown of the Beast Titan from the battlefield before the Cart Titan intervenes.

---

## Features

- **3D Rigged Horse & Rider Atlas**: 9-angle × 8-frame baked gallop sprite sheet (`src/game/rigged2/`) with synchronized rider and horse lean/yaw interpolation.
- **Custom Environments & Sprites**: Custom-illustrated mountain panorama, Shiganshina houses, pine trees, meadow bushes, field boulders, Pure Titans, plus layered SVG Beast Titan & Levi combat choreography.
- **Dynamic Shrapnel & Terrain Scars**: Boulder impacts shatter into lethal shrapnel fragments, leaving ground craters, blood splatters/pools, and sliding skid marks across a custom WebGL grass shader ground plane.
- **Atmospheric Smoke & Fog**: Green smoke flares, dust kickups, speed streaks, trauma shake, and depth fog.
- **Field Plan Tactical Map**: Press <kbd>Tab</kbd> to toggle a top-down battlefield coordinate map showing positions, walls, and fallen titans.
- **Single-File Production Build**: Uses `vite-plugin-singlefile` to bundle the entire game into a standalone `dist/index.html`.

---

## Controls

| Input | Action |
| :--- | :--- |
| <kbd>A</kbd> / <kbd>D</kbd> or <kbd>←</kbd> / <kbd>→</kbd> | Steer left / right |
| <kbd>Space</kbd> | Vault / jump over rocks & craters |
| <kbd>Shift</kbd> | Spur horse (burst speed) |
| <kbd>Tab</kbd> | Toggle Field Plan tactical map |
| <kbd>H</kbd> | Toggle radar |
| <kbd>M</kbd> | Mute / unmute audio |
| <kbd>P</kbd> / <kbd>Esc</kbd> | Pause / resume |
| <kbd>Enter</kbd> | Start run (or skip to results while downed) |

Mobile touch layout is also supported out of the box (PUBG-style left virtual wheel for steering, spur, and rein in, plus right-side **DASH** & **JUMP** thumb buttons, and a **PAD** toggle in the top bar).

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- `npm`

### Installation & Run

```bash
npm install
npm run dev
```

### Production Build

Builds a self-contained single-file bundle into `dist/index.html`:

```bash
npm run build
```

---

## Project Structure

```
├── docs/                   # Battlefield layout & model licensing
│   ├── LICENSE-horse.md    # CC0 model attribution (Quaternius Animals Pack)
│   └── scene-layout.md     # Scene coordinate layout reference
├── src/
│   ├── assets/
│   │   ├── audio/          # Normalized MP3 tracks, hooves, screams, and stone pass-bys
│   │   └── images/         # Sprites & SVGs (houses, pines, bushes, titans, Beast Titan, Levi)
│   ├── game/
│   │   ├── rigged2/        # Baked 9x8 rigged horse & rider sprite atlases + metadata
│   │   ├── art.ts          # Asset loader & mipmapped PixiJS texture registry
│   │   ├── audio.ts        # Web Audio API mixer, distance filter, & cross-ducking manager
│   │   ├── engine.ts       # Main simulation loop, throws, Levi choreography, & state
│   │   ├── FieldPlan.tsx   # Tactical top-down overlay (Tab)
│   │   ├── renderer.ts     # PixiJS + WebGL ground shader scene renderer
│   │   ├── riggedHorse.ts  # Async atlas decoder for rigged horse & rider frames
│   │   ├── scene.ts        # Landmark & titan placement + coordinate mapping
│   │   ├── shrapnel.ts     # Rock shattering, shrapnel physics, & hit detection
│   │   ├── smoke.ts        # Green smoke flare & plume simulation
│   │   └── types.ts        # Constants, difficulty settings, & shared interfaces
│   ├── App.tsx             # React UI shell, HUD canvas, & Audio Mixer panel
│   ├── index.css           # Tailwind CSS styles
│   └── main.tsx            # Entry point
├── index.html              # HTML shell
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Contributors & Credits

- **Creator & Lead Developer**: [@Jameson040](https://github.com/Jameson040)
- **AI Pair Programmer**: Google Antigravity
- **Fan Project Notice**: Unofficial non-commercial *Attack on Titan* fan tribute. All original *Attack on Titan* IP, characters, and settings belong to Hajime Isayama / Kodansha.
- **Rigged Horse Model**: Quaternius (CC0 1.0 Public Domain). See [docs/LICENSE-horse.md](docs/LICENSE-horse.md) for details.
