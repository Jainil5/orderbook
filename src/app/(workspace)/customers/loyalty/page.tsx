import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { CrmSubnav } from "@/components/crm/crm-subnav";
import { LoyaltyManager } from "@/components/crm/loyalty-manager";
import { loadCrmWorkspace } from "@/lib/crm/data";
import { buildCustomerProfiles } from "@/lib/crm/metrics";
import { formatMoney } from "@/lib/format";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function CrmLoyaltyPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const code = toDemoBrandCode(ws.brand.code);
  const workspace = await loadCrmWorkspace(code);
  const profiles = buildCustomerProfiles(workspace);
  const nameById = new Map(profiles.map((p) => [p.customer.id, p.customer.name]));
  const bills = [...workspace.orders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 40)
    .map((order) => ({
      id: order.id,
      label: `${nameById.get(order.customer_id ?? "") ?? "Walk-in"} · ${order.created_at.slice(0, 10)} · ${formatMoney(order.grand_total, workspace.currencyCode)}`,
    }));

  return (
    <PageShell title="Loyalty & Memberships">
      <CrmSubnav activeHref="/customers/loyalty" />
      <LoyaltyManager
        rules={workspace.loyaltyRules}
        entries={workspace.loyaltyLedger}
        memberships={workspace.memberships}
        profiles={profiles}
        bills={bills}
        currencyCode={workspace.currencyCode}
        now={new Date()}
      />
    </PageShell>
  );
}
