/**
 * AI Insights — merchant-facing briefs written in plain English.
 *
 * Two rules hold here, and both exist so the Python backend has something
 * clean to replace:
 *
 * 1. **No cookies, no CSV reads.** This module only takes rows the caller has
 *    already loaded, exactly like `src/lib/inventory/stock.ts`. The same
 *    `AiInsightData` object can be POSTed to a backend as JSON without any of
 *    the reading logic moving with it.
 * 2. **Every number is computed, never estimated.** A model, when it arrives,
 *    rewrites the *sentences* — not the arithmetic. A merchant can diff a
 *    generated brief against this one and see whether the phrasing got sharper
 *    or the figures drifted. That is the same bargain the CRM struck with the
 *    deterministic review lexicon.
 */

import {
  BUSINESS_TIME_ZONE,
  addCalendarDays,
  calendarDateInZone,
  orderInCalendarRange,
} from "@/lib/analytics/date-range";
import { reviewInboxSummary, unansweredReviews } from "@/lib/crm/reviews";
import { formatMoney, pluralize } from "@/lib/format";
import type { InventoryPosition, UsageRow } from "@/lib/inventory/stock";
import { isRevenueOrder } from "@/lib/orders/order-rules";
import type { CustomerReview } from "@/types/crm";
import type {
  Customer,
  Order,
  OrderItem,
  Payment,
  Product,
} from "@/types/database";

export type AiInsightKind =
  | "today_report"
  | "week_summary"
  | "month_summary"
  | "suggestions"
  | "reviews_summary"
  | "key_points"
  | "top_sellers"
  | "slow_movers"
  | "week_change"
  | "win_back"
  | "margin_watch"
  | "stock_risk"
  | "bundle_ideas"
  | "peak_hours";

/** One control on the panel. */
export type AiInsightPrompt = {
  kind: AiInsightKind;
  label: string;
  /** Second line under the control — what the brief actually answers. */
  blurb: string;
  /** `summary` cards sit in the 2×2 grid at the top; `brief` buttons sit below. */
  group: "summary" | "brief";
  /** Example phrasing for the free-text box. */
  example: string;
};

export const AI_INSIGHT_PROMPTS: AiInsightPrompt[] = [
  {
    kind: "today_report",
    label: "Today",
    blurb: "How the day has gone so far, bill by bill",
    group: "summary",
    example: "How is today going?",
  },
  {
    kind: "week_summary",
    label: "Last week",
    blurb: "What happened in the last seven days",
    group: "summary",
    example: "Give me a summary of this week",
  },
  {
    kind: "month_summary",
    label: "Last month",
    blurb: "The whole of last month, read against the month before it",
    group: "summary",
    example: "Summarise last month",
  },
  {
    kind: "suggestions",
    label: "Suggestions",
    blurb: "What to do next, lifted from every other brief on this page",
    group: "summary",
    example: "What should I do next?",
  },
  {
    kind: "reviews_summary",
    label: "Reviews summary",
    blurb: "Ratings, themes and what is still unanswered",
    group: "brief",
    example: "What are customers saying in reviews?",
  },
  {
    kind: "key_points",
    label: "Key points",
    blurb: "One line per area — money, menu, margin, people, shelf, reputation",
    group: "brief",
    example: "What are the key points I should act on?",
  },
  {
    kind: "top_sellers",
    label: "Most sold items",
    blurb: "What the counter actually moved",
    group: "brief",
    example: "What are the most sold items?",
  },
  {
    kind: "slow_movers",
    label: "Slow movers",
    blurb: "Catalog lines nobody is buying",
    group: "brief",
    example: "What is not selling?",
  },
  {
    kind: "week_change",
    label: "Week vs week",
    blurb: "What changed against the week before",
    group: "brief",
    example: "Is business up or down this week?",
  },
  {
    kind: "win_back",
    label: "Win-back list",
    blurb: "Good customers who have gone quiet",
    group: "brief",
    example: "Which customers have stopped coming?",
  },
  {
    kind: "margin_watch",
    label: "Margin leaks",
    blurb: "Where discounts and cost eat the sale",
    group: "brief",
    example: "Where am I losing margin?",
  },
  {
    kind: "stock_risk",
    label: "Stock-out risk",
    blurb: "What the shelf is closest to running out of",
    group: "brief",
    example: "What will we run out of?",
  },
  {
    kind: "bundle_ideas",
    label: "Bundle ideas",
    blurb: "Items that keep selling together",
    group: "brief",
    example: "What could I bundle?",
  },
  {
    kind: "peak_hours",
    label: "Peak hours",
    blurb: "When the day is busy and when it is not",
    group: "brief",
    example: "When are my busiest hours?",
  },
];

/**
 * The four cards that are already written when the tab opens. The page calls
 * `prewriteSummaries` on the server so a merchant reads an answer first and
 * decides whether the full brief is worth opening — no spinner on a question
 * this workspace can already answer from the rows in memory.
 */
export const PREWRITTEN_SUMMARIES = [
  "today_report",
  "week_summary",
  "month_summary",
  "suggestions",
] as const;

export type PrewrittenSummary = (typeof PREWRITTEN_SUMMARIES)[number];

export function prewriteSummaries(
  data: AiInsightData,
): Record<PrewrittenSummary, InsightResult> {
  return Object.fromEntries(
    PREWRITTEN_SUMMARIES.map((kind) => [kind, generateInsight(kind, data)]),
  ) as Record<PrewrittenSummary, InsightResult>;
}

/** The rows a brief is written from — plain JSON, safe to send anywhere. */
export type AiInsightData = {
  brandName: string;
  currencyCode: string;
  /** Business-timezone calendar day (`YYYY-MM-DD`) the workspace calls today. */
  today: string;
  orders: Order[];
  items: OrderItem[];
  products: Product[];
  payments: Payment[];
  customers: Customer[];
  /** CRM review records on file — the same rows the Reviews inbox renders. */
  reviews: CustomerReview[];
  /** Shelf positions after every recorded movement. Empty with no stock model. */
  positions: InventoryPosition[];
  /** Consumption derived from bills, measured over `usageWindowDays`. */
  usage: UsageRow[];
  usageWindowDays: number;
};

export type InsightMetric = { label: string; value: string };

export type InsightResult = {
  kind: AiInsightKind;
  title: string;
  /** Which window the brief reads; rendered as a chip beside the title. */
  window: string;
  /** The one line a merchant reads first. */
  headline: string;
  metrics: InsightMetric[];
  findings: string[];
  actions: string[];
  /** Set when the rows on file cannot support the ask. */
  caveat?: string;
};

/* ------------------------------------------------------------------ helpers */

const DAY_MS = 86_400_000;

function isCreditNote(order: Order): boolean {
  return order.order_kind === "credit_note";
}

function money(value: number, currencyCode: string): string {
  return formatMoney(round(value, 2), currencyCode);
}

function round(value: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round((value + Number.EPSILON) * f) / f;
}

function intText(value: number): string {
  return new Intl.NumberFormat("en-IN").format(Math.round(value));
}

/** Verb agreement for a counted subject: "1 customer has", "4 customers have". */
function hasHave(count: number): string {
  return count === 1 ? "has" : "have";
}

function isAre(count: number): string {
  return count === 1 ? "is" : "are";
}

/** `1 customer` / `4 customers`, so a count never reads as "1 customers". */
function counted(count: number, singular: string, pluralForm?: string): string {
  return `${intText(count)} ${pluralize(count, singular, pluralForm)}`;
}

/** How a merchant says a change, not a chart axis label. */
function deltaLabel(current: number, previous: number): string {
  if (previous <= 0) return current > 0 ? "up from nothing" : "flat";
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) return "level";
  return `${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}%`;
}

function signedPct(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.05) return "0%";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;
}

