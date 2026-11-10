"use client";

import { useEffect, type ReactNode } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { formatOdometer, type OdometerFormat } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";

export type { OdometerFormat };

/** Rolls from the previously displayed value to the current one; the first
 *  roll starts at zero like the Aceternity stats ticker. Reduced motion and
 *  SSR render the final value directly. */
export function Odometer({
  value,
  format,
  decimals = 0,
  duration = 0.9,
  children,
}: {
  value: number;
  format: OdometerFormat;
  decimals?: number;
  duration?: number;
  /** Final formatted string; rendered during SSR and reduced motion. */
  children?: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const mv = useMotionValue(0);
  const mounted = useMounted();
  const display = useTransform(mv, (latest) =>
    formatOdometer(latest, format, decimals),
  );

  useEffect(() => {
    if (!mounted) return;
    if (reduceMotion || duration <= 0) {
      mv.set(value);
      return;
    }
    const controls = animate(
      mv,
      value,
      // Same ease-out as the ob-* CSS curves.
      { duration, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
    );
    return () => controls.stop();
  }, [mounted, reduceMotion, value, duration, mv]);

  if (!mounted || reduceMotion) {
    return <span>{children ?? formatOdometer(value, format, decimals)}</span>;
  }
  return <motion.span>{display}</motion.span>;
}
