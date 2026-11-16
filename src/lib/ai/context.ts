/**
 * Grounding source for the whole AI area.
 *
 * One pass over the workspace's own records produces a compact, brand-scoped
 * snapshot; insights, recommendations, the assistant and the automation rules
 * all read from it and nowhere else. That keeps every number the UI shows
 * traceable to a row the owner can open.
 *
 * Pure: it takes the data, never fetches it. `lib/ai/loader.ts` is the only
 * place that does I/O.
 */

import {
  computeRollups,
  inventoryValuation,
  isDeadStock,
  isOutOfStock,
  isoDayOf,
  lowStockProducts,
  productStock,
  type ManagerRollups,
} from "@/lib/business/overview";
import {
  addCalendarDays,
  orderInCalendarRange,
  rangeFromPreset,
  zoneDayStartUtc,
  type RangePreset,
} from "@/lib/analytics/date-range";
import { computeMarginSnapshot } from "@/lib/analytics/margin";
import { staffAvailabilitySummary } from "@/lib/manager/staff";
import { isTaskOverdue } from "@/lib/manager/tasks";
import { isOpenQuote, isOpenReceivable } from "@/lib/orders/order-rules";
import type {
  CashMovement,
  CashSession,
  Expense,
  LeaveRequest,
  PurchaseOrder,
  Supplier,
} from "@/types/business";
import type {
  Customer,
  Order,
  OrderItem,
  Product,
} from "@/types/database";
import type { Appointment, Shift, Task } from "@/types/operations";
import type { StaffMember } from "@/types/manager";

/** Sales window the AI area reasons over: last 30 days vs the 30 before it. */
export const AI_RANGE_PRESET: RangePreset = "30d";

/**
 * OrderBook invoices carry no due date column (see docs/DATABASE_CONTRACT.md),
 * so ageing is measured from issue date. Anything unpaid for longer than this
 * is worth a follow-up; it is a chase threshold, not a contractual overdue.
 */
export const INVOICE_FOLLOW_UP_AFTER_DAYS = 3;

/** A quotation with no reply after this many days is treated as going cold. */
export const QUOTE_STALE_AFTER_DAYS = 3;

/** Blended margin below this percentage is worth a look at pricing. */
export const THIN_MARGIN_PERCENT = 25;

export type BusinessContextInput = {
  brandCode: string;
  brandName: string;
  currencyCode: string;
  orders: Order[];
  orderItems: OrderItem[];
  products: Product[];
  customers: Customer[];
  tasks: Task[];
  appointments: Appointment[];
  shifts: Shift[];
  staff: StaffMember[];
  expenses: Expense[];
  purchaseOrders: PurchaseOrder[];
  suppliers: Supplier[];
  cashMovements: CashMovement[];
  cashSessions: CashSession[];
  leave: LeaveRequest[];
};

export type AiMoneyRow = {
  id: string;
  label: string;
  sublabel: string | null;
  amount: number;
  days: number;
  href: string;
};

export type AiStockRow = {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  threshold: number;
  unit: string | null;
  /** Reorder quantity the draft purchase order proposes: refills to 2x the threshold. */
  suggestedReorderQty: number;
};

