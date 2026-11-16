/**
 * Automation rules.
 *
 * A rule is a trigger plus the OrderBook record it wants to create. Rules never
 * write: they compute `AiActionProposal`s, and the inbox in `/ai` is the only
 * place those become records — through `acceptProposalAction`, which a human
 * clicks. `requiresConfirmation` is typed as the literal `true` so no rule can
 * be added that runs unattended.
 *
 * Channel delivery (WhatsApp, Gmail, Google Calendar) is out of scope here by
 * design. A reminder proposal creates a task for a person; it does not send a
 * message. See `channels.ts` and `/manager/productivity/integrations`.
 */

import { formatMoney } from "@/lib/format";
import {
  INVOICE_FOLLOW_UP_AFTER_DAYS,
  QUOTE_STALE_AFTER_DAYS,
  type BusinessContext,
} from "./context";
import type {
  AiActionProposal,
  AiEvidence,
  AiPrefsState,
  AutomationRule,
} from "./types";

export const TASK_DELIVERY_NOTE =
  "Creates an OrderBook task only. No WhatsApp, Gmail or Calendar message is sent — that is a separate integration area.";

export const NOTE_DELIVERY_NOTE =
  "Creates an OrderBook note only. No purchase order is raised with a supplier and nothing is sent externally.";

const RULE_NOTE_LIMIT = 1200;

export const AUTOMATION_RULES: AutomationRule[] = [
  {
    id: "low-stock-draft-po",
    name: "Low stock → draft purchase order",
    trigger:
      "An active product that tracks stock reaches its low-stock threshold, or hits zero.",
    creates:
      "A draft purchase order note listing each item, what is left, and a suggested quantity.",
    href: "/manager/products/procurement",
    linkLabel: "Open procurement",
    defaultEnabled: true,
    requiresConfirmation: true,
    deliveryNote: NOTE_DELIVERY_NOTE,
  },
  {
    id: "overdue-invoice-follow-up",
    name: "Overdue invoice → follow-up task",
    trigger: `An invoice is still unpaid ${INVOICE_FOLLOW_UP_AFTER_DAYS}+ days after it was issued. OrderBook has no invoice due dates, so age is measured from issue.`,
    creates: "One follow-up task naming each invoice, the customer and the balance.",
    href: "/manager/finance/receivables",
    linkLabel: "Open receivables",
    defaultEnabled: true,
    requiresConfirmation: true,
    deliveryNote: TASK_DELIVERY_NOTE,
  },
  {
    id: "quote-unanswered-follow-up",
    name: `Quote unanswered ${QUOTE_STALE_AFTER_DAYS} days → follow-up task`,
    trigger: `A quotation is still in draft with no payment for ${QUOTE_STALE_AFTER_DAYS}+ days.`,
    creates: "One task to chase each silent quote.",
    href: "/orders",
    linkLabel: "Open quotes & bills",
    defaultEnabled: true,
    requiresConfirmation: true,
    deliveryNote: TASK_DELIVERY_NOTE,
  },
  {
    id: "appointment-reminder-24h",
    name: "Booking in the next 24 hours → reminder task",
    trigger: "A scheduled appointment starts within the next 24 hours.",
    creates: "One task to confirm those bookings.",
    href: "/manager/productivity/appointments",
    linkLabel: "Open appointments & bookings",
    defaultEnabled: true,
    requiresConfirmation: true,
    deliveryNote: TASK_DELIVERY_NOTE,
  },
  {
    id: "daily-cash-closing",
    name: "Daily cash closing reminder",
    trigger:
      "Today has cash movements and today's cash session has not been closed.",
    creates: "One task to count the drawer and close the day.",
    href: "/manager/finance/cash",
    linkLabel: "Open cash & reconciliation",
    defaultEnabled: true,
    requiresConfirmation: true,
    deliveryNote: TASK_DELIVERY_NOTE,
  },
];

export function getAutomationRule(id: string): AutomationRule | undefined {
  return AUTOMATION_RULES.find((rule) => rule.id === id);
}

export function isRuleEnabled(
  prefs: AiPrefsState,
  rule: AutomationRule,
): boolean {
  const stored = prefs.enabled[rule.id];
  return stored === undefined ? rule.defaultEnabled : stored;
}

