import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-subnav";
import {
  PurchasingManager,
  type ShortItemOption,
} from "@/components/manager/purchasing-manager";
import { demoInventorySnapshot, toDemoBrandCode } from "@/lib/demo/data";
import { loadDemoPurchasing } from "@/lib/demo/procurement-data";
import {
  incomingPacksByItem,
  purchaseOrderViews,
  reorderSuggestions,
} from "@/lib/procurement/purchasing";
import { canAddWorkspaceRecords } from "@/lib/workspace/settings-access";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function PurchasingPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("purchasing")) redirect("/manager");

  const code = toDemoBrandCode(ws.brand.code);
  const [purchasing, stock] = await Promise.all([
    loadDemoPurchasing(code),
    demoInventorySnapshot(code),
  ]);
  const incoming = incomingPacksByItem(
    purchasing.purchaseOrders,
    purchasing.purchaseOrderLines,
  );
  const suggestions = reorderSuggestions(stock.positions, incoming);
  const shortItems: ShortItemOption[] = suggestions.map((row) => ({
    id: row.position.item.id,
    name: row.position.item.name,
    unit: row.position.item.unit,
    cost_per_pack: row.position.item.cost_per_pack,
    packs: row.suggestPacks,
  }));
  const views = purchaseOrderViews(
    purchasing.purchaseOrders,
    purchasing.purchaseOrderLines,
    purchasing.vendors,
    new Date(),
  );

  return (
    <PageShell title="Purchasing & Vendors">
      <ManagerSubnav activeHref="/manager/purchasing" />
      <PurchasingManager
        views={views}
        vendors={purchasing.vendors}
        items={stock.items.map((item) => ({
          id: item.id,
          name: item.name,
          unit: item.unit,
          cost_per_pack: item.cost_per_pack,
        }))}
        shortItems={shortItems}
        canAdd={canAddWorkspaceRecords()}
      />
    </PageShell>
  );
}
