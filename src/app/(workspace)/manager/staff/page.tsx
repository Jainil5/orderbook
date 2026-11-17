import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { StaffManager } from "@/components/manager/staff-manager";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { canAddWorkspaceRecords } from "@/lib/workspace/settings-access";

export default async function StaffPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("staff")) redirect("/manager");


  const staff = await listDemoStaff(toDemoBrandCode(ws.brand.code));
  return (
    <PageShell title="Staff">
      <ManagerSubnav activeHref="/manager/staff" />
      <StaffManager
        staff={staff}
        canEdit
        canAdd={canAddWorkspaceRecords()}
      />
    </PageShell>
  );
}
