/**
 * Purchasing — the two things a brand buys with: the vendors it buys from, and
 * the purchase orders placed on them. Stock movements themselves stay in
 * `InventoryAdjustment` (kind `purchase`), so receiving goods writes into the
 * same ledger the shelf counts already read.
 */

export const VENDOR_PAYMENT_TERMS = ["cash", "upi", "net_15", "net_30"] as const;
export type VendorPaymentTerm = (typeof VENDOR_PAYMENT_TERMS)[number];

export type Vendor = {
  id: string;
  brand_id: string;
  name: string;
  /** What they supply — "Dairy", "Packaging", "Wood & boards". */
  category: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  /** Typical days between sending an order and the van arriving. */
  lead_time_days: number;
  payment_terms: VendorPaymentTerm;
  /** The merchant's own 1–5 note on reliability; null means unrated. */
  rating: number | null;
  note: string | null;
  active: boolean;
};

export const PURCHASE_ORDER_STATUSES = [
  "draft",
  "sent",
  "partially_received",
  "received",
  "cancelled",
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export type PurchaseOrder = {
  id: string;
  brand_id: string;
  /** Human document number, e.g. `PO-1041`. */
  number: string;
  vendor_id: string;
  status: PurchaseOrderStatus;
  created_at: string;
  sent_at: string | null;
  /** When the vendor promised the goods. Drives the late flag. */
  expected_at: string | null;
  closed_at: string | null;
  note: string | null;
};

export type PurchaseOrderLine = {
  id: string;
  brand_id: string;
  po_id: string;
  item_id: string;
  /** Copied at write time, so a renamed stock item never rewrites history. */
  item_name: string;
  unit: string;
  packs: number;
  received_packs: number;
  cost_per_pack: number;
};