/** Rule id -> effective enabled flag, defaults applied. */
export function resolveAutomationState(prefs: AiPrefsState): Record<string, boolean> {
  const state: Record<string, boolean> = {};
  for (const rule of AUTOMATION_RULES) state[rule.id] = isRuleEnabled(prefs, rule);
  return state;
}

function money(ctx: BusinessContext, amount: number): string {
  return formatMoney(amount, ctx.brand.currencyCode);
}

/** Same data produces the same id, so accept/dismiss decisions stick. */
function proposalId(ruleId: string, parts: string[]): string {
  const fingerprint = [...parts].sort().join("|");
  return `${ruleId}:${fingerprint}`;
}

function evidenceFor(
  rows: { label: string; value: string; href: string }[],
  limit = 6,
): AiEvidence[] {
  return rows.slice(0, limit).map((row) => ({ ...row }));
}

type RuleRunner = (ctx: BusinessContext) => AiActionProposal[];

const lowStockDraftPurchaseOrder: RuleRunner = (ctx) => {
  const rows = [...ctx.inventory.outOfStock, ...ctx.inventory.lowStock];
  if (rows.length === 0) return [];
  const lines = rows.map(
    (row) =>
      `• ${row.name}${row.sku ? ` (${row.sku})` : ""} — ${row.stock} left, threshold ${row.threshold}, suggest ${row.suggestedReorderQty}${row.unit ? ` ${row.unit}` : ""}`,
  );
  const body = [
    `Draft purchase order prepared by OrderBook AI from stock levels for ${ctx.brand.name}, ${ctx.today}.`,
    "",
    ...lines,
    "",
    "Suggested quantity refills each product to twice its own low-stock threshold.",
    "Nothing has been ordered and no supplier has been contacted — raise the real purchase order in Procurement.",
  ].join("\n");
  return [
    {
      id: proposalId(
        "low-stock-draft-po",
        rows.map((row) => row.id),
      ),
      ruleId: "low-stock-draft-po",
      ruleName: "Low stock → draft purchase order",
      title: `Draft purchase order for ${rows.length} ${rows.length === 1 ? "item" : "items"}`,
      whatWillHappen: `Adds one note to Notes titled "Draft purchase order — ${rows
        .slice(0, 3)
        .map((row) => row.name)
        .join(", ")}${rows.length > 3 ? `, +${rows.length - 3} more` : ""}". It lists ${rows.length} ${rows.length === 1 ? "line" : "lines"} with current stock and a suggested quantity. No purchase order is created and no supplier is contacted.`,
      record: {
        kind: "note",
        title: `Draft purchase order — ${rows
          .map((row) => row.name)
          .join(", ")}`.slice(0, 120),
        body: body.slice(0, RULE_NOTE_LIMIT),
        category: "operations",
      },
      evidence: evidenceFor(
        rows.map((row) => ({
          label: row.name,
          value: `${row.stock} left · order ${row.suggestedReorderQty}`,
          href: "/manager/products/inventory",
        })),
      ),
      actionHref: "/manager/products/procurement",
      actionLabel: "Open procurement",
      status: "draft",
      createdAt: ctx.generatedAt,
      deliveryNote: NOTE_DELIVERY_NOTE,
    },
  ];
};

