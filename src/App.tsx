import { useEffect, useRef, useState } from 'react';
import { audioInit, AudioMix, MIX, setAudioMix } from './game/audio';
import { GameEngine } from './game/engine';
import { WorldRenderer } from './game/renderer';
import FieldPlan from './game/FieldPlan';
import {
  DEMON_START,
  DiffKey,
  DIFFS,
  fmtT,
  GameSnapshot,
  RIDERS,
  WIN_DIST,
} from './game/types';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const hudRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const togglePlanRef = useRef<() => void>(() => {});
  const planOpenRef = useRef(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [snap, setSnap] = useState<GameSnapshot>({
    state: 'menu',
    diffKey: 'normal',
    distance: 0,
    time: 0,
    closeCalls: 0,
    vaults: 0,
    rockClips: 0,
    stonesThrown: 0,
    companionsAlive: RIDERS,
    score: 0,
    diffName: DIFFS.normal.name,
  });
  const [muted, setMuted] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [mix, setMix] = useState<AudioMix>({ ...MIX });

  useEffect(() => {
    const mount = mountRef.current;
    const hud = hudRef.current;
    if (!mount || !hud) return;

    const ctx = hud.getContext('2d');
    if (!ctx) return;

    const eng = new GameEngine(s => setSnap(s));
    engineRef.current = eng;
    const renderer = new WorldRenderer();

    const applyResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      hud.width = w;
      hud.height = h;
      eng.setView(w, h, dpr);
      renderer.resize(w, h);
    };
    applyResize();

    let cancelled = false;
    let rafId = 0;
    let resumeAfterPlan = false;
    let sceneReady = false;

    const togglePlan = () => {
      for (const key in eng.keys) eng.keys[key] = false;
      eng.touch.l = eng.touch.r = eng.touch.up = false;
      eng.G.wantDash = eng.G.wantJump = false;
      if (planOpenRef.current) {
        planOpenRef.current = false;
        setPlanOpen(false);
        if (resumeAfterPlan && eng.G.state === 'pause') eng.togglePause();
      } else {
        resumeAfterPlan = eng.G.state === 'play';
        if (resumeAfterPlan) eng.togglePause();
        planOpenRef.current = true;
        setPlanOpen(true);
      }
    };
    togglePlanRef.current = togglePlan;

    renderer.init(mount, eng.view.W, eng.view.H).then(() => {
      if (cancelled) return;
      renderer.resize(eng.view.W, eng.view.H);
      sceneReady = true;
      setReady(true);
    }).catch((error: unknown) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : 'The renderer could not start.');
    });

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'tab' || (k === 'escape' && planOpenRef.current)) {
        e.preventDefault();
        if (!e.repeat) togglePlan();
        return;
      }
      if (planOpenRef.current) return;
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        e.preventDefault();
      }
      if (eng.keys[k]) return;
      eng.keys[k] = true;
      audioInit();
      if (eng.G.state === 'play') {
        if (k === ' ') eng.G.wantJump = true;
        if (k === 'enter') eng.skipToResults();
        if (k === 'shift') eng.G.wantDash = true;
        if (k === 'h') eng.toggleRadar();
        if (k === 'm') setMuted(!eng.toggleMute());
        if (k === 'p' || k === 'escape') eng.togglePause();
      } else if (eng.G.state === 'pause' && (k === 'p' || k === 'escape')) {
        eng.togglePause();
      } else if (
        k === 'enter' &&
        (eng.G.state === 'over' || eng.G.state === 'win' || eng.G.state === 'menu')
      ) {
        e.preventDefault();
        if (sceneReady) eng.startGame();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      eng.keys[e.key.toLowerCase()] = false;
    };

    const touchUpdate = (e: TouchEvent) => {
      eng.touch.l = false;
      eng.touch.r = false;
      eng.touch.up = false;
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        const x = t.clientX / window.innerWidth;
        const y = t.clientY / window.innerHeight;
        if (y < 0.4) eng.touch.up = true;
        else if (x < 0.5) eng.touch.l = true;
        else eng.touch.r = true;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      audioInit();
      touchUpdate(e);
      if (e.touches.length >= 2 && eng.G.state === 'play') {
        eng.G.wantJump = true;
      }
      e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      touchUpdate(e);
      e.preventDefault();
    };
    const onTouchEnd = (e: TouchEvent) => {
      touchUpdate(e);
      e.preventDefault();
    };
    const onBlur = () => {
      for (const k in eng.keys) eng.keys[k] = false;
      eng.touch.l = eng.touch.r = eng.touch.up = false;
      if (eng.G.state === 'play') eng.togglePause();
    };

    window.addEventListener('resize', applyResize);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    hud.addEventListener('touchstart', onTouchStart, { passive: false });
    hud.addEventListener('touchmove', onTouchMove, { passive: false });
    hud.addEventListener('touchend', onTouchEnd, { passive: false });
    hud.addEventListener('touchcancel', onTouchEnd, { passive: false });

    let last = performance.now();
    const frame = (now: number) => {
      if (cancelled) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (sceneReady && eng.G.state === 'play') {
        const sdt = dt * eng.G.slow;
        const steps = Math.max(1, Math.ceil(sdt / 0.0085));
        for (let i = 0; i < steps; i++) {
          eng.update(sdt / steps);
          if (eng.G.state !== 'play') break;
        }
      } else if (eng.G.state === 'menu') {
        // Gentle living breeze & cloud drift behind the menu panel!
        eng.G.t += dt * 0.65;
      }

      renderer.render(eng);
      eng.syncAudio();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, eng.view.W, eng.view.H);
      if (eng.G.state !== 'menu') {
        eng.drawHUD(ctx);
      }

      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', applyResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      hud.removeEventListener('touchstart', onTouchStart);
      hud.removeEventListener('touchmove', onTouchMove);
      hud.removeEventListener('touchend', onTouchEnd);
      hud.removeEventListener('touchcancel', onTouchEnd);
      renderer.destroy();
      engineRef.current = null;
    };
  }, []);

  const handleStart = () => { if (ready) engineRef.current?.startGame(); };
  const handleMenu = () => engineRef.current?.goToMenu();
  const handleDiff = (k: DiffKey) => engineRef.current?.setDifficulty(k);

  const renderStats = () => (
    <div className="bds-stats">
      <div>
        Distance ridden: {snap.distance.toLocaleString()} m of {(DEMON_START - WIN_DIST).toLocaleString()} m
      </div>
      <div>
        Time: {fmtT(snap.time)} &nbsp;·&nbsp; Close calls: {snap.closeCalls} &nbsp;·&nbsp; Rock vaults: {snap.vaults}
      </div>
      <div>
        Stones thrown: {snap.stonesThrown.toLocaleString()} &nbsp;·&nbsp; Rock clips: {snap.rockClips}
      </div>
      <div>
        Companions still riding: {snap.companionsAlive} / {RIDERS}
      </div>
      <div>
        Score: {snap.score.toLocaleString()} &nbsp;({snap.diffName})
      </div>
    </div>
  );

  const renderHitSummary = () => {
    const k = snap.killer;
    if (!k) return null;
    const distM = Math.round(snap.fallDist || 0);
    if (k.type === 'rock') {
      return (
        <p>
          Your horse slammed head-on into a {(k.rockH || 1.2).toFixed(1)} m field boulder at{' '}
          <b>{Math.round(k.kmh)} km/h</b>, {distM} m from the Beast.
        </p>
      );
    }
    if (k.type === 'tree') {
      return (
        <p>
          Your horse struck a flanking oak trunk at <b>{Math.round(k.kmh)} km/h</b>, {distM} m from
          the Beast.
        </p>
      );
    }
    return (
      <p>
        A {(k.inch || 1).toFixed(1)}-inch fragment hit {k.part} at <b>{Math.round(k.kmh)} km/h</b>,{' '}
        {distM} m from the Beast.
      </p>
    );
  };

  const handleMixChange = (key: keyof AudioMix, value: number) => {
    setAudioMix(key, value);
    setMix(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div ref={mountRef} className="relative w-screen h-screen overflow-hidden bg-black">
      <canvas ref={hudRef} id="hud" className="bds-canvas" />

      {!planOpen && (snap.state === 'play' || snap.state === 'pause') && (
        <nav className="game-tools" aria-label="Game controls">
          <button onClick={() => setAudioOpen(v => !v)}>{audioOpen ? 'MIXER ×' : 'MIXER'}</button>
          <button onClick={() => togglePlanRef.current()}>FIELD PLAN <span>TAB</span></button>
          <button onClick={() => engineRef.current?.togglePause()}>{snap.state === 'pause' ? 'RESUME' : 'PAUSE'} <span>P</span></button>
          {snap.state === 'play' && snap.fate && (
            <button onClick={() => engineRef.current?.skipToResults()}>SKIP <span>ENTER</span></button>
          )}
          <button onClick={() => engineRef.current?.goToMenu()}>MENU</button>
        </nav>
      )}

      {audioOpen && !planOpen && (snap.state === 'play' || snap.state === 'pause') && (
        <div className="bds-mixer" role="region" aria-label="Live audio mixer">
          <div className="bds-mixer-head">
            <span>AUDIO MIXER</span>
            <button
              type="button"
              onClick={() => {
                const m = engineRef.current?.toggleMute();
                if (m !== undefined) setMuted(!m);
              }}
            >
              {muted ? 'UNMUTE (M)' : 'MUTE (M)'}
            </button>
          </div>
          {(
            [
              ['master', 'Master', 1.2],
              ['music', 'Music', 1.2],
              ['hooves', 'Hooves', 1.5],
              ['screams', 'Screams', 1.5],
              ['sfx', 'SFX & Stones', 1.5],
            ] as [keyof AudioMix, string, number][]
          ).map(([key, label, max]) => (
            <label key={key} className="bds-mixer-row">
              <span>{label}</span>
              <input
                type="range"
                min={0}
                max={max}
                step={0.02}
                value={mix[key]}
                onChange={e => handleMixChange(key, parseFloat(e.target.value))}
              />
              <b>{Math.round(mix[key] * 100)}%</b>
            </label>
          ))}
        </div>
      )}

      {snap.state === 'play' && muted && (
        <div
          style={{
            position: 'fixed',
            top: 56,
            right: 16,
            zIndex: 5,
            fontSize: 12,
            letterSpacing: 1.5,
            color: '#c8a878',
            background: 'rgba(16,12,8,0.65)',
            border: '1px solid rgba(138,96,56,0.45)',
            padding: '4px 10px',
            borderRadius: 4,
            pointerEvents: 'none',
          }}
        >
          MUTED (M)
        </div>
      )}

      {snap.state === 'menu' && !planOpen && (
        <div className="bds-overlay">
          <div className="bds-panel">
            <div className="bds-badge">Stage III · Shiganshina Plains</div>
            <h1>BEAST DEMON SURVIVAL</h1>
            <div className="bds-sub">
              1,500 metres of open field. One hundred and twenty riders. One Beast.
            </div>
            <p>
              Ride from the city gate, through the ruined district, straight toward
              the 20 m Beast. His Titans wrap around the far end of the plain, leaving a central opening.
              His quadruped carrier hauls boulders; he crushes each into a fistful
              of shrapnel and hurls it at pitcher speed. Vault low field rocks, steer past heavy
              crags, and survive the bombardment.
            </p>
            <table className="bds-table">
              <tbody>
                <tr>
                  <td>A / D &nbsp;&larr; &rarr;</td>
                  <td>Steer the horse (it carries momentum)</td>
                </tr>
                <tr>
                  <td>W / &uarr;</td>
                  <td>Spur: sprint (drains stamina, shifts where volleys land)</td>
                </tr>
                <tr>
                  <td>S / &darr;</td>
                  <td>Rein in: slow down, recover stamina, cushion rock impacts</td>
                </tr>
                <tr>
                  <td>SHIFT</td>
                  <td>Side-dash burst (stamina)</td>
                </tr>
                <tr>
                  <td>SPACE</td>
                  <td>Vault low field rocks &amp; leap skipping stones (stamina)</td>
                </tr>
                <tr>
                  <td>H / M / P / TAB</td>
                  <td>Scout&apos;s Eye / Mute / Pause / Field plan</td>
                </tr>
              </tbody>
            </table>
            <p style={{ fontSize: 13, color: '#b2a692' }}>
              Watch shadows racing across the grass and Scout&apos;s Eye: red ticks mark incoming
              shrapnel, stone silhouettes mark approaching field boulders. Large boulders can even
              shatter low-flying fragments.
            </p>
            <div className="bds-btns">
              {(Object.keys(DIFFS) as DiffKey[]).map(k => (
                <button
                  key={k}
                  className={`bds-btn bds-btn-alt ${k === snap.diffKey ? 'bds-btn-sel' : ''}`}
                  onClick={() => handleDiff(k)}
                >
                  {DIFFS[k].name}
                </button>
              ))}
            </div>
            <div className="bds-btns">
              <button className="bds-btn" onClick={handleStart} disabled={!ready}>
                {ready ? 'RIDE TO YOUR DOOM (Enter)' : 'PREPARING THE FIELD...'}
              </button>
              <button className="bds-btn bds-btn-alt" onClick={() => togglePlanRef.current()}>FIELD PLAN (Tab)</button>
            </div>
            {loadError && <p role="alert">Unable to prepare the WebGL scene: {loadError}</p>}
            <div className="bds-hint">
              Touch: hold left or right half to steer, top of screen to sprint, two fingers to jump.
            </div>
          </div>
        </div>
      )}

      {snap.state === 'over' && !planOpen && (
        <div className="bds-overlay">
          <div className="bds-panel">
            <h2>
              {snap.fate === 'dead'
                ? 'KILLED INSTANTLY'
                : snap.fate === 'serious'
                  ? 'GRAVELY WOUNDED'
                  : 'THROWN, BUT ALIVE'}
            </h2>
            {renderHitSummary()}
            <p>
              <i>
                {snap.fate === 'dead'
                  ? 'You never saw what happened next.'
                  : snap.fate === 'serious'
                    ? 'Through blood-tinted, fluttering eyes you saw Titans falling one after another. Levi blinded the Beast and tore Zeke from its nape, but the Cart Titan carried him away.'
                    : 'From the grass you watched Levi cut through the Titans, disable the Beast and pull Zeke from its nape. The Cart Titan snatched him away before Levi could finish it.'}
              </i>
            </p>
            {renderStats()}
            <div className="bds-btns">
              <button className="bds-btn" onClick={handleStart}>
                RIDE AGAIN (Enter)
              </button>
              <button className="bds-btn bds-btn-alt" onClick={handleMenu}>
                MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {snap.state === 'win' && !planOpen && (
        <div className="bds-overlay">
          <div className="bds-panel">
            <h2>{snap.winByLevi ? 'THE BEAST IS DISABLED' : 'YOU REACHED THE BEAST'}</h2>
            <p>
              {snap.winByLevi
                ? 'You survived the bombardment. Levi disabled the Beast, but the Cart Titan escaped with Zeke.'
                : 'You survived the bombardment and the boulder-strewn plains to close to striking distance.'}
            </p>
            {renderStats()}
            <div className="bds-btns">
              <button className="bds-btn" onClick={handleStart}>
                RIDE AGAIN (Enter)
              </button>
              <button className="bds-btn bds-btn-alt" onClick={handleMenu}>
                MENU
              </button>
            </div>
          </div>
        </div>
      )}
      {snap.state === 'pause' && !planOpen && (
        <div className="bds-overlay">
          <div className="bds-panel">
            <h2>PAUSED</h2>
            <p>The charge waits. Choose how to continue.</p>
            <div className="bds-btns">
              <button className="bds-btn" onClick={() => engineRef.current?.togglePause()}>RESUME (P)</button>
              <button className="bds-btn bds-btn-alt" onClick={handleStart}>RESTART</button>
              <button className="bds-btn bds-btn-alt" onClick={handleMenu}>MENU</button>
            </div>
            <div className="bds-btns">
              <button className="bds-btn bds-btn-alt" onClick={() => togglePlanRef.current()}>FIELD PLAN (TAB)</button>
            </div>
          </div>
        </div>
      )}
      {planOpen && engineRef.current && <FieldPlan engine={engineRef.current} onClose={() => togglePlanRef.current()} />}
    </div>
  );
}
