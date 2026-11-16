/**
 * Grounded question answering.
 *
 * The assistant is a lookup, not a generator. Intent detection is keyword
 * scoring over a fixed list; the answer is then composed from
 * `BusinessContext` numbers only. If no intent matches it says so and lists the
 * questions it can answer, because inventing a plausible sentence is the one
 * failure mode this area cannot afford.
 *
 * Model augmentation (none in this build — see `provider.ts`) would be applied
 * by the caller on top of the returned answer, never instead of the grounding.
 */

import { formatMoney } from "@/lib/format";
import type { BusinessContext } from "./context";
import type { AssistantAnswer, AssistantGrounding } from "./types";

export type AssistantIntentId =
  | "sales"
  | "bestSellers"
  | "margin"
  | "receivables"
  | "quotes"
  | "lowStock"
  | "tasksDue"
  | "appointmentsToday"
  | "staffOnShift"
  | "expensesThisMonth";

type Intent = {
  id: AssistantIntentId;
  label: string;
  /** Lowercase substring matches. Earlier intents win a tie. */
  keywords: string[];
  prompt: string;
};

export const ASSISTANT_INTENTS: Intent[] = [
  {
    id: "bestSellers",
    label: "Best sellers",
    keywords: [
      "best seller",
      "bestseller",
      "top product",
      "top selling",
      "most sold",
      "what sells",
      "popular",
    ],
    prompt: "What are my best sellers?",
  },
  {
    id: "appointmentsToday",
    label: "Appointments today",
    keywords: [
      "appointment",
      "booking",
      "bookings",
      "booked",
      "calendar today",
      "who is coming",
      "coming in",
      "schedule for today",
    ],
    prompt: "Who is booked in today?",
  },
  {
    id: "staffOnShift",
    label: "Staff on shift",
    keywords: [
      "staff",
      "on shift",
      "onduty",
      "on duty",
      "roster",
      "who is working",
      "team available",
      "available now",
    ],
    prompt: "Who is on shift right now?",
  },
  {
    id: "lowStock",
    label: "Low stock",
    keywords: [
      "low stock",
      "out of stock",
      "stock out",
      "sold out",
      "reorder",
      "inventory",
      "running out",
      "running low",
      "low on stock",
      "in stock",
    ],
    prompt: "What is running low on stock?",
  },
  {
    id: "receivables",
    label: "Outstanding money",
    keywords: [
      "outstanding",
      "receivable",
      "receivables",
      "owed",
      "owes",
      "unpaid",
      "who hasn't paid",
      "has not paid",
      "due to me",
      "money in",
      "collect",
      "payment due",
      "chase",
    ],
    prompt: "Who owes me money right now?",
  },
  {
    id: "quotes",
    label: "Open quotations",
    keywords: [
      "quote",
      "quotes",
      "quotation",
      "quotations",
      "estimate",
      "proposed order",
      "awaiting approval",
    ],
    prompt: "Which quotations are still waiting for a reply?",
  },
  {
    id: "expensesThisMonth",
    label: "Expenses this month",
    keywords: [
      "expense",
      "expenses",
      "spend",
      "spent",
      "outgoing",
      "outgoings",
      "purchases this month",
    ],
    prompt: "What have I spent this month?",
  },
  {
    id: "margin",
    label: "Margin",
    keywords: ["margin", "profit", "cogs", "cost price", "gross margin"],
    prompt: "What is my margin this month?",
  },
  {
    id: "tasksDue",
    label: "Tasks due",
    keywords: [
      "task",
      "tasks",
      "to-do",
      "todo",
      "overdue",
      "due today",
      "pending work",
      "what is left to do",
      "outstanding tasks",
    ],
    prompt: "What is overdue on my task list?",
  },
  {
    id: "sales",
    label: "Sales trend",
    keywords: [
      "sales",
      "revenue",
      "turnover",
      "takings",
      "income",
      "earned",
      "how much did i sell",
      "aov",
      "average order",
    ],
    prompt: "How are sales doing this month?",
  },
];

/** Ordered chips shown above the input; every one is answerable. */
export const ASSISTANT_PROMPTS: string[] = ASSISTANT_INTENTS.map(
  (intent) => intent.prompt,
);

export const QUESTION_LIMIT = 300;

