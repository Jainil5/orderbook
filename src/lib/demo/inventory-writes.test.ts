import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    map,
    get(name: string) {
      const value = map.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string) {
      if (encodeURIComponent(value).length > 8192) return;
      map.set(name, value);
    },
    delete(name: string) {
      map.delete(name);
    },
  };
});

vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  acceptDemoQuote,
  recordDemoInventoryMovement,
  saveDemoInventoryItem,
  saveDemoProductIngredients,
  submitDemoOrder,
} from "./server";
import {
  demoInventorySnapshot,
  listDemoIngredientsMerged,
  listDemoInventoryLedger,
  listDemoInventoryMerged,
  listDemoOrders,
} from "./data";
import {
  readDemoMutableBucket,
  updateDemoMutableBucket,
} from "./mutable-store";
import { getDemoBrandPack } from "./brands";
import { DEMO_LIMITS, limitMessage } from "./read-only";
import { DEMO_WORKSPACE_COOKIE } from "@/lib/workspace/constants";
import type {
  CreateOrderInput,
  CreateOrderLineInput,
  InventoryAdjustment,
  InventoryAdjustmentKind,
  InventoryItem,
  InventoryItemUpsertInput,
  ProductIngredient,
  ProductIngredientInput,
} from "@/types/database";

const pack = getDemoBrandPack("BR-1");
const packItem = (id: string) => pack.inventory.find((row) => row.id === id)!;
const iv1 = packItem("iv1");

/** One valid stock item as the dialog posts it; `over` tunes a single field. */
function itemInput(
  over: Partial<InventoryItemUpsertInput> = {},
): InventoryItemUpsertInput {
  return {
    name: "Test Flour",
    unit: "kg",
    units_per_pack: 10,
    cost_per_pack: 400,
    stock_packs: 5,
    ...over,
  };
}

function seededItem(n: number): InventoryItem {
  return { ...iv1, id: `demo-inv-item-seed-${n}`, name: `Seeded Item ${n}` };
}

