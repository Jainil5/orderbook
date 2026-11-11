import { describe, expect, it } from "vitest";
import { buildOrderRecord } from "./build-order-record";
import { localDayKey } from "@/lib/manager/time";
import type { Customer, Offer, Product } from "@/types/database";

const product: Product = {
  id: "p1",
  brand_id: "b1",
  name: "Flat White",
  description: null,
  sku: null,
  category: "Coffee",
  price: 220,
  unit: "cup",
  is_active: true,
};
const customers: Customer[] = [];

const base = {
  brandId: "b1",
  orderId: "o1",
  orderNumber: "BC-1",
  products: [product],
  customers,
  taxRatePercent: 5,
  offers: [] as Offer[],
};

describe("bill lifecycle", () => {
  it("saves a method-paid bill as pending with payment_method on the order", () => {
    const built = buildOrderRecord({
      ...base,
      input: {
        customerId: null,
        lines: [{ productId: "p1", quantity: 2 }],
        paymentMethod: "UPI",
        paymentStatus: "pending",
        orderType: "dine_in",
        serviceDate: "2026-11-08",
        guests: 3,
        tableTag: "Table 7",
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.record.order.status).toBe("pending");
    expect(built.record.order.payment_status).toBe("pending");
    expect(built.record.order.amount_paid).toBe(0);
    expect(built.record.order.payment_method).toBe("UPI");
    expect(built.record.order.order_type).toBe("dine_in");
    expect(built.record.order.service_date).toBe("2026-11-08");
    expect(built.record.order.guests).toBe(3);
    expect(built.record.order.table_tag).toBe("Table 7");
  });

  it("saves a payment-pending bill with null payment_method", () => {
    const built = buildOrderRecord({
      ...base,
      input: {
        customerId: null,
        lines: [{ productId: "p1", quantity: 1 }],
        paymentMethod: "",
        paymentStatus: "pending",
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.record.order.status).toBe("pending");
    expect(built.record.order.payment_method).toBeNull();
  });

  it("keeps saveAsQuote bills as draft quotations", () => {
    const built = buildOrderRecord({
      ...base,
      input: {
        customerId: null,
        lines: [{ productId: "p1", quantity: 1 }],
        paymentMethod: "",
        paymentStatus: "pending",
        saveAsQuote: true,
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.record.order.status).toBe("draft");
    expect(built.record.order.public_token).not.toBeNull();
  });

  it("defaults service_date to today's local day key when absent", () => {
    const built = buildOrderRecord({
      ...base,
      input: {
        customerId: null,
        lines: [{ productId: "p1", quantity: 1 }],
        paymentMethod: "Cash",
        paymentStatus: "pending",
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.record.order.service_date).toBe(localDayKey(new Date()));
  });

  it("falls back to today when serviceDate is garbage", () => {
    const built = buildOrderRecord({
      ...base,
      input: {
        customerId: null,
        lines: [{ productId: "p1", quantity: 1 }],
        paymentMethod: "Cash",
        paymentStatus: "pending",
        serviceDate: "not-a-date",
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.record.order.service_date).toBe(localDayKey(new Date()));
  });

  it("stores delivery address and payment reference trimmed", () => {
    const built = buildOrderRecord({
      ...base,
      input: {
        customerId: null,
        lines: [{ productId: "p1", quantity: 1 }],
        paymentMethod: "UPI",
        paymentStatus: "pending",
        orderType: "delivery",
        deliveryAddress: "  12 MG Road  ",
        paymentReference: "  Zomato-1234  ",
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.record.order.delivery_address).toBe("12 MG Road");
    expect(built.record.order.payment_reference).toBe("Zomato-1234");
  });

  it("adds untaxed delivery & installation charges to a project bill", () => {
    const built = buildOrderRecord({
      ...base,
      input: {
        customerId: null,
        lines: [{ productId: "p1", quantity: 2 }],
        paymentMethod: "UPI",
        paymentStatus: "pending",
        feesTotal: 2500,
        deliveryAddress: "Third floor, Adajan, Surat",
      },
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.record.order.subtotal).toBe(440);
    expect(built.record.order.tax_total).toBe(22);
    expect(built.record.order.fees_total).toBe(2500);
    expect(built.record.order.grand_total).toBe(2962);
  });

  it("rejects a negative charges amount", () => {
    const built = buildOrderRecord({
      ...base,
      input: {
        customerId: null,
        lines: [{ productId: "p1", quantity: 1 }],
        paymentMethod: "Cash",
        paymentStatus: "pending",
        feesTotal: -100,
      },
    });
    expect(built.ok).toBe(false);
  });

  it("rejects an unavailable product like an inactive one", () => {
    const built = buildOrderRecord({
      ...base,
      products: [{ ...product, unavailable: true }],
      input: {
        customerId: null,
        lines: [{ productId: "p1", quantity: 1 }],
        paymentMethod: "Cash",
        paymentStatus: "pending",
      },
    });
    expect(built.ok).toBe(false);
    if (built.ok) return;
    expect(built.message).toBe("A product on this bill is invalid or inactive.");
  });
});