import { describe, expect, it } from "vitest";
import {
  appointmentsForDay,
  buildRecentActivity,
  staffAvailability,
  stockAlerts,
} from "@/lib/dashboard/feed";
import type { AuditLogEntry, Order, Product } from "@/types/database";
import type { StaffMember } from "@/types/manager";
import type { Appointment } from "@/types/operations";

const NOW = new Date(2026, 10, 16, 9, 0, 0);
const DAY = 86_400_000;

function at(days: number, hours = 10): string {
  const date = new Date(NOW.getTime() + days * DAY);
  date.setHours(hours, 0, 0, 0);
  return date.toISOString();
}

function order(over: Partial<Order> = {}): Order {
  return {
    id: "o1",
    brand_id: "b1",
    order_number: "BC-101",
    status: "completed",
    payment_status: "paid",
    customer_id: null,
    customer_name_snapshot: "Ananya",
    subtotal: 500,
    discount_total: 0,
    tax_total: 0,
    fees_total: 0,
    grand_total: 500,
    notes: null,
    created_at: at(0, 11),
    ...over,
  };
}

function audit(over: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: "a1",
    brand_id: "b1",
    actor_email: "owner@example.com",
    action: "payment.recorded",
    entity_type: "order",
    entity_id: "o9",
    detail: null,
    created_at: at(-1, 18),
    ...over,
  };
}

function appointment(over: Partial<Appointment> = {}): Appointment {
  return {
    id: "ap1",
    brand_id: "b1",
    title: "Coffee tasting",
    customerId: "c1",
    staffIds: ["st1"],
    startsAt: at(0, 16),
    endsAt: at(0, 17),
    location: "Cafe counter",
    serviceId: null,
    status: "scheduled",
    notes: "",
    ...over,
  };
}

function staff(over: Partial<StaffMember> = {}): StaffMember {
  return {
    id: "st1",
    brand_id: "b1",
    name: "Ravi",
    role: "cashier",
    phone: null,
    email: null,
    status: "active",
    availability: "available",
    created_at: at(-30),
    ...over,
  };
}

function product(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    brand_id: "b1",
    name: "Flat White",
    description: null,
    sku: null,
    category: "Coffee",
    price: 220,
    unit: "cup",
    is_active: true,
    stock_qty: 4,
    low_stock_threshold: 6,
    ...over,
  };
}

describe("buildRecentActivity", () => {
  it("merges orders and audit rows newest first", () => {
    const rows = buildRecentActivity({
      orders: [order({ id: "o1", created_at: at(0, 8) })],
      audit: [audit({ id: "a1", created_at: at(0, 12) })],
      currencyCode: "INR",
    });
    expect(rows.map((row) => row.kind)).toEqual(["audit", "order"]);
    expect(rows[0]).toMatchObject({ label: "Payment recorded", href: "/orders/o9" });
    expect(rows[1]?.detail).toContain("Ananya");
  });

  it("keeps one entry per order when the audit log repeats its creation", () => {
    const rows = buildRecentActivity({
      orders: [order({ id: "o1" })],
      audit: [audit({ id: "a1", action: "order.created", entity_id: "o1" })],
      currencyCode: "INR",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("order");
  });

  it("humanises unknown audit actions and caps the feed", () => {
    const rows = buildRecentActivity({
      orders: [order({ id: "o1" }), order({ id: "o2", order_number: "BC-102" })],
      audit: [
        audit({
          id: "a1",
          action: "offer.redeemed",
          entity_type: "product",
          created_at: at(1, 8),
        }),
      ],
      currencyCode: "INR",
      limit: 1,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      label: "Offer redeemed",
      href: "/manager/products/catalogue",
    });
  });
});

describe("appointmentsForDay", () => {
  it("returns only today's scheduled bookings, soonest first, with staff names", () => {
    const rows = appointmentsForDay(
      [
        appointment({ id: "ap2", title: "Site visit", startsAt: at(0, 18), staffIds: ["st2"] }),
        appointment({ id: "ap1", title: "Coffee tasting", startsAt: at(0, 16) }),
        appointment({ id: "ap3", title: "Tomorrow", startsAt: at(1, 10) }),
        appointment({ id: "ap4", title: "Cancelled", status: "cancelled" }),
      ],
      [staff()],
      NOW,
    );
    expect(rows.map((row) => row.id)).toEqual(["ap1", "ap2"]);
    expect(rows[0]?.staffNames).toEqual(["Ravi"]);
    expect(rows[1]?.staffNames).toEqual(["Unassigned"]);
  });
});

describe("stockAlerts", () => {
  it("lists reorder candidates lowest first", () => {
    const rows = stockAlerts([
      product({ id: "p1", stock_qty: 4 }),
      product({ id: "p2", name: "Beans", stock_qty: 0 }),
      product({ id: "p3", name: "Cups", stock_qty: 40 }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["p2", "p1"]);
    expect(rows[0]).toEqual({ id: "p2", name: "Beans", stock: 0, threshold: 6 });
  });
});

describe("staffAvailability", () => {
  it("counts availability buckets and passes the on-shift number through", () => {
    const summary = staffAvailability(
      [
        staff({ id: "st1" }),
        staff({ id: "st2", availability: "busy" }),
        staff({ id: "st3", availability: "off" }),
        staff({ id: "st4", status: "inactive" }),
      ],
      2,
    );
    expect(summary).toEqual({
      active: 3,
      available: 1,
      busy: 1,
      off: 1,
      onShiftNow: 2,
    });
  });
});
