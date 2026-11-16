import type { Customer, Order, Payment } from "@/types/database";
import type {
  CustomerComplaint,
  CustomerInteraction,
  CustomerReview,
  LoyaltyEntry,
  Membership,
} from "@/types/crm";
import type { Lead } from "@/types/operations";
import { localDayKey } from "@/lib/manager/time";
import { INTERACTION_TYPE_LABELS } from "@/types/crm";

/**
 * The Customer 360 stream.
 *
 * Nothing is stored here: every event is a projection of a record that already
 * exists elsewhere (Billing's orders and payments, the CRM's interactions,
 * reviews, complaints and ledger, the pipeline's leads). Reading the same rows
 * the modules write keeps the timeline honest — it cannot claim activity that
 * no module recorded.
 */

export const TIMELINE_EVENT_KINDS = [
  "bill",
  "payment",
  "interaction",
  "review",
  "complaint",
  "loyalty",
  "membership",
  "lead",
  "account",
] as const;

export type TimelineEventKind = (typeof TIMELINE_EVENT_KINDS)[number];

export type TimelineEvent = {
  /** Stable across renders so React never re-keys the same event. */
  key: string;
  kind: TimelineEventKind;
  at: string;
  title: string;
  detail: string | null;
  /** Signed for money movements; null when the event is not about an amount. */
  amount: number | null;
  /** In-app route for the record behind the event, when one is reachable. */
  href: string | null;
};

export type TimelineSource = {
  customer: Customer;
  orders: Order[];
  payments: Payment[];
  interactions: CustomerInteraction[];
  reviews: CustomerReview[];
  complaints: CustomerComplaint[];
  loyaltyLedger: LoyaltyEntry[];
  memberships: Membership[];
  /** Leads that already converted into this customer, so history survives. */
  leads: Lead[];
  staffById: Map<string, string>;
};

function staffName(staffById: Map<string, string>, id: string | null): string | null {
  return id ? staffById.get(id) ?? null : null;
}

function withOperator(title: string, name: string | null): string {
  return name ? `${title} — ${name}` : title;
}

function billEvents(source: TimelineSource): TimelineEvent[] {
  return source.orders
    .filter((order) => order.customer_id === source.customer.id)
    .map((order) => {
      const isCredit = order.order_kind === "credit_note";
      return {
        key: `bill:${order.id}`,
        kind: "bill" as const,
        at: order.created_at,
        title: `${isCredit ? "Credit note" : "Bill"} ${order.order_number}`,
        detail: [
          order.status,
          order.payment_status === "paid" ? null : `payment ${order.payment_status}`,
          order.notes,
        ]
          .filter(Boolean)
          .join(" · "),
        amount: order.grand_total,
        href: `/orders/${order.id}`,
      };
    });
}

