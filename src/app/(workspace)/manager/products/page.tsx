import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerOverview } from "@/components/manager/manager-ui";
import { EmptyState } from "@/components/ui/empty-state";
import {
  listDemoOrderItemsForOrders,
  listDemoOrders,
  listDemoProductsMerged,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { purchaseOrdersCollection } from "@/lib/business/registry";
import { computeMarginSnapshot } from "@/lib/analytics/margin";
import { summarizeInventory } from "@/lib/products/inventory";
import { isOpenPurchaseOrder } from "@/lib/products/procurement";
import { formatMoney } from "@/lib/format";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ProductsManagerPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Products Manager">
        <ManagerOverview manager="products" />
        <div className="mt-4">
          <EmptyState
            title="Inventory and procurement are not connected to live workspaces yet"
            description="Stock levels, suppliers and purchase orders need the platform tables in the live database. The catalogue and services sections work in live workspaces today, and demo workspaces show the full experience."
          />
        </div>
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const [products, orders, orderItems, purchaseOrders] = await Promise.all([
    listDemoProductsMerged({ activeOnly: false }, code),
    listDemoOrders(undefined, code),
    listDemoOrderItemsForOrders(code),
    purchaseOrdersCollection.load(code),
  ]);

  const stock = summarizeInventory(products);
  const margin = computeMarginSnapshot({ orders, orderItems, products });
  const openOrders = purchaseOrders.filter(isOpenPurchaseOrder);
  const money = (value: number) => formatMoney(value, ws.settings.currency_code);

  return (
    <PageShell title="Products Manager">
      <ManagerOverview
        manager="products"
        stats={[
          {
            label: "Active SKUs",
            value: String(products.filter((p) => p.is_active).length),
            hint: `${products.length} catalogue lines in total`,
            href: "/manager/products/catalogue",
          },
          {
            label: "Stock on hand",
            value: String(stock.units),
            hint: `${money(stock.costValue)} at cost · ${money(stock.retailValue)} at retail`,
            href: "/manager/products/inventory",
          },
          {
            label: "Low stock",
            value: String(stock.lowCount),
            hint:
              stock.outCount > 0
                ? `${stock.outCount} line${stock.outCount === 1 ? "" : "s"} out of stock`
                : "At or below the reorder level",
            href: "/manager/products/inventory",
          },
          {
            label: "Open purchase orders",
            value: String(openOrders.length),
            hint: "Ordered or partly received",
            href: "/manager/products/procurement",
          },
          {
            label: "Blended margin",
            value: `${margin.marginPercent.toFixed(0)}%`,
            hint: `${money(margin.margin)} on ${money(margin.revenue)} of billed sales`,
            href: "/manager/products/intelligence",
          },
        ]}
      />
    </PageShell>
  );
}