/** `₹1,200 of ₹9,000` style share, guarded against a zero denominator. */
function shareOf(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${((part / whole) * 100).toFixed(0)}%`;
}

/** Same share to one decimal, for the small numbers a rounded 0% would hide. */
function pctOf(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

/** Hour 0–23 in the business zone, never the UTC hour of the stored instant. */
function hourInZone(iso: string): number {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return Number(text) % 24;
}

function hourLabel(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const face = hour % 12 === 0 ? 12 : hour % 12;
  return `${face}${suffix}`;
}

function dayName(calendarDate: string): string {
  const [year, month, day] = calendarDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday];
}

function nameList(names: string[], limit = 3): string {
  if (names.length === 0) return "nothing";
  if (names.length === 1) return names[0];
  const kept = names.slice(0, limit);
  if (kept.length === 1) return kept[0];
  const tail = kept[kept.length - 1];
  const head = kept.slice(0, -1).join(", ");
  if (kept.length >= names.length) return `${head} and ${tail}`;
  return `${head}, ${tail} and ${names.length - kept.length} more`;
}

type SoldLine = {
  productId: string | null;
  name: string;
  category: string | null;
  qty: number;
  revenue: number;
  cost: number;
  discount: number;
};

type Window = {
  from: string;
  to: string;
  days: number;
  label: string;
};

/** Inclusive window of `days` calendar days ending at `today`. */
function windowFor(today: string, days: number, label?: string): Window {
  return {
    from: addCalendarDays(today, -(days - 1)),
    to: today,
    days,
    label: label ?? (days === 1 ? "Today" : `Last ${days} days`),
  };
}

function shiftWindow(range: Window, days: number): Window {
  return {
    ...range,
    from: addCalendarDays(range.from, -days),
    to: addCalendarDays(range.to, -days),
  };
}

/** One real calendar month, so "last month" never means "the last 30 days". */
function calendarMonth(year: number, monthIndex: number): Window {
  const pad = (value: number) => String(value).padStart(2, "0");
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const label = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
  return {
    from: `${year}-${pad(monthIndex + 1)}-01`,
    to: `${year}-${pad(monthIndex + 1)}-${pad(days)}`,
    days,
    label: `${label} ${year}`,
  };
}

/** The last complete month before `today`, plus the one it is measured against. */
function lastTwoMonths(today: string): { current: Window; previous: Window } {
  const [year, month] = today.split("-").map(Number);
  const back = (ago: number) => {
    const start = new Date(Date.UTC(year, month - 1 - ago, 1));
    return calendarMonth(start.getUTCFullYear(), start.getUTCMonth());
  };
  return { current: back(1), previous: back(2) };
}

/** Calendar-day test for rows that are not orders — reviews carry `reviewed_at`. */
function dayInWindow(iso: string, range: Window): boolean {
  const day = calendarDateInZone(new Date(iso));
  return day >= range.from && day <= range.to;
}

/** Whole days between an ISO instant and the business day the workspace calls today. */
function daysSince(iso: string, today: string): number {
  const then = calendarDateInZone(new Date(iso));
  return Math.max(
    0,
    Math.round(
      (new Date(`${today}T00:00:00Z`).getTime() -
        new Date(`${then}T00:00:00Z`).getTime()) /
        DAY_MS,
    ),
  );
}

/**
 * Bills inside a window, credit notes excluded. `posted` narrows to orders that
 * have earned; the day brief also needs the still-open ones, so both exist.
 */
function billsIn(data: AiInsightData, range: Window, posted = false): Order[] {
  return data.orders.filter((order) => {
    if (isCreditNote(order)) return false;
    if (posted && !isRevenueOrder(order)) return false;
    return orderInCalendarRange(order.created_at, range.from, range.to);
  });
}

/** Lines of the posted bills in a window, rolled up one row per product. */
function soldLines(data: AiInsightData, range: Window): SoldLine[] {
  const ids = new Set(billsIn(data, range, true).map((order) => order.id));
  const productById = new Map(data.products.map((product) => [product.id, product]));
  const rolled = new Map<string, SoldLine>();

  for (const item of data.items) {
    if (!ids.has(item.order_id)) continue;
    const key = item.product_id ?? item.product_name_snapshot;
    const product = item.product_id ? productById.get(item.product_id) : undefined;
    const unitCost = product?.cost_price ?? 0;
    const existing = rolled.get(key);
    if (existing) {
      existing.qty += item.quantity;
      existing.revenue += item.line_total;
      existing.cost += unitCost * item.quantity;
      existing.discount += item.line_discount;
    } else {
      rolled.set(key, {
        productId: item.product_id,
        name: item.product_name_snapshot,
        category: product?.category ?? null,
        qty: item.quantity,
        revenue: item.line_total,
        cost: unitCost * item.quantity,
        discount: item.line_discount,
      });
    }
  }

  return Array.from(rolled.values()).map((line) => ({
    ...line,
    qty: round(line.qty, 3),
    revenue: round(line.revenue, 2),
    cost: round(line.cost, 2),
    discount: round(line.discount, 2),
  }));
}

function totals(orders: Order[]) {
  const net = orders.reduce((sum, order) => sum + order.grand_total, 0);
  const paid = orders.reduce((sum, order) => sum + (order.amount_paid ?? 0), 0);
  return {
    net: round(net, 2),
    discount: round(orders.reduce((sum, order) => sum + order.discount_total, 0), 2),
    paid: round(paid, 2),
    due: round(net - paid, 2),
    count: orders.length,
    average: orders.length ? round(net / orders.length, 2) : 0,
  };
}

function topLines(lines: SoldLine[], key: "qty" | "revenue", limit: number): SoldLine[] {
  return [...lines]
    .sort((a, b) => b[key] - a[key] || b.revenue - a.revenue)
    .slice(0, limit);
}

function tenderSplit(payments: Payment[]) {
  const tally = new Map<string, number>();
  for (const payment of payments) {
    tally.set(payment.method, (tally.get(payment.method) ?? 0) + payment.amount);
  }
  return Array.from(tally, ([method, amount]) => ({
    method,
    amount: round(amount, 2),
  })).sort((a, b) => b.amount - a.amount);
}

/* -------------------------------------------------------------- generators */

function todayReport(data: AiInsightData): InsightResult {
  const range = windowFor(data.today, 1);
  const dayBills = billsIn(data, range);
  const posted = dayBills.filter(isRevenueOrder);
  const open = dayBills.filter(
    (order) => order.status === "pending" || order.status === "confirmed",
  );
  const sums = totals(posted);
  const lines = soldLines(data, range);
  const leaders = topLines(lines, "qty", 3);
  const units = lines.reduce((sum, line) => sum + line.qty, 0);
  const postedIds = new Set(posted.map((order) => order.id));
  const tenders = tenderSplit(
    data.payments.filter((payment) => postedIds.has(payment.order_id)),
  );
  const yesterday = totals(billsIn(data, shiftWindow(range, 1), true));

  if (dayBills.length === 0) {
    return {
      kind: "today_report",
      title: "Today's report",
      window: range.label,
      headline: `Nothing has been booked at ${data.brandName} yet today.`,
      metrics: [],
      findings: [
        "There is no bill under today's date, so there is no day to summarise yet.",
        `Yesterday closed with ${yesterday.count} ${pluralize(yesterday.count, "bill")} at ${money(yesterday.net, data.currencyCode)}.`,
      ],
      actions: [
        "Book a bill on the POS and re-run this — the brief reads the day the counter actually posted.",
      ],
      caveat: "An empty day is a real state, not an error, so the brief says so instead of inventing one.",
    };
  }

  const findings = [
    `${counted(dayBills.length, "bill")} so far — ${posted.length} closed, ${open.length} still open.`,
    posted.length
      ? `Closed sales are ${money(sums.net, data.currencyCode)}, averaging ${money(sums.average, data.currencyCode)} a bill, ${deltaLabel(sums.net, yesterday.net)} on yesterday.`
      : yesterday.count
        ? `Nothing has closed yet, so there is no day total to compare — yesterday closed at ${money(yesterday.net, data.currencyCode)}.`
        : `Nothing has closed yet today, and neither did yesterday, so there is no day total to compare. Both days may simply be outside the seeded history.`,
  ];
  if (leaders.length) {
    findings.push(
      `${nameList(leaders.map((line) => line.name), 3)} carried the day's ${intText(units)} units across ${lines.length} ${pluralize(lines.length, "line")}.`,
    );
  }
  if (tenders.length) {
    findings.push(
      `Money arrived as ${tenders.map((t) => `${t.method} ${money(t.amount, data.currencyCode)}`).join(" / ")}.`,
    );
  }
  if (sums.due > 0) {
    findings.push(
      `${money(sums.due, data.currencyCode)} of the closed bills is still marked unpaid as the day stands.`,
    );
  }

  const actions: string[] = [];
  if (open.length) {
    actions.push(
      `Push the ${pluralize(open.length, "open ticket")} out before close — ${money(totals(open).net, data.currencyCode)} of paper is still sitting there.`,
    );
  }
  if (leaders[0] && leaders[0].qty >= 3) {
    actions.push(
      `Keep ${leaders[0].name} within reach: ${intText(leaders[0].qty)} units today alone.`,
    );
  }
  if (sums.due > 0) {
    actions.push("Settle the unpaid bills or raise a credit note so the day reconciles.");
  }
  if (!actions.length) actions.push("Nothing outstanding — the day is clean.");

  return {
    kind: "today_report",
    title: "Today's report",
    window: range.label,
    headline: posted.length
      ? `${money(sums.net, data.currencyCode)} closed today, ${deltaLabel(sums.net, yesterday.net)} on yesterday.`
      : `Today has ${counted(open.length, "open ticket")} and nothing closed yet.`,
    metrics: [
      { label: "Closed sales", value: money(sums.net, data.currencyCode) },
      { label: "Bills", value: intText(dayBills.length) },
      { label: "Average bill", value: money(sums.average, data.currencyCode) },
      { label: "Open tickets", value: intText(open.length) },
    ],
    findings,
    actions,
  };
}

function topSellers(data: AiInsightData): InsightResult {
  const range = windowFor(data.today, 30);
  const lines = soldLines(data, range);
  const net = totals(billsIn(data, range, true)).net;

  if (!lines.length) {
    return {
      kind: "top_sellers",
      title: "Most sold items",
      window: range.label,
      headline: "No closed bill in this window carries a line item.",
      metrics: [],
      findings: [
        "Top sellers rank the lines of completed bills, and there are none in the last 30 days.",
      ],
      actions: ["Post a bill on the POS — this brief needs lines to rank, not drafts."],
      caveat: "Quotations and cancelled bills are excluded on purpose: neither has sold anything.",
    };
  }

  const leaders = topLines(lines, "qty", 5);
  const earners = topLines(lines, "revenue", 1);
  const units = lines.reduce((sum, line) => sum + line.qty, 0);
  const leaderUnits = leaders.reduce((sum, line) => sum + line.qty, 0);
  const leaderRevenue = leaders.reduce((sum, line) => sum + line.revenue, 0);
  const tail = lines.filter((line) => line.qty <= 2);

  const findings = [
    `${leaders[0].name} is the volume leader — ${intText(leaders[0].qty)} units for ${money(leaders[0].revenue, data.currencyCode)}.`,
    `The top five lines move ${intText(leaderUnits)} of the ${intText(units)} units sold, which is ${shareOf(leaderUnits, units)} of everything the counter rang up.`,
    earners[0].name !== leaders[0].name
      ? `${earners[0].name} earns the most (${money(earners[0].revenue, data.currencyCode)}) without selling the most.`
      : `${earners[0].name} leads on both units and revenue.`,
    `Those five lines are ${money(leaderRevenue, data.currencyCode)} of the ${money(net, data.currencyCode)} closed in the window.`,
  ];
  if (tail.length) {
    findings.push(
      `${counted(tail.length, "line")} sold two units or fewer — ${money(tail.reduce((sum, line) => sum + line.revenue, 0), data.currencyCode)} sitting in the long tail.`,
    );
  }

  return {
    kind: "top_sellers",
    title: "Most sold items",
    window: range.label,
    headline: `${leaders[0].name} led the window at ${intText(leaders[0].qty)} units.`,
    metrics: [
      { label: "Units sold", value: intText(units) },
      { label: "Lines sold", value: intText(lines.length) },
      { label: "Top-5 share", value: shareOf(leaderUnits, units) },
      { label: "Closed sales", value: money(net, data.currencyCode) },
    ],
    findings,
    actions: [
      `Do not let ${leaders[0].name} go off the shelf — it is ${shareOf(leaders[0].revenue, net)} of window revenue on its own.`,
      earners[0].name !== leaders[0].name
        ? `${earners[0].name} is the earner — check its cost price before pushing volume elsewhere.`
        : "Leader and earner are the same line, so one stockout would hit both.",
      tail.length
        ? `Bundle or trim ${counted(tail.length, "long-tail line")} rather than restocking ${tail.length === 1 ? "it" : "them"}.`
        : "Every line is pulling its weight.",
    ],
  };
}

