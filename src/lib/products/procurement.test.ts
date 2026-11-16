import { describe, expect, it } from "vitest";
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  Supplier,
} from "@/types/business";
import {
  addDaysToDay,
  applyReceipt,
  canEditPurchaseOrderLines,
  expectedDeliveryDay,
  isOpenPurchaseOrder,
  isPurchaseOrderOverdue,
  linePendingQty,
  nextPurchaseOrderStatus,
  PURCHASE_ORDER_STATUS_LABELS,
  purchaseOrderTotals,
  purchaseOrderTransitionError,
  receivedByLine,
  validatePurchaseOrderLines,
} from "@/lib/products/procurement";

function line(
  productId: string | null,
  name: string,
  qty: number,
  receivedQty = 0,
  unitCost = 100,
): PurchaseOrderLine {
  return { productId, name, qty, unitCost, receivedQty };
}

function po(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po-1",
    brand_id: "demo-brewery-cafe",
    poNumber: "PO-1001",
    supplierId: "sup-1",
    status: "ordered",
    expectedOn: null,
    createdAt: "2026-11-10T09:00:00.000Z",
    lines: [line("p1", "Coffee beans", 20, 0, 400), line("p2", "Milk", 10, 0, 60)],
    notes: "",
    ...overrides,
  };
}

function supplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: "sup-1",
    brand_id: "demo-brewery-cafe",
    name: "Highland Roasters",
    contactName: null,
    phone: null,
    email: null,
    category: null,
    leadTimeDays: 5,
    paymentTerms: null,
    notes: "",
    is_active: true,
    created_at: "2026-11-01T09:00:00.000Z",
    ...overrides,
  };
}

describe("purchaseOrderTotals", () => {
  it("adds up units, cost and receipt progress", () => {
    expect(purchaseOrderTotals(po())).toEqual({
      lines: 2,
      units: 30,
      cost: 8600,
      receivedUnits: 0,
      outstandingUnits: 30,
      progressPercent: 0,
    });
  });

  it("counts received units against the order, never past it", () => {
    const order = po({
      lines: [line("p1", "Coffee beans", 20, 25, 400), line("p2", "Milk", 10, 4, 60)],
    });
    expect(purchaseOrderTotals(order)).toMatchObject({
      units: 30,
      receivedUnits: 24,
      outstandingUnits: 6,
      progressPercent: 80,
    });
  });

  it("reports a draft with no lines as zero progress", () => {
    expect(purchaseOrderTotals(po({ lines: [] }))).toMatchObject({
      units: 0,
      cost: 0,
      progressPercent: 0,
    });
  });

  it("shows what is still owed on a line", () => {
    expect(linePendingQty(line("p1", "Coffee beans", 20, 6))).toBe(14);
    expect(linePendingQty(line("p1", "Coffee beans", 20, 20))).toBe(0);
  });

  it("calls only placed, unclosed orders open", () => {
    expect(isOpenPurchaseOrder(po({ status: "ordered" }))).toBe(true);
    expect(isOpenPurchaseOrder(po({ status: "partially_received" }))).toBe(true);
    expect(isOpenPurchaseOrder(po({ status: "draft" }))).toBe(false);
    expect(isOpenPurchaseOrder(po({ status: "received" }))).toBe(false);
    expect(isOpenPurchaseOrder(po({ status: "cancelled" }))).toBe(false);
  });
});

describe("purchase order status flow", () => {
  it("walks draft → ordered → partially_received → received", () => {
    expect(purchaseOrderTransitionError(po({ status: "draft", lines: [line("p1", "Beans", 5)] }), "ordered")).toBeNull();
    expect(purchaseOrderTransitionError(po({ status: "ordered" }), "partially_received")).toBeNull();
    expect(purchaseOrderTransitionError(po({ status: "partially_received", lines: [line("p1", "Beans", 5, 5)] }), "received")).toBeNull();
  });

  it("rejects moves that skip backwards or restart a closed order", () => {
    const cases: [PurchaseOrderStatus, PurchaseOrderStatus][] = [
      ["ordered", "draft"],
      ["received", "ordered"],
      ["cancelled", "ordered"],
      ["draft", "received"],
      ["received", "cancelled"],
    ];
    for (const [from, to] of cases) {
      const order = po({
        status: from,
        lines: [line("p1", "Beans", 5, from === "received" ? 5 : 0)],
      });
      expect(purchaseOrderTransitionError(order, to)).toBe(
        `Purchase orders cannot move from ${PURCHASE_ORDER_STATUS_LABELS[from]} to ${PURCHASE_ORDER_STATUS_LABELS[to]}.`,
      );
    }
  });

  it("will not place an order that has no lines", () => {
    expect(purchaseOrderTransitionError(po({ status: "draft", lines: [] }), "ordered")).toBe(
      "Add at least one line before placing the order.",
    );
  });

  it("will not place an order that has no supplier", () => {
    expect(
      purchaseOrderTransitionError(po({ status: "draft", supplierId: null }), "ordered"),
    ).toBe("Pick the supplier before placing the order.");
    // A supplier-less draft is still a draft: cancelling it is fine.
    expect(purchaseOrderTransitionError(po({ status: "draft", supplierId: null }), "cancelled")).toBeNull();
  });

  it("will not mark an order received while lines are outstanding", () => {
    expect(purchaseOrderTransitionError(po({ status: "ordered" }), "received")).toBe(
      "Receive the remaining lines before marking the order received.",
    );
  });

  it("names the current status when nothing would change", () => {
    expect(purchaseOrderTransitionError(po({ status: "ordered" }), "ordered")).toBe(
      "Purchase order is already ordered.",
    );
  });

  it("offers the next step in the flow", () => {
    expect(nextPurchaseOrderStatus("draft")).toBe("ordered");
    expect(nextPurchaseOrderStatus("ordered")).toBe("partially_received");
    expect(nextPurchaseOrderStatus("partially_received")).toBe("received");
    expect(nextPurchaseOrderStatus("received")).toBeNull();
    expect(nextPurchaseOrderStatus("cancelled")).toBeNull();
  });

  it("only lets drafts edit their lines", () => {
    expect(canEditPurchaseOrderLines(po({ status: "draft" }))).toBe(true);
    expect(canEditPurchaseOrderLines(po({ status: "ordered" }))).toBe(false);
  });
});

