import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { TasksManager } from "@/components/manager/tasks-manager";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { toDemoBrandCode } from "@/lib/demo/data";
import { mergeDemoCustomers } from "@/lib/demo/merge-entities";
import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function TasksPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("tasks")) redirect("/manager");


  const code = toDemoBrandCode(ws.brand.code);
  const ops = await loadDemoOperations(code);
  const staff = await listDemoStaff(code);
  const customers = mergeDemoCustomers(getDemoBrandPack(code).customers, await readDemoMutableBucket(code));
  return (
    <PageShell title="Tasks & Activities">
      <ManagerSubnav activeHref="/manager/tasks" />
      <TasksManager
        tasks={ops.tasks}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        canEdit
      />
    </PageShell>
  );
}
