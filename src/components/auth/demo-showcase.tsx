"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { LoopRow } from "@/components/effects/loop-row";
import { CHART_COLORS } from "@/components/analytics/chart-colors";
import type { DemoShowcaseStats } from "@/lib/demo/showcase-stats";
import type { Slice } from "@/lib/analytics/snapshot";

const MiniTrend = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.MiniTrend),
  { ssr: false, loading: () => <div className="h-28" /> },
);
const MiniDonut = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.MiniDonut),
  { ssr: false, loading: () => <div className="h-28" /> },
);

function colorize(items: Slice[]) {
  return items.map((item, index) => ({
    ...item,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
}

function sum(items: Slice[]) {
  return items.reduce((total, item) => total + item.value, 0);
}

function compactMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function MiniCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="ob-card flex h-full flex-col p-4">
      <h3 className="text-xs font-semibold text-[var(--ob-text-secondary)]">
        {title}
      </h3>
      <div className="mt-2 flex-1">{children}</div>
    </div>
  );
}

/**
 * The analytics carousel from the workspace, previewed on the login page with
 * figures read straight from the seeded demo data.
 */
export function DemoShowcase({ stats }: { stats: DemoShowcaseStats }) {
  const { currency, trend } = stats;
  const categories = colorize(stats.categories);
  const tenders = colorize(stats.tenders);

  const cards = [
    <MiniCard key="revenue" title="Revenue trend">
      <MiniTrend data={trend} metric="revenue" currency={currency} />
    </MiniCard>,
    <MiniCard key="orders" title="Orders trend">
      <MiniTrend data={trend} metric="orders" currency={currency} />
    </MiniCard>,
    <MiniCard key="categories" title="Sales by category">
      <MiniDonut
        data={categories}
        centerLabel="Categories"
        centerValue={compactMoney(sum(categories), currency)}
      />
    </MiniCard>,
    <MiniCard key="tenders" title="Tender mix">
      <MiniDonut
        data={tenders}
        centerLabel="Collected"
        centerValue={compactMoney(sum(tenders), currency)}
      />
    </MiniCard>,
  ];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <h2 className="font-display text-lg font-semibold">
          Live from {stats.brandName}
        </h2>
        <p className="text-xs text-[var(--ob-text-muted)]">
          {compactMoney(stats.periodRevenue, currency)} across{" "}
          {stats.periodBills} bills · last {trend.length} days
        </p>
      </div>
      <LoopRow
        ariaLabel={`Analytics from the ${stats.brandName} demo data`}
        speed={20}
        itemClassName="w-60 sm:w-72"
        items={cards}
      />
    </section>
  );
}
