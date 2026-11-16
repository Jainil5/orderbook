import type {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  Supplier,
} from "@/types/business";

/**
 * Purchase-order rules for Products Manager → Procurement.
 *
 * Pure domain module: no data loading, no Next imports, so the receiving and
 * status rules can be unit tested and reused by both the panels and the server
 * actions.
 */

export const PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = [
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
];

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

/** draft → ordered → partially_received → received; cancelled from anything open. */
export const PURCHASE_ORDER_TRANSITIONS: Record<
  PurchaseOrderStatus,
  PurchaseOrderStatus[]
> = {
  draft: ["ordered", "cancelled"],
  ordered: ["partially_received", "received", "cancelled"],
  partially_received: ["received", "cancelled"],
  received: [],
  cancelled: [],
};

export function canTransitionPurchaseOrder(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): boolean {
  return PURCHASE_ORDER_TRANSITIONS[from].includes(to);
}

export function nextPurchaseOrderStatus(
  status: PurchaseOrderStatus,
): PurchaseOrderStatus | null {
  const flow = PURCHASE_ORDER_TRANSITIONS[status].filter(
    (s) => s !== "cancelled",
  );
  return flow[0] ?? null;
}

/** Why a status change is not allowed, or null when it is. */
export function purchaseOrderTransitionError(
  order: PurchaseOrder,
  to: PurchaseOrderStatus,
): string | null {
  if (to === order.status) {
    return `Purchase order is already ${PURCHASE_ORDER_STATUS_LABELS[to].toLowerCase()}.`;
  }
  if (!canTransitionPurchaseOrder(order.status, to)) {
    return `Purchase orders cannot move from ${PURCHASE_ORDER_STATUS_LABELS[order.status]} to ${PURCHASE_ORDER_STATUS_LABELS[to]}.`;
  }
  if (to === "ordered" && !order.supplierId) {
    return "Pick the supplier before placing the order.";
  }
  if (to === "ordered" && order.lines.length === 0) {
    return "Add at least one line before placing the order.";
  }
  if (to === "received" && outstandingUnits(order) > 0) {
    return "Receive the remaining lines before marking the order received.";
  }
  return null;
}

export function linePendingQty(line: PurchaseOrderLine): number {
  return Math.max(line.qty - line.receivedQty, 0);
}

export function lineTotal(line: PurchaseOrderLine): number {
  return Math.round(line.qty * line.unitCost * 100) / 100;
}

export type PurchaseOrderTotals = {
  lines: number;
  units: number;
  cost: number;
  receivedUnits: number;
  outstandingUnits: number;
  progressPercent: number;
};

export function purchaseOrderTotals(order: PurchaseOrder): PurchaseOrderTotals {
  let units = 0;
  let cost = 0;
  let receivedUnits = 0;
  for (const line of order.lines) {
    units += line.qty;
    cost += line.qty * line.unitCost;
    receivedUnits += Math.min(line.receivedQty, line.qty);
  }
  const outstandingUnits = Math.max(units - receivedUnits, 0);
  return {
    lines: order.lines.length,
    units,
    cost: Math.round(cost * 100) / 100,
    receivedUnits,
    outstandingUnits,
    progressPercent: units > 0 ? Math.round((receivedUnits / units) * 100) : 0,
  };
}

export function outstandingUnits(order: PurchaseOrder): number {
  return purchaseOrderTotals(order).outstandingUnits;
}

/** Placed but not closed — the one definition of "open" used across this area. */
export function isOpenPurchaseOrder(order: PurchaseOrder): boolean {
  return order.status === "ordered" || order.status === "partially_received";
}

/** Only drafts have editable lines; placed orders are a record of what was bought. */
export function canEditPurchaseOrderLines(order: PurchaseOrder): boolean {
  return order.status === "draft";
}

