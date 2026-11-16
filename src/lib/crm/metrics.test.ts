process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import type { Customer, Order } from "@/types/database";
import type {
  CustomerComplaint,
  CustomerReview,
  LoyaltyEntry,
  LoyaltyRules,
  Membership,
} from "@/types/crm";
import {
  AT_RISK_DAYS,
  DORMANT_DAYS,
  buildCustomerProfiles,
  crmOverview,
  filterUniverse,
  isAtRisk,
  isDormant,
} from "./metrics";
import { wholeDaysSince } from "@/lib/manager/time";

const NOW = new Date("2026-11-16T09:00:00.000+05:30");

function customer(over: Partial<Customer> = {}): Customer {
  return {
    id: "c1",
    brand_id: "b1",
    name: "Anjali Shah",
    email: "anjali@example.in",
    phone: "+91 98250 11111",
    created_at: "2026-01-10T10:00:00.000Z",
    ...over,
  };
}

function order(over: Partial<Order> = {}): Order {
  return {
    id: "o1",
    brand_id: "b1",
    order_number: "BC-1",
    status: "completed",
    payment_status: "paid",
    customer_id: "c1",
    customer_name_snapshot: "Anjali Shah",
    subtotal: 1000,
    discount_total: 0,
    tax_total: 0,
    fees_total: 0,
    grand_total: 1000,
    notes: null,
    created_at: "2026-11-10T04:00:00.000Z",
    amount_paid: 1000,
    ...over,
  };
}

function review(over: Partial<CustomerReview> = {}): CustomerReview {
  return {
    id: "r1",
    brand_id: "b1",
    customer_id: "c1",
    source: "Google Business Profile",
    rating: 5,
    text: "Lovely place",
    reviewed_at: "2026-11-08T10:00:00.000Z",
    response_text: null,
    responded_at: null,
    sentiment: "positive",
    tags: [],
    staff_mentioned: null,
    internal_notes: null,
    status: "new",
    complaint_id: null,
    ...over,
  };
}

function complaint(over: Partial<CustomerComplaint> = {}): CustomerComplaint {
  return {
    id: "cp1",
    brand_id: "b1",
    customer_id: "c1",
    review_id: null,
    interaction_id: null,
    subject: "Late delivery",
    detail: null,
    severity: "medium",
    status: "open",
    owner_staff_id: null,
    raised_at: "2026-11-09T10:00:00.000Z",
    resolved_at: null,
    ...over,
  };
}

function entry(over: Partial<LoyaltyEntry> = {}): LoyaltyEntry {
  return {
    id: "ly1",
    brand_id: "b1",
    customer_id: "c1",
    kind: "earn",
    points: 50,
    reason: "Bill",
    order_id: null,
    expires_at: null,
    created_at: "2026-11-01T10:00:00.000Z",
    ...over,
  };
}

const RULES: LoyaltyRules = {
  brand_id: "b1",
  earn_mode: "per_amount",
  earn_amount_per_point: 20,
  earn_points_per_order: 0,
  point_value: 0.5,
  expiry_days: 365,
  redemption_enabled: true,
  tiers: [
    { id: "bronze", name: "Bronze", min_spend: 0, discount_percent: 0 },
    { id: "silver", name: "Silver", min_spend: 5000, discount_percent: 5 },
    { id: "gold", name: "Gold", min_spend: 20000, discount_percent: 10 },
  ],
};

function profiles(over: Partial<Parameters<typeof buildCustomerProfiles>[0]> = {}) {
  return buildCustomerProfiles(
    {
      customers: [customer()],
      orders: [],
      reviews: [],
      complaints: [],
      loyaltyLedger: [],
      loyaltyRules: RULES,
      memberships: [],
      ...over,
    },
    NOW,
  );
}

