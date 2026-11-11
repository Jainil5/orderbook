import { Suspense } from "react";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { orderInCalendarRange, resolveRange } from "@/lib/analytics/date-range";
import { snapshotFromOrderRecords } from "@/lib/analytics/snapshot";
import {
  getDemoOrderItems,
  listDemoOrders,
  listDemoPayments,
  listDemoProductsMerged,
  toDemoBrandCode,
} from "@/lib/demo/data";
import {
  isOpenQuote,
  isOpenReceivable,
  revenueOrders,
} from "@/lib/orders/order-rules";
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
  const code = toDemoBrandCode(ws.brand.code);
  const allOrders = await listDemoOrders(undefined, code);
  const rangedOrders = allOrders.filter((o) =>
    orderInCalendarRange(o.created_at, range.from, range.to),
  );
  // Only completed bills earn; pending/draft/cancelled stay out of the trend
  // and the collection widget, while open balances below still surface them.
  const orders = revenueOrders(rangedOrders);
  const [itemGroups, products, payments] = await Promise.all([
    Promise.all(orders.map((o) => getDemoOrderItems(o.id, code))),
    listDemoProductsMerged({}, code),
    listDemoPayments(code),
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
          payments,
          currencyCode: ws.settings.currency_code,
        })}
        range={range}
        openOrders={openOrders}
        orderNumberColumn={ws.profile.ordersNumberColumn}
      />
    </Suspense>
  );
}