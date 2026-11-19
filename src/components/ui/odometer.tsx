"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { formatOdometer, type OdometerFormat } from "@/lib/format";
import { useMounted } from "@/lib/use-mounted";

export type { OdometerFormat };

type OdometerProps = {
  value: number;
  format: OdometerFormat;
  decimals?: number;
  duration?: number;
  /** Final formatted string; rendered during SSR and reduced motion. */
  children?: ReactNode;
};

/** The shared roll. Holds at zero while `active` is false, then eases to
 *  `value` once. Reduced motion and SSR render the final string instead. */
function OdometerRoll({
  value,
  format,
  decimals = 0,
  duration = 0.9,
  children,
  active,
  spanRef,
}: OdometerProps & {
  /** Whether the roll may run yet — mount-time callers pass a constant. */
  active: boolean;
  /** The rendered node, observed by the in-view variant. */
  spanRef?: RefObject<HTMLSpanElement | null>;
}) {
  const reduceMotion = useReducedMotion();
  const mv = useMotionValue(0);
  const mounted = useMounted();
  const display = useTransform(mv, (latest) =>
    formatOdometer(latest, format, decimals),
  );

  useEffect(() => {
    if (!mounted || !active) return;
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
  }, [mounted, active, reduceMotion, value, duration, mv]);

  if (!mounted || reduceMotion) {
    return (
      <span ref={spanRef}>{children ?? formatOdometer(value, format, decimals)}</span>
    );
  }
  return <motion.span ref={spanRef}>{display}</motion.span>;
}

/** Sits at zero until the number scrolls into view, then rolls once — the
 *  Ember Larder counter. `once: true` keeps later value updates rolling from
 *  the displayed number rather than replaying from zero. */
function OdometerInView(props: OdometerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // Only the bottom edge is inset, so a counter above the fold still starts on
  // load and one below it starts as it clears the fold instead of at the last pixel.
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  return <OdometerRoll {...props} active={inView} spanRef={ref} />;
}

/** Rolls from the previously displayed value to the current one; the first
 *  roll starts at zero like the Aceternity stats ticker. Reduced motion and
 *  SSR render the final value directly. */
export function Odometer({
  whenInView = false,
  ...props
}: OdometerProps & {
  /** Opt in to the scroll-triggered roll. Defaults to false, so existing
   *  callers keep the mount-time roll and create no IntersectionObserver. */
  whenInView?: boolean;
}) {
  if (whenInView) {
    return <OdometerInView {...props} />;
  }
  return <OdometerRoll {...props} active />;
}
