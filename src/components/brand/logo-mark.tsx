"use client";

import { motion, useReducedMotion } from "motion/react";

export function LogoMark({ size = 34 }: { size?: number }) {
  const reduceMotion = useReducedMotion();
  const rings = [0, 1, 2];
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
      <span
        className="ob-mark relative grid place-items-center rounded-[30%] font-semibold text-white"
        style={{ width: size, height: size, fontSize: size * 0.34 }}
      >
        OB
      </span>
    </span>
  );
}
