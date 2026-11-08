import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { ServicesManager } from "@/components/manager/services-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { toDemoBrandCode } from "@/lib/demo/data";
import { mergeDemoCustomers } from "@/lib/demo/merge-entities";
import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ServicesPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("services")) redirect("/manager");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Services">
        <ManagerSubnav activeHref="/manager/services" />
        <EmptyState
          title="Services is not connected to live workspaces yet"
          description="Service catalogues and jobs need the operations tables in the live database. Demo workspaces have full service management today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const ops = await loadDemoOperations(code);
  const staff = await listDemoStaff(code);
  const customers = mergeDemoCustomers(getDemoBrandPack(code).customers, await readDemoMutableBucket(code));
  return (
    <PageShell title="Services">
      <ManagerSubnav activeHref="/manager/services" />
      <ServicesManager
        services={ops.services}
        jobs={ops.serviceJobs}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        canEdit
      />
    </PageShell>
  );
}