describe("applyReceipt", () => {
  it("keeps an order partial until every line is in", () => {
    const result = applyReceipt(po(), [10, 0]);
    if (!result.ok) throw new Error(result.error);
    expect(result.status).toBe("partially_received");
    expect(result.receivedUnits).toBe(10);
    expect(result.lines[0].receivedQty).toBe(10);
    expect(result.lines[1].receivedQty).toBe(0);
  });

  it("closes the order when the last line lands", () => {
    const result = applyReceipt(po({ status: "partially_received" }), [20, 10]);
    if (!result.ok) throw new Error(result.error);
    expect(result.status).toBe("received");
    expect(result.receivedUnits).toBe(30);
  });

  it("refuses to receive more than was ordered", () => {
    expect(applyReceipt(po(), [21, 0])).toEqual({
      ok: false,
      error: "Cannot receive more than ordered for Coffee beans.",
    });
  });

  it("refuses an empty or negative receipt", () => {
    expect(applyReceipt(po(), [0, 0])).toEqual({
      ok: false,
      error: "Enter a quantity to receive.",
    });
    expect(applyReceipt(po(), [-2, 0])).toEqual({
      ok: false,
      error: "Enter quantities of zero or more.",
    });
  });

  it("refuses receipts on orders that were never placed", () => {
    expect(applyReceipt(po({ status: "draft" }), [1, 1]).ok).toBe(false);
    expect(applyReceipt(po({ status: "cancelled" }), [1, 1]).ok).toBe(false);
  });

  it("reports which lines a receipt touched", () => {
    const before = po();
    const result = applyReceipt(before, [5, 2]);
    if (!result.ok) throw new Error(result.error);
    expect(receivedByLine(before, result.lines)).toEqual([
      { productId: "p1", name: "Coffee beans", qty: 5 },
      { productId: "p2", name: "Milk", qty: 2 },
    ]);
  });

  it("lists only the lines that moved", () => {
    const before = po({ status: "partially_received", lines: [line("p1", "Coffee beans", 20, 20, 400), line("p2", "Milk", 10, 4, 60)] });
    const result = applyReceipt(before, [0, 6]);
    if (!result.ok) throw new Error(result.error);
    expect(receivedByLine(before, result.lines)).toEqual([
      { productId: "p2", name: "Milk", qty: 6 },
    ]);
    expect(result.status).toBe("received");
  });
});

describe("validatePurchaseOrderLines", () => {
  const known = ["p1", "p2"];

  it("requires at least one line", () => {
    expect(validatePurchaseOrderLines([], known)).toBe("Add at least one line.");
  });

  it("accepts lines with a product from this brand or no product at all", () => {
    expect(validatePurchaseOrderLines([line(null, "Delivery", 1, 0, 300)], known)).toBeNull();
    expect(validatePurchaseOrderLines([line("p1", "Beans", 1)], known)).toBeNull();
  });

  it("rejects unknown products, zero quantities and negative costs", () => {
    expect(validatePurchaseOrderLines([line("nope", "Beans", 1)], known)).toContain(
      "does not belong to this business",
    );
    expect(validatePurchaseOrderLines([line("p1", "Beans", 0)], known)).toBe(
      "Enter a quantity above zero for every line.",
    );
    expect(validatePurchaseOrderLines([line("p1", "Beans", 1, 0, -5)], known)).toBe(
      "Enter a valid unit cost for every line.",
    );
  });
});

describe("lead time and expected delivery", () => {
  it("adds whole days to a calendar day", () => {
    expect(addDaysToDay("2026-11-10", 5)).toBe("2026-11-15");
    expect(addDaysToDay("2026-11-10", 0)).toBe("2026-11-10");
    expect(addDaysToDay("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("derives the expected day from the supplier lead time", () => {
    expect(expectedDeliveryDay("2026-11-10", supplier({ leadTimeDays: 7 }))).toBe(
      "2026-11-17",
    );
    expect(expectedDeliveryDay("2026-11-10", supplier({ leadTimeDays: null }))).toBeNull();
    expect(expectedDeliveryDay("2026-11-10", null)).toBeNull();
  });

  it("calls an order overdue once its expected day has passed", () => {
    expect(isPurchaseOrderOverdue(po({ expectedOn: "2026-11-12" }), "2026-11-14")).toBe(true);
    expect(isPurchaseOrderOverdue(po({ expectedOn: "2026-11-14" }), "2026-11-14")).toBe(false);
    expect(isPurchaseOrderOverdue(po({ expectedOn: null }), "2026-11-14")).toBe(false);
    expect(
      isPurchaseOrderOverdue(po({ expectedOn: "2026-11-12", status: "received" }), "2026-11-14"),
    ).toBe(false);
  });
});
