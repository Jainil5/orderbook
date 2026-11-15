"use client";

import { useId } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

export function Tabs<T extends string>({
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
  /* Instance-scoped: a duplicated layoutId makes Motion render the pill in
     only one of the colliding controls. */
  const groupId = useId();
  return (
    <div
      role="tablist"
      aria-label={label}
      className="ob-scroll-x flex gap-1 rounded-full border border-[var(--ob-line)] bg-[var(--ob-tint-wash)] p-1"
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              "ob-press relative shrink-0 snap-start rounded-full px-4 py-2 text-[15px] font-semibold",
              selected
                ? "text-[var(--ob-leaf-ink)]"
                : "text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`ob-tab-active-${groupId}`}
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
