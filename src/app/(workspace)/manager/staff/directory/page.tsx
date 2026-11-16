import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-ui";
import { StaffManager } from "@/components/manager/staff-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function StaffDirectoryPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Staff Directory">
        <ManagerSubnav manager="staff" activeHref="/manager/staff/directory" />
        <EmptyState
          title="Staff is not connected to live workspaces yet"
          description="Employee records need the staff tables in the live database. Demo workspaces have full staff management today."
        />
      </PageShell>
    );
  }

  const staff = await listDemoStaff(toDemoBrandCode(ws.brand.code));
  return (
    <PageShell title="Staff Directory">
      <ManagerSubnav manager="staff" activeHref="/manager/staff/directory" />
      <StaffManager staff={staff} canEdit />
    </PageShell>
  );
}
