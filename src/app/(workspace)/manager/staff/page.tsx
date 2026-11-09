import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { StaffManager } from "@/components/manager/staff-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function StaffPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("staff")) redirect("/manager");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Staff">
        <ManagerSubnav activeHref="/manager/staff" />
        <EmptyState
          title="Staff is not connected to live workspaces yet"
          description="Employee records need the staff tables in the live database. Demo workspaces have full staff management today."
        />
      </PageShell>
    );
  }

  const staff = await listDemoStaff(toDemoBrandCode(ws.brand.code));
  return (
    <PageShell title="Staff">
      <ManagerSubnav activeHref="/manager/staff" />
      <StaffManager staff={staff} canEdit />
    </PageShell>
  );
}
