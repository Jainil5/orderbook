import { describe, expect, it } from "vitest";
import {
  checkReceipt,
  expectedDeliveryIso,
  incomingPacksByItem,
  isPurchaseOrderLate,
  lineOutstanding,
  nextPoNumber,
  poIsComplete,
  poTotals,
  purchaseOrderViews,
  reorderSuggestions,
  statusAfterReceipt,
  validatePurchaseOrderInput,
  validateVendorInput,
} from "./purchasing";
import type { InventoryPosition } from "@/lib/inventory/stock";
import type {
  PurchaseOrder,
  PurchaseOrderLine,
  Vendor,
} from "@/types/procurement";

function vendor(over: Partial<Vendor> & Pick<Vendor, "id">): Vendor {
  return {
    brand_id: "b",
    name: "Milkma",
    category: "Dairy",
    contact_name: null,
    phone: null,
    email: null,
    lead_time_days: 2,
    payment_terms: "net_15",
    rating: 4,
    note: null,
    active: true,
    ...over,
  };
}

function po(over: Partial<PurchaseOrder> & Pick<PurchaseOrder, "id">): PurchaseOrder {
  return {
    brand_id: "b",
    number: "PO-1041",
    vendor_id: "v1",
    status: "sent",
    created_at: "2026-11-05T09:00:00.000Z",
    sent_at: "2026-11-05T09:10:00.000Z",
    expected_at: null,
    closed_at: null,
    note: null,
    ...over,
  };
}

function line(over: Partial<PurchaseOrderLine> & Pick<PurchaseOrderLine, "id">): PurchaseOrderLine {
  return {
    brand_id: "b",
    po_id: "po1",
    item_id: "iv1",
    item_name: "Full Cream Milk",
    unit: "ml",
    packs: 10,
    received_packs: 0,
    cost_per_pack: 68,
    ...over,
  };
}

function position(
  itemId: string,
  packs: number,
  low_stock_packs: number,
  cost_per_pack = 100,
): InventoryPosition {
  return {
    item: {
      id: itemId,
      brand_id: "b",
      name: itemId,
      category: null,
      unit: "pack",
      units_per_pack: 1,
      cost_per_pack,
      stock_packs: packs,
      low_stock_packs,
      storage: null,
      note: null,
    },
    packs,
    units: packs,
    costPerUnit: cost_per_pack,
    value: packs * cost_per_pack,
    status: packs <= 0 ? "out" : packs <= low_stock_packs ? "low" : "ok",
    shortBy: Math.max(0, low_stock_packs - packs),
  };
}

describe("poTotals", () => {
  it("splits ordered, received and still to arrive", () => {
    const totals = poTotals([
      line({ id: "l1", packs: 10, received_packs: 4, cost_per_pack: 68 }),
      line({ id: "l2", packs: 2.5, received_packs: 2.5, cost_per_pack: 120 }),
    ]);
    expect(totals).toEqual({
      lines: 2,
      packs: 12.5,
      receivedPacks: 6.5,
      outstandingPacks: 6,
      value: 980,
      receivedValue: 572,
      outstandingValue: 408,
    });
  });
  it("reads an order with no lines as nothing", () => {
    expect(poTotals([]).value).toBe(0);
    expect(poTotals([]).outstandingPacks).toBe(0);
  });
});

describe("lineOutstanding and statusAfterReceipt", () => {
  it("never reports a negative remainder", () => {
    expect(lineOutstanding(line({ id: "l1", packs: 4, received_packs: 6 }))).toBe(0);
  });
  it("stays partial while any line still owes packs", () => {
    expect(
      statusAfterReceipt([
        line({ id: "l1", packs: 4, received_packs: 4 }),
        line({ id: "l2", packs: 4, received_packs: 1 }),
      ]),
    ).toBe("partially_received");
  });
  it("closes only when every line is whole", () => {
    expect(
      statusAfterReceipt([
        line({ id: "l1", packs: 4, received_packs: 4 }),
        line({ id: "l2", packs: 4, received_packs: 4 }),
      ]),
    ).toBe("received");
  });
  it("will not call an empty order received", () => {
    expect(poIsComplete([])).toBe(false);
    // A line-less order still reads as partial; sending one is blocked upstream.
    expect(statusAfterReceipt([])).toBe("partially_received");
  });
});

describe("nextPoNumber", () => {
  it("starts at PO-1041 with no orders", () => {
    expect(nextPoNumber([])).toBe("PO-1041");
  });
  it("walks past the highest numeric tail", () => {
    expect(
      nextPoNumber([
        po({ id: "a", number: "PO-1041" }),
        po({ id: "b", number: "PO-1106" }),
      ]),
    ).toBe("PO-1107");
  });
});

