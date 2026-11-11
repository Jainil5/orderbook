"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { LogoMark } from "@/components/brand/logo-mark";
import { Meteors } from "@/components/effects/meteors";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DemoShowcase } from "@/components/auth/demo-showcase";
import { BrandCards } from "@/components/showcase/brand-cards";
import { DEMO_STEPS } from "@/components/showcase/content";
import { FeatureGrid } from "@/components/showcase/feature-grid";
import { SiteFooter } from "@/components/showcase/site-footer";
import {
  SHOWCASE_CHILD,
  SHOWCASE_CONTAINER,
} from "@/components/showcase/motion";
import type {
  DemoBrandSummary,
  DemoShowcaseStats,
} from "@/lib/demo/showcase-stats";

export function DemoPicker({
  showcase,
  summaries,
}: {
  showcase: DemoShowcaseStats;
  summaries: DemoBrandSummary[];
}) {
  const reduceMotion = useReducedMotion();
  const totals = summaries.reduce(
    (total, summary) => ({
      bills: total.bills + summary.bills,
      products: total.products + summary.products,
      customers: total.customers + summary.customers,
    }),
    { bills: 0, products: 0, customers: 0 },
  );
  const months = Math.max(...summaries.map((summary) => summary.historyMonths));

  return (
    <div className="ob-workspace relative min-h-[100dvh] overflow-x-hidden">
      <Meteors count={10} seed={11} />

      <header className="sticky top-0 z-40 border-b border-[var(--ob-border)] bg-[color-mix(in_srgb,var(--ob-bg)_78%,transparent)] backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
          <div className="flex items-center gap-3">
            <LogoMark size={34} spin={!reduceMotion} />
            <span className="font-display text-base font-semibold tracking-tight">
              OrderBook
            </span>
          </div>
          <nav
            aria-label="Entry page"
            className="flex items-center gap-1 text-sm sm:gap-5"
          >
            <a
              href="#features"
              className="min-h-[44px] px-2 text-[var(--ob-text-secondary)] hover:text-[var(--ob-text)]"
            >
              Features
            </a>
            <a
              href="#analytics"
              className="min-h-[44px] px-2 text-[var(--ob-text-secondary)] hover:text-[var(--ob-text)]"
            >
              Live data
            </a>
            <a
              href="#demos"
              className="min-h-[44px] px-2 text-[var(--ob-text-secondary)] hover:text-[var(--ob-text)]"
            >
              Demos
            </a>
            <span className="ml-1 border-l border-[var(--ob-border)] pl-3">
              <ThemeToggle />
            </span>
          </nav>
        </div>
      </header>

      <main className="relative z-[1]">
        <motion.section
          variants={SHOWCASE_CONTAINER}
          initial={reduceMotion ? "show" : "hidden"}
          animate="show"
          className="mx-auto max-w-3xl px-4 pb-10 pt-12 text-center sm:pt-16"
        >
          <motion.p
            variants={SHOWCASE_CHILD}
            className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ob-text-muted)]"
          >
            WebsiteIn · OrderBook
          </motion.p>
          <motion.h1
            variants={SHOWCASE_CHILD}
            className="mt-3 font-display text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl"
          >
            Pick a live business and start taking orders
          </motion.h1>
          <motion.p
            variants={SHOWCASE_CHILD}
            className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[var(--ob-text-secondary)] sm:text-base"
          >
            Two complete workspaces are running here — a café counter and a
            furniture studio — each carrying {months} months of its own trading
            history. No sign-up, no setup, nothing to install: choose one and
            ring up a bill.
          </motion.p>
          <motion.ul
            variants={SHOWCASE_CHILD}
            className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--ob-text-secondary)]"
          >
            {[
              `${summaries.length} business profiles`,
              `${totals.bills} seeded bills`,
              `${totals.products} products`,
              `${totals.customers} customers`,
            ].map((chip) => (
              <li
                key={chip}
                className="rounded-full border border-[var(--ob-border)] bg-[var(--ob-surface)] px-3 py-1.5"
              >
                {chip}
              </li>
            ))}
          </motion.ul>
        </motion.section>

        <FeatureGrid
          intro="Every screen below is live in both demos — the numbers you read here are the numbers the workspace holds."
        />

        <section
          id="analytics"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16"
        >
          <div className="mb-4 max-w-2xl">
            <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              The dashboard, moving
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ob-text-secondary)]">
              These are the same analytics cards you get inside the workspace,
              charted straight from the seeded data. Hover to pause, drag to
              scrub.
            </p>
          </div>
          <DemoShowcase stats={showcase} />
        </section>

        <BrandCards summaries={summaries} />

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            How the demo works
          </h2>
          <motion.ol
            variants={SHOWCASE_CONTAINER}
            initial={reduceMotion ? "show" : "hidden"}
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="mt-8 grid gap-4 sm:grid-cols-3"
          >
            {DEMO_STEPS.map((step, index) => (
              <motion.li
                key={step.title}
                variants={SHOWCASE_CHILD}
                className="ob-card flex h-full flex-col p-6"
              >
                <span className="font-display text-2xl font-semibold text-[var(--ob-primary)]">
                  {index + 1}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ob-text-secondary)]">
                  {step.body}
                </p>
              </motion.li>
            ))}
          </motion.ol>
          <p className="mt-6 text-sm text-[var(--ob-text-secondary)]">
            Want the marketing tour instead?{" "}
            <Link href="/" className="font-medium text-[var(--ob-primary)] hover:underline">
              See the product page
            </Link>
            .
          </p>
        </section>
      </main>

      <SiteFooter link={{ href: "/", label: "Product overview" }} />
    </div>
  );
}
