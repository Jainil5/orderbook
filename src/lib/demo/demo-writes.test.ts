import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getRawDemoBrandPack } from "@/lib/demo/brands/packs";
import { DEMO_WORKSPACE_COOKIE } from "@/lib/workspace/constants";
import type { CreateOrderInput, Product } from "@/types/database";

/**
 * Proof that the demo's write path is the file.
 *
 * `src/lib/demo/server.ts` used to keep every user edit in an httpOnly cookie;
 * these tests drive the real exported functions and then assert against the CSV
 * bytes on disk, including one case that re-imports the read side through a
 * fresh module graph — a restart, as far as a unit test can simulate one.
 *
 * Writes go to a temp `OB_DATA_DIR`, never into the checked-in `data/`.
 */

const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));

/* `server.ts` resolves the brand from the workspace cookie and nothing else, so
   the cookie jar is the only request state a test has to fake. */
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  })),
  headers: vi.fn(async () => new Headers()),
}));

// Next refuses `revalidatePath` outside a request; every write calls it.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let tmpDir: string | null = null;
const previousDataDir = process.env.OB_DATA_DIR;

beforeEach(() => {
  vi.resetModules();
  cookieJar.clear();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ob-demo-writes-"));
  process.env.OB_DATA_DIR = tmpDir;
});

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
  if (previousDataDir === undefined) delete process.env.OB_DATA_DIR;
  else process.env.OB_DATA_DIR = previousDataDir;
});

/**
 * Sign a test in the way the login screen does: a row in `sessions.csv`, then
 * the token that points at it in the jar. Nothing reads the brand code out of
 * the cookie any more, so a test that skipped this would only be proving the
 * no-session fallback.
 */
async function signIn(code: "BR-1" | "BR-2") {
  const { createDemoSession } = await import("@/lib/csv/session-store");
  cookieJar.set(DEMO_WORKSPACE_COOKIE, createDemoSession(code));
}

function stockedProduct(code: "BR-1" | "BR-2"): Product {
  const product = getRawDemoBrandPack(code).products.find(
    (p) => p.is_active && p.stock_qty != null && p.stock_qty >= 5,
  );
  if (!product) throw new Error(`No stocked product in ${code}`);
  return product;
}

function bill(productId: string, quantity: number): CreateOrderInput {
  return {
    customerId: null,
    lines: [{ productId, quantity }],
    paymentMethod: "Cash",
    paymentStatus: "paid",
  };
}

async function store() {
  return import("@/lib/csv/store");
}

