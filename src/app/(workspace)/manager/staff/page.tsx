import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { StaffWorkspace } from "@/components/manager/staff-workspace";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { canAddWorkspaceRecords } from "@/lib/workspace/settings-access";

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("staff")) redirect("/manager");

  const { tab } = await searchParams;
  const code = toDemoBrandCode(ws.brand.code);
  const [staff, ops] = await Promise.all([
    listDemoStaff(code),
    loadDemoOperations(code),
  ]);
  return (
    <PageShell title="Staff & Schedules">
      <ManagerSubnav activeHref="/manager/staff" />
      <StaffWorkspace
        initialTab={tab === "schedules" ? "schedules" : "team"}
        staff={staff}
        shifts={ops.shifts}
        canEdit
        canAdd={canAddWorkspaceRecords()}
      />
    </PageShell>
  );
}
