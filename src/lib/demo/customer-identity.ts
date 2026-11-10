import type { Customer } from "@/types/database";
import { normalizeCustomerPhone } from "@/lib/security/input";

export function phoneDigits(phone: string): string | null {
  const normalized = normalizeCustomerPhone(phone);
  return normalized ? normalized.replace(/\D/g, "") : null;
}

export function phonesMatch(a: string, b: string): boolean {
  if (a === b) return true;
  // Country-code prefix on one side only (+91 … vs bare 10-digit mobile).
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 8 && longer.endsWith(shorter);
}

/** Existing customer whose phone matches POS mobile input (best-effort). */
export function findCustomerByPhone(
  customers: Customer[],
  rawPhone: string,
): Customer | null {
  const digits = phoneDigits(rawPhone);
  if (!digits) return null;
  return (
    customers.find((c) => {
      const other = c.phone ? phoneDigits(c.phone) : null;
      return other != null && phonesMatch(digits, other);
    }) ?? null
  );
}

export function matchOrCreateCustomerId(
  customers: Customer[],
  phone: string | null | undefined,
  name: string | null | undefined,
  brandId: string,
): { id: string | null; created?: Customer } {
  const digits = phone ? phoneDigits(phone) : null;
  if (!digits) return { id: null };
  const match = findCustomerByPhone(customers, phone ?? "");
  if (match) return { id: match.id };
  const created: Customer = {
    id: `demo-cust-${Date.now()}`,
    brand_id: brandId,
    name: name?.trim() || "User",
    email: null,
    phone: normalizeCustomerPhone(phone!) ?? phone!.trim(),
    notes: null,
  };
  return { id: created.id, created };
}