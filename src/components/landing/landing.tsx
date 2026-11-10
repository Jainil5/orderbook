"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  ArrowRight,
  BarChart3,
  ClipboardList,
  FileText,
  Receipt,
  Users,
  Wallet,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo-mark";
import { Meteors } from "@/components/effects/meteors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { enterDemoWorkspace } from "@/lib/auth/demo";
import type { DemoBrandCode } from "@/lib/workspace/constants";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const child: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

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

const FEATURES = [
  {
    icon: Receipt,
    title: "Billing & POS",
    body: "Ring up counter sales in seconds — tender split, discounts and GST-ready bills included.",
  },
  {
    icon: ClipboardList,
    title: "Order lifecycle",
    body: "Track every bill from kitchen and floor to completion, with unavailable-item handling built in.",
  },
  {
    icon: FileText,
    title: "Quotes & invoices",
    body: "Send quotations for big-ticket work, convert accepted quotes into orders without retyping.",
  },
  {
    icon: Wallet,
    title: "Payments & collections",
    body: "Partial payments, open balances and collection rates — know exactly what is still due.",
  },
  {
    icon: BarChart3,
    title: "Analytics studio",
    body: "Revenue trends, category mix, tender split and margin & COGS across any date range.",
  },
  {
    icon: Users,
    title: "Staff & operations",
    body: "Shifts, tasks, appointments, field visits and service jobs in one management desk.",
  },
];

const VERTICALS: {
  code: DemoBrandCode;
  name: string;
  tagline: string;
  points: string[];
}[] = [
  {
    code: "BR-1",
    name: "Brewery Cafe",
    tagline: "Fast counter service, kitchen tickets and a six-month sales story.",
    points: ["POS & kitchen flow", "UPI / card / cash tenders", "Peak-hour analytics"],
  },
  {
    code: "BR-2",
    name: "Cubig Furniture",
    tagline: "Quotation-led sales with jobs, visits and part payments.",
    points: ["Quotes → orders", "Service jobs & field visits", "Collections tracking"],
  },
];

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

export function Landing() {
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
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
          <motion.h2
            variants={child}
            className="font-display text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Everything the counter and the back office need
          </motion.h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <motion.div key={feature.title} variants={child}>
                <Card className="h-full p-5 transition-shadow hover:shadow-[var(--ob-shadow-md)]">
                  <span className="inline-grid h-10 w-10 place-items-center rounded-[var(--ob-radius-md)] bg-[color-mix(in_srgb,var(--ob-primary)_14%,transparent)] text-[var(--ob-primary)]">
                    <feature.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">{feature.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--ob-text-secondary)]">{feature.body}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

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
              <ul className="mt-6 space-y-3 text-sm text-[var(--ob-text-secondary)]">
                <li className="flex items-start gap-2">
                  <CheckDot /> Six months of deterministic demo history — no seeding chores
                </li>
                <li className="flex items-start gap-2">
                  <CheckDot /> Light and dark themes tuned to the same indigo palette
                </li>
                <li className="flex items-start gap-2">
                  <CheckDot /> Phone-first: every action reachable with one thumb
                </li>
              </ul>
            </motion.div>
            <motion.div variants={child}>
              <ShowcaseMock />
            </motion.div>
          </div>
        </section>

        {/* Demo verticals */}
        <section id="demos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
          <motion.h2
            variants={child}
            className="font-display text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Two live businesses, ready to poke at
          </motion.h2>
          <p className="mt-2 text-sm text-[var(--ob-text-secondary)]">
            Demos are full workspaces — create orders, capture payments, move through the
            kitchen screen. Nothing is saved to your account.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {VERTICALS.map((vertical) => (
              <motion.div key={vertical.code} variants={child}>
                <Card className="flex h-full flex-col p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-xl font-semibold tracking-tight">{vertical.name}</h3>
                    <Badge tone="demo">{vertical.code}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-[var(--ob-text-secondary)]">{vertical.tagline}</p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {vertical.points.map((point) => (
                      <li key={point}>
                        <Badge tone="neutral">{point}</Badge>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6 flex-1" />
                  <Button
                    variant="secondary"
                    onClick={() => onExploreDemo(vertical.code)}
                    loading={demoPending === vertical.code}
                    className="w-full"
                  >
                    Open {vertical.name} demo
                  </Button>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>
      </motion.main>

      <footer className="border-t border-[var(--ob-border)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8">
          <div className="flex items-center gap-3">
            <LogoMark size={30} />
            <p className="text-sm text-[var(--ob-text-muted)]">
              OrderBook by WebsiteIn — multi-business order management
            </p>
          </div>
          <Link href="/login" className="text-sm font-medium text-[var(--ob-primary)] hover:underline">
            Sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}

function CheckDot() {
  return (
    <span
      className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ob-accent)]"
      aria-hidden
    />
  );
}
