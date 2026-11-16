/**
 * Automations must propose, never act.
 *
 * These tests pin the three things the honesty requirement rests on: every rule
 * is confirm-before-write, a rule with no matching data stays silent, and the
 * proposal ids are content-derived so an accepted or dismissed item cannot creep
 * back into the inbox.
 */

import { describe, expect, it } from "vitest";
import {
  AUTOMATION_RULES,
  NOTE_DELIVERY_NOTE,
  TASK_DELIVERY_NOTE,
  buildAutomationProposals,
  getAutomationRule,
  partitionProposals,
  resolveAutomationState,
} from "./automations";
import { buildInsights } from "./insight-engine";
import { buildRecommendations, toProposal } from "./recommendations";
import {
  TODAY,
  addDays,
  appointment,
  cashMovement,
  cashSession,
  fixtureContext,
  order,
  product,
} from "./fixtures";
import type { BusinessContext } from "./context";
import type { AiActionProposal, AiPrefsState } from "./types";

function prefs(over: Partial<AiPrefsState> = {}): AiPrefsState {
  return { enabled: {}, handled: {}, ...over };
}

function ruleIds(): string[] {
  return AUTOMATION_RULES.map((rule) => rule.id);
}

function disable(...ids: string[]): AiPrefsState {
  const enabled: Record<string, boolean> = {};
  for (const id of ruleIds()) enabled[id] = !ids.includes(id);
  return prefs({ enabled });
}

function enableOnly(id: string): AiPrefsState {
  return disable(...ruleIds().filter((ruleId) => ruleId !== id));
}

/** The clock `fixtures.ts` pins, so proposals can be compared against it. */
const GENERATED_AT = "2026-04-01T06:00:00.000Z";

/**
 * The whole vocabulary a proposal is allowed to speak: an OrderBook record plus
 * where to look at it. Nothing here can mean "delivered" — no recipient, no
 * channel, no send timestamp.
 */
const PROPOSAL_KEYS = [
  "actionHref",
  "actionLabel",
  "createdAt",
  "deliveryNote",
  "evidence",
  "id",
  "record",
  "ruleId",
  "ruleName",
  "status",
  "title",
  "whatWillHappen",
];
const TASK_RECORD_KEYS = ["description", "kind", "priority", "title"];
const NOTE_RECORD_KEYS = ["body", "category", "kind", "title"];

/** A workspace that trips all five rules at once. */
function busy(): BusinessContext {
  return fixtureContext({
    products: [
      product({ id: "p1", name: "Flat White", stock_qty: 2, low_stock_threshold: 10 }),
      product({
        id: "p2",
        name: "House Beans 1kg",
        sku: "SKU-2",
        unit: "bag",
        stock_qty: 0,
        low_stock_threshold: 4,
      }),
    ],
    orders: [
      order({
        id: "o2",
        order_number: "BC-9002",
        status: "completed",
        payment_status: "pending",
        amount_paid: 0,
        created_at: dayAgo(10),
      }),
      order({
        id: "o3",
        order_number: "BC-QUOTE",
        status: "draft",
        payment_status: "pending",
        amount_paid: 0,
        grand_total: 3500,
        subtotal: 3500,
        created_at: dayAgo(8),
      }),
    ],
    appointments: [appointment({ id: "a1", title: "Consultation", customerId: null })],
    cashMovements: [cashMovement({ id: "cm1", amount: 1500, direction: "in" })],
    cashSessions: [cashSession({ id: "cs1", closedAt: null })],
  });
}

function dayAgo(days: number): string {
  return `${addDays(TODAY, -days)}T09:00:00.000Z`;
}

function pick(proposals: AiActionProposal[], ruleId: string): AiActionProposal[] {
  return proposals.filter((proposal) => proposal.ruleId === ruleId);
}

