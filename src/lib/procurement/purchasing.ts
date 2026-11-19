import type { InventoryPosition } from "@/lib/inventory/stock";
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  Vendor,
  VendorPaymentTerm,
} from "@/types/procurement";
import { VENDOR_PAYMENT_TERMS } from "@/types/procurement";

/**
 * Pure purchasing maths: what a vendor order is worth, how much of it has
 * arrived, what the shelf can expect, and when an order has gone stale. No
 * cookies and no packs are read here, so the demo writers, the screens and the
 * tests all agree on the same numbers.
 */

export const PURCHASE_ORDER_PREFIX = "PO-";

export const VENDOR_PAYMENT_TERM_LABELS: Record<VendorPaymentTerm, string> = {
  cash: "Cash on delivery",
  upi: "UPI on delivery",
  net_15: "Net 15",
  net_30: "Net 30",
};

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_received: "Partly received",
  received: "Received",
  cancelled: "Cancelled",
};

/** Orders still expected to bring goods in — the ones stock is promised on. */
const OPEN_STATUSES: PurchaseOrderStatus[] = ["sent", "partially_received"];

const PACK_DP = 3;

function round(value: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function poLinesFor(
  poId: string,
  lines: readonly PurchaseOrderLine[],
): PurchaseOrderLine[] {
  return lines.filter((line) => line.po_id === poId);
}

export type PurchaseOrderTotals = {
  lines: number;
  packs: number;
  receivedPacks: number;
  outstandingPacks: number;
  /** Quoted value of everything ordered. */
  value: number;
  /** Quoted value of what has actually arrived. */
  receivedValue: number;
  outstandingValue: number;
};

export function poTotals(lines: readonly PurchaseOrderLine[]): PurchaseOrderTotals {
  let packs = 0;
  let receivedPacks = 0;
  for (const line of lines) {
    packs += line.packs;
    receivedPacks += line.received_packs;
  }
  const value = round(
    lines.reduce((sum, line) => sum + line.packs * line.cost_per_pack, 0),
    2,
  );
  const receivedValue = round(
    lines.reduce((sum, line) => sum + line.received_packs * line.cost_per_pack, 0),
    2,
  );
  return {
    lines: lines.length,
    packs: round(packs, PACK_DP),
    receivedPacks: round(receivedPacks, PACK_DP),
    outstandingPacks: round(packs - receivedPacks, PACK_DP),
    value,
    receivedValue,
    outstandingValue: round(value - receivedValue, 2),
  };
}

/** How much of one line is still to arrive. */
export function lineOutstanding(line: PurchaseOrderLine): number {
  return round(Math.max(0, line.packs - line.received_packs), PACK_DP);
}

export function poIsComplete(lines: readonly PurchaseOrderLine[]): boolean {
  return lines.length > 0 && lines.every((line) => lineOutstanding(line) <= 0);
}

/**
 * The status a receipt leaves behind. It is derived from the lines rather than
 * typed, so a half-delivered van cannot be filed as fully received.
 */
export function statusAfterReceipt(
  lines: readonly PurchaseOrderLine[],
): Extract<PurchaseOrderStatus, "partially_received" | "received"> {
  return poIsComplete(lines) ? "received" : "partially_received";
}

/** Next document number, keyed on the numeric tail of existing numbers. */
export function nextPoNumber(orders: readonly PurchaseOrder[]): string {
  let max = 1040;
  for (const po of orders) {
    const tail = Number(po.number.replace(/\D+/g, ""));
    if (Number.isFinite(tail) && tail > max) max = tail;
  }
  return `${PURCHASE_ORDER_PREFIX}${max + 1}`;
}

/** An order the vendor is late on: promised, not closed, date gone by. */
export function isPurchaseOrderLate(po: PurchaseOrder, now: Date): boolean {
  if (!OPEN_STATUSES.includes(po.status) || !po.expected_at) return false;
  return new Date(po.expected_at).getTime() < now.getTime();
}

/** Days between sending and the promised delivery — the vendor's word in days. */
export function expectedDeliveryIso(sentAt: string, leadTimeDays: number): string {
  const days = Math.max(0, Math.round(leadTimeDays));
  return new Date(new Date(sentAt).getTime() + days * 86_400_000).toISOString();
}

export type ReceiveCheck = { ok: true; packs: number } | { ok: false; message: string };

/**
 * Guard a receipt before anything is written: the order has to be one the
 * vendor is actually delivering, the line has to exist on it, and the quantity
 * cannot exceed what is still outstanding. Over-receipt is refused rather than
 * silently booked, because a pack that never arrived must not appear on a shelf.
 */
export function checkReceipt(
  po: PurchaseOrder,
  lines: readonly PurchaseOrderLine[],
  lineId: string,
  rawPacks: number | string,
): ReceiveCheck {
  if (!OPEN_STATUSES.includes(po.status)) {
    return { ok: false, message: "Only a sent order can receive goods." };
  }
  const line = lines.find((row) => row.id === lineId && row.po_id === po.id);
  if (!line) return { ok: false, message: "That line is not on this order." };
  const packs = typeof rawPacks === "number" ? rawPacks : Number(rawPacks);
  if (!Number.isFinite(packs) || packs <= 0) {
    return { ok: false, message: "Enter how many packs arrived." };
  }
  const remaining = lineOutstanding(line);
  if (remaining <= 0) {
    return { ok: false, message: `${line.item_name} is already fully received.` };
  }
  const whole = round(packs, PACK_DP);
  if (whole > remaining) {
    return {
      ok: false,
      message: `Only ${remaining} pack${remaining === 1 ? "" : "s"} left to receive on ${line.item_name}.`,
    };
  }
  return { ok: true, packs: whole };
}

/** Packs promised per stock item across every open order. */
export function incomingPacksByItem(
  orders: readonly PurchaseOrder[],
  lines: readonly PurchaseOrderLine[],
): Map<string, number> {
  const open = new Set(
    orders.filter((po) => OPEN_STATUSES.includes(po.status)).map((po) => po.id),
  );
  const map = new Map<string, number>();
  for (const line of lines) {
    if (!open.has(line.po_id)) continue;
    const waiting = lineOutstanding(line);
    if (waiting <= 0) continue;
    map.set(line.item_id, round((map.get(line.item_id) ?? 0) + waiting, PACK_DP));
  }
  return map;
}

export type ReorderRow = {
  position: InventoryPosition;
  /** Packs still owed on open orders. */
  incoming: number;
  /** Cover to keep above the reorder line, not just on it. */
  target: number;
  shortBy: number;
  /** Packs to order, rounded up to whole packs. */
  suggestPacks: number;
};

/**
 * What to buy, given the shelf count and what the vendor already has coming.
 * `coverPacks` sets the target above the reorder line so a suggestion is a real
 * cushion, not a line that touches the floor and stays low.
 */
export function reorderSuggestions(
  positions: readonly InventoryPosition[],
  incoming: ReadonlyMap<string, number>,
  coverPacks = 2,
): ReorderRow[] {
  const rows: ReorderRow[] = [];
  for (const position of positions) {
    const onOrder = incoming.get(position.item.id) ?? 0;
    const target = round(position.item.low_stock_packs + coverPacks, PACK_DP);
    const have = round(position.packs + onOrder, PACK_DP);
    const shortBy = round(target - have, PACK_DP);
    if (shortBy <= 0) continue;
    rows.push({
      position,
      incoming: onOrder,
      target,
      shortBy,
      suggestPacks: Math.ceil(shortBy),
    });
  }
  return rows.sort(
    (a, b) =>
      b.shortBy - a.shortBy ||
      a.position.item.name.localeCompare(b.position.item.name),
  );
}

export type PurchaseOrderView = {
  po: PurchaseOrder;
  /** Null when the vendor row was removed after the order was placed. */
  vendor: Vendor | null;
  lines: PurchaseOrderLine[];
  totals: PurchaseOrderTotals;
  late: boolean;
};

/** Header, vendor, lines and maths in one read — newest order first. */
export function purchaseOrderViews(
  orders: readonly PurchaseOrder[],
  lines: readonly PurchaseOrderLine[],
  vendors: readonly Vendor[],
  now: Date,
): PurchaseOrderView[] {
  return orders
    .map((po) => {
      const own = poLinesFor(po.id, lines);
      return {
        po,
        vendor: vendors.find((v) => v.id === po.vendor_id) ?? null,
        lines: own,
        totals: poTotals(own),
        late: isPurchaseOrderLate(po, now),
      };
    })
    .sort(
      (a, b) =>
        new Date(b.po.created_at).getTime() - new Date(a.po.created_at).getTime(),
    );
}

export type VendorInput = {
  name: string;
  category?: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  lead_time_days: number | string;
  payment_terms: string;
  rating?: number | string;
  note?: string;
};

export type ValidatedVendor = Omit<Vendor, "id" | "brand_id" | "active">;

export function validateVendorInput(
  input: VendorInput,
): { ok: true; value: ValidatedVendor } | { ok: false; message: string } {
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, message: "Vendor name is required." };
  const lead = Math.round(Number(input.lead_time_days));
  if (!Number.isFinite(lead) || lead < 0 || lead > 120) {
    return { ok: false, message: "Lead time must be 0–120 days." };
  }
  const terms = input.payment_terms as VendorPaymentTerm;
  if (!VENDOR_PAYMENT_TERMS.includes(terms)) {
    return { ok: false, message: "Pick valid payment terms." };
  }
  const rawRating = input.rating === "" || input.rating == null ? null : Number(input.rating);
  const rating =
    rawRating == null || !Number.isFinite(rawRating)
      ? null
      : round(Math.min(5, Math.max(1, rawRating)), 1);
  return {
    ok: true,
    value: {
      name,
      category: input.category?.trim().slice(0, 40) || null,
      contact_name: input.contact_name?.trim().slice(0, 60) || null,
      phone: input.phone?.trim().slice(0, 20) || null,
      email: input.email?.trim().slice(0, 80) || null,
      lead_time_days: lead,
      payment_terms: terms,
      rating,
      note: input.note?.trim().slice(0, 200) || null,
    },
  };
}