/** `YYYY-MM-DD` plus whole days, staying on the calendar-day level. */
export function addDaysToDay(day: string, days: number): string {
  const stamp = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(stamp) || !Number.isFinite(days)) return day;
  return new Date(stamp + days * 86_400_000).toISOString().slice(0, 10);
}

/** Expected delivery from the supplier's lead time when none was entered. */
export function expectedDeliveryDay(
  orderDay: string,
  supplier: Supplier | null,
): string | null {
  const lead = supplier?.leadTimeDays;
  if (lead == null || lead < 0) return null;
  return addDaysToDay(orderDay, Math.round(lead));
}

export function isPurchaseOrderOverdue(
  order: PurchaseOrder,
  todayDay: string,
): boolean {
  if (!order.expectedOn) return false;
  if (order.status === "received" || order.status === "cancelled") return false;
  return order.expectedOn < todayDay;
}

/** Reason the lines cannot be saved, or null when they are valid. */
export function validatePurchaseOrderLines(
  lines: PurchaseOrderLine[],
  knownProductIds: readonly string[],
): string | null {
  if (lines.length === 0) return "Add at least one line.";
  if (lines.length > 40) return "A purchase order can have at most 40 lines.";
  for (const line of lines) {
    if (line.productId && !knownProductIds.includes(line.productId)) {
      return "One of the ordered products does not belong to this business.";
    }
    if (!Number.isFinite(line.qty) || line.qty <= 0) {
      return "Enter a quantity above zero for every line.";
    }
    if (!Number.isFinite(line.unitCost) || line.unitCost < 0) {
      return "Enter a valid unit cost for every line.";
    }
  }
  return null;
}

/** Status a purchase order should hold once a receipt is booked. */
export function statusAfterReceipt(order: PurchaseOrder): PurchaseOrderStatus {
  return outstandingUnits(order) > 0 ? "partially_received" : "received";
}

/**
 * Apply a receipt: `quantities` is indexed against `order.lines`. Every amount
 * must be zero or more, and no line may end up over-received.
 */
export function applyReceipt(
  order: PurchaseOrder,
  quantities: number[],
):
  | {
      ok: true;
      lines: PurchaseOrderLine[];
      status: PurchaseOrderStatus;
      receivedUnits: number;
    }
  | { ok: false; error: string } {
  if (order.status !== "ordered" && order.status !== "partially_received") {
    return {
      ok: false,
      error: `Only placed orders can be received — this one is ${PURCHASE_ORDER_STATUS_LABELS[order.status].toLowerCase()}.`,
    };
  }
  const deltas = order.lines.map((line, index) => {
    const raw = quantities[index];
    return raw == null || !Number.isFinite(raw) ? 0 : raw;
  });
  if (deltas.some((delta) => delta < 0)) {
    return { ok: false, error: "Enter quantities of zero or more." };
  }
  const receivedUnits = deltas.reduce((total, delta) => total + delta, 0);
  if (receivedUnits <= 0) return { ok: false, error: "Enter a quantity to receive." };

  const lines = order.lines.map((line, index) => ({
    ...line,
    receivedQty: line.receivedQty + deltas[index],
  }));
  const over = lines.find((line) => line.receivedQty > line.qty);
  if (over) {
    return {
      ok: false,
      error: `Cannot receive more than ordered for ${over.name || "a line"}.`,
    };
  }
  return {
    ok: true,
    lines,
    status: statusAfterReceipt({ ...order, lines }),
    receivedUnits,
  };
}

/** Lines touched by a receipt, with the quantity newly received on each. */
export function receivedByLine(
  before: PurchaseOrder,
  after: PurchaseOrderLine[],
): { productId: string | null; name: string; qty: number }[] {
  const touched: { productId: string | null; name: string; qty: number }[] = [];
  before.lines.forEach((line, index) => {
    const delta = (after[index]?.receivedQty ?? line.receivedQty) - line.receivedQty;
    if (delta > 0) {
      touched.push({ productId: line.productId, name: line.name, qty: delta });
    }
  });
  return touched;
}
