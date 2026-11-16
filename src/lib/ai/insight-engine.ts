/**
 * The insight engine: deterministic rules over `BusinessContext`.
 *
 * No model, no randomness, no network. Given the same records and the same
 * clock it returns the same ranked list, and every insight carries the numbers
 * and entity names it was derived from plus a link into the module that fixes
 * it. Rules are additive and independent on purpose — a rule that has nothing
 * to say returns `null` rather than padding the list.
 */

import { formatMoney } from "@/lib/format";
import { THIN_MARGIN_PERCENT, type BusinessContext } from "./context";
import type { AiEvidence, AiInsight, AiSeverity } from "./types";

export const MAX_INSIGHTS = 12;

/** Window-over-window revenue moves smaller than this are noise, not an insight. */
const SALES_MOVE_PERCENT = 10;
/** Expense growth worth mentioning, in percent. */
const EXPENSE_JUMP_PERCENT = 15;

const SEVERITY_ORDER: AiSeverity[] = [
  "critical",
  "warning",
  "opportunity",
  "info",
];

export function severityRank(severity: AiSeverity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

function money(ctx: BusinessContext, amount: number): string {
  return formatMoney(amount, ctx.brand.currencyCode);
}

function clock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function plural(count: number, singular: string, suffix = "s"): string {
  return `${count} ${count === 1 ? singular : `${singular}${suffix}`}`;
}

function topEvidence(rows: AiEvidence[], limit = 5): AiEvidence[] {
  return rows.slice(0, limit);
}

type Rule = (ctx: BusinessContext) => AiInsight | null;

const outOfStockRule: Rule = (ctx) => {
  const rows = ctx.inventory.outOfStock;
  if (rows.length === 0) return null;
  return {
    id: "inventory-out-of-stock",
    kind: "inventory",
    severity: "critical",
    headline: `${plural(rows.length, "item")} sold out on the shelf`,
    detail: `${rows.map((row) => row.name).join(", ")} ${rows.length === 1 ? "is" : "are"} at zero against a low-stock threshold, so the counter cannot sell them.`,
    evidence: topEvidence(
      rows.map((row) => ({
        label: row.name,
        value: `0 left · threshold ${row.threshold}`,
        href: "/manager/products/inventory",
      })),
    ),
    metric: { label: "Sold out", value: String(rows.length) },
    score: 50 + rows.length * 10,
    actionHref: "/manager/products/procurement",
    actionLabel: "Raise a purchase order",
  };
};

const lowStockRule: Rule = (ctx) => {
  const rows = ctx.inventory.lowStock;
  if (rows.length === 0) return null;
  return {
    id: "inventory-low-stock",
    kind: "inventory",
    severity: "warning",
    headline: `${plural(rows.length, "item")} at or below the reorder level`,
    detail: `Reorder quantity suggested by each product's own threshold: ${rows
      .slice(0, 3)
      .map((row) => `${row.name} (+${row.suggestedReorderQty})`)
      .join(", ")}${rows.length > 3 ? ", and more" : ""}.`,
    evidence: topEvidence(
      rows.map((row) => ({
        label: row.name,
        value: `${row.stock}${row.unit ? ` ${row.unit}` : ""} left · threshold ${row.threshold}`,
        href: "/manager/products/inventory",
      })),
    ),
    metric: { label: "Low stock", value: String(rows.length) },
    score: 20 + rows.length * 5,
    actionHref: "/manager/products/inventory",
    actionLabel: "Review stock levels",
  };
};

const agedReceivablesRule: Rule = (ctx) => {
  const { agedCount, agedTotal, oldestDays, overdueAfterDays, rows } = ctx.receivables;
  if (agedCount === 0) return null;
  const dominatesSales =
    ctx.sales.revenue > 0 && agedTotal > ctx.sales.revenue;
  return {
    id: "receivables-aged",
    kind: "receivables",
    severity: dominatesSales ? "critical" : "warning",
    headline: `${plural(agedCount, "invoice")} unpaid for ${overdueAfterDays}+ days`,
    detail: `${money(ctx, agedTotal)} is sitting with customers${
      oldestDays !== null ? `, the oldest for ${oldestDays} days` : ""
    }. Invoices carry no due date in OrderBook, so age counts from issue.`,
    evidence: topEvidence(
      rows.map((row) => ({
        label: `${row.label}${row.sublabel ? ` · ${row.sublabel}` : ""}`,
        value: `${money(ctx, row.amount)} · ${row.days} days`,
        href: row.href,
      })),
    ),
    metric: { label: "Unpaid 3+ days", value: money(ctx, agedTotal) },
    score: 30 + agedCount * 10 + (oldestDays ?? 0),
    actionHref: "/manager/finance/receivables",
    actionLabel: "Open receivables",
  };
};

const openReceivablesRule: Rule = (ctx) => {
  if (ctx.receivables.count === 0 || ctx.receivables.agedCount > 0) return null;
  return {
    id: "receivables-open",
    kind: "receivables",
    severity: "info",
    headline: `${money(ctx, ctx.receivables.total)} is still outstanding`,
    detail: `${plural(ctx.receivables.count, "invoice")} has a balance and nothing has crossed the ${ctx.receivables.overdueAfterDays}-day chase threshold yet.`,
    evidence: topEvidence(
      ctx.receivables.rows.map((row) => ({
        label: `${row.label}${row.sublabel ? ` · ${row.sublabel}` : ""}`,
        value: `${money(ctx, row.amount)} · ${row.days} days`,
        href: row.href,
      })),
    ),
    metric: { label: "Outstanding", value: money(ctx, ctx.receivables.total) },
    score: 10 + ctx.receivables.count * 2,
    actionHref: "/manager/finance/receivables",
    actionLabel: "Open receivables",
  };
};

const staleQuotesRule: Rule = (ctx) => {
  if (ctx.quotes.staleCount === 0) return null;
  const staleRows = ctx.quotes.rows.filter(
    (row) => row.days >= ctx.quotes.staleAfterDays,
  );
  return {
    id: "quotes-stale",
    kind: "quotes",
    severity: "warning",
    headline: `${plural(ctx.quotes.staleCount, "quote")} with no reply for ${ctx.quotes.staleAfterDays}+ days`,
    detail: `${money(ctx, ctx.quotes.staleValue)} of work is quoted and waiting. A quote that goes quiet is usually a lost job, not a delayed one.`,
    evidence: topEvidence(
      staleRows.map((row) => ({
        label: `${row.label}${row.sublabel ? ` · ${row.sublabel}` : ""}`,
        value: `${money(ctx, row.amount)} · ${row.days} days`,
        href: row.href,
      })),
    ),
    metric: { label: "Awaiting reply", value: money(ctx, ctx.quotes.staleValue) },
    score: 25 + ctx.quotes.staleCount * 10,
    actionHref: "/orders",
    actionLabel: "Open quotes",
  };
};

const openQuotesRule: Rule = (ctx) => {
  if (ctx.quotes.openCount === 0 || ctx.quotes.staleCount > 0) return null;
  return {
    id: "quotes-open",
    kind: "quotes",
    severity: "info",
    headline: `${plural(ctx.quotes.openCount, "quote")} awaiting a decision`,
    detail: `${money(ctx, ctx.quotes.openValue)} is on the table. None has been sitting longer than ${ctx.quotes.staleAfterDays} days.`,
    evidence: topEvidence(
      ctx.quotes.rows.map((row) => ({
        label: `${row.label}${row.sublabel ? ` · ${row.sublabel}` : ""}`,
        value: `${money(ctx, row.amount)} · ${row.days} days`,
        href: row.href,
      })),
    ),
    metric: { label: "Quoted", value: money(ctx, ctx.quotes.openValue) },
    score: 8 + ctx.quotes.openCount * 2,
    actionHref: "/orders",
    actionLabel: "Open quotes",
  };
};

const thinMarginRule: Rule = (ctx) => {
  if (ctx.margin.revenue <= 0) return null;
  const lines = ctx.margin.thinLines;
  const blendedIsThin = ctx.margin.marginPercent < THIN_MARGIN_PERCENT;
  if (lines.length === 0 && !blendedIsThin) return null;
  return {
    id: "margin-thin",
    kind: "margin",
    severity: blendedIsThin ? "warning" : "opportunity",
    headline: blendedIsThin
      ? `Blended margin is ${ctx.margin.marginPercent.toFixed(1)}% on ${money(ctx, ctx.margin.revenue)} of sales`
      : `${plural(lines.length, "line")} sold below ${THIN_MARGIN_PERCENT}% margin`,
    detail:
      lines.length > 0
        ? `Costed lines dragging hardest: ${lines
            .slice(0, 3)
            .map((line) => `${line.name} (${line.marginPercent.toFixed(1)}%)`)
            .join(", ")}.`
        : `The blended figure is thin but every costed line is above ${THIN_MARGIN_PERCENT}%, so this is mix, not pricing.`,
    evidence: topEvidence([
      ...lines.map((line) => ({
        label: line.name,
        value: `${line.marginPercent.toFixed(1)}% on ${money(ctx, line.revenue)}`,
        href: "/analytics?tab=margin",
      })),
      {
        label: "Window revenue",
        value: `${money(ctx, ctx.margin.revenue)} · cost ${money(ctx, ctx.margin.cost)}`,
        href: "/analytics?tab=margin",
      },
    ]),
    metric: { label: "Margin", value: `${ctx.margin.marginPercent.toFixed(1)}%` },
    score: 15 + lines.length * 5,
    actionHref: "/analytics?tab=margin",
    actionLabel: "Review margin",
  };
};

const salesMoveRule: Rule = (ctx) => {
  const change = ctx.sales.changePercent;
  if (change === null || Math.abs(change) < SALES_MOVE_PERCENT) return null;
  const down = change < 0;
  return {
    id: down ? "sales-down" : "sales-up",
    kind: "sales",
    severity: down ? "warning" : "opportunity",
    headline: `Sales ${down ? "down" : "up"} ${Math.abs(change).toFixed(0)}% against the previous ${ctx.window.days} days`,
    detail: `${money(ctx, ctx.sales.revenue)} over ${plural(ctx.sales.orders, "order")} now, versus ${money(ctx, ctx.sales.previousRevenue)} over ${plural(ctx.sales.previousOrders, "order")} before.${
      ctx.sales.topCategory
        ? ` ${ctx.sales.topCategory.name} is the biggest earner in this window.`
        : ""
    }`,
    evidence: topEvidence([
      {
        label: "This window",
        value: `${money(ctx, ctx.sales.revenue)} · ${ctx.sales.orders} orders`,
        href: "/analytics",
      },
      {
        label: "Previous window",
        value: `${money(ctx, ctx.sales.previousRevenue)} · ${ctx.sales.previousOrders} orders`,
        href: "/analytics",
      },
      ...(ctx.sales.bestDay
        ? [
            {
              label: `Best day (${ctx.sales.bestDay.date})`,
              value: money(ctx, ctx.sales.bestDay.revenue),
              href: "/analytics",
            },
          ]
        : []),
    ]),
    metric: { label: "Change", value: `${change > 0 ? "+" : ""}${change.toFixed(1)}%` },
    score: 12 + Math.min(30, Math.abs(change) / 2),
    actionHref: "/analytics",
    actionLabel: "Open analytics",
  };
};

const slowMoverRule: Rule = (ctx) => {
  const rows = ctx.products.notSelling;
  if (rows.length === 0) return null;
  const units = rows.reduce((total, row) => total + row.stock, 0);
  return {
    id: "products-slow-movers",
    kind: "inventory",
    severity: "opportunity",
    headline: `${plural(rows.length, "line")} holding stock with no sale in ${ctx.window.days} days`,
    detail: `${plural(units, "unit")} of ${rows.map((row) => row.name).slice(0, 3).join(", ")}${rows.length > 3 ? " and others" : ""} moved nothing in the window.`,
    evidence: topEvidence(
      rows.map((row) => ({
        label: row.name,
        value: `${row.stock} in stock · no sales`,
        href: "/manager/products/intelligence",
      })),
    ),
    metric: { label: "Idle units", value: String(units) },
    score: 10 + rows.length * 3,
    actionHref: "/manager/products/intelligence",
    actionLabel: "Open product insights",
  };
};

const overdueTasksRule: Rule = (ctx) => {
  const rows = ctx.tasks.rows.filter((task) => task.overdue);
  if (rows.length === 0) return null;
  return {
    id: "tasks-overdue",
    kind: "tasks",
    severity: "warning",
    headline: `${plural(rows.length, "task")} past their due date`,
    detail: `Oldest open commitment: ${rows[0].title}.`,
    evidence: topEvidence(
      rows.map((row) => ({
        label: row.title,
        value: row.dueAt ? `due ${clock(row.dueAt)} ${row.dueAt.slice(0, 10)}` : "no due date",
        href: "/manager/productivity/tasks",
      })),
    ),
    metric: { label: "Overdue", value: String(rows.length) },
    score: 22 + rows.length * 6,
    actionHref: "/manager/productivity/tasks",
    actionLabel: "Open tasks",
  };
};

const tasksTodayRule: Rule = (ctx) => {
  if (ctx.tasks.dueToday === 0) return null;
  return {
    id: "tasks-due-today",
    kind: "tasks",
    severity: "info",
    headline: `${plural(ctx.tasks.dueToday, "task")} due today, ${ctx.tasks.open} open overall`,
    detail: `Nothing here needs a decision, only doing — the list is already written.`,
    evidence: topEvidence(
      ctx.tasks.rows
        .filter((row) => row.dueAt !== null && row.dueAt.slice(0, 10) === ctx.today)
        .map((row) => ({
          label: row.title,
          value: `due ${clock(row.dueAt ?? ctx.generatedAt)}`,
          href: "/manager/productivity/tasks",
        })),
    ),
    metric: { label: "Due today", value: String(ctx.tasks.dueToday) },
    score: 6 + ctx.tasks.dueToday * 2,
    actionHref: "/manager/productivity/tasks",
    actionLabel: "Open tasks",
  };
};

const appointmentsRule: Rule = (ctx) => {
  const today = ctx.appointments.today;
  const next = ctx.appointments.nextTwentyFourHours;
  if (today.length === 0 && next.length === 0) return null;
  const first = today[0] ?? next[0];
  const withCustomer = (today.length ? today : next).filter(
    (row) => row.customerName !== null,
  );
  return {
    id: today.length > 0 ? "appointments-today" : "appointments-next-24h",
    kind: "appointments",
    severity: "info",
    headline:
      today.length > 0
        ? `${plural(today.length, "booking")} on the calendar today`
        : `${plural(next.length, "booking")} in the next 24 hours`,
    detail: `First up: ${first.title} at ${clock(first.startsAt)}${
      first.customerName ? ` with ${first.customerName}` : ""
    }.`,
    evidence: topEvidence(
      (today.length > 0 ? today : next).map((row) => ({
        label: row.title,
        value: `${clock(row.startsAt)}${row.customerName ? ` · ${row.customerName}` : ""}`,
        href: "/manager/productivity/appointments",
      })),
    ),
    metric: {
      label: today.length > 0 ? "Today" : "Next 24h",
      value: String(today.length > 0 ? today.length : next.length),
    },
    score: 5 + Math.max(today.length, next.length) * 2 + withCustomer.length,
    actionHref: "/manager/productivity/appointments",
    actionLabel: "Open bookings",
  };
};

const staffingRule: Rule = (ctx) => {
  if (ctx.staff.active === 0) return null;
  if (ctx.staff.available === 0) {
    return {
      id: "staffing-no-availability",
      kind: "staffing",
      severity: "warning",
      headline: "Nobody is marked available",
      detail: `${ctx.staff.busy} marked busy and ${ctx.staff.off} off duty out of ${ctx.staff.active} active staff. New work has no one to land on.`,
      evidence: topEvidence(
        ctx.staff.onShiftNow.length > 0
          ? ctx.staff.onShiftNow.map((row) => ({
              label: row.name,
              value: `on shift ${row.shift}`,
              href: "/manager/staff/schedules",
            }))
          : [
              {
                label: "On shift now",
                value: "No rota row covers this hour",
                href: "/manager/staff/schedules",
              },
            ],
      ),
      metric: { label: "Available", value: "0" },
      score: 18,
      actionHref: "/manager/staff/schedules",
      actionLabel: "Open the rota",
    };
  }
  if (ctx.staff.onShiftNow.length === 0 && ctx.staff.scheduledToday > 0) {
    return {
      id: "staffing-off-peak",
      kind: "staffing",
      severity: "info",
      headline: "No one is inside a shift right now",
      detail: `${ctx.staff.scheduledToday} ${ctx.staff.scheduledToday === 1 ? "person is" : "people are"} rostered today but the current hour is not covered.`,
      evidence: [
        {
          label: "Available to assign",
          value: String(ctx.staff.available),
          href: "/manager/staff/directory",
        },
      ],
      metric: { label: "On shift", value: "0" },
      score: 4,
      actionHref: "/manager/staff/schedules",
      actionLabel: "Open the rota",
    };
  }
  return null;
};

const expensesRule: Rule = (ctx) => {
  const change = ctx.expenses.changePercent;
  if (change === null || change < EXPENSE_JUMP_PERCENT || ctx.expenses.thisMonth <= 0) {
    return null;
  }
  return {
    id: "expenses-up",
    kind: "expenses",
    severity: "warning",
    headline: `Expenses up ${change.toFixed(0)}% on last month`,
    detail: `${money(ctx, ctx.expenses.thisMonth)} across ${plural(ctx.expenses.thisMonthCount, "entry")} this month, versus ${money(ctx, ctx.expenses.previousMonth)} last month.`,
    evidence: topEvidence(
      ctx.expenses.top.map((row) => ({
        label: `${row.title} · ${row.category.replace(/_/g, " ")}`,
        value: money(ctx, row.amount),
        href: "/manager/finance/expenses",
      })),
    ),
    metric: { label: "This month", value: money(ctx, ctx.expenses.thisMonth) },
    score: 14 + change / 4,
    actionHref: "/manager/finance/expenses",
    actionLabel: "Open expenses",
  };
};

const latePurchaseOrdersRule: Rule = (ctx) => {
  const rows = ctx.purchaseOrders.open.filter((po) => po.late);
  if (rows.length === 0) return null;
  return {
    id: "procurement-late-pos",
    kind: "procurement",
    severity: "warning",
    headline: `${plural(rows.length, "purchase order")} past the expected date`,
    detail: `${rows.map((po) => `${po.poNumber} from ${po.supplierName}`).join(", ")} were due in earlier.`,
    evidence: topEvidence(
      rows.map((po) => ({
        label: `${po.poNumber} · ${po.supplierName}`,
        value: `expected ${po.expectedOn}`,
        href: "/manager/products/procurement",
      })),
    ),
    metric: { label: "Late", value: String(rows.length) },
    score: 24 + rows.length * 6,
    actionHref: "/manager/products/procurement",
    actionLabel: "Open procurement",
  };
};

const cashClosingRule: Rule = (ctx) => {
  if (!ctx.cash.hasSessionToday || ctx.cash.sessionClosedToday) return null;
  return {
    id: "cash-open-session",
    kind: "cash",
    severity: "info",
    headline: "Today's cash session is still open",
    detail: `${money(ctx, ctx.cash.todayIn)} in and ${money(ctx, ctx.cash.todayOut)} out so far. Closing the drawer reconciles the day.`,
    evidence: [
      {
        label: "Cash in today",
        value: money(ctx, ctx.cash.todayIn),
        href: "/manager/finance/cash",
      },
      {
        label: "Cash out today",
        value: money(ctx, ctx.cash.todayOut),
        href: "/manager/finance/cash",
      },
    ],
    metric: { label: "Net today", value: money(ctx, ctx.cash.netToday) },
    score: 7,
    actionHref: "/manager/finance/cash",
    actionLabel: "Open cash & reconciliation",
  };
};

const RULES: Rule[] = [
  outOfStockRule,
  lowStockRule,
  agedReceivablesRule,
  openReceivablesRule,
  staleQuotesRule,
  openQuotesRule,
  thinMarginRule,
  salesMoveRule,
  slowMoverRule,
  overdueTasksRule,
  tasksTodayRule,
  appointmentsRule,
  staffingRule,
  expensesRule,
  latePurchaseOrdersRule,
  cashClosingRule,
];

export function buildInsights(ctx: BusinessContext): AiInsight[] {
  const insights = RULES.map((rule) => rule(ctx)).filter(
    (insight): insight is AiInsight => insight !== null,
  );
  return insights
    .sort(
      (a, b) =>
        severityRank(a.severity) - severityRank(b.severity) ||
        b.score - a.score ||
        a.id.localeCompare(b.id),
    )
    .slice(0, MAX_INSIGHTS);
}
