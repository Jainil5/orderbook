import { describe, expect, it } from "vitest";
import {
  availabilityForProducts,
  cartStockMessage,
  recentlyRestocked,
  restockQueue,
  sellableUnitsForProduct,
  suggestedRestockPacks,
} from "./availability";
import type { AvailabilityOptions, ProductAvailability } from "./availability";
import { inventoryPositions } from "./stock";
import type {
  InventoryAdjustment,
  InventoryItem,
  Product,
  ProductIngredient,
} from "@/types/database";

/**
 * The shelf this whole file argues about. Every number is chosen so the recipe
 * and the product row disagree on purpose — that disagreement is the feature.
 */
const itemBase = {
  brand_id: "b1",
  category: "Dairy",
  note: null,
  storage: null,
};

const item = (over: Partial<InventoryItem> & { id: string; name: string }): InventoryItem => ({
  ...itemBase,
  unit: "ea",
  units_per_pack: 1,
  cost_per_pack: 10,
  stock_packs: 0,
  low_stock_packs: 0,
  ...over,
});

const milk = item({ id: "i-milk", name: "Milk", unit: "ml", units_per_pack: 1000,
  cost_per_pack: 40, stock_packs: 0.6, low_stock_packs: 2 }); // 600 ml on the shelf
const beans = item({ id: "i-beans", name: "Coffee beans", category: "Dry goods",
  unit: "g", units_per_pack: 500, cost_per_pack: 60, stock_packs: 3, low_stock_packs: 1 }); // 1500 g
const cup = item({ id: "i-cup", name: "Cup", category: "Disposables", unit: "cup",
  units_per_pack: 100, cost_per_pack: 20, stock_packs: 0, low_stock_packs: 1 }); // none left
const syrup = item({ id: "i-syrup", name: "Syrup", category: "Dry goods", unit: "ml",
  units_per_pack: 300, cost_per_pack: 90, stock_packs: 0.003, low_stock_packs: 1 }); // 0.9 ml
const oat = item({ id: "i-oat", name: "Oat milk", unit: "carton", units_per_pack: 6,
  cost_per_pack: 30, stock_packs: 0, low_stock_packs: 2 }); // out
const lid = item({ id: "i-lid", name: "Lid", category: "Disposables", unit: "ea",
  units_per_pack: 50, cost_per_pack: 5, stock_packs: 0.06, low_stock_packs: 0 }); // 3, no reorder line

const items = [milk, beans, cup, syrup, oat, lid];

const recipe = (
  id: string,
  productId: string,
  itemId: string,
  qtyPerSale: number,
): ProductIngredient => ({
  id,
  brand_id: "b1",
  product_id: productId,
  item_id: itemId,
  qty_per_sale: qtyPerSale,
  note: null,
});

const ingredients: ProductIngredient[] = [
  recipe("g1", "p-flat-white", "i-milk", 200),
  recipe("g2", "p-flat-white", "i-beans", 18),
  recipe("g3", "p-latte", "i-milk", 300),
  recipe("g4", "p-cortado", "i-milk", 150),
  recipe("g5", "p-double", "i-milk", 100),
  recipe("g6", "p-double", "i-milk", 100),
  recipe("g7", "p-americano", "i-cup", 1),
  recipe("g8", "p-americano", "i-beans", 18),
  recipe("g9", "p-cupcake", "i-syrup", 15),
  // g10 names a stock item that does not exist: it must be skipped, not priced
  // and not counted as an empty shelf.
  recipe("g10", "p-club", "i-ghost", 100),
  recipe("g11", "p-club", "i-oat", 1),
  recipe("g12", "p-overnight", "i-oat", 3),
  recipe("g13", "p-sparkling", "i-lid", 0),
  recipe("g14", "p-muffin", "i-ghost", 5),
  recipe("g15", "p-box", "i-lid", 1),
];

const product = (
  id: string,
  name: string,
  stock_qty: number | null,
  low_stock_threshold: number | null = null,
): Product => ({
  id,
  brand_id: "b1",
  name,
  description: null,
  sku: null,
  category: "Coffee",
  price: 4,
  unit: null,
  is_active: true,
  stock_qty,
  low_stock_threshold,
});