describe("buildCustomerProfiles", () => {
  it("earns lifetime value from completed bills only", () => {
    const [profile] = profiles({
      orders: [
        order({ id: "o1", status: "completed", grand_total: 1200 }),
        order({ id: "o2", status: "confirmed", grand_total: 5000 }),
        order({ id: "o3", status: "cancelled", grand_total: 900 }),
        order({ id: "o4", status: "refunded", grand_total: 400 }),
      ],
    });
    expect(profile.orders).toBe(1);
    expect(profile.lifetimeValue).toBe(1200);
    expect(profile.avgOrderValue).toBe(1200);
    expect(profile.cancelledOrRefunded).toBe(2);
  });

  it("adds every unpaid balance including still-open work", () => {
    const [profile] = profiles({
      orders: [
        order({ id: "o1", status: "completed", grand_total: 1000, amount_paid: 400 }),
        order({ id: "o2", status: "confirmed", grand_total: 2000, amount_paid: 2000 }),
        order({ id: "o3", status: "cancelled", grand_total: 800, amount_paid: 0 }),
        order({ id: "o4", status: "refunded", grand_total: 600, amount_paid: 600 }),
      ],
    });
    expect(profile.dues).toBe(600);
    expect(profile.billsWithDues).toBe(1);
  });

  it("ignores bills that belong to someone else", () => {
    const [profile] = profiles({
      orders: [order({ customer_id: "other" }), order({ customer_id: null })],
    });
    expect(profile.orders).toBe(0);
    expect(profile.lifetimeValue).toBe(0);
    expect(profile.avgOrderValue).toBe(0);
    expect(profile.lastOrderAt).toBeNull();
    expect(profile.daysSinceLastOrder).toBeNull();
  });

  it("reads first and last purchase from the earned revenue only", () => {
    const [profile] = profiles({
      orders: [
        order({ id: "o1", created_at: "2026-03-01T04:00:00.000Z", status: "draft" }),
        order({ id: "o2", created_at: "2026-05-01T04:00:00.000Z" }),
        order({ id: "o3", created_at: "2026-09-01T04:00:00.000Z" }),
      ],
    });
    expect(profile.firstOrderAt).toBe("2026-05-01T04:00:00.000Z");
    expect(profile.lastOrderAt).toBe("2026-09-01T04:00:00.000Z");
    expect(profile.daysSinceLastOrder).toBe(wholeDaysSince("2026-09-01T04:00:00.000Z", NOW));
  });

  it("falls back to the first bill when no account date was recorded", () => {
    const [profile] = profiles({
      customers: [customer({ created_at: null })],
      orders: [order({ created_at: "2026-06-06T04:00:00.000Z" })],
    });
    expect(profile.joinedAt).toBe("2026-06-06T04:00:00.000Z");
  });

  it("never reports a negative tenure", () => {
    const [profile] = profiles({ customers: [customer({ created_at: "2027-01-01T10:00:00.000Z" })] });
    expect(profile.daysSinceJoin).toBe(0);
  });

  it("averages ratings to one decimal and leaves unrated customers null", () => {
    const [rated] = profiles({
      reviews: [review({ id: "r1", rating: 5 }), review({ id: "r2", rating: 4 })],
    });
    expect(rated.reviewCount).toBe(2);
    expect(rated.avgRating).toBe(4.5);
    const [unrated] = profiles({ reviews: [review({ customer_id: "c9" })] });
    expect(unrated.avgRating).toBeNull();
  });

  it("counts only complaints that are still being worked", () => {
    const [profile] = profiles({
      complaints: [
        complaint({ id: "cp1", status: "open" }),
        complaint({ id: "cp2", status: "in_progress" }),
        complaint({ id: "cp3", status: "resolved" }),
        complaint({ id: "cp4", status: "closed" }),
      ],
    });
    expect(profile.openComplaints).toBe(2);
  });

  it("drops lapsed points from the balance it reports", () => {
    const [profile] = profiles({
      loyaltyLedger: [
        entry({ id: "ly1", points: 100 }),
        entry({ id: "ly2", points: 30, expires_at: "2026-11-01T00:00:00.000Z" }),
        entry({ id: "ly3", points: -20, kind: "redeem" }),
      ],
    });
    expect(profile.loyaltyPoints).toBe(80);
  });

  it("resolves the loyalty tier from spend and the membership tier from an active card", () => {
    const membership: Membership = {
      id: "m1",
      brand_id: "b1",
      customer_id: "c1",
      tier_id: "pro",
      started_at: "2026-01-01T00:00:00.000Z",
      expires_at: null,
      status: "active",
      notes: null,
    };
    const [profile] = profiles({
      orders: [order({ grand_total: 25000 })],
      memberships: [membership],
    });
    expect(profile.loyaltyTierId).toBe("gold");
    expect(profile.membershipTierId).toBe("pro");

    const [held] = profiles({
      orders: [order({ grand_total: 25000 })],
      memberships: [{ ...membership, status: "cancelled" }],
    });
    expect(held.membershipTierId).toBeNull();
  });

  it("still profiles a brand that runs no loyalty programme", () => {
    const [profile] = profiles({ loyaltyRules: null, orders: [order({ grand_total: 25000 })] });
    expect(profile.loyaltyTierId).toBeNull();
    expect(profile.loyaltyPoints).toBe(0);
  });

  it("defaults the CRM columns a pre-CRM pack never carried", () => {
    const bare = profiles({ customers: [customer({ price_tier: null, tags: undefined })] });
    expect(bare[0].status).toBe("active");
    expect(bare[0].priceTier).toBe("retail");
    expect(bare[0].tags).toEqual([]);
    expect(bare[0].source).toBe("");
    const explicit = profiles({ customers: [customer({ status: "archived" })] });
    expect(explicit[0].status).toBe("archived");
  });
});

