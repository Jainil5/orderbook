import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDemoBrandPack } from "./index";
import { DEMO_LIMITS } from "../read-only";

const ROOT = resolve(import.meta.dirname, "../../../..");
const cafe = getDemoBrandPack("BR-1");
const furniture = getDemoBrandPack("BR-2");

/** Mirrors the private INVENTORY_STORAGE list in csv/mappers.ts:324. */
const STORAGE = ["ambient", "dry", "refrigerated", "frozen", "flammable"];

describe("BR-1 inventory pack", () => {
  it("ships 33 counted stock items with unique iv ids and a real pack size", () => {
    expect(cafe.inventory).toHaveLength(33);
    expect(cafe.inventory.length).toBeLessThanOrEqual(DEMO_LIMITS.inventory);

    const ids = cafe.inventory.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of cafe.inventory) {
      expect(row.id, row.id).toMatch(/^iv\d+$/);
      expect(row.brand_id).toBe(cafe.brand.id);
      expect(row.name.trim()).not.toBe("");
      expect(row.unit.trim()).not.toBe("");
      // A 0 pack size would poison every unit/pack conversion in the reports,
      // and mapInventoryItem refuses to load one.
      expect(row.units_per_pack, row.id).toBeGreaterThan(0);
      expect(row.cost_per_pack, row.id).toBeGreaterThanOrEqual(0);
      expect(row.stock_packs, row.id).toBeGreaterThanOrEqual(0);
      expect(row.low_stock_packs, row.id).toBeGreaterThanOrEqual(0);
      if (row.storage) expect(STORAGE, row.id).toContain(row.storage);
    }
  });

  it("names the two rows the showcase copy depends on", () => {
    expect(cafe.inventory.find((row) => row.id === "iv1")).toMatchObject({
      name: "Multigrain Bread",
      unit: "slice",
      units_per_pack: 18,
    });
    expect(cafe.inventory.find((row) => row.id === "iv16")).toMatchObject({
      name: "Vanilla Instant Coffee",
      unit: "glass",
      units_per_pack: 60,
    });
  });

  it("carries a shelf that can actually run out", () => {
    // Without an empty row the "out of stock" state is never demonstrated, and
    // without a short one the reorder prompt has nothing to say.
    expect(cafe.inventory.some((row) => row.stock_packs === 0)).toBe(true);
    expect(
      cafe.inventory.some(
        (row) => row.stock_packs > 0 && row.stock_packs < row.low_stock_packs,
      ),
    ).toBe(true);
    expect(cafe.inventory.some((row) => row.stock_packs > row.low_stock_packs)).toBe(true);
  });
});

describe("BR-1 recipes", () => {
  const productIds = new Set(cafe.products.map((row) => row.id));
  const itemIds = new Set(cafe.inventory.map((row) => row.id));

  it("ships 60 lines that resolve to BR-1 products and BR-1 stock items", () => {
    expect(cafe.ingredients).toHaveLength(60);
    const ids = cafe.ingredients.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const row of cafe.ingredients) {
      expect(row.id, row.id).toMatch(/^rc\d+$/);
      expect(row.brand_id).toBe(cafe.brand.id);
      expect(productIds.has(row.product_id), row.id).toBe(true);
      expect(itemIds.has(row.item_id), row.id).toBe(true);
      // A 0 or negative usage would write a consumption movement that never moves.
      expect(row.qty_per_sale, row.id).toBeGreaterThan(0);
    }
  });

  it("gives every covered product a usable list of 2 to 5 lines", () => {
    const byProduct = new Map<string, number>();
    for (const row of cafe.ingredients) {
      byProduct.set(row.product_id, (byProduct.get(row.product_id) ?? 0) + 1);
    }
    expect(byProduct.size).toBe(14);
    for (const [productId, count] of byProduct) {
      expect(count, productId).toBeGreaterThanOrEqual(2);
      expect(count, productId).toBeLessThanOrEqual(5);
    }
    expect([...byProduct.keys()].sort()).toEqual(
      ["p1", "p2", "p3", "p4", "p7", "p8", "p10", "p13", "p14", "p15", "p16", "p18", "p19", "p24"].sort(),
    );
    // Covered products are sellable, or a recipe would drain nothing.
    for (const productId of byProduct.keys()) {
      const product = cafe.products.find((row) => row.id === productId)!;
      expect(product.is_active, productId).toBe(true);
      expect(!!product.unavailable, productId).toBe(false);
    }
  });

  it("leaves p6 (Seasonal Pastry) without a recipe on purpose", () => {
    const pastry = cafe.products.find((row) => row.id === "p6");
    expect(pastry?.name).toBe("Seasonal Pastry");
    expect(
      cafe.ingredients.filter((row) => row.product_id === "p6"),
    ).toHaveLength(0);
  });

  it("leaves iv16 (Vanilla Instant Coffee) unreferenced on purpose", () => {
    // Deliberate: the instant coffee is not a fixed ingredient of any menu
    // item — the merchant attaches it from the product dialog as a recipe of
    // their own, so the pack ships it as stock only.
    expect(
      cafe.ingredients.filter((row) => row.item_id === "iv16"),
    ).toHaveLength(0);
    expect(cafe.inventory.some((row) => row.id === "iv16")).toBe(true);
  });
});

