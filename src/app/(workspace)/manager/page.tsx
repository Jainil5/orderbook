import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { toDemoBrandCode } from "@/lib/demo/data";
import { staffAvailabilitySummary } from "@/lib/manager/staff";
import { visibleManagerModules } from "@/lib/workspace/manager-modules";
import { loadWorkspaceSession } from "@/lib/workspace/session";

const MODULE_DESCRIPTIONS: Record<string, string> = {
  staff: "Profiles, roles and availability.",
  services: "Not built yet — planned for Phase 2.",
  appointments: "Not built yet — planned for Phase 2.",
  visits: "Not built yet — planned for Phase 2.",
  schedules: "Not built yet — planned for Phase 2.",
  tasks: "Not built yet — planned for Phase 2.",
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