describe("automation rule definitions", () => {
  it("covers the five agreed triggers and nothing else", () => {
    expect(ruleIds()).toEqual([
      "low-stock-draft-po",
      "overdue-invoice-follow-up",
      "quote-unanswered-follow-up",
      "appointment-reminder-24h",
      "daily-cash-closing",
    ]);
  });

  it("makes every rule confirm-before-write, by type and by value", () => {
    for (const rule of AUTOMATION_RULES) {
      // `requiresConfirmation` is the literal type `true`; this assertion is the
      // runtime proof that no rule slipped a default of "run unattended" in.
      expect(rule.requiresConfirmation).toBe(true);
      expect(rule.defaultEnabled).toBeTypeOf("boolean");
      expect(rule.trigger.length).toBeGreaterThan(10);
      expect(rule.creates.length).toBeGreaterThan(10);
      expect(rule.href.startsWith("/")).toBe(true);
      expect(rule.linkLabel.length).toBeGreaterThan(0);
      expect(rule.deliveryNote).toBeTruthy();
    }
  });

  it("says plainly that nothing is sent, for every rule", () => {
    const notes = new Set(AUTOMATION_RULES.map((rule) => rule.deliveryNote));
    for (const note of notes) {
      // The wording deliberately names the channels in order to rule them out.
      expect(note).toMatch(/only/i);
      expect(note).toMatch(/no .* is sent|nothing is sent|not sent/i);
    }
    expect(TASK_DELIVERY_NOTE).toContain("No WhatsApp, Gmail or Calendar message is sent");
    expect(NOTE_DELIVERY_NOTE).toContain("nothing is sent externally");
  });

  it("looks rules up by id and refuses to invent one", () => {
    expect(getAutomationRule("daily-cash-closing")?.name).toBe(
      "Daily cash closing reminder",
    );
    expect(getAutomationRule("auto-send-whatsapp")).toBeUndefined();
  });

  it("applies defaults, then honours stored flags", () => {
    const state = resolveAutomationState(prefs());
    expect(Object.keys(state).sort()).toEqual([...ruleIds()].sort());
    expect(Object.values(state)).toEqual(ruleIds().map(() => true));

    const off = resolveAutomationState(prefs({ enabled: { "quote-unanswered-follow-up": false } }));
    expect(off["quote-unanswered-follow-up"]).toBe(false);
    expect(off["daily-cash-closing"]).toBe(true);

    // Unknown ids in stored prefs are ignored by the state map.
    expect(
      Object.keys(resolveAutomationState(prefs({ enabled: { bogus: false } }))),
    ).toHaveLength(AUTOMATION_RULES.length);
  });
});

describe("buildAutomationProposals on an empty workspace", () => {
  it("proposes nothing at all", () => {
    const ctx = fixtureContext();
    expect(buildAutomationProposals(ctx, prefs())).toEqual([]);
    expect(buildAutomationProposals(ctx, prefs({ enabled: {} }))).toEqual([]);
  });
});

