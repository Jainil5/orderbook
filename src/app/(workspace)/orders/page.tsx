import { PageShell } from "@/components/workspace/page-shell";
import { OrdersBoard } from "@/components/orders/orders-board";
import { CsvExportButton } from "@/components/export/csv-export-button";
import { exportOrdersCsvAction } from "@/services/operations-actions";
import {
  listDemoOrderItemsForOrders,
  listDemoOrders,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { EmptyState } from "@/components/ui/empty-state";
import { redirect } from "next/navigation";

export default async function OrdersPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const code = toDemoBrandCode(ws.brand.code);
  const [orders, orderItems] = await Promise.all([
    listDemoOrders(undefined, code),
    listDemoOrderItemsForOrders(code),
  ]);
  return (
    <PageShell
      title={ws.profile.ordersPageTitle}
      headerActions={
        <CsvExportButton label="Export CSV" onExport={exportOrdersCsvAction} />
      }
    >
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" />
      ) : (
        <OrdersBoard
          orders={orders}
          orderItems={orderItems}
          currencyCode={ws.settings.currency_code}
          orderNumberColumn={ws.profile.ordersNumberColumn}
        />
      )}
    </PageShell>
  );
}