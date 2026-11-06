import type { Customer, Product } from "@/types/database";
import { effectiveUnitPrice } from "@/lib/pricing/discounts";

export type PriceTier = "retail" | "wholesale";

export function customerPriceTier(
  customer: Pick<Customer, "price_tier"> | null | undefined,
): PriceTier {
  if (customer?.price_tier === "wholesale") return "wholesale";
  return "retail";
}

export function listUnitPrice(
  product: Product,
  tier: PriceTier,
): number {
  if (tier === "wholesale" && product.wholesale_price != null) {
    return product.wholesale_price;
  }
  return product.price;
}

/** Unit price after tier + product default discount */
export function resolvedUnitPrice(
  product: Product,
  tier: PriceTier,
): number {
  const base = listUnitPrice(product, tier);
  const withTier: Product = { ...product, price: base };
  return effectiveUnitPrice(withTier);
}
