import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { MarketingSubnav } from "@/components/marketing/marketing-subnav";
import { DigitalAdsBoard } from "@/components/marketing/ads-board";
import { loadCrmWorkspace } from "@/lib/crm/data";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function DigitalAdsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const workspace = await loadCrmWorkspace(toDemoBrandCode(ws.brand.code));

  return (
    <PageShell title="Digital Ads">
      <MarketingSubnav activeHref="/marketing/ads" />
      <DigitalAdsBoard
        campaigns={workspace.campaigns}
        currencyCode={workspace.currencyCode}
      />
    </PageShell>
  );
}
