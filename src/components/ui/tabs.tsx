"use client";

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
  return (
    <div
      role="tablist"
      aria-label={label}
      className="ob-scroll-x flex gap-1 border-b border-[var(--ob-border)] pb-px"
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
              "ob-press relative -mb-px shrink-0 snap-start px-3 py-2.5 text-sm font-medium sm:min-h-[2.75rem] sm:px-4",
              selected
                ? "text-[var(--ob-primary)]"
                : "text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]",
            )}
          >
            {option.label}
            {selected ? (
              <motion.span
                layoutId={`ob-tab-active-${label}`}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 500, damping: 38 }
                }
                className="absolute inset-x-2 bottom-0 h-[3px] rounded-full bg-[var(--ob-primary)]"
                aria-hidden
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