function slowMovers(data: AiInsightData): InsightResult {
  const short = windowFor(data.today, 30);
  const long = windowFor(data.today, 90);
  const soldKey = (line: SoldLine) => line.productId ?? line.name;
  const sold30 = new Set(soldLines(data, short).map(soldKey));
  const sold90 = new Set(soldLines(data, long).map(soldKey));
  const sellable = data.products.filter((product) => product.is_active);
  const cold = sellable.filter((product) => !sold30.has(product.id));
  const dead = cold.filter((product) => !sold90.has(product.id));

  if (!sellable.length) {
    return {
      kind: "slow_movers",
      title: "Slow movers",
      window: short.label,
      headline: "This brand has no active catalog lines to measure.",
      metrics: [],
      findings: ["A catalog with no active rows has nothing to rank against."],
      actions: ["Activate a product or switch brand — this brief needs an active catalog."],
      caveat: "Nothing to report — the catalog has no active rows.",
    };
  }

  const holding = cold.filter((product) => (product.stock_qty ?? 0) > 0);
  const holdingValue = holding.reduce(
    (sum, product) => sum + (product.stock_qty ?? 0) * product.price,
    0,
  );
  const categories = new Map<string, number>();
  for (const product of cold) {
    if (product.category) {
      categories.set(product.category, (categories.get(product.category) ?? 0) + 1);
    }
  }
  const coldCats = Array.from(categories, ([name, count]) => `${name} (${count})`).slice(0, 3);

  const findings = [
    `${counted(cold.length, "line")} of ${sellable.length} active ${pluralize(sellable.length, "line")} sold nothing in 30 days — ${shareOf(cold.length, sellable.length)} of the catalog is carrying no movement.`,
  ];
  if (dead.length) {
    findings.push(
      `${dead.length} ${pluralize(dead.length, "line")} stayed silent across 90 days too: ${nameList(dead.map((product) => product.name), 4)}.`,
    );
  }
  if (holding.length) {
    findings.push(
      `${money(holdingValue, data.currencyCode)} of list price is still parked behind lines that sold nothing — ${intText(holding.reduce((sum, product) => sum + (product.stock_qty ?? 0), 0))} units across ${counted(holding.length, "line")}.`,
    );
  }
  if (coldCats.length) findings.push(`The silence clusters in ${coldCats.join(", ")}.`);

  return {
    kind: "slow_movers",
    title: "Slow movers",
    window: short.label,
    headline: `${cold.length} of ${sellable.length} active lines ${hasHave(cold.length)} sold nothing this month.`,
    metrics: [
      { label: "Active lines", value: intText(sellable.length) },
      { label: "Cold 30d", value: intText(cold.length) },
      { label: "Cold 90d", value: intText(dead.length) },
      { label: "Holding stock", value: intText(holding.length) },
    ],
    findings,
    actions: [
      dead.length
        ? `Mark ${nameList(dead.map((product) => product.name), 2)} unavailable instead of showing a cashier a dead row.`
        : "No line is cold long enough to cut — 90 days says these still move.",
      holding.length
        ? "Pair the cold lines with a top seller rather than discounting them alone."
        : "No stock is parked behind the cold lines.",
      "Re-read this brief after a week of POS activity before deleting anything.",
    ],
  };
}

function weekChange(data: AiInsightData): InsightResult {
  const current = windowFor(data.today, 7);
  const previous = shiftWindow(current, 7);
  const now = totals(billsIn(data, current, true));
  const then = totals(billsIn(data, previous, true));

  const swings = new Map<string, { now: number; then: number }>();
  const track = (name: string, key: "now" | "then", value: number) => {
    const entry = swings.get(name) ?? { now: 0, then: 0 };
    entry[key] += value;
    swings.set(name, entry);
  };
  for (const line of soldLines(data, current)) track(line.name, "now", line.revenue);
  for (const line of soldLines(data, previous)) track(line.name, "then", line.revenue);
  const ranked = Array.from(swings, ([name, entry]) => ({
    name,
    swing: round(entry.now - entry.then, 2),
  })).sort((a, b) => b.swing - a.swing);
  const gain = ranked[0];
  const loss = ranked[ranked.length - 1];

  const byDay = new Map<string, number>();
  for (const order of billsIn(data, current, true)) {
    const day = calendarDateInZone(new Date(order.created_at));
    byDay.set(day, (byDay.get(day) ?? 0) + order.grand_total);
  }
  const bestDay = Array.from(byDay, ([date, value]) => ({ date, value })).sort(
    (a, b) => b.value - a.value,
  )[0];

  const findings = [
    `Sales moved ${money(now.net, data.currencyCode)} against ${money(then.net, data.currencyCode)} the week before — ${deltaLabel(now.net, then.net)}.`,
    `Bill count went ${then.count} to ${now.count} (${deltaLabel(now.count, then.count)}), so the average bill ${now.average >= then.average ? "held up" : "thinned"} at ${money(now.average, data.currencyCode)} against ${money(then.average, data.currencyCode)}.`,
  ];
  if (bestDay) {
    findings.push(
      `${dayName(bestDay.date)} was the strongest trading day at ${money(bestDay.value, data.currencyCode)}; only ${byDay.size} of the seven days booked anything.`,
    );
  }
  if (gain && gain.swing > 0) {
    findings.push(`${gain.name} gained ${money(gain.swing, data.currencyCode)} week on week.`);
  }
  if (loss && loss.swing < 0) {
    findings.push(
      `${loss.name} gave back ${money(Math.abs(loss.swing), data.currencyCode)} — the biggest single swing in the window.`,
    );
  }
  if (now.discount > 0 || then.discount > 0) {
    findings.push(
      `Discounting was ${money(now.discount, data.currencyCode)} this week against ${money(then.discount, data.currencyCode)} last week.`,
    );
  }

  const change = then.net > 0 ? ((now.net - then.net) / then.net) * 100 : 0;
  const actions = [
    now.count < then.count
      ? "Traffic, not basket size, is the gap — a weekday push is worth more than a price change."
      : "Baskets are holding; look at the days that booked nothing before touching prices.",
    gain && gain.swing > 0 ? `Give ${gain.name} the front position while the climb lasts.` : "No line improved week on week.",
    loss && loss.swing < 0 ? `Check whether ${loss.name} is out of stock or just out of sight.` : "",
  ].filter(Boolean);

  return {
    kind: "week_change",
    title: "Week vs week",
    window: current.label,
    headline: `${deltaLabel(now.net, then.net)} on the previous week — ${money(now.net, data.currencyCode)} against ${money(then.net, data.currencyCode)}.`,
    metrics: [
      { label: "Revenue", value: money(now.net, data.currencyCode) },
      { label: "Change", value: signedPct(change) },
      { label: "Bills", value: `${now.count} vs ${then.count}` },
      { label: "Average bill", value: money(now.average, data.currencyCode) },
    ],
    findings,
    actions,
  };
}

type CustomerRecord = {
  customer: Customer;
  bills: number;
  lifetime: number;
  lastDay: string;
  quietDays: number;
  favourite: string | null;
};

/**
 * Per-customer history rebuilt from Billing rows rather than read from a CRM
 * counter, so a brief and a receivable can never disagree about who bought what.
 */
function customerRecords(data: AiInsightData): CustomerRecord[] {
  const known = new Map(data.customers.map((customer) => [customer.id, customer]));
  const linesByOrder = new Map<string, OrderItem[]>();
  for (const item of data.items) {
    const group = linesByOrder.get(item.order_id);
    if (group) group.push(item);
    else linesByOrder.set(item.order_id, [item]);
  }

  const grouped = new Map<string, { customer: Customer; orders: Order[] }>();
  for (const order of data.orders) {
    if (isCreditNote(order) || !isRevenueOrder(order) || !order.customer_id) continue;
    const customer = known.get(order.customer_id);
    if (!customer) continue;
    const entry = grouped.get(order.customer_id);
    if (entry) entry.orders.push(order);
    else grouped.set(order.customer_id, { customer, orders: [order] });
  }

  const records: CustomerRecord[] = [];
  for (const { customer, orders } of grouped.values()) {
    const qtyByName = new Map<string, number>();
    for (const order of orders) {
      for (const line of linesByOrder.get(order.id) ?? []) {
        qtyByName.set(
          line.product_name_snapshot,
          (qtyByName.get(line.product_name_snapshot) ?? 0) + line.quantity,
        );
      }
    }
    const favourite =
      Array.from(qtyByName, ([name, qty]) => ({ name, qty })).sort(
        (a, b) => b.qty - a.qty,
      )[0]?.name ?? null;
    const lastTime = Math.max(...orders.map((order) => new Date(order.created_at).getTime()));
    const lastDay = calendarDateInZone(new Date(lastTime));
    const quietDays = Math.max(
      0,
      Math.round(
        (new Date(`${data.today}T00:00:00Z`).getTime() -
          new Date(`${lastDay}T00:00:00Z`).getTime()) /
          DAY_MS,
      ),
    );
    records.push({
      customer,
      bills: orders.length,
      lifetime: round(orders.reduce((sum, order) => sum + order.grand_total, 0), 2),
      lastDay,
      quietDays,
      favourite,
    });
  }
  return records.sort((a, b) => b.lifetime - a.lifetime);
}

