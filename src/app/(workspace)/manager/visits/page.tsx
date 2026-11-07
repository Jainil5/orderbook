import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { EmptyState } from "@/components/ui/empty-state";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function VisitsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("visits")) redirect("/manager");
  return (
    <PageShell title="Visits & Field Operations">
      <ManagerSubnav activeHref="/manager/visits" />
      <EmptyState
        title="Visits & Field Operations"
        description="Field visits, check-in/out and work reports are not built yet — planned for Phase 2."
      />
    </PageShell>
  );
}
