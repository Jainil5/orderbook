import { PageShell } from "@/components/workspace/page-shell";
import { ProductsManager } from "@/components/products/products-manager";
import { OffersManager } from "@/components/offers/offers-manager";
import {
  listDemoOffers,
  listDemoProductsMerged,
  listDemoStockAdjustments,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { listOffers, listProducts, listStockAdjustments } from "@/services/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import type { StockAdjustment } from "@/types/database";

function groupAdjustmentsByProduct(
  rows: StockAdjustment[],
): Record<string, StockAdjustment[]> {
  const map: Record<string, StockAdjustment[]> = {};
  for (const row of rows) {
    if (!map[row.product_id]) map[row.product_id] = [];
    map[row.product_id].push(row);
  }
  return map;
}

export default async function CatalogPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode === "demo") {
    const demoCode = toDemoBrandCode(ws.brand.code);
    const [offers, adjustments, products] = await Promise.all([
      listDemoOffers(demoCode),
      listDemoStockAdjustments(demoCode),
      listDemoProductsMerged({ activeOnly: false }, demoCode),
    ]);
    return (
      <PageShell title="Catalog">
        <div className="space-y-6">
          <ProductsManager
            mode="demo"
            initialProducts={products}
            currencyCode={ws.settings.currency_code}
            userRole="owner"
            stockAdjustmentsByProductId={groupAdjustmentsByProduct(adjustments)}
          />
          <Card className="scroll-mt-24">
            <div id="offers">
              <h2 className="text-lg font-semibold">Offers &amp; discounts</h2>
              <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                Promo codes applied at checkout in Quotation and Bill.
              </p>
              <div className="mt-4">
                <OffersManager initialOffers={offers} />
              </div>
            </div>
          </Card>
        </div>
      </PageShell>
    );
  }

  const [productsRes, offersRes, adjustmentsRes] = await Promise.all([
    listProducts({ activeOnly: false }),
    listOffers(),
    listStockAdjustments(),
  ]);

  return (
    <PageShell title="Catalog">
      <div className="space-y-6">
        <ProductsManager
          mode="live"
          initialProducts={productsRes.data}
          currencyCode={ws.settings.currency_code}
          userRole={ws.member.role}
          loadError={productsRes.error}
          stockAdjustmentsByProductId={groupAdjustmentsByProduct(
            adjustmentsRes.data,
          )}
        />
        <Card className="scroll-mt-24">
          <div id="offers">
            <h2 className="text-lg font-semibold">Offers &amp; discounts</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              Promo codes applied at checkout in Quotation and Bill.
            </p>
            <div className="mt-4">
              <OffersManager
                initialOffers={offersRes.data}
                loadError={offersRes.error}
              />
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}
