import { describe, expect, it } from "vitest";
import { isoDayOf } from "@/lib/business/overview";
import {
  INVOICE_FOLLOW_UP_AFTER_DAYS,
  QUOTE_STALE_AFTER_DAYS,
  THIN_MARGIN_PERCENT,
  buildBusinessContext,
} from "@/lib/ai/context";
import {
  NOW,
  TODAY,
  WINDOW,
  addDays,
  appointment,
  baseInput,
  cashMovement,
  cashSession,
  customer,
  dayInstant,
  expense,
  order,
  orderItem,
  product,
  purchaseOrder,
  shift,
  staff,
  supplier,
  task,
} from "@/lib/ai/fixtures";

function build(over: Parameters<typeof baseInput>[0] = {}, now = NOW) {
  return buildBusinessContext(baseInput(over), now);
}

describe("buildBusinessContext — the empty workspace", () => {
  const ctx = build();

  it("produces a context with nothing invented in it", () => {
    expect(ctx.sales.revenue).toBe(0);
    expect(ctx.sales.orders).toBe(0);
    expect(ctx.sales.changePercent).toBeNull();
    expect(ctx.sales.bestDay).toBeNull();
    expect(ctx.sales.topCategory).toBeNull();
    expect(ctx.products.bestSellers).toEqual([]);
    expect(ctx.products.notSelling).toEqual([]);
    expect(ctx.margin.marginPercent).toBe(0);
    expect(ctx.receivables.count).toBe(0);
    expect(ctx.receivables.oldestDays).toBeNull();
    expect(ctx.quotes.openCount).toBe(0);
    expect(ctx.inventory.lowStock).toEqual([]);
    expect(ctx.inventory.tracked).toBe(0);
    expect(ctx.tasks.open).toBe(0);
    expect(ctx.appointments.today).toEqual([]);
    expect(ctx.staff.active).toBe(0);
    expect(ctx.staff.onShiftNow).toEqual([]);
    expect(ctx.expenses.thisMonth).toBe(0);
    expect(ctx.expenses.changePercent).toBeNull();
    expect(ctx.purchaseOrders.open).toEqual([]);
    expect(ctx.cash.hasSessionToday).toBe(false);
  });

  it("keeps the window arithmetic honest", () => {
    expect(ctx.window.days).toBe(30);
    expect(ctx.window.to).toBe(WINDOW.to);
    expect(ctx.previousWindow.to).toBe(addDays(WINDOW.from, -1));
    expect(ctx.generatedAt).toBe(NOW.toISOString());
    expect(ctx.today).toBe(TODAY);
  });
});

describe("buildBusinessContext — sales", () => {
  it("counts only orders inside the window and ignores cancelled ones", () => {
    const ctx = build({
      orders: [
        order({ id: "o1", created_at: dayInstant(2) }),
        order({
          id: "o2",
          order_number: "BC-1002",
          created_at: dayInstant(1),
          status: "cancelled",
          grand_total: 999,
        }),
        order({
          id: "o3",
          order_number: "BC-1003",
          created_at: dayInstant(60),
          grand_total: 5000,
        }),
      ],
    });
    expect(ctx.sales.orders).toBe(1);
    expect(ctx.sales.revenue).toBe(540);
    expect(ctx.sales.averageOrderValue).toBe(540);
  });

  it("compares against the previous window, and refuses a trend without a baseline", () => {
    const withBaseline = build({
      orders: [
        order({ id: "o1", created_at: dayInstant(1), grand_total: 600 }),
        order({
          id: "o2",
          order_number: "BC-2",
          created_at: dayInstant(35),
          grand_total: 300,
        }),
      ],
    });
    expect(withBaseline.sales.previousRevenue).toBe(300);
    expect(withBaseline.sales.changePercent).toBeCloseTo(100, 6);

    const noBaseline = build({
      orders: [order({ created_at: dayInstant(1) })],
    });
    expect(noBaseline.sales.previousRevenue).toBe(0);
    expect(noBaseline.sales.changePercent).toBeNull();
  });

  it("ranks best sellers by revenue and names the top category", () => {
    const ctx = build({
      products: [
        product({ id: "p1", name: "Flat White", category: "Coffee" }),
        product({ id: "p2", name: "Croissant", category: "Food", price: 150 }),
        product({ id: "p3", name: "Decaf 250g", category: "Grocery", price: 500 }),
      ],
      orders: [order({ id: "o1", created_at: dayInstant(1), grand_total: 1000 })],
      orderItems: [
        orderItem({ id: "i1", quantity: 2, line_total: 440 }),
        orderItem({
          id: "i2",
          order_id: "o1",
          product_id: "p2",
          product_name_snapshot: "Croissant",
          quantity: 6,
          unit_price: 150,
          line_total: 900,
        }),
      ],
    });
    expect(ctx.products.bestSellers[0]?.name).toBe("Croissant");
    expect(ctx.products.bestSellers[0]?.revenue).toBe(900);
    expect(ctx.sales.topCategory).toEqual({ name: "Food", revenue: 900 });
    expect(ctx.products.notSelling.map((row) => row.name)).toEqual(["Decaf 250g"]);
  });
});

