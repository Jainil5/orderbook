import { describe, expect, it } from "vitest";
import { snapshotFromOrderRecords } from "@/lib/analytics/snapshot";
import type { Order, OrderItem, Payment, Product } from "@/types/database";

function order(over: Partial<Order> = {}): Order {
  return {
    id: "o1",
    brand_id: "b1",
    order_number: "BC-1",
    status: "completed",
    payment_status: "paid",
    customer_id: null,
    customer_name_snapshot: null,
    subtotal: 300,
    discount_total: 0,
    tax_total: 0,
    fees_total: 0,
    grand_total: 300,
    notes: null,
    created_at: "2026-11-06T04:00:00.000Z",
    ...over,
  };
}

function item(over: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "i1",
    order_id: "o1",
    product_id: "p1",
    product_name_snapshot: "Cappuccino",
    quantity: 2,
    unit_price: 150,
    line_discount: 0,
    line_total: 300,
    ...over,
  };
}

function product(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    brand_id: "b1",
    name: "Cappuccino",
    description: null,
    sku: null,
    category: "Coffee",
    price: 150,
    unit: null,
    is_active: true,
    ...over,
  };
}

function payment(over: Partial<Payment> = {}): Payment {
  return {
    id: "pay1",
    brand_id: "b1",
    order_id: "o1",
    amount: 300,
    method: "UPI",
    status: "paid",
    created_at: "2026-11-06T04:30:00.000Z",
    ...over,
  };
}

describe("snapshotFromOrderRecords", () => {
  it("derives category mix and top products from line items", () => {
    const snapshot = snapshotFromOrderRecords({
      orders: [order()],
      items: [
        item(),
        item({
          id: "i2",
          product_id: "p2",
          product_name_snapshot: "Muffin",
          line_total: 120,
        }),
      ],
      products: [product(), product({ id: "p2", name: "Muffin", category: "Bake" })],
      currencyCode: "INR",
    });

    expect(snapshot.salesByCategory).toEqual([
      { name: "Coffee", value: 300 },
      { name: "Bake", value: 120 },
    ]);
    expect(snapshot.topProducts).toEqual([
      { name: "Cappuccino", qty: 2 },
      { name: "Muffin", qty: 2 },
    ]);
    expect(snapshot.itemsSold).toBe(4);
    expect(snapshot.partial).toBe(false);
  });

  it("buckets items with no product row under Uncategorised", () => {
    const snapshot = snapshotFromOrderRecords({
      orders: [order()],
      items: [item({ product_id: "gone" })],
      products: [product()],
      currencyCode: "INR",
    });
    expect(snapshot.salesByCategory).toEqual([
      { name: "Uncategorised", value: 300 },
    ]);
  });

  it("ignores items belonging to orders outside the range", () => {
    const snapshot = snapshotFromOrderRecords({
      orders: [order({ id: "o1" })],
      items: [item({ order_id: "o1" }), item({ id: "i9", order_id: "other" })],
      products: [product()],
      currencyCode: "INR",
    });
    expect(snapshot.itemsSold).toBe(2);
    expect(snapshot.salesByCategory).toEqual([{ name: "Coffee", value: 300 }]);
  });

  it("flags itself partial when line items are unavailable", () => {
    const headersOnly = snapshotFromOrderRecords({
      orders: [order()],
      currencyCode: "INR",
    });
    expect(headersOnly.partial).toBe(true);
    expect(headersOnly.salesByCategory).toEqual([]);
    expect(headersOnly.itemsSold).toBe(0);
  });

  it("splits collected versus open on payment status", () => {
    const snapshot = snapshotFromOrderRecords({
      orders: [
        order({ id: "o1", payment_status: "paid" }),
        order({ id: "o2", payment_status: "partial", grand_total: 100 }),
      ],
      currencyCode: "INR",
    });
    expect(snapshot.paidAmount).toBe(300);
    expect(snapshot.pendingAmount).toBe(100);
    expect(snapshot.netSales).toBe(400);
    expect(snapshot.orderCount).toBe(2);
    expect(snapshot.averageOrderValue).toBe(200);
  });

  it("averages zero rather than NaN for an empty range", () => {
    const snapshot = snapshotFromOrderRecords({ orders: [], currencyCode: "INR" });
    expect(snapshot.averageOrderValue).toBe(0);
    expect(snapshot.orderCount).toBe(0);
    expect(snapshot.salesOverTime).toEqual([]);
  });

  it("totals tender by method, skipping failed, refunded and out-of-range rows", () => {
    const snapshot = snapshotFromOrderRecords({
      orders: [order({ id: "o1" }), order({ id: "o2" })],
      payments: [
        payment({ id: "pay1", amount: 200 }),
        payment({ id: "pay2", amount: 100 }),
        payment({ id: "pay3", order_id: "o2", amount: 472.5, method: "Card" }),
        payment({ id: "pay4", amount: 50, method: "Cash", status: "failed" }),
        payment({ id: "pay5", amount: 25, status: "refunded" }),
        payment({ id: "pay6", order_id: "outside", amount: 999 }),
      ],
      currencyCode: "INR",
    });
    expect(snapshot.paymentMethods).toEqual([
      { name: "Card", value: 472.5 },
      { name: "UPI", value: 300 },
    ]);
  });
});
