import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { GameEngine } from './engine';

interface MobileControlsProps {
  engine: GameEngine;
  onUnlockAudio: () => void;
}

interface StickVisual {
  x: number;
  y: number;
  active: boolean;
  up: boolean;
  down: boolean;
}

const DEADZONE = 0.16;

export default function MobileControls({ engine, onUnlockAudio }: MobileControlsProps) {
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [stick, setStick] = useState<StickVisual>({ x: 0, y: 0, active: false, up: false, down: false });
  const [dashPressed, setDashPressed] = useState(false);
  const [jumpPressed, setJumpPressed] = useState(false);

  const resetStick = useCallback(() => {
    pointerIdRef.current = null;
    engine.touch.l = false;
    engine.touch.r = false;
    engine.touch.up = false;
    engine.touch.down = false;
    engine.touch.steerX = 0;
    setStick({ x: 0, y: 0, active: false, up: false, down: false });
  }, [engine]);

  useEffect(() => {
    window.addEventListener('blur', resetStick);
    return () => {
      window.removeEventListener('blur', resetStick);
      resetStick();
    };
  }, [resetStick]);

  const updateStickFromClient = (clientX: number, clientY: number) => {
    const el = wheelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = Math.max(24, rect.width * 0.36);

    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      const k = maxR / dist;
      dx *= k;
      dy *= k;
    }

    const nx = dx / maxR;
    const ny = dy / maxR;
    const ax = Math.abs(nx);
    const steerX = ax <= DEADZONE ? 0 : (Math.sign(nx) * (ax - DEADZONE)) / (1 - DEADZONE);
    const up = ny < -0.32;
    const down = ny > 0.38;

    engine.touch.steerX = steerX;
    engine.touch.l = steerX < -0.1;
    engine.touch.r = steerX > 0.1;
    engine.touch.up = up;
    engine.touch.down = down;

    setStick({ x: dx, y: dy, active: true, up, down });
  };

  const onWheelDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onUnlockAudio();
    if (pointerIdRef.current !== null) return;
    pointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events without active pointer capture support.
    }
    updateStickFromClient(e.clientX, e.clientY);
  };

  const onWheelMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    updateStickFromClient(e.clientX, e.clientY);
  };

  const onWheelUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore synthetic pointer release mismatch.
    }
    resetStick();
  };

  const triggerDash = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onUnlockAudio();
    engine.G.wantDash = true;
    setDashPressed(true);
  };

  const triggerJump = (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onUnlockAudio();
    engine.G.wantJump = true;
    setJumpPressed(true);
  };

  return (
    <div className="bds-mobile-controls" aria-label="Touch gameplay controls">
      <div
        ref={wheelRef}
        className={`bds-wheel ${stick.active ? 'is-active' : ''} ${stick.up ? 'is-spur' : ''} ${stick.down ? 'is-rein' : ''}`}
        role="slider"
        aria-label="Steer, spur, and rein in horse"
        aria-valuetext={stick.up ? 'Spurring' : stick.down ? 'Reining in' : 'Steering'}
        onPointerDown={onWheelDown}
        onPointerMove={onWheelMove}
        onPointerUp={onWheelUp}
        onPointerCancel={onWheelUp}
        onContextMenu={e => e.preventDefault()}
      >
        <span className="bds-wheel-dir bds-dir-n">SPUR</span>
        <span className="bds-wheel-dir bds-dir-s">REIN</span>
        <span className="bds-wheel-dir bds-dir-w">&lsaquo;</span>
        <span className="bds-wheel-dir bds-dir-e">&rsaquo;</span>
        <div
          className="bds-wheel-knob"
          style={{
            transform: `translate3d(calc(-50% + ${stick.x.toFixed(1)}px), calc(-50% + ${stick.y.toFixed(1)}px), 0)`,
          }}
        />
      </div>

      <div className="bds-action-cluster">
        <button
          type="button"
          className={`bds-action-btn bds-btn-dash ${dashPressed ? 'is-pressed' : ''}`}
          aria-label="Side dash"
          onPointerDown={triggerDash}
          onPointerUp={() => setDashPressed(false)}
          onPointerCancel={() => setDashPressed(false)}
          onPointerLeave={() => setDashPressed(false)}
          onContextMenu={e => e.preventDefault()}
        >
          <strong>DASH</strong>
          <span>SHIFT</span>
        </button>
        <button
          type="button"
          className={`bds-action-btn bds-btn-jump ${jumpPressed ? 'is-pressed' : ''}`}
          aria-label="Jump and vault"
          onPointerDown={triggerJump}
          onPointerUp={() => setJumpPressed(false)}
          onPointerCancel={() => setJumpPressed(false)}
          onPointerLeave={() => setJumpPressed(false)}
          onContextMenu={e => e.preventDefault()}
        >
          <strong>JUMP</strong>
          <span>SPACE</span>
        </button>
      </div>
    </div>
  );
}
