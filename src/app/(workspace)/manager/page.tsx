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
import { visibleManagerModules } from "@/lib/workspace/manager-modules";
import { loadWorkspaceSession } from "@/lib/workspace/session";

const MODULE_DESCRIPTIONS: Record<string, string> = {
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

  const staff = await listDemoStaff(toDemoBrandCode(ws.brand.code));
  const summary = staffAvailabilitySummary(staff);
  const ops = await loadDemoOperations(toDemoBrandCode(ws.brand.code));
  const rollups = overviewRollups(
    { appointments: ops.appointments, tasks: ops.tasks, shifts: ops.shifts, visits: ops.visits, jobs: ops.serviceJobs },
    new Date(),
  );
  const rollupCards = [
    { label: "Today's appointments", value: rollups.todayAppointments, href: "/manager/appointments" },
    { label: "Overdue tasks", value: rollups.overdueTasks, href: "/manager/tasks" },
    { label: "On shift now", value: rollups.onShiftNow, href: "/manager/schedules" },
    { label: "Active visits", value: rollups.activeVisits, href: "/manager/visits" },
    { label: "Open jobs", value: rollups.openJobs, href: "/manager/services" },
  ];
  const stats = [
    { label: "Active staff", value: summary.active },
    { label: "Available now", value: summary.available },
    { label: "Busy", value: summary.busy },
    { label: "Off duty", value: summary.off },
  ];

  return (
    <PageShell title="Management Overview">
      <ManagerSubnav activeHref="/manager" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-4">
            <p className="text-sm text-[var(--ob-text-muted)]">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
          </Card>
        ))}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {rollupCards.map((card) => (
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