describe("buildBusinessContext — stock", () => {
  const ctx = build({
    products: [
      product({ id: "p0", name: "Sold out bean", stock_qty: 0, low_stock_threshold: 5 }),
      product({ id: "p1", name: "Flat White", stock_qty: 3, low_stock_threshold: 10 }),
      product({ id: "p2", name: "Full shelf", stock_qty: 40, low_stock_threshold: 10 }),
      product({ id: "p3", name: "No threshold", stock_qty: 1, low_stock_threshold: null }),
      product({ id: "p4", name: "Retired", stock_qty: 0, low_stock_threshold: 5, is_active: false }),
    ],
  });

  it("splits zero stock from low stock and ignores untracked or inactive lines", () => {
    expect(ctx.inventory.outOfStock.map((row) => row.id)).toEqual(["p0"]);
    expect(ctx.inventory.lowStock.map((row) => row.id)).toEqual(["p1"]);
    expect(ctx.inventory.tracked).toBe(3);
  });

  it("suggests a reorder quantity from the product's own threshold", () => {
    const low = ctx.inventory.lowStock[0];
    expect(low?.stock).toBe(3);
    expect(low?.threshold).toBe(10);
    expect(low?.suggestedReorderQty).toBe(17);
    expect(ctx.inventory.outOfStock[0]?.suggestedReorderQty).toBe(10);
  });

  it("values inventory on the same basis the Products Manager uses", () => {
    expect(ctx.inventory.valuation.units).toBe(44);
    expect(ctx.inventory.valuation.costValue).toBe(44 * 55);
  });
});

describe("buildBusinessContext — money owed", () => {
  const ctx = build({
    orders: [
      order({
        id: "o1",
        order_number: "BC-OLD",
        created_at: dayInstant(12),
        payment_status: "pending",
        amount_paid: 40,
        grand_total: 540,
      }),
      order({
        id: "o2",
        order_number: "BC-NEW",
        created_at: dayInstant(1),
        payment_status: "partial",
        amount_paid: 500,
        grand_total: 540,
      }),
      order({ id: "o3", order_number: "BC-SETTLED", created_at: dayInstant(4), amount_paid: 540 }),
      order({
        id: "o4",
        order_number: "BC-QUOTE",
        created_at: dayInstant(9),
        status: "draft",
        payment_status: "pending",
        amount_paid: 0,
        grand_total: 2000,
      }),
    ],
  });

  it("measures the balance as grand total minus what has been paid", () => {
    expect(ctx.receivables.rows.map((row) => row.id)).toEqual(["o1", "o4", "o2"]);
    expect(ctx.receivables.rows[0]?.amount).toBe(500);
    expect(ctx.receivables.total).toBe(500 + 2000 + 40);
  });

  it("ages from issue date because invoices carry no due date", () => {
    const aged = ctx.receivables.rows.filter((row) => row.days >= INVOICE_FOLLOW_UP_AFTER_DAYS);
    expect(aged.map((row) => row.id)).toEqual(["o1", "o4"]);
    expect(ctx.receivables.agedCount).toBe(2);
    expect(ctx.receivables.oldestDays).toBe(12);
    expect(ctx.receivables.overdueAfterDays).toBe(INVOICE_FOLLOW_UP_AFTER_DAYS);
  });

  it("separates silent quotations by age", () => {
    expect(ctx.quotes.openCount).toBe(1);
    expect(ctx.quotes.openValue).toBe(2000);
    expect(ctx.quotes.staleCount).toBe(1);
    expect(ctx.quotes.staleAfterDays).toBe(QUOTE_STALE_AFTER_DAYS);
  });
});

