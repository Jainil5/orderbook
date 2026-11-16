import { describe, expect, it } from "vitest";
import { computeRollups } from "@/lib/business/overview";
import {
  buildDashboardNotifications,
  daysSinceCalendarDate,
} from "@/lib/dashboard/notifications";
import type { LeaveRequest, PurchaseOrder } from "@/types/business";
import type { Order, Product } from "@/types/database";
import type { Task } from "@/types/operations";

/** Local (server-tz) instants, because `isoDayOf` defines "today" locally. */
const NOW = new Date(2026, 10, 16, 9, 0, 0);
const DAY = 86_400_000;

function dayOffset(days: number): string {
  return new Date(NOW.getTime() + days * DAY).toISOString();
}

function calendarOffset(days: number): string {
  return new Date(NOW.getTime() + days * DAY).toISOString().slice(0, 10);
}

function order(over: Partial<Order> = {}): Order {
  return {
    id: "o1",
    brand_id: "b1",
    order_number: "BC-1",
    status: "completed",
    payment_status: "partial",
    customer_id: null,
    customer_name_snapshot: "Ananya",
    subtotal: 1000,
    discount_total: 0,
    tax_total: 0,
    fees_total: 0,
    grand_total: 1000,
    notes: null,
    created_at: dayOffset(-3),
    amount_paid: 400,
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
    stock_qty: 12,
    low_stock_threshold: 5,
    ...over,
  };
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    brand_id: "b1",
    title: "Restock oat milk",
    description: "",
    assigneeStaffId: null,
    customerId: null,
    priority: "high",
    dueAt: dayOffset(-2),
    status: "open",
    ...over,
  };
}

function purchaseOrder(over: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po1",
    brand_id: "b1",
    poNumber: "PO-24",
    supplierId: "s1",
    status: "ordered",
    expectedOn: calendarOffset(-4),
    createdAt: calendarOffset(-14),
    lines: [],
    notes: "",
    ...over,
  };
}

function leave(over: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: "lv1",
    brand_id: "b1",
    staffId: "st1",
    startsOn: calendarOffset(3),
    endsOn: calendarOffset(5),
    kind: "casual",
    status: "pending",
    reason: "Family function",
    createdAt: calendarOffset(-1),
    ...over,
  };
}

function input(over: Partial<Parameters<typeof buildDashboardNotifications>[0]> = {}) {
  const base = {
    orders: [] as Order[],
    products: [] as Product[],
    tasks: [] as Task[],
    leave: [] as LeaveRequest[],
    purchaseOrders: [] as PurchaseOrder[],
    currencyCode: "INR",
    now: NOW,
  };
  const merged = { ...base, ...over };
  return {
    ...merged,
    rollups:
      merged.rollups ??
      computeRollups(
        {
          orders: merged.orders,
          products: merged.products,
          tasks: merged.tasks,
          appointments: [],
          shifts: [],
          expenses: [],
          purchaseOrders: merged.purchaseOrders,
          leave: merged.leave,
        },
        NOW,
      ),
  };
}

describe("daysSinceCalendarDate", () => {
  it("counts whole days before today and never goes negative", () => {
    expect(daysSinceCalendarDate(calendarOffset(-3), NOW)).toBe(3);
    expect(daysSinceCalendarDate(calendarOffset(0), NOW)).toBe(0);
    expect(daysSinceCalendarDate(calendarOffset(4), NOW)).toBe(0);
    expect(daysSinceCalendarDate("not-a-date", NOW)).toBe(0);
  });
});