function winBack(data: AiInsightData): InsightResult {
  const records = customerRecords(data);
  const longest = records.length ? Math.max(...records.map((r) => r.quietDays)) : 0;

  if (!records.length) {
    return {
      kind: "win_back",
      title: "Win-back list",
      window: "All history on file",
      headline: "No named customer has a completed bill yet.",
      metrics: [],
      findings: [
        "Win-back reads last-order dates from Billing, and every closed bill in this workspace is a walk-in.",
      ],
      actions: ["Capture the customer on the bill — the CRM cannot win back people nobody logged."],
      caveat: "Walk-in bills carry no customer row, so nobody can have gone quiet.",
    };
  }

  const quiet = records.filter((record) => record.quietDays >= 45);
  const reachable = quiet.filter(
    (record) => record.customer.phone || record.customer.email,
  );
  const atStake = round(quiet.reduce((sum, record) => sum + record.lifetime, 0), 2);

  if (!quiet.length) {
    return {
      kind: "win_back",
      title: "Win-back list",
      window: "All history on file",
      headline: `Nobody has been quiet long enough to worry about — the longest gap is ${longest} days.`,
      metrics: [
        { label: "Known buyers", value: intText(records.length) },
        { label: "Quietest gap", value: `${longest} days` },
      ],
      findings: [
        `${records.length} ${pluralize(records.length, "customer")} has at least one closed bill on the record.`,
        "Every one of them ordered again inside 45 days of their last visit.",
      ],
      actions: ["Hold the 45-day line — re-reading this brief weekly is cheaper than running a campaign."],
    };
  }

  return {
    kind: "win_back",
    title: "Win-back list",
    window: "All history on file",
    headline: `${counted(quiet.length, "customer")} gone quiet for 45 days or more, carrying ${money(atStake, data.currencyCode)} of proven spend.`,
    metrics: [
      { label: "At risk", value: intText(quiet.length) },
      { label: "Spend at stake", value: money(atStake, data.currencyCode) },
      { label: "Reachable", value: intText(reachable.length) },
      { label: "Longest gap", value: `${longest} days` },
    ],
    findings: [
      `${quiet.length} of ${records.length} ${pluralize(records.length, "buyer")} ${hasHave(quiet.length)} been silent for 45 days or more.`,
      ...quiet.slice(0, 4).map(
        (record) =>
          `${record.customer.name}: ${record.bills} ${pluralize(record.bills, "bill")}, ${money(record.lifetime, data.currencyCode)} lifetime, last seen ${record.lastDay} (${record.quietDays} days ago)${record.favourite ? `, usually for ${record.favourite}` : ""}.`,
      ),
      `${counted(reachable.length, "name")} on that list ${hasHave(reachable.length)} a phone or email, so it is actionable without capturing anything new.`,
    ],
    actions: [
      quiet[0]
        ? `Message ${quiet[0].customer.name} first — the biggest lifetime spender on the list.`
        : "Work the list top-down.",
      reachable.length
        ? "Log each outreach as a CRM interaction so the next read knows it happened."
        : "Capture a phone number on the next visit — none of these names is reachable today.",
      "A campaign is the wrong first move until the silence is explained; a call is the right one.",
    ],
  };
}

function marginWatch(data: AiInsightData): InsightResult {
  const range = windowFor(data.today, 30);
  const lines = soldLines(data, range);
  const posted = totals(billsIn(data, range, true));
  const costed = lines
    .filter((line) => line.cost > 0 && line.revenue > 0)
    .map((line) => ({ ...line, margin: round(line.revenue - line.cost, 2), pct: ((line.revenue - line.cost) / line.revenue) * 100 }));
  const costedRevenue = round(costed.reduce((sum, line) => sum + line.revenue, 0), 2);
  const grossProfit = round(costed.reduce((sum, line) => sum + line.margin, 0), 2);
  const losing = costed.filter((line) => line.margin <= 0);
  const thin = costed
    .filter((line) => line.margin > 0 && line.pct < 20)
    .sort((a, b) => a.pct - b.pct);
  const discounted = lines.filter((line) => line.discount > 0).sort((a, b) => b.discount - a.discount);
  const uncosted = lines.length - costed.length;

  const findings = [
    costed.length
      ? `${money(grossProfit, data.currencyCode)} of gross profit on ${money(costedRevenue, data.currencyCode)} of costed line revenue — ${costedRevenue > 0 ? ((grossProfit / costedRevenue) * 100).toFixed(1) : "0"}%.`
      : "None of the sold lines has a cost price on the product, so margin cannot be computed.",
    `Discounts gave away ${money(posted.discount, data.currencyCode)} — ${pctOf(posted.discount, posted.net + posted.discount).toFixed(1)}% of gross before it came off.`,
  ];
  if (losing.length) {
    findings.push(
      `${losing.length} ${pluralize(losing.length, "line")} sold at or below cost: ${nameList(losing.map((line) => `${line.name} (${money(line.margin, data.currencyCode)})`), 3)}.`,
    );
  }
  if (thin.length) {
    findings.push(
      `Thin and moving: ${thin.slice(0, 3).map((line) => `${line.name} at ${line.pct.toFixed(0)}%`).join(", ")}.`,
    );
  }
  if (discounted.length) {
    findings.push(
      `${discounted[0].name} absorbed ${money(discounted[0].discount, data.currencyCode)} of line discounts on its own.`,
    );
  }
  if (uncosted > 0) {
    findings.push(
      `${uncosted} of ${lines.length} ${pluralize(lines.length, "sold line")} has no cost price, so this brief treats them as unknown rather than guessing one.`,
    );
  }

  return {
    kind: "margin_watch",
    title: "Margin leaks",
    window: range.label,
    headline: losing.length
      ? `${losing.length} ${pluralize(losing.length, "line")} sold at or below cost this month.`
      : `No line sold below cost; ${money(posted.discount, data.currencyCode)} came off in discounts.`,
    metrics: [
      { label: "Gross profit", value: money(grossProfit, data.currencyCode) },
      { label: "Discount given", value: money(posted.discount, data.currencyCode) },
      { label: "Below cost", value: intText(losing.length) },
      { label: "Under 20%", value: intText(thin.length) },
    ],
    findings,
    actions: [
      losing.length
        ? `Reprice or re-cost ${nameList(losing.map((line) => line.name), 2)} before the next bill.`
        : "Nothing needs repricing on cost grounds.",
      posted.discount <= 0
        ? "No discounts were given in the window."
        : pctOf(posted.discount, posted.net + posted.discount) < 1
          ? "Discounting is negligible this month — no cap is needed."
          : `Cap the ${pctOf(posted.discount, posted.net + posted.discount).toFixed(1)}% discount habit — ${posted.discount > grossProfit ? "it is larger than the month's gross profit" : "it is a real slice of the month's gross profit"}.`,
      uncosted > 0 ? "Fill the missing cost prices in the product editor; margin cannot be trusted without them." : "",
    ].filter(Boolean),
  };
}

function stockRisk(data: AiInsightData): InsightResult {
  const range = windowFor(data.today, 7);
  const positions = data.positions;
  const windowDays = Math.max(1, data.usageWindowDays);
  const usageById = new Map(data.usage.map((row) => [row.itemId, row]));

  if (!positions.length) {
    return {
      kind: "stock_risk",
      title: "Stock-out risk",
      window: `Last ${range.days} days`,
      headline: "This brand keeps no stock items on file.",
      metrics: [],
      findings: [
        "Stock risk measures shelf position against consumption, and there is nothing to position.",
      ],
      actions: ["Add stock items under Products → Inventory to make this brief meaningful."],
      caveat: "A workshop that buys nothing through the app cannot be warned about running out.",
    };
  }

  const below = positions.filter((position) => position.status !== "ok");
  const out = positions.filter((position) => position.status === "out");
  const runway = positions
    .map((position) => {
      const used = usageById.get(position.item.id);
      if (!used || used.units <= 0) return null;
      const perDay = used.units / windowDays;
      return {
        name: position.item.name,
        unit: position.item.unit,
        days: Math.round(position.units / perDay),
        perDay: round(perDay, 2),
      };
    })
    .filter(
      (row): row is { name: string; unit: string; days: number; perDay: number } =>
        row !== null,
    )
    .filter((row) => row.days <= 10)
    .sort((a, b) => a.days - b.days);
  const consumed = usageById.size;

  const findings = [
    `${below.length} of ${positions.length} stock ${pluralize(positions.length, "item")} ${isAre(below.length)} at or below the reorder line, and ${counted(out.length, "item")} ${isAre(out.length)} already at zero.`,
  ];
  if (runway.length) {
    findings.push(
      `On the last ${windowDays} days of real consumption, ${nameList(runway.slice(0, 3).map((row) => row.days <= 0 ? `${row.name} (already empty)` : `${row.name} (~${row.days} ${pluralize(row.days, "day")} left at ${row.perDay} ${row.unit}/day)`), 3)} ${runway.length === 1 ? "is" : "are"} closest to empty.`,
    );
  } else {
    findings.push(
      "No consumed item is inside a 10-day runway on this window's usage — the shelf is breathing.",
    );
  }
  findings.push(
    `${consumed} of ${positions.length} items are consumed by a menu or project line at all; the rest have no usage rate to run out on, so they only appear on the reorder line.`,
  );
  const flammable = below.filter((position) => position.item.storage === "flammable");
  if (flammable.length) {
    findings.push(
      `${nameList(flammable.map((position) => position.item.name), 3)} is flammable storage running low, so it cannot be solved with a bulk hurry-up.`,
    );
  }

  return {
    kind: "stock_risk",
    title: "Stock-out risk",
    window: `Usage over last ${windowDays} days`,
    headline: runway.length
      ? runway[0].days <= 0
        ? `${runway[0].name} is already off the shelf while the menu still sells it.`
        : `${runway[0].name} is closest to empty — about ${runway[0].days} ${pluralize(runway[0].days, "day")} of cover left.`
      : `${below.length} ${pluralize(below.length, "item")} below the reorder line, none inside a 10-day runway.`,
    metrics: [
      { label: "At/below line", value: intText(below.length) },
      { label: "Empty now", value: intText(out.length) },
      { label: "Under 10 days", value: intText(runway.length) },
      { label: "Shelf value", value: money(positions.reduce((sum, p) => sum + p.value, 0), data.currencyCode) },
    ],
    findings,
    actions: [
      runway[0]
        ? `Order ${runway[0].name} first — ${runway[0].days <= 0 ? "nothing left on the shelf" : `roughly ${runway[0].days} ${pluralize(runway[0].days, "day")} of cover`} at ${runway[0].perDay} ${runway[0].unit} a day.`
        : "No emergency buy is needed on this window's usage.",
      out.length
        ? `Flag the ${pluralize(out.length, "empty item")} unavailable rather than let a bill fail at the counter.`
        : "Nothing is at zero right now.",
      "Record purchases as they land so the shelf position and the invoice agree.",
    ],
  };
}

