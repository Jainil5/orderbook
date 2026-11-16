import { describe, expect, it } from "vitest";
import { buildInsights, previousRange, type InsightInput } from "@/lib/analytics/insights";
import type { Expense } from "@/types/business";
import type { Order, OrderItem, Payment, Product, Refund } from "@/types/database";

const RANGE = { from: "2026-03-01", to: "2026-03-31" };
/** Ageing is measured against "now"; the report window is March 2026. */
const NOW = new Date("2026-04-01T12:00:00.000Z");

function product(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    brand_id: "b1",
    name: "Flat White",
    description: null,
    sku: null,
    category: "Coffee",
    price: 220,
    cost_price: 55,
    unit: "cup",
    is_active: true,
    stock_qty: 20,
    low_stock_threshold: 5,
    ...over,
  };
}

function order(over: Partial<Order> = {}): Order {
  return {
    id: "o1",
    brand_id: "b1",
    order_number: "BC-1001",
    status: "completed",
    payment_status: "paid",
    customer_id: "c1",
    customer_name_snapshot: "Ananya",
    subtotal: 540,
    discount_total: 0,
    tax_total: 0,
    fees_total: 0,
    grand_total: 540,
    notes: null,
    created_at: "2026-03-05T10:00:00.000Z",
    amount_paid: 540,
    ...over,
  };
}

function item(over: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "i1",
    order_id: "o1",
    product_id: "p1",
    product_name_snapshot: "Flat White",
    quantity: 2,
    unit_price: 220,
    line_discount: 0,
    line_total: 440,
    ...over,
  };
}

function payment(over: Partial<Payment> = {}): Payment {
  return {
    id: "pay1",
    brand_id: "b1",
    order_id: "o1",
    amount: 540,
    method: "UPI",
    status: "paid",
    created_at: "2026-03-05T10:00:00.000Z",
    ...over,
  };
}

function refund(over: Partial<Refund> = {}): Refund {
  return {
    id: "r1",
    brand_id: "b1",
    order_id: "o1",
    payment_id: "pay1",
    amount: 100,
    reason: "Wrong order",
    created_at: "2026-03-20T10:00:00.000Z",
    ...over,
  };
}

function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    brand_id: "b1",
    title: "Rent",
    category: "rent",
    amount: 700,
    method: "bank",
    incurredOn: "2026-03-10",
    recurring: "monthly",
    supplierId: null,
    notes: "",
    created_at: "2026-03-10T10:00:00.000Z",
    ...over,
  };
}

const PRODUCTS = [
  product(),
  product({ id: "p2", name: "Croissant", category: "Food", price: 100, cost_price: 80 }),
  product({ id: "p3", name: "Beans 1kg", category: "Grocery", price: 500, cost_price: 100 }),
];

const MARCH_ITEMS = [
  item(),
  item({ id: "i2", product_id: "p2", product_name_snapshot: "Croissant", quantity: 1, unit_price: 100, line_total: 100 }),
];

function input(over: Partial<InsightInput> = {}): InsightInput {
  return {
    orders: [],
    orderItems: [],
    products: PRODUCTS,
    payments: [],
    refunds: [],
    expenses: [],
    range: RANGE,
    currencyCode: "INR",
    now: NOW,
    ...over,
  };
}

function find(rows: ReturnType<typeof buildInsights>, id: string) {
  return rows.find((row) => row.id === id);
}

describe("previousRange", () => {
  it("returns the immediately preceding period of equal length", () => {
    expect(previousRange(RANGE)).toEqual({ from: "2026-01-29", to: "2026-02-28" });
  });

  it("refuses to compare an unbounded or malformed range", () => {
    expect(previousRange({ from: "1970-01-01", to: "9999-12-31" })).toBeNull();
    expect(previousRange({ from: "all", to: "9999-12-31" })).toBeNull();
  });
});