function normalize(question: string): string {
  return ` ${question.toLowerCase().replace(/['’]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

export function detectIntent(question: string): Intent | null {
  const text = normalize(question);
  let best: { intent: Intent; hits: number } | null = null;
  for (const intent of ASSISTANT_INTENTS) {
    const hits = intent.keywords.filter((keyword) => text.includes(keyword));
    if (hits.length === 0) continue;
    if (!best || hits.length > best.hits) best = { intent, hits: hits.length };
  }
  return best?.intent ?? null;
}

type Answer = {
  text: string;
  grounding: AssistantGrounding[];
  intent: AssistantIntentId;
};

function money(ctx: BusinessContext, amount: number): string {
  return formatMoney(amount, ctx.brand.currencyCode);
}

function windowLabel(ctx: BusinessContext): string {
  return `the last ${ctx.window.days} days (${ctx.window.from} to ${ctx.window.to})`;
}

const answerers: Record<AssistantIntentId, (ctx: BusinessContext) => Answer> = {
  sales: (ctx) => {
    const change = ctx.sales.changePercent;
    return {
      intent: "sales",
      text:
        ctx.sales.orders === 0
          ? `No completed or confirmed sales were recorded in ${windowLabel(ctx)}. Nothing to compare against, so I will not guess at a trend.`
          : `Sales in ${windowLabel(ctx)} are ${money(ctx, ctx.sales.revenue)} across ${ctx.sales.orders} ${ctx.sales.orders === 1 ? "order" : "orders"}, an average of ${money(ctx, ctx.sales.averageOrderValue)} each${
              change === null
                ? ". There were no sales in the previous window, so there is no comparable trend figure."
                : ` — ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)}% on the ${money(ctx, ctx.sales.previousRevenue)} in the ${ctx.window.days} days before that.`
            }`,
      grounding: [
        {
          label: "Orders in window",
          value: `${ctx.sales.orders} · ${money(ctx, ctx.sales.revenue)}`,
          href: "/orders",
        },
        {
          label: "Average order value",
          value: money(ctx, ctx.sales.averageOrderValue),
          href: "/analytics",
        },
        ...(ctx.sales.topCategory
          ? [
              {
                label: `Top category (${ctx.sales.topCategory.name})`,
                value: money(ctx, ctx.sales.topCategory.revenue),
                href: "/analytics?tab=mix",
              },
            ]
          : []),
      ],
    };
  },

  bestSellers: (ctx) => {
    const rows = ctx.products.bestSellers;
    return {
      intent: "bestSellers",
      text:
        rows.length === 0
          ? `No sale lines were recorded in ${windowLabel(ctx)}, so there are no best sellers to rank.`
          : `Top ${rows.length} ${rows.length === 1 ? "product" : "products"} by revenue in ${windowLabel(ctx)}: ${rows
              .map((row, index) => `${index + 1}. ${row.name} (${row.qty} sold, ${money(ctx, row.revenue)})`)
              .join("; ")}.`,
      grounding: rows.map((row) => ({
        label: row.name,
        value: `${row.qty} sold · ${money(ctx, row.revenue)}`,
        href: "/analytics?tab=products",
      })),
    };
  },

  margin: (ctx) => ({
    intent: "margin",
    text:
      ctx.margin.revenue <= 0
        ? `Margin needs costed sale lines and there are none in ${windowLabel(ctx)}, so I have no margin to report.`
        : `Blended margin in ${windowLabel(ctx)} is ${ctx.margin.marginPercent.toFixed(1)}%: ${money(ctx, ctx.margin.revenue)} of costed revenue against ${money(ctx, ctx.margin.cost)} of stock cost, leaving ${money(ctx, ctx.margin.margin)}${
            ctx.margin.thinLines.length > 0
              ? `. Thinnest: ${ctx.margin.thinLines
                  .slice(0, 3)
                  .map((line) => `${line.name} at ${line.marginPercent.toFixed(1)}%`)
                  .join(", ")}.`
              : ". No costed line fell below 25%."
          }`,
    grounding: [
      { label: "Costed revenue", value: money(ctx, ctx.margin.revenue), href: "/analytics?tab=margin" },
      { label: "Cost of goods", value: money(ctx, ctx.margin.cost), href: "/analytics?tab=margin" },
      ...ctx.margin.thinLines.slice(0, 3).map((line) => ({
        label: line.name,
        value: `${line.marginPercent.toFixed(1)}% margin`,
        href: "/analytics?tab=margin",
      })),
    ],
  }),

  receivables: (ctx) => {
    const rows = ctx.receivables.rows;
    return {
      intent: "receivables",
      text:
        rows.length === 0
          ? "Nothing is unpaid right now — every order has been settled in full."
          : `${money(ctx, ctx.receivables.total)} is unpaid across ${rows.length} ${rows.length === 1 ? "invoice" : "invoices"}${
              ctx.receivables.agedCount > 0
                ? `, of which ${money(ctx, ctx.receivables.agedTotal)} on ${ctx.receivables.agedCount} ${ctx.receivables.agedCount === 1 ? "has" : "have"} been outstanding ${ctx.receivables.overdueAfterDays}+ days`
                : ", none of it past the chase threshold yet"
            }. Invoices carry no due date in OrderBook, so all ages count from the issue date.` +
          (rows.length > 0
            ? ` Longest waiting: ${rows[0].label}${rows[0].sublabel ? ` (${rows[0].sublabel})` : ""}, ${rows[0].days} days.`
            : ""),
      grounding: rows.slice(0, 6).map((row) => ({
        label: `${row.label}${row.sublabel ? ` · ${row.sublabel}` : ""}`,
        value: `${money(ctx, row.amount)} unpaid · ${row.days} days`,
        href: row.href,
      })),
    };
  },

  quotes: (ctx) => {
    const rows = ctx.quotes.rows;
    return {
      intent: "quotes",
      text:
        rows.length === 0
          ? "No quotation is waiting on a customer right now."
          : `${ctx.quotes.openCount} ${ctx.quotes.openCount === 1 ? "quotation" : "quotations"} worth ${money(ctx, ctx.quotes.openValue)} are still unaccepted${
              ctx.quotes.staleCount > 0
                ? `; ${ctx.quotes.staleCount} ${ctx.quotes.staleCount === 1 ? "has" : "have"} had no reply for ${ctx.quotes.staleAfterDays}+ days (${money(ctx, ctx.quotes.staleValue)})`
                : ", none of them silent for long"
            }. Oldest: ${rows[0].label}${rows[0].sublabel ? ` (${rows[0].sublabel})` : ""}, ${rows[0].days} days.`,
      grounding: rows.slice(0, 6).map((row) => ({
        label: `${row.label}${row.sublabel ? ` · ${row.sublabel}` : ""}`,
        value: `${money(ctx, row.amount)} · ${row.days} days old`,
        href: row.href,
      })),
    };
  },

  lowStock: (ctx) => {
    const out = ctx.inventory.outOfStock;
    const low = ctx.inventory.lowStock;
    const named = [...out, ...low]
      .slice(0, 4)
      .map((row) => `${row.name} (${row.stock} left)`)
      .join(", ");
    return {
      intent: "lowStock",
      text:
        ctx.inventory.tracked === 0
          ? "No active product has a low-stock threshold set, so there is nothing to run low. Add thresholds in Catalog to enable this answer and the reorder automation."
          : out.length + low.length === 0
            ? `Nothing is below its reorder level — ${ctx.inventory.tracked} ${ctx.inventory.tracked === 1 ? "product" : "products"} track stock and all of them are above threshold.`
            : `${out.length} ${out.length === 1 ? "item is" : "items are"} sold out and ${low.length} ${low.length === 1 ? "is" : "are"} at or below the reorder level. Lowest: ${named}${
                out.length + low.length > 4 ? ", plus the rest in Inventory" : ""
              }. Suggested quantities refill each product to twice its own threshold.`,
      grounding: [...out, ...low].slice(0, 6).map((row) => ({
        label: row.name,
        value: `${row.stock} left · threshold ${row.threshold} · order ${row.suggestedReorderQty}`,
        href: "/manager/products/inventory",
      })),
    };
  },

  tasksDue: (ctx) => {
    const overdue = ctx.tasks.rows.filter((row) => row.overdue);
    return {
      intent: "tasksDue",
      text:
        ctx.tasks.open === 0
          ? "Your task list is clear — nothing open, nothing overdue."
          : `${ctx.tasks.overdue} of ${ctx.tasks.open} open ${ctx.tasks.open === 1 ? "task is" : "tasks are"} past their due date${ctx.tasks.dueToday > 0 ? `, and ${ctx.tasks.dueToday} ${ctx.tasks.dueToday === 1 ? "one is" : "are"} due today` : ""}.${
              overdue.length > 0
                ? ` Oldest: ${overdue.map((row) => row.title).slice(0, 3).join("; ")}.`
                : ctx.tasks.rows.length > 0
                  ? ` Nothing is late; up next: ${ctx.tasks.rows
                      .slice(0, 3)
                      .map((row) => row.title)
                      .join("; ")}.`
                  : ""
            }`,
      grounding: ctx.tasks.rows.slice(0, 6).map((row) => ({
        label: row.title,
        value: row.dueAt
          ? `${row.overdue ? "overdue since" : "due"} ${row.dueAt.slice(0, 10)}`
          : "no due date",
        href: "/manager/productivity/tasks",
      })),
    };
  },

  appointmentsToday: (ctx) => {
    const rows = ctx.appointments.today;
    const next = ctx.appointments.nextTwentyFourHours;
    return {
      intent: "appointmentsToday",
      text:
        rows.length === 0
          ? next.length === 0
            ? `Nothing is booked for ${ctx.today}, and nothing in the following 24 hours either.`
            : `Nothing is booked for ${ctx.today}, but ${next.length} ${next.length === 1 ? "booking" : "bookings"} land in the next 24 hours.`
          : `${rows.length} ${rows.length === 1 ? "booking" : "bookings"} today: ${rows
              .map((row) => `${row.title} at ${row.startsAt.slice(11, 16)}${row.customerName ? ` with ${row.customerName}` : ""}`)
              .join("; ")}.`,
      grounding: (rows.length > 0 ? rows : next).slice(0, 6).map((row) => ({
        label: row.title,
        value: `${row.startsAt.slice(0, 16).replace("T", " ")}${row.customerName ? ` · ${row.customerName}` : ""}`,
        href: "/manager/productivity/appointments",
      })),
    };
  },

  staffOnShift: (ctx) => ({
    intent: "staffOnShift",
    text:
      ctx.staff.active === 0
        ? "No staff have been added to this workspace yet, so there is nobody to put on shift."
        : ctx.staff.onShiftNow.length === 0
          ? `Nobody is inside a shift right now. ${ctx.staff.scheduledToday} ${ctx.staff.scheduledToday === 1 ? "person is" : "people are"} rostered today; of ${ctx.staff.active} active staff, ${ctx.staff.available} are marked available.`
          : `${ctx.staff.onShiftNow.length} on shift now: ${ctx.staff.onShiftNow.map((row) => `${row.name} (${row.shift})`).join(", ")}. Another ${ctx.staff.available} are marked available.`,
    grounding: [
      ...ctx.staff.onShiftNow.slice(0, 5).map((row) => ({
        label: row.name,
        value: `on shift ${row.shift}`,
        href: "/manager/staff/schedules",
      })),
      {
        label: "Marked available",
        value: `${ctx.staff.available} of ${ctx.staff.active} active`,
        href: "/manager/staff/directory",
      },
    ],
  }),

  expensesThisMonth: (ctx) => ({
    intent: "expensesThisMonth",
    text:
      ctx.expenses.thisMonthCount === 0
        ? `No expenses have been recorded for ${ctx.today.slice(0, 7)}. Add them in Expenses and this answer fills in.`
        : `${money(ctx, ctx.expenses.thisMonth)} logged in ${ctx.expenses.thisMonthCount} ${ctx.expenses.thisMonthCount === 1 ? "expense" : "expenses"} this month${
            ctx.expenses.changePercent === null
              ? ""
              : `, ${ctx.expenses.changePercent >= 0 ? "up" : "down"} ${Math.abs(ctx.expenses.changePercent).toFixed(0)}% on last month's ${money(ctx, ctx.expenses.previousMonth)}`
          }. Largest: ${ctx.expenses.top.map((row) => `${row.title} (${money(ctx, row.amount)})`).join(", ")}.`,
    grounding: ctx.expenses.top.slice(0, 6).map((row) => ({
      label: `${row.title} · ${row.category.replace(/_/g, " ")}`,
      value: money(ctx, row.amount),
      href: "/manager/finance/expenses",
    })),
  }),
};

function unsupported(question: string, engineLabel: string): Pick<AssistantAnswer, "text" | "intent"> {
  return {
    intent: null,
    text: `I could not match "${question.trim().slice(0, 80)}" to anything in your own records, and I will not guess. Answers come from this workspace only (${engineLabel}), so ask about: ${ASSISTANT_INTENTS.map((intent) => intent.label.toLowerCase()).join(", ")}.`,
  };
}

export function answerQuestion(
  ctx: BusinessContext,
  question: string,
  options: { engineLabel: string },
): AssistantAnswer {
  const trimmed = question.trim().slice(0, QUESTION_LIMIT);
  const intent = trimmed ? detectIntent(trimmed) : null;
  const base = intent
    ? answerers[intent.id](ctx)
    : {
        ...unsupported(trimmed, options.engineLabel),
        grounding: [] as AssistantGrounding[],
      };

  return {
    question: trimmed,
    text: base.text,
    grounding: base.grounding,
    suggestions: ASSISTANT_PROMPTS.filter(
      (prompt) => intent && prompt !== intent.prompt,
    ).slice(0, 4),
    source: "engine",
    engineLabel: options.engineLabel,
    intent: base.intent,
  };
}
