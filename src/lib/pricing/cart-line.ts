import type { Product } from "@/types/database";
import { modifierPriceDelta } from "@/lib/products/modifiers";
import {
  lineNetTotal,
  productLineDiscountAmount,
} from "@/lib/pricing/discounts";
import {
  listUnitPrice,
  type PriceTier,
} from "@/lib/pricing/unit-price";

export function cartLineKey(productId: string, modifierIds: string[]): string {
  return `${productId}:${[...modifierIds].sort().join(",")}`;
}

export function pricedProductForCartLine(
  product: Product,
  tier: PriceTier,
  modifierIds: string[],
): Product {
  const base = listUnitPrice(product, tier);
  // Size deltas can be negative; a line is never allowed to go below zero.
  const unit = Math.max(0, base + modifierPriceDelta(product, modifierIds));
  return { ...product, price: unit };
}

export function cartLineNetTotal(
  product: Product,
  quantity: number,
  tier: PriceTier,
  modifierIds: string[],
): number {
  return lineNetTotal(
    pricedProductForCartLine(product, tier, modifierIds),
    quantity,
  );
}

export function cartLineDiscountAmount(
  product: Product,
  quantity: number,
  tier: PriceTier,
  modifierIds: string[],
): number {
  return productLineDiscountAmount(
    pricedProductForCartLine(product, tier, modifierIds),
    quantity,
  );
}

export function stockAvailable(product: Product): number | null {
  if (product.stock_qty == null || !Number.isFinite(product.stock_qty)) {
    return null;
  }
  return product.stock_qty;
}

export function isLowStock(product: Product): boolean {
  const qty = stockAvailable(product);
  if (qty == null) return false;
  const threshold = product.low_stock_threshold;
  if (threshold != null && Number.isFinite(threshold)) {
    return qty <= threshold;
  }
  return qty <= 5;
}
