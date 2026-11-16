import { describe, expect, it } from "vitest";
import { MAX_INSIGHTS, buildInsights, severityRank } from "@/lib/ai/insight-engine";
import {
  TODAY,
  addDays,
  appointment,
  cashMovement,
  cashSession,
  customer,
  dayInstant,
  expense,
  fixtureContext,
  order,
  orderItem,
  product,
  purchaseOrder,
  staff,
  supplier,
  task,
  type WorkspaceSeed,
} from "@/lib/ai/fixtures";
import type { AiInsight } from "@/lib/ai/types";

const SEVERITIES: AiInsight["severity"][] = [
  "critical",
  "warning",
  "opportunity",
  "info",
];

/** A workspace with something to say in nearly every band. */
function busy(seed: Partial<WorkspaceSeed> = {}) {
  return fixtureContext({
    customers: [customer()],
    products: [
      product({ id: "p0", name: "House Bean", stock_qty: 0, low_stock_threshold: 5 }),
      product({ id: "p1", name: "Flat White", stock_qty: 2, low_stock_threshold: 10 }),
      product({ id: "p2", name: "Decaf 250g", stock_qty: 12, low_stock_threshold: 4 }),
      product({ id: "p3", name: "Cold Brew", stock_qty: 30, low_stock_threshold: 8 }),
      product({ id: "p4", name: "Filter Paper", price: 40, cost_price: 38, stock_qty: 60, low_stock_threshold: 20 }),
    ],
    orders: [
      order({ id: "o1", order_number: "BC-9001", created_at: dayInstant(1), grand_total: 300, subtotal: 300, amount_paid: 300 }),
      order({
        id: "o2",
        order_number: "BC-9002",
        created_at: dayInstant(20),
        grand_total: 9000,
        subtotal: 9000,
        payment_status: "pending",
        amount_paid: 0,
      }),
      order({
        id: "o3",
        order_number: "BC-9003",
        created_at: dayInstant(12),
        grand_total: 4000,
        subtotal: 4000,
        payment_status: "partial",
        amount_paid: 500,
      }),
      order({
        id: "o4",
        order_number: "BC-QUOTE",
        status: "draft",
        payment_status: "pending",
        created_at: dayInstant(8),
        grand_total: 2500,
        subtotal: 2500,
        amount_paid: 0,
      }),
      order({
        id: "o5",
        order_number: "BC-9005",
        created_at: dayInstant(45),
        grand_total: 6000,
        subtotal: 6000,
        amount_paid: 6000,
      }),
    ],
    orderItems: [
      orderItem({ id: "i1", order_id: "o1", product_id: "p3", product_name_snapshot: "Cold Brew", quantity: 1, unit_price: 300, line_total: 300 }),
      orderItem({ id: "i2", order_id: "o2", product_id: "p1", product_name_snapshot: "Flat White", quantity: 10, unit_price: 220, line_total: 2200 }),
      orderItem({ id: "i3", order_id: "o3", product_id: "p4", product_name_snapshot: "Filter Paper", quantity: 100, unit_price: 40, line_total: 4000 }),
    ],
    tasks: [
      task({ id: "t1", title: "Call the printer", dueAt: dayInstant(4, 20) }),
      task({ id: "t2", title: "File GST return", dueAt: dayInstant(0, 20) }),
    ],
    appointments: [appointment({ id: "a1", title: "Consultation" })],
    // Nobody available: the staffing rule has to say something rather than assume cover.
    staff: [staff({ id: "s1", availability: "busy" }), staff({ id: "s2", name: "Meera Nair", availability: "off" })],
    expenses: [
      expense({ id: "e1", amount: 5000, title: "Rent" }),
      expense({ id: "e2", amount: 2000, title: "Electricity", category: "utilities" }),
      expense({
        id: "e3",
        amount: 1500,
        title: "Beans",
        category: "raw_materials",
        incurredOn: addDays(`${TODAY.slice(0, 7)}-01`, -1),
      }),
    ],
    suppliers: [supplier()],
    purchaseOrders: [purchaseOrder({ expectedOn: addDays(TODAY, -3) })],
    cashMovements: [
      cashMovement({ amount: 800 }),
      cashMovement({ id: "cm2", direction: "out", amount: 200 }),
    ],
    cashSessions: [cashSession()],
    ...seed,
  });
}

