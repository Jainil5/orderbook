import type {
  InventoryAdjustment,
  InventoryItem,
  Order,
  OrderItem,
  ProductIngredient,
} from "@/types/database";

/**
 * Pure maths for kitchen / workshop stock. Nothing here reads cookies or the
 * packs, so the same functions serve the demo, the tests and (later) a real
 * database-backed brand.
 *
 * Two separate ideas, deliberately kept apart:
 *  - **Position** — packs on the shelf: the counted opening balance plus every
 *    recorded movement (purchases in, wastage out, order consumption out).
 *  - **Usage** — what the menu actually ate, derived from order lines against
 *    each product's ingredient list. Derived over all orders, so a brand's
 *    seeded history reports usage without anyone back-filling a ledger.
 */

export type InventoryStatus = "out" | "low" | "ok";

export type InventoryPosition = {
  item: InventoryItem;
  /** Net packs: opening `stock_packs` plus every recorded movement. */
  packs: number;
  /** `packs * units_per_pack` — the number a chef would actually count. */
  units: number;
  costPerUnit: number;
  value: number;
  status: InventoryStatus;
  /** Packs below the reorder line, i.e. `low_stock_packs - packs`. */
  shortBy: number;
};

export type UsageRow = {
  itemId: string;
  itemName: string;
  unit: string;
  units: number;
  packs: number;
  cost: number;
};

const PACK_DP = 3;

