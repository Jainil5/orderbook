import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { EmptyState } from "@/components/ui/empty-state";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ServicesPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("services")) redirect("/manager");
  return (
    <PageShell title="Services">
      <ManagerSubnav activeHref="/manager/services" />
      <EmptyState
        title="Services"
        description="Service catalogue, requests and work orders are not built yet — planned for Phase 2."
      />
    </PageShell>
  );
}
