'use client';

import type { CSSProperties } from 'react';

/**
 * Roasted-bean glyphs adrift behind the hero and the menu board. Positions,
 * sizes and hues are hand-placed once so the field reads art-directed, and
 * CSS owns the loop — a reduced-motion browser simply gets still beans.
 */
interface Bean {
  x: string;
  y: string;
  s: number;
  op: number;
  fill: string;
  crease: string;
  dur: string;
  delay: string;
  dx: string;
  dy: string;
  r1: string;
  r2: string;
}

const ROAST = ['#8A4B2A', '#462214', '#9A5730', '#F7D08A', '#E4572E'];

const BEANS: Bean[] = [
  { x: '6%', y: '12%', s: 30, op: 0.5, fill: ROAST[0], crease: '#2A211B', dur: '9s', delay: '0s', dx: '18px', dy: '-26px', r1: '-20deg', r2: '14deg' },
  { x: '84%', y: '8%', s: 22, op: 0.42, fill: ROAST[2], crease: '#2A211B', dur: '11s', delay: '-2s', dx: '-22px', dy: '18px', r1: '30deg', r2: '-8deg' },
  { x: '14%', y: '72%', s: 26, op: 0.4, fill: ROAST[1], crease: '#F7D08A', dur: '13s', delay: '-5s', dx: '26px', dy: '-16px', r1: '12deg', r2: '-26deg' },
  { x: '72%', y: '64%', s: 34, op: 0.34, fill: ROAST[0], crease: '#2A211B', dur: '10s', delay: '-1s', dx: '-14px', dy: '-28px', r1: '-34deg', r2: '10deg' },
  { x: '44%', y: '22%', s: 18, op: 0.5, fill: ROAST[3], crease: '#8A4B2A', dur: '12s', delay: '-7s', dx: '16px', dy: '22px', r1: '24deg', r2: '-14deg' },
  { x: '28%', y: '40%', s: 24, op: 0.3, fill: ROAST[1], crease: '#F7D08A', dur: '14s', delay: '-3s', dx: '-24px', dy: '-14px', r1: '6deg', r2: '38deg' },
  { x: '60%', y: '84%', s: 20, op: 0.4, fill: ROAST[2], crease: '#2A211B', dur: '9.5s', delay: '-6s', dx: '20px', dy: '-22px', r1: '-12deg', r2: '22deg' },
  { x: '90%', y: '38%', s: 26, op: 0.36, fill: ROAST[0], crease: '#F7D08A', dur: '11.5s', delay: '-9s', dx: '-18px', dy: '24px', r1: '40deg', r2: '-6deg' },
  { x: '4%', y: '46%', s: 20, op: 0.44, fill: ROAST[4], crease: '#2A211B', dur: '13.5s', delay: '-4s', dx: '22px', dy: '-18px', r1: '-28deg', r2: '16deg' },
  { x: '36%', y: '90%', s: 16, op: 0.5, fill: ROAST[3], crease: '#8A4B2A', dur: '8.5s', delay: '-2.5s', dx: '-16px', dy: '-24px', r1: '18deg', r2: '-30deg' },
  { x: '54%', y: '8%', s: 22, op: 0.32, fill: ROAST[1], crease: '#F7D08A', dur: '12.5s', delay: '-8s', dx: '14px', dy: '26px', r1: '-6deg', r2: '28deg' },
  { x: '78%', y: '26%', s: 16, op: 0.46, fill: ROAST[2], crease: '#2A211B', dur: '10.5s', delay: '-5.5s', dx: '-26px', dy: '14px', r1: '34deg', r2: '-12deg' },
  { x: '20%', y: '18%', s: 18, op: 0.38, fill: ROAST[0], crease: '#F7D08A', dur: '14.5s', delay: '-11s', dx: '18px', dy: '20px', r1: '-40deg', r2: '8deg' },
  { x: '66%', y: '48%', s: 28, op: 0.26, fill: ROAST[1], crease: '#FFFDF8', dur: '15s', delay: '-7.5s', dx: '-20px', dy: '-26px', r1: '10deg', r2: '-34deg' },
  { x: '40%', y: '62%', s: 16, op: 0.42, fill: ROAST[4], crease: '#2A211B', dur: '9s', delay: '-3.5s', dx: '24px', dy: '16px', r1: '-16deg', r2: '26deg' },
  { x: '94%', y: '80%', s: 22, op: 0.34, fill: ROAST[2], crease: '#F7D08A', dur: '11s', delay: '-10s', dx: '-14px', dy: '-20px', r1: '28deg', r2: '-18deg' },
];

export function BeansField({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden className={`bc-beans-field ${className}`}>
      {BEANS.map((b, i) => (
        <svg
          key={i}
          className="bc-bean"
          viewBox="0 0 32 22"
          style={
            {
              '--x': b.x,
              '--y': b.y,
              '--sw': `${b.s}px`,
              '--op': b.op,
              '--dur': b.dur,
              '--delay': b.delay,
              '--dx': b.dx,
              '--dy': b.dy,
              '--r1': b.r1,
              '--r2': b.r2,
            } as CSSProperties
          }
        >
          <ellipse cx="16" cy="11" rx="14" ry="9.5" fill={b.fill} />
          <path d="M4.5 8.5q11.5 7 23 0" fill="none" stroke={b.crease} strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ))}
    </div>
  );
}
