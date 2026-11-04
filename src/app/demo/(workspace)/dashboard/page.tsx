"use client";

import { DemoPageShell } from "@/components/workspace/demo-page-shell";
import { Card } from "@/components/ui/card";
import { getDemoAnalytics } from "@/lib/demo/data";
import { formatMoney } from "@/lib/format";
import { useDemoWorkspace } from "@/components/workspace/demo-workspace-provider";

export default function DemoDashboardPage() {
  const { settings } = useDemoWorkspace();
  const a = getDemoAnalytics();
  const currency = settings.currency_code;

  return (
    <DemoPageShell title="Dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Net sales (sample)", value: formatMoney(a.netSales, currency) },
          { label: "Orders", value: a.orderCount.toString() },
          { label: "Avg. order value", value: formatMoney(a.averageOrderValue, currency) },
          { label: "Discounts", value: formatMoney(a.discountTotal, currency) },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
              {kpi.label}
            </p>
            <p className="mt-2 text-2xl font-semibold">{kpi.value}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <p className="text-sm text-[var(--ob-text-secondary)]">
          Sample KPIs from the isolated demo dataset. Live dashboards use secured
          Supabase aggregates when configured.
        </p>
      </Card>
    </DemoPageShell>
  );
}
