import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { PurchaseOrder, Supplier } from "@/types/business";

/**
 * Seeded suppliers and purchase orders per demo brand (Products Manager →
 * Procurement). Owned by the Products Manager feature area — replace these
 * starter rows with a full purchasing history rather than adding another data
 * source.
 */

type Pack = { suppliers: Supplier[]; purchaseOrders: PurchaseOrder[] };

const CAFE: Pack = { suppliers: [], purchaseOrders: [] };
const FURNITURE: Pack = { suppliers: [], purchaseOrders: [] };

const PACKS: Record<DemoBrandCode, Pack> = {
  "BR-1": CAFE,
  "BR-2": FURNITURE,
};

export function demoSuppliers(brandCode: DemoBrandCode): Supplier[] {
  return PACKS[brandCode]?.suppliers ?? [];
}

export function demoPurchaseOrders(brandCode: DemoBrandCode): PurchaseOrder[] {
  return PACKS[brandCode]?.purchaseOrders ?? [];
}
