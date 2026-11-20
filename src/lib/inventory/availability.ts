/**
 * "Can this actually be sold right now?" — the single answer Billing, the
 * quotation builder and the Inventory tab all read from.
 *
 * POS has always judged a menu item by `product.stock_qty`, which is a number
 * someone typed onto the product row. For anything made from stock that number
 * is a guess: a Flat White sells happily while the milk is out, because the
 * milk is not on the coffee's row. This module derives the truth from the
 * shelf instead — the recipe says what one sale drains, the position says what
 * the shelf can hand out, and the smaller quotient wins.
 *
 * Pure by construction: types and the helpers in `./stock` only. No `next`, no
 * cookies, no demo pack, so the same maths holds for a database-backed brand.
 *
 * The rules, in one place:
 *  - A product **with recipe lines** is limited by its ingredients.
 *  - A product **without recipe lines** falls back to `product.stock_qty`, so a
 *    brand with no recipes at all (furniture) keeps behaving exactly as it does
 *    in POS today and never inherits a bogus badge.
 *  - A product with neither is `untracked`: nothing is known, so nothing is
 *    claimed.
 *  - An unknown stock item behind an ingredient row is skipped, never counted
 *    as zero — the same rule `recipeCostPerSale` follows. A row that drains
 *    nothing (`qty_per_sale <= 0`) is skipped too: it cannot bind a shelf.
 *  - A shelf is never negative; `inventoryPosition` already floors it and the
 *    clamping here covers hand-built positions.
 *  - `out` means the shelf cannot make one more sale. `low` means the binding
 *    item has crossed its own reorder line, converted into sales
 *    (`low_stock_packs x units_per_pack / perSale`), or that fewer than
 *    `lowBufferUnits` (default 5) could be made — whichever says more. `ok` is
 *    everything else, and `untracked` is a product nothing was said about.
 */

import type {
  InventoryAdjustment,
  InventoryItem,
  Product,
  ProductIngredient,
} from "@/types/database";
import { formatUnitCount, packsToUnits } from "./stock";
import type { InventoryPosition } from "./stock";

export type ProductStockStatus = "ok" | "low" | "out" | "untracked";

/** One ingredient the recipe drains, and what the shelf allows from it. */
export type AvailabilityLine = {
  itemId: string;
  name: string;
  unit: string;
  /** Units the shelf can hand out, floored at zero. */
  availableUnits: number;
  /** Units one sold unit of the product drains (recipe `qty_per_sale`). */
  perSale: number;
  /** Sales this single item allows: `floor(availableUnits / perSale)`. */
  makes: number;
};

export type ProductAvailability = {
  productId: string;
  /**
   * Carried so a caller can phrase a block without holding the product row.
   * Optional, because nothing outside `availabilityForProducts` has to know it.
   */
  productName?: string;
  status: ProductStockStatus;
  /** How many of this product the shelf can actually make. null = untracked. */
  sellableUnits: number | null;
  /** The binding constraint, e.g. "Milk"; null when nothing is short. */
  constrainedBy: string | null;
  /** Short tile text, e.g. "2 left" / "Milk out" / null when nothing to say. */
  badge: string | null;
  /** Which stock items the recipe drains and what each allows. */
  lines: AvailabilityLine[];
};

export type AvailabilityOptions = {
  /**
   * Floor under which a product counts as low even when the shelf's own
   * reorder line is comfortable. Defaults to 5, the same fallback
   * `isLowStock` uses for a product row with no threshold.
   */
  lowBufferUnits?: number;
};

export type RestockAlert = {
  itemId: string;
  name: string;
  category: string;
  unit: string;
  /** Only the two alertable states reach the queue. */
  status: "out" | "low";
  packsOnShelf: number;
  /** `InventoryItem.low_stock_packs`, the reorder line in packs. */
  reorderAt: number;
  /** Packs to buy to get back to the reorder line plus one pack. */
  suggestedPacks: number;
  /** Menu items that drain this item, so the alert says what is at risk. */
  drainsProducts: string[];
};

/**
 * `drainsProducts` needs the menu, and the queue's two arguments are stock
 * rows, so the recipe side arrives here. Omit it and the queue still works,
 * just without the "what is at risk" column.
 */
export type RestockQueueContext = {
  ingredients: readonly ProductIngredient[];
  products: readonly Product[];
};

export type RecentRestock = {
  itemId: string;
  name: string;
  /** ISO timestamp of the purchase that landed it. */
  restockedAt: string;
  unitsAdded: number;
  /** Days the shelf sat empty before that purchase; null = it never did. */
  wasOutForDays: number | null;
};

