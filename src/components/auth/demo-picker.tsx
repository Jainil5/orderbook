"use client";

import { useState } from "react";
import { Coffee, Armchair, ArrowRight } from "lucide-react";
import { enterDemoWorkspace } from "@/lib/auth/demo";
import { LogoMark } from "@/components/brand/logo-mark";
import { Meteors } from "@/components/effects/meteors";
import { DemoShowcase } from "@/components/auth/demo-showcase";
import type { DemoShowcaseStats } from "@/lib/demo/showcase-stats";
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

export function DemoPicker({ showcase }: { showcase: DemoShowcaseStats }) {
  const [pending, setPending] = useState<DemoBrandCode | null>(null);

  async function enter(code: DemoBrandCode) {
    setPending(code);
    await enterDemoWorkspace(code);
  }

  return (
    <div className="ob-workspace relative min-h-[100dvh] overflow-hidden">
      <Meteors count={10} seed={11} />
      <div className="relative z-[1] mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col justify-center gap-7 px-4 py-10 ob-safe-top ob-safe-bottom sm:py-14">
        <header className="text-center">
          <LogoMark size={52} spin />
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ob-text-muted)]">
            WebsiteIn
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            OrderBook
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ob-text-secondary)]">
            Two live businesses running on one workspace — billing, kitchen,
            deliveries and analytics. No sign-up needed.
          </p>
        </header>

        <DemoShowcase stats={showcase} />

        <div className="ob-card p-5 sm:p-6">
          <h2 className="font-display text-base font-semibold">
            Choose a demo business
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {BRANDS.map(({ code, name, tagline, Icon }) => (
              <button
                key={code}
                type="button"
                onClick={() => enter(code)}
                disabled={pending !== null}
                className="ob-card flex w-full min-h-[44px] items-center gap-4 p-4 text-left transition hover:border-[var(--ob-primary)] disabled:opacity-60"
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
          <p className="mt-5 text-xs text-[var(--ob-text-muted)]">
            Demo data resets per browser. Your edits stay on this device.
          </p>
        </div>
      </div>
    </div>
  );
}
