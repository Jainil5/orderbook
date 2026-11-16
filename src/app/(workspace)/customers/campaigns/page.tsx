import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { CrmSubnav } from "@/components/crm/crm-subnav";
import { CampaignsManager } from "@/components/crm/campaigns-manager";
import { loadCrmWorkspace } from "@/lib/crm/data";
import { buildCustomerProfiles } from "@/lib/crm/metrics";
import { listDemoOffers, toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function CrmCampaignsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const code = toDemoBrandCode(ws.brand.code);
  const workspace = await loadCrmWorkspace(code);
  const profiles = buildCustomerProfiles(workspace);
  const offers = await listDemoOffers(code);
  return (
    <PageShell title="Campaigns & Offers">
      <CrmSubnav activeHref="/customers/campaigns" />
      <CampaignsManager
        campaigns={workspace.campaigns}
        segments={workspace.segments}
        profiles={profiles}
        offers={offers.map((o) => ({
          id: o.id,
          name: o.name,
          code: o.code,
          discount_type: o.discount_type,
          discount_value: o.discount_value,
          is_active: o.is_active,
        }))}
        currencyCode={workspace.currencyCode}
      />
    </PageShell>
  );
}
