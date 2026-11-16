import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSectionHeader, ManagerSubnav } from "@/components/manager/manager-ui";
import { AppointmentsManager } from "@/components/manager/appointments-manager";
import { EmptyState } from "@/components/ui/empty-state";
import { listDemoCustomers, toDemoBrandCode } from "@/lib/demo/data";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ProductivityAppointmentsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("appointments")) redirect("/manager/productivity");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Appointments & bookings">
        <ManagerSubnav manager="productivity" activeHref="/manager/productivity/appointments" />
        <EmptyState
          title="Appointments are not connected to live workspaces yet"
          description="Bookings need the operations tables in the live database. Demo workspaces have full appointment management today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  // Bookings, services and staff are CSV rows, so these three reads already
  // include everything saved inside the app — there is no bucket to merge.
  const [ops, staff, customers] = await Promise.all([
    loadDemoOperations(code),
    listDemoStaff(code),
    listDemoCustomers(undefined, code),
  ]);

  return (
    <PageShell title="Appointments & bookings">
      <ManagerSubnav manager="productivity" activeHref="/manager/productivity/appointments" />
      <ManagerSectionHeader
        title="Appointments & bookings"
        description="Book customers with staff and services, reschedule, cancel and keep the full booking history."
      />
      <AppointmentsManager
        appointments={ops.appointments}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        staff={staff.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name }))}
        services={ops.services.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name }))}
        canEdit
      />
    </PageShell>
  );
}
