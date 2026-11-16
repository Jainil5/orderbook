import type { Order, Payment, Refund } from "@/types/database";
import type {
  CashMovement,
  CashMovementDirection,
  CashSession,
  Expense,
} from "@/types/business";
import { calendarDateInZone } from "@/lib/analytics/date-range";
import { CASH_METHOD, isCashExpense } from "@/lib/business/expenses";

/**
 * The money-movement model behind the Finance Manager sections: what has
 * actually been collected, what is still owed, what went back out as a refund,
 * and how the cash drawer ties to those records.
 *
 * Every figure here is derived from records the app already writes (orders,
 * payments, refunds, expenses, cash movements, cash sessions). Nothing in this
 * module invents a balance: there is no ledger, no journal and no tax
 * treatment — it is financial operations, not accounting.
 */

const CASH = CASH_METHOD.toLowerCase();

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isCashPayment(payment: Payment): boolean {
  return payment.method.trim().toLowerCase() === CASH;
}

/**
 * What has been collected against an invoice. Payment records win, because
 * they are the money that actually arrived; `orders.amount_paid` is only used
 * when no payment rows exist for the order.
 */
export function collectedFor(
  order: Order,
  payments: readonly Payment[],
): number {
  const fromRecords = payments
    .filter((p) => p.order_id === order.id && p.amount > 0)
    .reduce((total, p) => total + p.amount, 0);
  return round(fromRecords > 0 ? fromRecords : (order.amount_paid ?? 0));
}

export function amountDue(order: Order, payments: readonly Payment[]): number {
  return round(Math.max(0, order.grand_total - collectedFor(order, payments)));
}

/**
 * An invoice counts as receivable once it is posted (not a draft quotation)
 * and still has a balance, and it stops being one when cancelled or refunded.
 */
export function isReceivable(
  order: Order,
  payments: readonly Payment[],
): boolean {
  if (order.status === "draft") return false;
  if (order.status === "cancelled" || order.status === "refunded") return false;
  if (order.order_kind === "credit_note") return false;
  return amountDue(order, payments) > 0;
}

export type AgeBucketId = "0-7" | "8-15" | "16-30" | "30+";

export const RECEIVABLE_AGE_BUCKETS: { id: AgeBucketId; label: string }[] = [
  { id: "0-7", label: "0-7 days" },
  { id: "8-15", label: "8-15 days" },
  { id: "16-30", label: "16-30 days" },
  { id: "30+", label: "Over 30 days" },
];

/**
 * Invoices carry no due date in the data model, so "overdue" is an app-level
 * payment term: a balance older than this many days is late. The number is
 * stated on the receivables screen rather than hidden in a formula.
 */
export const OVERDUE_AFTER_DAYS = 15;

export function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return 0;
  return Math.max(0, Math.floor((to.getTime() - from) / 86_400_000));
}

export function ageBucketId(ageDays: number): AgeBucketId {
  if (ageDays <= 7) return "0-7";
  if (ageDays <= 15) return "8-15";
  if (ageDays <= 30) return "16-30";
  return "30+";
}

export type ReceivableRow = {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  issuedAt: string;
  grandTotal: number;
  collected: number;
  due: number;
  ageDays: number;
  bucket: AgeBucketId;
  bucketLabel: string;
  overdue: boolean;
  paymentStatus: Payment["status"];
};

export function receivableRows(
  orders: readonly Order[],
  payments: readonly Payment[],
  now: Date = new Date(),
): ReceivableRow[] {
  return orders
    .filter((o) => isReceivable(o, payments))
    .map((o) => {
      const ageDays = daysBetween(o.created_at, now);
      const bucket = ageBucketId(ageDays);
      return {
        orderId: o.id,
        orderNumber: o.order_number,
        customerName: o.customer_name_snapshot,
        issuedAt: o.created_at,
        grandTotal: round(o.grand_total),
        collected: collectedFor(o, payments),
        due: amountDue(o, payments),
        ageDays,
        bucket,
        bucketLabel:
          RECEIVABLE_AGE_BUCKETS.find((b) => b.id === bucket)?.label ?? bucket,
        overdue: ageDays > OVERDUE_AFTER_DAYS,
        paymentStatus: o.payment_status,
      };
    })
    .sort((a, b) => b.due - a.due);
}

export type BucketTotal = {
  id: AgeBucketId;
  label: string;
  count: number;
  due: number;
};

