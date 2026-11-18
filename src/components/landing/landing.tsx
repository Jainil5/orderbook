"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/brand/logo-mark";
import { Wordmark } from "@/components/brand/wordmark";
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
        <span className="ml-[0.28em] inline-block text-[var(--ob-leaf)]" aria-hidden>
          {accent}
        </span>
      ) : null}
    </span>
  );
}

/* Spec rhythm: 55ms per character in, 1.9s hold, 26ms per character out, 220ms
   between words. The reserved min-height keeps the heading from jumping. */
const TYPE_MS = 55;
const HOLD_MS = 1900;
const DELETE_MS = 26;
const GAP_MS = 220;

function Typewriter({ words }: { words: string[] }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [text, setText] = useState(words[0]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;
    const current = words[index % words.length];
    let delay = deleting ? DELETE_MS : TYPE_MS;
    if (!deleting && text === current) delay = HOLD_MS;
    else if (deleting && text === "") delay = GAP_MS;
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
    <span className="whitespace-nowrap text-[var(--ob-leaf)]">
      {reduceMotion ? words[0] : text}
      <span
        className="ml-[0.06em] inline-block h-[0.92em] w-[3px] translate-y-[0.08em] bg-[var(--ob-leaf)]"
        style={{ animation: "ob-caret 1s steps(1) infinite" }}
        aria-hidden
      />
    </span>
  );
}

const MOCK_TILES = [
  { label: "Revenue today", value: "₹18,240", note: "+12% vs last week", tone: "success" },
  { label: "Open bills", value: "7", note: "₹31,400 due", tone: "warning" },
  { label: "Orders live", value: "3", note: "kitchen busy", tone: "demo" },
] as const;

function ShowcaseMock() {
  const reduceMotion = useReducedMotion();
  const bars = [38, 62, 45, 80, 58, 92, 71, 64, 88, 52, 76, 95];
  return (
    <div className="ob-card overflow-hidden">
      <div className="flex items-center gap-1.5 border-b border-[var(--ob-border)] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--ob-danger)]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--ob-warning)]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--ob-success)]/70" />
        <p className="ob-label-quiet ml-3">orderbook · analytics</p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {MOCK_TILES.map((tile) => (
          <Card key={tile.label} className="ob-glare-top p-3">
            <p className="ob-label-quiet">{tile.label}</p>
            <p className="ob-num mt-1 text-[26px] leading-none">{tile.value}</p>
            <Badge tone={tile.tone} className="mt-2">
              {tile.note}
            </Badge>
          </Card>
        ))}
      </div>
      <div className="px-4 pb-4">
        <div className="flex h-24 items-end gap-1.5 rounded-[var(--ob-radius-xs)] bg-[var(--ob-surface-muted)] p-3">
          {bars.map((h, i) => (
            <motion.span
              key={i}
              className="flex-1 rounded-t-sm"
              style={{
                background:
                  "linear-gradient(180deg, var(--ob-series-2), var(--ob-series-1))",
                filter:
                  "drop-shadow(0 0 7px color-mix(in srgb, var(--ob-leaf) 40%, transparent))",
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
      <header className="ob-glass-bar sticky top-0 z-40 border-b border-[var(--ob-border)]">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-3">
            <LogoMark size={36} spin={!reduceMotion} />
            <Wordmark
              className="font-display block font-extrabold leading-none"
              size={21}
            />
          </Link>
          <nav aria-label="Landing" className="hidden items-center gap-7 text-[15px] sm:flex">
            {[
              ["#features", "Features"],
              ["#product", "Product"],
              ["#demos", "Live demos"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="text-[var(--ob-text-muted)] transition-colors hover:text-[var(--ob-leaf)]"
              >
                {label}
              </a>
            ))}
          </nav>
          <Link
            href="/login"
            className="ob-btn-primary ob-press inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-semibold"
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
          <motion.p variants={child} className="ob-label mt-6 text-center">
            WebsiteIn · OrderBook
          </motion.p>
          <motion.h1
            variants={child}
            className="mx-auto mt-4 max-w-4xl text-center font-display font-extrabold"
            style={{
              fontSize: "var(--fs-hero)",
              lineHeight: 1.02,
              letterSpacing: "-0.025em",
            }}
          >
            <SplitHeading text="One book for your" />
            <span className="mt-2 block min-h-[1.05em]">
              <Typewriter words={["café counter.", "furniture studio.", "retail floor.", "brewery."]} />
            </span>
          </motion.h1>
          <motion.p variants={child} className="ob-lead mx-auto mt-6 max-w-2xl text-center">
            Billing, orders, quotes, payments and analytics — together, in one fast
            workspace. Open a live demo with six months of real-looking data in one click.
          </motion.p>
          <motion.div variants={child} className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => onExploreDemo("BR-1")}
              loading={demoPending === "BR-1"}
              className="px-7 py-[15px]"
            >
              Explore live demo
            </Button>
            <Link
              href="/login"
              className="ob-btn-ghost ob-press inline-flex items-center rounded-full px-7 py-[15px] text-[15px] font-semibold"
            >
              Sign in
            </Link>
          </motion.div>
        </section>

        {/* Features */}
        <FeatureGrid />

        {/* Product showcase */}
        <section id="product" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
          <p className="ob-sec-label">02 / Product</p>
          <div className="mt-6 grid items-center gap-10 lg:grid-cols-2">
            <motion.div variants={child}>
              <h2
                className="ob-h1-cap font-display font-extrabold"
                style={{
                  fontSize: "var(--fs-h2)",
                  lineHeight: 1.02,
                  letterSpacing: "-0.025em",
                }}
              >
                A dashboard that reads like a story
              </h2>
              <p className="ob-lead mt-5">
                Overview rows carousel through key metrics, operational tiles and mini
                charts. Zoom into trends, category mix, tender split and margin & COGS —
                filtered by any date range, with day-part filters when lunch rush matters.
              </p>
              <CheckList
                className="mt-7"
                items={[
                  "Six months of deterministic demo history — no seeding chores",
                  "One dark botanical field, one paper light theme, same tokens",
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
