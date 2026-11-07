import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { EmptyState } from "@/components/ui/empty-state";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function SchedulesPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("schedules")) redirect("/manager");
  return (
    <PageShell title="Schedules">
      <ManagerSubnav activeHref="/manager/schedules" />
      <EmptyState
        title="Schedules"
        description="Shifts and working-hour calendars are not built yet — planned for Phase 2."
      />
    </PageShell>
  );
}
