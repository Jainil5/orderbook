import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { CrmSubnav } from "@/components/crm/crm-subnav";
import { LeadsBoard } from "@/components/crm/leads-board";
import { loadCrmWorkspace } from "@/lib/crm/data";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function CrmLeadsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const workspace = await loadCrmWorkspace(toDemoBrandCode(ws.brand.code));
  return (
    <PageShell title="Leads Pipeline">
      <CrmSubnav activeHref="/customers/leads" />
      <LeadsBoard
        leads={workspace.leads}
        staff={workspace.staff
          .filter((s) => s.status === "active")
          .map((s) => ({ id: s.id, name: s.name }))}
        interactions={workspace.interactions}
        currencyCode={workspace.currencyCode}
      />
    </PageShell>
  );
}