const overdueInvoiceFollowUp: RuleRunner = (ctx) => {
  const rows = ctx.receivables.rows.filter(
    (row) => row.days >= INVOICE_FOLLOW_UP_AFTER_DAYS,
  );
  if (rows.length === 0) return [];
  return [
    {
      id: proposalId(
        "overdue-invoice-follow-up",
        rows.map((row) => row.id),
      ),
      ruleId: "overdue-invoice-follow-up",
      ruleName: "Overdue invoice → follow-up task",
      title: `Chase ${rows.length} unpaid ${rows.length === 1 ? "invoice" : "invoices"}`,
      whatWillHappen: `Adds one task to Tasks & to-dos covering ${rows.length} unpaid ${rows.length === 1 ? "invoice" : "invoices"} worth ${money(ctx, rows.reduce((total, row) => total + row.amount, 0))}. It does not contact the customers.`,
      record: {
        kind: "task",
        title: `Chase ${rows.length} unpaid ${rows.length === 1 ? "invoice" : "invoices"} (${money(ctx, rows.reduce((total, row) => total + row.amount, 0))})`.slice(0, 118),
        description: [
          "Generated by OrderBook AI from unpaid balances. Contact each customer yourself — no message has been sent.",
          "",
          ...rows.map(
            (row) =>
              `• ${row.label}${row.sublabel ? ` (${row.sublabel})` : ""} — ${money(ctx, row.amount)} unpaid ${row.days} days`,
          ),
        ].join("\n").slice(0, 480),
        priority: "high",
      },
      evidence: evidenceFor(
        rows.map((row) => ({
          label: `${row.label}${row.sublabel ? ` · ${row.sublabel}` : ""}`,
          value: `${money(ctx, row.amount)} · ${row.days} days`,
          href: row.href,
        })),
      ),
      actionHref: "/manager/finance/receivables",
      actionLabel: "Open receivables",
      status: "draft",
      createdAt: ctx.generatedAt,
      deliveryNote: TASK_DELIVERY_NOTE,
    },
  ];
};

const quoteFollowUp: RuleRunner = (ctx) => {
  const rows = ctx.quotes.rows.filter(
    (row) => row.days >= QUOTE_STALE_AFTER_DAYS,
  );
  if (rows.length === 0) return [];
  return [
    {
      id: proposalId(
        "quote-unanswered-follow-up",
        rows.map((row) => row.id),
      ),
      ruleId: "quote-unanswered-follow-up",
      ruleName: `Quote unanswered ${QUOTE_STALE_AFTER_DAYS} days → follow-up task`,
      title: `Follow up on ${rows.length} silent ${rows.length === 1 ? "quote" : "quotes"}`,
      whatWillHappen: `Adds one task to Tasks & to-dos naming ${rows.length} ${rows.length === 1 ? "quote" : "quotes"} worth ${money(ctx, rows.reduce((total, row) => total + row.amount, 0))} with no reply. No customer is contacted.`,
      record: {
        kind: "task",
        title: `Follow up on ${rows.length} silent ${rows.length === 1 ? "quote" : "quotes"}`.slice(0, 118),
        description: [
          "Generated by OrderBook AI from quotations awaiting a decision. Chase them yourself — nothing has been sent.",
          "",
          ...rows.map(
            (row) =>
              `• ${row.label}${row.sublabel ? ` (${row.sublabel})` : ""} — ${money(ctx, row.amount)} quoted ${row.days} days ago`,
          ),
        ].join("\n").slice(0, 480),
        priority: "medium",
      },
      evidence: evidenceFor(
        rows.map((row) => ({
          label: `${row.label}${row.sublabel ? ` · ${row.sublabel}` : ""}`,
          value: `${money(ctx, row.amount)} · ${row.days} days`,
          href: row.href,
        })),
      ),
      actionHref: "/orders",
      actionLabel: "Open quotes & bills",
      status: "draft",
      createdAt: ctx.generatedAt,
      deliveryNote: TASK_DELIVERY_NOTE,
    },
  ];
};

const appointmentReminder: RuleRunner = (ctx) => {
  const rows = ctx.appointments.nextTwentyFourHours;
  if (rows.length === 0) return [];
  return [
    {
      id: proposalId(
        "appointment-reminder-24h",
        rows.map((row) => row.id),
      ),
      ruleId: "appointment-reminder-24h",
      ruleName: "Booking in the next 24 hours → reminder task",
      title: `Confirm ${rows.length} ${rows.length === 1 ? "booking" : "bookings"} in the next 24 hours`,
      whatWillHappen: `Adds one task to Tasks & to-dos listing ${rows.length} ${rows.length === 1 ? "booking" : "bookings"} starting soon. No reminder message is sent to anyone.`,
      record: {
        kind: "task",
        title: `Confirm ${rows.length} ${rows.length === 1 ? "booking" : "bookings"} in the next 24 hours`.slice(0, 118),
        description: [
          "Generated by OrderBook AI from the bookings calendar. Tell the customers yourself — no reminder has been sent.",
          "",
          ...rows.map(
            (row) =>
              `• ${row.title} at ${row.startsAt.slice(0, 16).replace("T", " ")}${row.customerName ? ` — ${row.customerName}` : ""}`,
          ),
        ].join("\n").slice(0, 480),
        priority: "medium",
      },
      evidence: evidenceFor(
        rows.map((row) => ({
          label: row.title,
          value: `${row.startsAt.slice(11, 16)}${row.customerName ? ` · ${row.customerName}` : ""}`,
          href: "/manager/productivity/appointments",
        })),
      ),
      actionHref: "/manager/productivity/appointments",
      actionLabel: "Open appointments & bookings",
      status: "draft",
      createdAt: ctx.generatedAt,
      deliveryNote: TASK_DELIVERY_NOTE,
    },
  ];
};

