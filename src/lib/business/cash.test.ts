import { describe, expect, it } from "vitest";
import {
  amountDue,
  businessDayOf,
  bucketTotals,
  cashFlowsForDay,
  cashSessionsSorted,
  collectedFor,
  customerPaymentHistory,
  openCashSession,
  paymentsByMethod,
  receivableRows,
  refundRows,
  refundsByMethod,
  summarizeCashDay,
  totalExposure,
  unreconciledCashRecords,
} from "./cash";
import type { CashMovement, CashSession, Expense } from "@/types/business";
import type { Order, Payment, Refund } from "@/types/database";

const NOW = new Date("2026-03-20T10:00:00.000Z");

function order(overrides: Partial<Order> & Pick<Order, "id">): Order {
  return {
    brand_id: "b1",
    order_number: `INV-${overrides.id}`,
    status: "confirmed",
    payment_status: "partial",
    customer_id: "c1",
    customer_name_snapshot: "Acme",
    subtotal: 1000,
    discount_total: 0,
    tax_total: 0,
    fees_total: 0,
    grand_total: 1000,
    notes: null,
    created_at: "2026-03-18T10:00:00.000Z",
    ...overrides,
  };
}

function payment(overrides: Partial<Payment> & Pick<Payment, "id">): Payment {
  return {
    brand_id: "b1",
    order_id: "inv1",
    amount: 400,
    method: "UPI",
    status: "partial",
    created_at: "2026-03-18T12:00:00.000Z",
    ...overrides,
  };
}

