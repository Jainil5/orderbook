/**
 * This build is a showcase: the seeded CSV packs are the whole dataset, so the
 * workspace never creates transactional rows. Caps double as the contract the
 * packs are built against, and as the ceiling for anything written to the demo
 * cookies.
 *
 * The CRM is the one documented exception — relationship records (interactions,
 * reviews, complaints, segments, campaigns, loyalty entries) are created in the
 * browser and stored in the per-brand mutable cookie. Orders, products,
 * customers-as-billed and payments still refuse adds.
 */
export const DEMO_LIMITS = {
  /** orders, quotations and credit notes combined */
  orders: 30,
  products: 15,
  customers: 10,
  payments: 30,
  /** CRM collections: seeded rows plus whatever one browser session layers on. */
  interactions: 80,
  reviews: 40,
  complaints: 40,
  segments: 30,
  campaigns: 30,
  loyaltyLedger: 120,
  memberships: 40,
} as const;

export const DEMO_READ_ONLY_MESSAGE =
  "Demo data is read-only — this showcase ships a fixed dataset, so records cannot be added.";

export function readOnlyError() {
  return { ok: false as const, error: DEMO_READ_ONLY_MESSAGE };
}

export function readOnlyMessage() {
  return { ok: false as const, message: DEMO_READ_ONLY_MESSAGE };
}
