import {
  addCalendarDays,
  isCalendarDate,
  orderInCalendarRange,
} from "@/lib/analytics/date-range";
import { computeMarginSnapshot } from "@/lib/analytics/margin";
import { isDeadStock } from "@/lib/business/overview";
import { formatMoney } from "@/lib/format";
import { isOpenReceivable } from "@/lib/orders/order-rules";
import type { Expense } from "@/types/business";
import type { Order, OrderItem, Payment, Product, Refund } from "@/types/database";

/**
 * Explainable business intelligence for the Analytics workspace.
 *
 * Every insight is a deterministic reading of records already in the range:
 * the headline states what happened, the detail states the numbers behind it,
 * and the action link points at the module that can change them. Nothing here
 * forecasts, scores or ranks customers beyond a plain count.
 */

export type InsightKind =
  | "revenue"
  | "margin"
  | "customers"
  | "inventory"
  | "cashflow"
  | "risk";

export type InsightSeverity = "critical" | "warning" | "positive" | "info";

export type Insight = {
  id: string;
  kind: InsightKind;
  severity: InsightSeverity;
  headline: string;
  detail: string;
  metric: { label: string; value: string };
  /** Route into the module that can act on this. */
  actionHref?: string;
  actionLabel?: string;
};

export type InsightInput = {
  orders: Order[];
  orderItems: OrderItem[];
  products: Product[];
  payments: Payment[];
  refunds: Refund[];
  expenses: Expense[];
  range: { from: string; to: string };
  currencyCode: string;
  now?: Date;
};

export const INSIGHT_KIND_LABELS: Record<InsightKind, string> = {
  revenue: "Revenue",
  margin: "Margin",
  customers: "Customers",
  inventory: "Inventory",
  cashflow: "Cash flow",
  risk: "Risk",
};

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  positive: 2,
  info: 3,
};

const KIND_RANK: Record<InsightKind, number> = {
  revenue: 0,
  margin: 1,
  customers: 2,
  inventory: 3,
  cashflow: 4,
  risk: 5,
};

/** Cancelled and refunded bills are not sales — same basis as the rollups. */
function revenueOf(orders: Order[]): number {
  return orders
    .filter((order) => order.status !== "cancelled" && order.status !== "refunded")
    .reduce((total, order) => total + order.grand_total, 0);
}