describe("isPurchaseOrderLate", () => {
  const now = new Date("2026-11-12T12:00:00.000Z");
  it("flags a sent order whose promised date has gone by", () => {
    expect(
      isPurchaseOrderLate(po({ id: "p", expected_at: "2026-11-10T06:00:00.000Z" }), now),
    ).toBe(true);
  });
  it("leaves an order due today alone", () => {
    expect(
      isPurchaseOrderLate(po({ id: "p", expected_at: "2026-11-12T18:00:00.000Z" }), now),
    ).toBe(false);
  });
  it("never flags a draft, a closed order or one with no promise", () => {
    const past = "2026-11-01T06:00:00.000Z";
    expect(isPurchaseOrderLate(po({ id: "p", status: "draft", expected_at: past }), now)).toBe(false);
    expect(isPurchaseOrderLate(po({ id: "p", status: "received", expected_at: past }), now)).toBe(false);
    expect(isPurchaseOrderLate(po({ id: "p", status: "cancelled", expected_at: past }), now)).toBe(false);
    expect(isPurchaseOrderLate(po({ id: "p", expected_at: null }), now)).toBe(false);
  });
});

describe("expectedDeliveryIso", () => {
  it("adds the vendor's lead time to the send date", () => {
    expect(expectedDeliveryIso("2026-11-12T06:00:00.000Z", 3)).toBe(
      "2026-11-15T06:00:00.000Z",
    );
  });
  it("treats a nonsense lead time as same-day rather than negative", () => {
    expect(expectedDeliveryIso("2026-11-12T06:00:00.000Z", -4)).toBe(
      "2026-11-12T06:00:00.000Z",
    );
  });
});

describe("checkReceipt", () => {
  const sent = po({ id: "po1", status: "sent" });
  it("accepts a partial delivery", () => {
    expect(checkReceipt(sent, [line({ id: "l1", packs: 10, received_packs: 2 })], "l1", 3)).toEqual(
      { ok: true, packs: 3 },
    );
  });
  it("accepts the exact remainder and rounds floating dust", () => {
    const rows = [line({ id: "l1", packs: 4.5, received_packs: 1.5 })];
    expect(checkReceipt(sent, rows, "l1", "3")).toEqual({ ok: true, packs: 3 });
    expect(checkReceipt(sent, rows, "l1", "3.0000004")).toEqual({ ok: true, packs: 3 });
  });
  it("refuses a draft, an unknown line and a closed order", () => {
    expect(checkReceipt(po({ id: "po1", status: "draft" }), [line({ id: "l1" })], "l1", 1).ok).toBe(false);
    expect(checkReceipt(sent, [line({ id: "l1" })], "other", 1).ok).toBe(false);
    expect(checkReceipt(po({ id: "po1", status: "received" }), [line({ id: "l1" })], "l1", 1).ok).toBe(false);
  });
  it("refuses to book packs that were not delivered", () => {
    const verdict = checkReceipt(sent, [line({ id: "l1", packs: 10, received_packs: 8 })], "l1", 5);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.message).toContain("2 packs left");
  });
  it("says so plainly when the line is already whole", () => {
    const verdict = checkReceipt(sent, [line({ id: "l1", packs: 10, received_packs: 10 })], "l1", 1);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.message).toContain("already fully received");
  });
  it("rejects zero, negatives and junk", () => {
    for (const value of [0, -2, "abc", ""]) {
      expect(checkReceipt(sent, [line({ id: "l1" })], "l1", value).ok).toBe(false);
    }
  });
});

describe("incomingPacksByItem", () => {
  const lines = [
    line({ id: "l1", po_id: "open", item_id: "iv1", packs: 10, received_packs: 4 }),
    line({ id: "l2", po_id: "open", item_id: "iv2", packs: 5, received_packs: 5 }),
    line({ id: "l3", po_id: "draft", item_id: "iv1", packs: 8, received_packs: 0 }),
    line({ id: "l4", po_id: "gone", item_id: "iv1", packs: 3, received_packs: 0 }),
  ];
  const orders = [
    po({ id: "open", status: "sent" }),
    po({ id: "draft", status: "draft" }),
    po({ id: "gone", status: "cancelled" }),
  ];
  it("counts only what an open order still owes", () => {
    expect(incomingPacksByItem(orders, lines).get("iv1")).toBe(6);
  });
  it("ignores a line whose order is already whole or closed", () => {
    expect(incomingPacksByItem(orders, lines).has("iv2")).toBe(false);
  });
});

describe("reorderSuggestions", () => {
  const positions = [position("iv1", 2, 5, 90), position("iv2", 12, 3, 100), position("iv3", 0, 2, 500)];
  it("suggests packs that lift an item above its reorder line", () => {
    const rows = reorderSuggestions(positions, new Map(), 2);
    expect(rows.map((row) => row.position.item.id)).toEqual(["iv1", "iv3"]);
    expect(rows[0].suggestPacks).toBe(5); // 5 + 2 cover − 2 on hand
    expect(rows[1].suggestPacks).toBe(4); // 2 + 2 cover − nothing on hand
  });
  it("does not double-order what a vendor already has coming", () => {
    const rows = reorderSuggestions(positions, new Map([["iv1", 5]]), 2);
    expect(rows.map((row) => row.position.item.id)).toEqual(["iv3"]);
  });
  it("leaves a healthy shelf out entirely", () => {
    expect(reorderSuggestions([position("iv2", 12, 3)], new Map())).toEqual([]);
  });
});

