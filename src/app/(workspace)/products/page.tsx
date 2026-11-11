import { PageShell } from "@/components/workspace/page-shell";
import { ProductsWorkspace } from "@/components/products/products-workspace";
import { listDemoOffers, listDemoProductsMerged, toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const { tab } = await searchParams;
  const initialTab = tab === "offers" ? "offers" : "products";

  const demoCode = toDemoBrandCode(ws.brand.code);
  const [offers, products] = await Promise.all([
    listDemoOffers(demoCode),
    listDemoProductsMerged({ activeOnly: false }, demoCode),
  ]);
  return (
    <PageShell title="Products">
      <ProductsWorkspace
        mode="demo"
        initialTab={initialTab}
        products={products}
        offers={offers}
        currencyCode={ws.settings.currency_code}
        userRole="owner"
      />
    </PageShell>
  );
}