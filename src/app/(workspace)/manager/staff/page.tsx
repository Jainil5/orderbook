import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import { EmptyState } from "@/components/ui/empty-state";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function StaffPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("staff")) redirect("/manager");
  return (
    <PageShell title="Staff">
      <ManagerSubnav activeHref="/manager/staff" />
      <EmptyState title="Staff" description="Employee profiles and availability are being connected." />
    </PageShell>
  );
}