export type BusinessContext = {
  brand: { code: string; name: string; currencyCode: string };
  generatedAt: string;
  today: string;
  window: { from: string; to: string; days: number };
  previousWindow: { from: string; to: string };
  sales: {
    revenue: number;
    orders: number;
    averageOrderValue: number;
    previousRevenue: number;
    previousOrders: number;
    /** Null when the previous window has no sales to compare against. */
    changePercent: number | null;
    bestDay: { date: string; revenue: number } | null;
    topCategory: { name: string; revenue: number } | null;
  };
  products: {
    active: number;
    bestSellers: { id: string | null; name: string; qty: number; revenue: number }[];
    /** In stock, active, and with no sale line in the window. */
    notSelling: { id: string; name: string; stock: number }[];
  };
  margin: {
    revenue: number;
    cost: number;
    margin: number;
    marginPercent: number;
    thinLines: { name: string; revenue: number; margin: number; marginPercent: number }[];
  };
  receivables: {
    total: number;
    count: number;
    agedCount: number;
    agedTotal: number;
    oldestDays: number | null;
    rows: AiMoneyRow[];
    overdueAfterDays: number;
  };
  quotes: {
    openCount: number;
    openValue: number;
    staleCount: number;
    staleValue: number;
    rows: AiMoneyRow[];
    staleAfterDays: number;
  };
  inventory: {
    lowStock: AiStockRow[];
    outOfStock: AiStockRow[];
    tracked: number;
    valuation: { units: number; costValue: number; retailValue: number };
  };
  tasks: {
    open: number;
    overdue: number;
    dueToday: number;
    rows: { id: string; title: string; dueAt: string | null; status: Task["status"]; overdue: boolean }[];
  };
  appointments: {
    today: { id: string; title: string; startsAt: string; customerName: string | null }[];
    nextTwentyFourHours: { id: string; title: string; startsAt: string; customerName: string | null }[];
  };
  staff: {
    active: number;
    available: number;
    busy: number;
    off: number;
    onShiftNow: { id: string; name: string; shift: string }[];
    scheduledToday: number;
  };
  expenses: {
    thisMonth: number;
    thisMonthCount: number;
    previousMonth: number;
    top: { title: string; category: string; amount: number }[];
    changePercent: number | null;
  };
  purchaseOrders: {
    open: { id: string; poNumber: string; supplierName: string; status: PurchaseOrder["status"]; expectedOn: string | null; late: boolean }[];
    lateCount: number;
    supplierCount: number;
  };
  cash: {
    todayIn: number;
    todayOut: number;
    netToday: number;
    hasSessionToday: boolean;
    sessionClosedToday: boolean;
  };
  rollups: ManagerRollups;
};

