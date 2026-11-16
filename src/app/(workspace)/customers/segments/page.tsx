import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { CrmSubnav } from "@/components/crm/crm-subnav";
import { SegmentsManager } from "@/components/crm/segments-manager";
import { loadCrmWorkspace } from "@/lib/crm/data";
import { buildCustomerProfiles, filterUniverse } from "@/lib/crm/metrics";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function CrmSegmentsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const workspace = await loadCrmWorkspace(toDemoBrandCode(ws.brand.code));
  const profiles = buildCustomerProfiles(workspace);
  return (
    <PageShell title="Segments">
      <CrmSubnav activeHref="/customers/segments" />
      <SegmentsManager
        segments={workspace.segments}
        profiles={profiles}
        loyaltyTiers={workspace.loyaltyRules?.tiers.map((t) => ({ id: t.id, name: t.name })) ?? []}
        universe={filterUniverse(profiles)}
      />
    </PageShell>
  );
}
