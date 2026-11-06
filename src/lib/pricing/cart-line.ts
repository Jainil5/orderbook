import type { Product } from "@/types/database";
import { parseProductModifiers } from "@/lib/products/modifiers";
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
  const modifiers = parseProductModifiers(product);
  const extra = modifiers
    .filter((m) => modifierIds.includes(m.id))
    .reduce((sum, m) => sum + m.price, 0);
  return { ...product, price: listUnitPrice(product, tier) + extra };
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