export type PurchaseOrderLineInput = {
  itemId: string;
  packs: number | string;
  costPerPack: number | string;
};

export type PurchaseOrderInput = {
  vendorId: string;
  expectedAt?: string;
  note?: string;
  lines: PurchaseOrderLineInput[];
};

export type ValidatedPurchaseOrderLine = {
  item_id: string;
  item_name: string;
  unit: string;
  packs: number;
  cost_per_pack: number;
};

export type ValidatedPurchaseOrder = {
  vendor_id: string;
  expected_at: string | null;
  note: string | null;
  lines: ValidatedPurchaseOrderLine[];
};

/**
 * A purchase order is only as good as its lines: one stock item per row, a
 * positive pack count, and a price the brand is actually paying for it.
 */
export function validatePurchaseOrderInput(
  input: PurchaseOrderInput,
  known: {
    vendorIds: string[];
    items: { id: string; name: string; unit: string; cost_per_pack: number }[];
  },
): { ok: true; value: ValidatedPurchaseOrder } | { ok: false; message: string } {
  if (!known.vendorIds.includes(input.vendorId)) {
    return { ok: false, message: "Pick a vendor." };
  }
  if (!input.lines.length) return { ok: false, message: "Add at least one item." };
  const lines: ValidatedPurchaseOrderLine[] = [];
  const seen = new Set<string>();
  for (const row of input.lines) {
    const item = known.items.find((candidate) => candidate.id === row.itemId);
    if (!item) return { ok: false, message: "Every line needs a stock item." };
    if (seen.has(item.id)) {
      return { ok: false, message: `${item.name} appears twice — use one line per item.` };
    }
    seen.add(item.id);
    const packs = round(Number(row.packs), PACK_DP);
    if (!Number.isFinite(packs) || packs <= 0 || packs > 9999) {
      return { ok: false, message: `${item.name}: enter 1–9999 packs.` };
    }
    const costPerPack = round(Number(row.costPerPack), 2);
    if (!Number.isFinite(costPerPack) || costPerPack < 0) {
      return { ok: false, message: `${item.name}: enter a pack price.` };
    }
    lines.push({
      item_id: item.id,
      item_name: item.name,
      unit: item.unit,
      packs,
      cost_per_pack: costPerPack,
    });
  }
  let expectedAt: string | null = null;
  if (input.expectedAt) {
    const date = new Date(input.expectedAt);
    if (Number.isNaN(date.getTime())) return { ok: false, message: "Enter a valid expected date." };
    expectedAt = date.toISOString();
  }
  return {
    ok: true,
    value: {
      vendor_id: input.vendorId,
      expected_at: expectedAt,
      note: input.note?.trim().slice(0, 200) || null,
      lines,
    },
  };
}