describe("buildAutomationProposals with data", () => {
  const proposals = buildAutomationProposals(busy(), prefs());

  it("produces one draft proposal per tripped rule", () => {
    for (const id of ruleIds()) expect(pick(proposals, id)).toHaveLength(1);
    expect(proposals).toHaveLength(AUTOMATION_RULES.length);
    for (const proposal of proposals) {
      expect(proposal.status).toBe("draft");
      expect(proposal.id.startsWith(`${proposal.ruleId}:`)).toBe(true);
      expect(proposal.evidence.length).toBeGreaterThan(0);
      expect(proposal.actionHref.startsWith("/")).toBe(true);
      expect(proposal.whatWillHappen).toContain("Adds one");
      expect(proposal.createdAt).toBe(GENERATED_AT);
    }
  });

  it("never proposes an external send — only tasks and one note", () => {
    const kinds = proposals.map((proposal) => proposal.record.kind);
    expect(kinds.filter((kind) => kind === "note")).toHaveLength(1);
    expect(kinds.every((kind) => kind === "task" || kind === "note")).toBe(true);
    for (const proposal of proposals) {
      expect(proposal.record.kind === "task" ? proposal.deliveryNote : "")
        .toStrictEqual(proposal.record.kind === "task" ? TASK_DELIVERY_NOTE : "");
      expect(Object.keys(proposal).sort()).toEqual(PROPOSAL_KEYS);
      expect(Object.keys(proposal.record).sort()).toEqual(
        proposal.record.kind === "task" ? TASK_RECORD_KEYS : NOTE_RECORD_KEYS,
      );
    }
  });

  it("turns low stock into a draft purchase order note that names items and quantities", () => {
    const [proposal] = pick(proposals, "low-stock-draft-po");
    expect(proposal?.record.kind).toBe("note");
    if (proposal?.record.kind !== "note") throw new Error("expected a note");
    expect(proposal.record.title).toBe("Draft purchase order — House Beans 1kg, Flat White");
    expect(proposal.record.category).toBe("operations");
    expect(proposal.title).toBe("Draft purchase order for 2 items");
    expect(proposal.record.body).toContain("House Beans 1kg");
    expect(proposal.record.body).toContain("0 left, threshold 4, suggest 8 bag");
    expect(proposal.record.body).toContain("2 left, threshold 10, suggest 18 cup");
    expect(proposal.record.body).toContain("Nothing has been ordered and no supplier has been contacted");
    expect(proposal.evidence.map((row) => row.label)).toEqual([
      "House Beans 1kg",
      "Flat White",
    ]);
    expect(proposal.evidence[1]?.value).toBe("2 left · order 18");
  });

  it("only drafts purchase orders into Notes, never into procurement tables", () => {
    const [proposal] = pick(proposals, "low-stock-draft-po");
    expect(proposal?.actionHref).toBe("/manager/products/procurement");
    expect(proposal?.record.kind).toBe("note");
    expect(JSON.stringify(proposal)).toContain("No purchase order is created");
  });

  it("bundles every overdue invoice into one high-priority task, not one per invoice", () => {
    const ctx = fixtureContext({
      orders: [
        order({ id: "o2", order_number: "BC-9002", payment_status: "pending", amount_paid: 0, created_at: dayAgo(10) }),
        order({ id: "o4", order_number: "BC-9004", payment_status: "partial", amount_paid: 200, grand_total: 1200, subtotal: 1200, created_at: dayAgo(6) }),
        order({ id: "o5", order_number: "BC-9005", payment_status: "pending", amount_paid: 0, created_at: dayAgo(1) }),
      ],
    });
    const [proposal] = pick(buildAutomationProposals(ctx, prefs()), "overdue-invoice-follow-up");
    if (proposal?.record.kind !== "task") throw new Error("expected a task");
    // BC-9005 is only 1 day old — under the 3-day chase threshold.
    expect(proposal.record.title).toContain("Chase 2 unpaid invoices");
    expect(proposal.record.description).toContain("BC-9002");
    expect(proposal.record.description).toContain("BC-9004");
    expect(proposal.record.description).not.toContain("BC-9005");
    expect(proposal.record.priority).toBe("high");
    expect(proposal.record.description).toContain("no message has been sent");
    expect(proposal.evidence.every((row) => row.href === "/orders/o2" || row.href === "/orders/o4")).toBe(true);
  });

  it("keeps a fresh invoice out of the chase proposal", () => {
    const ctx = fixtureContext({
      orders: [
        order({ id: "o6", order_number: "BC-9006", payment_status: "pending", amount_paid: 0, created_at: dayAgo(2) }),
      ],
    });
    expect(pick(buildAutomationProposals(ctx, prefs()), "overdue-invoice-follow-up")).toEqual([]);
  });

  it("chases quotes that have gone silent and leaves new ones alone", () => {
    const ctx = fixtureContext({
      orders: [
        order({ id: "q1", order_number: "BC-Q1", status: "draft", payment_status: "pending", amount_paid: 0, created_at: dayAgo(9) }),
        order({ id: "q2", order_number: "BC-Q2", status: "draft", payment_status: "pending", amount_paid: 0, created_at: dayAgo(1) }),
      ],
    });
    const [proposal] = pick(buildAutomationProposals(ctx, prefs()), "quote-unanswered-follow-up");
    if (proposal?.record.kind !== "task") throw new Error("expected a task");
    expect(proposal.record.title).toBe("Follow up on 1 silent quote");
    expect(proposal.record.description).toContain("BC-Q1");
    expect(proposal.record.description).not.toContain("BC-Q2");
    expect(proposal.record.description).toContain("nothing has been sent");
    expect(proposal.evidence[0]?.href).toBe("/orders/q1");
  });

  it("confirms bookings inside 24 hours and says no reminder was sent", () => {
    const [proposal] = pick(proposals, "appointment-reminder-24h");
    if (proposal?.record.kind !== "task") throw new Error("expected a task");
    expect(proposal.record.title).toBe("Confirm 1 booking in the next 24 hours");
    expect(proposal.record.description).toContain("Consultation");
    expect(proposal.record.description).toContain("no reminder has been sent");
    expect(proposal.evidence[0]?.label).toBe("Consultation");

    const past = fixtureContext({
      appointments: [
        appointment({ id: "a9", startsAt: `${addDays(TODAY, -2)}T10:00:00.000Z` }),
      ],
    });
    expect(pick(buildAutomationProposals(past, prefs()), "appointment-reminder-24h")).toEqual([]);
  });

  it("closes the cash day only when money moved and the session is still open", () => {
    const [proposal] = pick(proposals, "daily-cash-closing");
    if (proposal?.record.kind !== "task") throw new Error("expected a task");
    expect(proposal.record.title).toBe(`Close the cash session for ${TODAY}`);
    expect(proposal.record.description).toContain("Cash in:");
    expect(proposal.evidence.map((row) => row.label)).toEqual([
      "Cash in today",
      "Cash out today",
    ]);

    const closed = fixtureContext({
      cashMovements: [cashMovement({ amount: 1500 })],
      cashSessions: [cashSession({ closedAt: `${TODAY}T18:00:00.000Z` })],
    });
    expect(pick(buildAutomationProposals(closed, prefs()), "daily-cash-closing")).toEqual([]);

    const quietDay = fixtureContext({ cashSessions: [cashSession()] });
    expect(pick(buildAutomationProposals(quietDay, prefs()), "daily-cash-closing")).toEqual([]);
  });

  it("proposes nothing when the matching rule is switched off", () => {
    const ctx = busy();
    for (const id of ruleIds()) {
      const remaining = pick(buildAutomationProposals(ctx, disable(id)), id);
      expect(remaining).toEqual([]);
      expect(pick(buildAutomationProposals(ctx, enableOnly(id)), id).length).toBeGreaterThan(0);
    }
    expect(buildAutomationProposals(ctx, disable(...ruleIds()))).toEqual([]);
  });

  it("gives the same proposal id for the same data, whatever order it arrives in", () => {
    const first = buildAutomationProposals(busy(), prefs());
    const second = buildAutomationProposals(busy(), prefs());
    expect(first.map((proposal) => proposal.id)).toEqual(second.map((proposal) => proposal.id));

    // Reordering the rows cannot change the fingerprint.
    const swapped = fixtureContext({
      products: [
        product({ id: "p2", name: "House Beans 1kg", stock_qty: 0, low_stock_threshold: 4 }),
        product({ id: "p1", name: "Flat White", stock_qty: 2, low_stock_threshold: 10 }),
      ],
    });
    const idOf = (ctx: BusinessContext) =>
      pick(buildAutomationProposals(ctx, prefs()), "low-stock-draft-po")[0]?.id;
    expect(idOf(swapped)).toBe(idOf(busy()));
    expect(idOf(swapped)).toBe("low-stock-draft-po:p1|p2");
  });

  it("changes the id when the underlying data changes", () => {
    const ctx = fixtureContext({
      products: [product({ id: "p1", stock_qty: 2, low_stock_threshold: 10 })],
    });
    const [proposal] = pick(buildAutomationProposals(ctx, prefs()), "low-stock-draft-po");
    expect(proposal?.id).toBe("low-stock-draft-po:p1");
  });
});

