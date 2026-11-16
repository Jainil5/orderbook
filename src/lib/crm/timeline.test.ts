process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import type { Customer, Order, Payment } from "@/types/database";
import type {
  CustomerComplaint,
  CustomerInteraction,
  CustomerReview,
  LoyaltyEntry,
  Membership,
} from "@/types/crm";
import type { Lead } from "@/types/operations";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { DEMO_BRAND_CODES } from "@/lib/workspace/constants";
import {
  TIMELINE_EVENT_KINDS,
  buildTimeline,
  countByKind,
  filterByKind,
  groupByDay,
  type TimelineSource,
} from "./timeline";

const ANJALI: Customer = {
  id: "c1",
  brand_id: "b1",
  name: "Anjali Shah",
  email: "anjali@example.in",
  phone: "+91 98250 11111",
  created_at: "2026-01-05T10:00:00.000Z",
  source: "Instagram",
};

function source(over: Partial<TimelineSource> = {}): TimelineSource {
  const orders: Order[] = [
    {
      id: "o1",
      brand_id: "b1",
      order_number: "BC-1041",
      status: "completed",
      payment_status: "paid",
      customer_id: "c1",
      customer_name_snapshot: "Anjali Shah",
      subtotal: 900,
      discount_total: 0,
      tax_total: 0,
      fees_total: 0,
      grand_total: 900,
      notes: null,
      created_at: "2026-11-10T04:00:00.000Z",
    },
    {
      id: "o2",
      brand_id: "b1",
      order_number: "BC-1042",
      status: "completed",
      payment_status: "partial",
      customer_id: "c1",
      customer_name_snapshot: "Anjali Shah",
      subtotal: 1500,
      discount_total: 0,
      tax_total: 0,
      fees_total: 0,
      grand_total: 1500,
      notes: "Rooftop table",
      created_at: "2026-11-14T04:00:00.000Z",
      amount_paid: 500,
    },
    {
      id: "o3",
      brand_id: "b1",
      order_number: "CN-1042",
      status: "refunded",
      payment_status: "refunded",
      customer_id: "c1",
      customer_name_snapshot: "Anjali Shah",
      subtotal: -300,
      discount_total: 0,
      tax_total: 0,
      fees_total: 0,
      grand_total: -300,
      notes: null,
      created_at: "2026-11-15T04:00:00.000Z",
      order_kind: "credit_note",
      parent_order_id: "o2",
    },
    {
      id: "o9",
      brand_id: "b1",
      order_number: "BC-1099",
      status: "completed",
      payment_status: "paid",
      customer_id: "c2",
      customer_name_snapshot: "Someone Else",
      subtotal: 400,
      discount_total: 0,
      tax_total: 0,
      fees_total: 0,
      grand_total: 400,
      notes: null,
      created_at: "2026-11-13T04:00:00.000Z",
    },
  ];
  const payments: Payment[] = [
    { id: "pm1", brand_id: "b1", order_id: "o2", amount: 500, method: "UPI", status: "partial", created_at: "2026-11-14T05:00:00.000Z" },
    { id: "pm9", brand_id: "b1", order_id: "o9", amount: 400, method: "Cash", status: "paid", created_at: "2026-11-13T05:00:00.000Z" },
  ];
  const interactions: CustomerInteraction[] = [
    {
      id: "i1",
      brand_id: "b1",
      customer_id: "c1",
      lead_id: null,
      type: "call",
      summary: "Confirmed the table",
      detail: null,
      occurred_at: "2026-11-09T10:00:00.000Z",
      staff_id: "s1",
      outcome: "Six seats held",
      next_follow_up_at: null,
      task_id: null,
      attachment_url: null,
    },
    {
      id: "i9",
      brand_id: "b1",
      customer_id: "c2",
      lead_id: null,
      type: "note",
      summary: "Not ours",
      detail: null,
      occurred_at: "2026-11-09T10:00:00.000Z",
      staff_id: null,
      outcome: null,
      next_follow_up_at: null,
      task_id: null,
      attachment_url: null,
    },
  ];
  const reviews: CustomerReview[] = [
    {
      id: "r1",
      brand_id: "b1",
      customer_id: "c1",
      source: "Google Business Profile",
      rating: 4,
      text: "Lovely evening",
      reviewed_at: "2026-11-12T10:00:00.000Z",
      response_text: null,
      responded_at: null,
      sentiment: "positive",
      tags: [],
      staff_mentioned: null,
      internal_notes: null,
      status: "new",
      complaint_id: null,
    },
  ];
  const complaints: CustomerComplaint[] = [
    {
      id: "cp1",
      brand_id: "b1",
      customer_id: "c1",
      review_id: null,
      interaction_id: null,
      subject: "Dessert was wrong",
      detail: "Ordered kulfi, got brownie",
      severity: "low",
      status: "open",
      owner_staff_id: "s1",
      raised_at: "2026-11-11T10:00:00.000Z",
      resolved_at: null,
    },
    {
      id: "cp2",
      brand_id: "b1",
      customer_id: "c1",
      review_id: null,
      interaction_id: null,
      subject: "Old noise complaint",
      detail: null,
      severity: "medium",
      status: "closed",
      owner_staff_id: null,
      raised_at: "2026-03-02T10:00:00.000Z",
      resolved_at: "2026-03-04T10:00:00.000Z",
    },
  ];
  const loyaltyLedger: LoyaltyEntry[] = [
    { id: "ly1", brand_id: "b1", customer_id: "c1", kind: "earn", points: 45, reason: "Bill BC-1041", order_id: "o1", expires_at: null, created_at: "2026-11-10T04:30:00.000Z" },
    { id: "ly2", brand_id: "b1", customer_id: "c1", kind: "redeem", points: -20, reason: "Coffee voucher", order_id: null, expires_at: null, created_at: "2026-11-14T04:30:00.000Z" },
    { id: "ly9", brand_id: "b1", customer_id: "c2", kind: "earn", points: 10, reason: "Other", order_id: null, expires_at: null, created_at: "2026-11-14T04:30:00.000Z" },
  ];
  const memberships: Membership[] = [
    {
      id: "m1",
      brand_id: "b1",
      customer_id: "c1",
      tier_id: "silver",
      started_at: "2026-02-01T10:00:00.000Z",
      expires_at: null,
      status: "active",
      notes: "Joined at the roastery launch",
    },
  ];
  const leads: Lead[] = [
    {
      id: "l1",
      brand_id: "b1",
      contact_name: "Anjali Shah",
      phone: "+91 98250 11111",
      email: "anjali@example.in",
      source: "Instagram",
      requirement: "Table for six every Friday",
      site_address: null,
      stage: "won",
      estimated_value: 40000,
      owner_staff_id: null,
      next_action_at: null,
      quotation_number: "BC-Q-100",
      created_at: "2026-01-02T10:00:00.000Z",
      converted_customer_id: "c1",
      converted_at: "2026-01-05T10:00:00.000Z",
    },
    {
      id: "l2",
      brand_id: "b1",
      contact_name: "Anon",
      phone: null,
      email: null,
      source: null,
      requirement: "Still a stranger",
      site_address: null,
      stage: "new",
      estimated_value: 1000,
      owner_staff_id: null,
      next_action_at: null,
      quotation_number: null,
      created_at: "2026-11-01T10:00:00.000Z",
    },
  ];

  return {
    customer: ANJALI,
    orders,
    payments,
    interactions,
    reviews,
    complaints,
    loyaltyLedger,
    memberships,
    leads,
    staffById: new Map([["s1", "Nikhil"]]),
    ...over,
  };
}