function build(seed: Partial<WorkspaceSeed> = {}): AiInsight[] {
  return buildInsights(busy(seed));
}

function pick(rows: AiInsight[], id: string): AiInsight | undefined {
  return rows.find((row) => row.id === id);
}

describe("insight engine — the shape of an insight", () => {
  const rows = build();

  it("always cites numbers and the names of real records", () => {
    expect(rows.length).toBe(MAX_INSIGHTS);
    for (const insight of rows) {
      expect(SEVERITIES).toContain(insight.severity);
      expect(insight.id).toBeTruthy();
      expect(insight.headline.length).toBeGreaterThan(6);
      expect(insight.detail.length).toBeGreaterThan(10);
      expect(insight.evidence.length).toBeGreaterThan(0);
      expect(Number.isFinite(insight.score)).toBe(true);
      expect(insight.actionHref.startsWith("/")).toBe(true);
      expect(insight.actionLabel.length).toBeGreaterThan(2);
      for (const row of insight.evidence) {
        expect(row.label.length).toBeGreaterThan(0);
        expect(row.value.length).toBeGreaterThan(0);
        // Every citation is checkable: it links to the screen holding the row.
        expect(row.href ?? insight.actionHref).toBeTruthy();
      }
    }
  });

  it("never pads the list past the cap", () => {
    expect(rows.length).toBeLessThanOrEqual(MAX_INSIGHTS);
  });
});

describe("insight engine — silence is the answer when data is missing", () => {
  it("returns no insights at all for an empty workspace", () => {
    expect(buildInsights(fixtureContext())).toEqual([]);
  });

  it("will not claim a sales trend without a baseline", () => {
    const rows = buildInsights(
      fixtureContext({ orders: [order({ created_at: dayInstant(2) })] }),
    );
    expect(rows.map((row) => row.id)).not.toContain("sales-down");
    expect(rows.map((row) => row.id)).not.toContain("sales-up");
  });

  it("will not claim an expense jump without last month", () => {
    const rows = buildInsights(fixtureContext({ expenses: [expense()] }));
    expect(rows.map((row) => row.id)).not.toContain("expenses-up");
  });

  it("does not mention cash closing when no session was opened", () => {
    const rows = buildInsights(fixtureContext({ cashMovements: [cashMovement()] }));
    expect(rows.map((row) => row.id)).not.toContain("cash-open-session");
  });

  it("stays quiet about stock when no product tracks a threshold", () => {
    const rows = buildInsights(
      fixtureContext({
        products: [product({ stock_qty: 0, low_stock_threshold: null })],
      }),
    );
    expect(rows).toEqual([]);
  });
});

describe("insight engine — evidence names the actual records", () => {
  it("lists the sold-out product in the critical insight", () => {
    const insight = pick(build(), "inventory-out-of-stock");
    expect(insight?.severity).toBe("critical");
    expect(insight?.evidence.map((row) => row.label)).toContain("House Bean");
    expect(insight?.evidence.find((row) => row.label === "House Bean")?.value).toContain(
      "0 left",
    );
    expect(insight?.actionHref).toBe("/manager/products/procurement");
  });

  it("pairs a low-stock line with the quantity its own threshold suggests", () => {
    const insight = pick(build(), "inventory-low-stock");
    expect(insight?.detail).toContain("Flat White (+18)");
    expect(insight?.evidence.find((row) => row.label === "Flat White")?.value).toBe(
      "2 cup left · threshold 10",
    );
  });

  it("quotes order numbers and ages for unpaid invoices", () => {
    const insight = pick(build(), "receivables-aged");
    const row = insight?.evidence.find((each) => each.label.startsWith("BC-9002"));
    expect(row?.value).toContain("20 days");
    expect(row?.href).toBe("/orders/o2");
    expect(insight?.detail).toContain("no due date");
  });

  it("names the late purchase order and its supplier", () => {
    const insight = pick(build(), "procurement-late-pos");
    expect(insight?.detail).toContain("PO-1 from Bean Wholesale Co");
    expect(insight?.evidence[0]?.value).toContain("expected");
  });

  it("points at the overdue task by title", () => {
    const insight = pick(build(), "tasks-overdue");
    expect(insight?.detail).toContain("Call the printer");
    expect(insight?.actionHref).toBe("/manager/productivity/tasks");
  });

  it("says who is missing from the rota instead of inventing cover", () => {
    const insight = pick(build(), "staffing-no-availability");
    expect(insight?.severity).toBe("warning");
    expect(insight?.metric?.value).toBe("0");
    expect(insight?.detail).toContain("busy");
  });
});