function bundleIdeas(data: AiInsightData): InsightResult {
  const range = windowFor(data.today, 90);
  const posted = billsIn(data, range, true);
  const ids = new Set(posted.map((order) => order.id));

  const namesByOrder = new Map<string, string[]>();
  const unitValue = new Map<string, { revenue: number; qty: number }>();
  for (const item of data.items) {
    if (!ids.has(item.order_id)) continue;
    const name = item.product_name_snapshot;
    const group = namesByOrder.get(item.order_id);
    if (group) group.push(name);
    else namesByOrder.set(item.order_id, [name]);
    const value = unitValue.get(name) ?? { revenue: 0, qty: 0 };
    value.revenue += item.line_total;
    value.qty += item.quantity;
    unitValue.set(name, value);
  }

  const pairs = new Map<string, { count: number; combined: number }>();
  for (const names of namesByOrder.values()) {
    const unique = Array.from(new Set(names)).sort();
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) {
        const key = `${unique[i]}__${unique[j]}`;
        const entry = pairs.get(key) ?? { count: 0, combined: 0 };
        entry.count += 1;
        entry.combined += priceOf(unitValue, unique[i]) + priceOf(unitValue, unique[j]);
        pairs.set(key, entry);
      }
    }
  }

  const ranked = Array.from(pairs, ([key, value]) => {
    const [a, b] = key.split("__");
    return { a, b, count: value.count, combined: round(value.combined, 2) };
  })
    .filter((pair) => pair.count >= 2)
    .sort((x, y) => y.count - x.count || y.combined - x.combined)
    .slice(0, 4);

  if (!ranked.length) {
    return {
      kind: "bundle_ideas",
      title: "Bundle ideas",
      window: range.label,
      headline: "No two products appear together often enough to call a bundle.",
      metrics: [{ label: "Bills read", value: intText(posted.length) }],
      findings: [
        "Bundles come from lines that share a bill. Across the last 90 days no pair reached two bills.",
      ],
      actions: ["Single-line days do not make bundles — re-read once multi-item bills accumulate."],
      caveat: "A pair needs at least 2 shared bills before this brief proposes anything.",
    };
  }

  const leaders = ranked[0];
  return {
    kind: "bundle_ideas",
    title: "Bundle ideas",
    window: range.label,
    headline: `${leaders.a} and ${leaders.b} keep selling together — ${leaders.count} shared bills.`,
    metrics: [
      { label: "Bills read", value: intText(posted.length) },
      { label: "Candidate pairs", value: intText(ranked.length) },
      { label: "Top pair", value: `${counted(leaders.count, "bill")} together` },
    ],
    findings: [
      ...ranked.map(
        (pair) =>
          `${pair.a} + ${pair.b} shared ${counted(pair.count, "bill")} at about ${money(pair.combined, data.currencyCode)} combined — a 5% bundle would price near ${money(pair.combined * 0.95, data.currencyCode)}.`,
      ),
      `${counted(posted.length, "closed bill")} in the window produced ${counted(pairs.size, "distinct pair")}; ${ranked.length} cleared the bar.`,
    ],
    actions: [
      `Try ${leaders.a} + ${leaders.b} first — the most repeated combination on the record.`,
      "Set it up as an offer in Products → Offers so the cashier applies it without deciding.",
      "Re-read after a month: pairs drawn from a few dozen bills are a hint, not a plan.",
    ],
  };
}

/** One unit's average taken across the window, so a pair price is not a sum of totals. */
function priceOf(
  unitValue: Map<string, { revenue: number; qty: number }>,
  name: string,
): number {
  const value = unitValue.get(name);
  if (!value || value.qty <= 0) return 0;
  return round(value.revenue / value.qty, 2);
}

function peakHours(data: AiInsightData): InsightResult {
  const range = windowFor(data.today, 90);
  const posted = billsIn(data, range, true);

  if (!posted.length) {
    return {
      kind: "peak_hours",
      title: "Peak hours",
      window: range.label,
      headline: "No closed bills in the last 90 days to place on a clock.",
      metrics: [],
      findings: [],
      actions: ["Post a few bills or widen the history — hour patterns need volume."],
      caveat: "Hours come from each bill's timestamp in the business timezone, not the service date.",
    };
  }

  const byHour = new Map<number, { bills: number; revenue: number }>();
  const byDay = new Map<string, { bills: number; revenue: number }>();
  for (const order of posted) {
    const hour = hourInZone(order.created_at);
    const day = dayName(calendarDateInZone(new Date(order.created_at)));
    const h = byHour.get(hour) ?? { bills: 0, revenue: 0 };
    h.bills += 1;
    h.revenue += order.grand_total;
    byHour.set(hour, h);
    const d = byDay.get(day) ?? { bills: 0, revenue: 0 };
    d.bills += 1;
    d.revenue += order.grand_total;
    byDay.set(day, d);
  }

  const hours = Array.from(byHour, ([hour, value]) => ({ hour, ...value })).sort(
    (a, b) => b.bills - a.bills || b.revenue - a.revenue,
  );
  const peak = hours.slice(0, 3);
  const quiet = [...hours].sort((a, b) => a.bills - b.bills)[0];
  const days = Array.from(byDay, ([name, value]) => ({ name, ...value })).sort(
    (a, b) => b.revenue - a.revenue,
  );
  const busiestDay = days[0];
  const weakestDay = days[days.length - 1];
  const peakRevenue = round(peak.reduce((sum, entry) => sum + entry.revenue, 0), 2);
  const net = totals(posted).net;
  const busiestSpan = `${hourLabel(peak[0].hour - 1 < 0 ? 23 : peak[0].hour - 1)}–${hourLabel((peak[0].hour + 1) % 24)}`;

  return {
    kind: "peak_hours",
    title: "Peak hours",
    window: range.label,
    headline: `${nameList(peak.map((entry) => hourLabel(entry.hour)), 3)} hold ${shareOf(peakRevenue, net)} of 90-day revenue, and ${busiestDay.name} is the heaviest day.`,
    metrics: [
      { label: "Peak hour", value: `${hourLabel(peak[0].hour)} · ${counted(peak[0].bills, "bill")}` },
      { label: "Peak share", value: shareOf(peakRevenue, net) },
      { label: "Best day", value: `${busiestDay.name} · ${money(busiestDay.revenue, data.currencyCode)}` },
      { label: "Quietest hour", value: quiet ? hourLabel(quiet.hour) : "—" },
    ],
    findings: [
      `${nameList(peak.map((entry) => `${hourLabel(entry.hour)} (${counted(entry.bills, "bill")}, ${money(entry.revenue, data.currencyCode)})`), 3)} ${isAre(peak.length)} the busiest hours on the record.`,
      `${busiestDay.name} carries ${money(busiestDay.revenue, data.currencyCode)} across ${busiestDay.bills} bills; ${weakestDay.name} only ${money(weakestDay.revenue, data.currencyCode)}.`,
      quiet && quiet.bills <= 2
        ? `${hourLabel(quiet.hour)} is the dead spot — ${quiet.bills} ${pluralize(quiet.bills, "bill")} in 90 days.`
        : `The softest tracked hour is ${quiet ? hourLabel(quiet.hour) : "untracked"} at ${quiet?.bills ?? 0} bills.`,
      `${counted(posted.length, "bill")} spread over ${counted(byHour.size, "distinct hour")}, so a gap in the middle is scheduling room rather than lost trade.`,
    ],
    actions: [
      `Cover ${busiestSpan} with the second pair of hands — that is where the money is.`,
      weakestDay.bills < busiestDay.bills / 2
        ? `${weakestDay.name} is the obvious day for stock counts, maintenance and the supplier run.`
        : "No day is weak enough to spare for upkeep — spread the upkeep instead.",
      "Match the shift board to these hours rather than to a flat nine-to-six.",
    ],
  };
}

/* ---------------------------------------------------- the four summary briefs */

/** Customers whose very first closed bill landed inside the window. */
function firstTimeBuyers(data: AiInsightData, range: Window): Customer[] {
  const known = new Map(data.customers.map((customer) => [customer.id, customer]));
  const earliest = new Map<string, number>();
  for (const order of data.orders) {
    if (isCreditNote(order) || !isRevenueOrder(order) || !order.customer_id) continue;
    const time = new Date(order.created_at).getTime();
    const seen = earliest.get(order.customer_id);
    if (seen === undefined || time < seen) earliest.set(order.customer_id, time);
  }
  const buyers: Customer[] = [];
  for (const [id, time] of earliest) {
    const customer = known.get(id);
    if (!customer) continue;
    const day = calendarDateInZone(new Date(time));
    if (day >= range.from && day <= range.to) buyers.push(customer);
  }
  return buyers;
}

/** Tag slugs arrive hyphen- or underscore-joined; a merchant reads plain words. */
function tagWords(tag: string): string {
  return tag.replaceAll(/[-_]/g, " ").trim();
}

