"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { AnalyticsPaymentsTable } from "@/components/analytics/analytics-payments-table";
import { RangeSelector } from "@/components/workspace/range-selector";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs } from "@/components/ui/tabs";
import { LoopRow } from "@/components/effects/loop-row";
import { CHART_COLORS } from "@/components/analytics/charts";
import { formatMoney } from "@/lib/format";
import type { AnalyticsSnapshot, Slice, TrendPoint } from "@/lib/analytics/snapshot";
import type { MarginSnapshot } from "@/lib/analytics/margin";
import type { RangePreset } from "@/lib/analytics/date-range";
import type { Payment } from "@/types/database";
import { SlidersHorizontal } from "lucide-react";

const TrendChart = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.TrendChart),
  { ssr: false, loading: () => <ChartFrame /> },
);
const ShareDonut = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.ShareDonut),
  { ssr: false, loading: () => <ChartFrame /> },
);
function RankBars({
  data,
}: {
  data: { name: string; value: number; color: string }[];
}) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <ul className="space-y-3">
      {data.map((item) => (
        <li key={item.name}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{item.name}</span>
            <span className="shrink-0 text-[var(--ob-text-muted)]">{item.value}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[var(--ob-surface-muted)]">
            <div
              className="ob-grow-bar h-full origin-left rounded-full"
              style={{
                width: `${(item.value / max) * 100}%`,
                background: item.color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "trends", label: "Trends" },
  { id: "mix", label: "Mix" },
  { id: "products", label: "Products" },
  { id: "payments", label: "Payments" },
  { id: "margin", label: "Margin & COGS" },
] as const;

const DAY_PARTS = [
  { id: "week", label: "Full week" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekend", label: "Weekend" },
] as const;

const CHARTS = [
  { id: "area", label: "Area" },
  { id: "bar", label: "Bars" },
  { id: "line", label: "Line" },
] as const;

const PANELS = [
  { id: "summary", label: "Summary" },
  { id: "trend", label: "Trend" },
  { id: "categories", label: "Categories" },
  { id: "products", label: "Products" },
  { id: "payments", label: "Payments" },
  { id: "orders", label: "Order status" },
] as const;

type TabId = (typeof TABS)[number]["id"];
type DayPartId = (typeof DAY_PARTS)[number]["id"];
type ChartId = (typeof CHARTS)[number]["id"];
type PanelId = (typeof PANELS)[number]["id"];
type Metric = "revenue" | "orders";

function tabFromParam(value: string | null): TabId | null {
  if (value === "overview" || value === "trends" || value === "mix") return value;
  if (value === "products" || value === "payments" || value === "margin") return value;
  return null;
}

const WEEKDAYS = new Set(["Mon", "Tue", "Wed", "Thu", "Fri"]);
const WEEKEND = new Set(["Sat", "Sun"]);
const STORAGE_KEY = "orderbook.analytics.view";

function ChartFrame() {
  return (
    <div className="h-64 animate-pulse rounded-xl bg-[var(--ob-surface-muted)]" />
  );
}

function colorize(items: Slice[]) {
  return items.map((item, index) => ({
    ...item,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
}

function sum(items: { value: number }[]) {
  return items.reduce((total, item) => total + item.value, 0);
}

function filterTrend(points: TrendPoint[], dayPart: DayPartId) {
  if (dayPart === "week") return points;
  const allowed = dayPart === "weekdays" ? WEEKDAYS : WEEKEND;
  const next = points.filter((point) => allowed.has(point.date));
  return next.length ? next : points;
}

function momentum(points: TrendPoint[]) {
  if (points.length < 2) return null;
  const mid = Math.ceil(points.length / 2);
  const early = points.slice(0, mid).reduce((total, point) => total + point.revenue, 0);
  const late = points.slice(mid).reduce((total, point) => total + point.revenue, 0);
  if (early === 0) return null;
  return ((late - early) / early) * 100;
}

function SliceList({
  items,
  hidden,
  onToggle,
  formatValue,
}: {
  items: (Slice & { color: string })[];
  hidden: string[];
  onToggle: (name: string) => void;
  formatValue: (value: number) => string;
}) {
  const visibleTotal = sum(items.filter((item) => !hidden.includes(item.name)));
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const on = !hidden.includes(item.name);
        const share = on && visibleTotal ? (item.value / visibleTotal) * 100 : 0;
        return (
          <li key={item.name}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(item.name)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--ob-surface-muted)]"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: on ? item.color : "var(--ob-border-strong)" }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3 text-sm">
                  <span className={on ? "" : "text-[var(--ob-text-muted)] line-through"}>
                    {item.name}
                  </span>
                  <span className="font-medium">{formatValue(item.value)}</span>
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--ob-surface-muted)]">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${share}%`, background: item.color, opacity: on ? 1 : 0.25 }}
                  />
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function AnalyticsStudio({
  snapshot,
  notice,
  rangeNotice,
  payments,
  paymentsNotice,
  initialTab,
  rangeFrom,
  rangeTo,
  rangePreset,
  marginSnapshot,
}: {
  snapshot: AnalyticsSnapshot;
  notice?: string;
  rangeNotice?: string;
  payments: Payment[];
  paymentsNotice?: string;
  initialTab?: TabId;
  rangeFrom?: string;
  rangeTo?: string;
  rangePreset?: RangePreset | null;
  marginSnapshot?: MarginSnapshot;
}) {
  const searchParams = useSearchParams();
  const tabFromUrl = tabFromParam(searchParams.get("tab"));
  const targetTab = initialTab ?? tabFromUrl;
  const [tab, setTab] = useState<TabId>(targetTab ?? "overview");
  const [prevTargetTab, setPrevTargetTab] = useState<TabId | null | undefined>(
    targetTab,
  );
  if (targetTab && targetTab !== prevTargetTab) {
    setPrevTargetTab(targetTab);
    setTab(targetTab);
  }
  const [dayPart, setDayPart] = useState<DayPartId>("week");
  const [chart, setChart] = useState<ChartId>("area");
  const [metrics, setMetrics] = useState<Metric[]>(["revenue"]);
  const [panels, setPanels] = useState<PanelId[]>(PANELS.map((panel) => panel.id));
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
  const [hiddenMethods, setHiddenMethods] = useState<string[]>([]);
  const [hiddenProducts, setHiddenProducts] = useState<string[]>([]);
  const [customize, setCustomize] = useState(false);

  useEffect(() => {
    const fromUrl = tabFromParam(searchParams.get("tab"));
    if (fromUrl) return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as {
        tab?: TabId;
        dayPart?: DayPartId;
        chart?: ChartId;
        metrics?: Metric[];
        panels?: PanelId[];
      };
      queueMicrotask(() => {
        if (saved.tab) setTab(saved.tab);
        if (saved.dayPart) setDayPart(saved.dayPart);
        if (saved.chart) setChart(saved.chart);
        if (saved.metrics?.length) setMetrics(saved.metrics);
        if (saved.panels?.length) setPanels(saved.panels);
      });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [searchParams]);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ tab, dayPart, chart, metrics, panels }),
    );
  }, [tab, dayPart, chart, metrics, panels]);

  const currency = snapshot.currencyCode;
  const money = (value: number) => formatMoney(value, currency);
  const trend = useMemo(
    () => filterTrend(snapshot.salesOverTime, dayPart),
    [snapshot.salesOverTime, dayPart],
  );
  const categories = colorize(snapshot.salesByCategory);
  const methods = colorize(snapshot.paymentMethods);
  const statuses = colorize(snapshot.orderStatuses);
  const paymentStatuses = colorize(snapshot.paymentStatuses);
  const products = snapshot.topProducts.map((product, index) => ({
    name: product.name,
    value: product.qty,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  const visibleCategories = categories.filter(
    (item) => !hiddenCategories.includes(item.name),
  );
  const visibleMethods = methods.filter((item) => !hiddenMethods.includes(item.name));
  const visibleProducts = products.filter(
    (item) => !hiddenProducts.includes(item.name),
  );

  const show = (panel: PanelId) => panels.includes(panel);
  const delta = momentum(snapshot.salesOverTime);
  const collected = snapshot.paidAmount + snapshot.pendingAmount;
  const collectionRate = collected ? (snapshot.paidAmount / collected) * 100 : 0;
  const bestDay = [...snapshot.salesOverTime].sort((a, b) => b.revenue - a.revenue)[0];

  function toggleMetric(metric: Metric) {
    setMetrics((current) => {
      if (current.includes(metric)) {
        return current.length === 1 ? current : current.filter((item) => item !== metric);
      }
      return [...current, metric];
    });
  }

  function toggleName(list: string[], name: string, setList: (next: string[]) => void) {
    setList(list.includes(name) ? list.filter((item) => item !== name) : [...list, name]);
  }

  function togglePanel(panel: PanelId) {
    setPanels((current) => {
      if (current.includes(panel)) {
        return current.length === 1 ? current : current.filter((item) => item !== panel);
      }
      return [...current, panel];
    });
  }

  const topProduct = snapshot.topProducts[0];
  const openOrders = snapshot.orderStatuses.reduce(
    (total, slice) =>
      slice.name.toLowerCase() === "completed" ? total : total + slice.value,
    0,
  );

  const kpiCards = [
    <StatCard
      key="net"
      label="Net sales"
      value={money(snapshot.netSales)}
      numericValue={snapshot.netSales}
      format={{ kind: "currency", currency }}
      spark={trend.map((point) => point.revenue)}
      hint={
        delta === null
          ? undefined
          : `${delta >= 0 ? "Up" : "Down"} ${Math.abs(delta).toFixed(0)}% later in the sample`
      }
      tone={delta === null ? "neutral" : delta >= 0 ? "up" : "down"}
    />,
    <StatCard
      key="orders"
      label="Orders"
      value={snapshot.orderCount.toString()}
      hint="In this sample"
      numericValue={snapshot.orderCount}
      spark={trend.map((point) => point.orders)}
    />,
    <StatCard
      key="aov"
      label="Avg. order"
      value={money(snapshot.averageOrderValue)}
      numericValue={snapshot.averageOrderValue}
      format={{ kind: "currency", currency }}
      hint={snapshot.itemsSold ? `${snapshot.itemsSold} items sold` : undefined}
    />,
    <StatCard
      key="collected"
      label="Collected"
      value={`${collectionRate.toFixed(0)}%`}
      numericValue={collectionRate / 100}
      format={{ kind: "percent" }}
      hint={`${money(snapshot.paidAmount)} in · ${money(snapshot.pendingAmount)} open`}
      tone={collectionRate >= 80 ? "up" : collectionRate >= 40 ? "neutral" : "down"}
    />,
  ];

  const summaryGrid = (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpiCards}</div>
  );

  const trendCard = (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Sales trend</h2>
          <p className="text-xs text-[var(--ob-text-muted)]">
            {dayPart === "week"
              ? "Entire sample"
              : dayPart === "weekdays"
                ? "Monday to Friday"
                : "Saturday and Sunday"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Chart style"
            value={chart}
            onChange={setChart}
            options={[...CHARTS]}
          />
          {(["revenue", "orders"] as const).map((metric) => {
            const on = metrics.includes(metric);
            return (
              <button
                key={metric}
                type="button"
                aria-pressed={on}
                onClick={() => toggleMetric(metric)}
                className={
                  on
                    ? "rounded-full bg-[var(--ob-primary)] px-3 py-1.5 text-xs font-medium text-[var(--ob-primary-foreground)]"
                    : "rounded-full border border-[var(--ob-border)] px-3 py-1.5 text-xs font-medium"
                }
              >
                {metric === "revenue" ? "Revenue" : "Orders"}
              </button>
            );
          })}
        </div>
      </div>
      {trend.length ? (
        <TrendChart data={trend} metrics={metrics} kind={chart} currency={currency} />
      ) : (
        <p className="py-16 text-center text-sm text-[var(--ob-text-muted)]">
          Nothing in this range.
        </p>
      )}
    </Card>
  );

  const categoriesMix = (
    <MixCard
      title="Sales by category"
      items={categories}
      visible={visibleCategories}
      hidden={hiddenCategories}
      onToggle={(name) => toggleName(hiddenCategories, name, setHiddenCategories)}
      formatValue={money}
      centerLabel="Categories"
      centerValue={money(sum(visibleCategories))}
      centerNumeric={sum(visibleCategories)}
      centerFormat={{ kind: "currency", currency }}
      emptyLabel="Category mix is not in this workspace yet."
    />
  );

  const statusMix = (
    <MixCard
      title="Orders by status"
      items={statuses}
      visible={statuses}
      hidden={[]}
      onToggle={() => undefined}
      formatValue={(value) => `${value} ${value === 1 ? "order" : "orders"}`}
      centerLabel="Orders"
      centerValue={String(sum(statuses))}
      centerNumeric={sum(statuses)}
      emptyLabel="No order statuses to chart."
      lockLegend
    />
  );

  const tenderMix = (
    <MixCard
      title="Tender mix"
      items={methods}
      visible={visibleMethods}
      hidden={hiddenMethods}
      onToggle={(name) => toggleName(hiddenMethods, name, setHiddenMethods)}
      formatValue={money}
      centerLabel="Collected"
      centerValue={money(sum(visibleMethods))}
      centerNumeric={sum(visibleMethods)}
      centerFormat={{ kind: "currency", currency }}
      emptyLabel="Payment methods are not in this workspace yet."
    />
  );

  const mixGrid = (
    <div className="grid gap-4 lg:grid-cols-2">
      {categoriesMix}
      {statusMix}
    </div>
  );

  const productsCard = (
    <Card>
      <h2 className="text-sm font-semibold">Top products</h2>
      <p className="mb-4 text-xs text-[var(--ob-text-muted)]">
        Tap a product to hide it from the ranking.
      </p>
      {products.length === 0 ? (
        <p className="py-10 text-sm text-[var(--ob-text-muted)]">
          Product ranking needs line items.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
          {visibleProducts.length ? (
            <RankBars data={visibleProducts} />
          ) : (
            <p className="py-16 text-center text-sm text-[var(--ob-text-muted)]">
              Turn a product back on to see the ranking.
            </p>
          )}
          <SliceList
            items={products}
            hidden={hiddenProducts}
            onToggle={(name) => toggleName(hiddenProducts, name, setHiddenProducts)}
            formatValue={(value) => `${value} sold`}
          />
        </div>
      )}
    </Card>
  );

  const collectionsCard = (
    <Card>
      <h2 className="text-sm font-semibold">Collections</h2>
      <p className="mt-1 text-2xl font-semibold tracking-tight">
        {collectionRate.toFixed(0)}%
      </p>
      <p className="text-xs text-[var(--ob-text-muted)]">of billed value marked paid</p>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--ob-surface-muted)]">
        <div
          className="h-full rounded-full bg-[var(--ob-accent)]"
          style={{ width: `${Math.min(collectionRate, 100)}%` }}
        />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--ob-text-muted)]">Paid</dt>
          <dd className="font-medium">{money(snapshot.paidAmount)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--ob-text-muted)]">Still open</dt>
          <dd className="font-medium">{money(snapshot.pendingAmount)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--ob-text-muted)]">Discounts</dt>
          <dd className="font-medium">{money(snapshot.discountTotal)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--ob-text-muted)]">Gross</dt>
          <dd className="font-medium">{money(snapshot.grossSales)}</dd>
        </div>
      </dl>
      {paymentStatuses.length ? (
        <div className="mt-4">
          <ShareDonut
            data={paymentStatuses}
            centerLabel="Bills"
            centerValue={String(sum(paymentStatuses))}
            centerNumeric={sum(paymentStatuses)}
          />
        </div>
      ) : null}
    </Card>
  );

  const paymentsGrid = (
    <div className="grid gap-4 lg:grid-cols-2">
      {tenderMix}
      {collectionsCard}
    </div>
  );

  const paymentRecords = (
    <div>
      <h2 className="mb-3 text-sm font-semibold">Payment records</h2>
      {paymentsNotice ? (
        <p role="alert" className="mb-3 text-sm text-[var(--ob-danger)]">{paymentsNotice}</p>
      ) : null}
      <AnalyticsPaymentsTable
        payments={payments}
        currencyCode={currency}
        emptyDescription={
          snapshot.partial
            ? "Connect the payments table under RLS to list settlement records here."
            : undefined
        }
      />
    </div>
  );

  const marginView = marginSnapshot ? (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue (lines)"
          value={money(marginSnapshot.revenue)}
          hint="Excludes credit notes"
          numericValue={marginSnapshot.revenue}
          format={{ kind: "currency", currency }}
        />
        <StatCard
          label="COGS"
          value={money(marginSnapshot.cost)}
          hint="From product cost price"
          numericValue={marginSnapshot.cost}
          format={{ kind: "currency", currency }}
        />
        <StatCard
          label="Gross margin"
          value={money(marginSnapshot.margin)}
          tone={marginSnapshot.margin >= 0 ? "up" : "down"}
          numericValue={marginSnapshot.margin}
          format={{ kind: "currency", currency }}
        />
        <StatCard
          label="Margin %"
          value={`${marginSnapshot.marginPercent.toFixed(1)}%`}
          numericValue={marginSnapshot.marginPercent / 100}
          format={{ kind: "percent" }}
        />
      </div>
      <Card>
        <h2 className="text-sm font-semibold">Top lines by margin</h2>
        {marginSnapshot.lines.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-[var(--ob-text-muted)]">
                <tr>
                  <th className="py-2 pr-4">Item</th>
                  <th className="py-2 pr-4">Qty</th>
                  <th className="py-2 pr-4">Revenue</th>
                  <th className="py-2 pr-4">Cost</th>
                  <th className="py-2">Margin</th>
                </tr>
              </thead>
              <tbody>
                {marginSnapshot.lines.map((line, i) => (
                  <tr
                    key={`${line.name}-${i}`}
                    className="border-t border-[var(--ob-border)]"
                  >
                    <td className="py-2 pr-4">{line.name}</td>
                    <td className="py-2 pr-4">{line.qty}</td>
                    <td className="py-2 pr-4">{money(line.revenue)}</td>
                    <td className="py-2 pr-4">{money(line.cost)}</td>
                    <td className="py-2 font-medium">{money(line.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[var(--ob-text-muted)]">
            Add cost prices on products and orders in this date range to
            see margin.
          </p>
        )}
      </Card>
    </div>
  ) : null;

  const marginTileCard = marginSnapshot ? (
    <Card>
      <h2 className="text-sm font-semibold">Margin snapshot</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--ob-text-muted)]">Revenue (lines)</dt>
          <dd className="font-medium">{money(marginSnapshot.revenue)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--ob-text-muted)]">Gross margin</dt>
          <dd className="font-medium">{money(marginSnapshot.margin)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--ob-text-muted)]">Margin %</dt>
          <dd className="font-medium">{marginSnapshot.marginPercent.toFixed(1)}%</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--ob-text-muted)]">COGS</dt>
          <dd className="font-medium">{money(marginSnapshot.cost)}</dd>
        </div>
      </dl>
    </Card>
  ) : null;

  const categoryListTile = categories.length ? (
    <Card>
      <h2 className="mb-3 text-sm font-semibold">Sales by category</h2>
      {visibleCategories.length ? (
        <RankBars data={visibleCategories} />
      ) : (
        <p className="py-6 text-sm text-[var(--ob-text-muted)]">
          All categories are hidden.
        </p>
      )}
    </Card>
  ) : null;

  const bestDayTile = bestDay ? (
    <StatCard
      label="Best day"
      value={money(bestDay.revenue)}
      numericValue={bestDay.revenue}
      format={{ kind: "currency", currency }}
      hint={`${bestDay.date} in the sample`}
    />
  ) : null;

  const momentumTile = (
    <StatCard
      label="Momentum"
      value={delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`}
      hint="Later vs earlier in the sample"
      tone={delta === null ? "neutral" : delta >= 0 ? "up" : "down"}
    />
  );

  const overviewMetrics = [
    ...(show("summary") ? kpiCards : []),
    ...(show("products") && topProduct
      ? [
          <StatCard
            key="top-product"
            label="Top product"
            value={topProduct.name}
            hint={`${topProduct.qty} sold in this sample`}
          />,
        ]
      : []),
    ...(show("orders")
      ? [
          <StatCard
            key="open-orders"
            label="Open orders"
            value={String(openOrders)}
            numericValue={openOrders}
            hint="Not completed in this sample"
          />,
        ]
      : []),
  ];

  const overviewTiles = [
    ...(show("payments") ? [collectionsCard] : []),
    ...(marginTileCard ? [marginTileCard] : []),
    ...(show("categories") && categoryListTile ? [categoryListTile] : []),
    ...(show("trend") && bestDayTile ? [bestDayTile] : []),
    ...(show("trend") ? [momentumTile] : []),
  ];

  const overviewCharts = [
    ...(show("trend") ? [trendCard] : []),
    ...(show("categories") ? [categoriesMix] : []),
    ...(show("orders") ? [statusMix] : []),
    ...(show("payments") ? [tenderMix] : []),
    ...(show("products") ? [productsCard] : []),
  ];

  const empty = snapshot.orderCount === 0 && snapshot.netSales === 0;

  return (
    <PageShell
      title="Analytics"
      headerActions={
        <div className="hidden items-center gap-2 sm:flex">
          <SegmentedControl
            label="Trend days"
            value={dayPart}
            onChange={setDayPart}
            options={[...DAY_PARTS]}
          />
        </div>
      }
    >
      {rangeFrom && rangeTo ? (
        <RangeSelector
          basePath="/analytics"
          initialFrom={rangeFrom}
          initialTo={rangeTo}
          initialPreset={rangePreset ?? null}
        />
      ) : null}
      {rangeNotice ? (
        <p className="mb-3 text-xs text-[var(--ob-text-muted)]">{rangeNotice}</p>
      ) : null}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--ob-text-secondary)]">
            Gross {money(snapshot.grossSales)} · Net {money(snapshot.netSales)}
            {bestDay ? ` · Strongest day ${bestDay.date}` : ""}
          </p>
          {snapshot.partial ? (
            <p className="mt-1 max-w-2xl text-xs text-[var(--ob-text-muted)]">
              Category, product, and tender charts appear when line items and payments
              are available. Trends and status use orders already in this workspace.
            </p>
          ) : (
            <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
              Summary covers every order in the selected date range. The trend chart
              additionally filters to the day parts chosen above.
            </p>
          )}
        </div>
        <button
          type="button"
          aria-expanded={customize}
          onClick={() => setCustomize((open) => !open)}
          className="ob-press inline-flex min-h-[2.75rem] items-center gap-2 rounded-full border border-[var(--ob-border)] bg-[var(--ob-surface)] px-3 py-1.5 text-xs font-medium"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          Customize view
        </button>
      </div>

      {notice ? (
        <p className="mb-4 text-sm text-[var(--ob-danger)]" role="alert">
          {notice}
        </p>
      ) : null}

      <div className="mb-4 sm:hidden">
        <SegmentedControl
          label="Trend days"
          value={dayPart}
          onChange={setDayPart}
          options={[...DAY_PARTS]}
        />
      </div>

      <Tabs label="Analytics sections" value={tab} onChange={setTab} options={[...TABS]} />

      {customize ? (
        <Card className="mt-4">
          <p className="text-sm font-semibold">What to show on Overview</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PANELS.map((panel) => {
              const on = panels.includes(panel.id);
              return (
                <button
                  key={panel.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => togglePanel(panel.id)}
                  className={
                    on
                      ? "rounded-full bg-[var(--ob-primary)] px-3 py-1.5 text-xs font-medium text-[var(--ob-primary-foreground)]"
                      : "rounded-full bg-[var(--ob-surface-muted)] px-3 py-1.5 text-xs font-medium text-[var(--ob-text-secondary)]"
                  }
                >
                  {panel.label}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <SegmentedControl
              label="Chart style"
              value={chart}
              onChange={setChart}
              options={[...CHARTS]}
            />
            <div className="flex gap-2">
              {(["revenue", "orders"] as const).map((metric) => {
                const on = metrics.includes(metric);
                return (
                  <button
                    key={metric}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleMetric(metric)}
                    className={
                      on
                        ? "rounded-full bg-[var(--ob-accent)] px-3 py-1.5 text-xs font-medium text-[var(--ob-primary-foreground)]"
                        : "rounded-full bg-[var(--ob-surface-muted)] px-3 py-1.5 text-xs font-medium"
                    }
                  >
                    {metric === "revenue" ? "Revenue" : "Orders"}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      ) : null}

      {empty ? (
        <Card className="mt-4">
          <p className="text-sm font-medium">No orders to chart yet</p>
          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
            Once orders land in this workspace, these tabs fill in with sales, mix, and payments.
          </p>
        </Card>
      ) : (
        <div className="relative mt-4 space-y-4">
          {tab === "overview" ? (
            <div className="space-y-5">
              <LoopRow
                ariaLabel="Key metrics"
                speed={30}
                itemClassName="w-64 sm:w-72"
                items={overviewMetrics}
              />
              <LoopRow
                ariaLabel="Operational tiles"
                speed={24}
                itemClassName="w-72 sm:w-80"
                items={overviewTiles}
              />
              <LoopRow
                ariaLabel="Analysis charts"
                speed={18}
                itemClassName="w-[min(88vw,34rem)]"
                items={overviewCharts}
              />
            </div>
          ) : null}

          <TabPanel active={tab === "trends"} className="space-y-4">
            {summaryGrid}
            {trendCard}
          </TabPanel>

          <TabPanel active={tab === "mix"}>{mixGrid}</TabPanel>

          <TabPanel active={tab === "products"}>{productsCard}</TabPanel>

          <TabPanel active={tab === "payments"} className="space-y-4">
            {summaryGrid}
            {paymentsGrid}
            {paymentRecords}
          </TabPanel>

          <TabPanel active={tab === "margin"}>{marginView}</TabPanel>
        </div>
      )}
    </PageShell>
  );
}

/**
 * Tabs keep every panel mounted for instant switches. `display: none` would
 * make recharts measure 0x0 (console warnings + wasted layout work), so
 * inactive panels are invisible absolute overlays instead: they keep a real
 * layout box but stay out of the flow, the paint, and the a11y tree.
 */
function TabPanel({
  active,
  className,
  children,
}: {
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (active) return <div className={className}>{children}</div>;
  return (
    <div
      className={`invisible pointer-events-none absolute inset-x-0 top-0 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function MixCard({
  title,
  items,
  visible,
  hidden,
  onToggle,
  formatValue,
  centerLabel,
  centerValue,
  centerNumeric,
  centerFormat,
  emptyLabel,
  lockLegend,
}: {
  title: string;
  items: (Slice & { color: string })[];
  visible: (Slice & { color: string })[];
  hidden: string[];
  onToggle: (name: string) => void;
  formatValue: (value: number) => string;
  centerLabel: string;
  centerValue: string;
  centerNumeric?: number;
  centerFormat?: { kind: "currency"; currency: string } | { kind: "number" } | { kind: "percent" };
  emptyLabel: string;
  lockLegend?: boolean;
}) {
  return (
    <Card>
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {items.length === 0 ? (
        <p className="py-10 text-sm text-[var(--ob-text-muted)]">{emptyLabel}</p>
      ) : (
        <div className="grid items-center gap-2 sm:grid-cols-2">
          {visible.length ? (
            <ShareDonut
              data={visible}
              centerLabel={centerLabel}
              centerValue={centerValue}
              centerNumeric={centerNumeric}
              centerFormat={centerFormat}
            />
          ) : (
            <p className="py-16 text-center text-sm text-[var(--ob-text-muted)]">
              Select at least one slice.
            </p>
          )}
          {lockLegend ? (
            <ul className="space-y-2 text-sm">
              {items.map((item) => (
                <li key={item.name} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: item.color }}
                    />
                    {item.name}
                  </span>
                  <span className="font-medium">{formatValue(item.value)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <SliceList
              items={items}
              hidden={hidden}
              onToggle={onToggle}
              formatValue={formatValue}
            />
          )}
        </div>
      )}
    </Card>
  );
}
