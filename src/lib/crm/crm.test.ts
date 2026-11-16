import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { Customer, Order } from "@/types/database";
import { LEAD_STAGES } from "@/types/crm";
import type {
  CampaignRecipient,
  Complaint,
  CustomerSegment,
  Interaction,
  Lead,
  LoyaltyTransaction,
  MarketingCampaign,
  Review,
} from "@/types/crm";
import {
  analyzeReviews,
  classifyReviewSentiment,
  computeCrmOverview,
  computeCustomerStats,
  expiringPointsReport,
  findDuplicateCustomers,
  followUpTaskDraft,
  loyaltyConfigFor,
  pointsForOrder,
  redemptionValue,
  segmentCustomerIds,
  tierForLifetimePoints,
} from "@/lib/crm/metrics";
import { DEFAULT_LOYALTY_CONFIG } from "@/lib/crm/metrics";
import {
  consentedCustomerIds,
  planCampaignRecipients,
  recountCampaign,
} from "@/lib/crm/loader";

/**
 * The CRM must be reproducible: every number below comes from a pinned
 * `asOf`, so a failure means the logic changed, not that time passed.
 */

const AS_OF = "2026-06-15T09:00:00.000Z";
const BRAND = "brand-a";

function customer(overrides: Partial<Customer> & { id: string }): Customer {
  return {
    brand_id: BRAND,
    name: overrides.id,
    email: null,
    phone: null,
    ...overrides,
  };
}

