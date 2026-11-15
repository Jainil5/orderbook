import { describe, expect, it } from "vitest";
import type { Product } from "@/types/database";
import {
  groupCategories,
  groupProductsByCategory,
} from "@/lib/products/catalog-groups";

function product(name: string, category: string | null): Product {
  return {
    id: name,
    brand_id: "BR-1",
    name,
    description: null,
    sku: null,
    category,
    price: 100,
    unit: null,
    is_active: true,
  };
}

describe("groupCategories", () => {
  it("puts All first, then categories alphabetically", () => {
    expect(
      groupCategories([
        product("Cold Brew", "Beverages"),
        product("Toast", "Food"),
        product("Filter", "Coffee"),
      ]),
    ).toEqual(["All", "Beverages", "Coffee", "Food"]);
  });

  it("folds missing categories into Uncategorized", () => {
    expect(groupCategories([product("Mystery", null)])).toEqual([
      "All",
      "Uncategorized",
    ]);
  });

  it("lists each category once", () => {
    expect(
      groupCategories([
        product("A", "Coffee"),
        product("B", "Coffee"),
        product("C", "Food"),
      ]),
    ).toEqual(["All", "Coffee", "Food"]);
  });
});

describe("groupProductsByCategory", () => {
  it("orders groups alphabetically and keeps insertion order inside a group", () => {
    const rows = [
      product("Toast", "Food"),
      product("Cold Brew", "Beverages"),
      product("Filter", "Coffee"),
      product("Latte", "Coffee"),
    ];
    expect(
      groupProductsByCategory(rows).map((g) => [
        g.category,
        g.products.map((p) => p.name),
      ]),
    ).toEqual([
      ["Beverages", ["Cold Brew"]],
      ["Coffee", ["Filter", "Latte"]],
      ["Food", ["Toast"]],
    ]);
  });

  it("collects unclassified products under Uncategorized", () => {
    const groups = groupProductsByCategory([
      product("Mystery", null),
      product("Blank", "  "),
      product("Coffee", "Coffee"),
    ]);
    expect(groups.map((g) => g.category)).toEqual(["Coffee", "Uncategorized"]);
    expect(groups[1].products.map((p) => p.name)).toEqual(["Mystery", "Blank"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupProductsByCategory([])).toEqual([]);
  });
});
