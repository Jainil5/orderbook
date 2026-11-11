import { Suspense } from "react";
import { AnalyticsStudio } from "@/components/analytics/analytics-studio";
import { orderInCalendarRange, resolveRange } from "@/lib/analytics/date-range";
import { computeMarginSnapshot } from "@/lib/analytics/margin";
import { snapshotFromOrderRecords } from "@/lib/analytics/snapshot";
import { revenueOrders } from "@/lib/orders/order-rules";
import {
  getDemoOrderItems,
  listDemoOrders,
  listDemoPayments,
  listDemoProductsMerged,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";

function tabFromSearchParam(
  tab: string | undefined,
):
  | "overview"
  | "trends"
  | "mix"
  | "products"
  | "payments"
  | "margin"
  | undefined {
  if (
    tab === "overview" ||
    tab === "trends" ||
    tab === "mix" ||
    tab === "products" ||
    tab === "payments" ||
    tab === "margin"
  ) {
    return tab;
  }
  return undefined;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; to?: string; range?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const params = await searchParams;
  const initialTab = tabFromSearchParam(params.tab);
  const range = resolveRange(params);
  const { from, to } = range;

  const code = toDemoBrandCode(ws.brand.code);
  const allOrders = await listDemoOrders(undefined, code);
  const orders = allOrders.filter((o) =>
    orderInCalendarRange(o.created_at, from, to),
  );
  const payments = (await listDemoPayments(code)).filter((p) => {
    const order = allOrders.find((o) => o.id === p.order_id);
    return order
      ? orderInCalendarRange(order.created_at, from, to)
      : true;
  });
  const products = await listDemoProductsMerged({}, code);
  const orderIds = orders.map((o) => o.id);
  const itemGroups = await Promise.all(
    orderIds.map((id) => getDemoOrderItems(id, code)),
  );
  const orderItems = itemGroups.flat();
  // Only completed bills earn — trend, mix, margin and collection all read
  // from this revenue set while the receivables list stays all-status.
  const revenue = revenueOrders(orders);
  const marginSnapshot = computeMarginSnapshot({
    orders: revenue,
    orderItems,
    products,
  });

  return (
    <Suspense fallback={null}>
      <AnalyticsStudio
        initialTab={initialTab}
        rangeFrom={from}
        rangeTo={to}
        rangePreset={range.preset}
        snapshot={snapshotFromOrderRecords({
          orders: revenue,
          items: orderItems,
          products,
          payments,
          currencyCode: ws.settings.currency_code,
        })}
        payments={payments}
        marginSnapshot={marginSnapshot}
      />
    </Suspense>
  );
}