const products: Product[] = [
  product("p-flat-white", "Flat White", 40),
  product("p-latte", "Latte", 60),
  product("p-cortado", "Cortado", null),
  product("p-double", "Double Shot", 10),
  product("p-americano", "Americano", 30),
  product("p-cupcake", "Cupcake", 8),
  product("p-club", "Club Sandwich", 12),
  product("p-overnight", "Overnight Oats", null),
  product("p-sparkling", "Sparkling", 7),
  product("p-muffin", "Muffin", 20),
  product("p-filter", "Filter Coffee", 12),
  product("p-biscuit", "Biscuit", 3),
  product("p-scone", "Scone", 8, 10),
  product("p-cake", "Cake", 4, 2),
  product("p-tea", "Tea", 0),
  product("p-decaf", "Decaf", null),
  product("p-negative", "Legacy row", -3),
  product("p-box", "Takeaway box", 9),
];

const positions = inventoryPositions(items, []);

function build(opts?: AvailabilityOptions) {
  return availabilityForProducts(products, ingredients, positions, opts);
}
const at = (id: string, opts?: AvailabilityOptions): ProductAvailability => {
  const found = build(opts).get(id);
  if (!found) throw new Error(`no availability for ${id}`);
  return found;
}

describe("availabilityForProducts — the shelf, not the product row", () => {
  it("caps a flat white at the milk, while stock_qty still says 40", () => {
    const fw = at("p-flat-white");
    expect(fw.sellableUnits).toBe(3); // 600 ml / 200 ml, not 40
    expect(fw.status).toBe("low");
    expect(fw.constrainedBy).toBe("Milk");
    expect(fw.badge).toBe("3 left");
    expect(fw.lines).toEqual([
      { itemId: "i-milk", name: "Milk", unit: "ml", availableUnits: 600,
        perSale: 200, makes: 3 },
      { itemId: "i-beans", name: "Coffee beans", unit: "g", availableUnits: 1500,
        perSale: 18, makes: 83 },
    ]);
  });

  it("reads the smallest line, so a big shelf elsewhere buys nothing", () => {
    expect(at("p-latte").sellableUnits).toBe(2); // 600 / 300
    expect(at("p-latte").badge).toBe("2 left");
    expect(at("p-americano").sellableUnits).toBe(0); // cups are the binding row
    expect(at("p-americano").status).toBe("out");
    expect(at("p-americano").constrainedBy).toBe("Cup");
    expect(at("p-americano").badge).toBe("Cup out");
  });

  it("tracks a product whose stock_qty is blank because the recipe is not", () => {
    const cortado = at("p-cortado");
    expect(cortado.sellableUnits).toBe(4); // 600 / 150
    expect(cortado.status).toBe("low");
    expect(cortado.badge).toBe("4 left");
    expect(cortado.constrainedBy).toBe("Milk");
  });

  it("merges recipe rows that name the same stock item", () => {
    const double = at("p-double");
    expect(double.lines).toEqual([
      { itemId: "i-milk", name: "Milk", unit: "ml", availableUnits: 600,
        perSale: 200, makes: 3 },
    ]);
    expect(double.sellableUnits).toBe(3);
  });

  it("says what is left in the merchant's own unit when the shelf is short but not empty", () => {
    const cupcake = at("p-cupcake");
    expect(cupcake.status).toBe("out");
    expect(cupcake.sellableUnits).toBe(0); // 0.9 ml cannot make a 15 ml serve
    expect(cupcake.constrainedBy).toBe("Syrup");
    expect(cupcake.badge).toBe("0.9 ml of Syrup left");
  });

  it("says nothing when the shelf is above its own reorder line", () => {
    // 1500 g of beans against a reorder line of 1 pack (500 g) is no shortage.
    const roomy = availabilityForProducts(
      [product("p-lot", "Roomy", null)],
      [recipe("gL", "p-lot", "i-beans", 5)], // 1500 / 5 = 300 sales
      positions,
    ).get("p-lot");
    expect(roomy?.sellableUnits).toBe(300);
    expect(roomy?.status).toBe("ok");
    expect(roomy?.constrainedBy).toBeNull();
    expect(roomy?.badge).toBeNull();
  });

  it("calls a comfortable shelf low the moment its milk crosses the reorder line", () => {
    const many = availabilityForProducts(
      [product("p-lot", "Roomy", null)],
      [recipe("gL", "p-lot", "i-milk", 10)], // 600 / 10 = 60 sales, reorder line 2000 ml
      positions,
    ).get("p-lot");
    expect(many?.sellableUnits).toBe(60);
    expect(many?.status).toBe("low");
    expect(many?.constrainedBy).toBe("Milk");
    expect(many?.badge).toBe("60 left");
  });

  it("floors the shelf at zero when a position arrives negative", () => {
    const damaged = positions.map((p) =>
      p.item.id === "i-milk" ? { ...p, packs: -0.5, units: -500 } : p,
    );
    const fw = availabilityForProducts(
      [product("p-flat-white", "Flat White", 40)],
      ingredients,
      damaged,
    ).get("p-flat-white");
    expect(fw?.lines[0]?.availableUnits).toBe(0);
    expect(fw?.lines[0]?.makes).toBe(0);
    expect(fw?.sellableUnits).toBe(0);
    expect(fw?.status).toBe("out");
    expect(fw?.badge).toBe("Milk out");
  });
});

