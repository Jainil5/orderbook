"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
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
      <motion.p
        variants={SHOWCASE_CHILD}
        initial={reduceMotion ? "show" : "hidden"}
        whileInView="show"
        viewport={reveal}
        className="ob-sec-label"
      >
        03 / Live demos
      </motion.p>
      <motion.h2
        variants={SHOWCASE_CHILD}
        initial={reduceMotion ? "show" : "hidden"}
        whileInView="show"
        viewport={reveal}
        className="ob-h2-cap mt-5 font-display font-extrabold"
        style={{
          fontSize: "var(--fs-h2)",
          lineHeight: 1.02,
          letterSpacing: "-0.025em",
        }}
      >
        {title}
      </motion.h2>
      <motion.p
        variants={SHOWCASE_CHILD}
        initial={reduceMotion ? "show" : "hidden"}
        whileInView="show"
        viewport={reveal}
        className="ob-lead mt-4"
      >
        {intro}
      </motion.p>
      <motion.div
        variants={SHOWCASE_CONTAINER}
        initial={reduceMotion ? "show" : "hidden"}
        whileInView="show"
        viewport={reveal}
        className="mt-10 grid gap-5 lg:grid-cols-2"
      >
        {summaries.map((summary) => {
          const copy = BRAND_CARD_COPY[summary.code];
          const Icon = copy.icon;
          return (
            <motion.div key={summary.code} variants={SHOWCASE_CHILD}>
              <Card className="ob-glare flex h-full flex-col p-6 sm:p-7">
                <div className="flex items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-[var(--ob-radius-md)] bg-[var(--ob-tint-badge)] text-[var(--ob-leaf)]">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3
                      className="font-display text-[25px] font-semibold"
                      style={{ letterSpacing: "-0.02em", lineHeight: 1.1 }}
                    >
                      {copy.name}
                    </h3>
                    <p className="mt-1 text-[15px] leading-relaxed text-[var(--ob-text-secondary)]">
                      {copy.tagline}
                    </p>
                  </div>
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
                      className="rounded-full bg-[var(--ob-tint-wash)] px-3.5 py-2"
                    >
                      <dt className="ob-label-quiet">{stat.label}</dt>
                      <dd className="ob-num mt-0.5 text-[19px] leading-none">
                        {stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="ob-fineprint mt-3">
                  {summary.historyMonths} months of trading history, rebased so
                  the newest bill is today.
                </p>

                <div className="mt-6 flex-1">
                  <p className="ob-label">Inside this demo</p>
                  <CheckList className="mt-3" items={copy.highlights} />
                </div>

                <Button
                  variant="secondary"
                  onClick={() => enter(summary.code)}
                  disabled={pending !== null}
                  loading={pending === summary.code}
                  className="mt-6 w-full"
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
