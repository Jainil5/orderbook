import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSectionHeader, ManagerSubnav } from "@/components/manager/manager-ui";
import { ServicesManager } from "@/components/manager/services-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { listDemoCustomers, toDemoBrandCode } from "@/lib/demo/data";
import {
  listDemoServiceJobs,
  listDemoServices,
} from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ProductServicesPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("services")) redirect("/manager/products");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Services">
        <ManagerSubnav manager="products" activeHref="/manager/products/services" />
        <EmptyState
          title="Services is not connected to live workspaces yet"
          description="Service catalogues and jobs need the operations tables in the live database. Demo workspaces have full service management today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const [services, jobs, staff, customers] = await Promise.all([
    listDemoServices(code),
    listDemoServiceJobs(code),
    listDemoStaff(code),
    listDemoCustomers(undefined, code),
  ]);

  return (
    <PageShell title="Services">
      <ManagerSubnav manager="products" activeHref="/manager/products/services" />
      <ManagerSectionHeader
        title="Services catalogue"
        description="Service pricing, duration and availability, plus the service jobs they turn into. Services have no stock — nothing here changes inventory."
      />
      <ServicesManager
        services={services}
        jobs={jobs}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        staff={staff
          .filter((s) => s.status === "active")
          .map((s) => ({ id: s.id, name: s.name }))}
        canEdit
      />
    </PageShell>
  );
}
