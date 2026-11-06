import { PageShell } from "@/components/workspace/page-shell";
import { ProductsWorkspace } from "@/components/products/products-workspace";
import { listDemoOffers, listDemoProducts, toDemoBrandCode } from "@/lib/demo/data";
import { listOffers, listProducts } from "@/services/data";
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

  if (ws.mode === "demo") {
    const demoCode = toDemoBrandCode(ws.brand.code);
    const offers = await listDemoOffers(demoCode);
    return (
      <PageShell title="Products">
        <ProductsWorkspace
          mode="demo"
          initialTab={initialTab}
          products={listDemoProducts({ activeOnly: false }, demoCode)}
          offers={offers}
          currencyCode={ws.settings.currency_code}
          userRole="owner"
        />
      </PageShell>
    );
  }

  const [productsRes, offersRes] = await Promise.all([
    listProducts({ activeOnly: false }),
    listOffers(),
  ]);

  return (
    <PageShell title="Products">
      <ProductsWorkspace
        mode="live"
        initialTab={initialTab}
        products={productsRes.data}
        offers={offersRes.data}
        currencyCode={ws.settings.currency_code}
        userRole={ws.member.role}
        productsError={productsRes.error}
        offersError={offersRes.error}
      />
    </PageShell>
  );
}
