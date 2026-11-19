import { getDemoBrandPack } from "@/lib/demo/brands";
import {
  readDemoMutableBucket,
  type DemoMutableBucket,
} from "@/lib/demo/mutable-store";
import { mergeOpsEntities } from "@/lib/manager/ops-shared";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  Vendor,
} from "@/types/procurement";

/**
 * Everything the purchasing screens read: seeded pack rows plus whatever this
 * browser has layered on top, in the same merge the other manager modules use.
 */
export type DemoPurchasing = {
  vendors: Vendor[];
  purchaseOrders: PurchaseOrder[];
  purchaseOrderLines: PurchaseOrderLine[];
};

export function mergePurchasing(
  pack: ReturnType<typeof getDemoBrandPack>,
  bucket: DemoMutableBucket,
): DemoPurchasing {
  const vendors = mergeOpsEntities(
    pack.vendors ?? [],
    bucket.vendors ?? [],
    bucket.vendorOverrides ?? {},
  ).sort((a, b) => a.name.localeCompare(b.name));
  const purchaseOrders = mergeOpsEntities(
    pack.purchaseOrders ?? [],
    bucket.purchaseOrders ?? [],
    bucket.purchaseOrderOverrides ?? {},
  );
  const purchaseOrderLines = mergeOpsEntities(
    pack.purchaseOrderLines ?? [],
    bucket.purchaseOrderLines ?? [],
    bucket.purchaseOrderLineOverrides ?? {},
  );
  return { vendors, purchaseOrders, purchaseOrderLines };
}

export async function loadDemoPurchasing(
  brandCode?: DemoBrandCode,
): Promise<DemoPurchasing> {
  const code = brandCode ?? "BR-1";
  return mergePurchasing(getDemoBrandPack(code), await readDemoMutableBucket(code));
}

export async function listDemoVendors(
  brandCode?: DemoBrandCode,
): Promise<Vendor[]> {
  return (await loadDemoPurchasing(brandCode)).vendors;
}

export async function listDemoPurchaseOrders(
  brandCode?: DemoBrandCode,
): Promise<PurchaseOrder[]> {
  return (await loadDemoPurchasing(brandCode)).purchaseOrders;
}