describe("demo writes land in csv", () => {
  it("a sale writes the order, its lines, the stock move and the audit row", async () => {
    await signIn("BR-1");
    const { submitDemoOrder } = await import("./server");
    const pack = getRawDemoBrandPack("BR-1");
    const product = stockedProduct("BR-1");
    const before = product.stock_qty!;

    const result = await submitDemoOrder(bill(product.id, 3));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const csv = await store();
    const order = csv
      .readBrandRows("orders", pack.brand.id)
      .find((o) => o.id === result.orderId);
    expect(order).toBeDefined();
    expect(order!.order_number).toContain(`${pack.orderNumberPrefix}-`);
    expect(order!.status).toBe("completed");

    const items = csv.readAllRows("order_items").filter((i) => i.order_id === result.orderId);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
    expect(items[0].product_id).toBe(product.id);

    const rows = csv.readBrandRows("products", pack.brand.id);
    expect(rows.find((p) => p.id === product.id)!.stock_qty).toBe(before - 3);

    const audit = csv.readBrandRows("audit_log", pack.brand.id);
    expect(audit.some((a) => a.action === "order.created" && a.entity_id === result.orderId)).toBe(
      true,
    );

    /* The file is the store: the raw bytes carry the row, not a cookie. */
    expect(fs.readFileSync(path.join(tmpDir!, "orders.csv"), "utf8")).toContain(
      result.orderNumber,
    );
  });

  it("the order a previous request wrote is readable after a restart", async () => {
    await signIn("BR-1");
    const { submitDemoOrder } = await import("./server");
    const product = stockedProduct("BR-1");
    const result = await submitDemoOrder(bill(product.id, 2));
    if (!result.ok) throw new Error("order should have been accepted");

    /* New module graph = new process: no in-memory cache, only the files. */
    vi.resetModules();
    const { listDemoOrders, getDemoOrderItems } = await import("./data");
    const orders = await listDemoOrders(undefined, "BR-1");
    const mine = orders.find((o) => o.id === result.orderId);
    expect(mine?.order_number).toBe(result.orderNumber);
    expect((await getDemoOrderItems(result.orderId, "BR-1"))[0].quantity).toBe(2);
  });

  it("a walk-in sale can create its own customer row", async () => {
    await signIn("BR-1");
    const { submitDemoOrder } = await import("./server");
    const pack = getRawDemoBrandPack("BR-1");
    const product = stockedProduct("BR-1");

    const result = await submitDemoOrder({
      ...bill(product.id, 1),
      saveNewCustomer: true,
      walkInName: "Walk-in from the terrace",
      customerPhone: "+91 90000 00000",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const csv = await store();
    const customer = csv
      .readBrandRows("customers", pack.brand.id)
      .find((c) => c.name === "Walk-in from the terrace");
    expect(customer).toBeDefined();
    expect(customer!.phone).toBe("+91 90000 00000");
    const order = csv.readBrandRows("orders", pack.brand.id).find((o) => o.id === result.orderId);
    expect(order!.customer_id).toBe(customer!.id);
  });

  it("a payment and a refund both write money rows, and the order follows", async () => {
    await signIn("BR-1");
    const { recordDemoPayment, recordDemoRefund, submitDemoOrder } = await import("./server");
    const pack = getRawDemoBrandPack("BR-1");
    const product = stockedProduct("BR-1");
    /* An unpaid order, so `amount_paid` starts at zero and a payment is a
       visible delta rather than an addition to what checkout already collected. */
    const sale = await submitDemoOrder({
      ...bill(product.id, 1),
      paymentStatus: "pending",
    });
    if (!sale.ok) throw new Error("order should have been accepted");

    const paid = await recordDemoPayment({
      orderId: sale.orderId,
      amount: 50,
      method: "UPI",
    });
    expect(paid.ok).toBe(true);

    const csv = await store();
    const payments = () =>
      csv.readBrandRows("payments", pack.brand.id).filter((p) => p.order_id === sale.orderId);
    expect(payments()[0]).toMatchObject({ amount: 50, method: "UPI", status: "paid" });
    const order = () =>
      csv.readBrandRows("orders", pack.brand.id).find((o) => o.id === sale.orderId);
    expect(order()!.amount_paid).toBe(50);
    expect(order()!.payment_status).toBe("partial");

    const refunded = await recordDemoRefund({
      orderId: sale.orderId,
      amount: 50,
      reason: "Wrong order",
    });
    expect(refunded.ok).toBe(true);

    expect(csv.readBrandRows("refunds", pack.brand.id)).toHaveLength(1);
    expect(csv.readBrandRows("refunds", pack.brand.id)[0]).toMatchObject({
      order_id: sale.orderId,
      amount: 50,
      reason: "Wrong order",
    });
    expect(payments().some((p) => p.amount === -50 && p.method === "Refund")).toBe(true);
    expect(order()!.status).toBe("refunded");
    expect(order()!.payment_status).toBe("refunded");

    /* The refunds screen reads this same table. */
    const { listDemoRefunds } = await import("./data");
    expect((await listDemoRefunds("BR-1"))[0].reason).toBe("Wrong order");
  });

  it("a write against another brand's row is refused as a message, never a throw", async () => {
    await signIn("BR-1");
    const { updateDemoOrderStatus, recordDemoPayment } = await import("./server");
    const other = getRawDemoBrandPack("BR-2");
    const target = other.orders[0];

    expect(await updateDemoOrderStatus(target.id, "cancelled")).toEqual({
      ok: false,
      message: "Order not found.",
    });
    expect(
      await recordDemoPayment({ orderId: target.id, amount: 10, method: "Cash" }),
    ).toEqual({ ok: false, message: "Order not found." });

    const csv = await store();
    const untouched = csv.readBrandRows("orders", other.brand.id).find((o) => o.id === target.id);
    expect(untouched!.status).toBe(target.status);
    expect(csv.readBrandRows("payments", other.brand.id)).toHaveLength(
      other.payments.length,
    );
  });

  it("a public quote is accepted from its token, with no session at all", async () => {
    await signIn("BR-1");
    const { submitDemoOrder } = await import("./server");
    const pack = getRawDemoBrandPack("BR-1");
    const product = stockedProduct("BR-1");
    const quote = await submitDemoOrder({
      ...bill(product.id, 1),
      paymentStatus: "pending",
    });
    if (!quote.ok) throw new Error("quote should have been created");

    const csv = await store();
    const created = csv
      .readBrandRows("orders", pack.brand.id)
      .find((o) => o.id === quote.orderId);
    const token = created?.public_token;
    expect(typeof token).toBe("string");

    /* The customer on the quote link has no workspace cookie — the token is the
       whole capability, and the brand comes from the matched row. */
    cookieJar.clear();
    const { acceptPublicQuoteAction } = await import("@/services/quote-actions");
    expect(await acceptPublicQuoteAction(token as string)).toEqual({
      ok: true,
      orderNumber: quote.orderNumber,
    });

    expect(
      csv.readBrandRows("orders", pack.brand.id).find((o) => o.id === quote.orderId)!.status,
    ).toBe("confirmed");
    expect(
      csv
        .readBrandRows("audit_log", pack.brand.id)
        .some((a) => a.action === "quote.accepted_public"),
    ).toBe(true);
  });

  it("settings and stock edits go to their tables too", async () => {
    await signIn("BR-1");
    const { recordDemoStockAdjustment, saveDemoOffer } = await import("./server");
    const pack = getRawDemoBrandPack("BR-1");
    const product = stockedProduct("BR-1");

    const adjusted = await recordDemoStockAdjustment({
      productId: product.id,
      deltaQty: -4,
      reason: "Spillage",
    });
    expect(adjusted.ok).toBe(true);
    if (!adjusted.ok) return;
    expect(adjusted.stockQty).toBe(product.stock_qty! - 4);

    const csv = await store();
    expect(csv.readBrandRows("stock_adjustments", pack.brand.id)[0]).toMatchObject({
      product_id: product.id,
      delta_qty: -4,
      reason: "Spillage",
    });
    expect(
      csv.readBrandRows("products", pack.brand.id).find((p) => p.id === product.id)!.stock_qty,
    ).toBe(product.stock_qty! - 4);

    const offer = await saveDemoOffer({
      name: "Demo week",
      code: "demoweek",
      discount_type: "percent",
      discount_value: 10,
      scope: "order",
    });
    expect(offer.ok).toBe(true);
    /* The screen stores the code uppercased, in offers.csv. */
    expect(
      csv.readBrandRows("offers", pack.brand.id).find((o) => o.id === offer.offer.id),
    ).toMatchObject({ code: "DEMOWEEK", discount_value: 10 });
  });
});
