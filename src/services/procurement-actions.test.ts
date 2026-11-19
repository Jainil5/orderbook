// Purchasing writes go through the same bounded demo cookie jar as every other
// manager module, so the guards, the ledger entry and the status machine are all
// exercised exactly as a browser hits them.
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    map,
    get(name: string) {
      const value = map.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string) {
      map.set(name, value);
    },
    delete(name: string) {
      map.delete(name);
    },
  };
});

vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import { loadDemoPurchasing } from "@/lib/demo/procurement-data";
import { incomingPacksByItem } from "@/lib/procurement/purchasing";
import {
  cancelPurchaseOrderAction,
  createPurchaseOrderAction,
  deletePurchaseOrderAction,
  deleteVendorAction,
  receivePurchaseOrderLineAction,
  saveVendorAction,
  sendPurchaseOrderAction,
} from "./procurement-actions";

function signIn() {
  jar.map.set("ob_demo_workspace", "BR-1");
}

/**
 * Every purchasing action answers `{ ok: true }` or `{ ok: false, message }`, so
 * a refusal's text is only readable once the union is narrowed. This keeps the
 * assertions one line long without lying to the type checker.
 */
type Verdict = Awaited<ReturnType<typeof sendPurchaseOrderAction>>;
function refusal(result: Verdict): string | null {
  return result.ok ? null : result.message;
}

describe("procurement guard", () => {
  beforeEach(() => jar.map.clear());

  it("refuses every write without a workspace session", async () => {
    expect(await saveVendorAction(null, { name: "X", lead_time_days: 1, payment_terms: "cash" }))
      .toEqual({ ok: false, message: "Not signed in." });
    expect(await createPurchaseOrderAction({ vendorId: "vnd1", lines: [] }))
      .toEqual({ ok: false, message: "Not signed in." });
    expect(await sendPurchaseOrderAction("po1")).toEqual({ ok: false, message: "Not signed in." });
    expect(await receivePurchaseOrderLineAction("po2", "po2-l1", 1))
      .toEqual({ ok: false, message: "Not signed in." });
    expect(await cancelPurchaseOrderAction("po1")).toEqual({ ok: false, message: "Not signed in." });
    expect(await deletePurchaseOrderAction("po1")).toEqual({ ok: false, message: "Not signed in." });
    expect(await deleteVendorAction("vnd1")).toEqual({ ok: false, message: "Not signed in." });
    expect((await readDemoMutableBucket("BR-1")).purchaseOrders).toHaveLength(0);
  });
});

describe("saveVendorAction", () => {
  beforeEach(() => {
    jar.map.clear();
    signIn();
  });

  it("stores a new vendor with the typed lead time", async () => {
    const result = await saveVendorAction(null, {
      name: "  Kettle Chips Co  ",
      category: "Snacks",
      lead_time_days: "3",
      payment_terms: "upi",
      rating: "4",
    });
    expect(result.ok).toBe(true);
    const { vendors } = await loadDemoPurchasing("BR-1");
    const added = vendors.find((vendor) => vendor.name === "Kettle Chips Co");
    expect(added).toMatchObject({ lead_time_days: 3, payment_terms: "upi", rating: 4, active: true });
  });

  it("rejects a vendor with no name before writing anything", async () => {
    expect((await saveVendorAction(null, { name: " ", lead_time_days: 1, payment_terms: "cash" })).ok).toBe(false);
    expect((await readDemoMutableBucket("BR-1")).vendors).toHaveLength(0);
  });

  it("edits a seeded vendor as an override rather than a second row", async () => {
    const result = await saveVendorAction("vnd1", {
      name: "Green Lane Produce",
      category: "Vegetables",
      lead_time_days: "2",
      payment_terms: "cash",
    });
    expect(result.ok).toBe(true);
    const { vendors } = await loadDemoPurchasing("BR-1");
    expect(vendors.filter((vendor) => vendor.id === "vnd1")).toHaveLength(1);
    expect(vendors.find((vendor) => vendor.id === "vnd1")?.lead_time_days).toBe(2);
  });

  it("keeps a vendor an open order still depends on", async () => {
    const result = await deleteVendorAction("vnd4");
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toContain("PO-1042");
    const { vendors } = await loadDemoPurchasing("BR-1");
    expect(vendors.some((vendor) => vendor.id === "vnd4")).toBe(true);
  });

  it("lets a vendor with nothing outstanding go", async () => {
    expect((await deleteVendorAction("vnd5")).ok).toBe(true);
    const { vendors } = await loadDemoPurchasing("BR-1");
    expect(vendors.some((vendor) => vendor.id === "vnd5")).toBe(false);
  });
});

