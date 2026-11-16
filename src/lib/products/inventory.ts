import {
  isDeadStock,
  isLowStock,
  isOutOfStock,
  inventoryValuation,
  lowStockProducts,
  productStock,
} from "@/lib/business/overview";
import type { Order, OrderItem, Product, StockAdjustment } from "@/types/database";

/**
 * Inventory selectors for Products Manager → Inventory.
 *
 * Pure functions only: the page loads the data, this module decides what it
 * means. Low/out detection deliberately delegates to `lib/business/overview`
 * so the counts on `/manager/products` and `/manager` agree with this screen.
 */

/**
 * `untracked` means no reorder level has been set, so the line cannot be low
 * or out by definition — it still carries stock if `stock_qty` was entered.
 */
export type StockStatus = "ok" | "low" | "out" | "untracked";

export const STOCK_FILTERS = ["all", "low", "out", "untracked"] as const;
export type StockFilter = (typeof STOCK_FILTERS)[number];

export function stockStatus(product: Product): StockStatus {
  const threshold = product.low_stock_threshold;
  if (threshold == null || !Number.isFinite(threshold)) return "untracked";
  const qty = productStock(product);
  if (qty <= 0) return "out";
  if (qty <= threshold) return "low";
  return "ok";
}

function matchesStockFilter(
  product: Product,
  filter: StockFilter,
): boolean {
  return filter === "all" || stockStatus(product) === filter;
}

export function filterByStockStatus(
  products: Product[],
  filter: StockFilter,
): Product[] {
  if (filter === "all") return products;
  return products.filter((p) => matchesStockFilter(p, filter));
}

/** SKU counts for the filter chips; `ok` lines only show up in `all`. */
export function skusByStatus(products: Product[]): Record<StockFilter, number> {
  const counts: Record<StockFilter, number> = {
    all: products.length,
    low: 0,
    out: 0,
    untracked: 0,
  };
  for (const product of products) {
    const status = stockStatus(product);
    if (status !== "ok") counts[status] += 1;
  }
  return counts;
}

export type InventorySummary = {
  skus: number;
  tracked: number;
  untracked: number;
  units: number;
  costValue: number;
  retailValue: number;
  lowCount: number;
  outCount: number;
};

export function summarizeInventory(products: Product[]): InventorySummary {
  const tracked = products.filter((p) => stockStatus(p) !== "untracked");
  const value = inventoryValuation(products);
  return {
    skus: products.length,
    tracked: tracked.length,
    untracked: products.length - tracked.length,
    units: value.units,
    costValue: value.costValue,
    retailValue: value.retailValue,
    lowCount: products.filter(isLowStock).length,
    outCount: products.filter(isOutOfStock).length,
  };
}

/**
 * Quantity that brings a tracked line back to twice its reorder level.
 * Returns 0 when the line is healthy, untracked, or has no usable level.
 */
export function reorderSuggestion(product: Product): number {
  const threshold = product.low_stock_threshold;
  if (threshold == null || threshold <= 0) return 0;
  const qty = productStock(product);
  if (qty > threshold) return 0;
  return Math.max(Math.ceil(threshold * 2 - qty), 0);
}

/** Active lines at or below their reorder level, worst stock first. */
export function lowStockAlerts(products: Product[]): Product[] {
  return lowStockProducts(products);
}

export type StockMovement = {
  id: string;
  productId: string;
  productName: string;
  delta: number;
  reason: string;
  source: "adjustment" | "sale";
  /** ISO timestamp of the movement. */
  at: string;
};

/**
 * Sales that consumed stock. Mirrors `computeMarginSnapshot`: cancelled and
 * refunded orders do not count, and credit notes (child orders) are skipped so
 * a return is not booked as a second sale. Names come from the order line, so a
 * product renamed or deleted since the sale still reads correctly.
 */
function saleMovements(orders: Order[], orderItems: OrderItem[]): StockMovement[] {
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const rows: StockMovement[] = [];

  for (const item of orderItems) {
    if (!item.product_id) continue;
    const order = orderById.get(item.order_id);
    if (!order) continue;
    if (order.status === "cancelled" || order.status === "refunded") continue;
    if (order.parent_order_id || order.order_kind === "credit_note") continue;
    if (item.quantity <= 0) continue;
    rows.push({
      id: `sale-${item.id}`,
      productId: item.product_id,
      productName: item.product_name_snapshot,
      delta: -item.quantity,
      reason: `Sale · ${order.order_number}`,
      source: "sale",
      at: order.created_at,
    });
  }
  return rows;
}

/** `source` first, then id, so equal timestamps stay deterministic. */
const MOVEMENT_SOURCE_RANK: Record<StockMovement["source"], number> = {
  adjustment: 0,
  sale: 1,
};

export function compareMovements(a: StockMovement, b: StockMovement): number {
  const byTime = new Date(b.at).getTime() - new Date(a.at).getTime();
  if (byTime !== 0) return byTime;
  const bySource = MOVEMENT_SOURCE_RANK[a.source] - MOVEMENT_SOURCE_RANK[b.source];
  if (bySource !== 0) return bySource;
  return a.id.localeCompare(b.id);
}

/** Adjustments plus order-derived consumption, newest first. */
export function buildMovementLedger(params: {
  products: Product[];
  adjustments: StockAdjustment[];
  orders: Order[];
  orderItems: OrderItem[];
}): StockMovement[] {
  const nameById = new Map(params.products.map((p) => [p.id, p.name]));
  const adjustments = params.adjustments.map<StockMovement>((row) => ({
    id: row.id,
    productId: row.product_id,
    productName: nameById.get(row.product_id) ?? "Removed product",
    delta: row.delta_qty,
    reason: row.reason,
    source: "adjustment",
    at: row.created_at,
  }));
  return [...adjustments, ...saleMovements(params.orders, params.orderItems)].sort(
    compareMovements,
  );
}

/** Active lines holding stock that no order in the window sold. */
export function deadStockCandidates(
  products: Product[],
  soldIds: ReadonlySet<string>,
): Product[] {
  return products.filter((p) => isDeadStock(p, soldIds));
}

export function soldProductIds(
  orders: Order[],
  orderItems: OrderItem[],
): Set<string> {
  const soldOrderId = new Set(
    orders
      .filter(
        (o) =>
          o.status !== "cancelled" &&
          o.status !== "refunded" &&
          !o.parent_order_id &&
          o.order_kind !== "credit_note",
      )
      .map((o) => o.id),
  );
  const ids = new Set<string>();
  for (const item of orderItems) {
    if (item.product_id && soldOrderId.has(item.order_id)) {
      ids.add(item.product_id);
    }
  }
  return ids;
}

export type StockedRow = { product: Product; status: StockStatus };

/** Rows for the stock table, sorted so problem lines surface first. */
export function stockRows(products: Product[], filter: StockFilter): StockedRow[] {
  return filterByStockStatus(products, filter)
    .map((product) => ({ product, status: stockStatus(product) }))
    .sort((a, b) => {
      const byStatus = STATUS_SEVERITY[a.status] - STATUS_SEVERITY[b.status];
      if (byStatus !== 0) return byStatus;
      return a.product.name.localeCompare(b.product.name);
    });
}

const STATUS_SEVERITY: Record<StockStatus, number> = {
  out: 0,
  low: 1,
  untracked: 2,
  ok: 3,
};
