"use client";

import { useReducedMotion } from "motion/react";
import { useMemo } from "react";

interface Meteor {
  left: number;
  top: number;
  delay: number;
  duration: number;
  length: number;
}

function spread(seed: number, count: number): number[] {
  const values: number[] = [];
  let state = seed;
  for (let index = 0; index < count; index += 1) {
    // Deterministic LCG so SSR and client markup agree.
    state = (state * 1103515245 + 12345) % 2147483648;
    values.push(state / 2147483648);
  }
  return values;
}

/** Ambient streaks for showcase surfaces only (login, dashboard, analytics).
 *  Decorative, pointer-transparent, and completely absent under reduced
 *  motion. Count is capped to keep the cost flat. */
export function Meteors({
  count = 14,
  seed = 7,
}: {
  count?: number;
  seed?: number;
}) {
  const reduceMotion = useReducedMotion();
  const meteors = useMemo<Meteor[]>(() => {
    const capped = Math.min(count, 18);
    const rnd = spread(seed, capped * 5);
    return Array.from({ length: capped }, (_, index) => ({
      left: rnd[index] * 100,
      top: rnd[capped + index] * 40,
      delay: rnd[capped * 2 + index] * 6,
      duration: 4.5 + rnd[capped * 3 + index] * 3.5,
      length: 70 + rnd[capped * 4 + index] * 90,
    }));
  }, [count, seed]);

  if (reduceMotion) return null;
  return (
    <div
      aria-hidden
      className="ob-meteors pointer-events-none absolute inset-0 overflow-hidden"
    >
      {meteors.map((meteor, index) => (
        <span
          key={index}
          className="ob-meteor"
          style={{
            left: `${meteor.left}%`,
            top: `${meteor.top}%`,
            animationDelay: `${meteor.delay}s`,
            animationDuration: `${meteor.duration}s`,
            ["--ob-meteor-length" as string]: `${meteor.length}px`,
          }}
        />
      ))}
    </div>
  );
}
