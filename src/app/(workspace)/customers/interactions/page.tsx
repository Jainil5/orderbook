import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { CrmSubnav } from "@/components/crm/crm-subnav";
import { InteractionsManager } from "@/components/crm/interactions-manager";
import { loadCrmWorkspace } from "@/lib/crm/data";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function CrmInteractionsPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const { customer } = await searchParams;
  const workspace = await loadCrmWorkspace(toDemoBrandCode(ws.brand.code));
  const initialCustomerId =
    customer && workspace.customers.some((c) => c.id === customer) ? customer : null;

  return (
    <PageShell title="Interactions">
      <CrmSubnav activeHref="/customers/interactions" />
      <InteractionsManager
        interactions={workspace.interactions}
        customers={workspace.customers.map((c) => ({ id: c.id, name: c.name }))}
        staff={workspace.staff
          .filter((s) => s.status === "active")
          .map((s) => ({ id: s.id, name: s.name }))}
        leads={workspace.leads.map((l) => ({ id: l.id, name: l.contact_name }))}
        initialCustomerId={initialCustomerId}
      />
    </PageShell>
  );
}
