"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { visibleManagerModules } from "@/lib/workspace/manager-modules";

export function ManagerSubnav({ activeHref }: { activeHref: string }) {
  const ws = useWorkspace();
  const tabs = [
    { href: "/manager", label: "Overview" },
    ...visibleManagerModules(ws.hiddenManagerModules),
  ];
  return (
    <div className="-mx-3 mb-4 overflow-x-auto px-3 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 border-b border-[var(--ob-border)] pb-px">
        {tabs.map((tab) => {
          const active = tab.href === activeHref;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "ob-touch-target inline-flex items-center whitespace-nowrap rounded-t-md border-b-2 px-3 text-sm transition-colors",
                active
                  ? "border-[var(--ob-primary)] font-medium text-[var(--ob-text)]"
                  : "border-transparent text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
