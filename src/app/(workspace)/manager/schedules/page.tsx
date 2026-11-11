import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { SchedulesManager } from "@/components/manager/schedules-manager";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function SchedulesPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("schedules")) redirect("/manager");


  const code = toDemoBrandCode(ws.brand.code);
  const ops = await loadDemoOperations(code);
  const staff = await listDemoStaff(code);
  return (
    <PageShell title="Schedules">
      <ManagerSubnav activeHref="/manager/schedules" />
      <SchedulesManager
        shifts={ops.shifts}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        canEdit
      />
    </PageShell>
  );
}
