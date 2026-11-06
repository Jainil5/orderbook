import type { BrandRole, OrderDiscountInput } from "@/types/database";
import { clampPercent } from "@/lib/pricing/discounts";

export function maxManualOrderDiscountPercent(role: BrandRole): number {
  switch (role) {
    case "staff":
      return 10;
    case "manager":
      return 30;
    default:
      return 100;
  }
}

export function validateManualOrderDiscountForRole(
  role: BrandRole,
  discount: OrderDiscountInput | null,
): { ok: true } | { ok: false; message: string } {
  if (!discount) return { ok: true };
  if (discount.type === "percent") {
    const max = maxManualOrderDiscountPercent(role);
    if (clampPercent(discount.value) > max) {
      return {
        ok: false,
        message: `Your role can apply at most ${max}% manual discount.`,
      };
    }
  }
  return { ok: true };
}

export function canViewProductCost(role: BrandRole): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}
