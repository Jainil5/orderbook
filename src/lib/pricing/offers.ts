import type { Offer, Product } from "@/types/database";
import { clampPercent, roundMoney } from "@/lib/pricing/discounts";

export function normalizeOfferCode(code: string): string {
  return code.trim().toUpperCase();
}

export function findActiveOffer(
  code: string,
  offers: Offer[],
): Offer | null {
  const normalized = normalizeOfferCode(code);
  if (!normalized) return null;
  const now = Date.now();
  for (const offer of offers) {
    if (!offer.is_active || !offer.code) continue;
    if (normalizeOfferCode(offer.code) !== normalized) continue;
    if (offer.starts_at && new Date(offer.starts_at).getTime() > now) continue;
    if (offer.ends_at && new Date(offer.ends_at).getTime() < now) continue;
    if (
      offer.usage_limit != null &&
      offer.redemption_count >= offer.usage_limit
    ) {
      continue;
    }
    return offer;
  }
  return null;
}

function eligibleSubtotal(
  offer: Offer,
  lines: { product: Product; quantity: number }[],
  subtotalAfterProductDiscounts: number,
): number {
  if (offer.scope === "order") {
    return subtotalAfterProductDiscounts;
  }
  let sum = 0;
  for (const line of lines) {
    const qty = Math.max(0, line.quantity);
    if (qty <= 0) continue;
    if (offer.scope === "product") {
      const key = offer.scope_value?.trim();
      if (!key) continue;
      if (line.product.id === key || line.product.sku === key) {
        sum += line.product.price * qty;
      }
    } else if (offer.scope === "category") {
      const cat = offer.scope_value?.trim();
      if (!cat) continue;
      const lineCat = line.product.category ?? "Uncategorized";
      if (lineCat === cat) {
        sum += line.product.price * qty;
      }
    }
  }
  return roundMoney(sum);
}

export function computeOfferDiscountAmount(
  offer: Offer,
  params: {
    lines: { product: Product; quantity: number }[];
    subtotalAfterProductDiscounts: number;
  },
): number {
  const base = eligibleSubtotal(
    offer,
    params.lines,
    params.subtotalAfterProductDiscounts,
  );
  if (base <= 0) return 0;
  if (offer.min_order_amount != null && base < offer.min_order_amount) {
    return 0;
  }

  let amount = 0;
  if (offer.discount_type === "percent") {
    amount = roundMoney((base * clampPercent(offer.discount_value)) / 100);
  } else {
    amount = roundMoney(Math.min(Math.max(0, offer.discount_value), base));
  }
  if (offer.max_discount != null) {
    amount = Math.min(amount, offer.max_discount);
  }
  return roundMoney(Math.min(amount, params.subtotalAfterProductDiscounts));
}

export function validateOfferCodeForCart(
  code: string,
  offers: Offer[],
  lines: { product: Product; quantity: number }[],
  subtotalAfterProductDiscounts: number,
): { ok: true; offer: Offer; amount: number } | { ok: false; message: string } {
  const trimmed = code.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter an offer code." };
  }
  const offer = findActiveOffer(trimmed, offers);
  if (!offer) {
    return { ok: false, message: "Offer code is invalid or expired." };
  }
  const amount = computeOfferDiscountAmount(offer, {
    lines,
    subtotalAfterProductDiscounts,
  });
  if (amount <= 0) {
    return {
      ok: false,
      message: "This offer does not apply to the current bill.",
    };
  }
  return { ok: true, offer, amount };
}