export type RecentRestockOptions = {
  withinDays: number;
  /** Epoch ms the window is measured back from — passed in, never `Date.now()`. */
  now: number;
};

const DEFAULT_LOW_BUFFER_UNITS = 5;
const PACK_DP = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `stock.ts` keeps its own rounding private, so derived numbers round here. */
function round(value: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/**
 * Floor a division without letting 1.7999999999999998 read as one sale when
 * the shelf and the recipe were both exact.
 */
function floorMakes(availableUnits: number, perSale: number): number {
  return Math.floor(round(availableUnits / perSale, 6));
}

function shelfUnits(position: InventoryPosition): number {
  // The shelf cannot go negative, whatever built the position.
  return round(Math.max(0, position.units), PACK_DP);
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * The fallback every brand without recipes runs on — and every recipe product
 * whose ingredient rows resolve to nothing. Reads `product.stock_qty` exactly
 * as POS does today, so the two never disagree about a row nobody derived.
 */
function availabilityFromStockQty(
  product: Product,
  lowBufferUnits: number,
): ProductAvailability {
  const base = {
    productId: product.id,
    productName: product.name,
    lines: [] as AvailabilityLine[],
    constrainedBy: null,
  };
  if (!isFiniteNumber(product.stock_qty)) {
    return { ...base, status: "untracked", sellableUnits: null, badge: null };
  }
  const qty = Math.max(0, product.stock_qty);
  if (qty <= 0) {
    return {
      ...base,
      status: "out",
      sellableUnits: 0,
      badge: "Out of stock",
    };
  }
  const threshold = isFiniteNumber(product.low_stock_threshold)
    ? product.low_stock_threshold
    : lowBufferUnits;
  const low = qty <= threshold;
  return {
    ...base,
    status: low ? "low" : "ok",
    sellableUnits: qty,
    badge: low ? `${qty} left` : null,
  };
}

/**
 * Recipe rows -> the lines that bind. Duplicate rows naming the same stock
 * item are merged (a recipe that lists milk twice drains the sum), unknown
 * items and zero drains are skipped.
 */
function availabilityLines(
  recipe: readonly ProductIngredient[],
  positionById: Map<string, InventoryPosition>,
): AvailabilityLine[] {
  const acc = new Map<string, { position: InventoryPosition; perSale: number }>();
  for (const row of recipe) {
    const position = positionById.get(row.item_id);
    // Same rule as recipeCostPerSale: a row pointing at an unknown stock item
    // is not a free row, it is a row this module knows nothing about.
    if (!position) continue;
    if (!(row.qty_per_sale > 0)) continue;
    const seen = acc.get(position.item.id);
    if (seen) seen.perSale = round(seen.perSale + row.qty_per_sale, PACK_DP);
    else acc.set(position.item.id, { position, perSale: row.qty_per_sale });
  }
  return Array.from(acc.entries()).map(([itemId, entry]) => {
    const availableUnits = shelfUnits(entry.position);
    return {
      itemId,
      name: entry.position.item.name,
      unit: entry.position.item.unit,
      availableUnits,
      perSale: entry.perSale,
      makes: floorMakes(availableUnits, entry.perSale),
    };
  });
}

/**
 * How many sales the binding item's own reorder line would have allowed —
 * the product-level reading of "the shelf is at or below its reorder point".
 */
function reorderEquivalent(
  item: InventoryItem,
  perSale: number,
): number {
  return floorMakes(packsToUnits(item, Math.max(0, item.low_stock_packs)), perSale);
}

function availabilityFromRecipe(
  product: Product,
  lines: AvailabilityLine[],
  positionById: Map<string, InventoryPosition>,
  lowBufferUnits: number,
): ProductAvailability {
  const binding = lines.reduce(
    (worst, line) => (line.makes < worst.makes ? line : worst),
    lines[0],
  );
  const sellableUnits = Math.max(0, binding.makes);
  const short = {
    productId: product.id,
    productName: product.name,
    sellableUnits,
    lines,
  };
  if (sellableUnits <= 0) {
    const position = positionById.get(binding.itemId);
    // A shelf that is genuinely empty reads "Milk out"; a shelf with a sliver
    // too small for one sale says what is left, in the merchant's own unit,
    // so nobody pours away 900 ml of milk that was never a problem.
    const badge =
      binding.availableUnits > 0 && position
        ? `${formatUnitCount(binding.availableUnits, binding.unit)} of ${binding.name} left`
        : `${binding.name} out`;
    return { ...short, status: "out", constrainedBy: binding.name, badge };
  }
  const position = positionById.get(binding.itemId);
  const atReorder = position
    ? reorderEquivalent(position.item, binding.perSale)
    : 0;
  const threshold = Math.max(lowBufferUnits, atReorder);
  const low = sellableUnits <= threshold;
  return {
    ...short,
    status: low ? "low" : "ok",
    // Nothing is short, so nothing is to blame.
    constrainedBy: low ? binding.name : null,
    badge: low ? `${sellableUnits} left` : null,
  };
}

/**
 * Availability for a whole menu in one pass. Products with no recipe rows fall
 * back to `stock_qty`; a recipe whose every row points at an unknown stock item
 * is treated as no recipe at all rather than a shelf of zeros.
 */
export function availabilityForProducts(
  products: readonly Product[],
  ingredients: readonly ProductIngredient[],
  positions: readonly InventoryPosition[],
  opts: AvailabilityOptions = {},
): Map<string, ProductAvailability> {
  const lowBufferUnits =
    isFiniteNumber(opts.lowBufferUnits) && opts.lowBufferUnits >= 0
      ? opts.lowBufferUnits
      : DEFAULT_LOW_BUFFER_UNITS;
  const positionById = new Map<string, InventoryPosition>();
  for (const position of positions) positionById.set(position.item.id, position);

  const byProduct = new Map<string, ProductIngredient[]>();
  for (const row of ingredients) {
    const list = byProduct.get(row.product_id);
    if (list) list.push(row);
    else byProduct.set(row.product_id, [row]);
  }

  const result = new Map<string, ProductAvailability>();
  for (const product of products) {
    const recipe = byProduct.get(product.id);
    const lines = recipe?.length
      ? availabilityLines(recipe, positionById)
      : [];
    result.set(
      product.id,
      lines.length
        ? availabilityFromRecipe(product, lines, positionById, lowBufferUnits)
        : availabilityFromStockQty(product, lowBufferUnits),
    );
  }
  return result;
}

/**
 * How many units of one product the shelf can make, or null when nothing
 * tracks it. `availabilityForProducts` is the batch form; this is the single
 * lookup a quotation line asks for.
 */
export function sellableUnitsForProduct(
  product: Product,
  ingredients: readonly ProductIngredient[],
  positions: readonly InventoryPosition[],
): number | null {
  const positionById = new Map<string, InventoryPosition>();
  for (const position of positions) positionById.set(position.item.id, position);
  const recipe = ingredients.filter((row) => row.product_id === product.id);
  const lines = availabilityLines(recipe, positionById);
  if (lines.length) {
    return lines.reduce((min, line) => Math.min(min, line.makes), Infinity);
  }
  if (!isFiniteNumber(product.stock_qty)) return null;
  return Math.max(0, product.stock_qty);
}

/**
 * The POS block message, worded as Billing words it today:
 * "Flat White is out of stock." / "Only 3 in stock for Flat White."
 * Returns null when there is nothing to stop the cashier.
 */
export function cartStockMessage(
  availability: ProductAvailability | undefined,
  existingQtyInCart: number,
  addQty: number,
  blockOversell: boolean,
): string | null {
  if (!availability) return null;
  const sellable = availability.sellableUnits;
  if (availability.status === "untracked" || !isFiniteNumber(sellable)) {
    return null;
  }
  const name = availability.productName;
  if (blockOversell && sellable <= 0) {
    return name ? `${name} is out of stock.` : "This item is out of stock.";
  }
  if (existingQtyInCart + addQty > sellable) {
    return name ? `Only ${sellable} in stock for ${name}.` : `Only ${sellable} in stock.`;
  }
  return null;
}

/** Packs to buy: back to the reorder line, plus one pack, never nothing. */
export function suggestedRestockPacks(
  item: InventoryItem,
  packsOnShelf: number,
): number {
  const target = Math.max(0, item.low_stock_packs) + 1;
  return Math.max(1, Math.ceil(round(target - Math.max(0, packsOnShelf), PACK_DP)));
}

function productNamesByItem(
  ingredients: readonly ProductIngredient[],
  products: readonly Product[],
): Map<string, string[]> {
  const nameById = new Map(products.map((product) => [product.id, product.name]));
  const acc = new Map<string, string[]>();
  for (const row of ingredients) {
    // A row naming an unknown product says nothing about what is at risk.
    const name = nameById.get(row.product_id);
    if (!name) continue;
    const list = acc.get(row.item_id);
    if (list) {
      if (!list.includes(name)) list.push(name);
    } else {
      acc.set(row.item_id, [name]);
    }
  }
  return acc;
}

/**
 * The buy list: every shelf that is out or low, worst first. Out before low,
 * then the biggest gap over the reorder line, then by name so the list is
 * stable between two reads of the same shelf.
 */
export function restockQueue(
  items: readonly InventoryItem[],
  positions: readonly InventoryPosition[],
  context?: RestockQueueContext,
): RestockAlert[] {
  const positionById = new Map<string, InventoryPosition>();
  for (const position of positions) positionById.set(position.item.id, position);
  const drains = context
    ? productNamesByItem(context.ingredients, context.products)
    : null;

  const queued: { gap: number; alert: RestockAlert }[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const position = positionById.get(item.id);
    // No position, no reading of the shelf — the queue stays silent.
    if (!position || position.status === "ok") continue;
    const status: "out" | "low" = position.status === "out" ? "out" : "low";
    const packs = Math.max(0, position.packs);
    queued.push({
      gap: round(Math.max(0, item.low_stock_packs - packs), PACK_DP),
      alert: {
        itemId: item.id,
        name: item.name,
        category: item.category ?? "Uncategorized",
        unit: item.unit,
        status,
        packsOnShelf: round(packs, PACK_DP),
        reorderAt: item.low_stock_packs,
        suggestedPacks: suggestedRestockPacks(item, packs),
        drainsProducts: drains ? (drains.get(item.id) ?? []) : [],
      },
    });
  }
  queued.sort((a, b) => {
    if (a.alert.status !== b.alert.status) return a.alert.status === "out" ? -1 : 1;
    if (b.gap !== a.gap) return b.gap - a.gap;
    return a.alert.name.localeCompare(b.alert.name);
  });
  return queued.map((entry) => entry.alert);
}

function createdAt(row: InventoryAdjustment): number | null {
  const time = new Date(row.created_at).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * How long before this purchase the shelf was sitting empty. The ledger is
 * replayed in date order from the opening balance, so "hit zero" is the last
 * crossing to zero or below that is still unclosed when the purchase arrives.
 */
function outSinceMs(
  item: InventoryItem,
  rows: InventoryAdjustment[],
  purchase: InventoryAdjustment,
  purchaseTime: number,
): number | null {
  const earlier = rows
    .filter((row) => row !== purchase)
    .map((row) => ({ row, time: createdAt(row) }))
    .filter((entry): entry is { row: InventoryAdjustment; time: number } =>
      entry.time !== null && entry.time <= purchaseTime)
    .sort((a, b) => a.time - b.time);

  let packs = item.stock_packs;
  let outSince: number | null = null;
  let firstTime: number | null = null;
  for (const { row, time } of earlier) {
    if (firstTime === null) firstTime = time;
    packs += row.delta_packs;
    if (packs > 0) outSince = null;
    else if (outSince === null) outSince = time;
  }
  // Empty from the very first recorded row: the record cannot say since when,
  // so the earliest evidence is used rather than inventing a longer outage.
  if (outSince === null && item.stock_packs <= 0) outSince = firstTime ?? purchaseTime;
  return outSince;
}

/**
 * What landed recently — the list behind "tell the people who asked when it
 * arrives". Purchases only: a stock count or a cancelled issue moves the shelf
 * but did not restock anything. An item still reading zero has not landed, so
 * it belongs in `restockQueue`, not here.
 */
export function recentlyRestocked(
  items: readonly InventoryItem[],
  ledger: readonly InventoryAdjustment[],
  positions: readonly InventoryPosition[],
  opts: RecentRestockOptions,
): RecentRestock[] {
  const positionById = new Map<string, InventoryPosition>();
  for (const position of positions) positionById.set(position.item.id, position);
  const windowMs = Math.max(0, opts.withinDays) * DAY_MS;

  const out: RecentRestock[] = [];
  for (const item of items) {
    const position = positionById.get(item.id);
    if (!position || position.status === "out") continue;
    const rows = ledger.filter((row) => row.item_id === item.id);
    let best: { row: InventoryAdjustment; time: number } | null = null;
    for (const row of rows) {
      // `kind` is the name of the movement, so a purchase is a purchase.
      if (row.kind !== "purchase" || !(row.delta_packs > 0)) continue;
      const time = createdAt(row);
      if (time === null || time > opts.now || opts.now - time > windowMs) continue;
      if (!best || time > best.time) best = { row, time };
    }
    if (!best) continue;
    const outSince = outSinceMs(item, rows, best.row, best.time);
    out.push({
      itemId: item.id,
      name: item.name,
      restockedAt: best.row.created_at,
      unitsAdded: round(packsToUnits(item, best.row.delta_packs), PACK_DP),
      wasOutForDays:
        outSince === null ? null : round((best.time - outSince) / DAY_MS, 2),
    });
  }
  out.sort((a, b) => {
    const left = new Date(a.restockedAt).getTime();
    const right = new Date(b.restockedAt).getTime();
    if (left !== right) return right - left;
    return a.name.localeCompare(b.name);
  });
  return out;
}
