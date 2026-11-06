import { Suspense } from "react";
import { AnalyticsStudio } from "@/components/analytics/analytics-studio";
import {
  createdAtRangeQuery,
  orderInCalendarRange,
  resolveRange,
} from "@/lib/analytics/date-range";
import { computeMarginSnapshot } from "@/lib/analytics/margin";
import { snapshotFromOrderRecords } from "@/lib/analytics/snapshot";
import {
  getDemoOrderItems,
  listDemoOrders,
  listDemoPayments,
  listDemoProductsMerged,
  toDemoBrandCode,
} from "@/lib/demo/data";
import {
  listOrderItemsForOrders,
  listOrders,
  listPayments,
  listProducts,
} from "@/services/data";
import { fetchAnalyticsSnapshotLive } from "@/services/quotes";
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

  if (ws.mode === "demo") {
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
    const marginSnapshot = computeMarginSnapshot({
      orders,
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
            orders,
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

  const { dateFrom, dateTo } = createdAtRangeQuery(from, to);
  const [ordersRes, paymentsRes, productsRes, rpcKpis] = await Promise.all([
    listOrders({ page: 1, pageSize: 500, dateFrom, dateTo }),
    listPayments(),
    listProducts({ activeOnly: false }),
    fetchAnalyticsSnapshotLive(dateFrom, dateTo),
  ]);

  const orderIds = ordersRes.data.map((o) => o.id);
  const itemsRes = await listOrderItemsForOrders(orderIds);
  const inRangeOrderIds = new Set(orderIds);
  const filteredPayments = paymentsRes.data.filter((payment) =>
    inRangeOrderIds.has(payment.order_id),
  );
  const marginSnapshot = computeMarginSnapshot({
    orders: ordersRes.data,
    orderItems: itemsRes.data,
    products: productsRes.data,
  });

  let snapshot = snapshotFromOrderRecords({
    orders: ordersRes.data,
    items: itemsRes.data,
    products: productsRes.data,
    payments: filteredPayments,
    currencyCode: ws.settings.currency_code,
  });
  let rangeNotice: string | undefined;
  if (rpcKpis.ok) {
    snapshot = {
      ...snapshot,
      netSales: rpcKpis.netSales,
      orderCount: rpcKpis.orderCount,
      discountTotal: rpcKpis.discountTotal,
      paidAmount: rpcKpis.paidAmount,
      pendingAmount: rpcKpis.pendingAmount,
      grossSales: rpcKpis.netSales + rpcKpis.discountTotal,
      averageOrderValue:
        rpcKpis.orderCount > 0 ? rpcKpis.netSales / rpcKpis.orderCount : 0,
    };
  } else if (process.env.NODE_ENV === "development") {
    rangeNotice = rpcKpis.message;
  }

  return (
    <Suspense fallback={null}>
      <AnalyticsStudio
        initialTab={initialTab}
        rangeFrom={from}
        rangeTo={to}
        rangePreset={range.preset}
        snapshot={snapshot}
        notice={ordersRes.error}
        rangeNotice={rangeNotice}
        payments={filteredPayments}
        paymentsNotice={paymentsRes.error}
        marginSnapshot={marginSnapshot}
      />
    </Suspense>
  );
}
