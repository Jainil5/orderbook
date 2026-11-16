/**
 * Next-best-actions, derived from the ranked insights.
 *
 * A recommendation is an insight turned into one concrete job with a destination
 * module. It is not executable on its own: `toProposal` wraps it in an
 * `AiActionProposal` that states exactly which OrderBook record will be created,
 * and the accept action in `services/ai-actions.ts` is the only thing that
 * writes. Nothing here sends anything anywhere.
 */

import { formatMoney } from "@/lib/format";
import { THIN_MARGIN_PERCENT, type BusinessContext } from "./context";
import type {
  AiActionProposal,
  AiInsight,
  AiRecommendation,
  AiTaskPriority,
} from "./types";

export const MAX_RECOMMENDATIONS = 8;

/** `validateTaskInput` caps titles at 120 and descriptions at 500 characters. */
const TITLE_LIMIT = 118;
const DESCRIPTION_LIMIT = 480;

const TASK_DELIVERY_NOTE =
  "Creates one task in Tasks & to-dos. It does not message, call or email anyone — the follow-up stays yours to make.";

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1).trimEnd()}…`;
}

function money(ctx: BusinessContext, amount: number): string {
  return formatMoney(amount, ctx.brand.currencyCode);
}

function one(count: number, singular: string, pluralWord = `${singular}s`): string {
  return count === 1 ? singular : pluralWord;
}

function rowLabel(row: { label: string; sublabel: string | null }): string {
  return row.sublabel ? `${row.label} (${row.sublabel})` : row.label;
}

function taskRecord(
  title: string,
  lines: string[],
  priority: AiTaskPriority,
): AiRecommendation["record"] {
  return {
    kind: "task",
    title: truncate(title, TITLE_LIMIT),
    description: truncate(lines.join("\n"), DESCRIPTION_LIMIT),
    priority,
  };
}

type Builder = (
  ctx: BusinessContext,
  insight: AiInsight,
) => AiRecommendation | null;

function appointmentRecommendation(
  ctx: BusinessContext,
  insight: AiInsight,
  when: string,
): AiRecommendation | null {
  const rows =
    when === "today"
      ? ctx.appointments.today
      : ctx.appointments.nextTwentyFourHours;
  if (rows.length === 0) return null;
  return {
    id: `rec-${insight.id}`,
    insightId: insight.id,
    kind: "appointments",
    title: `Confirm ${rows.length} ${one(rows.length, "booking")} ${when}`,
    why: "A booking the customer has forgotten becomes a no-show and a lost slot.",
    href: "/manager/productivity/appointments",
    linkLabel: "Open appointments & bookings",
    evidence: insight.evidence.slice(0, 4),
    record: taskRecord(
      `Confirm ${rows.length} ${one(rows.length, "booking")} ${when}`,
      [
        "From the bookings calendar. Contact the customers yourself — no reminder has been sent.",
        "",
        ...rows.map(
          (row) =>
            `• ${row.title} at ${row.startsAt.slice(11, 16)}${row.customerName ? ` — ${row.customerName}` : ""}`,
        ),
      ],
      "medium",
    ),
    deliveryNote: TASK_DELIVERY_NOTE,
  };
}

const builders: Record<string, Builder> = {
  "receivables-aged": (ctx, insight) => {
    const rows = ctx.receivables.rows.filter(
      (row) => row.days >= ctx.receivables.overdueAfterDays,
    );
    if (rows.length === 0) return null;
    const title = `Chase ${rows.length} unpaid ${one(rows.length, "invoice")} (${money(ctx, ctx.receivables.agedTotal)})`;
    return {
      id: `rec-${insight.id}`,
      insightId: insight.id,
      kind: "receivables",
      title: `Chase ${rows.length} unpaid ${one(rows.length, "invoice")} totalling ${money(ctx, ctx.receivables.agedTotal)}`,
      why: `Unpaid for ${rows[0].days}+ days since issue, past the ${ctx.receivables.overdueAfterDays}-day chase threshold.`,
      href: "/manager/finance/receivables",
      linkLabel: "Open receivables",
      evidence: insight.evidence.slice(0, 4),
      record: taskRecord(
        title,
        [
          "Collected by OrderBook AI from unpaid balances. Contact each customer yourself — no message has been sent.",
          "",
          ...rows.map(
            (row) =>
              `• ${rowLabel(row)} — ${money(ctx, row.amount)} unpaid for ${row.days} days`,
          ),
        ],
        ctx.receivables.agedTotal > ctx.sales.revenue ? "high" : "medium",
      ),
      deliveryNote: TASK_DELIVERY_NOTE,
    };
  },

  "quotes-stale": (ctx, insight) => {
    const rows = ctx.quotes.rows.filter(
      (row) => row.days >= ctx.quotes.staleAfterDays,
    );
    if (rows.length === 0) return null;
    return {
      id: `rec-${insight.id}`,
      insightId: insight.id,
      kind: "quotes",
      title: `Follow up on ${rows.length} unanswered ${one(rows.length, "quote")} worth ${money(ctx, ctx.quotes.staleValue)}`,
      why: `No reply after ${ctx.quotes.staleAfterDays} days; the amount at stake is the whole quote.`,
      href: "/orders",
      linkLabel: "Open quotes & bills",
      evidence: insight.evidence.slice(0, 4),
      record: taskRecord(
        `Follow up on ${rows.length} unanswered ${one(rows.length, "quote")}`,
        [
          "Collected by OrderBook AI from quotations still awaiting a decision. Contact the customers yourself — nothing has been sent.",
          "",
          ...rows.map(
            (row) =>
              `• ${rowLabel(row)} — ${money(ctx, row.amount)} quoted ${row.days} days ago`,
          ),
        ],
        rows.length >= 3 ? "high" : "medium",
      ),
      deliveryNote: TASK_DELIVERY_NOTE,
    };
  },

  "inventory-low-stock": (ctx, insight) => {
    const rows = [...ctx.inventory.outOfStock, ...ctx.inventory.lowStock];
    if (rows.length === 0) return null;
    return {
      id: `rec-${insight.id}`,
      insightId: insight.id,
      kind: "inventory",
      title: `Reorder ${rows.length} ${one(rows.length, "item")} at or below the reorder level`,
      why: "Each suggested quantity refills that product to twice its own low-stock threshold.",
      href: "/manager/products/procurement",
      linkLabel: "Open procurement",
      evidence: insight.evidence.slice(0, 4),
      record: taskRecord(
        `Reorder ${rows.length} low-stock ${one(rows.length, "item")}`,
        [
          "Collected by OrderBook AI from stock levels. Raise the purchase order with your supplier yourself — no order has been placed.",
          "",
          ...rows.map(
            (row) =>
              `• ${row.name}${row.sku ? ` (${row.sku})` : ""} — ${row.stock} left, order ${row.suggestedReorderQty}${row.unit ? ` ${row.unit}` : ""}`,
          ),
        ],
        ctx.inventory.outOfStock.length > 0 ? "high" : "medium",
      ),
      deliveryNote: TASK_DELIVERY_NOTE,
    };
  },

  "margin-thin": (ctx, insight) => {
    const lines = ctx.margin.thinLines;
    if (lines.length === 0) return null;
    const sold = lines.reduce((total, line) => total + line.revenue, 0);
    return {
      id: `rec-${insight.id}`,
      insightId: insight.id,
      kind: "margin",
      title: `Review pricing on ${lines.length} ${one(lines.length, "line")} below ${THIN_MARGIN_PERCENT}% margin`,
      why: `They sold ${money(ctx, sold)} in this window at ${lines[0].marginPercent.toFixed(1)}% margin or less.`,
      href: "/analytics?tab=margin",
      linkLabel: "Open margin & COGS",
      evidence: insight.evidence.slice(0, 4),
      record: taskRecord(
        `Review cost and price on ${lines.length} thin-margin ${one(lines.length, "line")}`,
        [
          `Collected by OrderBook AI from costed sale lines in the last ${ctx.window.days} days.`,
          "",
          ...lines.map(
            (line) =>
              `• ${line.name} — ${line.marginPercent.toFixed(1)}% margin on ${money(ctx, line.revenue)}`,
          ),
        ],
        "medium",
      ),
      deliveryNote: TASK_DELIVERY_NOTE,
    };
  },

  "sales-down": (ctx, insight) => {
    const change = Math.abs(ctx.sales.changePercent ?? 0);
    if (change <= 0) return null;
    return {
      id: `rec-${insight.id}`,
      insightId: insight.id,
      kind: "sales",
      title: `Write down why sales fell ${change.toFixed(0)}% on the previous ${ctx.window.days} days`,
      why: `${money(ctx, ctx.sales.revenue)} now versus ${money(ctx, ctx.sales.previousRevenue)} before, over ${ctx.sales.orders} and ${ctx.sales.previousOrders} orders.`,
      href: "/analytics",
      linkLabel: "Open analytics",
      evidence: insight.evidence.slice(0, 3),
      record: taskRecord(
        `Investigate the ${change.toFixed(0)}% sales drop vs the previous ${ctx.window.days} days`,
        [
          "Figures taken from orders in Analytics. Compare both windows before deciding on a promotion.",
          "",
          `• This window: ${money(ctx, ctx.sales.revenue)} over ${ctx.sales.orders} orders`,
          `• Previous window: ${money(ctx, ctx.sales.previousRevenue)} over ${ctx.sales.previousOrders} orders`,
          ctx.sales.topCategory
            ? `• Biggest earner now: ${ctx.sales.topCategory.name} (${money(ctx, ctx.sales.topCategory.revenue)})`
            : "",
        ].filter(Boolean),
        "medium",
      ),
      deliveryNote: TASK_DELIVERY_NOTE,
    };
  },

  "products-slow-movers": (ctx, insight) => {
    const rows = ctx.products.notSelling;
    if (rows.length === 0) return null;
    return {
      id: `rec-${insight.id}`,
      insightId: insight.id,
      kind: "inventory",
      title: `Decide what to do with ${rows.length} ${one(rows.length, "line")} that sold nothing in ${ctx.window.days} days`,
      why: "Stock that does not move is cash on the shelf; each line needs a keep, discount or return decision.",
      href: "/manager/products/intelligence",
      linkLabel: "Open product insights",
      evidence: insight.evidence.slice(0, 4),
      record: taskRecord(
        `Review ${rows.length} slow-moving ${one(rows.length, "line")}`,
        [
          `Active products holding stock with no sale line in the last ${ctx.window.days} days.`,
          "",
          ...rows.map((row) => `• ${row.name} — ${row.stock} in stock, no sales`),
        ],
        "low",
      ),
      deliveryNote: TASK_DELIVERY_NOTE,
    };
  },

  "tasks-overdue": (ctx, insight) => {
    const rows = ctx.tasks.rows.filter((row) => row.overdue);
    if (rows.length === 0) return null;
    return {
      id: `rec-${insight.id}`,
      insightId: insight.id,
      kind: "tasks",
      title: `Clear ${rows.length} overdue ${one(rows.length, "task")} before adding new work`,
      why: `${rows.length} of ${ctx.tasks.open} open ${one(ctx.tasks.open, "task")} are already past their due date.`,
      href: "/manager/productivity/tasks",
      linkLabel: "Open tasks",
      evidence: insight.evidence.slice(0, 4),
      record: taskRecord(
        `Work through ${rows.length} overdue ${one(rows.length, "task")}`,
        [
          "Already overdue in Tasks & to-dos.",
          "",
          ...rows.map(
            (row) =>
              `• ${row.title}${row.dueAt ? ` (due ${row.dueAt.slice(0, 10)})` : ""}`,
          ),
        ],
        "high",
      ),
      deliveryNote: TASK_DELIVERY_NOTE,
    };
  },

  "appointments-today": (ctx, insight) =>
    appointmentRecommendation(ctx, insight, "today"),

  "appointments-next-24h": (ctx, insight) =>
    appointmentRecommendation(ctx, insight, "next 24 hours"),

  "procurement-late-pos": (ctx, insight) => {
    const rows = ctx.purchaseOrders.open.filter((po) => po.late);
    if (rows.length === 0) return null;
    return {
      id: `rec-${insight.id}`,
      insightId: insight.id,
      kind: "procurement",
      title: `Chase ${rows.length} late ${one(rows.length, "purchase order")} with the supplier`,
      why: "Stock that is not received cannot be sold, and the expected date has passed.",
      href: "/manager/products/procurement",
      linkLabel: "Open procurement",
      evidence: insight.evidence.slice(0, 4),
      record: taskRecord(
        `Chase ${rows.length} late ${one(rows.length, "purchase order")}`,
        [
          "Purchase orders whose expected date has passed. Call the supplier yourself — nothing has been sent.",
          "",
          ...rows.map(
            (po) => `• ${po.poNumber} from ${po.supplierName} — expected ${po.expectedOn}`,
          ),
        ],
        "high",
      ),
      deliveryNote: TASK_DELIVERY_NOTE,
    };
  },

  "cash-open-session": (ctx, insight) => ({
    id: `rec-${insight.id}`,
    insightId: insight.id,
    kind: "cash",
    title: `Close today's cash session (${money(ctx, ctx.cash.netToday)} net)`,
    why: `An open drawer leaves the day unreconciled: ${money(ctx, ctx.cash.todayIn)} in, ${money(ctx, ctx.cash.todayOut)} out.`,
    href: "/manager/finance/cash",
    linkLabel: "Open cash & reconciliation",
    evidence: insight.evidence.slice(0, 3),
    record: taskRecord(
      `Close the cash session for ${ctx.today}`,
      [
        "The counted balance has to be entered by whoever is on the till.",
        "",
        `• Cash in: ${money(ctx, ctx.cash.todayIn)}`,
        `• Cash out: ${money(ctx, ctx.cash.todayOut)}`,
      ],
      "medium",
    ),
    deliveryNote: TASK_DELIVERY_NOTE,
  }),

  "staffing-no-availability": (ctx, insight) => ({
    id: `rec-${insight.id}`,
    insightId: insight.id,
    kind: "staffing",
    title: "Set availability for the team before assigning more work",
    why: `Every active staff member is busy or off duty, so a new task has no one to go to.`,
    href: "/manager/staff/directory",
    linkLabel: "Open staff directory",
    evidence: insight.evidence.slice(0, 3),
    record: taskRecord(
      "Update staff availability (0 available right now)",
      [
        `${ctx.staff.active} active: ${ctx.staff.busy} busy, ${ctx.staff.off} off duty.`,
      ],
      "medium",
    ),
    deliveryNote: TASK_DELIVERY_NOTE,
  }),
};