describe("health bands", () => {
  const profileWith = (days: number | null) => ({
    ...profiles()[0],
    orders: days === null ? 0 : 3,
    daysSinceLastOrder: days,
  });

  it("treats silence as at risk only inside the band", () => {
    expect(isAtRisk(profileWith(AT_RISK_DAYS - 1))).toBe(false);
    expect(isAtRisk(profileWith(AT_RISK_DAYS))).toBe(true);
    expect(isAtRisk(profileWith(DORMANT_DAYS - 1))).toBe(true);
    expect(isAtRisk(profileWith(DORMANT_DAYS))).toBe(false);
  });

  it("calls long silence dormant", () => {
    expect(isDormant(profileWith(DORMANT_DAYS))).toBe(true);
    expect(isDormant(profileWith(DORMANT_DAYS - 1))).toBe(false);
  });

  it("never judges a customer who has never bought", () => {
    expect(isAtRisk(profileWith(null))).toBe(false);
    expect(isDormant(profileWith(null))).toBe(false);
    expect(isAtRisk({ ...profileWith(400), orders: 0 })).toBe(false);
  });
});

describe("crmOverview", () => {
  const twoCustomers = profiles({
    customers: [
      customer({ id: "c1", date_of_birth: "1988-11-04" }),
      customer({ id: "c2", name: "Bitan Roy", created_at: "2026-11-01T10:00:00.000Z" }),
    ],
    orders: [
      order({ id: "o1", customer_id: "c1", grand_total: 900, created_at: "2026-09-15T04:00:00.000Z" }),
      order({ id: "o2", customer_id: "c1", grand_total: 700, created_at: "2026-05-10T04:00:00.000Z" }),
      order({ id: "o3", customer_id: "c2", grand_total: 500, created_at: "2026-11-15T04:00:00.000Z" }),
      order({ id: "o4", customer_id: "c2", grand_total: 400, status: "cancelled" }),
    ],
    reviews: [review({ id: "r1", customer_id: "c1" }), review({ id: "r2", customer_id: "c1", response_text: "Thanks" })],
    complaints: [complaint({ id: "cp1", severity: "high" }), complaint({ id: "cp2", status: "closed" })],
  });

  const overview = crmOverview({
    profiles: twoCustomers,
    orders: [
      order({ id: "o1", grand_total: 900 }),
      order({ id: "o3", grand_total: 500 }),
      order({ id: "o5", grand_total: 5000, created_at: "2026-01-05T04:00:00.000Z" }),
      order({ id: "o6", grand_total: 800, status: "confirmed" }),
      order({ id: "o7", grand_total: 600, created_at: "2026-11-25T04:00:00.000Z" }),
    ],
    leads: [
      { stage: "new", estimated_value: 100000 },
      { stage: "quote_sent", estimated_value: 250000 },
      { stage: "won", estimated_value: 900000 },
      { stage: "lost", estimated_value: 40000 },
    ],
    complaints: [
      complaint({ id: "cp1", severity: "high", status: "open" }),
      complaint({ id: "cp2", severity: "low", status: "in_progress" }),
      complaint({ id: "cp3", severity: "high", status: "resolved" }),
    ],
    reviews: [
      review({ id: "r1", response_text: null }),
      review({ id: "r2", response_text: "Thanks for the note" }),
      review({ id: "r3", response_text: "   " }),
    ],
    followUpsDue: 4,
    openLeadStages: ["new", "site_visit", "quote_sent", "negotiating"],
    now: NOW,
  });

  it("rolls the customer book up deterministically", () => {
    expect(overview.totalCustomers).toBe(2);
    expect(overview.activeCustomers).toBe(2);
    expect(overview.totalLifetimeValue).toBe(2100);
    expect(overview.avgLifetimeValue).toBe(1050);
    expect(overview.newCustomers30d).toBe(1);
    expect(overview.birthdayCustomers).toBe(1);
  });

  it("keeps the 30-day window inclusive of today and blind to the future", () => {
    expect(overview.revenue30d).toBe(1400);
    expect(overview.bills30d).toBe(2);
  });

  it("weights the pipeline with open stages only", () => {
    expect(overview.openLeads).toBe(2);
    expect(overview.pipelineValue).toBe(350000);
  });

  it("counts the work that still needs a human", () => {
    expect(overview.openComplaints).toBe(2);
    expect(overview.highSeverityComplaints).toBe(1);
    expect(overview.reviewsAwaitingReply).toBe(2);
    expect(overview.followUpsDue).toBe(4);
  });

  it("orders the call-to-action lists", () => {
    expect(overview.topSpenders[0]?.customer.id).toBe("c1");
    expect(overview.topSpenders).toHaveLength(2);
    expect(overview.atRiskList.map((p) => p.customer.id)).toEqual(["c1"]);
  });

  it("reports zeros rather than NaN for an empty book", () => {
    const empty = crmOverview({
      profiles: [],
      orders: [],
      leads: [],
      complaints: [],
      reviews: [],
      followUpsDue: 0,
      openLeadStages: [],
      now: NOW,
    });
    expect(empty.avgLifetimeValue).toBe(0);
    expect(empty.totalCustomers).toBe(0);
    expect(empty.topSpenders).toEqual([]);
  });

  it("carries dues into the overview", () => {
    const withDues = crmOverview({
      profiles: profiles({
        orders: [order({ id: "o1", grand_total: 1000, amount_paid: 250 })],
      }),
      orders: [],
      leads: [],
      complaints: [],
      reviews: [],
      followUpsDue: 0,
      openLeadStages: [],
      now: NOW,
    });
    expect(withDues.totalDues).toBe(750);
    expect(withDues.customersWithDues).toBe(1);
  });
});

describe("filterUniverse", () => {
  it("lists each filter value once, sorted", () => {
    const universe = filterUniverse(
      profiles({
        customers: [
          customer({ id: "c1", tags: ["walk-in", "regular"], source: "Instagram", price_tier: "retail" }),
          customer({ id: "c2", tags: ["trade"], source: "Referral", price_tier: "wholesale" }),
          customer({ id: "c3", tags: ["regular"], source: "Instagram" }),
        ],
      }),
    );
    expect(universe.tags).toEqual(["regular", "trade", "walk-in"]);
    expect(universe.sources).toEqual(["Instagram", "Referral"]);
    expect(universe.priceTiers).toEqual(["retail", "wholesale"]);
  });

  it("skips customers with no source but always offers both price tiers", () => {
    const universe = filterUniverse(profiles());
    expect(universe.sources).toEqual([]);
    expect(universe.priceTiers).toEqual(["retail"]);
  });
});
