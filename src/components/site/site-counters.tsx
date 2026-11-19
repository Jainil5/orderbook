"use client";

import { Odometer } from "@/components/ui/odometer";
import type { SiteStats } from "@/lib/site/menu";
import type { SiteProfile } from "@/lib/site/registry";

/**
 * The editorial counter row — house claims, worded exactly like the reference
 * sites ("0 m of firebrick hearth"), so the number carries the unit and the
 * caption carries the argument.
 */
export function SiteCounters({ profile }: { profile: SiteProfile }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--site-accent)]">
        {profile.counterKicker}
      </p>
      <dl className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {profile.counters.map((counter) => (
          <div key={counter.unit} className="site-spot p-5">
            <dd className="site-display text-4xl text-[var(--site-accent)]">
              <Odometer
                value={counter.value}
                format={{ kind: "number" }}
                whenInView
              />{" "}
              <span className="text-base font-medium tracking-normal text-[var(--site-text)]">
                {counter.unit}
              </span>
            </dd>
            <dt className="mt-2 text-xs leading-relaxed text-[var(--site-muted)]">
              {counter.caption}
            </dt>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] text-[var(--site-muted)]">
        {profile.counterNote}
      </p>
    </div>
  );
}

/**
 * The same motion, but every figure is counted out of the brand's own
 * OrderBook ledger rather than claimed.
 */
export function SiteLedger({
  profile,
  stats,
  currencyCode,
}: {
  profile: SiteProfile;
  stats: SiteStats;
  currencyCode: string;
}) {
  const rows: {
    value: number;
    label: string;
    note: string;
    decimals?: number;
    suffix?: string;
  }[] = [
    {
      value: stats.ordersServed,
      label: profile.madeToOrder ? "jobs on the ledger" : "tickets on the rail",
      note: "every one of them billed here",
    },
    {
      value: stats.guests,
      label: profile.madeToOrder ? "clients on file" : "regulars on file",
      note: "the CRM, not a mailing list",
    },
    {
      value: stats.itemCount,
      label: profile.madeToOrder ? "pieces in the catalog" : "lines on the card",
      note: "live stock and all",
    },
    {
      value: stats.avgRating ?? 0,
      label: "average rating",
      note: stats.avgRating
        ? `${stats.reviewCount} reviews · ${currencyCode} prices shown`
        : "no reviews yet",
      decimals: 1,
      suffix: stats.avgRating ? " / 5" : "",
    },
  ];

  return (
    <div className="site-ledger grid gap-px overflow-hidden rounded-[var(--site-radius)] border border-[var(--site-line)] sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((row) => (
        <div key={row.label} className="p-5">
          <p className="site-display text-3xl">
            <Odometer
              value={row.value}
              format={{ kind: "number" }}
              decimals={row.decimals ?? 0}
              whenInView
            />
            {row.suffix ? (
              <span className="text-sm font-medium tracking-normal text-[var(--site-muted)]">
                {row.suffix}
              </span>
            ) : null}
          </p>
          <p className="mt-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--site-accent)]">
            {row.label}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--site-muted)]">
            {row.note}
          </p>
        </div>
      ))}
    </div>
  );
}