function round(value: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Division is guarded, because a 0 pack size would poison every report. */
export function costPerUnit(item: InventoryItem): number {
  return item.units_per_pack > 0 ? item.cost_per_pack / item.units_per_pack : 0;
}

export function unitsToPacks(item: InventoryItem, units: number): number {
  return item.units_per_pack > 0 ? units / item.units_per_pack : 0;
}

export function packsToUnits(item: InventoryItem, packs: number): number {
  return packs * item.units_per_pack;
}

/**
 * An order only consumes stock once it is a real commitment: quotations
 * (`draft`), cancelled bills, refunds and credit notes are excluded, otherwise
 * a quote someone never accepted would still eat the bread.
 */
export function isConsumingOrder(order: Order): boolean {
  if (order.order_kind === "credit_note") return false;
  return order.status !== "draft" && order.status !== "cancelled" &&
    order.status !== "refunded";
}

export function inventoryPosition(
  item: InventoryItem,
  ledger: InventoryAdjustment[],
): InventoryPosition {
  const movements = ledger
    .filter((row) => row.item_id === item.id)
    .reduce((sum, row) => sum + row.delta_packs, 0);
  const packs = round(Math.max(0, item.stock_packs + movements), PACK_DP);
  const units = round(packsToUnits(item, packs), PACK_DP);
  const perUnit = costPerUnit(item);
  const status: InventoryStatus =
    packs <= 0 ? "out" : packs <= item.low_stock_packs ? "low" : "ok";
  return {
    item,
    packs,
    units,
    costPerUnit: round(perUnit, 2),
    value: round(packs * item.cost_per_pack, 2),
    status,
    shortBy: round(Math.max(0, item.low_stock_packs - packs), PACK_DP),
  };
}

export function inventoryPositions(
  items: InventoryItem[],
  ledger: InventoryAdjustment[],
): InventoryPosition[] {
  return items.map((item) => inventoryPosition(item, ledger));
}

export function lowStockPositions(
  items: InventoryItem[],
  ledger: InventoryAdjustment[],
): InventoryPosition[] {
  return inventoryPositions(items, ledger).filter((p) => p.status !== "ok");
}

export function inventoryCategories(items: InventoryItem[]): string[] {
  const set = new Set<string>();
  for (const item of items) set.add(item.category ?? "Uncategorized");
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * What one sold unit of a product costs in raw material — the number that
 * turns a menu price into a margin. Ingredients pointing at an unknown stock
 * item are skipped rather than silently priced at zero.
 */
export function recipeCostPerSale(
  ingredients: ProductIngredient[],
  items: InventoryItem[],
): number {
  const byId = new Map(items.map((item) => [item.id, item]));
  let total = 0;
  for (const row of ingredients) {
    const item = byId.get(row.item_id);
    if (!item) continue;
    total += row.qty_per_sale * costPerUnit(item);
  }
  return round(total, 2);
}

/** Ingredient lines for one product, ordered by the merchant's own list. */
export function ingredientsForProduct(
  productId: string,
  ingredients: ProductIngredient[],
): ProductIngredient[] {
  return ingredients.filter((row) => row.product_id === productId);
}

export type ProductUsageLine = {
  orderItemId: string;
  productId: string | null;
  productName: string;
  quantity: number;
  rows: UsageRow[];
  cost: number;
};

/**
 * Per line of one order: which stock items it drained and by how much. Lines
 * whose product has no ingredient list produce nothing at all, so a brand
 * without recipes (the furniture pack) simply reports no usage.
 */
export function usageForOrderItems(
  orderItems: OrderItem[],
  ingredients: ProductIngredient[],
  items: InventoryItem[],
): ProductUsageLine[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const byProduct = new Map<string, ProductIngredient[]>();
  for (const row of ingredients) {
    const list = byProduct.get(row.product_id) ?? [];
    list.push(row);
    byProduct.set(row.product_id, list);
  }
  const out: ProductUsageLine[] = [];
  for (const line of orderItems) {
    if (!line.product_id) continue;
    const recipe = byProduct.get(line.product_id);
    if (!recipe?.length) continue;
    const rows = aggregateUsage(
      recipe
        .map((entry) => ({
          item: byId.get(entry.item_id),
          units: entry.qty_per_sale * line.quantity,
        }))
        .filter((seed) => seed.units > 0),
    );
    if (!rows.length) continue;
    out.push({
      orderItemId: line.id,
      productId: line.product_id,
      productName: line.product_name_snapshot,
      quantity: line.quantity,
      rows,
      cost: round(rows.reduce((sum, row) => sum + row.cost, 0), 2),
    });
  }
  return out;
}

type UsageSeed = {
  item: InventoryItem | undefined;
  units: number;
};

function aggregateUsage(seeds: UsageSeed[]): UsageRow[] {
  const acc = new Map<string, UsageRow>();
  for (const seed of seeds) {
    const item = seed.item;
    if (!item || !(seed.units > 0)) continue;
    const packs = unitsToPacks(item, seed.units);
    const row = acc.get(item.id) ?? {
      itemId: item.id,
      itemName: item.name,
      unit: item.unit,
      units: 0,
      packs: 0,
      cost: 0,
    };
    row.units = round(row.units + seed.units, PACK_DP);
    row.packs = round(row.packs + packs, PACK_DP);
    row.cost = round(row.cost + packs * item.cost_per_pack, 2);
    acc.set(item.id, row);
  }
  return Array.from(acc.values()).sort((a, b) => b.cost - a.cost);
}

/**
 * Everything the sold orders drained, grouped by stock item and priced at the
 * pack cost. This is the report a cafe owner reads on Monday: which items the
 * weekend ate through, and what that cost.
 */
export function aggregateOrderUsage(
  orderItems: OrderItem[],
  ingredients: ProductIngredient[],
  items: InventoryItem[],
): UsageRow[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return aggregateUsage(
    usageForOrderItems(orderItems, ingredients, items)
      .flatMap((line) => line.rows)
      .map((row) => ({ item: byId.get(row.itemId), units: row.units })),
  );
}

/** Units that never take an English plural: 40 sq ft, 150 ml, 2 ea. */
const UNCOUNTED_UNITS = new Set(["g", "kg", "ml", "l", "sq ft", "ea"]);

/**
 * Packs are counted in whatever the merchant bought them as — slice, glass,
 * patty, leaf — so the plural has to be built here rather than assumed. Only
 * the regular English endings are handled; anything stranger stays as typed.
 */
function pluralUnit(unit: string): string {
  if (UNCOUNTED_UNITS.has(unit)) return unit;
  if (/(s|x|z|ch|sh)$/.test(unit)) return `${unit}es`; // glass -> glasses
  if (/[^aeiou]y$/.test(unit)) return `${unit.slice(0, -1)}ies`; // patty -> patties
  if (/[^f]f$/.test(unit)) return `${unit.slice(0, -1)}ves`; // leaf -> leaves
  return `${unit}s`;
}

/** One place decides how a quantity reads: "6 slices", "180 g", "1 shot". */
export function formatUnitCount(value: number, unit: string): string {
  // Pluralise the number actually shown, so 1.04 reads "1 slice" and not
  // "1 slices" one second before it reads "1.1 slices".
  const shown = Math.round(value * 10) / 10;
  const n = Number.isInteger(shown) ? String(shown) : shown.toFixed(1);
  if (Math.abs(shown) === 1 || UNCOUNTED_UNITS.has(unit)) return `${n} ${unit}`;
  return `${n} ${pluralUnit(unit)}`;
}

/**
 * Ledger rows for the stock one order drained: one negative movement per item,
 * noted with the order number so a shelf count can be traced back to a bill.
 * The value consumed stays in the usage report, so `cost` is left null — the
 * ledger's `cost` means money that actually left the till on a purchase.
 */
export function consumptionMovements(
  rows: UsageRow[],
  meta: {
    brandId: string;
    orderNumber: string;
    createdAt: string;
    newId: () => string;
  },
): InventoryAdjustment[] {
  return rows
    .filter((row) => row.packs > 0)
    .map((row) => ({
      id: meta.newId(),
      brand_id: meta.brandId,
      item_id: row.itemId,
      delta_packs: -round(row.packs, PACK_DP),
      kind: "issue" as const,
      cost: null,
      note: meta.orderNumber,
      created_at: meta.createdAt,
    }));
}
