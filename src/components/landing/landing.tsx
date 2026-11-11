"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/brand/logo-mark";
import { Meteors } from "@/components/effects/meteors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandCards } from "@/components/showcase/brand-cards";
import { CheckList } from "@/components/showcase/check-list";
import { FeatureGrid } from "@/components/showcase/feature-grid";
import { SiteFooter } from "@/components/showcase/site-footer";
import {
  SHOWCASE_CONTAINER as container,
  SHOWCASE_CHILD as child,
} from "@/components/showcase/motion";
import { enterDemoWorkspace } from "@/lib/auth/demo";
import type { DemoBrandSummary } from "@/lib/demo/showcase-stats";
import type { DemoBrandCode } from "@/lib/workspace/constants";

function SplitHeading({ text, accent }: { text: string; accent?: string }) {
  const reduceMotion = useReducedMotion();
  const letters = text.split("");
  return (
    <span className="inline-flex flex-wrap" aria-label={text} role="text">
      {letters.map((ch, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom" aria-hidden>
          <motion.span
            className="inline-block"
            initial={reduceMotion ? false : { y: "115%" }}
            animate={{ y: 0 }}
            transition={{
              duration: 0.7,
              delay: 0.2 + i * 0.028,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {ch === " " ? "\u00A0" : ch}
          </motion.span>
        </span>
      ))}
      {accent ? (
        <span className="ml-[0.28em] inline-block text-[var(--ob-accent)]" aria-hidden>
          {accent}
        </span>
      ) : null}
    </span>
  );
}

function Typewriter({ words }: { words: string[] }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [text, setText] = useState(words[0]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    const current = words[index % words.length];
    let delay = 90;
    if (!deleting && text === current) delay = 1500;
    else if (deleting && text === "") delay = 250;
    else delay = deleting ? 38 : 78;
    const timer = setTimeout(() => {
      if (!deleting && text === current) {
        setDeleting(true);
      } else if (deleting && text === "") {
        setDeleting(false);
        setIndex((i) => (i + 1) % words.length);
      } else {
        setText(deleting ? current.slice(0, text.length - 1) : current.slice(0, text.length + 1));
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [text, deleting, index, words, reduceMotion]);

  return (
    <span className="whitespace-nowrap text-[var(--ob-primary)]">
      {reduceMotion ? words[0] : text}
      <span
        className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.12em] bg-[var(--ob-accent)]"
        style={{ animation: "ob-caret 1s steps(1) infinite" }}
        aria-hidden
      />
    </span>
  );
}

function ShowcaseMock() {
  const reduceMotion = useReducedMotion();
  const bars = [38, 62, 45, 80, 58, 92, 71, 64, 88, 52, 76, 95];
  return (
    <div className="ob-card overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-[var(--ob-border)] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--ob-danger)]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--ob-warning)]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--ob-success)]/70" />
        <p className="ml-3 text-xs text-[var(--ob-text-muted)]">orderbook · analytics</p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <Card className="p-3">
          <p className="text-xs text-[var(--ob-text-muted)]">Revenue today</p>
          <p className="mt-1 font-display text-xl font-semibold">₹18,240</p>
          <Badge tone="success" className="mt-2">+12% vs last week</Badge>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-[var(--ob-text-muted)]">Open bills</p>
          <p className="mt-1 font-display text-xl font-semibold">7</p>
          <Badge tone="warning" className="mt-2">₹31,400 due</Badge>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-[var(--ob-text-muted)]">Orders live</p>
          <p className="mt-1 font-display text-xl font-semibold">3</p>
          <Badge tone="demo" className="mt-2">kitchen busy</Badge>
        </Card>
      </div>
      <div className="px-4 pb-4">
        <div className="flex h-24 items-end gap-1.5 rounded-[var(--ob-radius-md)] bg-[var(--ob-surface-muted)] p-3">
          {bars.map((h, i) => (
            <motion.span
              key={i}
              className="flex-1 rounded-t-sm"
              style={{
                background: "linear-gradient(180deg, var(--ob-primary), var(--ob-accent))",
              }}
              initial={reduceMotion ? false : { height: 0 }}
              whileInView={{ height: `${h}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.3 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function Landing({ summaries }: { summaries: DemoBrandSummary[] }) {
  const reduceMotion = useReducedMotion();
  const [demoPending, setDemoPending] = useState<DemoBrandCode | null>(null);

  async function onExploreDemo(brandCode: DemoBrandCode) {
    setDemoPending(brandCode);
    await enterDemoWorkspace(brandCode);
  }

  return (
    <div className="ob-workspace relative min-h-[100dvh] overflow-x-hidden">
      <Meteors count={8} seed={21} />

      <header className="sticky top-0 z-40 border-b border-[var(--ob-border)] bg-[color-mix(in_srgb,var(--ob-bg)_78%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-3">
            <LogoMark size={36} spin={!reduceMotion} />
            <span className="font-display text-lg font-semibold tracking-tight">OrderBook</span>
          </Link>
          <nav aria-label="Landing" className="hidden items-center gap-6 text-sm sm:flex">
            <a href="#features" className="text-[var(--ob-text-secondary)] hover:text-[var(--ob-text)]">Features</a>
            <a href="#product" className="text-[var(--ob-text-secondary)] hover:text-[var(--ob-text)]">Product</a>
            <a href="#demos" className="text-[var(--ob-text-secondary)] hover:text-[var(--ob-text)]">Live demos</a>
          </nav>
          <Link
            href="/login"
            className="ob-btn-primary ob-press inline-flex items-center gap-2 rounded-[var(--ob-radius-md)] px-4 py-2 text-sm font-medium"
          >
            Sign in
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </header>

      <motion.main variants={container} initial={reduceMotion ? "show" : "hidden"} animate="show">
        {/* Hero */}
        <section className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:pt-24">
          <motion.div variants={child} className="flex justify-center">
            <LogoMark size={72} spin={!reduceMotion} />
          </motion.div>
          <motion.p
            variants={child}
            className="mt-6 text-center text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ob-text-muted)]"
          >
            WebsiteIn · OrderBook
          </motion.p>
          <motion.h1
            variants={child}
            className="mx-auto mt-3 max-w-3xl text-center font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl"
          >
            <SplitHeading text="One book for your" />
            <span className="mt-2 block min-h-[1.15em]">
              <Typewriter words={["café counter.", "furniture studio.", "retail floor.", "brewery."]} />
            </span>
          </motion.h1>
          <motion.p
            variants={child}
            className="mx-auto mt-5 max-w-2xl text-center text-base text-[var(--ob-text-secondary)] sm:text-lg"
          >
            Billing, orders, quotes, payments and analytics — together, in one fast
            workspace. Open a live demo with six months of real-looking data in one click.
          </motion.p>
          <motion.div variants={child} className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => onExploreDemo("BR-1")}
              loading={demoPending === "BR-1"}
              className="min-h-[2.75rem] px-6"
            >
              Explore live demo
            </Button>
            <Link
              href="/login"
              className="ob-press inline-flex min-h-[2.75rem] items-center rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] bg-[var(--ob-surface)] px-6 text-sm font-medium text-[var(--ob-text)] hover:bg-[var(--ob-surface-muted)]"
            >
              Sign in
            </Link>
          </motion.div>
        </section>

        {/* Features */}
        <FeatureGrid />

        {/* Product showcase */}
        <section id="product" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <motion.div variants={child}>
              <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                A dashboard that reads like a story
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[var(--ob-text-secondary)]">
                Overview rows carousel through key metrics, operational tiles and mini
                charts. Zoom into trends, category mix, tender split and margin & COGS —
                filtered by any date range, with day-part filters when lunch rush matters.
              </p>
              <CheckList
                className="mt-6"
                items={[
                  "Six months of deterministic demo history — no seeding chores",
                  "Light and dark themes tuned to the same indigo palette",
                  "Phone-first: every action reachable with one thumb",
                ]}
              />
            </motion.div>
            <motion.div variants={child}>
              <ShowcaseMock />
            </motion.div>
          </div>
        </section>

        {/* Demo verticals */}
        <BrandCards summaries={summaries} />
      </motion.main>

      <SiteFooter />
    </div>
  );
}