function order(
  overrides: Partial<Order> & { id: string; customer_id: string },
): Order {
  return {
    brand_id: BRAND,
    order_number: `O-${overrides.id}`,
    status: "completed",
    payment_status: "paid",
    customer_name_snapshot: null,
    subtotal: 1000,
    discount_total: 0,
    tax_total: 0,
    fees_total: 0,
    grand_total: 1000,
    notes: null,
    created_at: "2026-05-01T10:00:00.000Z",
    amount_paid: 1000,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* customer stats                                                      */
/* ------------------------------------------------------------------ */

describe("computeCustomerStats", () => {
  const customers = [
    customer({ id: "c1", name: "Regular" }),
    customer({ id: "c2", name: "New", created_at: "2026-06-10T00:00:00.000Z" }),
    customer({ id: "c3", name: "Dormant" }),
    customer({ id: "c4", name: "Archived", status: "archived" }),
  ];
  const orders = [
    order({ id: "o1", customer_id: "c1", created_at: "2026-01-10T00:00:00.000Z" }),
    order({
      id: "o2",
      customer_id: "c1",
      created_at: "2026-06-01T00:00:00.000Z",
      grand_total: 2500,
      amount_paid: 1000,
      payment_status: "partial",
    }),
    // Draft quotes are never spend.
    order({
      id: "o3",
      customer_id: "c2",
      status: "draft",
      grand_total: 9999,
      created_at: "2026-06-12T00:00:00.000Z",
      amount_paid: 0,
    }),
    order({
      id: "o4",
      customer_id: "c3",
      created_at: "2026-01-01T00:00:00.000Z",
      grand_total: 500,
      amount_paid: 500,
    }),
  ];

  const stats = computeCustomerStats({ customers, orders, asOf: AS_OF });
  const byId = new Map(stats.map((s) => [s.customerId, s]));

  it("counts only confirmed/completed orders as spend", () => {
    expect(byId.get("c1")?.totalOrders).toBe(2);
    expect(byId.get("c1")?.totalSpend).toBe(3500);
    expect(byId.get("c1")?.avgOrderValue).toBe(1750);
    expect(byId.get("c2")?.totalOrders).toBe(0);
    expect(byId.get("c2")?.totalSpend).toBe(0);
  });

  it("derives status from recency, with explicit archived winning", () => {
    expect(byId.get("c1")?.status).toBe("active"); // last purchase 14 days ago
    expect(byId.get("c3")?.status).toBe("inactive"); // 165 days ago
    expect(byId.get("c4")?.status).toBe("archived"); // stored value, not derived
    expect(byId.get("c1")?.isReturning).toBe(true);
    expect(byId.get("c3")?.isReturning).toBe(false);
  });

  it("calls a customer new inside the new window", () => {
    // c2 has no spend but a customer record 5 days old.
    expect(byId.get("c2")?.isNew).toBe(true);
    expect(byId.get("c1")?.isNew).toBe(false);
  });

  it("dues are grand total minus amount paid on unsettled spend orders", () => {
    expect(byId.get("c1")?.outstandingDues).toBe(1500);
    expect(byId.get("c2")?.outstandingDues).toBe(0); // draft excluded
    expect(byId.get("c3")?.outstandingDues).toBe(0);
  });

  it("lifetime value is total spend (documented rule)", () => {
    expect(byId.get("c1")?.lifetimeValue).toBe(byId.get("c1")?.totalSpend);
  });

  it("is deterministic — same inputs, same output object", () => {
    expect(computeCustomerStats({ customers, orders, asOf: AS_OF })).toEqual(
      stats,
    );
  });
});

/* ------------------------------------------------------------------ */
/* overview                                                            */
/* ------------------------------------------------------------------ */

describe("computeCrmOverview", () => {
  const lead = (overrides: Partial<Lead> & { id: string; stage: Lead["stage"] }): Lead => ({
    brand_id: BRAND,
    name: overrides.id,
    company: null,
    phone: null,
    email: null,
    source: null,
    estimated_value: 0,
    assigned_staff_id: null,
    next_follow_up_at: null,
    notes: null,
    lost_reason: null,
    customer_id: null,
    converted_at: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  });

  const campaigns: MarketingCampaign[] = [
    {
      id: "camp-1",
      brand_id: BRAND,
      name: "Monsoon",
      description: null,
      type: "offer",
      channel: "whatsapp",
      segment_id: null,
      offer_id: null,
      status: "active",
      start_date: "2026-05-01",
      end_date: null,
      consent_only: true,
      targeted_count: 10,
      marked_sent_count: 4,
      response_count: 2,
      redemption_count: 1,
      revenue_attributed: 1200,
      created_at: "2026-04-20T00:00:00.000Z",
      updated_at: "2026-04-20T00:00:00.000Z",
    },
    {
      id: "camp-2",
      brand_id: BRAND,
      name: "Draft one",
      description: null,
      type: "announcement",
      channel: "email",
      segment_id: null,
      offer_id: null,
      status: "draft",
      start_date: "2026-06-01",
      end_date: null,
      consent_only: true,
      targeted_count: 0,
      marked_sent_count: 0,
      response_count: 0,
      redemption_count: 0,
      revenue_attributed: 0,
      created_at: "2026-05-20T00:00:00.000Z",
      updated_at: "2026-05-20T00:00:00.000Z",
    },
  ];

  const input = {
    customers: [customer({ id: "c1" })],
    orders: [order({ id: "o1", customer_id: "c1" })],
    leads: [
      lead({ id: "l1", stage: "won" }),
      lead({ id: "l2", stage: "lost" }),
      lead({ id: "l3", stage: "lost" }),
      lead({ id: "l4", stage: "new", next_follow_up_at: "2026-06-16T00:00:00.000Z" }),
      lead({ id: "l5", stage: "new", next_follow_up_at: "2027-01-01T00:00:00.000Z" }),
    ],
    campaigns,
    interactions: [
      {
        id: "i1",
        brand_id: BRAND,
        customer_id: "c1",
        lead_id: null,
        type: "call",
        subject: "Callback",
        description: "Wants a quote",
        occurred_at: "2026-06-10T00:00:00.000Z",
        staff_id: null,
        outcome: null,
        next_follow_up_at: "2026-06-17T00:00:00.000Z",
        attachments: null,
        task_id: null,
        created_at: "2026-06-10T00:00:00.000Z",
      } as Interaction,
    ],
    reviews: [
      {
        id: "r1",
        brand_id: BRAND,
        source: "google",
        rating: 5,
        text: "Loved it",
        reviewer_name: null,
        customer_id: "c1",
        review_date: "2026-06-01T00:00:00.000Z",
        sentiment: null,
        tags: [],
        response_status: "unanswered",
        response_text: null,
        responded_at: null,
        internal_notes: null,
        staff_mentioned: null,
        complaint_id: null,
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
      } as Review,
    ],
    complaints: [
      {
        id: "cp1",
        brand_id: BRAND,
        customer_id: "c1",
        lead_id: null,
        review_id: null,
        interaction_id: null,
        subject: "Late delivery",
        description: null,
        severity: "high",
        status: "open",
        assigned_staff_id: null,
        resolution_notes: null,
        opened_at: "2026-06-05T00:00:00.000Z",
        resolved_at: null,
        created_at: "2026-06-05T00:00:00.000Z",
        updated_at: "2026-06-05T00:00:00.000Z",
      } as Complaint,
    ],
    asOf: AS_OF,
  };

  const overview = computeCrmOverview(input);

  it("counts leads by stage and conversion over closed deals only", () => {
    expect(overview.leadsByStage.lost).toBe(2);
    expect(overview.totals.totalLeads).toBe(5);
    // 1 won of 3 closed = 33.33%
    expect(overview.totals.leadConversionRate).toBe(33.33);
  });

  it("returns exactly six stable month buckets ending at asOf", () => {
    expect(overview.acquisitionTrend.map((m) => m.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });

  it("follow-ups are due inside the horizon, not beyond it", () => {
    expect(overview.followUpsDue.leads.map((l) => l.id)).toEqual(["l4"]);
    expect(overview.followUpsDue.interactions.map((i) => i.id)).toEqual(["i1"]);
    expect(overview.followUpsDue.complaints.map((c) => c.id)).toEqual(["cp1"]);
  });

  it("campaign performance only includes active or completed campaigns", () => {
    expect(overview.campaignPerformance.map((c) => c.id)).toEqual(["camp-1"]);
  });

  it("is deterministic", () => {
    expect(computeCrmOverview(input)).toEqual(overview);
  });
});

/* ------------------------------------------------------------------ */
/* segments                                                            */
/* ------------------------------------------------------------------ */

describe("segmentCustomerIds", () => {
  const customers = [
    customer({ id: "vip", name: "VIP", tags: ["wholesale"], marketing_consent: "granted" }),
    customer({ id: "lapsed", name: "Lapsed" }),
    customer({ id: "fresh", name: "Fresh" }),
    customer({ id: "ghost", name: "No orders" }),
    customer({ id: "archived", name: "Archived", status: "archived" }),
  ];
  const orders = [
    order({ id: "o1", customer_id: "vip", created_at: "2026-01-01T00:00:00.000Z" }),
    order({
      id: "o2",
      customer_id: "vip",
      created_at: "2026-06-10T00:00:00.000Z",
      grand_total: 9000,
      amount_paid: 9000,
    }),
    order({ id: "o3", customer_id: "lapsed", created_at: "2026-01-01T00:00:00.000Z" }),
    order({ id: "o4", customer_id: "fresh", created_at: "2026-06-14T00:00:00.000Z" }),
  ];
  const stats = computeCustomerStats({ customers, orders, asOf: AS_OF });

  const dynamic = (
    id: string,
    rules: CustomerSegment["rules"],
  ): CustomerSegment => ({
    id,
    brand_id: BRAND,
    name: id,
    description: null,
    kind: "dynamic",
    rules,
    manual_customer_ids: [],
    created_at: AS_OF,
    updated_at: AS_OF,
  });

  const data = { customers, stats };

  it("matches an order-count rule and excludes archived customers", () => {
    expect(segmentCustomerIds(dynamic("multi", { minOrders: 2 }), data, AS_OF)).toEqual(
      ["vip"],
    );
  });

  it("applies recency windows from asOf", () => {
    expect(
      segmentCustomerIds(dynamic("hot", { lastPurchaseWithinDays: 7 }), data, AS_OF),
    ).toEqual(["vip", "fresh"]);
    expect(
      segmentCustomerIds(dynamic("winback", { lastPurchaseOverDays: 90 }), data, AS_OF),
    ).toEqual(["lapsed"]);
  });

  it("a customer with no purchase history never matches a date window", () => {
    const ids = segmentCustomerIds(dynamic("any", { minOrders: 0 }), data, AS_OF);
    expect(ids).toContain("ghost");
    expect(
      segmentCustomerIds(dynamic("winback", { minOrders: 0, lastPurchaseOverDays: 90 }), data, AS_OF),
    ).not.toContain("ghost");
  });

  it("combines rules with AND", () => {
    expect(
      segmentCustomerIds(
        dynamic("combo", { minOrders: 2, tagsAny: ["wholesale"], lastPurchaseWithinDays: 7 }),
        data,
        AS_OF,
      ),
    ).toEqual(["vip"]);
    expect(
      segmentCustomerIds(dynamic("impossible", { minOrders: 2, maxOrders: 1 }), data, AS_OF),
    ).toEqual([]);
  });

  it("an empty rule set matches nobody — safer than matching everyone", () => {
    expect(segmentCustomerIds(dynamic("blank", {}), data, AS_OF)).toEqual([]);
    expect(segmentCustomerIds(dynamic("nulls", { minOrders: null }), data, AS_OF)).toEqual([]);
  });

  it("manual segments return stored ids minus archived", () => {
    const manual: CustomerSegment = {
      ...dynamic("hand", {}),
      kind: "manual",
      manual_customer_ids: ["vip", "archived", "gone"],
    };
    expect(segmentCustomerIds(manual, data, AS_OF)).toEqual(["vip"]);
  });
});

/* ------------------------------------------------------------------ */
/* reviews                                                             */
/* ------------------------------------------------------------------ */

describe("review intelligence", () => {
  const review = (overrides: Partial<Review> & { id: string; rating: number }): Review => ({
    brand_id: BRAND,
    source: "google",
    text: "text",
    reviewer_name: null,
    customer_id: null,
    review_date: "2026-06-01T00:00:00.000Z",
    sentiment: null,
    tags: [],
    response_status: "unanswered",
    response_text: null,
    responded_at: null,
    internal_notes: null,
    staff_mentioned: null,
    complaint_id: null,
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-01T00:00:00.000Z",
    ...overrides,
  });

  const reviews = [
    review({ id: "r1", rating: 5, tags: ["staff"], staff_mentioned: "Priya" }),
    review({ id: "r2", rating: 4, tags: ["taste"], staff_mentioned: "Priya" }),
    review({ id: "r3", rating: 3 }),
    review({ id: "r4", rating: 1, tags: ["delivery"], source: "whatsapp", response_status: "escalated" }),
    review({ id: "r5", rating: 2, tags: ["delivery"], review_date: "2026-01-05T00:00:00.000Z" }),
    review({ id: "r6", rating: 5, sentiment: "negative", tags: ["staff"] }),
  ];

  it("stars decide sentiment, but a human's stored value always wins", () => {
    expect(classifyReviewSentiment(review({ id: "x", rating: 5 }))).toBe("positive");
    expect(classifyReviewSentiment(review({ id: "x", rating: 3 }))).toBe("neutral");
    expect(classifyReviewSentiment(review({ id: "x", rating: 2 }))).toBe("negative");
    expect(classifyReviewSentiment(reviews[5])).toBe("negative");
  });

  const intel = analyzeReviews(reviews, { asOf: AS_OF });

  it("summarises distribution, sentiment and response states", () => {
    expect(intel.distribution).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 2 });
    expect(intel.sentimentCounts).toEqual({ positive: 2, neutral: 1, negative: 3 });
    expect(intel.unanswered).toBe(5);
    expect(intel.escalated).toBe(1);
    expect(intel.average).toBe(3.33);
  });

  it("surfaces complaint tags and staff attribution", () => {
    expect(intel.commonComplaintTags[0]).toEqual({ tag: "delivery", count: 2 });
    expect(intel.praisedTags.map((t) => t.tag)).toContain("staff");
    expect(intel.staffMentions.find((s) => s.staff === "Priya")).toEqual({
      staff: "Priya",
      positive: 2,
      negative: 0,
    });
  });

  it("buckets the trend by month, oldest first, ending at asOf", () => {
    expect(intel.monthlyTrend.map((m) => m.month)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
    expect(intel.monthlyTrend[0]).toEqual({
      month: "2026-01",
      count: 1,
      average: 2,
    });
    expect(intel.monthlyTrend[1].count).toBe(0);
    expect(intel.monthlyTrend[1].average).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* duplicates, follow-up drafts                                        */
/* ------------------------------------------------------------------ */

describe("findDuplicateCustomers", () => {
  it("matches on the last ten phone digits and on case-insensitive email", () => {
    const groups = findDuplicateCustomers([
      customer({ id: "a", phone: "+91 98200 12345", email: "Me@X.com" }),
      customer({ id: "b", phone: "9820012345", email: "me@x.com" }),
      customer({ id: "c", phone: "98200 12346", email: "other@x.com" }),
    ]);
    expect(groups.map((g) => g.reason).sort()).toEqual(["email", "phone"]);
    expect(groups.find((g) => g.reason === "phone")?.customerIds).toEqual(["a", "b"]);
    expect(groups.find((g) => g.reason === "email")?.customerIds).toEqual(["a", "b"]);
  });

  it("ignores blank and short contact details", () => {
    expect(
      findDuplicateCustomers([
        customer({ id: "a", phone: null, email: null }),
        customer({ id: "b", phone: null, email: null }),
        customer({ id: "c", phone: "123", email: "" }),
      ]),
    ).toEqual([]);
  });
});

describe("followUpTaskDraft", () => {
  it("only drafts a task when a follow-up date exists", () => {
    const base: Interaction = {
      id: "i1",
      brand_id: BRAND,
      customer_id: "c1",
      lead_id: null,
      type: "follow_up",
      subject: null,
      description: "Asked for the catalogue again",
      occurred_at: AS_OF,
      staff_id: null,
      outcome: null,
      next_follow_up_at: null,
      attachments: null,
      task_id: null,
      created_at: AS_OF,
    };
    expect(followUpTaskDraft(base)).toBeNull();
    const draft = followUpTaskDraft({ ...base, next_follow_up_at: "2026-06-20T00:00:00.000Z" });
    expect(draft?.dueDate).toBe("2026-06-20T00:00:00.000Z");
    expect(draft?.title).toBe("Follow-up: customer");
  });
});

/* ------------------------------------------------------------------ */
/* loyalty — configured, never hardcoded                               */
/* ------------------------------------------------------------------ */

describe("loyalty engine", () => {
  const config = {
    ...DEFAULT_LOYALTY_CONFIG,
    enabled: true,
    earn_points_per_unit: 0.25, // 1 point per ₹4
    redeem_value_per_point: 0.5,
    tiers: [
      { name: "Regular", min_lifetime_points: 0, discount_percent: null },
      { name: "Silver", min_lifetime_points: 200, discount_percent: 5 },
      { name: "Gold", min_lifetime_points: 1000, discount_percent: 10 },
    ],
  };

  it("floors earned points and converts points to currency", () => {
    expect(pointsForOrder(999, config)).toBe(249); // 249.75 → 249
    expect(redemptionValue(249, config)).toBe(124.5);
  });

  it("pays nothing when the programme is off", () => {
    expect(pointsForOrder(999, { ...config, enabled: false })).toBe(0);
    expect(redemptionValue(100, { ...config, enabled: false })).toBe(0);
  });

  it("resolves the highest tier reached", () => {
    expect(tierForLifetimePoints(0, config)).toBe("Regular");
    expect(tierForLifetimePoints(199, config)).toBe("Regular");
    expect(tierForLifetimePoints(200, config)).toBe("Silver");
    expect(tierForLifetimePoints(5000, config)).toBe("Gold");
  });

  it("falls back to a disabled default when a brand has no settings", () => {
    expect(loyaltyConfigFor(null)).toEqual(DEFAULT_LOYALTY_CONFIG);
    expect(loyaltyConfigFor(null).enabled).toBe(false);
  });

  it("reports only points actually lapsing inside the window", () => {
    const txns: LoyaltyTransaction[] = [
      {
        id: "t1",
        brand_id: BRAND,
        account_id: "a1",
        customer_id: "c1",
        kind: "earn",
        points: 40,
        balance_after: 40,
        reason: null,
        order_id: "o1",
        expires_at: "2026-07-01T00:00:00.000Z",
        created_at: AS_OF,
      },
      {
        // same customer, same expiry → merged into one row
        id: "t2",
        brand_id: BRAND,
        account_id: "a1",
        customer_id: "c1",
        kind: "bonus",
        points: 10,
        balance_after: 50,
        reason: "Diwali bonus",
        order_id: null,
        expires_at: "2026-07-01T00:00:00.000Z",
        created_at: AS_OF,
      },
      {
        id: "t3",
        brand_id: BRAND,
        account_id: "a2",
        customer_id: "c2",
        kind: "earn",
        points: 5,
        balance_after: 5,
        reason: null,
        order_id: "o2",
        expires_at: "2027-01-01T00:00:00.000Z", // outside 30 days
        created_at: AS_OF,
      },
      {
        id: "t4",
        brand_id: BRAND,
        account_id: "a2",
        customer_id: "c2",
        kind: "redeem",
        points: -5,
        balance_after: 0,
        reason: null,
        order_id: null,
        expires_at: "2026-06-20T00:00:00.000Z",
        created_at: AS_OF,
      },
      {
        id: "t5",
        brand_id: BRAND,
        account_id: "a3",
        customer_id: "c3",
        kind: "earn",
        points: 7,
        balance_after: 7,
        reason: null,
        order_id: null,
        expires_at: "2026-06-01T00:00:00.000Z", // already lapsed
        created_at: AS_OF,
      },
    ];
    expect(expiringPointsReport(txns, AS_OF, 30)).toEqual([
      { customerId: "c1", points: 50, expiresAt: "2026-07-01T00:00:00.000Z" },
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* CSV repository — tenancy and writes                                 */
/* ------------------------------------------------------------------ */

let tmpDir: string | null = null;
const previousDataDir = process.env.OB_DATA_DIR;

beforeEach(() => {
  vi.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ob-crm-test-"));
  process.env.OB_DATA_DIR = tmpDir;
});

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
  if (previousDataDir === undefined) delete process.env.OB_DATA_DIR;
  else process.env.OB_DATA_DIR = previousDataDir;
});

describe("CsvCrmRepository", () => {
  it("writes brand-stamped rows, reads them back typed, and never leaks another brand", async () => {
    const { CsvCrmRepository } = await import("@/lib/crm/repository");
    const a = new CsvCrmRepository("brand-a", "BR-1");
    const b = new CsvCrmRepository("brand-b", "BR-2");

    await a.save("leads", { id: "l1", name: "Neha", stage: "new", estimated_value: 5000 });
    await a.save("leads", { id: "l2", name: "Imran", stage: "won" });

    expect((await a.list("leads")).map((l) => l.id).sort()).toEqual(["l1", "l2"]);
    expect(await b.list("leads")).toEqual([]);
    expect(await b.find("leads", "l1")).toBeNull();

    const patched = await a.patch("leads", "l1", { stage: "quote_sent" });
    expect(patched?.stage).toBe("quote_sent");
    expect(patched?.name).toBe("Neha"); // untouched field survives
    expect(patched?.brand_id).toBe("brand-a");
    expect(await b.patch("leads", "l1", { stage: "lost" })).toBeNull();

    expect(await b.remove("leads", "l1")).toBe(false);
    expect(await a.remove("leads", "l1")).toBe(true);
    expect((await a.list("leads")).map((l) => l.id)).toEqual(["l2"]);
  });

  it("stamps created_at once and updated_at on every write", async () => {
    const { CsvCrmRepository } = await import("@/lib/crm/repository");
    const repo = new CsvCrmRepository("brand-a", "BR-1");
    const saved = await repo.save("customer_reviews", {
      id: "r1",
      source: "google",
      rating: 5,
      text: "Nice",
      review_date: "2026-06-01",
      response_status: "unanswered",
    });
    const patched = await repo.patch("customer_reviews", "r1", { response_status: "answered" });
    expect(saved.created_at).toBeTruthy();
    expect(patched?.created_at).toBe(saved.created_at);
    expect(patched?.updated_at).toBeTruthy();
  });

  it("refuses to overwrite a row belonging to another brand", async () => {
    const { CsvCrmRepository } = await import("@/lib/crm/repository");
    const a = new CsvCrmRepository("brand-a", "BR-1");
    const b = new CsvCrmRepository("brand-b", "BR-2");
    await a.save("memberships", {
      id: "m1",
      customer_id: "c1",
      plan: "Design Club",
      status: "active",
      started_at: "2026-01-01",
      auto_renew: false,
      benefits: [],
      price: 0,
    });
    await expect(
      b.save("memberships", { id: "m1", customer_id: "c2", plan: "Sneaky" }),
    ).rejects.toThrow(/another brand/);
    expect((await a.find("memberships", "m1"))?.plan).toBe("Design Club");
  });

  it("removeWhere clears only this brand's matching rows", async () => {
    const { CsvCrmRepository } = await import("@/lib/crm/repository");
    const a = new CsvCrmRepository("brand-a", "BR-1");
    const b = new CsvCrmRepository("brand-b", "BR-2");
    await a.save("customer_interactions", {
      id: "i1",
      type: "call",
      description: "one",
      occurred_at: AS_OF,
      customer_id: "c1",
    });
    await a.save("customer_interactions", {
      id: "i2",
      type: "call",
      description: "two",
      occurred_at: AS_OF,
      lead_id: "l9",
    });
    await b.save("customer_interactions", {
      id: "i3",
      type: "email",
      description: "theirs",
      occurred_at: AS_OF,
    });
    const removed = await a.removeWhere("customer_interactions", (row) => row.customer_id === "c1");
    expect(removed).toBe(1);
    expect((await a.list("customer_interactions")).map((r) => r.id)).toEqual(["i2"]);
    expect((await b.list("customer_interactions")).map((r) => r.id)).toEqual(["i3"]);
  });

  it("round-trips JSON columns (segment rules, loyalty config)", async () => {
    const { CsvCrmRepository } = await import("@/lib/crm/repository");
    const repo = new CsvCrmRepository("brand-a", "BR-1");
    const rules = { minOrders: 2, tagsAny: ["wholesale"] };
    await repo.save("customer_segments", {
      id: "s1",
      name: "Repeat wholesale",
      kind: "dynamic",
      rules,
      manual_customer_ids: [],
    });
    expect((await repo.find("customer_segments", "s1"))?.rules).toEqual(rules);

    const loyalty = { ...DEFAULT_LOYALTY_CONFIG, enabled: true, earn_points_per_unit: 0.1 };
    await repo.save("crm_settings", {
      id: "cfg",
      loyalty,
      lead_sources: ["Walk-in"],
      review_sources: ["Google"],
    });
    const settings = await repo.find("crm_settings", "cfg");
    expect(settings?.loyalty.earn_points_per_unit).toBe(0.1);
    expect(settings?.lead_sources).toEqual(["Walk-in"]);
  });

  it("the seeded demo CRM data is readable straight from the store", async () => {
    const { readBrandRows } = await import("@/lib/csv/store");
    const { csvBrandId } = await import("@/lib/csv/source");
    const leads = readBrandRows("leads", csvBrandId("BR-1"));
    expect(leads.length).toBeGreaterThan(0);
    // The pipeline stages the Manager deals board used are preserved verbatim.
    const stages = new Set(leads.map((l) => String(l.stage)));
    for (const stage of stages) expect(LEAD_STAGES).toContain(stage);
    expect([...stages].sort()).toEqual(
      ["lost", "negotiating", "new", "quote_sent", "site_visit", "won"].filter((s) =>
        stages.has(s),
      ),
    );
    const accounts = readBrandRows("loyalty_accounts", csvBrandId("BR-1"));
    expect(accounts.every((a) => typeof a.points_balance === "number")).toBe(true);
    // Every CRM row of one brand must never be visible to the other brand.
    const other = readBrandRows("leads", csvBrandId("BR-2"));
    expect(other.map((l) => l.id).some((id) => leads.map((l) => l.id).includes(id))).toBe(
      false,
    );
  });
});

/* ------------------------------------------------------------------ */
/* consent + campaign audience (loader rules)                          */
/* ------------------------------------------------------------------ */

describe("marketing consent", () => {
  const rows: Customer[] = [
    customer({ id: "ok", marketing_consent: "granted" }),
    customer({ id: "declined", marketing_consent: "declined" }),
    customer({ id: "unknown", marketing_consent: null }),
    customer({
      id: "left",
      marketing_consent: "granted",
      opted_out_at: "2026-05-01T00:00:00.000Z",
    }),
    customer({ id: "gone", marketing_consent: "granted", status: "archived" }),
  ];
  const crm = {
    brandId: BRAND,
    customers: rows,
  } as unknown as Parameters<typeof consentedCustomerIds>[0];

  it("only explicit granted consent, no opt-outs, no archived customers", () => {
    expect(consentedCustomerIds(crm, rows.map((c) => c.id))).toEqual(["ok"]);
  });
});

/* ------------------------------------------------------------------ */
/* campaign audience + tallies (loader rules)                          */
/* ------------------------------------------------------------------ */

describe("campaign audience and tallies", () => {
  const rows: Customer[] = [
    customer({ id: "in", marketing_consent: "granted", tags: ["wholesale"] }),
    customer({ id: "noConsent", tags: ["wholesale"] }),
    customer({
      id: "optedOut",
      marketing_consent: "granted",
      opted_out_at: "2026-05-01T00:00:00.000Z",
      tags: ["wholesale"],
    }),
    customer({ id: "outside", marketing_consent: "granted" }),
    customer({
      id: "archived",
      marketing_consent: "granted",
      status: "archived",
      tags: ["wholesale"],
    }),
  ];
  const orders = [order({ id: "o1", customer_id: "in" })];

  const segment: CustomerSegment = {
    id: "seg-1",
    brand_id: BRAND,
    name: "Wholesale",
    description: null,
    kind: "dynamic",
    rules: { tagsAny: ["wholesale"] },
    manual_customer_ids: [],
    created_at: AS_OF,
    updated_at: AS_OF,
  };

  const campaign = (overrides: Partial<MarketingCampaign> = {}): MarketingCampaign => ({
    id: "camp-1",
    brand_id: BRAND,
    name: "Monsoon",
    description: null,
    type: "offer",
    channel: "whatsapp",
    segment_id: "seg-1",
    offer_id: null,
    status: "active",
    start_date: "2026-06-01",
    end_date: null,
    consent_only: true,
    targeted_count: 0,
    marked_sent_count: 0,
    response_count: 0,
    redemption_count: 0,
    revenue_attributed: 0,
    created_at: AS_OF,
    updated_at: AS_OF,
    ...overrides,
  });

  const recipient = (
    overrides: Partial<CampaignRecipient> & { id: string },
  ): CampaignRecipient => ({
    brand_id: BRAND,
    campaign_id: "camp-1",
    customer_id: null,
    lead_id: null,
    status: "selected",
    marked_sent_at: null,
    responded_at: null,
    redeemed_at: null,
    order_id: null,
    note: null,
    created_at: AS_OF,
    updated_at: AS_OF,
    ...overrides,
  });

  const workspace = (recipients: CampaignRecipient[]) =>
    ({
      brandId: BRAND,
      brandCode: "BR-1",
      asOf: AS_OF,
      customers: rows,
      orders,
      segments: [segment],
      recipients,
      stats: computeCustomerStats({ customers: rows, orders, asOf: AS_OF }),
    }) as unknown as Parameters<typeof planCampaignRecipients>[0];

  it("puts only consenting segment members in the audience", () => {
    const plan = planCampaignRecipients(workspace([]), campaign());
    expect(plan.add.map((r) => r.customer_id)).toEqual(["in"]);
    expect(plan.add[0].status).toBe("selected");
    expect(plan.add[0].brand_id).toBe(BRAND);
    expect(plan.keep).toEqual([]);
    expect(plan.drop).toEqual([]);
  });

  it("keeps recorded outcomes, drops anyone who left the consented audience", () => {
    const existing = [
      recipient({
        id: "r1",
        customer_id: "in",
        status: "marked_sent",
        marked_sent_at: "2026-06-10T00:00:00.000Z",
      }),
      recipient({ id: "r2", customer_id: "noConsent" }),
      recipient({ id: "r3", customer_id: null, lead_id: "l1" }),
    ];
    const plan = planCampaignRecipients(workspace(existing), campaign());
    expect(plan.keep.map((r) => r.id)).toEqual(["r1"]);
    // A rebuild must not quietly reset what a person already recorded.
    expect(plan.keep[0]?.marked_sent_at).toBe("2026-06-10T00:00:00.000Z");
    expect(plan.drop.map((r) => r.id).sort()).toEqual(["r2", "r3"]);
    expect(plan.add).toEqual([]);
  });

  it("a campaign with no segment still cannot reach an unconsented customer", () => {
    const plan = planCampaignRecipients(workspace([]), campaign({ segment_id: null }));
    expect(plan.add.map((r) => r.customer_id)).toEqual(["in", "outside"]);
  });

  it("tallies count rows, and revenue follows only a redeemed real order", () => {
    const crm = workspace([
      recipient({
        id: "a",
        customer_id: "in",
        status: "redeemed",
        marked_sent_at: AS_OF,
        responded_at: AS_OF,
        redeemed_at: AS_OF,
        order_id: "o1",
      }),
      recipient({ id: "b", customer_id: "outside", status: "marked_sent", marked_sent_at: AS_OF }),
      // Redeemed without an order moves heads, never money.
      recipient({ id: "c", customer_id: null, redeemed_at: AS_OF }),
      // An order id that is not in this brand's orders cannot invent revenue.
      recipient({ id: "d", customer_id: "in", redeemed_at: AS_OF, order_id: "ghost-order" }),
    ]);
    expect(recountCampaign(crm, campaign())).toEqual({
      targeted_count: 4,
      marked_sent_count: 2,
      response_count: 1,
      redemption_count: 3,
      revenue_attributed: 1000,
    });
  });

  it("ignores another campaign's rows", () => {
    const crm = workspace([recipient({ id: "x", campaign_id: "camp-2", customer_id: "in" })]);
    expect(recountCampaign(crm, campaign()).targeted_count).toBe(0);
  });
});
