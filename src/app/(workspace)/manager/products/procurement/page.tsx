import { redirect } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSectionHeader, ManagerSubnav } from "@/components/manager/manager-ui";
import { PurchaseOrdersPanel } from "@/components/manager/products/purchase-orders-panel";
import { SuppliersPanel } from "@/components/manager/products/suppliers-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { listDemoProductsMerged, toDemoBrandCode } from "@/lib/demo/data";
import {
  purchaseOrdersCollection,
  suppliersCollection,
} from "@/lib/business/registry";
import { isoDayOf } from "@/lib/business/overview";
import { loadWorkspaceSession } from "@/lib/workspace/session";

export default async function ProductProcurementPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("procurement")) redirect("/manager/products");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="Procurement">
        <ManagerSubnav manager="products" activeHref="/manager/products/procurement" />
        <EmptyState
          title="Procurement is not connected to live workspaces yet"
          description="Suppliers and purchase orders need the platform tables in the live database. Demo workspaces can raise, place and receive orders today."
        />
      </PageShell>
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  const [suppliers, purchaseOrders, products] = await Promise.all([
    suppliersCollection.load(code),
    purchaseOrdersCollection.load(code),
    listDemoProductsMerged({ activeOnly: false }, code),
  ]);

  return (
    <PageShell title="Procurement">
      <ManagerSubnav manager="products" activeHref="/manager/products/procurement" />
      <ManagerSectionHeader
        title="Procurement"
        description="Suppliers, purchase orders, receiving stock in and purchase history."
        actions={
          <Link
            href="/manager/products/inventory"
            className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
          >
            See the effect on stock
          </Link>
        }
      />
      <PurchaseOrdersPanel
        orders={purchaseOrders}
        suppliers={suppliers}
        products={products}
        currencyCode={ws.settings.currency_code}
        today={isoDayOf(new Date())}
        canEdit
      />

      <div className="mt-6">
        <ManagerSectionHeader
          title="Suppliers"
          description="Who you buy from, their lead time and payment terms, and the orders still open with them."
        />
        <SuppliersPanel
          suppliers={suppliers}
          purchaseOrders={purchaseOrders}
          canEdit
        />
      </div>
    </PageShell>
  );
}