export function bucketTotals(rows: readonly ReceivableRow[]): BucketTotal[] {
  return RECEIVABLE_AGE_BUCKETS.map((bucket) => {
    const inBucket = rows.filter((r) => r.bucket === bucket.id);
    return {
      id: bucket.id,
      label: bucket.label,
      count: inBucket.length,
      due: round(inBucket.reduce((total, r) => total + r.due, 0)),
    };
  });
}

export function totalExposure(rows: readonly ReceivableRow[]): number {
  return round(rows.reduce((total, r) => total + r.due, 0));
}

export type CustomerHistoryRow = {
  customerId: string | null;
  customerName: string;
  invoices: number;
  billed: number;
  collected: number;
  outstanding: number;
  /** Share of billed value already collected, 0-100. */
  collectionRate: number;
  lastPaymentAt: string | null;
  openInvoices: number;
  overdueInvoices: number;
};

/**
 * Per-customer payment history: how much has been invoiced, how much actually
 * arrived, and whether the outstanding balance is late.
 */
export function customerPaymentHistory(
  orders: readonly Order[],
  payments: readonly Payment[],
  now: Date = new Date(),
): CustomerHistoryRow[] {
  const receivables = receivableRows(orders, payments, now);
  const keys = new Set<string>();
  const byKey = new Map<string, Order[]>();
  for (const order of orders) {
    if (order.status === "draft") continue;
    const key = order.customer_id ?? `name:${order.customer_name_snapshot ?? "Walk-in"}`;
    keys.add(key);
    byKey.set(key, [...(byKey.get(key) ?? []), order]);
  }

  return Array.from(keys)
    .map((key) => {
      const list = byKey.get(key) ?? [];
      const billed = round(
        list
          .filter((o) => o.status !== "cancelled")
          .reduce((total, o) => total + Math.max(0, o.grand_total), 0),
      );
      const collected = round(
        list.reduce((total, o) => total + collectedFor(o, payments), 0),
      );
      const open = receivables.filter((r) =>
        list.some((o) => o.id === r.orderId),
      );
      const customer = list.find((o) => o.customer_id)?.customer_id ?? null;
      const paid = payments.filter((p) =>
        list.some((o) => o.id === p.order_id) && p.amount > 0,
      );
      return {
        customerId: customer,
        customerName:
          list.find((o) => o.customer_name_snapshot)?.customer_name_snapshot ??
          "Walk-in",
        invoices: list.length,
        billed,
        collected,
        outstanding: round(open.reduce((total, r) => total + r.due, 0)),
        collectionRate: billed ? round((collected / billed) * 100) : 0,
        lastPaymentAt:
          paid
            .map((p) => p.created_at)
            .sort()
            .reverse()[0] ?? null,
        openInvoices: open.length,
        overdueInvoices: open.filter((r) => r.overdue).length,
      };
    })
    .filter((row) => row.invoices > 0)
    .sort((a, b) => b.outstanding - a.outstanding || b.billed - a.billed);
}

export type RefundStatus = "requested" | "processed";

export type RefundRow = {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  amount: number;
  reason: string | null;
  createdAt: string;
  /** Rail the money went (or will go) back on, from the linked payment. */
  method: string;
  status: RefundStatus;
  source: "refund" | "payment";
};

function moneyLeftTill(orderId: string, amount: number, payments: readonly Payment[]) {
  return payments.some(
    (p) => p.order_id === orderId && p.amount < 0 && Math.abs(p.amount) >= amount,
  );
}

/**
 * Refunds are read, never invented: an explicit `refunds` record is a request,
 * and it becomes "processed" once a negative payment shows the money leaving.
 * A negative payment with no refund record (the fallback path when the refunds
 * table is unavailable) is reported as a processed refund.
 */
