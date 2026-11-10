"use client";

import { motion, useReducedMotion } from "motion/react";

export function LogoMark({
  size = 34,
  spin = false,
}: {
  size?: number;
  /** Slow continuous rotation for showcase surfaces (hero, login, landing nav). */
  spin?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const rings = [0, 1, 2];
  const mark = (
    <span
      className="ob-mark relative grid place-items-center rounded-[30%] text-white"
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.52}
        height={size * 0.52}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 7v14" />
        <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
      </svg>
    </span>
  );

  if (spin) {
    return (
      <span
        className="relative inline-grid shrink-0 place-items-center"
        style={{ width: size, height: size }}
        aria-hidden
      >
        <motion.span
          className="block"
          animate={reduceMotion ? undefined : { rotate: 360 }}
          transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
        >
          {mark}
        </motion.span>
      </span>
    );
  }

  return (
    <span
      className="relative inline-grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {!reduceMotion
        ? rings.map((index) => (
            <motion.span
              key={index}
              className="absolute inset-0 rounded-[30%] border-[1.5px] border-[var(--ob-accent)]"
              initial={{ scale: 1, opacity: 0.55 }}
              animate={{ scale: 2.05, opacity: 0 }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeOut",
                delay: index,
              }}
            />
          ))
        : null}
      {mark}
    </span>
  );
}