function calendarDays(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

function signedPercent(current: number, previous: number): number {
  return ((current - previous) / previous) * 100;
}

function percent(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function wholeDaysBefore(value: string, reference: string): number {
  const then = Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${reference.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(then) || Number.isNaN(today)) return 0;
  return Math.max(0, Math.round((today - then) / 86_400_000));
}

/**
 * Previous period of the same calendar length, ending the day before `from`.
 * Null for anything unbounded ("All time") or longer than four years, where a
 * comparison would be meaningless rather than useful.
 */
export function previousRange(range: {
  from: string;
  to: string;
}): { from: string; to: string } | null {
  if (!isCalendarDate(range.from) || !isCalendarDate(range.to)) return null;
  const span = calendarDays(range.from, range.to);
  if (span < 1 || span > 1461) return null;
  if (range.from === "1970-01-01") return null;
  return {
    from: addCalendarDays(range.from, -span),
    to: addCalendarDays(range.from, -1),
  };
}

function categoryOf(products: Product[]): Map<string, string> {
  return new Map(
    products.map((product) => [
      product.id,
      product.category?.trim() || "Uncategorised",
    ]),
  );
}

/** Margin per category, each computed by the shared `computeMarginSnapshot`. */
function marginByCategory(params: {
  orders: Order[];
  orderItems: OrderItem[];
  products: Product[];
}): { category: string; revenue: number; margin: number; marginPercent: number }[] {
  const categories = categoryOf(params.products);
  const groups = new Map<string, OrderItem[]>();
  for (const item of params.orderItems) {
    const category =
      (item.product_id ? categories.get(item.product_id) : undefined) ??
      "Uncategorised";
    const bucket = groups.get(category) ?? [];
    bucket.push(item);
    groups.set(category, bucket);
  }
  return Array.from(groups, ([category, items]) => {
    const snapshot = computeMarginSnapshot({
      orders: params.orders,
      orderItems: items,
      products: params.products,
    });
    return {
      category,
      revenue: snapshot.revenue,
      margin: snapshot.margin,
      marginPercent: snapshot.marginPercent,
    };
  })
    .filter((row) => row.revenue > 0)
    .sort((a, b) => a.marginPercent - b.marginPercent);
}

/**
 * Builds the insight list for a range. Results are ordered problems first
 * (critical, warning), then positives, then neutral observations.
 */
export function buildInsights(input: InsightInput): Insight[] {
  const now = input.now ?? new Date();
  const money = (value: number) => formatMoney(value, input.currencyCode);
  const { from, to } = input.range;
  const validRange = isCalendarDate(from) && isCalendarDate(to);
  const current = validRange
    ? input.orders.filter((order) => orderInCalendarRange(order.created_at, from, to))
    : input.orders;

  const insights: Insight[] = [];
  const revenue = revenueOf(current);
  const orderIds = new Set(current.map((order) => order.id));
  const itemsInRange = input.orderItems.filter((item) => orderIds.has(item.order_id));
  const sold = current.filter(
    (order) => order.status !== "cancelled" && order.status !== "refunded",
  );

  // 1. Revenue against the previous period of equal length.
  const previous = validRange ? previousRange({ from, to }) : null;
  if (previous) {
    const priorOrders = input.orders.filter((order) =>
      orderInCalendarRange(order.created_at, previous.from, previous.to),
    );
    const priorRevenue = revenueOf(priorOrders);
    if (priorRevenue > 0) {
      const change = signedPercent(revenue, priorRevenue);
      const direction = change >= 0 ? "up" : "down";
      const severity: InsightSeverity =
        change <= -25
          ? "critical"
          : change <= -5
            ? "warning"
            : change >= 5
              ? "positive"
              : "info";
      insights.push({
        id: "revenue-vs-previous",
        kind: "revenue",
        severity,
        headline:
          severity === "info"
            ? "Revenue is holding steady"
            : `Revenue is ${direction} against the previous period`,
        detail: `${money(revenue)} over ${current.length} order${
          current.length === 1 ? "" : "s"
        } against ${money(priorRevenue)} over ${priorOrders.length} in ${previous.from} to ${
          previous.to
        }.`,
        metric: {
          label: "Change",
          value: `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`,
        },
        actionHref: severity === "positive" ? "/analytics?tab=trends" : "/offers",
        actionLabel: severity === "positive" ? "See the trend" : "Run an offer",
      });
    }
  }

  // 2. Margin on the lines sold in this range.
  const margin = computeMarginSnapshot({
    orders: current,
    orderItems: itemsInRange,
    products: input.products,
  });
  if (margin.revenue > 0) {
    const pct = margin.marginPercent;
    const severity: InsightSeverity = pct < 10 ? "critical" : pct < 20 ? "warning" : "positive";
    insights.push({
      id: "margin-overall",
      kind: "margin",
      severity,
      headline:
        severity === "positive"
          ? "Margin is healthy on what sold"
          : "Margin on this period's sales is thin",
      detail: `${money(margin.margin)} gross margin on ${money(margin.revenue)} of line revenue, with ${money(
        margin.cost,
      )} of recorded cost. ${margin.lines.length} line${
        margin.lines.length === 1 ? "" : "s"
      } analysed.`,
      metric: { label: "Gross margin", value: `${pct.toFixed(1)}%` },
      actionHref: "/manager/products/intelligence",
      actionLabel: "Review pricing",
    });

    const categories = marginByCategory({
      orders: current,
      orderItems: itemsInRange,
      products: input.products,
    });
    const weakest = categories[0];
    const gap = pct - (weakest?.marginPercent ?? pct);
    if (weakest && categories.length > 1 && (gap >= 10 || weakest.marginPercent < 15)) {
      insights.push({
        id: "margin-weakest-category",
        kind: "margin",
        severity: weakest.marginPercent < 10 ? "warning" : "info",
        headline: `${weakest.category} earns the least of any category`,
        detail: `${weakest.marginPercent.toFixed(1)}% margin on ${money(
          weakest.revenue,
        )} sold — ${gap.toFixed(1)} points below the ${pct.toFixed(
          1,
        )}% overall, on costs taken from each product's cost price.`,
        metric: { label: weakest.category, value: `${weakest.marginPercent.toFixed(1)}%` },
        actionHref: "/manager/products/intelligence",
        actionLabel: "Check costs",
      });
    }
  }

  // 3. Best and worst sellers, plus stock that never moved.
  const quantityByProduct = new Map<string, { qty: number; revenue: number }>();
  for (const item of itemsInRange) {
    const row = quantityByProduct.get(item.product_name_snapshot) ?? { qty: 0, revenue: 0 };
    row.qty += item.quantity;
    row.revenue += item.line_total;
    quantityByProduct.set(item.product_name_snapshot, row);
  }
  const sellers = Array.from(quantityByProduct, ([name, row]) => ({ name, ...row })).sort(
    (a, b) => b.revenue - a.revenue,
  );
  if (sellers.length > 1) {
    const best = sellers[0];
    const worst = sellers[sellers.length - 1];
    insights.push({
      id: "sellers-range",
      kind: "inventory",
      severity: "info",
      headline: `${best.name} leads, ${worst.name} trails`,
      detail: `${best.name} sold ${best.qty} unit${
        best.qty === 1 ? "" : "s"
      } for ${money(best.revenue)}; ${worst.name} sold ${worst.qty} for ${money(
        worst.revenue,
      )} across ${sellers.length} products.`,
      metric: { label: "Top product revenue", value: money(best.revenue) },
      actionHref: "/manager/products/intelligence",
      actionLabel: "Product insights",
    });
  }

  const soldIds = new Set(
    itemsInRange.map((item) => item.product_id).filter((id): id is string => id != null),
  );
  const dead = input.products.filter((product) => isDeadStock(product, soldIds));
  if (dead.length && soldIds.size > 0) {
    insights.push({
      id: "inventory-dead-stock",
      kind: "inventory",
      severity: dead.length > input.products.length / 4 ? "warning" : "info",
      headline: `${dead.length} product${dead.length === 1 ? "" : "s"} had no sales`,
      detail: `In stock and active but absent from every bill in this range, starting with ${dead
        .slice(0, 3)
        .map((product) => product.name)
        .join(", ")}.`,
      metric: { label: "No-sales stock", value: String(dead.length) },
      actionHref: "/manager/products/inventory",
      actionLabel: "Review stock",
    });
  }

  // 4. Repeat business.
  const namedOrders = sold.filter((order) => order.customer_id != null);
  if (namedOrders.length > 1) {
    const counts = new Map<string, number>();
    for (const order of namedOrders) {
      const id = order.customer_id;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const repeat = Array.from(counts.values()).filter((n) => n > 1).length;
    const rate = percent(repeat, counts.size);
    const walkIns = sold.length - namedOrders.length;
    insights.push({
      id: "customers-repeat-rate",
      kind: "customers",
      severity: rate >= 30 ? "positive" : rate < 15 ? "warning" : "info",
      headline:
        rate >= 30
          ? "Repeat customers are coming back"
          : "Most customers bought only once",
      detail: `${repeat} of ${counts.size} named customer${
        counts.size === 1 ? "" : "s"
      } ordered more than once in this range, alongside ${walkIns} walk-in bill${
        walkIns === 1 ? "" : "s"
      }.`,
      metric: { label: "Repeat rate", value: `${rate.toFixed(0)}%` },
      actionHref: "/customers",
      actionLabel: "Open customers",
    });
  }

  // 5. Expenses against revenue, and what was actually collected.
  const expensesInRange = input.expenses.filter(
    (expense) => expense.incurredOn >= from && expense.incurredOn <= to,
  );
  const expenseTotal = expensesInRange.reduce((total, row) => total + row.amount, 0);
  if (revenue > 0 && expensesInRange.length) {
    const ratio = percent(expenseTotal, revenue);
    const byCategory = new Map<string, number>();
    for (const expense of expensesInRange) {
      byCategory.set(
        expense.category,
        (byCategory.get(expense.category) ?? 0) + expense.amount,
      );
    }
    const biggest = Array.from(byCategory).sort((a, b) => b[1] - a[1])[0];
    insights.push({
      id: "cashflow-expenses",
      kind: "cashflow",
      severity: ratio >= 100 ? "critical" : ratio >= 60 ? "warning" : "positive",
      headline:
        ratio >= 100
          ? "Expenses are above recorded revenue"
          : `Expenses are ${ratio.toFixed(0)}% of revenue`,
      detail: `${money(expenseTotal)} logged against ${money(revenue)} of sales over ${
        sold.length
      } order${sold.length === 1 ? "" : "s"}. Largest category: ${
        biggest ? `${biggest[0].replace(/_/g, " ")} at ${money(biggest[1])}` : "none"
      }.`,
      metric: { label: "Spend ratio", value: `${ratio.toFixed(0)}%` },
      actionHref: "/manager/finance/expenses",
      actionLabel: "Review expenses",
    });
  }

  const collected = input.payments
    .filter(
      (payment) =>
        orderIds.has(payment.order_id) &&
        payment.status !== "failed" &&
        payment.status !== "refunded",
    )
    .reduce((total, payment) => total + payment.amount, 0);
  if (revenue > 0 && collected > 0) {
    const coverage = percent(collected, revenue);
    insights.push({
      id: "cashflow-collections",
      kind: "cashflow",
      severity: coverage >= 90 ? "positive" : coverage >= 60 ? "info" : "warning",
      headline:
        coverage >= 90
          ? "Collections are keeping up with billing"
          : "Cash collected lags behind billing",
      detail: `${money(collected)} recorded in payments against ${money(
        revenue,
      )} billed in this range (${coverage.toFixed(0)}% covered).`,
      metric: { label: "Collected", value: `${coverage.toFixed(0)}%` },
      actionHref: "/manager/finance/payments",
      actionLabel: "Open payments",
    });
  }

  // 6. Risk: ageing receivables and refunds.
  const open = input.orders.filter(
    (order) =>
      isOpenReceivable(order) &&
      (!validRange || orderInCalendarRange(order.created_at, "1970-01-01", to)),
  );
  if (open.length) {
    const due = open.reduce(
      (total, order) => total + (order.grand_total - (order.amount_paid ?? 0)),
      0,
    );
    const aged = open
      .map((order) => ({
        order,
        days: wholeDaysBefore(order.created_at, now.toISOString()),
      }))
      .filter((row) => row.days > 30);
    const agedDue = aged.reduce(
      (total, row) => total + (row.order.grand_total - (row.order.amount_paid ?? 0)),
      0,
    );
    insights.push({
      id: "risk-receivables-ageing",
      kind: "risk",
      severity: aged.length ? "critical" : due > 0 ? "warning" : "info",
      headline: aged.length
        ? `${aged.length} bill${aged.length === 1 ? "" : "s"} over 30 days old`
        : `${money(due)} still to collect`,
      detail: `${money(due)} unpaid across ${open.length} open bill${
        open.length === 1 ? "" : "s"
      }${
        aged.length
          ? `, of which ${money(agedDue)} has been outstanding for more than 30 days`
          : ", none older than 30 days"
      }.`,
      metric: { label: "Receivables", value: money(due) },
      actionHref: "/manager/finance/receivables",
      actionLabel: "Chase payments",
    });
  }

  const refundsInRange = input.refunds.filter((row) => orderIds.has(row.order_id));
  if (refundsInRange.length) {
    const refundTotal = refundsInRange.reduce((total, row) => total + row.amount, 0);
    const ratio = revenue > 0 ? percent(refundTotal, revenue) : 100;
    insights.push({
      id: "risk-refunds",
      kind: "risk",
      severity: ratio >= 5 ? "warning" : "info",
      headline: `${refundsInRange.length} refund${
        refundsInRange.length === 1 ? "" : "s"
      } recorded`,
      detail: `${money(refundTotal)} refunded in this range, ${ratio.toFixed(
        1,
      )}% of net sales of ${money(revenue)}.`,
      metric: { label: "Refunds", value: money(refundTotal) },
      actionHref: "/manager/finance/refunds",
      actionLabel: "Review refunds",
    });
  }

  return insights.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      KIND_RANK[a.kind] - KIND_RANK[b.kind],
  );
}
