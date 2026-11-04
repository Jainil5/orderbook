"use client";

import dynamic from "next/dynamic";
import { PageShell } from "@/components/workspace/page-shell";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { getDemoAnalytics } from "@/lib/demo/data";
import { formatMoney } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

const DemoSalesChart = dynamic(
  () =>
    import("@/components/analytics/demo-sales-chart").then(
      (m) => m.DemoSalesChart,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center text-sm text-[var(--ob-text-muted)]">
        Loading chart…
      </div>
    ),
  },
);

export function AnalyticsDemoSection() {
  const ws = useWorkspace();
  const a = getDemoAnalytics();

  return (
    <PageShell title="Analytics">
      <p className="mb-4 text-sm text-[var(--ob-text-muted)]">
        Gross {formatMoney(a.grossSales, ws.settings.currency_code)} · Net{" "}
        {formatMoney(a.netSales, ws.settings.currency_code)}
      </p>
      <Card>
        <h2 className="mb-4 text-sm font-semibold">Sales over time</h2>
        <DemoSalesChart
          data={a.salesOverTime}
          currencyCode={ws.settings.currency_code}
        />
      </Card>
    </PageShell>
  );
}

export function AnalyticsLiveSection() {
  return (
    <PageShell title="Analytics">
      <EmptyState
        title="Analytics not configured"
        description="Provision secured Postgres views or RPCs so aggregates run server-side under RLS."
      />
    </PageShell>
  );
}
