"use server";

import { revalidatePath } from "next/cache";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { mergeDemoInventory } from "@/lib/demo/merge-entities";
import {
  appendDemoAudit,
  readDemoMutableBucket,
  updateDemoMutableBucket,
  type DemoMutableBucket,
} from "@/lib/demo/mutable-store";
import {
  loadDemoPurchasing,
  mergePurchasing,
  type DemoPurchasing,
} from "@/lib/demo/procurement-data";
import { DEMO_LIMITS } from "@/lib/demo/read-only";
import { newOpsId } from "@/lib/manager/ops-shared";
import {
  checkReceipt,
  expectedDeliveryIso,
  lineOutstanding,
  nextPoNumber,
  poLinesFor,
  statusAfterReceipt,
  validatePurchaseOrderInput,
  validateVendorInput,
  type PurchaseOrderInput,
  type VendorInput,
} from "@/lib/procurement/purchasing";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { InventoryAdjustment } from "@/types/database";
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  Vendor,
} from "@/types/procurement";

/**
 * Purchasing writes. Like every other demo surface these land in the
 * per-browser mutable bucket rather than a database, and they are deliberately
 * as strict as a real ledger would be: a receipt only books what the vendor
 * actually delivered, and the shelf movement it creates goes through the same
 * `inventoryLedger` the stock screens already read.
 */

type Result = { ok: true } | { ok: false; message: string };
type Guard = { ok: true; code: DemoBrandCode } | { ok: false; message: string };
type BucketKey = keyof DemoPurchasing;
type OverrideKey =
  | "vendorOverrides"
  | "purchaseOrderOverrides"
  | "purchaseOrderLineOverrides";

async function guard(): Promise<Guard> {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false, message: "Not signed in." };
  const { cookies } = await import("next/headers");
  const { DEMO_WORKSPACE_COOKIE, parseDemoBrandCodeFromCookie } = await import(
    "@/lib/workspace/constants"
  );
  const cookieStore = await cookies();
  const code =
    parseDemoBrandCodeFromCookie(cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value) ??
    "BR-1";
  return { ok: true, code };
}

async function current(code: DemoBrandCode): Promise<DemoPurchasing> {
  return mergePurchasing(getDemoBrandPack(code), await readDemoMutableBucket(code));
}

function revalidatePurchasing() {
  revalidatePath("/manager");
  revalidatePath("/manager/purchasing");
  revalidatePath("/products");
}

async function patch(
  code: DemoBrandCode,
  key: OverrideKey,
  id: string,
  value: Record<string, unknown>,
): Promise<void> {
  await updateDemoMutableBucket(code, (bucket) => {
    const overrides = { ...(bucket[key] ?? {}) } as Record<string, unknown>;
    overrides[id] = { ...(overrides[id] as object), ...value };
    return { ...bucket, [key]: overrides } as DemoMutableBucket;
  });
}

/** Append at the head, recycling the oldest browser-created row past the cap. */
async function insert<T extends { id: string }>(
  code: DemoBrandCode,
  listKey: BucketKey,
  overrideKey: OverrideKey,
  cap: number,
  rows: T[],
): Promise<void> {
  await updateDemoMutableBucket(code, (bucket) => {
    const existing = (bucket[listKey] ?? []) as unknown as T[];
    const next = [...rows, ...existing];
    const dropped: string[] = [];
    while (next.length > cap) dropped.push(next.pop()!.id);
    if (!dropped.length) return { ...bucket, [listKey]: next } as DemoMutableBucket;
    const overrides = { ...(bucket[overrideKey] ?? {}) } as Record<string, unknown>;
    for (const id of dropped) delete overrides[id];
    return { ...bucket, [listKey]: next, [overrideKey]: overrides } as DemoMutableBucket;
  });
}

async function audit(
  code: DemoBrandCode,
  action: string,
  entity: string,
  id: string,
  detail: string,
) {
  const pack = getDemoBrandPack(code);
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
    action,
    entity_type: entity,
    entity_id: id,
    detail,
  });
}

// --- Vendors ---------------------------------------------------------------

export async function saveVendorAction(id: string | null, input: VendorInput): Promise<Result> {
  const checked = await guard();
  if (!checked.ok) return checked;
  const parsed = validateVendorInput(input);
  if (!parsed.ok) return parsed;
  const pack = getDemoBrandPack(checked.code);
  if (!id) {
    const vendor: Vendor = {
      id: newOpsId("demo-vendor"),
      brand_id: pack.brand.id,
      active: true,
      ...parsed.value,
    };
    await insert(checked.code, "vendors", "vendorOverrides", DEMO_LIMITS.vendors, [vendor]);
    await audit(checked.code, "vendor.create", "vendor", vendor.id, vendor.name);
  } else {
    const { vendors } = await current(checked.code);
    if (!vendors.some((vendor) => vendor.id === id)) {
      return { ok: false, message: "Vendor not found." };
    }
    await patch(checked.code, "vendorOverrides", id, parsed.value);
    await audit(checked.code, "vendor.update", "vendor", id, parsed.value.name);
  }
  revalidatePurchasing();
  return { ok: true };
}

