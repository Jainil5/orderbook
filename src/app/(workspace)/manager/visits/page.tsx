import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { VisitsManager } from "@/components/manager/visits-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { toDemoBrandCode } from "@/lib/demo/data";
import { mergeDemoCustomers } from "@/lib/demo/merge-entities";
import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function VisitsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("visits")) redirect("/manager");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Visits & Field Ops">
        <ManagerSubnav activeHref="/manager/visits" />
        <EmptyState
          title="Visits is not connected to live workspaces yet"
          description="Field visits need the operations tables in the live database. Demo workspaces have full visit tracking today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const ops = await loadDemoOperations(code);
  const staff = await listDemoStaff(code);
  const customers = mergeDemoCustomers(getDemoBrandPack(code).customers, await readDemoMutableBucket(code));
  return (
    <PageShell title="Visits & Field Ops">
      <ManagerSubnav activeHref="/manager/visits" />
      <VisitsManager
        visits={ops.visits}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        canEdit
      />
    </PageShell>
  );
}