describe("buildBusinessContext — work, people and cash", () => {
  it("counts overdue and due-today tasks", () => {
    const ctx = build({
      tasks: [
        task({ id: "t1", dueAt: dayInstant(3, 20) }),
        task({ id: "t2", dueAt: dayInstant(0, 20), title: "Due today" }),
        task({ id: "t3", dueAt: dayInstant(10), status: "done" }),
        task({ id: "t4", dueAt: null }),
      ],
    });
    expect(ctx.tasks.open).toBe(3);
    expect(ctx.tasks.overdue).toBe(1);
    expect(ctx.tasks.dueToday).toBe(1);
  });

  it("splits today's bookings from the next 24 hours", () => {
    const ctx = build({
      customers: [customer()],
      appointments: [
        appointment({ id: "a1", startsAt: `${TODAY}T10:00:00.000Z` }),
        appointment({
          id: "a2",
          title: "Tomorrow",
          startsAt: new Date(NOW.getTime() + 6 * 3_600_000).toISOString(),
        }),
        appointment({
          id: "a3",
          title: "Next week",
          startsAt: new Date(NOW.getTime() + 96 * 3_600_000).toISOString(),
        }),
        appointment({ id: "a4", title: "Cancelled", status: "cancelled" }),
      ],
    });
    expect(ctx.appointments.today.map((row) => row.id)).toEqual(["a1", "a2"]);
    expect(ctx.appointments.nextTwentyFourHours.map((row) => row.id)).toEqual(["a1", "a2"]);
    expect(ctx.appointments.today[0]?.customerName).toBe("Ananya Rao");
  });

  it("agrees with computeRollups on who is on shift right now", () => {
    const ctx = build({
      staff: [staff({ id: "s1" }), staff({ id: "s2", availability: "busy" })],
      shifts: [
        shift({ id: "sh1", staffId: "s1" }),
        shift({ id: "sh2", staffId: "s2", start: "00:00", end: "01:00" }),
        shift({ id: "sh3", staffId: "s2", date: addDays(TODAY, 1) }),
      ],
    });
    expect(ctx.staff.onShiftNow.map((row) => row.id)).toEqual(["s1"]);
    expect(ctx.staff.onShiftNow.length).toBe(ctx.rollups.onShiftNow);
    expect(ctx.staff.scheduledToday).toBe(2);
    expect(ctx.staff.available).toBe(1);
    expect(ctx.staff.busy).toBe(1);
  });

  it("sums today's cash and notices an unclosed session", () => {
    const ctx = build({
      cashMovements: [
        cashMovement({ id: "cm1", amount: 1500, direction: "in" }),
        cashMovement({ id: "cm2", amount: 400, direction: "out", reason: "Milk" }),
        cashMovement({ id: "cm3", amount: 9999, date: addDays(TODAY, -2) }),
      ],
      cashSessions: [cashSession()],
    });
    expect(ctx.cash.todayIn).toBe(1500);
    expect(ctx.cash.todayOut).toBe(400);
    expect(ctx.cash.netToday).toBe(1100);
    expect(ctx.cash.hasSessionToday).toBe(true);
    expect(ctx.cash.sessionClosedToday).toBe(false);
  });

  it("only treats a purchase order as late once its date has passed", () => {
    const ctx = build({
      suppliers: [supplier()],
      purchaseOrders: [
        purchaseOrder({ id: "po1", expectedOn: addDays(TODAY, -2) }),
        purchaseOrder({ id: "po2", poNumber: "PO-2", expectedOn: addDays(TODAY, 3) }),
        purchaseOrder({
          id: "po3",
          poNumber: "PO-3",
          status: "received",
          expectedOn: addDays(TODAY, -5),
        }),
      ],
    });
    expect(ctx.purchaseOrders.open.map((row) => row.id)).toEqual(["po1", "po2"]);
    expect(ctx.purchaseOrders.lateCount).toBe(1);
    expect(ctx.purchaseOrders.open[0]?.supplierName).toBe("Bean Wholesale Co");
  });
});

describe("buildBusinessContext — expenses and margin", () => {
  it("compares this month with last month and lists the largest lines", () => {
    const ctx = build({
      expenses: [
        expense({ id: "e1", amount: 3000, incurredOn: TODAY }),
        expense({ id: "e2", amount: 1000, title: "Milk", category: "raw_materials", incurredOn: TODAY }),
        expense({ id: "e3", amount: 2000, incurredOn: addDays(`${TODAY.slice(0, 7)}-01`, -1) }),
      ],
    });
    expect(ctx.expenses.thisMonth).toBe(4000);
    expect(ctx.expenses.thisMonthCount).toBe(2);
    expect(ctx.expenses.previousMonth).toBe(2000);
    expect(ctx.expenses.changePercent).toBeCloseTo(100, 6);
    expect(ctx.expenses.top[0]?.title).toBe("Rent");
  });

  it("reports blended margin and the lines under the thin-margin bar", () => {
    const ctx = build({
      products: [
        product({ id: "p1", price: 220, cost_price: 55 }),
        product({ id: "p2", name: "Croissant", price: 100, cost_price: 90 }),
      ],
      orders: [order({ id: "o1", created_at: dayInstant(1), grand_total: 1000 })],
      orderItems: [
        orderItem({ id: "i1", quantity: 2, line_total: 440 }),
        orderItem({
          id: "i2",
          order_id: "o1",
          product_id: "p2",
          product_name_snapshot: "Croissant",
          quantity: 1,
          unit_price: 100,
          line_total: 100,
        }),
      ],
    });
    expect(ctx.margin.revenue).toBe(540);
    expect(ctx.margin.cost).toBe(2 * 55 + 90);
    expect(ctx.margin.thinLines.every((line) => line.marginPercent < THIN_MARGIN_PERCENT)).toBe(
      true,
    );
    expect(ctx.margin.thinLines.map((line) => line.name)).toContain("Croissant");
  });
});

describe("buildBusinessContext — purity", () => {
  it("takes the clock as an argument instead of reading it from the process", () => {
    const other = new Date("2026-01-15T10:00:00.000Z");
    const ctx = build({}, other);
    expect(ctx.generatedAt).toBe(other.toISOString());
    expect(ctx.today).toBe(isoDayOf(other));
  });

  it("returns the same numbers for the same records", () => {
    const input = baseInput({
      orders: [order({ created_at: dayInstant(2) })],
      products: [product({ stock_qty: 2 })],
      tasks: [task()],
    });
    expect(buildBusinessContext(input, NOW)).toEqual(buildBusinessContext(input, NOW));
  });
});
