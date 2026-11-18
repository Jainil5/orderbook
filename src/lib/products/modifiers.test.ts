import { describe, expect, it } from "vitest";
import type { Product } from "@/types/database";
import { pricedProductForCartLine } from "@/lib/pricing/cart-line";
import { buildOrderRecord } from "@/lib/orders/build-order-record";
import {
  MAX_MODIFIER_GROUPS,
  MAX_MODIFIER_OPTIONS,
  defaultModifierSelection,
  modifierLabels,
  modifierPriceDelta,
  parseProductModifiers,
  resolveModifierOptions,
  serializeProductModifiers,
} from "./modifiers";

function product(modifiers_json: unknown, price = 220): Product {
  return {
    id: "p1",
    brand_id: "b1",
    name: "Flat White",
    description: null,
    sku: null,
    category: "Coffee",
    price,
    unit: "cup",
    is_active: true,
    modifiers_json,
  } as Product;
}

const SIZE_AND_ADDONS = [
  {
    id: "size",
    name: "Size",
    type: "single",
    required: true,
    options: [
      { id: "sm", name: "Small", price: -30 },
      { id: "md", name: "Medium", price: 0, default: true },
      { id: "lg", name: "Large", price: 40 },
    ],
  },
  {
    id: "addons",
    name: "Add-ons",
    type: "multi",
    options: [
      { id: "shot", name: "Extra shot", price: 40 },
      { id: "oat", name: "Oat milk", price: 30 },
    ],
  },
];