describe("availabilityForProducts — fallbacks", () => {
  it("uses stock_qty when the product has no recipe", () => {
    expect(at("p-filter").sellableUnits).toBe(12);
    expect(at("p-filter").status).toBe("ok");
    expect(at("p-filter").badge).toBeNull();
    expect(at("p-filter").lines).toEqual([]);
    expect(at("p-filter").constrainedBy).toBeNull();
  });

  it("keeps the POS low rule for an unthresholded row and honours an explicit one", () => {
    expect(at("p-biscuit").status).toBe("low"); // 3 <= 5, the default buffer
    expect(at("p-biscuit").badge).toBe("3 left");
    expect(at("p-scone").status).toBe("low"); // 8 <= its own threshold of 10
    expect(at("p-scone").sellableUnits).toBe(8);
    expect(at("p-cake").status).toBe("ok"); // threshold 2 beats the buffer
    expect(at("p-cake").badge).toBeNull();
  });

  it("calls a zero or negative stock_qty out, never negative sellable", () => {
    expect(at("p-tea").status).toBe("out");
    expect(at("p-tea").sellableUnits).toBe(0);
    expect(at("p-tea").badge).toBe("Out of stock");
    expect(at("p-negative").sellableUnits).toBe(0);
    expect(at("p-negative").status).toBe("out");
  });

  it("calls a product with neither recipe nor stock_qty untracked and says nothing", () => {
    const decaf = at("p-decaf");
    expect(decaf.status).toBe("untracked");
    expect(decaf.sellableUnits).toBeNull();
    expect(decaf.constrainedBy).toBeNull();
    expect(decaf.badge).toBeNull();
    expect(decaf.lines).toEqual([]);
    // A brand without recipes at all is a wall of untracked, not a wall of zeros.
    const noRecipes = availabilityForProducts(
      [product("p-sofa", "Three seater", null)],
      [],
      positions,
    ).get("p-sofa");
    expect(noRecipes?.status).toBe("untracked");
    expect(noRecipes?.badge).toBeNull();
  });

  it("skips a row whose stock item does not exist instead of counting it as empty", () => {
    const club = at("p-club");
    expect(club.lines).toEqual([
      { itemId: "i-oat", name: "Oat milk", unit: "carton", availableUnits: 0,
        perSale: 1, makes: 0 },
    ]);
    expect(club.constrainedBy).toBe("Oat milk");
    expect(club.badge).toBe("Oat milk out");
    expect(club.sellableUnits).toBe(0);
    // Overnight oats really does drain the same empty carton.
    expect(at("p-overnight").badge).toBe("Oat milk out");
  });

  it("falls back to stock_qty when every recipe row is unknown, or drains nothing", () => {
    expect(at("p-muffin").status).toBe("ok"); // ghost row only -> no lines
    expect(at("p-muffin").sellableUnits).toBe(20);
    expect(at("p-muffin").lines).toEqual([]);
    expect(at("p-sparkling").sellableUnits).toBe(7); // qty_per_sale 0 binds nothing
    expect(at("p-sparkling").status).toBe("ok");
  });

  it("maps every product exactly once, keyed by id", () => {
    const map = build();
    expect(map.size).toBe(products.length);
    expect(Array.from(map.keys())).toEqual(products.map((p) => p.id));
    expect(map.get("p-flat-white")?.productName).toBe("Flat White");
  });

  it("lets lowBufferUnits set the floor under a shelf with no reorder line", () => {
    // 3 lids, and the lid has no reorder point at all.
    expect(at("p-box").status).toBe("low"); // default buffer of 5
    expect(at("p-box").badge).toBe("3 left");
    expect(at("p-box").constrainedBy).toBe("Lid");
    const quiet = at("p-box", { lowBufferUnits: 0 });
    expect(quiet.status).toBe("ok");
    expect(quiet.badge).toBeNull();
    expect(quiet.constrainedBy).toBeNull();
    expect(quiet.sellableUnits).toBe(3); // the limit itself never moves
    expect(at("p-box", { lowBufferUnits: 2 }).status).toBe("ok");
  });
});