export function buildRecommendations(
  ctx: BusinessContext,
  insights: AiInsight[],
): AiRecommendation[] {
  const recommendations: AiRecommendation[] = [];
  for (const insight of insights) {
    const builder = builders[insight.id];
    if (!builder) continue;
    const rec = builder(ctx, insight);
    if (rec) recommendations.push(rec);
    if (recommendations.length >= MAX_RECOMMENDATIONS) break;
  }
  return recommendations;
}

/**
 * Turns a recommendation into the record the accept button will create.
 * The owner sees `whatWillHappen` before anything is written.
 */
export function toProposal(
  rec: AiRecommendation,
  now: Date = new Date(),
): AiActionProposal {
  const record = rec.record;
  return {
    id: rec.id,
    ruleId: null,
    ruleName: null,
    title: rec.title,
    whatWillHappen:
      record.kind === "task"
        ? `Adds one task to Tasks & to-dos — "${record.title}", ${record.priority} priority — with the ${rec.evidence.length} checked ${rec.evidence.length === 1 ? "row" : "rows"} above written into its description.`
        : `Adds one note to Notes — "${record.title}".`,
    record,
    evidence: rec.evidence,
    actionHref: rec.href,
    actionLabel: rec.linkLabel,
    status: "draft",
    createdAt: now.toISOString(),
    deliveryNote: rec.deliveryNote,
  };
}
