"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Check, Plus } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { SiteSet } from "@/lib/site/menu";
import type { SiteProfile } from "@/lib/site/registry";
import { Odometer } from "@/components/ui/odometer";
import { useCart } from "./cart-provider";

/**
 * The set block — Ember Larder's "one price, the whole fire". The lines are
 * resolved against the live card, so the price shown is the sum of the
 * counter's own prices rather than a figure somebody typed into a CSV.
 */
export function SiteSetBlock({
  profile,
  set,
  currencyCode,
}: {
  profile: SiteProfile;
  set: SiteSet;
  currencyCode: string;
}) {
  const cart = useCart();
  const [added, setAdded] = useState(false);

  const live = set.courses.filter((course) => !course.item.soldOut);
  const offCard = set.courses.length - live.length;

  const addSet = () => {
    for (const course of live) {
      cart.add({
        productId: course.item.id,
        quantity: 1,
        modifierIds: course.item.defaultModifierIds,
      });
    }
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2000);
  };

  if (!set.courses.length) return null;

  return (
    <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <p className="site-display text-5xl text-[var(--site-accent)] sm:text-6xl">
          <Odometer
            value={set.total}
            format={{ kind: "currency", currency: currencyCode }}
            duration={1.6}
            whenInView
          />
        </p>
        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--site-muted)]">
          {profile.set.priceNote}
        </p>
        <p className="mt-6 text-sm leading-relaxed text-[var(--site-muted)]">
          {profile.set.intro}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={addSet}
            disabled={!live.length}
            data-active={added}
            className="ob-press inline-flex items-center gap-2 rounded-full bg-[var(--site-accent)] px-5 py-2.5 text-sm font-semibold text-[var(--site-accent-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <AnimatePresence mode="wait" initial={false}>
              {added ? (
                <motion.span
                  key="added"
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -8, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="inline-flex items-center gap-2"
                >
                  <Check className="h-4 w-4" aria-hidden /> On the tray
                </motion.span>
              ) : (
                <motion.span
                  key="add"
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -8, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="inline-flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" aria-hidden /> {profile.set.addLabel}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <Link
            href={`/site/${profile.code}/order`}
            className="inline-flex items-center gap-2 text-sm text-[var(--site-muted)] transition hover:text-[var(--site-accent)]"
          >
            {profile.orderTab} <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {offCard ? (
          <p className="mt-4 text-xs text-[var(--site-muted)]">
            {offCard} {offCard === 1 ? "line is" : "lines are"} off the card today
            and left out of the total.
          </p>
        ) : null}
      </div>

      <div>
        <p className="site-display text-3xl text-[var(--site-text)]">
          {profile.set.name}
        </p>
        <ol className="mt-6 divide-y divide-[var(--site-line)] border-y border-[var(--site-line)]">
          {set.courses.map((course) => (
            <li key={course.n} className="flex gap-5 py-5">
              <span className="site-display w-10 shrink-0 text-lg text-[var(--site-accent)]">
                {course.n}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--site-muted)]">
                    {course.label}
                  </span>
                  <span className="font-semibold">{course.item.name}</span>
                  <span className="ml-auto whitespace-nowrap text-sm text-[var(--site-accent)]">
                    {formatMoney(course.item.price, currencyCode)}
                    {course.item.soldOut ? " · off today" : ""}
                  </span>
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--site-muted)]">
                  {course.text}
                </p>
                <p className="mt-1.5 text-[11px] text-[var(--site-muted)]">
                  {course.item.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {set.steps.length ? (
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {set.steps.map((step) => (
              <div
                key={step.n}
                className="flex gap-3 rounded-2xl border border-[var(--site-line)] p-3"
              >
                <span className="site-display text-sm text-[var(--site-accent)]">
                  {step.n}
                </span>
                <p className="text-xs leading-relaxed text-[var(--site-muted)]">
                  <span className="font-semibold text-[var(--site-text)]">
                    {step.label} —{" "}
                  </span>
                  {step.text}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