describe("sellableUnitsForProduct", () => {
  it("agrees with the batch form for the whole menu", () => {
    const map = build();
    for (const row of products) {
      expect(sellableUnitsForProduct(row, ingredients, positions)).toBe(
        map.get(row.id)?.sellableUnits,
      );
    }
  });

  it("answers for one product without building the menu", () => {
    expect(sellableUnitsForProduct(products[0], ingredients, positions)).toBe(3);
    expect(sellableUnitsForProduct(product("p-overnight", "Overnight Oats", 99),
      ingredients, positions)).toBe(0);
    expect(sellableUnitsForProduct(product("p-x", "Ghost", 5), [], [])).toBe(5);
    expect(sellableUnitsForProduct(product("p-x", "Ghost", null), [], [])).toBeNull();
    expect(sellableUnitsForProduct(product("p-x", "Ghost", -4), [], [])).toBe(0);
  });
});

describe("cartStockMessage", () => {
  const out = at("p-americano");
  const low = at("p-flat-white");
  const untracked = at("p-decaf");

  it("stays quiet when there is nothing to say", () => {
    expect(cartStockMessage(undefined, 0, 1, true)).toBeNull();
    expect(cartStockMessage(untracked, 99, 99, true)).toBeNull();
    expect(cartStockMessage(low, 2, 1, true)).toBeNull(); // 3 of 3, still legal
    expect(cartStockMessage(at("p-filter"), 0, 12, true)).toBeNull();
  });

  it("blocks an out item when overselling is blocked", () => {
    expect(cartStockMessage(out, 0, 1, true)).toBe("Americano is out of stock.");
  });

  it("counts the last sale when overselling is allowed", () => {
    expect(cartStockMessage(out, 0, 1, false)).toBe("Only 0 in stock for Americano.");
    expect(cartStockMessage(low, 3, 1, true)).toBe("Only 3 in stock for Flat White.");
    expect(cartStockMessage(low, 1, 3, false)).toBe("Only 3 in stock for Flat White.");
  });

  it("still speaks without a product name", () => {
    const bare: ProductAvailability = {
      productId: "p?", productName: undefined, status: "out", sellableUnits: 0,
      constrainedBy: "Milk", badge: "Milk out", lines: [],
    };
    expect(cartStockMessage(bare, 0, 1, true)).toBe("This item is out of stock.");
    expect(cartStockMessage({ ...bare, sellableUnits: 2, status: "low" }, 2, 1, true))
      .toBe("Only 2 in stock.");
  });
});