/** Tag slugs rolled up into the words a merchant would actually say. */
function tagThemes(reviews: CustomerReview[], limit = 3): string[] {
  const tally = new Map<string, number>();
  for (const review of reviews) {
    for (const tag of review.tags) {
      const words = tagWords(tag);
      if (!words) continue;
      tally.set(words, (tally.get(words) ?? 0) + 1);
    }
  }
  return Array.from(tally, ([theme, count]) => `${theme} (${count})`).slice(0, limit);
}

function quote(review: CustomerReview): string {
  const text = review.text.trim().replaceAll(/\s+/g, " ");
  return text.length > 96 ? `${text.slice(0, 93).trimEnd()}…` : text;
}

function reviewsIn(data: AiInsightData, range: Window): CustomerReview[] {
  return data.reviews.filter((review) => dayInWindow(review.reviewed_at, range));
}

/**
 * "Last month" is the previous complete calendar month rather than a rolling 30
 * days, because a merchant reconciles this brief against the month they lived
 * through, not against a sliding window they cannot point at.
 */
function monthSummary(data: AiInsightData): InsightResult {
  const { current, previous } = lastTwoMonths(data.today);
  const posted = billsIn(data, current, true);
  const sums = totals(posted);
  const prior = totals(billsIn(data, previous, true));
  const lines = soldLines(data, current);
  const earners = topLines(lines, "revenue", 3);
  const units = lines.reduce((sum, line) => sum + line.qty, 0);
  const named = posted.filter((order) => order.customer_id).length;
  const newcomers = firstTimeBuyers(data, current);
  const monthReviews = reviewsIn(data, current);
  const unanswered = unansweredReviews(monthReviews);
  const base = {
    kind: "month_summary" as const,
    title: "Last month summary",
    window: current.label,
  };

  if (!posted.length) {
    return {
      ...base,
      headline: `Nothing closed at ${data.brandName} in ${current.label}.`,
      metrics: [],
      findings: [
        `${current.label} has no completed bill in this workspace, so there is no month to write up.`,
        prior.count
          ? `${previous.label}, by contrast, closed with ${counted(prior.count, "bill")} at ${money(prior.net, data.currencyCode)}.`
          : `${previous.label} is empty too, which means the history on file starts later than both.`,
      ],
      actions: [
        "Switch brand or post a bill — a month with no closed sale has nothing to summarise honestly.",
      ],
      caveat:
        "Last month means the previous calendar month, so a read in early January is about December, not about the last 30 days.",
    };
  }

  const byDay = new Map<string, number>();
  for (const order of posted) {
    const day = calendarDateInZone(new Date(order.created_at));
    byDay.set(day, (byDay.get(day) ?? 0) + order.grand_total);
  }
  const bestDay = Array.from(byDay, ([date, value]) => ({ date, value })).sort(
    (a, b) => b.value - a.value,
  )[0];

  const findings = [
    `${current.label} closed at ${money(sums.net, data.currencyCode)} across ${counted(sums.count, "bill")} — ${deltaLabel(sums.net, prior.net)} on ${previous.label}${prior.count ? ` (${money(prior.net, data.currencyCode)})` : ""}.`,
    `The average bill was ${money(sums.average, data.currencyCode)}${prior.count ? ` against ${money(prior.average, data.currencyCode)}` : ""}, and ${money(sums.discount, data.currencyCode)} came off in discounts.`,
    earners.length
      ? `${nameList(earners.map((line) => `${line.name} at ${money(line.revenue, data.currencyCode)}`), 3)} earned the most, out of ${intText(units)} units on ${counted(lines.length, "sold line")}.`
      : "Not one sold line carries a bill total, so the month closed without a product movement.",
    `${counted(named, "bill")} of ${intText(sums.count)} carried a named customer${newcomers.length ? `, and ${counted(newcomers.length, "new one")} bought for the first time` : ""}.`,
  ];
  if (bestDay) {
    findings.push(
      `${dayName(bestDay.date)} was the strongest trading day at ${money(bestDay.value, data.currencyCode)}, and the month booked on only ${byDay.size} of its ${current.days} days.`,
    );
  }
  if (monthReviews.length) {
    const average = round(
      monthReviews.reduce((sum, review) => sum + review.rating, 0) / monthReviews.length,
      1,
    );
    findings.push(
      `${counted(monthReviews.length, "review")} landed in the month at ${average} out of 5${unanswered.length ? `, and ${counted(unanswered.length, "of them")} ${hasHave(unanswered.length)} no reply yet` : ""}.`,
    );
  }

  const actions = [
    earners[0]
      ? `Carry ${earners[0].name} into this month where the queue can see it — it earned ${money(earners[0].revenue, data.currencyCode)} in ${current.label}.`
      : "Add costed lines to the catalog so next month's summary can name earners.",
    sums.net < prior.net
      ? `${current.label} gave back ${money(prior.net - sums.net, data.currencyCode)} on ${previous.label} — find which week went quiet before touching prices.`
      : `Hold this run rate: ${money(sums.average, data.currencyCode)} a bill across ${byDay.size} trading days is what carried the month.`,
    unanswered.length
      ? "Reply to what the month left unanswered before it ages into a reputation problem."
      : "Nothing from the month is waiting on a reply.",
  ];

  return {
    ...base,
    headline: `${current.label}: ${money(sums.net, data.currencyCode)} on ${counted(sums.count, "bill")}, ${deltaLabel(sums.net, prior.net)} on ${previous.label}.`,
    metrics: [
      { label: "Closed sales", value: money(sums.net, data.currencyCode) },
      { label: "Bills", value: intText(sums.count) },
      { label: "Average bill", value: money(sums.average, data.currencyCode) },
      { label: "New customers", value: intText(newcomers.length) },
    ],
    findings,
    actions,
    caveat: "Only completed bills count, so quotations, drafts, cancellations and credit notes sit outside this month.",
  };
}

function weekSummary(data: AiInsightData): InsightResult {
  const range = windowFor(data.today, 7);
  const previous = shiftWindow(range, 7);
  const posted = billsIn(data, range, true);
  const sums = totals(posted);
  const prior = totals(billsIn(data, previous, true));
  const lines = soldLines(data, range);
  const leaders = topLines(lines, "qty", 3);
  const units = lines.reduce((sum, line) => sum + line.qty, 0);
  const open = billsIn(data, range).filter(
    (order) => order.status === "pending" || order.status === "confirmed",
  );
  const weekReviews = reviewsIn(data, range);
  const base = {
    kind: "week_summary" as const,
    title: "Last 1 week summary",
    window: `${range.from} to ${range.to}`,
  };

  if (!posted.length && !open.length) {
    return {
      ...base,
      headline: "The last seven days booked nothing at all.",
      metrics: [],
      findings: [
        "No bill was raised and none is still open in this window.",
        prior.count
          ? `The week before closed with ${counted(prior.count, "bill")} at ${money(prior.net, data.currencyCode)}, so this is a stop rather than a slowdown.`
          : "The week before that booked nothing either.",
      ],
      actions: ["Open the POS and post a bill, or check the workspace is on the right brand."],
      caveat: "The window is the seven days ending today, so a bill from eight days ago does not count here.",
    };
  }

  const byDay = new Map<string, { bills: number; net: number }>();
  for (const order of posted) {
    const day = dayName(calendarDateInZone(new Date(order.created_at)));
    const entry = byDay.get(day) ?? { bills: 0, net: 0 };
    entry.bills += 1;
    entry.net += order.grand_total;
    byDay.set(day, entry);
  }
  const bestDay = Array.from(byDay, ([name, value]) => ({ name, ...value })).sort(
    (a, b) => b.net - a.net,
  )[0];

  const findings = [
    posted.length
      ? `${counted(sums.count, "closed bill")} brought in ${money(sums.net, data.currencyCode)} at ${money(sums.average, data.currencyCode)} a bill — ${deltaLabel(sums.net, prior.net)} on the seven days before.`
      : `Nothing has closed yet this week, but ${counted(open.length, "bill")} ${isAre(open.length)} still open.`,
    `The week traded on ${counted(byDay.size, "day")} of seven${bestDay ? `; ${bestDay.name} was the heaviest at ${money(bestDay.net, data.currencyCode)} over ${bestDay.bills} ${pluralize(bestDay.bills, "bill")}` : ""}.`,
    leaders.length
      ? `${nameList(leaders.map((line) => `${line.name} (${intText(line.qty)})`), 3)} led ${intText(units)} units.`
      : "No closed line has sold, so there is nothing to rank yet.",
  ];
  if (open.length) {
    findings.push(
      `${counted(open.length, "bill")} ${isAre(open.length)} still open inside the window, carrying ${money(totals(open).net, data.currencyCode)}.`,
    );
  }
  if (sums.due > 0) {
    findings.push(`${money(sums.due, data.currencyCode)} of what closed is still unpaid.`);
  }
  if (sums.discount > 0) {
    findings.push(
      `${money(sums.discount, data.currencyCode)} went off in discounts — ${pctOf(sums.discount, sums.net + sums.discount).toFixed(1)}% of gross.`,
    );
  }
  if (weekReviews.length) {
    const average = round(
      weekReviews.reduce((sum, review) => sum + review.rating, 0) / weekReviews.length,
      1,
    );
    findings.push(
      `${counted(weekReviews.length, "customer")} reviewed the week at ${average} out of 5.`,
    );
  }

  return {
    ...base,
    headline: posted.length
      ? `${money(sums.net, data.currencyCode)} across ${counted(sums.count, "bill")} — ${deltaLabel(sums.net, prior.net)} on the week before.`
      : `Nothing closed yet; ${counted(open.length, "open bill")} still on the counter.`,
    metrics: [
      { label: "Closed sales", value: money(sums.net, data.currencyCode) },
      { label: "Bills", value: intText(sums.count) },
      { label: "Average bill", value: money(sums.average, data.currencyCode) },
      { label: "Units sold", value: intText(units) },
    ],
    findings,
    actions: [
      open.length
        ? `Close the ${pluralize(open.length, "open bill")} first — ${money(totals(open).net, data.currencyCode)} is written but not banked.`
        : "Nothing is left open, so the week's paper is already money.",
      bestDay
        ? `Copy ${bestDay.name}: ${money(bestDay.net, data.currencyCode)} in one day says the setup works when it runs like that.`
        : "Find the trading pattern before planning the week.",
      byDay.size < 5
        ? `${7 - byDay.size} of the seven days booked nothing — that is the gap, not basket size.`
        : "Every day traded; protect the lineup rather than chasing new days.",
    ],
    caveat: "This is a rolling seven days ending today, not Monday to Sunday, and only completed bills count as sales.",
  };
}

