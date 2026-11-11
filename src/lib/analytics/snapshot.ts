import type { Order, OrderItem, Payment, Product } from "@/types/database";

export type Slice = { name: string; value: number };

export type TrendPoint = { date: string; revenue: number; orders: number };

export type AnalyticsSnapshot = {
  currencyCode: string;
  grossSales: number;
  netSales: number;
  orderCount: number;
  averageOrderValue: number;
  itemsSold: number;
  discountTotal: number;
  paidAmount: number;
  pendingAmount: number;
  salesByCategory: Slice[];
  salesOverTime: TrendPoint[];
  topProducts: { name: string; qty: number }[];
  paymentMethods: Slice[];
  orderStatuses: Slice[];
  paymentStatuses: Slice[];
  /** True when no line-item detail was available to build the mix charts. */
  partial: boolean;
};

function titleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function tally(orders: Order[], key: "status" | "payment_status"): Slice[] {
  const map = new Map<string, number>();
  for (const order of orders) {
    const name = titleCase(order[key]);
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return Array.from(map, ([name, value]) => ({ name, value })).sort(
    (a, b) => b.value - a.value,
  );
}

/**
 * Builds a snapshot from order headers, enriched with line-item and payment
 * slices when the caller supplies them.
 *
 * Range filtering needs this: deriving category mix, top products and tender
 * mix from the underlying rows keeps those charts populated for any date range.
 */
export function snapshotFromOrderRecords(params: {
  orders: Order[];
  items?: OrderItem[];
  products?: Product[];
  payments?: Payment[];
  currencyCode: string;
}): AnalyticsSnapshot {
  const { orders, currencyCode } = params;
  const netSales = orders.reduce((sum, order) => sum + order.grand_total, 0);
  const grossSales = orders.reduce((sum, order) => sum + order.subtotal, 0);
  const discountTotal = orders.reduce(
    (sum, order) => sum + order.discount_total,
    0,
  );
  const paidAmount = orders
    .filter((order) => order.payment_status === "paid")
    .reduce((sum, order) => sum + order.grand_total, 0);
  const pendingAmount = orders
    .filter((order) => order.payment_status !== "paid")
    .reduce((sum, order) => sum + order.grand_total, 0);

  const buckets = new Map<string, TrendPoint & { stamp: number }>();
  for (const order of orders) {
    const created = new Date(order.created_at);
    const date = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
    }).format(created);
    const current = buckets.get(date) ?? {
      date,
      revenue: 0,
      orders: 0,
      stamp: created.getTime(),
    };
    current.revenue += order.grand_total;
    current.orders += 1;
    current.stamp = Math.min(current.stamp, created.getTime());
    buckets.set(date, current);
  }

  const orderIds = new Set(orders.map((order) => order.id));
  const scopedItems = (params.items ?? []).filter((item) =>
    orderIds.has(item.order_id),
  );
  const categoryByProductId = new Map(
    (params.products ?? []).map((product) => [product.id, product.category]),
  );

  const categoryTotals = new Map<string, number>();
  const productQuantities = new Map<string, number>();
  let itemsSold = 0;
  for (const item of scopedItems) {
    const rawCategory = categoryByProductId.get(item.product_id ?? "") ?? "";
    const category = rawCategory.trim() || "Uncategorised";
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + item.line_total);
    productQuantities.set(
      item.product_name_snapshot,
      (productQuantities.get(item.product_name_snapshot) ?? 0) + item.quantity,
    );
    itemsSold += item.quantity;
  }

  const hasLineData = scopedItems.length > 0 && (params.products?.length ?? 0) > 0;

  const tenderTotals = new Map<string, number>();
  for (const payment of params.payments ?? []) {
    if (!orderIds.has(payment.order_id)) continue;
    // A failed or refunded tender never reached the drawer.
    if (payment.status === "failed" || payment.status === "refunded") continue;
    tenderTotals.set(
      payment.method,
      (tenderTotals.get(payment.method) ?? 0) + payment.amount,
    );
  }

  return {
    currencyCode,
    grossSales,
    netSales,
    orderCount: orders.length,
    averageOrderValue: orders.length ? netSales / orders.length : 0,
    itemsSold,
    discountTotal,
    paidAmount,
    pendingAmount,
    salesByCategory: hasLineData
      ? Array.from(categoryTotals, ([name, value]) => ({ name, value })).sort(
          (a, b) => b.value - a.value,
        )
      : [],
    salesOverTime: Array.from(buckets.values())
      .sort((a, b) => a.stamp - b.stamp)
      .map(({ date, revenue, orders: count }) => ({
        date,
        revenue,
        orders: count,
      })),
    topProducts: hasLineData
      ? Array.from(productQuantities, ([name, qty]) => ({ name, qty })).sort(
          (a, b) => b.qty - a.qty,
        )
      : [],
    paymentMethods: Array.from(tenderTotals, ([name, value]) => ({ name, value })).sort(
      (a, b) => b.value - a.value,
    ),
    orderStatuses: tally(orders, "status"),
    paymentStatuses: tally(orders, "payment_status"),
    partial: !hasLineData,
  };
}