function paymentEvents(source: TimelineSource): TimelineEvent[] {
  const orderNumbers = new Map(
    source.orders.map((order) => [order.id, order.order_number]),
  );
  const theirs = new Set(
    source.orders
      .filter((order) => order.customer_id === source.customer.id)
      .map((order) => order.id),
  );
  return source.payments
    .filter((payment) => theirs.has(payment.order_id))
    .map((payment) => ({
      key: `payment:${payment.id}`,
      kind: "payment" as const,
      at: payment.created_at,
      title: `Payment ${payment.status}`,
      detail: [
        payment.method,
        payment.split_label,
        orderNumbers.get(payment.order_id)
          ? `against ${orderNumbers.get(payment.order_id)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      amount: payment.amount,
      href: `/orders/${payment.order_id}`,
    }));
}

function interactionEvents(source: TimelineSource): TimelineEvent[] {
  return source.interactions
    .filter((i) => i.customer_id === source.customer.id)
    .map((i) => ({
      key: `interaction:${i.id}`,
      kind: "interaction" as const,
      at: i.occurred_at,
      title: withOperator(INTERACTION_TYPE_LABELS[i.type], staffName(source.staffById, i.staff_id)),
      detail: i.outcome ? `${i.summary} → ${i.outcome}` : i.summary,
      amount: null,
      href: `/customers/interactions?focus=${encodeURIComponent(i.id)}`,
    }));
}

function reviewEvents(source: TimelineSource): TimelineEvent[] {
  return source.reviews
    .filter((r) => r.customer_id === source.customer.id)
    .map((r) => ({
      key: `review:${r.id}`,
      kind: "review" as const,
      at: r.reviewed_at,
      title: `${r.rating}★ on ${r.source}`,
      detail: r.text,
      amount: null,
      href: `/customers/reviews?focus=${encodeURIComponent(r.id)}`,
    }));
}

function complaintEvents(source: TimelineSource): TimelineEvent[] {
  return source.complaints
    .filter((c) => c.customer_id === source.customer.id)
    .map((c) => ({
      key: `complaint:${c.id}`,
      kind: "complaint" as const,
      at: c.raised_at,
      title: `${c.status === "resolved" || c.status === "closed" ? "Complaint closed" : "Complaint"}: ${c.subject}`,
      detail: [`${c.severity} severity`, staffName(source.staffById, c.owner_staff_id), c.detail]
        .filter(Boolean)
        .join(" · "),
      amount: null,
      href: `/customers/reviews?tab=complaints&focus=${encodeURIComponent(c.id)}`,
    }));
}

function loyaltyEvents(source: TimelineSource): TimelineEvent[] {
  return source.loyaltyLedger
    .filter((e) => e.customer_id === source.customer.id)
    .map((e) => ({
      key: `loyalty:${e.id}`,
      kind: "loyalty" as const,
      at: e.created_at,
      title:
        e.kind === "earn"
          ? `Earned ${e.points} points`
          : e.kind === "bonus"
            ? `Bonus ${e.points} points`
            : e.kind === "redeem"
              ? `Redeemed ${Math.abs(e.points)} points`
              : e.kind === "expire"
                ? `${Math.abs(e.points)} points lapsed`
                : `Adjusted ${e.points} points`,
      detail: e.reason,
      amount: null,
      href: `/customers/loyalty?customer=${encodeURIComponent(source.customer.id)}`,
    }));
}

function membershipEvents(source: TimelineSource): TimelineEvent[] {
  return source.memberships
    .filter((m) => m.customer_id === source.customer.id)
    .map((m) => ({
      key: `membership:${m.id}`,
      kind: "membership" as const,
      at: m.started_at,
      title: `${m.status === "active" ? "Member" : `Membership ${m.status}`} · ${m.tier_id}`,
      detail: m.notes,
      amount: null,
      href: `/customers/loyalty?tab=memberships`,
    }));
}

function leadEvents(source: TimelineSource): TimelineEvent[] {
  return source.leads
    .filter((lead) => lead.converted_customer_id === source.customer.id)
    .map((lead) => ({
      key: `lead:${lead.id}`,
      kind: "lead" as const,
      at: lead.converted_at ?? lead.created_at,
      title: `Converted from enquiry: ${lead.requirement}`,
      detail: [
        lead.source ? `via ${lead.source}` : null,
        lead.quotation_number ? `quote ${lead.quotation_number}` : null,
        `enquiry ${lead.created_at.slice(0, 10)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      amount: lead.estimated_value,
      href: `/customers/leads?focus=${encodeURIComponent(lead.id)}`,
    }));
}

function accountEvents(source: TimelineSource): TimelineEvent[] {
  if (!source.customer.created_at) return [];
  return [
    {
      key: `account:${source.customer.id}`,
      kind: "account" as const,
      at: source.customer.created_at,
      title: "Customer added",
      detail: source.customer.source ? `Source: ${source.customer.source}` : null,
      amount: null,
      href: null,
    },
  ];
}

/** Newest first — the order the 360 page renders. */
export function buildTimeline(source: TimelineSource): TimelineEvent[] {
  return [
    ...billEvents(source),
    ...paymentEvents(source),
    ...interactionEvents(source),
    ...reviewEvents(source),
    ...complaintEvents(source),
    ...loyaltyEvents(source),
    ...membershipEvents(source),
    ...leadEvents(source),
    ...accountEvents(source),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export type TimelineDay = {
  dayKey: string;
  events: TimelineEvent[];
};

/** Chunk the stream into local calendar days so the page can date each block. */
export function groupByDay(events: TimelineEvent[]): TimelineDay[] {
  const days: TimelineDay[] = [];
  let current: TimelineDay | null = null;
  for (const event of events) {
    const key = localDayKey(new Date(event.at));
    if (!current || current.dayKey !== key) {
      current = { dayKey: key, events: [] };
      days.push(current);
    }
    current.events.push(event);
  }
  return days;
}

export type TimelineCounts = Record<TimelineEventKind, number>;

/** Per-kind tallies, so the 360 filters can grey out empty streams. */
export function countByKind(events: TimelineEvent[]): TimelineCounts {
  const counts = Object.fromEntries(
    TIMELINE_EVENT_KINDS.map((kind) => [kind, 0]),
  ) as TimelineCounts;
  for (const event of events) counts[event.kind] += 1;
  return counts;
}

export function filterByKind(
  events: TimelineEvent[],
  kinds: TimelineEventKind[],
): TimelineEvent[] {
  if (kinds.length === 0) return events;
  const allowed = new Set(kinds);
  return events.filter((e) => allowed.has(e.kind));
}