export async function deleteVendorAction(id: string): Promise<Result> {
  const checked = await guard();
  if (!checked.ok) return checked;
  const { vendors, purchaseOrders } = await current(checked.code);
  if (!vendors.some((vendor) => vendor.id === id)) {
    return { ok: false, message: "Vendor not found." };
  }
  const open = purchaseOrders.filter(
    (po) => po.vendor_id === id && ["sent", "partially_received", "draft"].includes(po.status),
  );
  if (open.length) {
    return {
      ok: false,
      message: `${open[0].number} is still open with this vendor. Close it first.`,
    };
  }
  await patch(checked.code, "vendorOverrides", id, { deleted: true });
  const name = vendors.find((vendor) => vendor.id === id)?.name ?? id;
  await audit(checked.code, "vendor.delete", "vendor", id, name);
  revalidatePurchasing();
  return { ok: true };
}

// --- Purchase orders -------------------------------------------------------

export async function createPurchaseOrderAction(input: PurchaseOrderInput): Promise<Result> {
  const checked = await guard();
  if (!checked.ok) return checked;
  const code = checked.code;
  const pack = getDemoBrandPack(code);
  const { vendors, items } = await knownTargets(code);
  const parsed = validatePurchaseOrderInput(input, {
    vendorIds: vendors.map((vendor) => vendor.id),
    items,
  });
  if (!parsed.ok) return parsed;
  const { purchaseOrders } = await current(code);
  const now = new Date().toISOString();
  const po: PurchaseOrder = {
    id: newOpsId("demo-po"),
    brand_id: pack.brand.id,
    number: nextPoNumber(purchaseOrders),
    vendor_id: parsed.value.vendor_id,
    status: "draft",
    created_at: now,
    sent_at: null,
    expected_at: parsed.value.expected_at,
    closed_at: null,
    note: parsed.value.note,
  };
  const lines: PurchaseOrderLine[] = parsed.value.lines.map((line) => ({
    id: newOpsId("demo-po-line"),
    brand_id: pack.brand.id,
    po_id: po.id,
    item_id: line.item_id,
    item_name: line.item_name,
    unit: line.unit,
    packs: line.packs,
    received_packs: 0,
    cost_per_pack: line.cost_per_pack,
  }));
  await insert(code, "purchaseOrders", "purchaseOrderOverrides", DEMO_LIMITS.purchaseOrders, [po]);
  await insert(
    code,
    "purchaseOrderLines",
    "purchaseOrderLineOverrides",
    DEMO_LIMITS.purchaseOrderLines,
    lines,
  );
  await audit(code, "purchase_order.create", "purchase_order", po.id, `${po.number} · ${lines.length} lines`);
  revalidatePurchasing();
  return { ok: true };
}

export async function sendPurchaseOrderAction(id: string): Promise<Result> {
  const checked = await guard();
  if (!checked.ok) return checked;
  const code = checked.code;
  const { purchaseOrders, purchaseOrderLines, vendors } = await current(code);
  const po = purchaseOrders.find((row) => row.id === id);
  if (!po) return { ok: false, message: "Order not found." };
  if (po.status !== "draft") {
    return { ok: false, message: "Only a draft order can be sent." };
  }
  if (!poLinesFor(po.id, purchaseOrderLines).length) {
    return { ok: false, message: "Add at least one item before sending." };
  }
  const vendor = vendors.find((row) => row.id === po.vendor_id) ?? null;
  const now = new Date().toISOString();
  await patch(code, "purchaseOrderOverrides", po.id, {
    status: "sent",
    sent_at: now,
    expected_at: po.expected_at ?? expectedDeliveryIso(now, vendor?.lead_time_days ?? 0),
  });
  await audit(code, "purchase_order.send", "purchase_order", po.id, po.number);
  revalidatePurchasing();
  return { ok: true };
}

/**
 * Book what the van actually delivered. The line gains the packs, the order
 * status follows the lines, and one `purchase` movement is written per receipt
 * so the shelf count and the audit trail move together.
 */
