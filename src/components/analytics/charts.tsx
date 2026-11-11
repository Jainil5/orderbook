"use client";

import { useId, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, type OdometerFormat } from "@/lib/format";
import { Odometer } from "@/components/ui/odometer";
import { cn } from "@/lib/cn";
import type { Slice, TrendPoint } from "@/lib/analytics/snapshot";

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
        <p
          key={String(entry.dataKey)}
          className="flex items-baseline gap-1.5"
          style={{ color: entry.color }}
        >
          <span>{entry.name}:</span>
          {entry.dataKey === "orders" ? (
            <Odometer
              value={Number(entry.value ?? 0)}
              format={{ kind: "number" }}
              duration={0.35}
            >
              {String(entry.value)}
            </Odometer>
          ) : (
            <Odometer
              value={Number(entry.value ?? 0)}
              format={{ kind: "currency", currency }}
              decimals={0}
              duration={0.35}
            >
              {formatMoney(Number(entry.value ?? 0), currency)}
            </Odometer>
          )}
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
    margin: { top: 20, right: showOrders && showRevenue ? 8 : 0, left: 0, bottom: 0 },
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
      <Tooltip
        cursor={{
          stroke: "var(--ob-primary)",
          strokeWidth: 1,
          strokeDasharray: "4 4",
        }}
        content={<Tip currency={currency} />}
      />
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
              animationDuration={900}
            >
              <LabelList
                dataKey="revenue"
                position="top"
                formatter={(value) => compactMoney(Number(value), currency)}
                style={{ fontSize: 10, fill: "var(--ob-text-muted)" }}
              />
            </Bar>
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
              animationDuration={900}
              style={{ filter: "drop-shadow(0 0 6px var(--ob-series-1))" }}
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
              animationDuration={900}
              style={{ filter: "drop-shadow(0 0 6px var(--ob-series-1))" }}
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
              animationDuration={900}
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
              animationDuration={900}
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
  centerNumeric,
  centerFormat,
}: {
  data: (Slice & { color: string })[];
  centerLabel: string;
  centerValue: string;
  centerNumeric?: number;
  centerFormat?: OdometerFormat;
}) {
  const [active, setActive] = useState<number | null>(null);
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
            cornerRadius={6}
            stroke="none"
            animationDuration={900}
            onMouseEnter={(_, index) => setActive(index)}
            onMouseLeave={() => setActive(null)}
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={entry.color}
                style={
                  active === index
                    ? { filter: `drop-shadow(0 0 8px ${entry.color})` }
                    : undefined
                }
              />
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
          {centerNumeric !== undefined && centerFormat ? (
            <Odometer value={centerNumeric} format={centerFormat} duration={0.9}>
              {centerValue}
            </Odometer>
          ) : (
            centerValue
          )}
        </span>
      </div>
    </div>
  );
}

export function Sparkline({
  data,
  color = "var(--ob-series-1)",
  height = 44,
}: {
  data: number[];
  color?: string;
  height?: number;
}) {
  const gradientId = `spark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const points = data.map((value, index) => ({ index, value }));
  if (points.length < 2) return null;
  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Compact line/area chart sized for the Overview carousel's mini-chart row.
 * No axes or grid — just the filled shape plus a hover tooltip, so every
 * mini card in the row reads at the same height.
 */
export function MiniTrend({
  data,
  metric,
  currency,
  heightClass = "h-28",
}: {
  data: TrendPoint[];
  metric: Metric;
  currency: string;
  heightClass?: string;
}) {
  const gradientId = `mini-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const color = metric === "revenue" ? "var(--ob-series-1)" : "var(--ob-series-2)";
  if (data.length < 2) {
    return <p className={cn("flex items-center justify-center text-xs text-[var(--ob-text-muted)]", heightClass)}>Not enough data.</p>;
  }
  return (
    <div className={heightClass}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "4 4" }}
            content={<Tip currency={currency} />}
          />
          <Area
            type="monotone"
            dataKey={metric}
            name={metric === "revenue" ? "Revenue" : "Orders"}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            animationDuration={900}
            style={{ filter: `drop-shadow(0 0 5px ${color})` }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Compact donut for the mini-chart row: a thinner ring and a small centered
 * label, matching MiniTrend's height so the carousel cards stay uniform.
 */
export function MiniDonut({
  data,
  centerLabel,
  centerValue,
  heightClass = "h-28",
}: {
  data: (Slice & { color: string })[];
  centerLabel: string;
  centerValue: string;
  heightClass?: string;
}) {
  if (!data.length) {
    return <p className={cn("flex items-center justify-center text-xs text-[var(--ob-text-muted)]", heightClass)}>No data.</p>;
  }
  return (
    <div className={cn("relative", heightClass)}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="78%"
            paddingAngle={data.length > 1 ? 2 : 0}
            cornerRadius={4}
            stroke="none"
            animationDuration={900}
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
        <span className="text-[10px] uppercase tracking-wide text-[var(--ob-text-muted)]">
          {centerLabel}
        </span>
        <span className="max-w-[6rem] text-center text-xs font-semibold">{centerValue}</span>
      </div>
    </div>
  );
}
