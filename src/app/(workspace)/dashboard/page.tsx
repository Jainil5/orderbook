import { Suspense } from "react";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import {
  createdAtRangeQuery,
  orderInCalendarRange,
  resolveRange,
} from "@/lib/analytics/date-range";
import { snapshotFromOrderRecords } from "@/lib/analytics/snapshot";
import {
  getDemoOrderItems,
  listDemoOrders,
  listDemoProductsMerged,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { isOpenQuote, isOpenReceivable } from "@/lib/orders/order-rules";
import {
  listOrderItemsForOrders,
  listOrders,
  listProducts,
} from "@/services/data";
import { listOpenQuotesAndReceivables } from "@/services/order-operations";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const range = resolveRange(await searchParams);

  // Open quotes and receivables are an action queue, not a period report,
  // so they stay all-time regardless of the selected range.
  if (ws.mode === "demo") {
    const code = toDemoBrandCode(ws.brand.code);
    const allOrders = await listDemoOrders(undefined, code);
    const orders = allOrders.filter((o) =>
      orderInCalendarRange(o.created_at, range.from, range.to),
    );
    const [itemGroups, products] = await Promise.all([
      Promise.all(orders.map((o) => getDemoOrderItems(o.id, code))),
      listDemoProductsMerged({}, code),
    ]);
    const openOrders = allOrders
      .filter((o) => isOpenQuote(o) || isOpenReceivable(o))
      .slice(0, 20);

    return (
      <Suspense fallback={null}>
        <DashboardHome
          snapshot={snapshotFromOrderRecords({
            orders,
            items: itemGroups.flat(),
            products,
            currencyCode: ws.settings.currency_code,
          })}
          range={range}
          openOrders={openOrders}
          orderNumberColumn={ws.profile.ordersNumberColumn}
        />
      </Suspense>
    );
  }

  const { dateFrom, dateTo } = createdAtRangeQuery(range.from, range.to);
  const ordersRes = await listOrders({ page: 1, pageSize: 500, dateFrom, dateTo });
  const [openRes, itemsRes, productsRes] = await Promise.all([
    listOpenQuotesAndReceivables(),
    listOrderItemsForOrders(ordersRes.data.map((o) => o.id)),
    listProducts({ activeOnly: false }),
  ]);

  return (
    <Suspense fallback={null}>
      <DashboardHome
        snapshot={snapshotFromOrderRecords({
          orders: ordersRes.data,
          items: itemsRes.data,
          products: productsRes.data,
          currencyCode: ws.settings.currency_code,
        })}
        range={range}
        notice={ordersRes.error}
        openOrders={openRes.data}
        orderNumberColumn={ws.profile.ordersNumberColumn}
      />
    </Suspense>
  );
}