describe("buildDashboardNotifications", () => {
  it("returns nothing when no rule matches", () => {
    expect(buildDashboardNotifications(input())).toEqual([]);
  });

  it("flags active products at zero stock and ignores healthy or inactive ones", () => {
    const rows = buildDashboardNotifications(
      input({
        products: [
          product({ id: "p1", name: "Flat White", stock_qty: 0 }),
          product({ id: "p2", name: "Cold Brew", stock_qty: 30 }),
          product({ id: "p3", name: "Beans", stock_qty: 0, is_active: false }),
          product({ id: "p4", name: "No threshold", stock_qty: 0, low_stock_threshold: null }),
        ],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "out_of_stock",
      severity: "critical",
      count: 1,
      href: "/manager/products/inventory",
    });
    expect(rows[0]?.detail).toContain("Flat White");
  });

  it("counts invoices unpaid for more than a day, not today's balances or cancellations", () => {
    const rows = buildDashboardNotifications(
      input({
        orders: [
          order({ id: "old" }),
          order({ id: "today", created_at: dayOffset(0) }),
          order({ id: "cancelled", status: "cancelled" }),
          order({ id: "settled", payment_status: "paid", amount_paid: 1000 }),
        ],
      }),
    );
    const invoice = rows.find((row) => row.id === "overdue_invoices");
    expect(invoice?.count).toBe(1);
    expect(invoice?.severity).toBe("critical");
    expect(invoice?.href).toBe("/manager/finance/receivables");
    expect(invoice?.detail).toContain("600");
    expect(invoice?.detail).toContain("oldest 3 days");
  });

  it("reports the most overdue task", () => {
    const rows = buildDashboardNotifications(
      input({
        tasks: [
          task({ id: "t1", title: "Deep clean grinder", dueAt: dayOffset(-6) }),
          task({ id: "t2", title: "Pay supplier", dueAt: dayOffset(-1) }),
          task({ id: "t3", title: "Done already", dueAt: dayOffset(-9), status: "done" }),
          task({ id: "t4", title: "Future", dueAt: dayOffset(2) }),
        ],
      }),
    );
    const overdue = rows.find((row) => row.id === "overdue_tasks");
    expect(overdue).toMatchObject({ severity: "warning", count: 2, href: "/manager/productivity/tasks" });
    expect(overdue?.detail).toContain("Deep clean grinder");
    expect(overdue?.detail).toContain("6 days ago");
  });

  it("only flags open purchase orders whose expected date has passed", () => {
    const rows = buildDashboardNotifications(
      input({
        purchaseOrders: [
          purchaseOrder({ id: "po1", status: "ordered" }),
          purchaseOrder({ id: "po2", status: "partially_received", expectedOn: calendarOffset(-1) }),
          purchaseOrder({ id: "po3", status: "ordered", expectedOn: calendarOffset(2) }),
          purchaseOrder({ id: "po4", status: "received" }),
          purchaseOrder({ id: "po5", status: "ordered", expectedOn: null }),
        ],
      }),
    );
    const late = rows.find((row) => row.id === "purchase_order_late");
    expect(late).toMatchObject({ severity: "warning", count: 2, href: "/manager/products/procurement" });
    expect(late?.detail).toContain("PO-24");
    expect(late?.detail).toContain("4 days ago");
  });

  it("lists pending leave requests only", () => {
    const rows = buildDashboardNotifications(
      input({
        leave: [leave(), leave({ id: "lv2", status: "approved" })],
      }),
    );
    const pending = rows.find((row) => row.id === "pending_leave");
    expect(pending).toMatchObject({
      severity: "info",
      count: 1,
      href: "/manager/staff/attendance",
    });
    expect(pending?.detail).toContain("casual leave");
  });

  it("orders by severity and then by rule order", () => {
    const rows = buildDashboardNotifications(
      input({
        products: [product({ stock_qty: 0 })],
        orders: [order()],
        tasks: [task()],
        purchaseOrders: [purchaseOrder()],
        leave: [leave()],
      }),
    );
    expect(rows.map((row) => row.id)).toEqual([
      "out_of_stock",
      "overdue_invoices",
      "overdue_tasks",
      "purchase_order_late",
      "pending_leave",
    ]);
  });

  it("handles a single old invoice without other data", () => {
    const rows = buildDashboardNotifications(input({ orders: [order()] }));
    expect(rows.map((row) => row.id)).toEqual(["overdue_invoices"]);
  });
});
