import { describe, expect, it } from "vitest";
import { getDemoBrandPack } from "@/lib/demo/brands";
import {
  buildMenuSections,
  buildRails,
  buildShelfCounts,
  buildSiteStats,
  buildTestimonials,
  detailLine,
  fillLine,
  resolveSet,
  siteOffers,
} from "./menu";
import { SITE_PROFILES } from "./registry";
import type { Product, OrderItem } from "@/types/database";

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "t1",
    brand_id: "demo-brewery-cafe",
    name: "Test Pour",
    description: null,
    sku: null,
    category: "Coffee",
    price: 100,
    cost_price: null,
    unit: "cup",
    is_active: true,
    image_url: null,
    stock_qty: 10,
    modifiers_json: null,
    unavailable: false,
    ...overrides,
  };
}

function orderItem(productId: string, quantity: number): OrderItem {
  return {
    id: `line-${productId}-${quantity}`,
    order_id: "o-1",
    product_id: productId,
    product_name_snapshot: "x",
    quantity,
    unit_price: 100,
    line_discount: 0,
    line_total: 100 * quantity,
  };
}

describe("buildMenuSections", () => {
  it("groups the cafe pack into its own categories, Coffee first", () => {
    const pack = getDemoBrandPack("BR-1");
    const sections = buildMenuSections(pack.products, pack.orderItems, SITE_PROFILES["BR-1"]);
    expect(sections.map((s) => s.category)).toEqual([
      "Coffee",
      "Beverages",
      "Food",
      "Sides & Dips",
      "Desserts",
    ]);
    const coffee = sections[0];
    expect(coffee.items.map((i) => i.name)).toEqual([
      "Flat White",
      "Cold Brew",
      "Espresso",
      "Cappuccino",
      "Vanilla Latte",
    ]);
  });

  it("carries the coffee types' size and add-on groups into the site items", () => {
    const pack = getDemoBrandPack("BR-1");
    const sections = buildMenuSections(pack.products, pack.orderItems, SITE_PROFILES["BR-1"]);
    const flatWhite = sections[0].items.find((i) => i.name === "Flat White");
    expect(flatWhite).toBeTruthy();
    expect(flatWhite!.modifiers.map((g) => g.name)).toEqual(["Size", "Add-ons"]);
    expect(flatWhite!.defaultModifierIds).toContain("md");
    // Espresso has no modifier rows at all.
    const espresso = sections[0].items.find((i) => i.name === "Espresso");
    expect(espresso!.modifiers).toEqual([]);
  });

  it("applies the product's default discount to the site price", () => {
    const pack = getDemoBrandPack("BR-1");
    const sections = buildMenuSections(pack.products, pack.orderItems, SITE_PROFILES["BR-1"]);
    const pastry = sections
      .find((s) => s.category === "Desserts")!
      .items.find((i) => i.name === "Seasonal Pastry");
    expect(pastry!.discountPercent).toBe(50);
    expect(pastry!.listPrice).toBe(150);
    expect(pastry!.price).toBe(75);
  });

  it("flags items ordered twice or more as popular, from the order history", () => {
    const sections = buildMenuSections(
      [product(), product({ id: "t2", name: "Quiet Pour" })],
      [orderItem("t1", 3), orderItem("t2", 1)],
    );
    expect(sections[0].items.find((i) => i.id === "t1")!.popular).toBe(true);
    expect(sections[0].items.find((i) => i.id === "t2")!.popular).toBe(false);
  });

  it("marks empty-shelf items sold out and hides inactive rows", () => {
    const sections = buildMenuSections(
      [
        product({ id: "gone", stock_qty: 0 }),
        product({ id: "hidden", is_active: false }),
        product({ id: "na", unavailable: true }),
      ],
      [],
    );
    const items = sections[0].items;
    expect(items.find((i) => i.id === "gone")!.soldOut).toBe(true);
    expect(items.find((i) => i.id === "hidden")).toBeUndefined();
    expect(items.find((i) => i.id === "na")).toBeUndefined();
  });

  it("unknown categories follow the profile's order at the end", () => {
    const profile = {
      ...SITE_PROFILES["BR-1"],
      categoryOrder: ["Coffee"],
    };
    const sections = buildMenuSections(
      [product({ category: "Oddities" }), product()],
      [],
      profile,
    );
    expect(sections.map((s) => s.category)).toEqual(["Coffee", "Oddities"]);
  });
});

