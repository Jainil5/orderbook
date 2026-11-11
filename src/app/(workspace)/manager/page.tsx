import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { Card } from "@/components/ui/card";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { listDemoOrders, toDemoBrandCode } from "@/lib/demo/data";
import { staffAvailabilitySummary } from "@/lib/manager/staff";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { ongoingOrderCount, overviewRollups } from "@/lib/manager/ops-selectors";
import { visibleManagerModules, type ManagerModuleKey } from "@/lib/workspace/manager-modules";
import { loadWorkspaceSession } from "@/lib/workspace/session";

const MODULE_DESCRIPTIONS: Record<ManagerModuleKey, string> = {
  staff: "Profiles, roles and availability.",
  services: "Service catalogue, requests and work orders.",
  appointments: "Meetings, tastings and scheduled sessions.",
  visits: "Field visits with check-in and reports.",
  schedules: "Staff shifts and the weekly rota.",
  tasks: "To-dos with priorities and due dates.",
};

export default async function ManagerPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const modules = visibleManagerModules(ws.hiddenManagerModules);


  const brandCode = toDemoBrandCode(ws.brand.code);
  const staff = await listDemoStaff(brandCode);
  const summary = staffAvailabilitySummary(staff);
  const ops = await loadDemoOperations(brandCode);
  const rollups = overviewRollups(
    { appointments: ops.appointments, tasks: ops.tasks, shifts: ops.shifts, visits: ops.visits, jobs: ops.serviceJobs },
    new Date(),
  );
  // Bills captured today but not yet completed — surfaced on every manager's
  // overview regardless of which operations modules are visible.
  const orders = await listDemoOrders(undefined, brandCode);
  const ongoing = ongoingOrderCount(orders);
  const openTasks = ops.tasks.filter((t) => t.status !== "done").length;
  const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const detailCards: { label: string; value: number; detail: string; href: string }[] = [
    { label: "Ongoing orders", value: ongoing, detail: `of ${count(orders.length, "captured bill")}`, href: "/orders" },
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
    { label: "Today's appointments", value: rollups.todayAppointments, detail: `of ${ops.appointments.length} booked`, href: "/manager/appointments", module: "appointments" },
    { label: "Overdue tasks", value: rollups.overdueTasks, detail: `of ${count(openTasks, "open task")}`, href: "/manager/tasks", module: "tasks" },
    { label: "On shift now", value: rollups.onShiftNow, detail: `of ${count(ops.shifts.length, "rostered shift")}`, href: "/manager/schedules", module: "schedules" },
    { label: "Active visits", value: rollups.activeVisits, detail: `of ${count(ops.visits.length, "field visit")}`, href: "/manager/visits", module: "visits" },
    { label: "Open jobs", value: rollups.openJobs, detail: `of ${count(ops.serviceJobs.length, "service job")}`, href: "/manager/services", module: "services" },
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
