"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { visibleManagerModules } from "@/lib/workspace/manager-modules";

export function ManagerSubnav({ activeHref }: { activeHref: string }) {
  const ws = useWorkspace();
  const reduceMotion = useReducedMotion();
  const tabs = [
    { href: "/manager", label: "Overview" },
    ...visibleManagerModules(ws.hiddenManagerModules),
  ];
  return (
    <nav
      aria-label="Management"
      className="ob-scroll-x mb-4 flex gap-1 rounded-full border border-[var(--ob-line)] bg-[var(--ob-tint-wash)] p-1"
    >
      {tabs.map((tab) => {
        const active = tab.href === activeHref;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "ob-press relative shrink-0 snap-start rounded-full px-4 py-2 text-[15px] font-semibold",
              active
                ? "text-[var(--ob-leaf-ink)]"
                : "text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]",
            )}
          >
            {active ? (
              <motion.span
                layoutId="ob-manager-tab-active"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 34, mass: 0.7 }
                }
                className="absolute inset-0 rounded-full bg-[var(--ob-leaf)]"
                aria-hidden
              />
            ) : null}
            <span className="relative z-[1] whitespace-nowrap">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
