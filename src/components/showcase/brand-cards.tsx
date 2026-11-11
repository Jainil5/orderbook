"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckList } from "@/components/showcase/check-list";
import { BRAND_CARD_COPY } from "@/components/showcase/content";
import {
  SHOWCASE_CHILD,
  SHOWCASE_CONTAINER,
} from "@/components/showcase/motion";
import { enterDemoWorkspace } from "@/lib/auth/demo";
import type { DemoBrandSummary } from "@/lib/demo/showcase-stats";
import type { DemoBrandCode } from "@/lib/workspace/constants";

/**
 * The two demo businesses, sized so the figures and the in-demo actions are
 * readable without squinting. Counts come from the seeded CSV packs, so what a
 * visitor reads here is what the workspace actually holds.
 */
export function BrandCards({
  summaries,
  id = "demos",
  title = "Two live businesses, ready to poke at",
  intro = "Demos are full workspaces — create orders, capture payments, move through the kitchen screen. Nothing is saved to your account.",
}: {
  summaries: DemoBrandSummary[];
  id?: string;
  title?: string;
  intro?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [pending, setPending] = useState<DemoBrandCode | null>(null);
  const reveal = { once: true, margin: "-60px" } as const;

  async function enter(code: DemoBrandCode) {
    setPending(code);
    await enterDemoWorkspace(code);
  }

  return (
    <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
      <motion.h2
        variants={SHOWCASE_CHILD}
        initial={reduceMotion ? "show" : "hidden"}
        whileInView="show"
        viewport={reveal}
        className="font-display text-2xl font-semibold tracking-tight sm:text-3xl"
      >
        {title}
      </motion.h2>
      <motion.p
        variants={SHOWCASE_CHILD}
        initial={reduceMotion ? "show" : "hidden"}
        whileInView="show"
        viewport={reveal}
        className="mt-2 max-w-2xl text-sm text-[var(--ob-text-secondary)]"
      >
        {intro}
      </motion.p>
      <motion.div
        variants={SHOWCASE_CONTAINER}
        initial={reduceMotion ? "show" : "hidden"}
        whileInView="show"
        viewport={reveal}
        className="mt-8 grid gap-5 lg:grid-cols-2"
      >
        {summaries.map((summary) => {
          const copy = BRAND_CARD_COPY[summary.code];
          const Icon = copy.icon;
          return (
            <motion.div key={summary.code} variants={SHOWCASE_CHILD}>
              <Card className="flex h-full flex-col p-6 sm:p-7">
                <div className="flex items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-[var(--ob-radius-lg)] bg-[color-mix(in_srgb,var(--ob-primary)_14%,transparent)] text-[var(--ob-primary)]">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-xl font-semibold tracking-tight">
                      {copy.name}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--ob-text-secondary)]">
                      {copy.tagline}
                    </p>
                  </div>
                  <Badge tone="demo">{summary.code}</Badge>
                </div>

                <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Bills", value: summary.bills },
                    { label: "Products", value: summary.products },
                    { label: "Customers", value: summary.customers },
                    { label: "Staff", value: summary.staff },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-[var(--ob-radius-md)] bg-[var(--ob-surface-muted)] px-3 py-2.5"
                    >
                      <dt className="text-[11px] uppercase tracking-wide text-[var(--ob-text-muted)]">
                        {stat.label}
                      </dt>
                      <dd className="mt-0.5 font-display text-xl font-semibold">
                        {stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-[var(--ob-text-muted)]">
                  {summary.historyMonths} months of trading history, rebased so
                  the newest bill is today.
                </p>

                <div className="mt-6 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
                    Inside this demo
                  </p>
                  <CheckList className="mt-3" items={copy.highlights} />
                </div>

                <Button
                  variant="secondary"
                  onClick={() => enter(summary.code)}
                  disabled={pending !== null}
                  loading={pending === summary.code}
                  className="mt-6 min-h-[2.75rem] w-full"
                >
                  Open {copy.name} demo
                </Button>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}