function seededMovement(n: number): InventoryAdjustment {
  return {
    id: `demo-inv-move-seed-${n}`,
    brand_id: pack.brand.id,
    item_id: "iv1",
    delta_packs: 1,
    kind: "purchase",
    cost: 10,
    note: `seed ${n}`,
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

async function bucket() {
  return readDemoMutableBucket("BR-1");
}

async function mergedItem(id: string) {
  return (await listDemoInventoryMerged("BR-1")).find((row) => row.id === id);
}

async function ingredientRows(productId: string): Promise<ProductIngredient[]> {
  return (await listDemoIngredientsMerged("BR-1")).filter(
    (row) => row.product_id === productId,
  );
}

async function positionOf(itemId: string, code: "BR-1" | "BR-2" = "BR-1") {
  const snap = await demoInventorySnapshot(code);
  return snap.positions.find((p) => p.item.id === itemId);
}

/** Throws with the validation message instead of failing on a missing field. */
async function savedItem(itemId: string | null, input: InventoryItemUpsertInput) {
  const res = await saveDemoInventoryItem(itemId, input);
  if (!res.ok) throw new Error(`saveDemoInventoryItem: ${res.error}`);
  return res.item;
}

async function movementOf(
  kind: InventoryAdjustmentKind,
  deltaPacks: number | string,
  over: { itemId?: string; cost?: number | string | null; note?: string } = {},
) {
  const res = await recordDemoInventoryMovement({
    itemId: over.itemId ?? "iv1",
    kind,
    deltaPacks,
    ...(over.cost === undefined ? {} : { cost: over.cost }),
    ...(over.note === undefined ? {} : { note: over.note }),
  });
  if (!res.ok) throw new Error(`recordDemoInventoryMovement: ${res.error}`);
  return res.movement;
}

const move = (
  kind: InventoryAdjustmentKind,
  deltaPacks: number | string,
  over: { itemId?: string; cost?: number | string | null; note?: string } = {},
) =>
  recordDemoInventoryMovement({
    itemId: over.itemId ?? "iv1",
    kind,
    deltaPacks,
    ...(over.cost === undefined ? {} : { cost: over.cost }),
    ...(over.note === undefined ? {} : { note: over.note }),
  });

async function recipeOf(productId: string, rows: ProductIngredientInput[]) {
  const res = await saveDemoProductIngredients(productId, rows);
  if (!res.ok) throw new Error(`saveDemoProductIngredients: ${res.error}`);
  return res.ingredients;
}

/** Fails loudly rather than returning undefined if the bill is rejected. */
async function submitBill(
  lines: CreateOrderLineInput[],
  extra: Partial<CreateOrderInput> = {},
) {
  const res = await submitDemoOrder({
    customerId: null,
    lines,
    paymentMethod: "UPI",
    paymentStatus: "pending",
    ...extra,
  });
  if (!res.ok) throw new Error(`submitDemoOrder rejected the bill: ${res.message}`);
  return res;
}

beforeEach(() => {
  jar.map.clear();
  jar.map.set(DEMO_WORKSPACE_COOKIE, "BR-1");
});

describe("saveDemoInventoryItem", () => {
  it("creates a new item in the bucket and returns it through the merged list", async () => {
    const item = await savedItem(
      null,
      itemInput({ name: "  Sea Salt  ", category: "", note: "   " }),
    );

    // Strings are trimmed, blanks read as null, and the row carries the active
    // brand — a visitor's item is readable without any database.
    expect(item.name).toBe("Sea Salt");
    expect(item.category).toBeNull();
    expect(item.note).toBeNull();
    expect(item.storage).toBeNull();
    expect(item.low_stock_packs).toBe(0);
    expect(item.brand_id).toBe(pack.brand.id);
    expect(item.id).toMatch(/^demo-inv-item-/);

    const merged = await listDemoInventoryMerged("BR-1");
    expect(merged).toHaveLength(pack.inventory.length + 1);
    // The merged list is sorted by name, so only identity is asserted here.
    expect(merged.find((row) => row.id === item.id)).toEqual(item);

    const stored = await bucket();
    expect(stored.inventory.map((row) => row.id)).toContain(item.id);
    // A demo-created row is stored in full; only pack items get an override.
    expect(stored.inventoryOverrides[item.id]).toBeUndefined();
  });

  it("edits a pack item through inventoryOverrides, leaving the pack row intact", async () => {
    const item = await savedItem(
      "iv1",
      itemInput({
        name: "Sourdough Bread",
        unit: "slice",
        units_per_pack: 12,
        cost_per_pack: 120,
        stock_packs: 8,
        low_stock_packs: 4,
        storage: "ambient",
        note: "bake off at 6",
      }),
    );

    const merged = await mergedItem("iv1");
    // Identity comes from the pack; every editable field comes from the input.
    expect(merged).toEqual({
      ...item,
      id: "iv1",
      brand_id: pack.brand.id,
    });
    expect(await listDemoInventoryMerged("BR-1")).toHaveLength(
      pack.inventory.length,
    );

    // The delivered CSV row is untouched, and a neighbour never inherits the edit.
    expect(iv1.name).toBe("Multigrain Bread");
    expect(packItem("iv1").stock_packs).toBe(6);
    expect(await mergedItem("iv2")).toEqual(packItem("iv2"));

    const stored = await bucket();
    expect(Object.keys(stored.inventoryOverrides.iv1).sort()).toEqual([
      "category",
      "cost_per_pack",
      "low_stock_packs",
      "name",
      "note",
      "stock_packs",
      "storage",
      "unit",
      "units_per_pack",
    ]);
    expect(stored.inventory.length).toBe(0);

    // A second edit merges over the first rather than replacing the whole row.
    await savedItem(
      "iv1",
      itemInput({
        name: "Rye Bread",
        unit: "slice",
        units_per_pack: 12,
        cost_per_pack: 120,
        stock_packs: 2,
      }),
    );
    expect(await mergedItem("iv1")).toMatchObject({
      name: "Rye Bread",
      stock_packs: 2,
      units_per_pack: 12,
    });
  });

  it("layers an override over the pack row, so untouched fields survive", async () => {
    await updateDemoMutableBucket("BR-1", (b) => ({
      ...b,
      inventoryOverrides: { ...b.inventoryOverrides, iv1: { stock_packs: 40 } },
    }));
    expect(await mergedItem("iv1")).toEqual({ ...iv1, stock_packs: 40 });
  });

  it("rejects invalid input with the validation message and writes nothing", async () => {
    const cases: Array<[Partial<InventoryItemUpsertInput>, string]> = [
      [{ name: "   " }, "Name is required."],
      [{ unit: "" }, "Name the unit you count in — slice, ml, sq ft."],
      [{ units_per_pack: 0 }, "A pack must contain more than 0 units."],
      [{ units_per_pack: "abc" }, "A pack must contain more than 0 units."],
      [{ units_per_pack: "" }, "A pack must contain more than 0 units."],
      [{ cost_per_pack: -1 }, "Cost per pack must be 0 or more."],
      [{ cost_per_pack: "free" }, "Cost per pack must be 0 or more."],
      [{ stock_packs: -2 }, "Packs on hand must be 0 or more."],
      [{ low_stock_packs: -1 }, "The reorder level cannot be negative."],
    ];
    for (const [over, error] of cases) {
      const expected = { ok: false, error };
      expect(await saveDemoInventoryItem(null, itemInput(over))).toEqual(expected);
      expect(await saveDemoInventoryItem("iv1", itemInput(over))).toEqual(expected);
    }
    const stored = await bucket();
    expect(stored.inventory).toHaveLength(0);
    expect(stored.inventoryOverrides).toEqual({});
    expect(await mergedItem("iv1")).toEqual(iv1);
  });

  it("creates a row rather than editing nothing when the item id is unknown", async () => {
    const item = await savedItem("iv-does-not-exist", itemInput());
    expect(item.id).not.toBe("iv-does-not-exist");
    expect((await bucket()).inventory).toHaveLength(1);
    expect((await bucket()).inventoryOverrides).toEqual({});
  });

  it("caps only new items at DEMO_LIMITS.inventory; pack edits still land", async () => {
    await updateDemoMutableBucket("BR-1", (b) => ({
      ...b,
      inventory: Array.from({ length: DEMO_LIMITS.inventory }, (_, n) =>
        seededItem(n),
      ),
    }));
    expect(await saveDemoInventoryItem(null, itemInput())).toEqual({
      ok: false,
      error: limitMessage("The inventory list is full"),
    });
    expect((await bucket()).inventory).toHaveLength(DEMO_LIMITS.inventory);

    expect(
      (await saveDemoInventoryItem("iv2", itemInput({ name: "Rye Rolls" }))).ok,
    ).toBe(true);
    expect((await mergedItem("iv2"))?.name).toBe("Rye Rolls");
  });
});

describe("recordDemoInventoryMovement", () => {
  it("only lets a purchase add packs", async () => {
    expect((await movementOf("purchase", 5)).delta_packs).toBe(5);
    expect(await move("purchase", -5)).toEqual({
      ok: false,
      error: "A purchase adds packs, so enter a number above 0.",
    });
    expect(await move("purchase", 0)).toEqual({
      ok: false,
      error: "Enter how many packs moved, other than 0.",
    });
  });

  it("only lets wastage and issues remove packs", async () => {
    expect((await movementOf("waste", -3)).delta_packs).toBe(-3);
    expect((await movementOf("issue", -3)).delta_packs).toBe(-3);
    expect(await move("waste", 3)).toEqual({
      ok: false,
      error: "Wastage removes packs, so enter a number below 0.",
    });
    expect(await move("issue", 3)).toEqual({
      ok: false,
      error: "Issuing material removes packs, so enter a number below 0.",
    });
    expect(await move("waste", 0)).toEqual({
      ok: false,
      error: "Enter how many packs moved, other than 0.",
    });
  });

  it("lets a stock count run either direction", async () => {
    await movementOf("stock_count", 2);
    await movementOf("stock_count", -2);
    expect((await listDemoInventoryLedger("BR-1")).map((row) => row.delta_packs)).toEqual(
      [-2, 2],
    );
  });

  it("rejects a missing number, a non-number, an unknown kind and an unknown item", async () => {
    const noAmount = {
      ok: false,
      error: "Enter how many packs moved, other than 0.",
    };
    expect(await move("purchase", "")).toEqual(noAmount);
    expect(await move("purchase", "twelve")).toEqual(noAmount);
    expect(await move("purchase", Number.NaN)).toEqual(noAmount);

    const badKind = { ok: false, error: "Choose what this movement is." };
    expect(await move("steal" as InventoryAdjustmentKind, 5)).toEqual(badKind);
    // The kind is checked first, so a bad kind is named even with a bad number.
    expect(await move("steal" as InventoryAdjustmentKind, 0)).toEqual(badKind);

    expect(await move("purchase", 5, { itemId: "iv-ghost" })).toEqual({
      ok: false,
      error: "Stock item not found.",
    });
    expect(await bucket()).toMatchObject({ inventory: [], inventoryLedger: [] });
  });

  it("prices a movement only when goods were bought", async () => {
    expect((await movementOf("purchase", 4, { cost: 950 })).cost).toBe(950);
    expect((await movementOf("waste", -1, { cost: 500 })).cost).toBeNull();
    expect((await movementOf("issue", -1, { cost: 500 })).cost).toBeNull();
    expect((await movementOf("stock_count", 1, { cost: 500 })).cost).toBeNull();
    expect((await movementOf("purchase", 1, { cost: "" })).cost).toBeNull();
    expect((await movementOf("purchase", 1, { cost: "abc" })).cost).toBeNull();
    expect((await movementOf("purchase", 1)).cost).toBeNull();

    // A negative amount is refused even on a kind that cannot carry one.
    expect(await move("waste", -1, { cost: -5 })).toEqual({
      ok: false,
      error: "The amount paid cannot be negative.",
    });
  });

  it("rounds packs to 3 dp and trims the note to 200 chars", async () => {
    const movement = await movementOf("purchase", "2.0009", {
      note: `${"x".repeat(250)}  `,
    });
    expect(movement.delta_packs).toBe(2.001);
    expect(movement.note).toHaveLength(200);
    expect(movement.brand_id).toBe(pack.brand.id);
    expect(movement.item_id).toBe("iv1");
    expect(movement.id).toMatch(/^demo-inv-move-/);
    expect((await movementOf("purchase", 1, { note: "   " })).note).toBeNull();
  });

  it("puts the newest row at the head of the ledger and caps the list", async () => {
    const ids: string[] = [];
    for (let n = 1; n <= 3; n++) ids.push((await movementOf("purchase", n)).id);
    const ledger = await listDemoInventoryLedger("BR-1");
    expect(ledger.map((row) => row.id)).toEqual([...ids].reverse());
    expect(ledger.map((row) => row.delta_packs)).toEqual([3, 2, 1]);

    // The ledger reads newest-first, so the seeded rows are laid out that way.
    const cap = DEMO_LIMITS.inventoryLedger;
    await updateDemoMutableBucket("BR-1", (b) => ({
      ...b,
      inventoryLedger: Array.from({ length: cap }, (_, n) =>
        seededMovement(cap - 1 - n),
      ),
    }));
    const head = await movementOf("waste", -1);
    const capped = await listDemoInventoryLedger("BR-1");
    expect(capped).toHaveLength(DEMO_LIMITS.inventoryLedger);
    expect(capped[0].id).toBe(head.id);
    // The ledger is trimmed silently — the oldest row is recycled, not refused.
    expect(capped.some((row) => row.note === "seed 0")).toBe(false);
    expect(capped.some((row) => row.note === `seed ${cap - 1}`)).toBe(true);
  });

  it("moves the shelf position the snapshot reports", async () => {
    const stock = packItem("iv2").stock_packs;
    expect((await positionOf("iv2"))?.packs).toBe(stock);
    await movementOf("purchase", 2, { itemId: "iv2" });
    expect((await positionOf("iv2"))?.packs).toBeCloseTo(stock + 2, 6);
    await movementOf("waste", -3, { itemId: "iv2" });
    expect((await positionOf("iv2"))?.packs).toBeCloseTo(stock - 1, 6);
    // An empty shelf reads as 0 packs, never negative.
    await movementOf("waste", -50, { itemId: "iv2" });
    expect((await positionOf("iv2"))?.packs).toBe(0);
    expect((await positionOf("iv2"))?.status).toBe("out");
  });

  it("accepts a movement against an item created in the workspace", async () => {
    const item = await savedItem(null, itemInput());
    const movement = await movementOf("purchase", 3, { itemId: item.id });
    expect(movement.item_id).toBe(item.id);
    expect((await positionOf(item.id))?.packs).toBeCloseTo(item.stock_packs + 3, 6);
  });
});

describe("saveDemoProductIngredients", () => {
  const packRows = (productId: string) =>
    pack.ingredients.filter((row) => row.product_id === productId).length;

  it("replaces the whole list for one product and leaves other products on the pack", async () => {
    expect(await ingredientRows("p1")).toHaveLength(packRows("p1"));
    const ingredients = await recipeOf("p1", [
      { itemId: "iv1", qtyPerSale: 2 },
      { itemId: "iv3", qtyPerSale: 100, note: "  milk  " },
    ]);

    expect(ingredients).toHaveLength(2);
    expect(ingredients.map((row) => row.item_id)).toEqual(["iv1", "iv3"]);
    for (const row of ingredients) {
      expect(row.id).toMatch(/^demo-recipe-/);
      expect(row.brand_id).toBe(pack.brand.id);
      expect(row.product_id).toBe("p1");
    }
    expect(ingredients[1].qty_per_sale).toBe(100);
    expect(ingredients[1].note).toBe("milk");

    const merged = await ingredientRows("p1");
    expect(merged).toEqual(ingredients);
    expect((await bucket()).recipeOverrides.p1).toEqual(ingredients);
    // Pack rows for p1 are gone; every other product still reads from the CSV.
    expect(await ingredientRows("p2")).toHaveLength(packRows("p2"));
    expect(await listDemoIngredientsMerged("BR-1")).toHaveLength(
      pack.ingredients.length - packRows("p1") + 2,
    );
  });

  it("keys the list by stock item, so a repeated line keeps the last entry", async () => {
    const ingredients = await recipeOf("p1", [
      { itemId: "iv1", qtyPerSale: 2, note: "first" },
      { itemId: "iv3", qtyPerSale: 50 },
      { itemId: "iv1", qtyPerSale: 3, note: "last" },
    ]);
    expect(ingredients).toHaveLength(2);
    // A Map keeps the first insertion slot but the final value.
    expect(ingredients[0]).toMatchObject({
      item_id: "iv1",
      qty_per_sale: 3,
      note: "last",
    });
    expect(ingredients[1].item_id).toBe("iv3");
  });

  it("refuses an ingredient that is not a stock item and a usage that is not above 0", async () => {
    expect(
      await saveDemoProductIngredients("p1", [
        { itemId: "iv1", qtyPerSale: 1 },
        { itemId: "iv-does-not-exist", qtyPerSale: 1 },
      ]),
    ).toEqual({ ok: false, error: "Every ingredient must be a stock item." });

    for (const qty of [0, -2, "abc", ""]) {
      expect(await saveDemoProductIngredients("p1", [{ itemId: "iv1", qtyPerSale: qty }]))
        .toEqual({
          ok: false,
          error: "Enter how much of Multigrain Bread one sale uses, above 0.",
        });
    }
    expect(
      await saveDemoProductIngredients("p-ghost", [{ itemId: "iv1", qtyPerSale: 1 }]),
    ).toEqual({ ok: false, error: "Product not found." });

    // Nothing half-saved: the pack recipe is still what readers see.
    expect((await bucket()).recipeOverrides).toEqual({});
    expect(await ingredientRows("p1")).toHaveLength(packRows("p1"));
  });

  it("bounds the deduped list at 20 lines", async () => {
    const ids = pack.inventory.map((row) => row.id);
    const lines = (count: number) =>
      Array.from({ length: count }, (_, n) => ({ itemId: ids[n], qtyPerSale: 1 }));

    expect(await recipeOf("p1", lines(20))).toHaveLength(20);
    expect(await saveDemoProductIngredients("p1", lines(21))).toEqual({
      ok: false,
      error: "Keep an ingredient list under 20 lines.",
    });
    // Duplicates collapse before the cap is measured.
    expect(await recipeOf("p2", [...lines(20), ...lines(20)])).toHaveLength(20);
  });

  it("accepts an empty list to clear a recipe, for that product only", async () => {
    expect(await saveDemoProductIngredients("p1", [])).toEqual({
      ok: true,
      ingredients: [],
    });
    expect(await ingredientRows("p1")).toHaveLength(0);
    // An empty array means "cleared", not "an override holding zero rows".
    expect((await bucket()).recipeOverrides.p1).toEqual([]);
    expect(await listDemoIngredientsMerged("BR-1")).toHaveLength(
      pack.ingredients.length - packRows("p1"),
    );
    expect(await ingredientRows("p3")).toHaveLength(packRows("p3"));
  });
});

describe("stock consumed when an order lands", () => {
  const milkStock = packItem("iv3").stock_packs;
  /** p1 (Flat White) ships 5 recipe lines, one per drained stock item. */
  const drainedByP1 = ["iv3", "iv15", "iv17", "iv28", "iv29"];

  it("writes one issue per drained item, noted with the order number", async () => {
    const res = await submitBill([{ productId: "p1", quantity: 2 }]);
    const ledger = await listDemoInventoryLedger("BR-1");
    const rows = ledger.filter((row) => row.note === res.orderNumber);

    expect(res.orderNumber).toMatch(/^BC-\d+$/);
    expect(ledger).toHaveLength(drainedByP1.length);
    expect(rows).toHaveLength(drainedByP1.length);
    for (const row of rows) {
      expect(row.kind).toBe("issue");
      expect(row.delta_packs).toBeLessThan(0);
      // `cost` means money that actually left the till, so consumption has none.
      expect(row.cost).toBeNull();
      expect(row.brand_id).toBe(pack.brand.id);
    }
    expect(rows.map((row) => row.item_id).sort()).toEqual([...drainedByP1].sort());

    // 2 flat whites at 150 ml out of a 1000 ml pack of milk.
    expect(rows.find((row) => row.item_id === "iv3")?.delta_packs).toBeCloseTo(-0.3, 6);
    expect((await positionOf("iv3"))?.packs).toBeCloseTo(milkStock - 0.3, 6);
    // An item no line touched keeps its shelf number.
    expect((await positionOf("iv1"))?.packs).toBe(iv1.stock_packs);
  });

  it("does not drain stock for a quotation, which is not a commitment", async () => {
    const res = await submitBill([{ productId: "p1", quantity: 2 }], {
      paymentMethod: "",
      saveAsQuote: true,
    });
    const order = (await listDemoOrders(undefined, "BR-1")).find(
      (row) => row.order_number === res.orderNumber,
    );
    expect(order?.status).toBe("draft");

    // A draft is not a commitment, so it must not move the shelf — the same
    // rule isConsumingOrder() applies to the usage report, which is what keeps
    // a snapshot from showing usage and a drained position at once.
    const rows = (await listDemoInventoryLedger("BR-1")).filter(
      (row) => row.note === res.orderNumber,
    );
    expect(rows).toHaveLength(0);
    expect((await positionOf("iv3"))?.packs).toBeCloseTo(milkStock, 6);
  });

  it("drains the shelf when the customer accepts the quote", async () => {
    const res = await submitBill([{ productId: "p1", quantity: 2 }], {
      paymentMethod: "",
      saveAsQuote: true,
    });
    const quote = (await listDemoOrders(undefined, "BR-1")).find(
      (row) => row.order_number === res.orderNumber,
    );
    expect(quote?.status).toBe("draft");
    const token = quote?.public_token;
    expect(token).toBeTruthy();

    const accepted = await acceptDemoQuote(token!);
    expect(accepted.ok).toBe(true);

    // Acceptance is the commitment, so this is where the milk leaves.
    const rows = (await listDemoInventoryLedger("BR-1")).filter(
      (row) => row.note === res.orderNumber,
    );
    expect(rows.map((row) => row.item_id).sort()).toEqual([...drainedByP1].sort());
    expect((await positionOf("iv3"))?.packs).toBeCloseTo(milkStock - 0.3, 6);

    // Accepting twice does not drain twice.
    await acceptDemoQuote(token!);
    expect((await positionOf("iv3"))?.packs).toBeCloseTo(milkStock - 0.3, 6);
  });

  it("drains a seeded quote once, however many times it is accepted", async () => {
    const quote = pack.orders.find(
      (row) => row.status === "draft" && row.public_token,
    );
    expect(quote).toBeTruthy();
    const token = quote!.public_token!;

    await acceptDemoQuote(token);
    const after = await listDemoInventoryLedger("BR-1");
    await acceptDemoQuote(token);
    await acceptDemoQuote(token);

    // The pack order itself never changes, so the status patch is what says the
    // shelf has already been drawn down.
    expect(await listDemoInventoryLedger("BR-1")).toHaveLength(after.length);
  });

  it("stops draining an item once the product's recipe is cleared", async () => {
    await recipeOf("p1", []);
    const res = await submitBill([{ productId: "p1", quantity: 3 }]);
    expect(
      (await listDemoInventoryLedger("BR-1")).filter(
        (row) => row.note === res.orderNumber,
      ),
    ).toHaveLength(0);
    expect((await positionOf("iv3"))?.packs).toBeCloseTo(milkStock, 6);
  });

  it("writes no consumption at all for BR-2, whose pack ships no recipes", async () => {
    jar.map.set(DEMO_WORKSPACE_COOKIE, "BR-2");
    const furniture = getDemoBrandPack("BR-2");
    expect(furniture.ingredients).toHaveLength(0);
    const sellable = furniture.products.find((p) => p.is_active && !p.unavailable)!;

    const res = await submitBill([{ productId: sellable.id, quantity: 1 }]);
    expect(res.orderNumber).toMatch(/^CF-\d+$/);
    expect(await listDemoInventoryLedger("BR-2")).toHaveLength(0);

    // The furniture shelf still reads exactly what the pack says.
    const snap = await demoInventorySnapshot("BR-2");
    expect(snap.positions).toHaveLength(furniture.inventory.length);
    expect(snap.positions.every((p) => p.packs === p.item.stock_packs)).toBe(true);
  });
});
