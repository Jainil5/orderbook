"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { PageShell } from "@/components/workspace/page-shell";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { CHART_COLORS } from "@/components/analytics/charts";
import { formatMoney } from "@/lib/format";
import type { AnalyticsSnapshot } from "@/lib/analytics/snapshot";
import type { ResolvedRange } from "@/lib/analytics/date-range";
import type { Order } from "@/types/database";
import { OpenQuotesWidget } from "@/components/dashboard/open-quotes-widget";
import { RangeSelector } from "@/components/workspace/range-selector";

const TrendChart = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.TrendChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-xl bg-[var(--ob-surface-muted)]" />
    ),
  },
);

const ShareDonut = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.ShareDonut),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-xl bg-[var(--ob-surface-muted)]" />
    ),
  },
);

export function DashboardHome({
  snapshot,
  notice,
  range,
  openOrders = [],
  orderNumberColumn = "Bill #",
}: {
  snapshot: AnalyticsSnapshot;
  notice?: string;
  range: ResolvedRange;
  openOrders?: Order[];
  orderNumberColumn?: string;
}) {
  const money = (value: number) => formatMoney(value, snapshot.currencyCode);
  const collected = snapshot.paidAmount + snapshot.pendingAmount;
  const collectionRate = collected ? (snapshot.paidAmount / collected) * 100 : 0;
  const mix = (
    snapshot.salesByCategory.length ? snapshot.salesByCategory : snapshot.orderStatuses
  ).map((item, index) => ({
    ...item,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
  const mixTotal = mix.reduce((total, item) => total + item.value, 0);
  const bestDay = [...snapshot.salesOverTime].sort((a, b) => b.revenue - a.revenue)[0];

  return (
    <PageShell
      title="Dashboard"
      headerActions={
        <div className="flex max-w-full flex-wrap gap-1.5 sm:gap-2">
          <Link
            href="/billing"
            className="rounded-full border border-[var(--ob-border)] px-2.5 py-1.5 text-xs font-medium sm:px-3"
          >
            Billing
          </Link>
          <Link
            href="/kitchen"
            className="rounded-full border border-[var(--ob-border)] px-2.5 py-1.5 text-xs font-medium sm:px-3"
          >
            Kitchen
          </Link>
          <Link
            href="/analytics"
            className="rounded-full bg-[var(--ob-primary)] px-2.5 py-1.5 text-xs font-medium text-white sm:px-3"
          >
            Analytics
          </Link>
        </div>
      }
    >
      {notice ? (
        <p className="mb-4 text-sm text-[var(--ob-danger)]" role="alert">
          {notice}
        </p>
      ) : null}
      <RangeSelector
        basePath="/dashboard"
        initialFrom={range.from}
        initialTo={range.to}
        initialPreset={range.preset}
      />
      <div className="mb-4">
        <OpenQuotesWidget
          orders={openOrders}
          currencyCode={snapshot.currencyCode}
          orderNumberColumn={orderNumberColumn}
        />
      </div>
      <div className="ob-stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Net sales"
          value={money(snapshot.netSales)}
          hint={range.label}
        />
        <StatCard label="Orders" value={snapshot.orderCount.toString()} />
        <StatCard label="Avg. order value" value={money(snapshot.averageOrderValue)} />
        <StatCard
          label="Collected"
          value={collected ? `${collectionRate.toFixed(0)}%` : "—"}
          hint={
            collected
              ? `${money(snapshot.paidAmount)} paid · ${money(snapshot.pendingAmount)} open`
              : "No payments in this range"
          }
          tone={collectionRate >= 80 ? "up" : "neutral"}
        />
      </div>
      <div className="ob-stagger mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Sales trend</h2>
              <p className="text-xs text-[var(--ob-text-muted)]">
                {bestDay ? `Strongest point: ${bestDay.date}` : "Revenue over the sample"}
              </p>
            </div>
            <Link href="/analytics" className="text-xs font-medium text-[var(--ob-primary)]">
              Change charts
            </Link>
          </div>
          {snapshot.salesOverTime.length ? (
            <TrendChart
              data={snapshot.salesOverTime}
              metrics={["revenue"]}
              kind="area"
              currency={snapshot.currencyCode}
            />
          ) : (
            <p className="py-16 text-center text-sm text-[var(--ob-text-muted)]">
              Sales show up here after the first order.
            </p>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="text-sm font-semibold">
            {snapshot.salesByCategory.length ? "Category mix" : "Order status"}
          </h2>
          <p className="mb-2 text-xs text-[var(--ob-text-muted)]">
            {snapshot.salesByCategory.length
              ? "Share of sales"
              : "How current orders are sitting"}
          </p>
          {mix.length ? (
            <>
              <ShareDonut
                data={mix}
                centerLabel="Total"
                centerValue={
                  snapshot.salesByCategory.length
                    ? money(mixTotal)
                    : String(mixTotal)
                }
              />
              <ul className="mx-auto w-full max-w-xs space-y-2">
                {mix.map((item) => (
                  <li
                    key={item.name}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: item.color }}
                      />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="shrink-0 font-medium">
                      {snapshot.salesByCategory.length ? money(item.value) : item.value}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="py-16 text-center text-sm text-[var(--ob-text-muted)]">
              Mix charts fill in with orders.
            </p>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
