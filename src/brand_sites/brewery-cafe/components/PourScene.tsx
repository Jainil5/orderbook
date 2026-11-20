'use client';

import { useCallback, useRef } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactElement } from 'react';

/** Tumbler silhouette, shared by every plate so the stack reads as one object. */
const OUTER = 'M56 98 L65 208 Q100 222 135 208 L144 98 Z';
const INNER = 'M61 103 L69.5 204 Q100 216.5 130.5 204 L139 103 Z';

/** Sequenced plates take their slot in the 9s loop from this index. */
const step = (k: number) => ({ '--k': k }) as CSSProperties;

interface Plate {
  key: string;
  /** Depth in the stack, in px of translateZ. */
  lz: string;
  /** Entrance delay, so the object assembles front-to-back. */
  d: string;
  body: ReactElement;
}

const PLATES: Plate[] = [
  {
    key: 'halo',
    lz: '-60px',
    d: '0ms',
    body: (
      <>
        <defs>
          <radialGradient id="dcPourHalo" cx="50%" cy="55%" r="55%">
            <stop offset="0%" stopColor="#F7D08A" stopOpacity="0.72" />
            <stop offset="46%" stopColor="#E4572E" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#E4572E" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle className="bc-pour-halo" cx="100" cy="134" r="86" fill="url(#dcPourHalo)" />
      </>
    ),
  },
  {
    key: 'glass-back',
    lz: '0px',
    d: '90ms',
    body: (
      <>
        <defs>
          <linearGradient id="dcPourMilk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFF9EE" />
            <stop offset="56%" stopColor="#F3E7D2" />
            <stop offset="100%" stopColor="#E2D0B4" />
          </linearGradient>
          {/* Cylinder shading: the milk darkens at both walls and catches light left of centre. */}
          <linearGradient id="dcPourShade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#2A211B" stopOpacity="0.18" />
            <stop offset="16%" stopColor="#2A211B" stopOpacity="0" />
            <stop offset="34%" stopColor="#FFFDF8" stopOpacity="0.34" />
            <stop offset="62%" stopColor="#FFFDF8" stopOpacity="0" />
            <stop offset="100%" stopColor="#2A211B" stopOpacity="0.14" />
          </linearGradient>
          <linearGradient id="dcPourGlass" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#FFFDF8" stopOpacity="0.3" />
            <stop offset="46%" stopColor="#FFFDF8" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#FFFDF8" stopOpacity="0.26" />
          </linearGradient>
          <clipPath id="dcPourInnerBack">
            <path d={INNER} />
          </clipPath>
        </defs>
        <path d={OUTER} fill="url(#dcPourGlass)" />
        <g clipPath="url(#dcPourInnerBack)">
          <g className="bc-pour-level">
            <rect x="50" y="130" width="100" height="92" fill="url(#dcPourMilk)" />
            <rect x="50" y="130" width="100" height="92" fill="url(#dcPourShade)" />
            <ellipse cx="100" cy="130" rx="36" ry="7.6" fill="#FFF6E6" opacity="0.9" />
          </g>
        </g>
        <ellipse cx="100" cy="210" rx="33" ry="6.6" fill="#2A211B" opacity="0.1" />
      </>
    ),
  },
  {
    key: 'stream',
    lz: '14px',
    d: '190ms',
    body: (
      <>
        <defs>
          {/* Fades out at the top so the shot enters the frame instead of a drawn group head. */}
          <linearGradient id="dcPourShot" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8A4B2A" stopOpacity="0" />
            <stop offset="22%" stopColor="#9A5730" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#462214" />
          </linearGradient>
        </defs>
        <g stroke="url(#dcPourShot)" strokeWidth={2.9} strokeLinecap="round" fill="none">
          <path className="bc-pour-stream" style={step(0)} pathLength={100} d="M94 12c3 32-3 66 5 112" />
          <path className="bc-pour-stream" style={step(1)} pathLength={100} d="M106 12c-3 32 3 66-5 112" />
        </g>
        <path
          className="bc-pour-stream"
          style={step(2)}
          pathLength={100}
          d="M95 18c3 28-3 58 4 94"
          stroke="#E0AE7C"
          strokeWidth={1.1}
          strokeLinecap="round"
          fill="none"
          opacity={0.8}
        />
      </>
    ),
  },
  {
    key: 'crema',
    lz: '26px',
    d: '280ms',
    body: (
      <>
        <defs>
          <radialGradient id="dcPourCrema" cx="48%" cy="42%" r="58%">
            <stop offset="0%" stopColor="#EDC188" />
            <stop offset="52%" stopColor="#C07A45" />
            <stop offset="100%" stopColor="#8A4B2A" stopOpacity="0.5" />
          </radialGradient>
          <clipPath id="dcPourInnerCrema">
            <path d={INNER} />
          </clipPath>
        </defs>
        <g clipPath="url(#dcPourInnerCrema)">
          <g className="bc-pour-level">
            <ellipse
              className="bc-pour-plume"
              style={step(0)}
              cx="85"
              cy="139"
              rx="18"
              ry="5"
              fill="#9B6236"
            />
            <ellipse
              className="bc-pour-plume"
              style={step(1)}
              cx="116"
              cy="146"
              rx="15"
              ry="4.5"
              fill="#8A5230"
            />
            <ellipse
              className="bc-pour-plume"
              style={step(2)}
              cx="100"
              cy="155"
              rx="21"
              ry="5.5"
              fill="#8F5A32"
            />
            <ellipse
              className="bc-pour-crema"
              cx="100"
              cy="130"
              rx="30"
              ry="8"
              fill="url(#dcPourCrema)"
            />
            <ellipse
              className="bc-pour-ripple"
              style={step(0)}
              cx="99"
              cy="130"
              rx="14"
              ry="4"
              fill="none"
              stroke="#F7D08A"
              strokeWidth={1.6}
            />
            <ellipse
              className="bc-pour-ripple"
              style={step(1)}
              cx="101"
              cy="131"
              rx="14"
              ry="4"
              fill="none"
              stroke="#FFFDF8"
              strokeWidth={1.2}
            />
            <ellipse
              className="bc-pour-ripple"
              style={step(2)}
              cx="100"
              cy="130"
              rx="13"
              ry="3.6"
              fill="none"
              stroke="#E8B87C"
              strokeWidth={1.2}
            />
          </g>
        </g>
      </>
    ),
  },
  {
    key: 'glass-front',
    lz: '52px',
    d: '380ms',
    body: (
      <>
        <path d={OUTER} fill="none" stroke="rgba(255,253,248,0.55)" strokeWidth={1.8} />
        <ellipse
          cx="100"
          cy="98"
          rx="44"
          ry="10.5"
          fill="none"
          stroke="rgba(255,253,248,0.7)"
          strokeWidth={1.8}
        />
        <path d={OUTER} fill="none" stroke="rgba(42,33,27,0.14)" strokeWidth={1} />
        <path
          className="bc-pour-shine"
          style={step(0)}
          d="M70 114 L77 196"
          stroke="#FFFDF8"
          strokeWidth={3.4}
          strokeLinecap="round"
        />
        <path
          className="bc-pour-shine"
          style={step(1)}
          d="M132 118 L127 190"
          stroke="#FFFDF8"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    key: 'steam',
    lz: '70px',
    d: '470ms',
    body: (
      <g fill="none" stroke="#FFFDF8" strokeWidth={2} strokeLinecap="round">
        <path className="bc-pour-steam" style={step(0)} d="M72 96c-7-16 5-26-2-42" opacity={0} />
        <path className="bc-pour-steam" style={step(1)} d="M128 94c7-17-5-27 2-44" opacity={0} />
        <path className="bc-pour-steam" style={step(2)} d="M100 92c-6-14 4-24-1-38" opacity={0} />
      </g>
    ),
  },
];

interface PourSceneProps {
  /** Positions and sizes the scene, e.g. 'bc-pour-anchor'. */
  className?: string;
}

/**
 * A glass of milk with a shot pulled into it, built as six SVG plates seated
 * at real depths and sharing one 9s timeline so the pour, the crema spreading,
 * the plumes drifting and the steam stay in step. CSS owns every loop, so a
 * reduced-motion browser gets the finished glass with the shot still in it.
 */
export function PourScene({ className = '' }: PourSceneProps) {
  const stage = useRef<HTMLDivElement>(null);

  const lean = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const el = stage.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = (event.clientX - rect.left) / rect.width - 0.5;
    const dy = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty('--gy', `${(dx * 26).toFixed(1)}`);
    el.style.setProperty('--gx', `${(dy * -13).toFixed(1)}`);
  }, []);

  const settle = useCallback(() => {
    const el = stage.current;
    if (!el) return;
    el.style.removeProperty('--gy');
    el.style.removeProperty('--gx');
  }, []);

  return (
    <div
      aria-label="Espresso pouring into a glass of milk"
      role="img"
      onPointerMove={lean}
      onPointerLeave={settle}
      className={`bc-pour-scene ${className}`}
    >
      <div ref={stage} className="bc-pour-stage">
        <div className="bc-pour-idle">
          {PLATES.map((plate) => (
            <div key={plate.key} className="bc-pour-plate" style={{ '--lz': plate.lz, '--d': plate.d } as CSSProperties}>
              <svg viewBox="0 0 200 260" fill="none" aria-hidden="true">
                {plate.body}
              </svg>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