function reviewsSummary(data: AiInsightData): InsightResult {
  const range = windowFor(data.today, 90);
  const inWindow = reviewsIn(data, range);
  const base = {
    kind: "reviews_summary" as const,
    title: "Reviews summary",
    window: range.label,
  };

  if (!data.reviews.length) {
    return {
      ...base,
      headline: "No review has been recorded for this brand yet.",
      metrics: [],
      findings: [
        "This brief reads the CRM review inbox — ratings, sentiment and replies already on file.",
      ],
      actions: ["Add a review under Customers → Reviews, or connect the sources you actually get reviewed on."],
      caveat: "Nothing is invented here: no rows, no rating, no themes.",
    };
  }

  if (!inWindow.length) {
    return {
      ...base,
      headline: `Nothing was reviewed in the last 90 days, though ${counted(data.reviews.length, "review")} on file ${isAre(data.reviews.length)} older than the window.`,
      metrics: [{ label: "Reviews on file", value: intText(data.reviews.length) }],
      findings: [
        "The window is empty, so there is no current reputation to read.",
        "Review flow decays quietly — a quarter without one is itself the finding.",
      ],
      actions: ["Ask the last three completed customers for a review, then re-run this in a fortnight."],
      caveat: "The window is the last 90 days by review date; older reviews stay on file but do not move these numbers.",
    };
  }

  const stats = reviewInboxSummary(inWindow);
  const praise = inWindow.filter((review) => review.sentiment === "positive");
  const hard = inWindow.filter((review) => review.sentiment === "negative" || review.rating <= 2);
  const stale = unansweredReviews(inWindow).filter(
    (review) => review.sentiment !== "positive",
  );
  const oldest = stale[0];
  const best = stats.bySource[0];
  const worst = [...stats.bySource]
    .filter((source) => source.count >= 2)
    .sort((a, b) => a.averageRating - b.averageRating)[0];
  const mentioned = stats.staffMentions[0];

  const findings = [
    `${counted(stats.total, "review")} in the window at ${stats.averageRating ?? 0} out of 5 — ${stats.bySentiment.positive} positive, ${stats.bySentiment.neutral} neutral, ${stats.bySentiment.negative} negative.`,
    `${intText(stats.byRating[5] + stats.byRating[4])} came in at four stars or better against ${intText(stats.byRating[1] + stats.byRating[2])} at two or worse.`,
    praise.length && tagThemes(praise).length
      ? `Praise keeps returning to ${nameList(tagThemes(praise), 3)}.`
      : "Nothing in the window reads as praise.",
    hard.length && tagThemes(hard).length
      ? `Complaints cluster on ${nameList(tagThemes(hard), 3)}.`
      : "No low rating in the window carries a complaint theme.",
    stats.bySource.length > 1 && worst
      ? `By channel: ${best.source} holds ${counted(best.count, "review")} at ${best.averageRating}, ${worst.source} only ${worst.averageRating}.`
      : `All ${counted(stats.total, "review")} arrived on ${best.source}.`,
  ];
  if (oldest) {
    findings.push(
      `${counted(stats.unanswered, "review")} ${hasHave(stats.unanswered)} no reply yet; the oldest complaint has sat ${daysSince(oldest.reviewed_at, data.today)} days: “${quote(oldest)}”.`,
    );
  } else if (stats.unanswered) {
    findings.push(
      `${counted(stats.unanswered, "review")} ${isAre(stats.unanswered)} unanswered, though none of them is negative.`,
    );
  } else {
    findings.push("Every review in the window has a reply on it.");
  }
  if (stats.escalationCandidates) {
    findings.push(
      `${counted(stats.escalationCandidates, "low-rated review")} ${hasHave(stats.escalationCandidates)} no complaint record yet.`,
    );
  }
  if (mentioned) {
    findings.push(
      `${mentioned.name} is named in ${counted(mentioned.positive + mentioned.negative, "review")} — ${mentioned.positive} praising, ${mentioned.negative} blaming.`,
    );
  }

  const oldestTheme = oldest ? tagWords(oldest.tags[0] ?? "") : "";

  return {
    ...base,
    headline: oldest
      ? `${counted(stats.total, "review")} at ${stats.averageRating ?? 0}/5, and a ${oldest.rating}-star one has waited ${daysSince(oldest.reviewed_at, data.today)} days for a reply.`
      : `${counted(stats.total, "review")} at ${stats.averageRating ?? 0}/5 — every complaint in the window has been answered.`,
    metrics: [
      { label: "Reviews", value: intText(stats.total) },
      { label: "Average", value: `${stats.averageRating ?? 0} / 5` },
      { label: "Unanswered", value: intText(stats.unanswered) },
      { label: "Negative", value: intText(stats.bySentiment.negative) },
    ],
    findings,
    actions: [
      oldest
        ? `Reply to the ${oldest.rating}-star ${oldestTheme || "low-rated"} review first — an unanswered complaint reads worse than the complaint.`
        : "Keep the reply time where it is; unanswered negatives are what rot a rating.",
      hard.length
        ? `Fix the theme, not the rating: ${nameList(tagThemes(hard, 2), 2)} is what the one-stars keep naming.`
        : "No theme is repeating in the low ratings, so protect what works.",
      "Log each reply as a CRM interaction so the next read of this brief knows it happened.",
    ],
    caveat:
      "Sentiment, tags and replies come from the CRM review records and their deterministic scorer, so this brief and the Reviews inbox can never disagree.",
  };
}

function keyPoints(data: AiInsightData): InsightResult {
  const range = windowFor(data.today, 30);
  const previous = shiftWindow(range, 30);
  const posted = billsIn(data, range, true);
  const sums = totals(posted);
  const prior = totals(billsIn(data, previous, true));
  const lines = soldLines(data, range);
  const earner = topLines(lines, "revenue", 1)[0];
  const costed = lines
    .filter((line) => line.cost > 0 && line.revenue > 0)
    .map((line) => ({ ...line, margin: round(line.revenue - line.cost, 2) }));
  const losing = costed.filter((line) => line.margin <= 0);
  const quiet = customerRecords(data).filter((record) => record.quietDays >= 45);
  const windowDays = Math.max(1, data.usageWindowDays);
  const usageById = new Map(data.usage.map((row) => [row.itemId, row]));
  const runway = data.positions
    .map((position) => {
      const used = usageById.get(position.item.id);
      if (!used || used.units <= 0) return null;
      const perDay = used.units / windowDays;
      return {
        name: position.item.name,
        unit: position.item.unit,
        perDay: round(perDay, 2),
        days: Math.round(position.units / perDay),
      };
    })
    .filter((row): row is { name: string; unit: string; perDay: number; days: number } => row !== null)
    .sort((a, b) => a.days - b.days)
    .slice(0, 1);
  const belowLine = data.positions.filter((position) => position.status !== "ok");
  const monthReviews = reviewsIn(data, range);
  const stale = unansweredReviews(monthReviews).filter(
    (review) => review.sentiment !== "positive",
  );

  const points: string[] = [];
  points.push(
    posted.length
      ? `Money — ${money(sums.net, data.currencyCode)} on ${counted(sums.count, "bill")} at ${money(sums.average, data.currencyCode)} a bill, ${deltaLabel(sums.net, prior.net)} on the previous 30 days.${sums.due > 0 ? ` ${money(sums.due, data.currencyCode)} of it is still unpaid.` : ""}`
      : "Money — nothing closed in the last 30 days, so every point below is the only signal there is.",
  );
  if (earner) {
    points.push(
      `Menu — ${earner.name} is the earner at ${money(earner.revenue, data.currencyCode)} on ${intText(earner.qty)} units; a stockout there is the month's biggest single risk.`,
    );
  }
  points.push(
    losing.length
      ? `Margin — ${counted(losing.length, "line")} sold at or below cost (${nameList(losing.map((line) => line.name), 2)}) and ${money(sums.discount, data.currencyCode)} came off in discounts.`
      : costed.length
        ? `Margin — nothing sold below cost, and ${money(sums.discount, data.currencyCode)} of discount is ${pctOf(sums.discount, sums.net + sums.discount).toFixed(1)}% of gross.`
        : "Margin — no sold line has a cost price, so margin cannot be stated honestly yet.",
  );
  points.push(
    quiet.length
      ? `People — ${counted(quiet.length, "good customer")} ${hasHave(quiet.length)} gone quiet for 45 days or more, carrying ${money(quiet.reduce((sum, record) => sum + record.lifetime, 0), data.currencyCode)} of proven spend.`
      : "People — no named customer has been quiet long enough to chase.",
  );
  points.push(
    runway[0] && runway[0].days <= 10
      ? `Shelf — ${runway[0].name} has about ${Math.max(0, runway[0].days)} ${pluralize(Math.max(0, runway[0].days), "day")} of cover left at ${runway[0].perDay} ${runway[0].unit} a day${belowLine.length > 1 ? `, and ${counted(belowLine.length, "item")} sit at or below the reorder line` : ""}.`
      : belowLine.length
        ? `Shelf — ${counted(belowLine.length, "item")} ${isAre(belowLine.length)} at or below the reorder line, none inside a ten-day runway.`
        : data.positions.length
          ? `Shelf — all ${positionsWord(data.positions.length)} above the reorder line.`
          : "Shelf — this brand keeps no stock items, so there is nothing to run out.",
  );
  points.push(
    monthReviews.length
      ? stale[0]
        ? `Reputation — ${counted(monthReviews.length, "review")} in 30 days at ${round(monthReviews.reduce((sum, review) => sum + review.rating, 0) / monthReviews.length, 1)} out of 5, and a ${stale[0].rating}-star one has waited ${daysSince(stale[0].reviewed_at, data.today)} days for a reply.`
        : `Reputation — ${counted(monthReviews.length, "review")} in 30 days at ${round(monthReviews.reduce((sum, review) => sum + review.rating, 0) / monthReviews.length, 1)} out of 5, all answered.`
      : "Reputation — no review landed in the last 30 days.",
  );

  const urgent = runway[0] && runway[0].days <= 3
      ? `Order ${runway[0].name} today${runway[0].days <= 0 ? " — the shelf is already empty" : ""}.`
      : losing.length
        ? `Reprice or re-cost ${nameList(losing.map((line) => line.name), 2)} before the next bill.`
        : stale[0]
          ? `Answer the ${stale[0].rating}-star review that has waited ${daysSince(stale[0].reviewed_at, data.today)} days.`
          : quiet[0]
            ? `Call ${quiet[0].customer.name} — the biggest spender now ${quiet[0].quietDays} days silent.`
            : "Nothing is urgent. Use the quiet week to fix cost prices and tidy the catalog.";

  return {
    kind: "key_points",
    title: "Key points",
    window: range.label,
    headline: posted.length
      ? `${counted(points.length, "point")} from the last 30 days. First move: ${urgent.charAt(0).toLowerCase()}${urgent.slice(1)}`
      : `${counted(points.length, "point")} from the last 30 days, starting from a month with no closed sale.`,
    metrics: [
      { label: "Closed sales", value: money(sums.net, data.currencyCode) },
      { label: "Change", value: deltaLabel(sums.net, prior.net) },
      { label: "Shelf alerts", value: intText(belowLine.length) },
      { label: "Unanswered", value: intText(stale.length) },
    ],
    findings: points,
    actions: [
      urgent,
      earner
        ? `Protect ${earner.name}: it is ${shareOf(earner.revenue, sums.net)} of the window's revenue.`
        : "Post a bill so the next digest has something to rank.",
      sums.net < prior.net
        ? "Sales are behind the previous 30 days — read Week vs week before changing anything."
        : "Re-read this digest weekly; the points move faster than the month totals do.",
    ],
    caveat: "One line per area over the last 30 days. The Menu point only appears once something has actually sold, so a five-line digest is a thin window rather than a missing read.",
  };
}

