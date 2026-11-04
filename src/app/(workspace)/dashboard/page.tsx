import { PageShell } from "@/components/workspace/page-shell";
import { Card } from "@/components/ui/card";
import { getDemoAnalytics } from "@/lib/demo/data";
import { formatMoney } from "@/lib/format";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode === "demo") {
    const a = getDemoAnalytics();
    const currency = ws.settings.currency_code;
    return (
      <PageShell title="Dashboard">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Net sales", value: formatMoney(a.netSales, currency) },
            { label: "Orders", value: a.orderCount.toString() },
            {
              label: "Avg. order value",
              value: formatMoney(a.averageOrderValue, currency),
            },
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
      </PageShell>
    );
  }

  return (
    <PageShell title="Dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {["Net sales", "Orders", "Avg. order value", "Pending payments"].map(
          (label) => (
            <Card key={label}>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
                {label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ob-text-muted)]">
                —
              </p>
            </Card>
          ),
        )}
      </div>
      <Card className="mt-6">
        <p className="text-sm text-[var(--ob-text-secondary)]">
          Connected as <strong>{ws.brand.name}</strong> ({ws.brand.code}).
          Analytics RPCs or secured views populate KPIs when configured.
        </p>
      </Card>
    </PageShell>
  );
}