describe("partitionProposals", () => {
  const proposals = buildAutomationProposals(busy(), prefs());
  const accepted = proposals[0] as AiActionProposal;
  const rejected = proposals[1] as AiActionProposal;

  it("leaves undecided proposals draft and pending", () => {
    const inbox = partitionProposals(proposals, prefs());
    expect(inbox.pending).toHaveLength(proposals.length);
    expect(inbox.handled).toEqual([]);
    expect(inbox.pending.every((proposal) => proposal.status === "draft")).toBe(true);
  });

  it("moves accepted and rejected proposals to history with the human's outcome", () => {
    const inbox = partitionProposals(
      proposals,
      prefs({
        handled: {
          [accepted.id]: {
            status: "accepted",
            at: "2026-04-01T07:00:00.000Z",
            outcomeHref: "/manager/productivity/tasks",
            outcomeLabel: "Open what was created",
          },
          [rejected.id]: { status: "rejected", at: "2026-04-01T07:01:00.000Z" },
        },
      }),
    );
    expect(inbox.pending.map((proposal) => proposal.id)).toEqual(
      proposals.slice(2).map((proposal) => proposal.id),
    );
    expect(inbox.handled.map((proposal) => proposal.status)).toEqual([
      "accepted",
      "rejected",
    ]);
    expect(inbox.handled[0]?.outcomeHref).toBe("/manager/productivity/tasks");
    expect(inbox.handled[1]?.outcomeLabel).toBeUndefined();
  });

  it("never returns a decided proposal to the inbox", () => {
    const decided = prefs({
      handled: { [accepted.id]: { status: "accepted", at: "2026-04-01T07:00:00.000Z" } },
    });
    for (let round = 0; round < 3; round += 1) {
      const inbox = partitionProposals(buildAutomationProposals(busy(), decided), decided);
      expect(inbox.pending.map((proposal) => proposal.id)).not.toContain(accepted.id);
      expect(inbox.handled.map((proposal) => proposal.id)).toContain(accepted.id);
    }
  });

  it("does not mutate the proposals it is given", () => {
    const before = JSON.stringify(proposals);
    partitionProposals(proposals, prefs({ handled: { [accepted.id]: { status: "rejected", at: "x" } } }));
    expect(JSON.stringify(proposals)).toBe(before);
  });
});