export function refundRows(
  refunds: readonly Refund[],
  payments: readonly Payment[],
  orders: readonly Order[],
): RefundRow[] {
  const orderOf = (id: string) => orders.find((o) => o.id === id);
  const rows: RefundRow[] = [];
  const claimed = new Set<string>();

  for (const refund of refunds) {
    const order = orderOf(refund.order_id);
    const original = refund.payment_id
      ? payments.find((p) => p.id === refund.payment_id)
      : undefined;
    const paidOut = moneyLeftTill(refund.order_id, refund.amount, payments);
    if (paidOut) {
      const match = payments.find(
        (p) =>
          p.order_id === refund.order_id &&
          p.amount < 0 &&
          Math.abs(p.amount) >= refund.amount &&
          !claimed.has(p.id),
      );
      if (match) claimed.add(match.id);
    }
    rows.push({
      id: refund.id,
      orderId: refund.order_id,
      orderNumber: order?.order_number ?? "—",
      customerName: order?.customer_name_snapshot ?? null,
      amount: round(refund.amount),
      reason: refund.reason,
      createdAt: refund.created_at,
      method: original?.method ?? (paidOut ? "Refund" : "Not yet paid out"),
      status: paidOut ? "processed" : "requested",
      source: "refund",
    });
  }

  for (const payment of payments) {
    if (payment.amount >= 0 || claimed.has(payment.id)) continue;
    const covered = refunds.some(
      (r) => r.order_id === payment.order_id && Math.abs(r.amount) <= Math.abs(payment.amount),
    );
    if (covered) continue;
    const order = orderOf(payment.order_id);
    rows.push({
      id: payment.id,
      orderId: payment.order_id,
      orderNumber: order?.order_number ?? "—",
      customerName: order?.customer_name_snapshot ?? null,
      amount: round(Math.abs(payment.amount)),
      reason: payment.notes ?? null,
      createdAt: payment.created_at,
      method: payment.method,
      status: "processed",
      source: "payment",
    });
  }

  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function refundsByStatus(rows: readonly RefundRow[]) {
  const build = (status: RefundStatus) => ({
    status,
    count: rows.filter((r) => r.status === status).length,
    total: round(
      rows.filter((r) => r.status === status).reduce((t, r) => t + r.amount, 0),
    ),
  });
  return [build("requested"), build("processed")];
}

export function refundsByMethod(
  rows: readonly RefundRow[],
): { method: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const current = map.get(row.method) ?? { total: 0, count: 0 };
    map.set(row.method, { total: current.total + row.amount, count: current.count + 1 });
  }
  return Array.from(map, ([method, value]) => ({
    method,
    total: round(value.total),
    count: value.count,
  })).sort((a, b) => b.total - a.total);
}

export function refundsTotal(rows: readonly RefundRow[], processedOnly = false): number {
  return round(
    rows
      .filter((r) => !processedOnly || r.status === "processed")
      .reduce((total, r) => total + r.amount, 0),
  );
}

export type MethodTotal = { method: string; total: number; count: number };

/** Totals per payment rail — the money summary on the payments screen. */
export function paymentsByMethod(payments: readonly Payment[]): MethodTotal[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const payment of payments) {
    const current = map.get(payment.method) ?? { total: 0, count: 0 };
    map.set(payment.method, {
      total: current.total + payment.amount,
      count: current.count + 1,
    });
  }
  return Array.from(map, ([method, value]) => ({
    method,
    total: round(value.total),
    count: value.count,
  })).sort((a, b) => b.total - a.total);
}

export function paymentsByStatus(
  payments: readonly Payment[],
): { status: string; total: number; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const payment of payments) {
    const current = map.get(payment.status) ?? { total: 0, count: 0 };
    map.set(payment.status, {
      total: current.total + payment.amount,
      count: current.count + 1,
    });
  }
  return Array.from(map, ([status, value]) => ({
    status,
    total: round(value.total),
    count: value.count,
  })).sort((a, b) => b.count - a.count);
}

export function paymentsInMonth(
  payments: readonly Payment[],
  now: Date = new Date(),
): Payment[] {
  const month = isoDay(now);
  return payments.filter(
    (p) => p.amount > 0 && calendarDateInZone(new Date(p.created_at)).startsWith(month),
  );
}

/** Business-timezone calendar day for an instant or `YYYY-MM-DD` string. */
export function isoDay(date: Date): string {
  return calendarDateInZone(date);
}

export function businessDayOf(instant: string): string {
  const asDate = new Date(instant);
  if (Number.isNaN(asDate.getTime())) return instant.slice(0, 10);
  return isoDay(asDate);
}

export type CashFlow = {
  id: string;
  direction: CashMovementDirection;
  /** `payment` | `expense` | `movement` — which record the flow came from. */
  origin: "payment" | "expense" | "movement";
  label: string;
  amount: number;
  refId: string;
};

export type CashRecords = {
  payments: readonly Payment[];
  expenses: readonly Expense[];
  movements: readonly CashMovement[];
};

/**
 * One day of drawer movement. Inflows are cash payments taken at the counter
 * plus manual cash-ins; outflows are expenses paid in cash plus manual
 * cash-outs. Movements already generated from a payment or an expense are not
 * counted again — the register is fed by the source record once.
 */
