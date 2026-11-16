import { redirect } from "next/navigation";
import { ManagerSectionHeader, ManagerSubnav } from "@/components/manager/manager-ui";
import { ExpensesPanel } from "@/components/manager/finance/expenses-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/workspace/page-shell";
import { addCalendarMonths } from "@/lib/analytics/date-range";
import { businessDayOf, isoDay } from "@/lib/business/cash";
import { monthKey, type RevenueMonth } from "@/lib/business/expenses";
import { loadBusinessData } from "@/lib/business/registry";
import { listDemoOrders, toDemoBrandCode } from "@/lib/demo/data";
import { isPostedOrder } from "@/lib/orders/order-rules";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import type { Order } from "@/types/database";

export default async function FinanceExpensesPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("expenses")) redirect("/manager/finance");

  const header = (
    <ManagerSectionHeader
      title="Expenses"
      description="Money that left the business away from the counter — rent, supplies, wages, software. Each entry is one recorded outflow with a category, a date and a repeat period. Expenses are written here; payments and refunds are written on the order they belong to. There is no ledger behind this screen: no accruals, no depreciation and no tax treatment."
    />
  );

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Expenses">
        <ManagerSubnav manager="finance" activeHref="/manager/finance/expenses" />
        {header}
        <EmptyState
          title="Expenses are not connected to live workspaces yet"
          description="The live database has no expenses table (see docs/DATABASE_CONTRACT.md), so a live workspace cannot record or read expenses. Demo workspaces have the full expense book today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const [business, orders] = await Promise.all([
    loadBusinessData(code),
    listDemoOrders(undefined, code),
  ]);

  return (
    <PageShell title="Expenses">
      <ManagerSubnav manager="finance" activeHref="/manager/finance/expenses" />
      {header}
      <ExpensesPanel
        expenses={business.expenses}
        suppliers={business.suppliers.map((s) => ({ id: s.id, name: s.name }))}
        revenue={revenueByMonth(orders)}
        currencyCode={ws.settings.currency_code}
        canEdit
      />
    </PageShell>
  );
}

/**
 * Billed value per calendar month for the last six months. Revenue comes from
 * posted orders — the comparison in the panel is against what was invoiced, not
 * against cash received.
 */
function revenueByMonth(orders: Order[]): RevenueMonth[] {
  const totals = new Map<string, number>();
  for (const order of orders) {
    if (!isPostedOrder(order) || order.status === "cancelled") continue;
    const month = monthKey(businessDayOf(order.created_at));
    totals.set(month, (totals.get(month) ?? 0) + order.grand_total);
  }
  const today = isoDay(new Date());
  return Array.from({ length: 6 }, (_, index) => {
    const month = addCalendarMonths(today, index - 5).slice(0, 7);
    return {
      month,
      revenue: Math.round((totals.get(month) ?? 0) * 100) / 100,
    };
  });
}
