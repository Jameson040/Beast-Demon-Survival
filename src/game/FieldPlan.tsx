import { useEffect, useRef } from 'react';
import type { GameEngine } from './engine';
import { REFERENCE, REFERENCE_LANDMARKS, REFERENCE_TITANS, worldToPlan } from './scene';

interface FieldPlanProps {
  engine: GameEngine;
  onClose: () => void;
}

export default function FieldPlan({ engine, onClose }: FieldPlanProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => previous?.focus();
  }, []);

  const player = worldToPlan(engine.player);
  const fallen = new Set(engine.titans.filter(titan => titan.state !== 'stand').map(titan => titan.sourceId));
  const wallPath = engine.wallSegments.map(segment => {
    const a = worldToPlan(segment.a);
    const b = worldToPlan(segment.b);
    return `M${a.x},${a.y} L${b.x},${b.y}`;
  }).join(' ');
  const defensePath = [-1, 1].map(side => REFERENCE_TITANS
    .filter(titan => Math.sign(titan.x - REFERENCE.boss.x) === side)
    .map((titan, i) => `${i ? 'L' : 'M'}${titan.x},${titan.y}`).join(' ')).join(' ');

  return (
    <div className="field-plan-overlay" role="dialog" aria-modal="true" aria-labelledby="field-plan-title">
      <section className="field-plan">
        <header className="field-plan-header">
          <div>
            <p className="field-plan-eyebrow">SURVEY CORPS / FIELD BRIEFING</p>
            <h2 id="field-plan-title">The Charge</h2>
          </div>
          <button ref={closeRef} className="plan-close" onClick={onClose} aria-label="Close field plan">
            BACK <span>ESC / TAB</span>
          </button>
        </header>

        <p className="field-plan-intro">Through the gate. Straight to the Beast. Watch both flanks.</p>

        <svg className="field-plan-map" viewBox="-57 -82 226 173" role="img" aria-labelledby="plan-map-title plan-map-description">
          <title id="plan-map-title">Gate-to-Beast battlefield layout</title>
          <desc id="plan-map-description">
            A curved city wall surrounds the starting district to the south. A straight northbound
            route connects the gate and the Beast. Eighteen Titans form a deep curved defense at the
            far end, with a central gap. Pines, houses, ruins, watchtowers, and boulders follow the reference plan.
          </desc>
          <defs>
            <pattern id="plan-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0 H0 V20" fill="none" stroke="#776e54" strokeWidth="0.15" opacity="0.3" />
            </pattern>
            <marker id="plan-route-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
              <path d="M0 0 L5 2.5 L0 5" fill="none" stroke="#405b3e" strokeWidth="0.8" />
            </marker>
          </defs>
          <rect x="-57" y="-82" width="226" height="173" fill="url(#plan-grid)" />
          <path d={defensePath} fill="none" stroke="#963f32" strokeWidth="0.4" strokeDasharray="1.4 2" opacity="0.4" />
          <path d={wallPath} fill="none" stroke="#6c6657" strokeWidth="3" strokeLinecap="butt" />
          <path d={wallPath} fill="none" stroke="#e2d5b5" strokeWidth="0.65" />

          {REFERENCE_LANDMARKS.map(item => (
            <g key={item.id} transform={`translate(${item.x} ${item.y})`}>
              <title>{item.kind}</title>
              {item.kind === 'pine' ? (
                <g fill="#52684b" stroke="#354b34" strokeWidth="0.25">
                  <path d="M0 -3.6 L-2.2 1 H2.2 Z M0 -1.5 L-2.8 2.5 H2.8 Z" />
                  <path d="M0 2 V3.5" fill="none" strokeWidth="0.65" />
                </g>
              ) : item.kind === 'shrub' ? (
                <circle r="0.9" fill="#758461" opacity="0.7" />
              ) : item.kind === 'rock' ? (
                <path d="M-1.8 1 L-1.4 -1.2 L0.5 -1.8 L2 -0.2 L1.5 1.4 Z" fill="#8b8270" stroke="#645f52" strokeWidth="0.3" />
              ) : item.kind === 'tower' ? (
                <g fill="#8c7b5e" stroke="#554b3c" strokeWidth="0.4">
                  <rect x="-1.5" y="-1.5" width="3" height="3" />
                  <path d="M-2 -1.7 V-2.6 M0 -1.7 V-2.6 M2 -1.7 V-2.6" fill="none" />
                </g>
              ) : item.kind === 'ruin' ? (
                <path d="M-2.5 1.6 V-1.5 H-0.6 M0.7 -1.5 H2.5 V1.6 H0.5" fill="none" stroke="#99876c" strokeWidth="0.8" />
              ) : (
                <g fill={item.kind === 'hall' ? '#916447' : '#a47b56'} stroke="#72583e" strokeWidth="0.25">
                  <rect x={item.kind === 'hall' ? -3.8 : -2} y="-1.6" width={item.kind === 'hall' ? 7.6 : 4} height="3.2" />
                  <path d={item.kind === 'hall' ? 'M-3.8 0 H3.8' : 'M-2 0 H2'} fill="none" />
                </g>
              )}
            </g>
          ))}

          <path d="M52 71 V-53" fill="none" stroke="#405b3e" strokeWidth="0.65" strokeDasharray="2 2.5" markerEnd="url(#plan-route-arrow)" />
          {REFERENCE_TITANS.map(titan => (
            <g key={titan.id} transform={`translate(${titan.x} ${titan.y})`} opacity={fallen.has(titan.id) ? 0.28 : 1}>
              <title>{`Titan ${titan.number}${fallen.has(titan.id) ? ' (fallen)' : ''}`}</title>
              <circle r="2.05" fill="#d2b99a" stroke="#8c3e32" strokeWidth="0.5" />
              <path d="M0 -3.7 L-0.9 -2.5 H0.9 Z" fill="#8c3e32" transform={`rotate(${titan.rotationDeg + 90})`} />
            </g>
          ))}
          <g transform={`translate(${REFERENCE.boss.x} ${REFERENCE.boss.y})`}>
            <path d="M0 -4 L4 0 L0 4 L-4 0 Z" fill="#79362e" />
            <path d="M-1.8 0 H1.8 M0 -1.8 V1.8" fill="none" stroke="#eddbb8" strokeWidth="0.6" />
          </g>
          <text x="66" y="-66" className="plan-label plan-threat-label">THE BEAST</text>
          <text x="52" y="-76" textAnchor="middle" className="plan-small-label">18 TITANS / CURVED DEFENSE</text>
          <g transform="translate(52 76)" fill="#5e584a">
            <rect x="-5" y="-1.5" width="2.3" height="3" />
            <rect x="2.7" y="-1.5" width="2.3" height="3" />
          </g>
          <text x="52" y="85" textAnchor="middle" className="plan-label">GATE / START</text>
          <text x="-25" y="60" className="plan-small-label" transform="rotate(24 -25 60)">CITY WALL</text>
          <text x="94" y="47" className="plan-small-label">DISTRICT</text>
          <g transform={`translate(${player.x} ${player.y})`}>
            <circle r="4" fill="#355c3b" opacity="0.15" className="plan-player-pulse" />
            <path d="M0 -3 L2 2 L0 1 L-2 2 Z" fill="#214f32" stroke="#f2e3c0" strokeWidth="0.4" />
          </g>
          <g transform="translate(-46 -68)" stroke="#615943" fill="#615943">
            <path d="M0 8 V-1 M-2 1 L0 -2 L2 1" fill="none" strokeWidth="0.5" />
            <text y="-5" textAnchor="middle" className="plan-small-label">N</text>
          </g>
        </svg>

        <footer className="field-plan-footer">
          <div className="plan-legend">
            <span><i className="legend-rider" /> You</span>
            <span><i className="legend-threat" /> Titans</span>
            <span><i className="legend-stone" /> Boulders</span>
            <span><i className="legend-wall" /> City wall</span>
          </div>
          <p>Placement schematic, not an asset-size specification. Existing 1,500 m charge preserved.</p>
        </footer>
      </section>
    </div>
  );
}