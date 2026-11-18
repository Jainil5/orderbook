import { PageShell } from "@/components/workspace/page-shell";
import { ProductsWorkspace } from "@/components/products/products-workspace";
import {
  demoInventorySnapshot,
  listDemoOffers,
  listDemoProductsMerged,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";

/** The usage window is a URL choice, so a shared link keeps its meaning. */
const WINDOWS = [7, 30, 90];

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; window?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const { tab, window: windowParam } = await searchParams;
  const initialTab =
    tab === "offers" ? "offers" : tab === "inventory" ? "inventory" : "products";
  const days = WINDOWS.includes(Number(windowParam))
    ? Number(windowParam)
    : 7;

  const demoCode = toDemoBrandCode(ws.brand.code);
  const [offers, products, inventory] = await Promise.all([
    listDemoOffers(demoCode),
    listDemoProductsMerged({ activeOnly: false }, demoCode),
    demoInventorySnapshot(demoCode, days),
  ]);
  return (
    <PageShell title="Products">
      <ProductsWorkspace
        mode="demo"
        initialTab={initialTab}
        products={products}
        offers={offers}
        inventory={inventory}
        currencyCode={ws.settings.currency_code}
        userRole="owner"
      />
    </PageShell>
  );
}
