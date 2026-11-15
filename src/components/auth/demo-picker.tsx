"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { LogoMark } from "@/components/brand/logo-mark";
import { Wordmark } from "@/components/brand/wordmark";
import { FlowField } from "@/components/effects/flow-field";
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
      <FlowField />

      <header className="ob-glass-bar sticky top-0 z-40 border-b border-[var(--ob-border)]">
        <div className="mx-auto flex min-h-[72px] max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
          <div className="flex items-center gap-3">
            <LogoMark size={34} spin={!reduceMotion} />
            <Wordmark
              className="font-display block font-extrabold leading-none"
              size={20}
            />
          </div>
          <nav
            aria-label="Entry page"
            className="flex items-center gap-1 text-[15px] sm:gap-5"
          >
            {[
              ["#features", "Features"],
              ["#analytics", "Live data"],
              ["#demos", "Demos"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="min-h-[44px] px-2 text-[var(--ob-text-muted)] transition-colors hover:text-[var(--ob-leaf)]"
              >
                {label}
              </a>
            ))}
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
          className="mx-auto max-w-3xl px-4 pb-10 pt-14 text-center sm:pt-20"
        >
          <motion.p variants={SHOWCASE_CHILD} className="ob-label">
            WebsiteIn · OrderBook
          </motion.p>
          <motion.h1
            variants={SHOWCASE_CHILD}
            className="mt-4 font-display font-extrabold"
            style={{
              fontSize: "var(--fs-hero)",
              lineHeight: 1.02,
              letterSpacing: "-0.025em",
            }}
          >
            Pick a live business and start taking orders
          </motion.h1>
          <motion.p variants={SHOWCASE_CHILD} className="ob-lead mx-auto mt-5">
            Two complete workspaces are running here — a café counter and a
            furniture studio — each carrying {months} months of its own trading
            history. No sign-up, no setup, nothing to install: choose one and
            ring up a bill.
          </motion.p>
          <motion.ul
            variants={SHOWCASE_CHILD}
            className="mt-7 flex flex-wrap items-center justify-center gap-2 text-[13px] font-semibold text-[var(--ob-leaf)]"
          >
            {[
              `${summaries.length} business profiles`,
              `${totals.bills} seeded bills`,
              `${totals.products} products`,
              `${totals.customers} customers`,
            ].map((chip) => (
              <li
                key={chip}
                className="rounded-full border border-[var(--ob-line-emphasis)] bg-[var(--ob-tint-wash)] px-3.5 py-1.5"
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
          <div className="mb-6 max-w-2xl">
            <h2
              className="ob-h1-cap font-display font-extrabold"
              style={{
                fontSize: "var(--fs-h3)",
                lineHeight: 1.05,
                letterSpacing: "-0.025em",
              }}
            >
              The dashboard, moving
            </h2>
            <p className="ob-lead mt-3 text-[16px]">
              These are the same analytics cards you get inside the workspace,
              charted straight from the seeded data. Hover to pause, drag to
              scrub.
            </p>
          </div>
          <DemoShowcase stats={showcase} />
        </section>

        <BrandCards summaries={summaries} />

        <section className="mx-auto max-w-6xl px-4 py-16">
          <p className="ob-sec-label">04 / How it works</p>
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
                className="ob-card ob-glare-top flex h-full flex-col p-6"
              >
                <span className="ob-num text-[34px] leading-none text-[var(--ob-leaf)]">
                  {index + 1}
                </span>
                <h3
                  className="mt-3 font-display text-[22px] font-semibold"
                  style={{ letterSpacing: "-0.02em", lineHeight: 1.1 }}
                >
                  {step.title}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[var(--ob-text-secondary)]">
                  {step.body}
                </p>
              </motion.li>
            ))}
          </motion.ol>
          <p className="mt-6 text-[15px] text-[var(--ob-text-secondary)]">
            Want the marketing tour instead?{" "}
            <Link
              href="/"
              className="font-semibold text-[var(--ob-leaf)] underline-offset-4 hover:underline"
            >
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
