import { describe, expect, it } from "vitest";
import { computeCartTotals } from "@/lib/pricing/discounts";
import type { Product } from "@/types/database";

const desk: Product = {
  id: "p1",
  brand_id: "b1",
  name: "Executive Desk",
  description: null,
  sku: "CF-DSK-01",
  category: "Desks",
  price: 20000,
  unit: "unit",
  is_active: true,
  default_discount_percent: 10,
};

const base = {
  lines: [{ product: desk, quantity: 2 }],
  taxRatePercent: 18,
  orderDiscount: null,
};

describe("computeCartTotals charges", () => {
  it("keeps the pre-charges maths when no fee is passed", () => {
    const totals = computeCartTotals(base);
    expect(totals.listSubtotal).toBe(40000);
    expect(totals.productDiscountTotal).toBe(4000);
    expect(totals.taxableSubtotal).toBe(36000);
    expect(totals.taxTotal).toBe(6480);
    expect(totals.feesTotal).toBe(0);
    expect(totals.grandTotal).toBe(42480);
  });

  it("adds untaxed delivery and installation charges to the grand total", () => {
    const totals = computeCartTotals({ ...base, feesAmount: 2500 });
    expect(totals.feesTotal).toBe(2500);
    expect(totals.taxTotal).toBe(6480);
    expect(totals.grandTotal).toBe(44980);
  });

  it("ignores a negative or non-finite charge instead of shrinking the bill", () => {
    expect(
      computeCartTotals({ ...base, feesAmount: -500 }).feesTotal,
    ).toBe(0);
    expect(
      computeCartTotals({ ...base, feesAmount: Number.NaN }).feesTotal,
    ).toBe(0);
  });
});
