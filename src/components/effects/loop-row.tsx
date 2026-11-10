"use client";

import {
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { motion, useMotionValue, useReducedMotion } from "motion/react";

/**
 * Autoplaying loop row in the spirit of motion.dev's carousel-loop: the
 * track is rendered twice, a rAF ticker scrolls it left at a constant speed
 * and wraps by one copy-width, so the motion is seamless. Hover pauses for
 * reading, drag scrubs back and forth, and reduced motion falls back to a
 * plain horizontal scroller.
 */
export function LoopRow({
  items,
  speed = 28,
  ariaLabel,
  itemClassName,
}: {
  items: ReactNode[];
  /** Pixels per second. */
  speed?: number;
  ariaLabel: string;
  itemClassName?: string;
}) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const copyRef = useRef<HTMLDivElement>(null);
  const state = useRef({ half: 0, paused: false, last: 0, raf: 0 });

  useEffect(() => {
    const copy = copyRef.current;
    if (!copy || reduceMotion) return;
    const measure = () => {
      state.current.half = copy.offsetWidth;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(copy);
    return () => observer.disconnect();
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return;
    const current = state.current;
    const tick = (now: number) => {
      current.raf = requestAnimationFrame(tick);
      const { half, paused } = current;
      const delta = current.last ? (now - current.last) / 1000 : 0;
      current.last = now;
      if (paused || !half) return;
      let next = x.get() - speed * delta;
      if (next <= -half) next += half;
      x.set(next);
    };
    current.raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(current.raf);
      current.raf = 0;
      current.last = 0;
    };
  }, [reduceMotion, speed, x]);

  const copy = (
    <div
      ref={copyRef}
      className="flex w-max shrink-0 gap-4 pr-4"
    >
      {items.map((item, index) => (
        <div
          key={index}
          className={`shrink-0 [&>*]:h-full ${itemClassName ?? ""}`}
        >
          {item}
        </div>
      ))}
    </div>
  );

  if (reduceMotion) {
    return (
      <section aria-label={ariaLabel} className="ob-scroll-x">
        {copy}
      </section>
    );
  }

  return (
    <section
      aria-label={ariaLabel}
      className="relative overflow-hidden"
      onMouseEnter={() => {
        state.current.paused = true;
      }}
      onMouseLeave={() => {
        state.current.paused = false;
        state.current.last = 0;
      }}
    >
      <motion.div
        style={{ x }}
        drag="x"
        dragElastic={0}
        dragMomentum={false}
        onDragStart={() => {
          state.current.paused = true;
        }}
        onDragEnd={() => {
          const { half } = state.current;
          if (half) {
            let value = x.get() % half;
            if (value > 0) value -= half;
            x.set(value);
          }
          state.current.paused = false;
          state.current.last = 0;
        }}
        className="flex cursor-grab touch-pan-y select-none active:cursor-grabbing"
      >
        {copy}
        <div aria-hidden className="pointer-events-none flex w-max shrink-0 gap-4 pr-4">
          {items.map((item, index) => (
            <div
              key={index}
              className={`shrink-0 [&>*]:h-full ${itemClassName ?? ""}`}
            >
              {item}
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
