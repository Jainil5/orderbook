import type { Order, OrderItem, Product } from "@/types/database";

export type MarginLine = {
  name: string;
  qty: number;
  revenue: number;
  cost: number;
  margin: number;
};

export type MarginSnapshot = {
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
  lines: MarginLine[];
};

export function computeMarginSnapshot(params: {
  orders: Order[];
  orderItems: OrderItem[];
  products: Product[];
}): MarginSnapshot {
  const productCost = new Map(
    params.products.map((p) => [p.id, p.cost_price ?? 0]),
  );
  const orderById = new Map(params.orders.map((o) => [o.id, o]));
  const lines: MarginLine[] = [];
  let revenue = 0;
  let cost = 0;

  for (const item of params.orderItems) {
    const order = orderById.get(item.order_id);
    if (!order || order.status === "cancelled" || order.status === "refunded") {
      continue;
    }
    if (order.parent_order_id) continue;
    const unitCost =
      item.product_id != null ? (productCost.get(item.product_id) ?? 0) : 0;
    const lineRevenue = item.line_total;
    const lineCost = unitCost * item.quantity;
    revenue += lineRevenue;
    cost += lineCost;
    lines.push({
      name: item.product_name_snapshot,
      qty: item.quantity,
      revenue: lineRevenue,
      cost: lineCost,
      margin: lineRevenue - lineCost,
    });
  }

  lines.sort((a, b) => b.margin - a.margin);
  const margin = revenue - cost;
  return {
    revenue,
    cost,
    margin,
    marginPercent: revenue > 0 ? (margin / revenue) * 100 : 0,
    lines: lines.slice(0, 20),
  };
}
