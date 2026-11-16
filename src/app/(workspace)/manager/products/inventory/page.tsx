import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSectionHeader, ManagerSubnav } from "@/components/manager/manager-ui";
import { InventoryPanel } from "@/components/manager/products/inventory-panel";
import { EmptyState } from "@/components/ui/empty-state";
import {
  listDemoOrderItemsForOrders,
  listDemoOrders,
  listDemoProductsMerged,
  listDemoStockAdjustments,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { buildMovementLedger, soldProductIds } from "@/lib/products/inventory";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ProductInventoryPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("inventory")) redirect("/manager/products");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Inventory">
        <ManagerSubnav manager="products" activeHref="/manager/products/inventory" />
        <EmptyState
          title="Inventory is not connected to live workspaces yet"
          description="Stock quantities, reorder levels and movements need the inventory columns in the live database. Demo workspaces track stock end to end today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const [products, adjustments, orders, orderItems] = await Promise.all([
    listDemoProductsMerged({ activeOnly: false }, code),
    listDemoStockAdjustments(code),
    listDemoOrders(undefined, code),
    listDemoOrderItemsForOrders(code),
  ]);

  const movements = buildMovementLedger({ products, adjustments, orders, orderItems });
  const sold = soldProductIds(orders, orderItems);

  return (
    <PageShell title="Inventory">
      <ManagerSubnav manager="products" activeHref="/manager/products/inventory" />
      <ManagerSectionHeader
        title="Inventory"
        description="Current stock, adjustments and movements, low-stock alerts, reorder levels and valuation."
      />
      <InventoryPanel
        products={products}
        movements={movements}
        adjustments={adjustments}
        soldIds={sold}
        currencyCode={ws.settings.currency_code}
        canEdit
      />
    </PageShell>
  );
}
