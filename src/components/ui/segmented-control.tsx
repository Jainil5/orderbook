"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
  label: string;
}) {
  const reduceMotion = useReducedMotion();
  /* Scoped to the instance, not the accessible label: two controls on one
     page can share a label, and a duplicated layoutId makes Motion drop the
     pill from all but one of them. */
  const groupId = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-full border border-[var(--ob-line)] bg-[var(--ob-tint-wash)] p-1"
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              "ob-press relative rounded-full px-3 py-1.5 text-[13px] font-semibold",
              selected
                ? "text-[var(--ob-leaf-ink)]"
                : "text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`ob-segment-active-${groupId}`}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 34, mass: 0.7 }
                }
                className="absolute inset-0 rounded-full bg-[var(--ob-leaf)]"
                aria-hidden
              />
            ) : null}
            <span className="relative z-[1]">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