describe("restockQueue", () => {
  it("lists out first, then low, worst gap over the reorder line first", () => {
    const queue = restockQueue(items, positions, { ingredients, products });
    expect(queue.map((a) => [a.itemId, a.status])).toEqual([
      ["i-oat", "out"],
      ["i-cup", "out"],
      ["i-milk", "low"],
      ["i-syrup", "low"],
    ]);
  });

  it("carries the shelf reading, the reorder line and what is at risk", () => {
    const queue = restockQueue(items, positions, { ingredients, products });
    expect(queue[0]).toEqual({
      itemId: "i-oat",
      name: "Oat milk",
      category: "Dairy",
      unit: "carton",
      status: "out",
      packsOnShelf: 0,
      reorderAt: 2,
      suggestedPacks: 3,
      drainsProducts: ["Club Sandwich", "Overnight Oats"],
    });
    const milkLine = queue.find((a) => a.itemId === "i-milk");
    expect(milkLine?.packsOnShelf).toBe(0.6);
    expect(milkLine?.category).toBe("Dairy");
    expect(milkLine?.drainsProducts).toEqual([
      "Flat White", "Latte", "Cortado", "Double Shot",
    ]);
  });

  it("leaves healthy shelves and shelves without a reorder line off the list", () => {
    const ids = restockQueue(items, positions).map((a) => a.itemId);
    expect(ids).not.toContain("i-beans"); // 3 packs against a line of 1
    expect(ids).not.toContain("i-lid"); // 3 units, no reorder line to be under
    expect(restockQueue(items, positions)[0].drainsProducts).toEqual([]);
  });

  it("labels an item with no category", () => {
    const nameless = item({ id: "i-blank", name: "Ice", category: null,
      unit: "kg", units_per_pack: 10, stock_packs: 0, low_stock_packs: 1 });
    expect(restockQueue([nameless], inventoryPositions([nameless], []))[0]?.category)
      .toBe("Uncategorized");
  });

  it("suggests enough packs to clear the reorder line by one, never zero", () => {
    expect(suggestedRestockPacks(milk, 0.6)).toBe(3); // 2 + 1 - 0.6
    expect(suggestedRestockPacks(cup, 0)).toBe(2);
    expect(suggestedRestockPacks(syrup, 0.003)).toBe(2);
    expect(suggestedRestockPacks(lid, 0)).toBe(1); // no reorder line: one pack
    expect(suggestedRestockPacks(lid, 9)).toBe(1); // an overdrawn never count
    expect(restockQueue([item({ id: "i-big", name: "Big", stock_packs: 0,
      low_stock_packs: 4.5 })], inventoryPositions(
      [item({ id: "i-big", name: "Big", stock_packs: 0, low_stock_packs: 4.5 })], []),
    )[0]?.suggestedPacks).toBe(6);
  });
});