export function cashFlowsForDay(records: CashRecords, date: string): CashFlow[] {
  const flows: CashFlow[] = [];

  for (const payment of records.payments) {
    if (payment.amount <= 0 || !isCashPayment(payment)) continue;
    if (businessDayOf(payment.created_at) !== date) continue;
    flows.push({
      id: `payment-${payment.id}`,
      direction: "in",
      origin: "payment",
      label: payment.split_label
        ? `Cash payment · ${payment.split_label}`
        : "Cash payment at counter",
      amount: round(payment.amount),
      refId: payment.id,
    });
  }

  for (const expense of records.expenses) {
    if (!isCashExpense(expense) || expense.incurredOn !== date) continue;
    flows.push({
      id: `expense-${expense.id}`,
      direction: "out",
      origin: "expense",
      label: `Expense · ${expense.title}`,
      amount: round(expense.amount),
      refId: expense.id,
    });
  }

  for (const movement of records.movements) {
    if (movement.source !== "manual" || movement.date !== date) continue;
    flows.push({
      id: `movement-${movement.id}`,
      direction: movement.direction,
      origin: "movement",
      label: movement.reason || (movement.direction === "in" ? "Cash in" : "Cash out"),
      amount: round(movement.amount),
      refId: movement.id,
    });
  }

  return flows.sort((a, b) => (a.direction === b.direction ? b.amount - a.amount : a.direction === "in" ? -1 : 1));
}

export type CashDaySummary = {
  date: string;
  openingBalance: number;
  inflows: number;
  outflows: number;
  /** What the drawer should hold before it is counted. */
  expected: number;
  countedBalance: number | null;
  /** Counted minus expected — null until the drawer is closed. */
  variance: number | null;
  session: CashSession | null;
  flows: CashFlow[];
};

export function summarizeCashDay(
  records: CashRecords,
  date: string,
  sessions: readonly CashSession[],
): CashDaySummary {
  const session = sessions.find((s) => s.date === date) ?? null;
  const openingBalance = session?.openingBalance ?? 0;
  const flows = cashFlowsForDay(records, date);
  const inflows = round(
    flows.filter((f) => f.direction === "in").reduce((t, f) => t + f.amount, 0),
  );
  const outflows = round(
    flows.filter((f) => f.direction === "out").reduce((t, f) => t + f.amount, 0),
  );
  const expected = round(openingBalance + inflows - outflows);
  const counted = session?.countedBalance ?? null;
  return {
    date,
    openingBalance,
    inflows,
    outflows,
    expected,
    countedBalance: counted,
    variance: counted == null ? null : round(counted - expected),
    session,
    flows,
  };
}

export function cashSessionsSorted(sessions: readonly CashSession[]): CashSession[] {
  return [...sessions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function isOpenCashSession(session: CashSession): boolean {
  return session.countedBalance == null && !session.closedAt;
}

export function openCashSession(sessions: readonly CashSession[]): CashSession | null {
  return cashSessionsSorted(sessions).find(isOpenCashSession) ?? null;
}

export function closedCashSessions(sessions: readonly CashSession[]): CashSession[] {
  return cashSessionsSorted(sessions).filter((s) => !isOpenCashSession(s));
}

export type ReconciliationItem = {
  id: string;
  kind: "payment" | "expense";
  label: string;
  date: string;
  amount: number;
  direction: CashMovementDirection;
};

/**
 * Cash records that no register entry or closed day accounts for: the list to
 * work through when the drawer and the records disagree.
 */
export function unreconciledCashRecords(
  records: CashRecords,
  sessions: readonly CashSession[],
): ReconciliationItem[] {
  const sessionDays = new Set(sessions.map((s) => s.date));
  const items: ReconciliationItem[] = [];

  for (const payment of records.payments) {
    if (payment.amount <= 0 || !isCashPayment(payment)) continue;
    const date = businessDayOf(payment.created_at);
    const reflected =
      records.movements.some((m) => m.refId === payment.id) || sessionDays.has(date);
    if (reflected) continue;
    items.push({
      id: payment.id,
      kind: "payment",
      label: `Cash payment${payment.split_label ? ` · ${payment.split_label}` : ""}`,
      date,
      amount: round(payment.amount),
      direction: "in",
    });
  }

  for (const expense of records.expenses) {
    if (!isCashExpense(expense)) continue;
    const reflected =
      records.movements.some((m) => m.refId === expense.id) ||
      sessionDays.has(expense.incurredOn);
    if (reflected) continue;
    items.push({
      id: expense.id,
      kind: "expense",
      label: `Expense · ${expense.title}`,
      date: expense.incurredOn,
      amount: round(expense.amount),
      direction: "out",
    });
  }

  return items.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function totalCashMovements(
  movements: readonly CashMovement[],
  direction: CashMovementDirection,
): number {
  return round(
    movements
      .filter((m) => m.direction === direction)
      .reduce((total, m) => total + m.amount, 0),
  );
}
