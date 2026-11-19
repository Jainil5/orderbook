"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Star } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { SiteMenuItem, SiteStats } from "@/lib/site/menu";
import type { SiteProfile } from "@/lib/site/registry";
import { SiteCounters, SiteLedger } from "./site-counters";

/**
 * The single-page opening: kicker, statement, one paragraph, two ways in —
 * then the counters. The editorial row is house copy; the strip under it is
 * counted out of the brand's own ledger, and both roll up on scroll.
 */
export function SiteHero({
  profile,
  stats,
  featured,
  currencyCode,
}: {
  profile: SiteProfile;
  stats: SiteStats;
  featured: SiteMenuItem[];
  currencyCode: string;
}) {
  const reduceMotion = useReducedMotion();
  const ease = [0.22, 1, 0.36, 1] as const;

  return (
    <section id="top" className="relative scroll-mt-24 overflow-hidden">
      <div className="site-beams" aria-hidden />
      {/* Ambient accent washes, one per corner. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: "var(--site-warm)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: "var(--site-warm)" }}
      />

      <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease }}
              className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--site-accent)]"
            >
              {profile.eyebrow}
            </motion.p>
            <h1 className="site-display mt-5 text-5xl sm:text-7xl">
              {profile.heroLines.map((line, index) => (
                <motion.span
                  key={line}
                  className="block"
                  initial={reduceMotion ? false : { opacity: 0, y: 34 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.08 + index * 0.12, ease }}
                >
                  {line}
                </motion.span>
              ))}
            </h1>
            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.35, ease }}
              className="mt-6 max-w-xl text-[15px] leading-relaxed text-[var(--site-muted)]"
            >
              {profile.heroBody}
            </motion.p>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.45, ease }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <Link
                href={`/site/${profile.code}/order`}
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--site-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--site-accent-ink)] transition hover:brightness-110"
              >
                {profile.madeToOrder ? "Start an enquiry" : "Order ahead"}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <a
                href="#card"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--site-line-strong)] px-5 py-2.5 text-sm font-medium transition hover:border-[var(--site-accent)] hover:text-[var(--site-accent)]"
              >
                See the {profile.menuTab.toLowerCase()}
              </a>
              <span className="text-xs text-[var(--site-muted)]">
                {profile.heroNote}
              </span>
            </motion.div>
          </div>

          {/* Featured picks straight from the data — the popular rows. */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"
          >
            {featured.map((item, index) => (
              <motion.article
                key={item.id}
                animate={reduceMotion ? undefined : { y: [0, -8, 0] }}
                transition={{
                  duration: 5 + index,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: index * 0.6,
                }}
                className="site-spot group overflow-hidden"
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="site-kenburns h-36 w-full object-cover"
                    loading={index === 0 ? "eager" : "lazy"}
                  />
                ) : (
                  <div className="site-kenburns h-36 w-full" aria-hidden />
                )}
                <div className="p-4">
                  <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--site-accent)]">
                    <Star className="h-3 w-3 fill-current" aria-hidden />
                    Most ordered
                  </p>
                  <p className="mt-1.5 font-semibold">{item.name}</p>
                  <p className="mt-1 text-sm text-[var(--site-muted)]">
                    {formatMoney(item.price, currencyCode)}
                    {item.unit ? ` / ${item.unit}` : ""}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[var(--site-muted)]">
                    {item.detail}
                  </p>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </div>

        <div className="mt-20">
          <SiteCounters profile={profile} />
        </div>
        <div className="mt-10">
          <SiteLedger
            profile={profile}
            stats={stats}
            currencyCode={currencyCode}
          />
        </div>
      </div>
    </section>
  );
}