describe("purchaseOrderViews", () => {
  it("pairs each order with its vendor, lines and maths, newest first", () => {
    const views = purchaseOrderViews(
      [
        po({ id: "old", number: "PO-1041", created_at: "2026-11-01T09:00:00.000Z" }),
        po({ id: "new", number: "PO-1042", vendor_id: "missing", created_at: "2026-11-09T09:00:00.000Z", expected_at: "2026-11-10T09:00:00.000Z" }),
      ],
      [line({ id: "l1", po_id: "old", packs: 4, received_packs: 4 })],
      [vendor({ id: "v1" })],
      new Date("2026-11-12T00:00:00.000Z"),
    );
    expect(views.map((view) => view.po.id)).toEqual(["new", "old"]);
    expect(views[0].vendor).toBeNull();
    expect(views[0].late).toBe(true);
    expect(views[0].totals.lines).toBe(0);
    expect(views[1].vendor?.name).toBe("Milkma");
    expect(views[1].totals.receivedPacks).toBe(4);
    expect(views[1].late).toBe(false);
  });
});

describe("validateVendorInput", () => {
  const base = { name: "Green Lane", lead_time_days: "1", payment_terms: "cash" };
  it("accepts a minimal vendor and clamps the rating", () => {
    const r = validateVendorInput({ ...base, rating: "9" });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value).toMatchObject({
        name: "Green Lane",
        lead_time_days: 1,
        payment_terms: "cash",
        rating: 5,
        category: null,
      });
  });
  it("needs a name and a sane lead time", () => {
    expect(validateVendorInput({ ...base, name: "  " }).ok).toBe(false);
    expect(validateVendorInput({ ...base, lead_time_days: "400" }).ok).toBe(false);
    expect(validateVendorInput({ ...base, lead_time_days: "abc" }).ok).toBe(false);
  });
  it("rejects terms the brand cannot pay by", () => {
    expect(validateVendorInput({ ...base, payment_terms: "cheque" }).ok).toBe(false);
  });
  it("treats a blank rating as unrated, not zero", () => {
    const r = validateVendorInput({ ...base, rating: "" });
    expect(r.ok && r.value.rating).toBe(null);
  });
});

describe("validatePurchaseOrderInput", () => {
  const known = {
    vendorIds: ["v1"],
    items: [
      { id: "iv1", name: "Milk", unit: "ml", cost_per_pack: 68 },
      { id: "iv2", name: "Bread", unit: "slice", cost_per_pack: 90 },
    ],
  };
  it("keeps the item name and unit as a snapshot on the line", () => {
    const r = validatePurchaseOrderInput(
      { vendorId: "v1", lines: [{ itemId: "iv1", packs: "4", costPerPack: "70" }] },
      known,
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.value.lines).toEqual([
        { item_id: "iv1", item_name: "Milk", unit: "ml", packs: 4, cost_per_pack: 70 },
      ]);
  });
  it("needs a vendor, a line, and lines that exist", () => {
    expect(validatePurchaseOrderInput({ vendorId: "no", lines: [] }, known).ok).toBe(false);
    expect(validatePurchaseOrderInput({ vendorId: "v1", lines: [] }, known).ok).toBe(false);
    expect(
      validatePurchaseOrderInput(
        { vendorId: "v1", lines: [{ itemId: "ghost", packs: "1", costPerPack: "1" }] },
        known,
      ).ok,
    ).toBe(false);
  });
  it("refuses the same item twice on one order", () => {
    const r = validatePurchaseOrderInput(
      {
        vendorId: "v1",
        lines: [
          { itemId: "iv1", packs: "1", costPerPack: "68" },
          { itemId: "iv1", packs: "2", costPerPack: "68" },
        ],
      },
      known,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("one line per item");
  });
  it("refuses empty, zero, negative and absurd quantities", () => {
    for (const packs of ["", "0", "-3", "99999", "abc"]) {
      expect(
        validatePurchaseOrderInput(
          { vendorId: "v1", lines: [{ itemId: "iv1", packs, costPerPack: "68" }] },
          known,
        ).ok,
      ).toBe(false);
    }
  });
  it("accepts a free price but not junk or a negative", () => {
    expect(
      validatePurchaseOrderInput(
        { vendorId: "v1", lines: [{ itemId: "iv1", packs: "2", costPerPack: "0" }] },
        known,
      ).ok,
    ).toBe(true);
    expect(
      validatePurchaseOrderInput(
        { vendorId: "v1", lines: [{ itemId: "iv1", packs: "2", costPerPack: "-1" }] },
        known,
      ).ok,
    ).toBe(false);
  });
  it("keeps a real expected date and drops a nonsense one", () => {
    const good = validatePurchaseOrderInput(
      { vendorId: "v1", expectedAt: "2026-11-20", lines: [{ itemId: "iv1", packs: "1", costPerPack: "68" }] },
      known,
    );
    expect(good.ok && good.value.expected_at).toBe(new Date("2026-11-20").toISOString());
    expect(
      validatePurchaseOrderInput(
        { vendorId: "v1", expectedAt: "not a day", lines: [{ itemId: "iv1", packs: "1", costPerPack: "68" }] },
        known,
      ).ok,
    ).toBe(false);
  });
});
