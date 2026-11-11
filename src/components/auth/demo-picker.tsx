"use client";

import { useState } from "react";
import { Coffee, Armchair, ArrowRight } from "lucide-react";
import { enterDemoWorkspace } from "@/lib/auth/demo";
import { LogoMark } from "@/components/brand/logo-mark";
import { Meteors } from "@/components/effects/meteors";
import type { DemoBrandCode } from "@/lib/workspace/constants";

const BRANDS: {
  code: DemoBrandCode;
  name: string;
  tagline: string;
  Icon: typeof Coffee;
}[] = [
  {
    code: "BR-1",
    name: "Brewery Cafe",
    tagline: "Coffee bar & kitchen — POS, billing, kitchen board, analytics",
    Icon: Coffee,
  },
  {
    code: "BR-2",
    name: "Cubig Furniture",
    tagline: "Furniture studio — quotations, deliveries, installations",
    Icon: Armchair,
  },
];

export function DemoPicker() {
  const [pending, setPending] = useState<DemoBrandCode | null>(null);

  async function enter(code: DemoBrandCode) {
    setPending(code);
    await enterDemoWorkspace(code);
  }

  return (
    <div className="ob-workspace relative min-h-[100dvh] overflow-hidden">
      <Meteors count={10} seed={11} />
      <div className="relative z-[1] mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-8 ob-safe-top ob-safe-bottom sm:py-12">
        <div className="ob-card p-6 sm:p-8">
          <LogoMark size={52} spin />
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ob-text-muted)]">
            WebsiteIn
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            OrderBook
          </h1>
          <p className="mt-2 text-sm text-[var(--ob-text-secondary)]">
            Pick a demo business to explore the full workspace — no sign-up
            needed.
          </p>
          <div className="mt-8 space-y-3">
            {BRANDS.map(({ code, name, tagline, Icon }) => (
              <button
                key={code}
                type="button"
                onClick={() => enter(code)}
                disabled={pending !== null}
                className="ob-card flex w-full items-center gap-4 p-4 text-left transition hover:border-[var(--ob-primary)] disabled:opacity-60"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--ob-surface-muted)] text-[var(--ob-primary)]">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-base font-semibold">
                    {name}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--ob-text-secondary)]">
                    {tagline}
                  </span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-[var(--ob-text-muted)]"
                  aria-hidden
                />
              </button>
            ))}
          </div>
          <p className="mt-6 text-xs text-[var(--ob-text-muted)]">
            Demo data resets per browser. Your edits stay on this device.
          </p>
        </div>
      </div>
    </div>
  );
}