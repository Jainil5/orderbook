"use client";

import dynamic from "next/dynamic";
import { CHART_COLORS } from "@/components/analytics/charts";

// Recharts only renders in the browser, so the donut is loaded lazily exactly
// the way the dashboard and analytics screens load theirs.
const ShareDonut = dynamic(
  () => import("@/components/analytics/charts").then((m) => m.ShareDonut),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 animate-pulse rounded-xl bg-[var(--ob-surface-muted)]" />
    ),
  },
);

export type MixSlice = { name: string; value: number };

/** Revenue or margin mix for one product group, in the shared chart palette. */
export function ProductMixChart({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: MixSlice[];
  centerLabel: string;
  centerValue: string;
}) {
  return (
    <ShareDonut
      data={slices.map((slice, index) => ({
        ...slice,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }))}
      centerLabel={centerLabel}
      centerValue={centerValue}
    />
  );
}
