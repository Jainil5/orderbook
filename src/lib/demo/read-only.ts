/**
 * This build is a showcase: the seeded CSV packs are the whole dataset, so the
 * workspace never creates rows. Caps double as the contract the packs are built
 * against, and as the ceiling for anything written to the demo cookies.
 */
export const DEMO_LIMITS = {
  /** orders, quotations and credit notes combined */
  orders: 30,
  products: 15,
  customers: 10,
  payments: 30,
} as const;

export const DEMO_READ_ONLY_MESSAGE =
  "Demo data is read-only — this showcase ships a fixed dataset, so records cannot be added.";

export function readOnlyError() {
  return { ok: false as const, error: DEMO_READ_ONLY_MESSAGE };
}

export function readOnlyMessage() {
  return { ok: false as const, message: DEMO_READ_ONLY_MESSAGE };
}