describe("modifier groups", () => {
  it("normalises a legacy flat add-on list into one optional multi group", () => {
    const groups = parseProductModifiers(
      product([{ id: "shot", name: "Extra shot", price: 40 }]),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      id: "addons",
      name: "Add-ons",
      type: "multi",
    });
    expect(groups[0].options).toEqual([{ id: "shot", name: "Extra shot", price: 40 }]);
  });

  it("keeps negative deltas and drops malformed rows", () => {
    const groups = parseProductModifiers(
      product([
        ...SIZE_AND_ADDONS,
        { id: "broken", name: "No options", type: "single", options: [] },
        { id: "size", name: "Duplicate", type: "single", options: [{ id: "x", name: "X", price: 1 }] },
        { id: "huge", name: "Too big", type: "multi", options: [{ id: "y", name: "Y", price: 10 ** 9 }] },
      ]),
    );
    expect(groups.map((g) => g.id)).toEqual(["size", "addons"]);
    expect(groups[0].options[0].price).toBe(-30);
  });

  it("enforces unique option ids inside a product", () => {
    const groups = parseProductModifiers(
      product([
        { id: "a", name: "First", type: "multi", options: [{ id: "dup", name: "One", price: 10 }] },
        { id: "b", name: "Second", type: "multi", options: [{ id: "dup", name: "Two", price: 20 }] },
      ]),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].options).toHaveLength(1);
  });

  it("caps groups and options", () => {
    const many = Array.from({ length: MAX_MODIFIER_GROUPS + 4 }, (_, i) => ({
      id: `g${i}`,
      name: `Group ${i}`,
      type: "multi",
      options: Array.from({ length: MAX_MODIFIER_OPTIONS + 3 }, (_, j) => ({
        id: `g${i}-o${j}`,
        name: `Option ${j}`,
        price: j,
      })),
    }));
    const groups = parseProductModifiers(product(many));
    expect(groups).toHaveLength(MAX_MODIFIER_GROUPS);
    expect(groups[0].options).toHaveLength(MAX_MODIFIER_OPTIONS);
  });

  it("starts a line on the default choice of each group", () => {
    expect(defaultModifierSelection(parseProductModifiers(product(SIZE_AND_ADDONS)))).toEqual([
      "md",
    ]);
    const optional = parseProductModifiers(
      product([
        {
          id: "style",
          name: "Style",
          type: "single",
          options: [
            { id: "hot", name: "Hot", price: 0 },
            { id: "iced", name: "Iced", price: 20 },
          ],
        },
      ]),
    );
    expect(defaultModifierSelection(optional)).toEqual([]);
  });

  it("resolves one option per single group and every pick per multi group", () => {
    const p = product(SIZE_AND_ADDONS);
    expect(resolveModifierOptions(p, ["lg", "shot", "oat"]).map((r) => r.option.id)).toEqual([
      "lg",
      "shot",
      "oat",
    ]);
    expect(modifierPriceDelta(p, ["lg", "shot"])).toBe(80);
    // A pick outside a single group falls back to that group's default.
    expect(modifierPriceDelta(p, ["shot"])).toBe(40);
    expect(resolveModifierOptions(p, ["sm", "lg", "shot"])[0].option.id).toBe("lg");
    expect(modifierLabels(p, ["lg", "oat"])).toBe("Large, Oat milk");
    // No picks at all: the catalog default still prices the line.
    expect(modifierPriceDelta(p, [])).toBe(0);
    expect(modifierLabels(p, undefined)).toBe("Medium");
  });

  it("respects an unchecked default on a multi group", () => {
    const p = product([
      {
        id: "extras",
        name: "Extras",
        type: "multi",
        options: [
          { id: "icecream", name: "With ice cream", price: 30, default: true },
          { id: "protein", name: "Protein boost", price: 60 },
        ],
      },
    ]);
    expect(defaultModifierSelection(parseProductModifiers(p))).toEqual(["icecream"]);
    expect(modifierPriceDelta(p, ["protein"])).toBe(60);
  });

  it("prices a single-select preference swap at the base price", () => {
    const p = product(
      [
        {
          id: "seasoning",
          name: "Seasoning",
          type: "single",
          required: true,
          options: [
            { id: "salted", name: "Salted", price: 0, default: true },
            { id: "peri", name: "Peri peri", price: 0 },
          ],
        },
      ],
      180,
    );
    expect(modifierPriceDelta(p, ["peri"])).toBe(0);
    expect(modifierLabels(p, ["peri"])).toBe("Peri peri");
    expect(pricedProductForCartLine(p, "retail", ["peri"]).price).toBe(180);
  });

  it("never lets a negative size delta drop a line below zero", () => {
    const p = product(
      [
        {
          id: "size",
          name: "Size",
          type: "single",
          required: true,
          options: [{ id: "sm", name: "Small", price: -300 }],
        },
      ],
      220,
    );
    expect(pricedProductForCartLine(p, "retail", ["sm"]).price).toBe(0);
  });

  it("serializes groups for storage and drops incomplete ones", () => {
    const saved = serializeProductModifiers([
      {
        id: " size ",
        name: " Size ",
        type: "single",
        required: true,
        options: [
          { id: "sm", name: "Small", price: -30.004 },
          { id: "", name: "Ghost", price: 10 },
        ],
      },
      { id: "empty", name: "Empty", type: "multi", options: [] },
    ]);
    expect(saved).toEqual([
      {
        id: "size",
        name: "Size",
        type: "single",
        required: true,
        options: [{ id: "sm", name: "Small", price: -30 }],
      },
    ]);
  });

  it("carries the resolved choices into the saved order item", () => {
    const p = product(SIZE_AND_ADDONS);
    const built = buildOrderRecord({
      brandId: "b1",
      orderId: "o1",
      orderNumber: "BC-1",
      products: [p],
      customers: [],
      taxRatePercent: 0,
      offers: [],
      input: {
        customerId: null,
        lines: [{ productId: "p1", quantity: 2, modifierIds: ["lg", "shot"] }],
        paymentMethod: "UPI",
        paymentStatus: "pending",
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const [item] = built.record.items;
    expect(item.unit_price).toBe(300);
    expect(item.product_name_snapshot).toBe("Flat White (Large, Extra shot)");
    expect(item.modifier_labels).toBe("Large, Extra shot");
    expect(built.record.order.subtotal).toBe(600);
  });
});
