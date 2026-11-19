import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { Card } from "@/components/ui/card";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { listDemoOrders, toDemoBrandCode } from "@/lib/demo/data";
import { staffAvailabilitySummary } from "@/lib/manager/staff";
import { pipelineSummary } from "@/lib/manager/leads";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { loadDemoPurchasing } from "@/lib/demo/procurement-data";
import { ongoingOrderCount, overviewRollups } from "@/lib/manager/ops-selectors";
import { visibleManagerModules, type ManagerModuleKey } from "@/lib/workspace/manager-modules";
import { loadWorkspaceSession } from "@/lib/workspace/session";

const MODULE_DESCRIPTIONS: Record<ManagerModuleKey, string> = {
  staff: "Profiles, roles and availability, and the weekly rota.",
  meetings: "Meetings booked in, and the visits the team makes on site.",
  tasks: "To-dos with priorities and due dates.",
  purchasing: "Vendors, purchase orders and what is still to arrive.",
  payments: "Payments captured against bills, with method and status.",
};

export default async function ManagerPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const modules = visibleManagerModules(ws.hiddenManagerModules);


  const brandCode = toDemoBrandCode(ws.brand.code);
  const staff = await listDemoStaff(brandCode);
  const summary = staffAvailabilitySummary(staff);
  const ops = await loadDemoOperations(brandCode);
  const purchasing = await loadDemoPurchasing(brandCode);
  const purchase = {
    total: purchasing.purchaseOrders.length,
    open: purchasing.purchaseOrders.filter(
      (po) => po.status === "sent" || po.status === "partially_received",
    ).length,
  };
  const rollups = overviewRollups(
    { appointments: ops.appointments, tasks: ops.tasks, shifts: ops.shifts, visits: ops.visits },
    new Date(),
  );
  // Bills captured today but not yet completed — surfaced on every manager's
  // overview regardless of which operations modules are visible.
  const orders = await listDemoOrders(undefined, brandCode);
  const ongoing = ongoingOrderCount(orders);
  const openTasks = ops.tasks.filter((t) => t.status !== "done").length;
  const pipeline = pipelineSummary(ops.leads);
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const detailCards: { label: string; value: number; detail: string; href: string }[] = [
    { label: "Ongoing orders", value: ongoing, detail: `of ${count(orders.length, "captured bill")}`, href: "/orders" },
    // The pipeline is a CRM screen now, but a manager still opens the day on
    // it, so the count stays on this overview regardless of module visibility.
    { label: "Open leads", value: pipeline.openCount, detail: `of ${count(ops.leads.length, "captured lead")}`, href: "/customers/leads" },
  ];
  if (!ws.hiddenManagerModules.includes("staff")) {
    detailCards.push({
      label: "Active staff",
      value: summary.active,
      detail: `Available ${summary.available} · Busy ${summary.busy} · Off duty ${summary.off}`,
      href: "/manager/staff",
    });
  }
  const rollupCards: { label: string; value: number; detail: string; module: ManagerModuleKey; href: string }[] = [
    { label: "Today's meetings", value: rollups.todayAppointments, detail: `of ${ops.appointments.length} booked`, href: "/manager/meetings", module: "meetings" },
    { label: "Overdue tasks", value: rollups.overdueTasks, detail: `of ${count(openTasks, "open task")}`, href: "/manager/tasks", module: "tasks" },
    { label: "On shift now", value: rollups.onShiftNow, detail: `of ${count(ops.shifts.length, "rostered shift")}`, href: "/manager/staff?tab=schedules", module: "staff" },
    { label: "Active visits", value: rollups.activeVisits, detail: `of ${count(ops.visits.length, "field visit")}`, href: "/manager/meetings?tab=visits", module: "meetings" },
    { label: "Awaiting delivery", value: purchase.open, detail: `of ${count(purchase.total, "purchase order")} placed`, href: "/manager/purchasing", module: "purchasing" },
  ];
  const cards = [
    ...detailCards,
    ...rollupCards.filter((card) => modules.some((m) => m.key === card.module)),
  ];

  return (
    <PageShell title="Management Overview">
      <ManagerSubnav activeHref="/manager" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="ob-touch-target block">
            <Card className="h-full p-4 transition-shadow hover:shadow-[var(--ob-shadow-sm)]">
              <p className="text-sm font-medium text-[var(--ob-text-secondary)]">{card.label}</p>
              <p className="mt-1 font-display text-3xl font-semibold tracking-tight">{card.value}</p>
              <p className="mt-1 text-xs text-[var(--ob-text-muted)]">{card.detail}</p>
            </Card>
          </Link>
        ))}
      </div>
      <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">Modules</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <Link key={module.key} href={module.href} className="block">
            <Card className="h-full p-4 transition-shadow hover:shadow-[var(--ob-shadow-sm)]">
              <p className="font-display text-lg font-semibold tracking-tight">{module.label}</p>
              <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                {MODULE_DESCRIPTIONS[module.key]}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}
