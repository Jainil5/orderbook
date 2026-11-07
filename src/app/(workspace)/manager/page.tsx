import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { EmptyState } from "@/components/ui/empty-state";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ManagerPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  return (
    <PageShell title="Management Overview">
      <ManagerSubnav activeHref="/manager" />
      <EmptyState
        title="Management Overview"
        description="Staff availability and operational summaries land here as modules are built."
      />
    </PageShell>
  );
}
