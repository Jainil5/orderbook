import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { toDemoBrandCode } from "@/lib/demo/data";
import { staffAvailabilitySummary } from "@/lib/manager/staff";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { overviewRollups } from "@/lib/manager/ops-selectors";
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

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Management Overview">
        <ManagerSubnav activeHref="/manager" />
        <EmptyState
          title="Manager is not connected to live workspaces yet"
          description="Operational data needs the staff and operations tables in the live database. Demo workspaces show the Manager experience today."
        />
      </PageShell>
    );
  }

  const brandCode = toDemoBrandCode(ws.brand.code);
  const staff = await listDemoStaff(brandCode);
  const summary = staffAvailabilitySummary(staff);
  const ops = await loadDemoOperations(brandCode);
  const rollups = overviewRollups(
    { appointments: ops.appointments, tasks: ops.tasks, shifts: ops.shifts, visits: ops.visits, jobs: ops.serviceJobs },
    new Date(),
  );
  const rollupCards: { label: string; value: number; href: string; module: ManagerModuleKey }[] = [
    { label: "Today's appointments", value: rollups.todayAppointments, href: "/manager/appointments", module: "appointments" },
    { label: "Overdue tasks", value: rollups.overdueTasks, href: "/manager/tasks", module: "tasks" },
    { label: "On shift now", value: rollups.onShiftNow, href: "/manager/schedules", module: "schedules" },
    { label: "Active visits", value: rollups.activeVisits, href: "/manager/visits", module: "visits" },
    { label: "Open jobs", value: rollups.openJobs, href: "/manager/services", module: "services" },
  ];
  const visibleRollupCards = rollupCards.filter((card) => modules.some((m) => m.key === card.module));
  const stats = [
    { label: "Active staff", value: summary.active },
    { label: "Available now", value: summary.available },
    { label: "Busy", value: summary.busy },
    { label: "Off duty", value: summary.off },
  ];

  return (
    <PageShell title="Management Overview">
      <ManagerSubnav activeHref="/manager" />
      {!ws.hiddenManagerModules.includes("staff") ? (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-4">
              <p className="text-sm text-[var(--ob-text-muted)]">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
            </Card>
          ))}
        </div>
      ) : null}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {visibleRollupCards.map((card) => (
          <Link key={card.label} href={card.href} className="ob-touch-target block">
            <Card className="h-full p-4 transition-shadow hover:shadow-[var(--ob-shadow-sm)]">
              <p className="text-sm text-[var(--ob-text-muted)]">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold">{card.value}</p>
            </Card>
          </Link>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <Link key={module.key} href={module.href} className="block">
            <Card className="h-full p-4 transition-shadow hover:shadow-[var(--ob-shadow-sm)]">
              <p className="font-medium">{module.label}</p>
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
