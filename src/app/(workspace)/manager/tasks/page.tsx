import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { EmptyState } from "@/components/ui/empty-state";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function TasksPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("tasks")) redirect("/manager");
  return (
    <PageShell title="Tasks & Activities">
      <ManagerSubnav activeHref="/manager/tasks" />
      <EmptyState
        title="Tasks & Activities"
        description="Task assignment and tracking are not built yet — planned for Phase 2."
      />
    </PageShell>
  );
}
