import { PageShell } from "@/components/workspace/page-shell";
import { ManagerLanding } from "@/components/manager/manager-ui";
import { EmptyState } from "@/components/ui/empty-state";
import { toDemoBrandCode } from "@/lib/demo/data";
import { listDemoOrders, listDemoProductsMerged } from "@/lib/demo/data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadBusinessData } from "@/lib/business/registry";
import { computeRollups } from "@/lib/business/overview";
import { formatMoney } from "@/lib/format";
import { staffAvailabilitySummary } from "@/lib/manager/staff";
import { visibleManagers } from "@/lib/workspace/managers";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";

export default async function ManagerPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const managers = visibleManagers(ws.hiddenManagerModules);
  if (!managers.length) {
    return (
      <PageShell title="Manager">
        <ManagerLanding />
        <div className="mt-4">
          <EmptyState
            title="Every Manager section is hidden"
            description="Turn sections back on under Settings → Business type & Manager modules."
          />
        </div>
      </PageShell>
    );
  }

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Manager">
        <ManagerLanding />
        <div className="mt-4">
          <EmptyState
            title="Live data is still being wired up"
            description="Billing, orders, customers and products work in live workspaces. The Manager collections need their Supabase tables — open a demo workspace to see the full experience."
          />
        </div>
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const [ops, business, orders, products, staff] = await Promise.all([
    loadDemoOperations(code),
    loadBusinessData(code),
    listDemoOrders(undefined, code),
    listDemoProductsMerged({}, code),
    listDemoStaff(code),
  ]);

  const rollups = computeRollups(
    {
      orders,
      products,
      tasks: ops.tasks,
      appointments: ops.appointments,
      shifts: ops.shifts,
      expenses: business.expenses,
      purchaseOrders: business.purchaseOrders,
      leave: business.leave,
    },
    new Date(),
  );
  const staffSummary = staffAvailabilitySummary(staff);
  const money = (value: number) => formatMoney(value, ws.settings.currency_code);

  const stats = [
    {
      label: "Open tasks",
      value: String(rollups.tasksOpen),
      hint:
        rollups.tasksOverdue > 0
          ? `${rollups.tasksOverdue} overdue`
          : `${rollups.tasksDueToday} due today`,
      href: "/manager/productivity/tasks",
    },
    {
      label: "Booked today",
      value: String(rollups.appointmentsToday),
      hint: `${rollups.onShiftNow} on shift now`,
      href: "/manager/productivity/appointments",
    },
    {
      label: "Outstanding",
      value: money(rollups.outstandingAmount),
      hint: `${money(rollups.salesToday)} sold today`,
      href: "/manager/finance/receivables",
    },
    {
      label: "Low stock",
      value: String(rollups.lowStockCount),
      hint:
        rollups.outOfStockCount > 0
          ? `${rollups.outOfStockCount} out of stock`
          : `${staffSummary.available} staff available`,
      href: "/manager/products/inventory",
    },
  ];

  return (
    <PageShell title="Manager">
      <ManagerLanding stats={stats} />
    </PageShell>
  );
}
