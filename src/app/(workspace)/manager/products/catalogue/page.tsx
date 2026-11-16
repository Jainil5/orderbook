import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSectionHeader, ManagerSubnav } from "@/components/manager/manager-ui";
import { ProductsWorkspace } from "@/components/products/products-workspace";
import {
  listDemoOffers,
  listDemoProducts,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { listOffers, listProducts } from "@/services/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ProductCataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("catalogue")) redirect("/manager/products");

  const { tab } = await searchParams;
  const initialTab = tab === "offers" ? "offers" : "products";

  if (ws.mode === "demo") {
    const demoCode = toDemoBrandCode(ws.brand.code);
    const offers = await listDemoOffers(demoCode);
    return (
      <PageShell title="Catalogue">
        <ManagerSubnav manager="products" activeHref="/manager/products/catalogue" />
        <ManagerSectionHeader
          title="Catalogue"
          description="Products, categories, variants, pricing, descriptions and active status. Everything Billing and POS sell comes from this list."
        />
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
    <PageShell title="Catalogue">
      <ManagerSubnav manager="products" activeHref="/manager/products/catalogue" />
      <ManagerSectionHeader
        title="Catalogue"
        description="Products, categories, variants, pricing, descriptions and active status. Everything Billing and POS sell comes from this list."
      />
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