function refund(overrides: Partial<Refund> & Pick<Refund, "id">): Refund {
  return {
    brand_id: "b1",
    order_id: "inv5",
    payment_id: null,
    amount: 200,
    reason: "Damaged goods",
    created_at: "2026-03-19T10:00:00.000Z",
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> & Pick<Expense, "id">): Expense {
  return {
    brand_id: "b1",
    title: "Expense",
    category: "other",
    amount: 100,
    method: "Cash",
    incurredOn: "2026-03-20",
    recurring: "none",
    supplierId: null,
    notes: "",
    created_at: "2026-03-20T09:00:00.000Z",
    ...overrides,
  };
}

function movement(overrides: Partial<CashMovement> & Pick<CashMovement, "id">): CashMovement {
  return {
    brand_id: "b1",
    date: "2026-03-20",
    direction: "out",
    amount: 100,
    reason: "Manual movement",
    method: "Cash",
    source: "manual",
    refId: null,
    ...overrides,
  };
}

function session(overrides: Partial<CashSession> & Pick<CashSession, "id">): CashSession {
  return {
    brand_id: "b1",
    date: "2026-03-20",
    openingBalance: 2000,
    countedBalance: null,
    closedAt: null,
    staffId: null,
    note: "",
    ...overrides,
  };
}

const ORDERS: Order[] = [
  order({ id: "inv1", grand_total: 1000, amount_paid: 0 }),
  order({ id: "inv2", grand_total: 500, amount_paid: 500, payment_status: "paid", status: "completed" }),
  order({ id: "inv3", status: "draft", payment_status: "pending", grand_total: 900 }),
  order({ id: "inv4", status: "cancelled", grand_total: 300 }),
  order({ id: "inv5", grand_total: 2000, amount_paid: null, created_at: "2026-02-01T10:00:00.000Z" }),
  order({ id: "inv6", grand_total: 700, created_at: "2026-03-05T10:00:00.000Z", customer_id: "c2", customer_name_snapshot: "Beyond Living" }),
  order({ id: "inv7", grand_total: 400, created_at: "2026-03-04T10:00:00.000Z" }),
];

const PAYMENTS: Payment[] = [
  payment({ id: "pay1", order_id: "inv1", amount: 400 }),
  payment({ id: "pay2", order_id: "inv5", amount: 200, method: "UPI", status: "refunded" }),
  payment({ id: "pay3", order_id: "inv5", amount: -200, method: "Refund", status: "refunded", created_at: "2026-03-19T10:05:00.000Z" }),
  payment({ id: "pay4", order_id: "inv3", amount: -150, method: "Refund", created_at: "2026-03-02T10:00:00.000Z", notes: "Order cancelled at counter" }),
];

describe("collectedFor and amountDue", () => {
  it("prefers payment records over the order's paid field", () => {
    expect(collectedFor(ORDERS[0], PAYMENTS)).toBe(400);
    expect(amountDue(ORDERS[0], PAYMENTS)).toBe(600);
  });
  it("falls back to amount_paid when no payment rows exist", () => {
    expect(collectedFor(ORDERS[1], PAYMENTS)).toBe(500);
    expect(amountDue(ORDERS[1], PAYMENTS)).toBe(0);
  });
  it("never reports a negative balance", () => {
    const overpaid = order({ id: "inv8", grand_total: 100, amount_paid: 250 });
    expect(amountDue(overpaid, PAYMENTS)).toBe(0);
  });
});

describe("receivableRows", () => {
  const rows = receivableRows(ORDERS, PAYMENTS, NOW);
  const byId = new Map(rows.map((r) => [r.orderId, r]));

  it("keeps posted invoices with a balance and drops quotes, cancellations and settled bills", () => {
    expect([...byId.keys()].sort()).toEqual(["inv1", "inv5", "inv6", "inv7"]);
  });
  it("buckets by age and flags late balances", () => {
    expect(byId.get("inv1")).toMatchObject({ ageDays: 2, bucket: "0-7", overdue: false });
    expect(byId.get("inv6")).toMatchObject({ ageDays: 15, bucket: "8-15", overdue: false });
    expect(byId.get("inv7")).toMatchObject({ ageDays: 16, bucket: "16-30", overdue: true });
    expect(byId.get("inv5")).toMatchObject({ bucket: "30+", overdue: true, due: 1800 });
  });
  it("sorts by the biggest balance first and totals exposure", () => {
    expect(rows.map((r) => r.orderId)).toEqual(["inv5", "inv6", "inv1", "inv7"]);
    expect(totalExposure(rows)).toBe(3500);
    expect(bucketTotals(rows).find((b) => b.id === "30+")).toMatchObject({ count: 1, due: 1800 });
  });
});

describe("customerPaymentHistory", () => {
  const history = customerPaymentHistory(ORDERS, PAYMENTS, NOW);

  it("summarises invoiced, collected and outstanding per customer", () => {
    const acme = history.find((h) => h.customerId === "c1");
    expect(acme).toMatchObject({ customerName: "Acme", invoices: 5, billed: 3900, collected: 1100 });
    expect(acme?.outstanding).toBe(2800);
    expect(acme?.openInvoices).toBe(3);
    expect(acme?.overdueInvoices).toBe(2);
    expect(acme?.collectionRate).toBeCloseTo(28.21, 2);
    expect(acme?.lastPaymentAt).toBe("2026-03-18T12:00:00.000Z");
  });
  it("lists the biggest outstanding balance first", () => {
    expect(history[0].customerId).toBe("c1");
    expect(history[1].customerId).toBe("c2");
  });
});

describe("refundRows", () => {
  const rows = refundRows(
    [
      refund({ id: "ref1", order_id: "inv5", amount: 200, payment_id: "pay2" }),
      refund({ id: "ref2", order_id: "inv6", amount: 100, created_at: "2026-03-20T09:00:00.000Z" }),
    ],
    PAYMENTS,
    ORDERS,
  );

  it("marks a refund processed once the money has left, with the original rail", () => {
    const processed = rows.find((r) => r.id === "ref1");
    expect(processed).toMatchObject({ status: "processed", amount: 200, method: "UPI", orderNumber: "INV-inv5" });
  });
  it("keeps a refund without a payout as requested", () => {
    expect(rows.find((r) => r.id === "ref2")).toMatchObject({ status: "requested", method: "Not yet paid out" });
  });
  it("reports a lone negative payment as a processed refund, without double counting", () => {
    expect(rows.filter((r) => r.orderId === "inv5")).toHaveLength(1);
    const fromPayment = rows.find((r) => r.source === "payment");
    expect(fromPayment).toMatchObject({ id: "pay4", amount: 150, status: "processed", method: "Refund" });
  });
  it("totals refunds per rail", () => {
    const byMethod = refundsByMethod(rows);
    expect(byMethod.find((m) => m.method === "UPI")).toMatchObject({ total: 200, count: 1 });
  });
});

describe("paymentsByMethod", () => {
  it("totals money per rail", () => {
    const totals = paymentsByMethod([
      payment({ id: "p1", amount: 500, method: "Cash" }),
      payment({ id: "p2", amount: 250, method: "Cash" }),
      payment({ id: "p3", amount: 900, method: "UPI" }),
    ]);
    expect(totals[0]).toEqual({ method: "UPI", total: 900, count: 1 });
    expect(totals[1]).toEqual({ method: "Cash", total: 750, count: 2 });
  });
});

describe("cash register", () => {
  const records = {
    payments: [
      payment({ id: "c-in-1", amount: 5000, method: "Cash", status: "paid", created_at: "2026-03-20T04:00:00.000Z" }),
      payment({ id: "c-in-2", amount: 2000, method: "Card", created_at: "2026-03-20T04:30:00.000Z" }),
      payment({ id: "c-in-3", amount: 700, method: "cash", created_at: "2026-03-19T05:00:00.000Z" }),
    ],
    expenses: [
      expense({ id: "x1", amount: 800, method: "Cash", incurredOn: "2026-03-20" }),
      expense({ id: "x2", amount: 45000, method: "Bank transfer", incurredOn: "2026-03-20" }),
    ],
    movements: [
      movement({ id: "m1", direction: "out", amount: 300, reason: "Daily wage advance" }),
      movement({ id: "m2", direction: "in", amount: 1000, reason: "Float top-up" }),
      movement({ id: "m3", direction: "out", amount: 800, source: "expense", refId: "x1", reason: "Cash expense" }),
    ],
  };
  const sessions = [
    session({ id: "s-open" }),
    session({ id: "s-19", date: "2026-03-19", countedBalance: 2650, closedAt: "2026-03-19T15:00:00.000Z" }),
  ];

  it("counts cash payments, cash expenses and manual movements only", () => {
    const flows = cashFlowsForDay(records, "2026-03-20");
    expect(flows.map((f) => f.id)).toEqual([
      "payment-c-in-1",
      "movement-m2",
      "expense-x1",
      "movement-m1",
    ]);
  });
  it("expects opening plus in minus out while the drawer is open", () => {
    const day = summarizeCashDay(records, "2026-03-20", sessions);
    expect(day.inflows).toBe(6000);
    expect(day.outflows).toBe(1100);
    expect(day.expected).toBe(6900);
    expect(day.countedBalance).toBeNull();
    expect(day.variance).toBeNull();
    expect(day.session?.id).toBe("s-open");
  });
  it("reports variance once the day is counted and closed", () => {
    const day = summarizeCashDay(records, "2026-03-19", sessions);
    expect(day.inflows).toBe(700);
    expect(day.expected).toBe(2700);
    expect(day.variance).toBe(-50);
  });
  it("treats a day with no session as an opening balance of zero", () => {
    const day = summarizeCashDay(records, "2026-03-10", sessions);
    expect(day.flows).toEqual([]);
    expect(day.expected).toBe(0);
  });
  it("finds the drawer that is still open", () => {
    expect(openCashSession(sessions)?.id).toBe("s-open");
    expect(cashSessionsSorted(sessions).map((s) => s.date)).toEqual(["2026-03-20", "2026-03-19"]);
    expect(openCashSession([])).toBeNull();
  });
});

describe("unreconciledCashRecords", () => {
  const sessions = [session({ id: "s-open" })];

  it("lists cash records that no register entry or closed day covers", () => {
    const items = unreconciledCashRecords(
      {
        payments: [
          payment({ id: "r1", amount: 500, method: "Cash", created_at: "2026-03-10T05:00:00.000Z" }),
          payment({ id: "r2", amount: 400, method: "Cash", created_at: "2026-03-20T05:00:00.000Z" }),
          payment({ id: "r3", amount: 300, method: "UPI", created_at: "2026-03-10T05:00:00.000Z" }),
        ],
        expenses: [
          expense({ id: "r4", method: "Cash", incurredOn: "2026-03-11" }),
          expense({ id: "r5", method: "Cash", incurredOn: "2026-03-20" }),
        ],
        movements: [movement({ id: "r6", source: "billing", refId: "r1", amount: 500 })],
      },
      sessions,
    );
    expect(items.map((i) => i.id)).toEqual(["r4"]);
  });
  it("is empty when every cash record is accounted for", () => {
    expect(unreconciledCashRecords({ payments: [], expenses: [], movements: [] }, sessions)).toEqual([]);
  });
});

describe("businessDayOf", () => {
  it("uses the business timezone, not UTC", () => {
    expect(businessDayOf("2026-03-10T20:00:00.000Z")).toBe("2026-03-11");
    expect(businessDayOf("2026-03-10T05:00:00.000Z")).toBe("2026-03-10");
    expect(businessDayOf("2026-03-10")).toBe("2026-03-10");
  });
});