export async function receivePurchaseOrderLineAction(
  poId: string,
  lineId: string,
  packs: number | string,
): Promise<Result> {
  const checked = await guard();
  if (!checked.ok) return checked;
  const code = checked.code;
  const { purchaseOrders, purchaseOrderLines } = await current(code);
  const po = purchaseOrders.find((row) => row.id === poId);
  if (!po) return { ok: false, message: "Order not found." };
  const lines = poLinesFor(po.id, purchaseOrderLines);
  const verdict = checkReceipt(po, lines, lineId, packs);
  if (!verdict.ok) return verdict;
  const line = lines.find((row) => row.id === lineId)!;
  const received = Math.round((line.received_packs + verdict.packs) * 1000) / 1000;
  const nextLines = lines.map((row) =>
    row.id === line.id ? { ...row, received_packs: received } : row,
  );
  const status = statusAfterReceipt(nextLines);
  const pack = getDemoBrandPack(code);
  const item = mergeDemoInventory(pack.inventory, await readDemoMutableBucket(code)).find(
    (row) => row.id === line.item_id,
  );

  await patch(code, "purchaseOrderLineOverrides", line.id, { received_packs: received });
  await patch(code, "purchaseOrderOverrides", po.id, {
    status,
    closed_at: status === "received" ? new Date().toISOString() : po.closed_at,
  });
  const movement: InventoryAdjustment = {
    id: newOpsId("demo-inv-move"),
    brand_id: pack.brand.id,
    item_id: line.item_id,
    delta_packs: verdict.packs,
    kind: "purchase",
    cost: Math.round(verdict.packs * line.cost_per_pack * 100) / 100,
    note: `${po.number}${item ? ` · ${item.name}` : ""}`,
    created_at: new Date().toISOString(),
  };
  await updateDemoMutableBucket(code, (bucket) => ({
    ...bucket,
    inventoryLedger: [movement, ...bucket.inventoryLedger].slice(
      0,
      DEMO_LIMITS.inventoryLedger,
    ),
  }));
  await audit(
    code,
    "purchase_order.receive",
    "purchase_order",
    po.id,
    `${po.number} · +${verdict.packs} packs ${line.item_name}`,
  );
  revalidatePurchasing();
  return { ok: true };
}

/**
 * Stop expecting more goods. Anything already received stays on the shelf and
 * in the ledger — cancelling a document never unwinds a movement.
 */
export async function cancelPurchaseOrderAction(id: string): Promise<Result> {
  const checked = await guard();
  if (!checked.ok) return checked;
  const code = checked.code;
  const { purchaseOrders } = await current(code);
  const po = purchaseOrders.find((row) => row.id === id);
  if (!po) return { ok: false, message: "Order not found." };
  if (po.status === "received" || po.status === "cancelled") {
    return { ok: false, message: "This order is already closed." };
  }
  await patch(code, "purchaseOrderOverrides", po.id, {
    status: "cancelled",
    closed_at: new Date().toISOString(),
  });
  await audit(code, "purchase_order.cancel", "purchase_order", po.id, po.number);
  revalidatePurchasing();
  return { ok: true };
}

/** Throw away a draft or a cancelled order, lines and all. */
export async function deletePurchaseOrderAction(id: string): Promise<Result> {
  const checked = await guard();
  if (!checked.ok) return checked;
  const code = checked.code;
  const { purchaseOrders, purchaseOrderLines } = await current(code);
  const po = purchaseOrders.find((row) => row.id === id);
  if (!po) return { ok: false, message: "Order not found." };
  if (po.status !== "draft" && po.status !== "cancelled") {
    return { ok: false, message: "Only a draft or cancelled order can be deleted." };
  }
  const lines = poLinesFor(po.id, purchaseOrderLines);
  const outstanding = lines.reduce((sum, row) => sum + lineOutstanding(row), 0);
  await patch(code, "purchaseOrderOverrides", po.id, { deleted: true });
  await updateDemoMutableBucket(code, (bucket) => {
    const overrides = { ...(bucket.purchaseOrderLineOverrides ?? {}) } as Record<
      string,
      Record<string, unknown>
    >;
    for (const line of lines) {
      overrides[line.id] = { ...(overrides[line.id] ?? {}), deleted: true };
    }
    return { ...bucket, purchaseOrderLineOverrides: overrides } as DemoMutableBucket;
  });
  await audit(
    code,
    "purchase_order.delete",
    "purchase_order",
    po.id,
    `${po.number} · ${lines.length} lines${outstanding > 0 ? ` · ${outstanding} packs never delivered` : ""}`,
  );
  revalidatePurchasing();
  return { ok: true };
}

/** Active stock items, as the only things a purchase line may point at. */
async function knownTargets(code: DemoBrandCode) {
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  const purchasing = await loadDemoPurchasing(code);
  return {
    vendors: purchasing.vendors.filter((vendor) => vendor.active),
    items: mergeDemoInventory(pack.inventory, bucket).map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      cost_per_pack: item.cost_per_pack,
    })),
  };
}