describe("BR-2 inventory pack", () => {
  it("ships 22 material items and no recipes at all", () => {
    expect(furniture.inventory).toHaveLength(22);
    expect(furniture.inventory.length).toBeLessThanOrEqual(DEMO_LIMITS.inventory);
    // The furniture vertical issues materials per job, not per sale: an empty
    // ingredient list is the shipped shape, not missing data.
    expect(furniture.ingredients).toHaveLength(0);
    expect(
      existsSync(resolve(ROOT, "data/demo/BR-2/recipes.csv")),
      "BR-2 must stay a recipes-free vertical",
    ).toBe(false);

    const ids = furniture.inventory.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of furniture.inventory) {
      expect(row.id, row.id).toMatch(/^fv\d+$/);
      expect(row.brand_id).toBe(furniture.brand.id);
      expect(row.units_per_pack, row.id).toBeGreaterThan(0);
      expect(row.stock_packs, row.id).toBeGreaterThanOrEqual(0);
      if (row.storage) expect(STORAGE, row.id).toContain(row.storage);
    }
  });

  it("flags flammable stock and keeps an empty sheet on the shelf", () => {
    const flammable = furniture.inventory.filter((row) => row.storage === "flammable");
    expect(flammable.length).toBeGreaterThan(0);
    expect(flammable.map((row) => row.id).sort()).toEqual(["fv14", "fv15", "fv16"]);

    const mdf = furniture.inventory.find((row) => row.id === "fv3");
    expect(mdf).toBeDefined();
    expect(mdf?.name).toBe("MDF Board 6mm");
    expect(mdf?.stock_packs).toBe(0);
    // The reorder signal has to fire on it, so the pack gives it a level above 0.
    expect(mdf?.low_stock_packs).toBeGreaterThan(0);
  });
});

describe("the two verticals stay separate datasets", () => {
  it("share no stock item id and belong to different brands", () => {
    const cafeIds = new Set(cafe.inventory.map((row) => row.id));
    const furnitureIds = new Set(furniture.inventory.map((row) => row.id));
    for (const id of furnitureIds) expect(cafeIds.has(id), id).toBe(false);

    expect(cafe.brand.id).not.toBe(furniture.brand.id);
    expect(cafe.inventory.every((row) => row.brand_id === cafe.brand.id)).toBe(true);
    expect(
      furniture.inventory.every((row) => row.brand_id === furniture.brand.id),
    ).toBe(true);
    // A recipe must never point across the verticals.
    for (const row of cafe.ingredients) {
      expect(row.brand_id).toBe(cafe.brand.id);
      expect(furnitureIds.has(row.item_id), row.id).toBe(false);
    }
    // Names differ too, so a merged list could not hide a duplicate.
    const cafeNames = new Set(cafe.inventory.map((row) => row.name));
    expect(
      furniture.inventory.every((row) => !cafeNames.has(row.name)),
    ).toBe(true);
  });
});
