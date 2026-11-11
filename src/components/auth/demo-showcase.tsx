"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { LoopRow } from "@/components/effects/loop-row";
import { CHART_COLORS } from "@/components/analytics/chart-colors";
import type { DemoShowcaseStats } from "@/lib/demo/showcase-stats";
import type { Slice } from "@/lib/analytics/snapshot";

const MiniTrend = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.MiniTrend),
  { ssr: false, loading: () => <div className="h-40" /> },
);
const MiniDonut = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.MiniDonut),
  { ssr: false, loading: () => <div className="h-40" /> },
);

const CHART_HEIGHT = "flex-1";

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

function MiniCard({
  title,
  caption,
  children,
  foot,
}: {
  title: string;
  caption?: string;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div className="ob-card flex h-full flex-col p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--ob-text-secondary)]">
          {title}
        </h3>
        {caption ? (
          <span className="text-xs tabular-nums text-[var(--ob-text-muted)]">
            {caption}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex min-h-40 flex-1 flex-col">{children}</div>
      {foot}
    </div>
  );
}

function Legend({
  items,
  currency,
}: {
  items: (Slice & { color: string })[];
  currency: string;
}) {
  return (
    <ul className="mt-4 space-y-1.5 border-t border-[var(--ob-border)] pt-3">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-2 text-xs">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: item.color }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-[var(--ob-text-secondary)]">
            {item.name}
          </span>
          <span className="tabular-nums text-[var(--ob-text-muted)]">
            {compactMoney(item.value, currency)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The analytics carousel from the workspace, previewed on the entry page with
 * figures read straight from the seeded demo data.
 */
export function DemoShowcase({ stats }: { stats: DemoShowcaseStats }) {
  const { currency, trend } = stats;
  const categories = colorize(stats.categories);
  const tenders = colorize(stats.tenders);

  const cards = [
    <MiniCard
      key="revenue"
      title="Revenue trend"
      caption={`${trend.length} days`}
    >
      <MiniTrend data={trend} metric="revenue" currency={currency} heightClass={CHART_HEIGHT} />
    </MiniCard>,
    <MiniCard key="orders" title="Orders trend" caption={`${stats.periodBills} bills`}>
      <MiniTrend data={trend} metric="orders" currency={currency} heightClass={CHART_HEIGHT} />
    </MiniCard>,
    <MiniCard
      key="categories"
      title="Sales by category"
      caption={`${categories.length} groups`}
      foot={<Legend items={categories} currency={currency} />}
    >
      <MiniDonut
        data={categories}
        centerLabel="Categories"
        centerValue={compactMoney(sum(categories), currency)}
        heightClass={CHART_HEIGHT}
      />
    </MiniCard>,
    <MiniCard
      key="tenders"
      title="Tender mix"
      caption={`${tenders.length} modes`}
      foot={<Legend items={tenders} currency={currency} />}
    >
      <MiniDonut
        data={tenders}
        centerLabel="Collected"
        centerValue={compactMoney(sum(tenders), currency)}
        heightClass={CHART_HEIGHT}
      />
    </MiniCard>,
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Live from {stats.brandName}
        </h2>
        <p className="text-sm text-[var(--ob-text-muted)]">
          {compactMoney(stats.periodRevenue, currency)} across{" "}
          {stats.periodBills} bills · last {trend.length} days
        </p>
      </div>
      <LoopRow
        ariaLabel={`Analytics from the ${stats.brandName} demo data`}
        speed={16}
        itemClassName="w-72 sm:w-96"
        items={cards}
      />
    </section>
  );
}