describe("purchase order lifecycle", () => {
  beforeEach(() => {
    jar.map.clear();
    signIn();
  });

  const draft = {
    vendorId: "vnd2",
    note: "Weekend milk",
    lines: [
      { itemId: "iv3", packs: "12", costPerPack: "70" },
      { itemId: "iv4", packs: "4", costPerPack: "135" },
    ],
  };

  async function create() {
    const result = await createPurchaseOrderAction(draft);
    expect(result.ok).toBe(true);
    const { purchaseOrders, purchaseOrderLines } = await loadDemoPurchasing("BR-1");
    const po = purchaseOrders.find((row) => row.note === "Weekend milk")!;
    const lines = purchaseOrderLines.filter((row) => row.po_id === po.id);
    return { po, lines };
  }

  it("creates a draft with snapshotted line names", async () => {
    const { po, lines } = await create();
    expect(po.status).toBe("draft");
    expect(po.sent_at).toBeNull();
    expect(po.number).toBe("PO-1047");
    expect(lines.map((line) => [line.item_name, line.packs, line.cost_per_pack])).toEqual([
      ["Full Cream Milk", 12, 70],
      ["Oat Milk", 4, 135],
    ]);
  });

  it("refuses an order with no lines or an unknown item", async () => {
    expect((await createPurchaseOrderAction({ ...draft, lines: [] })).ok).toBe(false);
    expect(
      (await createPurchaseOrderAction({ ...draft, lines: [{ itemId: "ghost", packs: "2", costPerPack: "10" }] })).ok,
    ).toBe(false);
    expect((await readDemoMutableBucket("BR-1")).purchaseOrders).toHaveLength(0);
  });

  it("sends a draft with the vendor's lead time as the promise", async () => {
    const { po } = await create();
    expect((await sendPurchaseOrderAction(po.id)).ok).toBe(true);
    const { purchaseOrders } = await loadDemoPurchasing("BR-1");
    const sent = purchaseOrders.find((row) => row.id === po.id)!;
    expect(sent.status).toBe("sent");
    expect(sent.sent_at).not.toBeNull();
    // vnd2 quotes a one-day lead, so the promise is one day after sending.
    const lead = new Date(sent.sent_at!).getTime() + 86_400_000;
    expect(new Date(sent.expected_at!).getTime()).toBe(lead);
  });

  it("will not send an order that is already on its way or already closed", async () => {
    expect((await sendPurchaseOrderAction("po4")).ok).toBe(true); // the pack's draft
    expect(refusal(await sendPurchaseOrderAction("po4"))).toBe("Only a draft order can be sent.");
    expect(refusal(await sendPurchaseOrderAction("po1"))).toBe("Only a draft order can be sent.");
    expect(refusal(await sendPurchaseOrderAction("ghost"))).toBe("Order not found.");
  });

  it("books a partial receipt on the line, the order and the shelf", async () => {
    // po2 / po2-l1: 10 packs of Paper Napkins at ₹90, four already in.
    const result = await receivePurchaseOrderLineAction("po2", "po2-l1", 3);
    expect(result.ok).toBe(true);
    const { purchaseOrders, purchaseOrderLines } = await loadDemoPurchasing("BR-1");
    expect(purchaseOrderLines.find((line) => line.id === "po2-l1")?.received_packs).toBe(7);
    expect(purchaseOrders.find((row) => row.id === "po2")?.status).toBe("partially_received");
    const bucket = await readDemoMutableBucket("BR-1");
    const movement = bucket.inventoryLedger[0];
    expect(movement).toMatchObject({
      item_id: "iv30",
      delta_packs: 3,
      kind: "purchase",
      cost: 270,
    });
    expect(movement.note).toContain("PO-1042");
  });

  it("marks the order received only when the last line is whole", async () => {
    for (const [lineId, packs] of [["po2-l1", 6], ["po2-l2", 6], ["po2-l3", 8]] as const) {
      expect((await receivePurchaseOrderLineAction("po2", lineId, packs)).ok).toBe(true);
    }
    const { purchaseOrders, purchaseOrderLines } = await loadDemoPurchasing("BR-1");
    const po = purchaseOrders.find((row) => row.id === "po2")!;
    expect(po.status).toBe("received");
    expect(po.closed_at).not.toBeNull();
    const ordered = purchaseOrderLines.filter((line) => line.po_id === "po2");
    expect(ordered.every((line) => line.received_packs === line.packs)).toBe(true);
  });

  it("refuses to book packs the vendor never delivered", async () => {
    const before = await readDemoMutableBucket("BR-1");
    const verdict = await receivePurchaseOrderLineAction("po2", "po2-l2", 99);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.message).toContain("6 packs left");
    const after = await readDemoMutableBucket("BR-1");
    expect(after.inventoryLedger).toHaveLength(before.inventoryLedger.length);
    expect(after.purchaseOrderLineOverrides).toEqual(before.purchaseOrderLineOverrides);
  });

  it("will not receive against a draft or a closed order", async () => {
    expect(refusal(await receivePurchaseOrderLineAction("po4", "po4-l1", 1))).toBe(
      "Only a sent order can receive goods.",
    );
    expect(refusal(await receivePurchaseOrderLineAction("po1", "po1-l1", 1))).toBe(
      "Only a sent order can receive goods.",
    );
  });

  it("cancelling an order keeps what already arrived on the shelf", async () => {
    expect((await receivePurchaseOrderLineAction("po3", "po3-l1", 6)).ok).toBe(true);
    const ledgerBefore = (await readDemoMutableBucket("BR-1")).inventoryLedger.length;
    expect((await cancelPurchaseOrderAction("po3")).ok).toBe(true);
    const { purchaseOrders } = await loadDemoPurchasing("BR-1");
    const po = purchaseOrders.find((row) => row.id === "po3")!;
    expect(po.status).toBe("cancelled");
    expect(po.closed_at).not.toBeNull();
    expect((await readDemoMutableBucket("BR-1")).inventoryLedger).toHaveLength(ledgerBefore);
  });

  it("refuses to cancel an order twice", async () => {
    expect(refusal(await cancelPurchaseOrderAction("po1"))).toBe("This order is already closed.");
    expect(refusal(await cancelPurchaseOrderAction("po6"))).toBe("This order is already closed.");
  });

  it("throws away a draft or a cancelled order but never one on its way", async () => {
    expect(refusal(await deletePurchaseOrderAction("po2"))).toBe(
      "Only a draft or cancelled order can be deleted.",
    );
    expect((await deletePurchaseOrderAction("po4")).ok).toBe(true);
    expect((await deletePurchaseOrderAction("po6")).ok).toBe(true);
    const { purchaseOrders, purchaseOrderLines } = await loadDemoPurchasing("BR-1");
    expect(purchaseOrders.map((row) => row.id)).toEqual(["po1", "po2", "po3", "po5"]);
    expect(purchaseOrderLines.some((line) => line.po_id === "po4" || line.po_id === "po6")).toBe(false);
  });

  it("stops counting a cancelled order's goods as incoming", async () => {
    // po2 is the pack's open order: 10 napkins ordered, 4 already in.
    const open = await loadDemoPurchasing("BR-1");
    expect(incomingPacksByItem(open.purchaseOrders, open.purchaseOrderLines).get("iv30")).toBe(6);
    expect((await cancelPurchaseOrderAction("po2")).ok).toBe(true);
    const after = await loadDemoPurchasing("BR-1");
    expect(incomingPacksByItem(after.purchaseOrders, after.purchaseOrderLines).has("iv30")).toBe(false);
  });
});