describe("buildTimeline", () => {
  const events = buildTimeline(source());

  it("reads newest first", () => {
    const stamps = events.map((e) => new Date(e.at).getTime());
    expect([...stamps].sort((a, b) => b - a)).toEqual(stamps);
  });

  it("shows one key per record, never a duplicate", () => {
    expect(new Set(events.map((e) => e.key)).size).toBe(events.length);
  });

  it("keeps other customers' records out", () => {
    const ids = events.map((e) => e.key);
    expect(ids).not.toContain("bill:o9");
    expect(ids).not.toContain("payment:pm9");
    expect(ids).not.toContain("interaction:i9");
    expect(ids).not.toContain("loyalty:ly9");
    expect(ids).not.toContain("lead:l2");
  });

  it("names every bill by its number and flags a credit note", () => {
    expect(events.find((e) => e.key === "bill:o1")?.title).toBe("Bill BC-1041");
    const credit = events.find((e) => e.key === "bill:o3");
    expect(credit?.title).toBe("Credit note CN-1042");
    expect(credit?.amount).toBe(-300);
  });

  it("shows an unpaid balance in the bill detail", () => {
    expect(events.find((e) => e.key === "bill:o2")?.detail).toContain("payment partial");
    expect(events.find((e) => e.key === "bill:o1")?.detail).toBe("completed");
  });

  it("links a payment to the bill it settled", () => {
    const payment = events.find((e) => e.key === "payment:pm1");
    expect(payment?.title).toBe("Payment partial");
    expect(payment?.detail).toBe("UPI · against BC-1042");
  });

  it("signs the interaction with whoever took it", () => {
    expect(events.find((e) => e.key === "interaction:i1")?.title).toBe("Phone call — Nikhil");
    expect(events.find((e) => e.key === "interaction:i1")?.detail).toBe("Confirmed the table → Six seats held");
  });

  it("distinguishes a live complaint from one that has been closed", () => {
    expect(events.find((e) => e.key === "complaint:cp1")?.title).toBe("Complaint: Dessert was wrong");
    expect(events.find((e) => e.key === "complaint:cp2")?.title).toBe("Complaint closed: Old noise complaint");
  });

  it("words each loyalty movement the way the ledger means it", () => {
    expect(events.find((e) => e.key === "loyalty:ly1")?.title).toBe("Earned 45 points");
    expect(events.find((e) => e.key === "loyalty:ly2")?.title).toBe("Redeemed 20 points");
  });

  it("carries the enquiry a converted customer came from", () => {
    const lead = events.find((e) => e.key === "lead:l1");
    expect(lead?.title).toBe("Converted from enquiry: Table for six every Friday");
    expect(lead?.detail).toBe("via Instagram · quote BC-Q-100 · enquiry 2026-01-02");
    expect(lead?.at).toBe("2026-01-05T10:00:00.000Z");
  });

  it("opens with the account itself when nothing else has happened", () => {
    const quiet = buildTimeline(
      source({ orders: [], payments: [], interactions: [], reviews: [], complaints: [], loyaltyLedger: [], memberships: [], leads: [] }),
    );
    expect(quiet).toHaveLength(1);
    expect(quiet[0]).toMatchObject({ kind: "account", title: "Customer added", href: null });
  });

  it("gives every event a route a person can click, or none", () => {
    for (const event of events) {
      if (event.href !== null) expect(event.href.startsWith("/")).toBe(true);
    }
  });
});