describe("buildInsights", () => {
  it("returns nothing at all when the workspace has no records", () => {
    expect(buildInsights(input({ products: [] }))).toEqual([]);
    expect(buildInsights(input())).toEqual([]);
  });

  it("reports revenue growth against the previous period", () => {
    const rows = buildInsights(
      input({
        orders: [
          order(),
          order({ id: "o2", order_number: "BC-1002", created_at: "2026-03-06T10:00:00.000Z" }),
          order({
            id: "o0",
            order_number: "BC-900",
            created_at: "2026-02-10T10:00:00.000Z",
            grand_total: 600,
            subtotal: 600,
            amount_paid: 600,
          }),
        ],
        orderItems: MARCH_ITEMS,
      }),
    );
    const revenue = find(rows, "revenue-vs-previous");
    expect(revenue?.severity).toBe("positive");
    expect(revenue?.metric).toEqual({ label: "Change", value: "+80%" });
    expect(revenue?.actionHref).toBe("/analytics?tab=trends");
  });

  it("escalates a steep decline", () => {
    const rows = buildInsights(
      input({
        orders: [
          order({ grand_total: 300, subtotal: 300, amount_paid: 300 }),
          order({
            id: "o0",
            created_at: "2026-02-10T10:00:00.000Z",
            grand_total: 600,
            subtotal: 600,
            amount_paid: 600,
          }),
        ],
      }),
    );
    const revenue = find(rows, "revenue-vs-previous");
    expect(revenue?.severity).toBe("critical");
    expect(revenue?.metric.value).toBe("-50%");
    expect(revenue?.headline).toContain("down");
    expect(revenue?.actionHref).toBe("/offers");
  });

  it("skips the comparison when the previous period has no sales to compare with", () => {
    const rows = buildInsights(input({ orders: [order()], orderItems: MARCH_ITEMS }));
    expect(find(rows, "revenue-vs-previous")).toBeUndefined();
    expect(find(rows, "margin-overall")).toBeDefined();
  });

  it("handles a single order without inventing a seller ranking", () => {
    const rows = buildInsights(
      input({
        orders: [
          order({
            grand_total: 440,
            subtotal: 440,
            amount_paid: 440,
            customer_id: null,
          }),
        ],
        orderItems: [item()],
      }),
    );
    expect(rows.map((row) => row.id)).toContain("margin-overall");
    expect(find(rows, "sellers-range")).toBeUndefined();
    expect(find(rows, "customers-repeat-rate")).toBeUndefined();
    const dead = find(rows, "inventory-dead-stock");
    expect(dead?.severity).toBe("warning");
    expect(dead?.headline).toContain("2 products had no sales");
  });

  it("flags thin margin and the weakest category", () => {
    const rows = buildInsights(
      input({
        orders: [order()],
        orderItems: [
          item({ quantity: 2, unit_price: 220, line_total: 440 }),
          item({
            id: "i2",
            product_id: "p2",
            product_name_snapshot: "Croissant",
            quantity: 5,
            unit_price: 100,
            line_total: 500,
          }),
        ],
      }),
    );
    // 940 revenue, 110 + 400 cost = 510 -> 45.7% overall, Food 20%.
    const overall = find(rows, "margin-overall");
    expect(overall?.severity).toBe("positive");
    expect(overall?.metric.value).toBe("45.7%");
    const weakest = find(rows, "margin-weakest-category");
    expect(weakest?.headline).toContain("Food");
    expect(weakest?.metric.value).toBe("20.0%");
  });

  it("calls a below-cost period critical", () => {
    const rows = buildInsights(
      input({
        orders: [order({ grand_total: 1000, subtotal: 1000, amount_paid: 1000 })],
        orderItems: [item({ quantity: 20, unit_price: 50, line_total: 1000, product_id: "p2" })],
      }),
    );
    const overall = find(rows, "margin-overall");
    // 1000 revenue against 20 x 80 = 1600 of cost.
    expect(overall?.severity).toBe("critical");
    expect(overall?.metric.value).toBe("-60.0%");
  });

  it("measures repeat business", () => {
    const rows = buildInsights(
      input({
        orders: [
          order(),
          order({ id: "o2", order_number: "BC-1002", created_at: "2026-03-06T10:00:00.000Z" }),
          order({
            id: "o3",
            order_number: "BC-1003",
            created_at: "2026-03-07T10:00:00.000Z",
            customer_id: "c2",
          }),
        ],
        orderItems: MARCH_ITEMS,
      }),
    );
    const repeat = find(rows, "customers-repeat-rate");
    expect(repeat?.severity).toBe("positive");
    expect(repeat?.metric.value).toBe("50%");
  });

  it("compares expenses with revenue inside the range only", () => {
    const rows = buildInsights(
      input({
        orders: [order()],
        orderItems: MARCH_ITEMS,
        expenses: [
          expense(),
          expense({ id: "e2", category: "utilities", amount: 200 }),
          expense({ id: "e3", incurredOn: "2026-01-05", amount: 5000 }),
        ],
      }),
    );
    const spend = find(rows, "cashflow-expenses");
    // 900 of March spend against 540 of sales.
    expect(spend?.severity).toBe("critical");
    expect(spend?.metric.value).toBe("167%");
    expect(spend?.detail).toContain("rent at ₹700");
  });

  it("reports receivables ageing as a risk", () => {
    const rows = buildInsights(
      input({
        orders: [
          order({
            payment_status: "partial",
            amount_paid: 40,
            created_at: "2026-01-20T10:00:00.000Z",
          }),
        ],
      }),
    );
    const risk = find(rows, "risk-receivables-ageing");
    expect(risk?.severity).toBe("critical");
    expect(risk?.headline).toContain("over 30 days old");
    expect(risk?.actionHref).toBe("/manager/finance/receivables");
  });

  it("tracks refunds and collections", () => {
    const rows = buildInsights(
      input({
        orders: [order({ payment_status: "partial", amount_paid: 200 })],
        orderItems: MARCH_ITEMS,
        payments: [payment({ amount: 200 })],
        refunds: [refund({ amount: 100 })],
      }),
    );
    expect(find(rows, "risk-refunds")?.severity).toBe("warning");
    const collections = find(rows, "cashflow-collections");
    expect(collections?.metric.value).toBe("37%");
    expect(collections?.severity).toBe("warning");
  });

  it("orders problems before positives and neutral notes", () => {
    const rows = buildInsights(
      input({
        orders: [
          order({ grand_total: 300, subtotal: 300, amount_paid: 300 }),
          order({
            id: "o0",
            created_at: "2026-02-10T10:00:00.000Z",
            grand_total: 600,
            subtotal: 600,
            amount_paid: 600,
          }),
        ],
        orderItems: MARCH_ITEMS,
        expenses: [expense({ amount: 50 })],
      }),
    );
    expect(rows.length).toBeGreaterThan(3);
    expect(rows[0]?.severity).toBe("critical");
    expect(rows.map((row) => row.severity)).toEqual(
      [...rows.map((row) => row.severity)].sort(
        (a, b) =>
          ["critical", "warning", "positive", "info"].indexOf(a) -
          ["critical", "warning", "positive", "info"].indexOf(b),
      ),
    );
  });
});
