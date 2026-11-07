import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { EmptyState } from "@/components/ui/empty-state";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function AppointmentsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("appointments")) redirect("/manager");
  return (
    <PageShell title="Meetings & Appointments">
      <ManagerSubnav activeHref="/manager/appointments" />
      <EmptyState
        title="Meetings & Appointments"
        description="Booking calendar and appointments are not built yet — planned for Phase 2."
      />
    </PageShell>
  );
}
