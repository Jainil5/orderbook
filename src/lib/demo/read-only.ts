/**
 * This build is a showcase: the seeded CSV packs are the base dataset, so
 * transactional rows are not written to any database. Records created in the
 * workspace land in the per-browser mutable cookie store instead, and the caps
 * below bound how much each browser can layer on top of the seeds. Caps double
 * as the contract the packs are built against.
 *
 * Creating is allowed everywhere; only the collection caps say no, with a
 * message that explains how to reset. Orders, quotations and credit notes share
 * one combined cap and the oldest browser-created document is recycled to make
 * room, so the seeded history the showcase stats are asserted against is never
 * dropped.
 */
export const DEMO_LIMITS = {
  /** browser-created orders, quotations and credit notes combined */
  orders: 30,
  products: 15,
  customers: 10,
  payments: 30,
  offers: 15,
  /** CRM collections: seeded rows plus whatever one browser session layers on. */
  interactions: 80,
  reviews: 40,
  complaints: 40,
  segments: 30,
  campaigns: 30,
  loyaltyLedger: 120,
  memberships: 40,
  /** Manager modules. */
  staff: 15,
  services: 15,
  serviceJobs: 30,
  appointments: 40,
  tasks: 40,
  shifts: 60,
  visits: 40,
  leads: 40,
  /** Ledger-ish logs: trimmed silently, never a hard stop. */
  stockAdjustments: 40,
  refunds: 30,
  /** Kitchen/workshop stock: items a session adds on top of the pack. */
  inventory: 40,
  /** Purchases, wastage and per-order consumption. Trimmed, not blocked. */
  inventoryLedger: 120,
  /** Purchasing: vendors, and the orders placed on them. */
  vendors: 20,
  purchaseOrders: 30,
  purchaseOrderLines: 120,
} as const;

export const DEMO_LIMIT_MESSAGE =
  "The demo keeps a bounded dataset per browser, and this collection is full. Clear this site's cookies to reset it.";

export function limitMessage(what: string) {
  return `${what} — ${DEMO_LIMIT_MESSAGE}`;
}

export function readOnlyError() {
  return { ok: false as const, error: DEMO_LIMIT_MESSAGE };
}

export function readOnlyMessage() {
  return { ok: false as const, message: DEMO_LIMIT_MESSAGE };
}