describe("recentlyRestocked", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.parse("2026-11-12T12:00:00.000Z");
  const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

  const move = (
    id: string,
    itemId: string,
    deltaPacks: number,
    kind: InventoryAdjustment["kind"],
    daysAgo: number,
  ): InventoryAdjustment => ({
    id,
    brand_id: "b1",
    item_id: itemId,
    delta_packs: deltaPacks,
    kind,
    cost: kind === "purchase" ? 40 : null,
    note: null,
    created_at: iso(daysAgo),
  });

  const restockItems: InventoryItem[] = [
    item({ id: "i-milk", name: "Milk", unit: "ml", units_per_pack: 1000,
      stock_packs: 1, low_stock_packs: 2 }),
    item({ id: "i-beans", name: "Coffee beans", unit: "g", units_per_pack: 500,
      stock_packs: 2, low_stock_packs: 1 }),
    item({ id: "i-cup", name: "Cup", unit: "cup", units_per_pack: 100,
      stock_packs: 0, low_stock_packs: 1 }),
    item({ id: "i-oat", name: "Oat milk", unit: "carton", units_per_pack: 6,
      stock_packs: 1, low_stock_packs: 2 }),
    item({ id: "i-syrup", name: "Syrup", unit: "ml", units_per_pack: 300,
      stock_packs: 0, low_stock_packs: 1 }),
    item({ id: "i-tea", name: "Tea", unit: "bag", units_per_pack: 25,
      stock_packs: 2, low_stock_packs: 1 }),
    item({ id: "i-water", name: "Water", unit: "l", units_per_pack: 20,
      stock_packs: 0.5, low_stock_packs: 1 }),
  ];
  const restockLedger: InventoryAdjustment[] = [
    // Milk ran dry six days ago and landed two days ago: out for four days.
    move("m1", "i-milk", -1, "issue", 6),
    move("m2", "i-milk", 2, "purchase", 2),
    move("m3", "i-beans", 1, "purchase", 3),
    move("m4", "i-cup", 1, "purchase", 5), // empty since before the record
    move("m5", "i-oat", 1, "purchase", 30), // too long ago
    move("m6", "i-syrup", 3, "stock_count", 1), // a count is not a delivery
    move("m7", "i-tea", 2, "purchase", 4),
    move("m8", "i-tea", -4, "issue", 1), // ...and it went straight back out
    move("m9", "i-water", 1, "purchase", 7), // exactly on the seven day edge
  ];
  const restockPositions = inventoryPositions(restockItems, restockLedger);
  const landed = (withinDays: number) =>
    recentlyRestocked(restockItems, restockLedger, restockPositions, { withinDays, now });

  it("reports the purchases inside the window, newest first", () => {
    expect(landed(7).map((r) => r.itemId)).toEqual(["i-milk", "i-beans", "i-cup", "i-water"]);
    expect(landed(6).map((r) => r.itemId)).toEqual(["i-milk", "i-beans", "i-cup"]);
  });

  it("measures how long the shelf sat empty before it landed", () => {
    const milk = landed(7)[0];
    expect(milk).toEqual({
      itemId: "i-milk",
      name: "Milk",
      restockedAt: iso(2),
      unitsAdded: 2000,
      wasOutForDays: 4,
    });
    // A shelf that was never out has nothing to report.
    expect(landed(7)[1].wasOutForDays).toBeNull();
    expect(landed(7)[1].unitsAdded).toBe(500);
  });

  it("counts an outage that predates the record from the evidence it has", () => {
    expect(landed(7)[2]).toEqual({
      itemId: "i-cup",
      name: "Cup",
      restockedAt: iso(5),
      unitsAdded: 100,
      wasOutForDays: 0,
    });
    expect(landed(7)[3].wasOutForDays).toBeNull(); // water never went out
  });

  it("ignores movements that were not purchases and restocks nobody received", () => {
    const ids = landed(7).map((r) => r.itemId);
    expect(ids).not.toContain("i-syrup"); // a stock count lifted it, no delivery
    expect(ids).not.toContain("i-oat"); // 30 days is outside a 7 day window
    expect(ids).not.toContain("i-tea"); // it landed and drained back to zero
    expect(restockPositions.find((p) => p.item.id === "i-tea")?.status).toBe("out");
  });

  it("uses the latest purchase in the window", () => {
    const twice = [
      ...restockLedger,
      move("m10", "i-beans", 2, "purchase", 1),
    ];
    const rows = recentlyRestocked(restockItems, twice,
      inventoryPositions(restockItems, twice), { withinDays: 7, now });
    const beans = rows.find((r) => r.itemId === "i-beans");
    expect(beans?.restockedAt).toBe(iso(1));
    expect(beans?.unitsAdded).toBe(1000);
    expect(rows[0]?.itemId).toBe("i-beans");
  });

  it("says nothing when the window is empty or the shelf was never touched", () => {
    expect(recentlyRestocked(restockItems, [], restockPositions, { withinDays: 7, now }))
      .toEqual([]);
    expect(recentlyRestocked([], restockLedger, [], { withinDays: 7, now })).toEqual([]);
    // A purchase with no position row cannot be confirmed as landed.
    expect(recentlyRestocked(restockItems, restockLedger, [], { withinDays: 7, now }))
      .toEqual([]);
  });
});