describe("recommendation proposals", () => {
  it("are addressable by insight id and are never owned by a rule", () => {
    const ctx = busy();
    const insights = buildInsights(ctx);
    const recommendations = buildRecommendations(ctx, insights);
    expect(recommendations.length).toBeGreaterThan(0);
    for (const rec of recommendations) {
      const proposal = toProposal(rec, new Date(GENERATED_AT));
      expect(proposal.id).toBe(`rec-${rec.insightId}`);
      expect(proposal.ruleId).toBeNull();
      expect(proposal.ruleName).toBeNull();
      expect(proposal.status).toBe("draft");
      expect(proposal.createdAt).toBe(GENERATED_AT);
      expect(proposal.actionHref).toBe(rec.href);
      expect(proposal.whatWillHappen).toContain("Adds one task");
      // The shape is closed: there is no field on a proposal that could mean
      // "sent somewhere", and a task/note record has no recipient either.
      expect(Object.keys(proposal).sort()).toEqual(PROPOSAL_KEYS);
      expect(Object.keys(proposal.record).sort()).toEqual(
        proposal.record.kind === "task" ? TASK_RECORD_KEYS : NOTE_RECORD_KEYS,
      );
    }
  });

  it("do not collide with automation proposal ids", () => {
    const ctx = busy();
    const fromRules = buildAutomationProposals(ctx, prefs()).map((proposal) => proposal.id);
    const fromRecs = buildRecommendations(ctx, buildInsights(ctx)).map(
      (rec) => `rec-${rec.insightId}`,
    );
    expect(fromRecs.length).toBeGreaterThan(0);
    expect(fromRecs.some((id) => fromRules.includes(id))).toBe(false);
  });
});