describe("buildSiteStats", () => {
  it("counts the pack's own orders, guests, ratings and live items", () => {
    const pack = getDemoBrandPack("BR-1");
    const stats = buildSiteStats(pack.products, pack.orders, pack.reviews);
    expect(stats.ordersServed).toBe(pack.orders.length);
    expect(stats.guests).toBe(
      new Set(
        pack.orders
          .map((o) => o.customer_id)
          .filter((id): id is string => !!id),
      ).size,
    );
    expect(stats.itemCount).toBe(15);
    const rated = pack.reviews.filter((r) => r.rating > 0);
    expect(stats.reviewCount).toBe(pack.reviews.length);
    expect(stats.avgRating).not.toBeNull();
    expect(stats.avgRating!).toBeGreaterThan(0);
    expect(stats.avgRating!).toBeLessThanOrEqual(5);
    expect(rated.length).toBeGreaterThan(0);
  });

  it("returns a null rating when no reviews carry a rating", () => {
    const pack = getDemoBrandPack("BR-1");
    const stats = buildSiteStats(pack.products, pack.orders, []);
    expect(stats.avgRating).toBeNull();
    expect(stats.reviewCount).toBe(0);
  });
});

describe("buildTestimonials", () => {
  it("keeps four-and-five-star prose from the review inbox, newest first", () => {
    const pack = getDemoBrandPack("BR-1");
    const testimonials = buildTestimonials(pack.reviews);
    expect(testimonials.length).toBeGreaterThan(0);
    for (const testimonial of testimonials) {
      expect(testimonial.rating).toBeGreaterThanOrEqual(4);
      expect(testimonial.text.length).toBeGreaterThanOrEqual(40);
      expect(testimonial.source.length).toBeGreaterThan(0);
    }
    const times = testimonials.map((t) => t.when);
    expect([...times].sort().reverse()).toEqual(times);
  });
});

describe("siteOffers", () => {
  it("lists the cafe's active offer codes", () => {
    const pack = getDemoBrandPack("BR-1");
    const offers = siteOffers(pack.offers);
    expect(offers.map((o) => o.code)).toEqual(["HAPPY10", "FOOD50"]);
  });
});

describe("detailLine", () => {
  const br1 = SITE_PROFILES["BR-1"];

  it("fills the stock sentence from the row and tails it with the category note", () => {
    expect(detailLine(120, "Coffee", br1)).toBe(
      "120 portions on the shelf · pulled when you order",
    );
    expect(detailLine(0, "Desserts", br1)).toBe(
      "0 portions on the shelf · out of the oven by nine",
    );
  });

  it("falls back to the made-to-order line when the row carries no stock", () => {
    expect(detailLine(null, "Coffee", br1)).toBe(
      "ground and poured to order · pulled when you order",
    );
    expect(detailLine(null, "Oddities", br1)).toBe(
      "ground and poured to order",
    );
  });

  it("leaves an unfilled placeholder alone rather than printing undefined", () => {
    expect(fillLine("{qty} seats", {})).toBe("{qty} seats");
    expect(fillLine("{n} notes", { n: 3 })).toBe("3 notes");
  });
});

describe("buildMenuSections detail", () => {
  it("carries the order history and the stock note onto each item", () => {
    const sections = buildMenuSections(
      [product({ id: "t1", stock_qty: 7 }), product({ id: "t2", stock_qty: null })],
      [orderItem("t1", 4)],
      SITE_PROFILES["BR-1"],
    );
    const items = sections[0].items;
    expect(items.find((i) => i.id === "t1")!.orderedQty).toBe(4);
    expect(items.find((i) => i.id === "t1")!.detail).toBe(
      "7 portions on the shelf · pulled when you order",
    );
    expect(items.find((i) => i.id === "t2")!.orderedQty).toBe(0);
    expect(items.find((i) => i.id === "t2")!.detail).toContain(
      "ground and poured to order",
    );
  });
});