/**
 * Where a suggestion may come from, in the order a merchant should act: what
 * stops you selling first, then the money on the counter, then reputation,
 * margin, the people behind it and the catalog around them.
 */
const SUGGESTION_SOURCES = [
  { kind: "stock_risk", area: "Shelf" },
  { kind: "today_report", area: "Counter" },
  { kind: "reviews_summary", area: "Reputation" },
  { kind: "margin_watch", area: "Margin" },
  { kind: "win_back", area: "People" },
  { kind: "slow_movers", area: "Catalog" },
  { kind: "bundle_ideas", area: "Bundling" },
] as const satisfies readonly { kind: AiInsightKind; area: string }[];

/**
 * The Suggestions card: each other brief's own first action, quoted rather than
 * rewritten, in a fixed order. Composing the briefs keeps one source of truth —
 * a suggestion can never disagree with the screen it came from, and when a model
 * replaces the prose there is a diffable list to measure it against.
 */
function suggestions(data: AiInsightData): InsightResult {
  const range = windowFor(data.today, 30);
  const sums = totals(billsIn(data, range, true));
  const alerts = data.positions.filter((position) => position.status !== "ok").length;
  const stale = unansweredReviews(reviewsIn(data, range)).filter(
    (review) => review.sentiment !== "positive",
  );
  const quiet = customerRecords(data).filter((record) => record.quietDays >= 45);
  const moves = SUGGESTION_SOURCES.map((source) => {
    const brief = generateInsight(source.kind, data);
    const action = brief.actions[0] ?? brief.headline;
    return { area: source.area, action, why: brief.headline };
  });
  const lead = alerts
    ? `${counted(alerts, "item")} ${alerts === 1 ? "sits" : "sit"} at or below the reorder line`
    : stale.length
      ? `${counted(stale.length, "review")} ${isAre(stale.length)} still waiting for a reply`
      : quiet.length
        ? `${counted(quiet.length, "good customer")} ${hasHave(quiet.length)} gone quiet for 45 days or more`
        : `${money(sums.net, data.currencyCode)} closed in the last 30 days, with nothing short`;

  return {
    kind: "suggestions",
    title: "Suggestions",
    window: `Last 30 days · ${counted(moves.length, "brief")}`,
    headline: `${counted(moves.length, "move")} worth making, in the order they stop you selling. First signal — ${lead}.`,
    metrics: [
      { label: "Closed sales", value: money(sums.net, data.currencyCode) },
      { label: "Still unpaid", value: money(sums.due, data.currencyCode) },
      { label: "Shelf alerts", value: intText(alerts) },
      { label: "Unanswered", value: intText(stale.length) },
    ],
    findings: moves.map((move) => `${move.area} — ${move.why}`),
    actions: moves.map((move) => move.action),
    caveat: "Every line above is another brief's own first action, quoted rather than rewritten, in a fixed order: shelf, counter, reputation, margin, people, catalog, bundling. Open the brief for the arithmetic behind it.",
  };
}

/** Keeps the shelf sentence grammatical at one item. */
function positionsWord(count: number): string {
  return `${intText(count)} ${pluralize(count, "item")} ${isAre(count)}`;
}

const GENERATORS: Record<AiInsightKind, (data: AiInsightData) => InsightResult> = {
  today_report: todayReport,
  week_summary: weekSummary,
  month_summary: monthSummary,
  suggestions,
  reviews_summary: reviewsSummary,
  key_points: keyPoints,
  top_sellers: topSellers,
  slow_movers: slowMovers,
  week_change: weekChange,
  win_back: winBack,
  margin_watch: marginWatch,
  stock_risk: stockRisk,
  bundle_ideas: bundleIdeas,
  peak_hours: peakHours,
};

export function isAiInsightKind(value: unknown): value is AiInsightKind {
  return typeof value === "string" && Object.hasOwn(GENERATORS, value);
}

export const AI_INSIGHT_KINDS = Object.keys(GENERATORS) as AiInsightKind[];

/** Run one brief. Pure and synchronous — the async boundary belongs to the caller. */
export function generateInsight(
  kind: AiInsightKind,
  data: AiInsightData,
): InsightResult {
  return GENERATORS[kind](data);
}

/**
 * Keyword router for the free-text box. It deliberately chooses among the same
 * fourteen briefs instead of pretending to answer anything: a question it
 * cannot place says so, which is the honest behaviour until a model sits behind
 * it.
 */
export function routeQuestion(question: string): AiInsightKind | null {
  const text = question.toLowerCase();
  const routes: { kind: AiInsightKind; words: string[] }[] = [
    { kind: "suggestions", words: ["suggest", "what should i do", "what to do", "next step", "action plan", "advise", "advice"] },
    { kind: "month_summary", words: ["last month", "monthly", "month summary", "previous month", "whole month"] },
    { kind: "week_summary", words: ["this week", "last 1 week", "week summary", "seven days", "past week"] },
    { kind: "reviews_summary", words: ["review", "rating", "star", "saying", "customers saying", "reputation", "feedback"] },
    { kind: "key_points", words: ["key point", "summary", "summarise", "summarize", "highlights", "digest", "executive", "short version"] },
    { kind: "today_report", words: ["today", "day so far", "right now", "how are we doing"] },
    { kind: "top_sellers", words: ["most sold", "best sell", "top sell", "popular", "fastest", "selling most"] },
    { kind: "slow_movers", words: ["slow", "not selling", "dead stock", "unsold", "worst sell"] },
    { kind: "week_change", words: ["week", "grow", "declin", "up or down", "vs last", "trend"] },
    { kind: "win_back", words: ["customer", "quiet", "lost", "win back", "idle", "churn", "stopped"] },
    { kind: "margin_watch", words: ["margin", "profit", "cost price", "discount", "leak", "cheap"] },
    { kind: "stock_risk", words: ["stock", "run out", "run out of", "reorder", "inventory", "supply", "shelf"] },
    { kind: "bundle_ideas", words: ["bundle", "combo", "together", "cross-sell", "pair"] },
    { kind: "peak_hours", words: ["hour", "busy", "peak", "staff", "shift", "when"] },
  ];
  let best: { kind: AiInsightKind; score: number } | null = null;
  for (const route of routes) {
    let score = 0;
    for (const word of route.words) {
      if (text.includes(word)) score += word.length;
    }
    if (score > 0 && (!best || score > best.score)) best = { kind: route.kind, score };
  }
  return best?.kind ?? null;
}

/** Shown when the box cannot place a question at all. */
export const UNROUTED_HINT =
  "This demo answers from the four summaries and ten briefs on this page. Ask about today, last week, last month, what to do next, the reviews, the key points, the most sold items, slow movers, quiet customers, margin, stock-outs, bundles or peak hours.";

/**
 * The one-line standing hint each summary card shows before anything is
 * generated, so the card states which window it will read.
 */
export function aiSummaryHint(kind: AiInsightKind, data: AiInsightData): string {
  switch (kind) {
    case "today_report":
      return `${dayName(data.today)} ${data.today}, up to now`;
    case "suggestions":
      return `Ranked across ${counted(SUGGESTION_SOURCES.length, "brief")}`;
    case "month_summary":
      return lastTwoMonths(data.today).current.label;
    case "week_summary": {
      const range = windowFor(data.today, 7);
      return `${range.from} → ${range.to}`;
    }
    case "reviews_summary": {
      const recent = reviewsIn(data, windowFor(data.today, 90)).length;
      return data.reviews.length
        ? `${counted(recent, "review")} in 90 days · ${counted(data.reviews.length, "review")} on file`
        : "No review on file yet";
    }
    case "key_points":
      return "Last 30 days at a glance";
    default:
      return (
        AI_INSIGHT_PROMPTS.find((prompt) => prompt.kind === kind)?.blurb ?? ""
      );
  }
}
