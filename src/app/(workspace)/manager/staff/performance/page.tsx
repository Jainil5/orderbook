import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-ui";
import { StaffPerformance } from "@/components/manager/staff/staff-performance";
import { EmptyState } from "@/components/ui/empty-state";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function StaffPerformancePage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("performance")) redirect("/manager/staff");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Staff Performance">
        <ManagerSubnav manager="staff" activeHref="/manager/staff/performance" />
        <EmptyState
          title="Performance needs live task and shift data"
          description="Workload and activity are read from the operations records, which are not connected to live workspaces yet. Demo workspaces report on their own data."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const [staff, ops] = await Promise.all([listDemoStaff(code), loadDemoOperations(code)]);

  return (
    <PageShell title="Staff Performance">
      <ManagerSubnav manager="staff" activeHref="/manager/staff/performance" />
      <StaffPerformance
        staff={staff.filter((member) => member.status === "active")}
        tasks={ops.tasks}
        shifts={ops.shifts}
        visits={ops.visits}
        jobs={ops.serviceJobs}
        services={ops.services}
      />
    </PageShell>
  );
}