describe("groupByDay", () => {
  it("chunks the stream into local calendar days", () => {
    const days = groupByDay(buildTimeline(source()));
    expect(days.map((d) => d.dayKey)).toEqual([
      "2026-11-15",
      "2026-11-14",
      "2026-11-12",
      "2026-11-11",
      "2026-11-10",
      "2026-11-09",
      "2026-03-02",
      "2026-02-01",
      "2026-01-05",
    ]);
    expect(days[0].events.map((e) => e.key)).toEqual(["bill:o3"]);
  });

  it("puts the events of one day together in stream order", () => {
    const fourteen = groupByDay(buildTimeline(source())).find((d) => d.dayKey === "2026-11-14");
    expect(fourteen?.events.map((e) => e.key)).toEqual([
      "payment:pm1",
      "loyalty:ly2",
      "bill:o2",
    ]);
  });

  it("handles an empty stream", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("counts and filters", () => {
  const events = buildTimeline(source());

  it("tallies every kind it knows", () => {
    const counts = countByKind(events);
    expect(Object.keys(counts).sort()).toEqual([...TIMELINE_EVENT_KINDS].sort());
    expect(counts.bill).toBe(3);
    expect(counts.payment).toBe(1);
    expect(counts.loyalty).toBe(2);
    expect(counts.lead).toBe(1);
    expect(counts.membership).toBe(1);
    expect(counts.account).toBe(1);
  });

  it("sums to the length of the stream", () => {
    const total = TIMELINE_EVENT_KINDS.reduce((sum, k) => sum + countByKind(events)[k], 0);
    expect(total).toBe(events.length);
  });

  it("keeps only the kinds the user switched on", () => {
    expect(filterByKind(events, ["bill", "payment"]).every((e) => ["bill", "payment"].includes(e.kind))).toBe(true);
    expect(filterByKind(events, ["bill"])).toHaveLength(3);
  });

  it("treats an empty selection as no filter at all", () => {
    expect(filterByKind(events, [])).toEqual(events);
  });
});

describe("the seeded customer 360", () => {
  it("has something to show for every demo customer", () => {
    for (const code of DEMO_BRAND_CODES) {
      const pack = getDemoBrandPack(code);
      const staffById = new Map(pack.staff.map((s) => [s.id, s.name]));
      const withHistory = pack.customers.filter((customer) => {
        const events = buildTimeline({
          customer,
          orders: pack.orders,
          payments: pack.payments,
          interactions: pack.interactions,
          reviews: pack.reviews,
          complaints: pack.complaints,
          loyaltyLedger: pack.loyaltyLedger,
          memberships: pack.memberships,
          leads: pack.leads,
          staffById,
        });
        return events.length > 1;
      });
      expect(withHistory.length, code).toBeGreaterThan(1);
    }
  });

  it("never leaks a row from another brand", () => {
    for (const code of DEMO_BRAND_CODES) {
      const pack = getDemoBrandPack(code);
      const staffById = new Map(pack.staff.map((s) => [s.id, s.name]));
      for (const customer of pack.customers) {
        const events = buildTimeline({
          customer,
          orders: pack.orders,
          payments: pack.payments,
          interactions: pack.interactions,
          reviews: pack.reviews,
          complaints: pack.complaints,
          loyaltyLedger: pack.loyaltyLedger,
          memberships: pack.memberships,
          leads: pack.leads,
          staffById,
        });
        const ids = new Set([
          ...pack.orders.filter((o) => o.customer_id === customer.id).map((o) => `bill:${o.id}`),
          ...pack.interactions.filter((i) => i.customer_id === customer.id).map((i) => `interaction:${i.id}`),
        ]);
        for (const event of events) {
          if (event.kind === "bill" || event.kind === "interaction") {
            expect(ids.has(event.key), `${code} ${customer.id} ${event.key}`).toBe(true);
          }
        }
      }
    }
  });

  it("links each converted lead to exactly one customer", () => {
    const pack = getDemoBrandPack("BR-2");
    const staffById = new Map(pack.staff.map((s) => [s.id, s.name]));
    const converted = pack.leads.filter((l) => l.converted_customer_id);
    expect(converted.length).toBeGreaterThan(0);
    const customerIds = new Set(pack.customers.map((c) => c.id));
    for (const lead of converted) {
      expect(customerIds.has(lead.converted_customer_id!)).toBe(true);
      const owner = pack.customers.find((c) => c.id === lead.converted_customer_id)!;
      const events = buildTimeline({
        customer: owner,
        orders: [],
        payments: [],
        interactions: [],
        reviews: [],
        complaints: [],
        loyaltyLedger: [],
        memberships: [],
        leads: pack.leads,
        staffById,
      });
      expect(events.map((e) => e.key)).toContain(`lead:${lead.id}`);
    }
  });
});