const dailyCashClosing: RuleRunner = (ctx) => {
  const hasTakings = ctx.cash.todayIn !== 0 || ctx.cash.todayOut !== 0;
  if (ctx.cash.sessionClosedToday || !hasTakings) return [];
  return [
    {
      id: proposalId("daily-cash-closing", [ctx.today]),
      ruleId: "daily-cash-closing",
      ruleName: "Daily cash closing reminder",
      title: `Close the cash session for ${ctx.today}`,
      whatWillHappen: `Adds one task to Tasks & to-dos to count the drawer for ${ctx.today} (${money(ctx, ctx.cash.todayIn)} in, ${money(ctx, ctx.cash.todayOut)} out). The session itself is still closed by hand in Cash & reconciliation.`,
      record: {
        kind: "task",
        title: `Close the cash session for ${ctx.today}`,
        description: [
          "Generated by OrderBook AI from today's cash movements.",
          "",
          `• Cash in: ${money(ctx, ctx.cash.todayIn)}`,
          `• Cash out: ${money(ctx, ctx.cash.todayOut)}`,
          `• Net: ${money(ctx, ctx.cash.netToday)}`,
        ].join("\n").slice(0, 480),
        priority: "medium",
      },
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
      actionHref: "/manager/finance/cash",
      actionLabel: "Open cash & reconciliation",
      status: "draft",
      createdAt: ctx.generatedAt,
      deliveryNote: TASK_DELIVERY_NOTE,
    },
  ];
};

const RUNNERS: Record<string, RuleRunner> = {
  "low-stock-draft-po": lowStockDraftPurchaseOrder,
  "overdue-invoice-follow-up": overdueInvoiceFollowUp,
  "quote-unanswered-follow-up": quoteFollowUp,
  "appointment-reminder-24h": appointmentReminder,
  "daily-cash-closing": dailyCashClosing,
};

/** Proposals from every enabled rule. Disabled rules produce nothing at all. */
export function buildAutomationProposals(
  ctx: BusinessContext,
  prefs: AiPrefsState,
): AiActionProposal[] {
  const proposals: AiActionProposal[] = [];
  for (const rule of AUTOMATION_RULES) {
    if (!isRuleEnabled(prefs, rule)) continue;
    proposals.push(...(RUNNERS[rule.id]?.(ctx) ?? []));
  }
  return proposals;
}

export type ProposalInbox = {
  pending: AiActionProposal[];
  handled: AiActionProposal[];
};

/**
 * Applies the owner's recorded decisions to a set of freshly computed
 * proposals. Accepted/rejected items stay visible as history instead of
 * silently disappearing, and never come back to the inbox.
 */
export function partitionProposals(
  proposals: AiActionProposal[],
  prefs: AiPrefsState,
): ProposalInbox {
  const pending: AiActionProposal[] = [];
  const handled: AiActionProposal[] = [];
  for (const proposal of proposals) {
    const entry = prefs.handled[proposal.id];
    if (!entry) {
      pending.push({ ...proposal, status: "draft" });
      continue;
    }
    handled.push({
      ...proposal,
      status: entry.status,
      outcomeHref: entry.outcomeHref,
      outcomeLabel: entry.outcomeLabel,
    });
  }
  return { pending, handled };
}
