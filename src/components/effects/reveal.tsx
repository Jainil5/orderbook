"use client";

import { type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Fades and rises its children the first time they scroll into view — the
 * workspace counterpart of the brand-site section reveal, and the sibling of
 * the CSS `.ob-stagger` entrance (use one per node, never both).
 *
 * Reduced motion renders the children as a plain box, so nothing can be
 * stranded at `opacity: 0` by a browser that never fires the observer.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** Seconds; lets a reveal line up with a neighbouring stagger delay. */
  delay?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }
  // The root margin insets the bottom edge only, so a block already on screen
  // reveals on load and one below it reveals as it clears the fold.
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
