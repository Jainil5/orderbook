import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { MarketingSubnav } from "@/components/marketing/marketing-subnav";
import { ContentManager } from "@/components/marketing/content-manager";
import { listDemoProductsMerged, toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ContentManagementPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const products = await listDemoProductsMerged(
    { activeOnly: true },
    toDemoBrandCode(ws.brand.code),
  );

  return (
    <PageShell title="Content Management">
      <MarketingSubnav activeHref="/marketing/content" />
      <ContentManager
        brandName={ws.brand.name}
        currencyCode={ws.settings.currency_code}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          price: p.price,
          image_url: p.image_url ?? null,
        }))}
      />
    </PageShell>
  );
}