describe("buildShelfCounts", () => {
  it("counts the card's own lines, sections and cheapest priced row", () => {
    const pack = getDemoBrandPack("BR-1");
    const sections = buildMenuSections(
      pack.products,
      pack.orderItems,
      SITE_PROFILES["BR-1"],
    );
    const counts = buildShelfCounts(sections);
    expect(counts.lines).toBe(15);
    expect(counts.sections).toBe(5);
    // The Seasonal Pastry carries a 50% default discount, so it is the floor.
    expect(counts.cheapest).toBe(75);
    expect(counts.orderedTotal).toBeGreaterThan(0);
  });

  it("has no floor price for an empty card", () => {
    expect(buildShelfCounts([]).cheapest).toBeNull();
  });
});

describe("buildRails", () => {
  it("ranks the repeated lines by how often the ledger sold them", () => {
    const pack = getDemoBrandPack("BR-1");
    const sections = buildMenuSections(
      pack.products,
      pack.orderItems,
      SITE_PROFILES["BR-1"],
    );
    const rails = buildRails(sections);
    expect(rails.length).toBeGreaterThan(0);
    expect(rails.length).toBeLessThanOrEqual(6);
    for (const item of rails) expect(item.orderedQty).toBeGreaterThan(0);
    const quantities = rails.map((item) => item.orderedQty);
    expect([...quantities].sort((a, b) => b - a)).toEqual(quantities);
  });

  it("still fills the rail from the card when nothing has sold yet", () => {
    const sections = buildMenuSections(
      [product({ id: "t1", price: 100 }), product({ id: "t2", price: 300 })],
      [],
      SITE_PROFILES["BR-1"],
    );
    const rails = buildRails(sections);
    expect(rails.map((item) => item.id)).toEqual(["t2", "t1"]);
  });
});

describe("resolveSet", () => {
  it("prices the cafe's set from the counter's own rows", () => {
    const pack = getDemoBrandPack("BR-1");
    const sections = buildMenuSections(
      pack.products,
      pack.orderItems,
      SITE_PROFILES["BR-1"],
    );
    const set = resolveSet(sections, SITE_PROFILES["BR-1"]);
    expect(set.courses.map((course) => course.item.name)).toEqual([
      "Cold Brew",
      "Granola Bowl",
      "Avocado Toast",
      "Chocolate Brownie",
    ]);
    expect(set.total).toBe(260 + 280 + 320 + 180);
    expect(set.dropped).toEqual([]);
    expect(set.steps).toEqual([]);
  });

  it("prices the workshop set with the discounted rows and the build steps", () => {
    const pack = getDemoBrandPack("BR-2");
    const sections = buildMenuSections(
      pack.products,
      pack.orderItems,
      SITE_PROFILES["BR-2"],
    );
    const set = resolveSet(sections, SITE_PROFILES["BR-2"]);
    // The modular shelf carries a 25% default discount, so the set uses 18,375.
    expect(set.total).toBe(18900 + 12900 + 18375);
    expect(set.steps.map((step) => step.label)).toEqual([
      "Measure",
      "Cut",
      "Finish",
      "Build",
      "Install",
    ]);
  });

  it("drops a course whose row left the card instead of pricing it from memory", () => {
    const pack = getDemoBrandPack("BR-1");
    const sections = buildMenuSections(
      pack.products.filter((row) => row.id !== "p24"),
      pack.orderItems,
      SITE_PROFILES["BR-1"],
    );
    const set = resolveSet(sections, SITE_PROFILES["BR-1"]);
    expect(set.courses.map((course) => course.n)).toEqual(["01", "02", "03"]);
    expect(set.dropped.map((course) => course.productId)).toEqual(["p24"]);
    expect(set.total).toBe(260 + 280 + 320);
  });
});
