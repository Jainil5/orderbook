"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/format";
import type { Slice, TrendPoint } from "@/lib/analytics/snapshot";

export const CHART_COLORS = [
  "var(--ob-series-1)",
  "var(--ob-series-2)",
  "var(--ob-series-3)",
  "var(--ob-series-4)",
  "var(--ob-series-5)",
  "var(--ob-series-6)",
  "var(--ob-series-7)",
  "var(--ob-series-8)",
];

const grid = "var(--ob-border)";
const tick = { fontSize: 12, fill: "var(--ob-text-muted)" };

type Metric = "revenue" | "orders";
type ChartKind = "area" | "bar" | "line";

function compactMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function Tip({
  active,
  label,
  payload,
  currency,
}: {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--ob-border)] bg-[var(--ob-surface)] px-3 py-2 text-xs text-[var(--ob-text)] shadow-md">
      <p className="mb-1 font-medium text-[var(--ob-text)]">{label}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} style={{ color: entry.color }}>
          {entry.name}:{" "}
          {entry.dataKey === "orders"
            ? entry.value
            : formatMoney(Number(entry.value ?? 0), currency)}
        </p>
      ))}
    </div>
  );
}

export function TrendChart({
  data,
  metrics,
  kind,
  currency,
}: {
  data: TrendPoint[];
  metrics: Metric[];
  kind: ChartKind;
  currency: string;
}) {
  const showRevenue = metrics.includes("revenue");
  const showOrders = metrics.includes("orders");
  const common = {
    data,
    margin: { top: 8, right: showOrders && showRevenue ? 8 : 0, left: 0, bottom: 0 },
  };

  const axes = (
    <>
      <CartesianGrid stroke={grid} vertical={false} />
      <XAxis dataKey="date" tick={tick} axisLine={false} tickLine={false} />
      {showRevenue ? (
        <YAxis
          yAxisId="revenue"
          tick={tick}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(value) => compactMoney(Number(value), currency)}
        />
      ) : null}
      {showOrders ? (
        <YAxis
          yAxisId="orders"
          orientation={showRevenue ? "right" : "left"}
          tick={tick}
          axisLine={false}
          tickLine={false}
          width={32}
          allowDecimals={false}
        />
      ) : null}
      <Tooltip content={<Tip currency={currency} />} />
    </>
  );

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart {...common}>
          <defs>
            <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ob-series-1)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--ob-series-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {axes}
          {showRevenue && kind === "bar" ? (
            <Bar
              yAxisId="revenue"
              dataKey="revenue"
              name="Revenue"
              fill="var(--ob-series-1)"
              radius={[6, 6, 0, 0]}
              maxBarSize={36}
            />
          ) : null}
          {showRevenue && kind === "line" ? (
            <Line
              yAxisId="revenue"
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="var(--ob-series-1)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "var(--ob-series-1)" }}
            />
          ) : null}
          {showRevenue && kind === "area" ? (
            <Area
              yAxisId="revenue"
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="var(--ob-series-1)"
              strokeWidth={2.5}
              fill="url(#revenueFill)"
            />
          ) : null}
          {showOrders && kind === "bar" ? (
            <Bar
              yAxisId="orders"
              dataKey="orders"
              name="Orders"
              fill="var(--ob-series-2)"
              radius={[6, 6, 0, 0]}
              maxBarSize={36}
            />
          ) : null}
          {showOrders && kind !== "bar" ? (
            <Line
              yAxisId="orders"
              type="monotone"
              dataKey="orders"
              name="Orders"
              stroke="var(--ob-series-2)"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "var(--ob-series-2)" }}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ShareDonut({
  data,
  centerLabel,
  centerValue,
}: {
  data: (Slice & { color: string })[];
  centerLabel: string;
  centerValue: string;
}) {
  return (
    <div className="relative h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="82%"
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="none"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) =>
              typeof value === "number" ? value.toLocaleString("en-IN") : value
            }
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] uppercase tracking-wide text-[var(--ob-text-muted)]">
          {centerLabel}
        </span>
        <span className="max-w-[7rem] text-center text-sm font-semibold">
          {centerValue}
        </span>
      </div>
    </div>
  );
}