describe("insight engine — severity follows the size of the problem", () => {
  it("keeps moderate debt as a warning", () => {
    const rows = buildInsights(
      fixtureContext({
        orders: [
          order({ id: "o1", created_at: dayInstant(1), grand_total: 9000, subtotal: 9000, amount_paid: 9000 }),
          order({
            id: "o2",
            order_number: "BC-2",
            created_at: dayInstant(20),
            grand_total: 3000,
            subtotal: 3000,
            payment_status: "pending",
            amount_paid: 0,
          }),
        ],
      }),
    );
    expect(pick(rows, "receivables-aged")?.severity).toBe("warning");
  });

  it("escalates debt that outweighs everything sold in the window", () => {
    const rows = buildInsights(
      fixtureContext({
        orders: [
          order({ id: "o1", created_at: dayInstant(1), grand_total: 200, subtotal: 200, amount_paid: 200 }),
          order({
            id: "o2",
            order_number: "BC-OLD-DEBT",
            created_at: dayInstant(45),
            grand_total: 5000,
            subtotal: 5000,
            payment_status: "pending",
            amount_paid: 0,
          }),
        ],
      }),
    );
    const insight = pick(rows, "receivables-aged");
    expect(insight?.severity).toBe("critical");
    expect(insight?.headline).toContain("1 invoice");
    expect(insight?.evidence[0]?.label).toContain("BC-OLD-DEBT");
  });

  it("treats a thin blend as a warning and a thin line as an opportunity", () => {
    const blended = buildInsights(
      fixtureContext({
        products: [product({ id: "p1", price: 100, cost_price: 90 })],
        orders: [order({ created_at: dayInstant(1), grand_total: 100, subtotal: 100, amount_paid: 100 })],
        orderItems: [orderItem({ quantity: 1, unit_price: 100, line_total: 100 })],
      }),
    );
    const thin = pick(blended, "margin-thin");
    expect(thin?.severity).toBe("warning");
    expect(thin?.metric?.value).toBe("10.0%");

    const mostlyHealthy = buildInsights(
      fixtureContext({
        products: [
          product({ id: "p1", price: 220, cost_price: 55 }),
          product({ id: "p2", name: "Croissant", price: 100, cost_price: 95 }),
        ],
        orders: [order({ id: "o1", created_at: dayInstant(1), grand_total: 1400, subtotal: 1400, amount_paid: 1400 })],
        orderItems: [
          orderItem({ id: "i1", order_id: "o1", product_id: "p1", quantity: 6, unit_price: 220, line_total: 1320 }),
          orderItem({ id: "i2", order_id: "o1", product_id: "p2", product_name_snapshot: "Croissant", quantity: 1, unit_price: 80, line_total: 80 }),
        ],
      }),
    );
    const lines = pick(mostlyHealthy, "margin-thin");
    expect(lines?.severity).toBe("opportunity");
    expect(lines?.headline).toContain("below 25% margin");
  });
});

describe("insight engine — ranking is arithmetic", () => {
  it("orders by band, then score, then id", () => {
    const rows = build();
    const ranks = rows.map((row) => severityRank(row.severity));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1];
      const current = rows[i];
      if (!previous || !current) continue;
      if (previous.severity === current.severity) {
        expect(previous.score >= current.score).toBe(true);
      }
    }
    expect(severityRank("critical")).toBeLessThan(severityRank("warning"));
    expect(severityRank("warning")).toBeLessThan(severityRank("opportunity"));
    expect(severityRank("opportunity")).toBeLessThan(severityRank("info"));
  });

  it("puts sold-out stock first and a calm note last", () => {
    const rows = build();
    expect(rows[0]?.id).toBe("inventory-out-of-stock");
    expect(rows[rows.length - 1]?.severity).toBe("info");
  });

  it("is deterministic for the same records and clock", () => {
    expect(build()).toEqual(build());
  });

  it("reacts only to the data it was given", () => {
    const withoutPo = build({ purchaseOrders: [] });
    expect(pick(withoutPo, "procurement-late-pos")).toBeUndefined();
    expect(pick(withoutPo, "inventory-out-of-stock")).toBeDefined();
  });
});