function daysSince(iso: string, now: Date): number {
  const created = new Date(iso);
  if (Number.isNaN(created.getTime())) return 0;
  const diff = now.getTime() - created.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function sumBy<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function changePercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function monthKey(calendarDate: string): string {
  return calendarDate.slice(0, 7);
}

/** "HH:mm" -> minutes past midnight. */
function clockMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function suggestedReorderQty(stock: number, threshold: number): number {
  return Math.max(1, threshold * 2 - stock);
}

function stockRow(product: Product): AiStockRow {
  const threshold = product.low_stock_threshold ?? 0;
  const stock = productStock(product);
  return {
    id: product.id,
    name: product.name,
    sku: product.sku ?? null,
    stock,
    threshold,
    unit: product.unit ?? null,
    suggestedReorderQty: suggestedReorderQty(stock, threshold),
  };
}

/** Daily revenue series for the window, in business-timezone calendar days. */
function dailySeries(orders: Order[], from: string, to: string): { date: string; revenue: number }[] {
  const days: { date: string; revenue: number }[] = [];
  let cursor = from;
  // Bounded by the window itself, which `rangeFromPreset` always keeps finite.
  while (cursor <= to) {
    days.push({ date: cursor, revenue: 0 });
    cursor = addCalendarDays(cursor, 1);
  }
  const index = new Map(days.map((day, i) => [day.date, i]));
  for (const order of orders) {
    if (order.status === "cancelled" || order.status === "refunded") continue;
    const date = isoDayOf(new Date(order.created_at));
    const slot = index.get(date);
    if (slot === undefined) continue;
    days[slot].revenue += order.grand_total;
  }
  return days;
}

function moneyRow(order: Order, now: Date, amount: number): AiMoneyRow {
  return {
    id: order.id,
    label: order.order_number,
    sublabel: order.customer_name_snapshot ?? null,
    amount,
    days: daysSince(order.created_at, now),
    href: `/orders/${order.id}`,
  };
}

export function buildBusinessContext(
  input: BusinessContextInput,
  now: Date = new Date(),
): BusinessContext {
  const today = isoDayOf(now);
  const { from, to } = rangeFromPreset(AI_RANGE_PRESET, now);
  const windowDays = Math.max(
    1,
    Math.round((zoneDayStartUtc(to) - zoneDayStartUtc(from)) / 86_400_000) + 1,
  );
  const previousTo = addCalendarDays(from, -1);
  const previousFrom = addCalendarDays(previousTo, -(windowDays - 1));

  const live = input.orders.filter(
    (o) => o.status !== "cancelled" && o.status !== "refunded",
  );
  const windowOrders = live.filter((o) =>
    orderInCalendarRange(o.created_at, from, to),
  );
  const previousOrders = live.filter((o) =>
    orderInCalendarRange(o.created_at, previousFrom, previousTo),
  );

  const windowOrderIds = new Set(windowOrders.map((o) => o.id));
  const windowItems = input.orderItems.filter((item) =>
    windowOrderIds.has(item.order_id),
  );

  const productNameById = new Map(input.products.map((p) => [p.id, p.name]));
  const categoryById = new Map(
    input.products.map((p) => [
      p.id,
      p.category?.trim() || "Uncategorised",
    ]),
  );

  const byProduct = new Map<string, { id: string | null; name: string; qty: number; revenue: number }>();
  const byCategory = new Map<string, number>();
  for (const item of windowItems) {
    const name =
      item.product_name_snapshot ||
      productNameById.get(item.product_id ?? "") ||
      "Unknown line";
    const key = `${item.product_id ?? "x"}:${name}`;
    const row = byProduct.get(key) ?? { id: item.product_id ?? null, name, qty: 0, revenue: 0 };
    row.qty += item.quantity;
    row.revenue += item.line_total;
    byProduct.set(key, row);
    const category = categoryById.get(item.product_id ?? "") ?? "Uncategorised";
    byCategory.set(category, (byCategory.get(category) ?? 0) + item.line_total);
  }

  const bestSellers = Array.from(byProduct.values())
    .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty)
    .slice(0, 5);
  const topCategory = Array.from(byCategory, ([name, revenue]) => ({ name, revenue })).sort(
    (a, b) => b.revenue - a.revenue,
  )[0] ?? null;

  const series = dailySeries(windowOrders, from, to);
  const bestDay = series.reduce<{ date: string; revenue: number } | null>(
    (best, day) => (day.revenue > 0 && (!best || day.revenue > best.revenue) ? day : best),
    null,
  );

  const margin = computeMarginSnapshot({
    orders: windowOrders,
    orderItems: windowItems,
    products: input.products,
  });
  const thinLines = margin.lines
    .filter((line) => line.revenue > 0 && line.cost > 0)
    .map((line) => ({
      name: line.name,
      revenue: line.revenue,
      margin: line.margin,
      marginPercent: (line.margin / line.revenue) * 100,
    }))
    .filter((line) => line.marginPercent < THIN_MARGIN_PERCENT)
    .sort((a, b) => a.marginPercent - b.marginPercent)
    .slice(0, 5);

  const receivableOrders = input.orders.filter(isOpenReceivable);
  const receivableRows = receivableOrders
    .map((order) =>
      moneyRow(order, now, Math.max(0, order.grand_total - (order.amount_paid ?? 0))),
    )
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.days - a.days || b.amount - a.amount);
  const agedRows = receivableRows.filter(
    (row) => row.days >= INVOICE_FOLLOW_UP_AFTER_DAYS,
  );

  const quoteOrders = input.orders.filter(isOpenQuote);
  const quoteRows = quoteOrders
    .map((order) => moneyRow(order, now, order.grand_total))
    .sort((a, b) => b.days - a.days || b.amount - a.amount);
  const staleQuotes = quoteRows.filter((row) => row.days >= QUOTE_STALE_AFTER_DAYS);

  const activeProducts = input.products.filter((p) => p.is_active);
  const trackedProducts = activeProducts.filter(
    (p) => p.low_stock_threshold != null,
  );
  const soldIds = new Set(
    input.orderItems
      .filter((item) => windowOrderIds.has(item.order_id))
      .map((item) => item.product_id)
      .filter((id): id is string => typeof id === "string"),
  );
  const lowStock = lowStockProducts(trackedProducts).map(stockRow);
  const outOfStockIds = new Set(
    trackedProducts.filter(isOutOfStock).map((p) => p.id),
  );

  const openTasks = input.tasks.filter((t) => t.status !== "done");
  const taskRows = openTasks
    .map((task) => ({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      status: task.status,
      overdue: isTaskOverdue(task, now),
    }))
    .sort((a, b) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));

  const customerNameById = new Map(input.customers.map((c) => [c.id, c.name]));
  const appointmentRow = (a: Appointment) => ({
    id: a.id,
    title: a.title,
    startsAt: a.startsAt,
    customerName: a.customerId ? (customerNameById.get(a.customerId) ?? null) : null,
  });
  const scheduled = input.appointments.filter((a) => a.status === "scheduled");
  const todaysAppointments = scheduled
    .filter((a) => isoDayOf(new Date(a.startsAt)) === today)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map(appointmentRow);
  const horizon = now.getTime() + 86_400_000;
  const nextTwentyFour = scheduled
    .filter((a) => {
      const start = new Date(a.startsAt).getTime();
      return start >= now.getTime() && start <= horizon;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map(appointmentRow);

  const staffSummary = staffAvailabilitySummary(input.staff);
  const staffNameById = new Map(input.staff.map((s) => [s.id, s.name]));
  // Same rule as `computeRollups.onShiftNow` (business-day + clock minutes), so
  // the two never disagree on the screen.
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const shiftsToday = input.shifts.filter((s) => s.date === today);
  const onShiftNow = shiftsToday
    .filter((s) => clockMinutes(s.start) <= minutesNow && minutesNow < clockMinutes(s.end))
    .map((s) => ({
      id: s.staffId,
      name: staffNameById.get(s.staffId) ?? "Staff member",
      shift: `${s.start}-${s.end}`,
    }));
  const scheduledToday = new Set(shiftsToday.map((s) => s.staffId)).size;

  const thisMonth = monthKey(today);
  const previousMonth = monthKey(addCalendarDays(`${thisMonth}-01`, -1));
  const monthPrefix = (date: string) => date.slice(0, 7);
  const thisMonthExpenses = input.expenses.filter(
    (e) => monthPrefix(e.incurredOn) === thisMonth,
  );
  const previousMonthExpenses = input.expenses.filter(
    (e) => monthPrefix(e.incurredOn) === previousMonth,
  );

  const supplierNameById = new Map(input.suppliers.map((s) => [s.id, s.name]));
  const openPurchaseOrders = input.purchaseOrders
    .filter((po) => po.status === "ordered" || po.status === "partially_received")
    .map((po) => ({
      id: po.id,
      poNumber: po.poNumber,
      supplierName: po.supplierId
        ? (supplierNameById.get(po.supplierId) ?? "Unknown supplier")
        : "No supplier chosen",
      status: po.status,
      expectedOn: po.expectedOn,
      late: po.expectedOn !== null && po.expectedOn < today,
    }))
    .sort((a, b) => (a.expectedOn ?? "9999").localeCompare(b.expectedOn ?? "9999"));

  const todaysMovements = input.cashMovements.filter((m) => m.date === today);
  const todaysSessions = input.cashSessions.filter((s) => s.date === today);

  const revenue = sumBy(windowOrders, (o) => o.grand_total);
  const previousRevenue = sumBy(previousOrders, (o) => o.grand_total);

  return {
    brand: {
      code: input.brandCode,
      name: input.brandName,
      currencyCode: input.currencyCode,
    },
    generatedAt: now.toISOString(),
    today,
    window: { from, to, days: windowDays },
    previousWindow: { from: previousFrom, to: previousTo },
    sales: {
      revenue,
      orders: windowOrders.length,
      averageOrderValue: windowOrders.length ? revenue / windowOrders.length : 0,
      previousRevenue,
      previousOrders: previousOrders.length,
      changePercent: changePercent(revenue, previousRevenue),
      bestDay,
      topCategory,
    },
    products: {
      active: activeProducts.length,
      bestSellers,
      notSelling: activeProducts
        .filter((p) => isDeadStock(p, soldIds))
        .map((p) => ({ id: p.id, name: p.name, stock: productStock(p) }))
        .sort((a, b) => b.stock - a.stock)
        .slice(0, 8),
    },
    margin: {
      revenue: margin.revenue,
      cost: margin.cost,
      margin: margin.margin,
      marginPercent: margin.marginPercent,
      thinLines,
    },
    receivables: {
      total: sumBy(receivableRows, (r) => r.amount),
      count: receivableRows.length,
      agedCount: agedRows.length,
      agedTotal: sumBy(agedRows, (r) => r.amount),
      oldestDays: receivableRows.length
        ? Math.max(...receivableRows.map((r) => r.days))
        : null,
      rows: receivableRows.slice(0, 8),
      overdueAfterDays: INVOICE_FOLLOW_UP_AFTER_DAYS,
    },
    quotes: {
      openCount: quoteRows.length,
      openValue: sumBy(quoteRows, (r) => r.amount),
      staleCount: staleQuotes.length,
      staleValue: sumBy(staleQuotes, (r) => r.amount),
      rows: quoteRows.slice(0, 8),
      staleAfterDays: QUOTE_STALE_AFTER_DAYS,
    },
    inventory: {
      lowStock: lowStock.filter((row) => !outOfStockIds.has(row.id)),
      outOfStock: lowStock.filter((row) => outOfStockIds.has(row.id)),
      tracked: trackedProducts.length,
      valuation: inventoryValuation(activeProducts),
    },
    tasks: {
      open: openTasks.length,
      overdue: taskRows.filter((t) => t.overdue).length,
      dueToday: taskRows.filter((t) => t.dueAt !== null && isoDayOf(new Date(t.dueAt)) === today).length,
      rows: taskRows.slice(0, 8),
    },
    appointments: {
      today: todaysAppointments.slice(0, 8),
      nextTwentyFourHours: nextTwentyFour.slice(0, 8),
    },
    staff: {
      active: staffSummary.active,
      available: staffSummary.available,
      busy: staffSummary.busy,
      off: staffSummary.off,
      onShiftNow,
      scheduledToday,
    },
    expenses: {
      thisMonth: sumBy(thisMonthExpenses, (e) => e.amount),
      thisMonthCount: thisMonthExpenses.length,
      previousMonth: sumBy(previousMonthExpenses, (e) => e.amount),
      top: [...thisMonthExpenses]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)
        .map((e) => ({ title: e.title, category: e.category, amount: e.amount })),
      changePercent: changePercent(
        sumBy(thisMonthExpenses, (e) => e.amount),
        sumBy(previousMonthExpenses, (e) => e.amount),
      ),
    },
    purchaseOrders: {
      open: openPurchaseOrders,
      lateCount: openPurchaseOrders.filter((po) => po.late).length,
      supplierCount: input.suppliers.filter((s) => s.is_active).length,
    },
    cash: {
      todayIn: sumBy(
        todaysMovements.filter((m) => m.direction === "in"),
        (m) => m.amount,
      ),
      todayOut: sumBy(
        todaysMovements.filter((m) => m.direction === "out"),
        (m) => m.amount,
      ),
      netToday:
        sumBy(todaysMovements.filter((m) => m.direction === "in"), (m) => m.amount) -
        sumBy(todaysMovements.filter((m) => m.direction === "out"), (m) => m.amount),
      hasSessionToday: todaysSessions.length > 0,
      sessionClosedToday: todaysSessions.some((s) => s.closedAt !== null),
    },
    rollups: computeRollups(
      {
        orders: input.orders,
        products: input.products,
        tasks: input.tasks,
        appointments: input.appointments,
        shifts: input.shifts,
        expenses: input.expenses,
        purchaseOrders: input.purchaseOrders,
        leave: input.leave,
      },
      now,
    ),
  };
}
