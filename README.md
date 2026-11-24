# Beast Demon Survival (Stage 3)

An *Attack on Titan* inspired cavalry charge survival game built with **React**, **Vite**, **TypeScript**, **Tailwind CSS**, **PixiJS**, and **Three.js**.

Lead the charge across the district toward the Beast Demon, surviving relentless boulder volleys, maneuvering around terrain and debris, and coordinating tactical smoke signals with fellow scouts.

---

## Features (Stage 3)

- **3D Rigged Horse & Rider**: Multi-angle sprite atlas system supporting both classic and rigged horse/rider visuals.
- **Dynamic Shrapnel & Terrain Scars**: Boulder impacts shatter into lethal shrapnel fragments, leaving scorched craters and sliding skid marks across the field.
- **Atmospheric Smoke Plumes**: Multi-stage smoke flares and atmospheric fog simulation.
- **Field Plan Tactical Map**: Press <kbd>Tab</kbd> to toggle an authoritative top-down battlefield coordinate overlay.
- **Single-File Bundling**: Optimized build using `vite-plugin-singlefile` for self-contained, portable deployment.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- `npm`

### Installation

```bash
npm install
```

### Development Server

Run the local development server:

```bash
npm run dev
```

### Production Build

Build the single-file production distribution into `dist/`:

```bash
npm run build
```

---

## Project Structure

```
├── docs/                   # Battlefield scene coordinates and asset licensing
│   ├── LICENSE-horse.md    # CC0 model attribution (Quaternius Animals Pack)
│   └── scene-layout.md     # Authoritative Stage 3 coordinate mapping
├── src/
│   ├── game/               # Core game engine, Pixi renderer, audio, and systems
│   │   ├── rigged2/        # Baked horse & rider sprite atlas data
│   │   ├── art.ts          # Procedural sprite & environment art generators
│   │   ├── audio.ts        # Web Audio API sound effects & audio manager
│   │   ├── engine.ts       # Main simulation loop, collision, & game state
│   │   ├── FieldPlan.tsx   # Tactical top-down overlay (Tab)
│   │   ├── renderer.ts     # PixiJS + Three.js hybrid scene renderer
│   │   ├── scene.ts        # World object placement & coordinate mapping
│   │   ├── shrapnel.ts     # Physics fragments, craters, and hit tests
│   │   └── smoke.ts        # Flare and smoke simulation
│   ├── App.tsx             # Main React application & HUD overlay
│   ├── index.css           # Tailwind CSS styles
│   └── main.tsx            # Application entry point
├── index.html              # HTML shell
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## License & Credits

- Rigged horse source model: Quaternius (CC0 1.0 Public Domain). See [docs/LICENSE-horse.md](docs/LICENSE-horse.md) for details.
