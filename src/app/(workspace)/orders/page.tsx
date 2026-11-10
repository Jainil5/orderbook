import { PageShell } from "@/components/workspace/page-shell";
import { OrdersBoard } from "@/components/orders/orders-board";
import { CsvExportButton } from "@/components/export/csv-export-button";
import { exportOrdersCsvAction } from "@/services/operations-actions";
import {
  listDemoOrderItemsForOrders,
  listDemoOrders,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { listOrderItemsForOrders, listOrders } from "@/services/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { EmptyState } from "@/components/ui/empty-state";
import { redirect } from "next/navigation";

export default async function OrdersPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode === "demo") {
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

  const { data: orders, error } = await listOrders({ page: 1, pageSize: 50 });
  const orderIds = orders.map((o) => o.id);
  const itemsRes = await listOrderItemsForOrders(orderIds);

  return (
    <PageShell
      title={ws.profile.ordersPageTitle}
      headerActions={
        <CsvExportButton label="Export CSV" onExport={exportOrdersCsvAction} />
      }
    >
      {error ? (
        <p role="alert" className="mb-4 text-sm text-[var(--ob-danger)]">{error}</p>
      ) : null}
      {itemsRes.error ? (
        <p className="mb-4 text-sm text-[var(--ob-warning)]">{itemsRes.error}</p>
      ) : null}
      {orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Orders appear here once your Supabase schema and RLS are configured."
        />
      ) : (
        <OrdersBoard
          orders={orders}
          orderItems={itemsRes.data}
          currencyCode={ws.settings.currency_code}
          orderNumberColumn={ws.profile.ordersNumberColumn}
        />
      )}
    </PageShell>
  );
}
