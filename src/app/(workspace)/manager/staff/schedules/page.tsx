import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-ui";
import { SchedulesManager } from "@/components/manager/schedules-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function StaffSchedulesPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("schedules")) redirect("/manager/staff");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Schedules & Shifts">
        <ManagerSubnav manager="staff" activeHref="/manager/staff/schedules" />
        <EmptyState
          title="Shifts are not connected to live workspaces yet"
          description="The rota needs the shift tables in the live database. Demo workspaces can plan and edit shifts today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const [staff, ops] = await Promise.all([listDemoStaff(code), loadDemoOperations(code)]);
  const roster = staff
    .filter((member) => member.status === "active")
    .map((member) => ({ id: member.id, name: member.name }));

  return (
    <PageShell title="Schedules & Shifts">
      <ManagerSubnav manager="staff" activeHref="/manager/staff/schedules" />
      <SchedulesManager shifts={ops.shifts} staff={roster} canEdit />
    </PageShell>
  );
}
