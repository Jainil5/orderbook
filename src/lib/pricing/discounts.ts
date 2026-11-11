import type { OrderDiscountInput, Product } from "@/types/database";

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function productDefaultDiscountPercent(product: Product): number {
  const raw = product.default_discount_percent;
  if (raw == null || !Number.isFinite(raw)) return 0;
  return clampPercent(raw);
}

export function hasProductDefaultDiscount(product: Product): boolean {
  return productDefaultDiscountPercent(product) > 0;
}

/** Unit price after product default discount (list price unchanged on product). */
export function effectiveUnitPrice(product: Product): number {
  const pct = productDefaultDiscountPercent(product);
  if (pct <= 0) return product.price;
  return roundMoney(product.price * (1 - pct / 100));
}

export function productLineDiscountAmount(
  product: Product,
  quantity: number,
): number {
  const qty = Math.max(0, quantity);
  const unitDisc = product.price - effectiveUnitPrice(product);
  return roundMoney(unitDisc * qty);
}

export function lineNetTotal(product: Product, quantity: number): number {
  return roundMoney(effectiveUnitPrice(product) * Math.max(0, quantity));
}

export type CartTotals = {
  listSubtotal: number;
  productDiscountTotal: number;
  subtotalAfterProductDiscounts: number;
  orderDiscountAmount: number;
  offerDiscountAmount: number;
  discountTotal: number;
  taxableSubtotal: number;
  taxTotal: number;
  /** Untaxed delivery / installation charges added after tax. */
  feesTotal: number;
  grandTotal: number;
};

export function computeCartTotals(params: {
  lines: { product: Product; quantity: number }[];
  taxRatePercent: number;
  orderDiscount: OrderDiscountInput | null;
  offerDiscountAmount?: number;
  feesAmount?: number;
}): CartTotals {
  const taxRate = clampPercent(params.taxRatePercent);

  let listSubtotal = 0;
  let productDiscountTotal = 0;
  let subtotalAfterProductDiscounts = 0;

  for (const line of params.lines) {
    const qty = Math.max(0, line.quantity);
    listSubtotal += line.product.price * qty;
    const lineDisc = productLineDiscountAmount(line.product, qty);
    productDiscountTotal += lineDisc;
    subtotalAfterProductDiscounts += lineNetTotal(line.product, qty);
  }

  listSubtotal = roundMoney(listSubtotal);
  productDiscountTotal = roundMoney(productDiscountTotal);
  subtotalAfterProductDiscounts = roundMoney(subtotalAfterProductDiscounts);

  let orderDiscountAmount = 0;
  const od = params.orderDiscount;
  if (od && subtotalAfterProductDiscounts > 0) {
    if (od.type === "percent") {
      const pct = clampPercent(od.value);
      orderDiscountAmount = roundMoney(
        (subtotalAfterProductDiscounts * pct) / 100,
      );
    } else if (od.type === "fixed") {
      orderDiscountAmount = roundMoney(
        Math.min(Math.max(0, od.value), subtotalAfterProductDiscounts),
      );
    }
  }

  let offerDiscountAmount = roundMoney(
    Math.max(0, params.offerDiscountAmount ?? 0),
  );
  offerDiscountAmount = roundMoney(
    Math.min(offerDiscountAmount, Math.max(0, subtotalAfterProductDiscounts - orderDiscountAmount)),
  );

  const discountTotal = roundMoney(
    productDiscountTotal + orderDiscountAmount + offerDiscountAmount,
  );
  const taxableSubtotal = roundMoney(
    Math.max(
      0,
      subtotalAfterProductDiscounts - orderDiscountAmount - offerDiscountAmount,
    ),
  );
  const taxTotal = roundMoney((taxableSubtotal * taxRate) / 100);
  const feesTotal = roundMoney(
    Math.max(0, Number.isFinite(params.feesAmount ?? 0) ? (params.feesAmount ?? 0) : 0),
  );
  const grandTotal = roundMoney(taxableSubtotal + taxTotal + feesTotal);

  return {
    listSubtotal,
    productDiscountTotal,
    subtotalAfterProductDiscounts,
    orderDiscountAmount,
    offerDiscountAmount,
    discountTotal,
    taxableSubtotal,
    taxTotal,
    feesTotal,
    grandTotal,
  };
}

export function parseOptionalOrderDiscount(
  type: "none" | "percent" | "fixed",
  rawValue: string,
): { ok: true; discount: OrderDiscountInput | null } | { ok: false; message: string } {
  if (type === "none") return { ok: true, discount: null };
  const trimmed = rawValue.trim();
  if (!trimmed) return { ok: true, discount: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, message: "Enter a valid discount value." };
  }
  if (type === "percent") {
    if (value > 100) {
      return { ok: false, message: "Discount percent cannot exceed 100." };
    }
    return { ok: true, discount: { type: "percent", value } };
  }
  return { ok: true, discount: { type: "fixed", value } };
}

export function formatDiscountPercentLabel(percent: number): string {
  const p = clampPercent(percent);
  if (p === Math.floor(p)) return `${p}% off`;
  return `${p}% off`;
}
