"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { PageShell } from "@/components/workspace/page-shell";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { CHART_COLORS } from "@/components/analytics/charts";
import { OpenQuotesWidget } from "@/components/dashboard/open-quotes-widget";
import { RangeSelector } from "@/components/workspace/range-selector";
import { formatMoney } from "@/lib/format";
import type { AnalyticsSnapshot } from "@/lib/analytics/snapshot";
import type { ResolvedRange } from "@/lib/analytics/date-range";
import type { ManagerRollups } from "@/lib/business/overview";
import type {
  ActivityItem,
  DashboardAppointment,
  DashboardStaffAvailability,
  DashboardStockAlert,
} from "@/lib/dashboard/feed";
import type {
  DashboardNotification,
  NotificationSeverity,
} from "@/lib/dashboard/notifications";
import type { Order } from "@/types/database";

const TrendChart = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.TrendChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-xl bg-[var(--ob-surface-muted)]" />
    ),
  },
);

/**
 * Operational summary for the person opening the workspace in the morning:
 * what happened today, what needs action, and a shortcut into the module that
 * clears it. Anything that needs a date range, a comparison or a chart belongs
 * in Analytics, which this page links to rather than repeats.
 */
export function DashboardHome({
  snapshot,
  notice,
  range,
  rollups,
  openOrders = [],
  orderNumberColumn = "Bill #",
  notifications = [],
  appointments = [],
  staffSummary,
  stockAlerts: stockRows = [],
  lowStockCount = 0,
  activity = [],
  quotationEnabled = false,
  opsDataAvailable = true,
}: {
  snapshot: AnalyticsSnapshot;
  notice?: string;
  range: ResolvedRange;
  rollups: ManagerRollups;
  openOrders?: Order[];
  orderNumberColumn?: string;
  notifications?: DashboardNotification[];
  appointments?: DashboardAppointment[];
  staffSummary?: DashboardStaffAvailability | null;
  stockAlerts?: DashboardStockAlert[];
  lowStockCount?: number;
  activity?: ActivityItem[];
  quotationEnabled?: boolean;
  /** False in live workspaces where the Manager collections are not wired up. */
  opsDataAvailable?: boolean;
}) {
  const money = (value: number) => formatMoney(value, snapshot.currencyCode);
  const analyticsHref = range.preset
    ? `/analytics?range=${range.preset}`
    : `/analytics?from=${range.from}&to=${range.to}`;
  const mix = (
    snapshot.salesByCategory.length ? snapshot.salesByCategory : snapshot.orderStatuses
  ).slice(0, 5);
  const mixTotal = mix.reduce((total, item) => total + item.value, 0);
  const mixIsMoney = snapshot.salesByCategory.length > 0;

  return (
    <PageShell
      title="Dashboard"
      headerActions={
        <Link
          href={analyticsHref}
          className="rounded-full bg-[var(--ob-primary)] px-2.5 py-1.5 text-xs font-medium text-white sm:px-3"
        >
          Analytics
        </Link>
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

      <section aria-labelledby="today-heading">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="today-heading" className="text-sm font-semibold">
            Today
          </h2>
          <p className="text-xs text-[var(--ob-text-muted)]">
            Live counters — they do not follow the range above
          </p>
        </div>
        <div className="ob-stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <LinkedStat
            href="/orders"
            label="Today's sales"
            value={money(rollups.salesToday)}
            hint="Excludes cancelled and refunded bills"
          />
          <LinkedStat
            href="/orders"
            label="Orders today"
            value={String(rollups.ordersToday)}
            hint="Bills and quotes raised since midnight"
          />
          <LinkedStat
            href="/orders"
            label="Pending orders"
            value={String(rollups.pendingOrders)}
            hint={`${rollups.openQuotes} open quote${rollups.openQuotes === 1 ? "" : "s"}`}
          />
          <LinkedStat
            href="/manager/finance/receivables"
            label="Outstanding payments"
            value={money(rollups.outstandingAmount)}
            tone={rollups.outstandingAmount > 0 ? "down" : "up"}
            hint={
              rollups.outstandingAmount > 0
                ? "Unpaid balances to chase"
                : "Every invoice is settled"
            }
          />
        </div>
      </section>

      <nav aria-label="Quick actions" className="mt-4 flex flex-wrap gap-1.5 sm:gap-2">
        <QuickAction href="/billing" primary>
          New bill
        </QuickAction>
        {quotationEnabled ? <QuickAction href="/quotation">New quotation</QuickAction> : null}
        <QuickAction href="/orders">New order</QuickAction>
        <QuickAction href="/customers">New customer</QuickAction>
        <QuickAction href="/manager/productivity/tasks">Add task</QuickAction>
        <QuickAction href="/manager/productivity/appointments">Add appointment</QuickAction>
        <QuickAction href="/kitchen">Kitchen board</QuickAction>
      </nav>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Revenue overview</h2>
                <p className="text-xs text-[var(--ob-text-muted)]">
                  {range.label} · {money(snapshot.netSales)} net across{" "}
                  {snapshot.orderCount} order{snapshot.orderCount === 1 ? "" : "s"}
                </p>
              </div>
              <Link
                href={analyticsHref}
                className="text-xs font-medium text-[var(--ob-primary)] hover:underline"
              >
                Open in Analytics
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
            <div className="mt-4 border-t border-[var(--ob-border)] pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
                {mixIsMoney ? "Top categories" : "Order status"}
              </h3>
              {mix.length ? (
                <ul className="mt-3 space-y-2">
                  {mix.map((item, index) => {
                    const share = mixTotal ? (item.value / mixTotal) * 100 : 0;
                    return (
                      <li key={item.name}>
                        <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                          <span className="min-w-0 truncate font-medium">{item.name}</span>
                          <span className="shrink-0 text-[var(--ob-text-muted)]">
                            {mixIsMoney ? money(item.value) : item.value} ·{" "}
                            {share.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--ob-surface-muted)]">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${share}%`,
                              background: CHART_COLORS[index % CHART_COLORS.length],
                            }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-[var(--ob-text-muted)]">
                  Category mix appears once line items are available.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Recent activity</h2>
              <Link
                href="/orders"
                className="text-xs font-medium text-[var(--ob-primary)] hover:underline"
              >
                All orders
              </Link>
            </div>
            {activity.length ? (
              <ul className="divide-y divide-[var(--ob-border)]">
                {activity.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={row.href}
                      className="ob-touch-target flex items-start justify-between gap-3 py-2 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{row.label}</span>
                        <span className="block truncate text-xs text-[var(--ob-text-muted)]">
                          {row.detail}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {row.kind === "audit" ? <Badge>Log</Badge> : null}
                        <span className="text-xs text-[var(--ob-text-muted)]">
                          {formatWhen(row.at)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--ob-text-muted)]">
                No order or account activity recorded yet.
              </p>
            )}
          </Card>

          <OpenQuotesWidget
            orders={openOrders}
            currencyCode={snapshot.currencyCode}
            orderNumberColumn={orderNumberColumn}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Important notifications</h2>
              {notifications.length ? (
                <Badge tone={notifications.some((n) => n.severity === "critical") ? "danger" : "warning"}>
                  {notifications.length}
                </Badge>
              ) : null}
            </div>
            {notifications.length ? (
              <ul className="space-y-2">
                {notifications.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={row.href}
                      className="ob-touch-target block rounded-xl border border-[var(--ob-border)] p-3 transition-colors hover:bg-[var(--ob-surface-muted)]"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <SeverityDot severity={row.severity} />
                          {row.title}
                        </span>
                        <span className="shrink-0 text-xs text-[var(--ob-text-muted)]">
                          {row.module}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-[var(--ob-text-secondary)]">
                        {row.detail}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--ob-text-muted)]">
                Nothing needs attention right now.
              </p>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Today&apos;s appointments</h2>
              <ModuleLink href="/manager/productivity/appointments" />
            </div>
            {!opsDataAvailable ? (
              <ModuleNotWired />
            ) : appointments.length ? (
              <ul className="space-y-2">
                {appointments.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-start justify-between gap-3 border-b border-[var(--ob-border)] pb-2 text-sm last:border-0 last:pb-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{row.title}</span>
                      <span className="block truncate text-xs text-[var(--ob-text-muted)]">
                        {row.staffNames.length ? row.staffNames.join(", ") : "No staff assigned"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-[var(--ob-text-secondary)]">
                      {formatTime(row.startsAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--ob-text-muted)]">
                Nothing booked for today.
              </p>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Staff availability</h2>
              <ModuleLink href="/manager/staff/schedules" />
            </div>
            {!opsDataAvailable || !staffSummary ? (
              <ModuleNotWired />
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="success">{staffSummary.available} available</Badge>
                  <Badge tone="warning">{staffSummary.busy} busy</Badge>
                  <Badge>{staffSummary.off} off</Badge>
                </div>
                <p className="mt-3 text-sm text-[var(--ob-text-secondary)]">
                  {staffSummary.onShiftNow} of {staffSummary.active} on shift right now
                </p>
              </>
            )}
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Low stock</h2>
              <ModuleLink href="/manager/products/inventory" />
            </div>
            {lowStockCount > stockRows.length ? (
              <p className="mb-2 text-xs text-[var(--ob-text-muted)]">
                {lowStockCount} items at or below their reorder level
              </p>
            ) : null}
            {stockRows.length ? (
              <ul className="space-y-2">
                {stockRows.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 border-b border-[var(--ob-border)] pb-2 text-sm last:border-0 last:pb-0"
                  >
                    <span className="min-w-0 truncate">{row.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-[var(--ob-text-muted)]">
                        reorder at {row.threshold}
                      </span>
                      <Badge tone={row.stock <= 0 ? "danger" : "warning"}>
                        {row.stock} left
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--ob-text-muted)]">
                Every stocked item is above its reorder level.
              </p>
            )}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function LinkedStat({
  href,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  href: string;
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down" | "neutral";
}) {
  return (
    <Link href={href} className="block focus-visible:outline-none">
      <StatCard label={label} value={value} hint={hint} tone={tone} />
    </Link>
  );
}

function QuickAction({
  href,
  primary,
  children,
}: {
  href: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "rounded-full bg-[var(--ob-primary)] px-2.5 py-1.5 text-xs font-medium text-white sm:px-3"
          : "rounded-full border border-[var(--ob-border)] px-2.5 py-1.5 text-xs font-medium sm:px-3"
      }
    >
      {children}
    </Link>
  );
}

function ModuleLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="text-xs font-medium text-[var(--ob-primary)] hover:underline"
    >
      Open
    </Link>
  );
}

function ModuleNotWired() {
  return (
    <p className="text-sm text-[var(--ob-text-muted)]">
      Not connected for this workspace yet — Supabase tables for the Manager
      modules are still being wired up.
    </p>
  );
}

function SeverityDot({ severity }: { severity: NotificationSeverity }) {
  const color =
    severity === "critical"
      ? "bg-[var(--ob-danger)]"
      : severity === "warning"
        ? "bg-[var(--ob-warning)]"
        : "bg-[var(--ob-text-muted)]";
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`}
    />
  );
}

const TIME_FORMAT = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
});

const WHEN_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : TIME_FORMAT.format(date);
}

function formatWhen(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : WHEN_FORMAT.format(date);
}
