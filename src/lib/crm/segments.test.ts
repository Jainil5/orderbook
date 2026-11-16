process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import type { Customer } from "@/types/database";
import type { SegmentRules } from "@/types/crm";
import type { CustomerProfile } from "./metrics";
import {
  EMPTY_SEGMENT_RULE_INPUT,
  describeRules,
  isUsableRules,
  manualMemberIds,
  rulesToMatcher,
  segmentMemberIds,
  segmentRulesFromInput,
  segmentRulesToInput,
} from "./segments";

type ProfileOverrides = Omit<Partial<CustomerProfile>, "customer"> & { customer?: Partial<Customer> };

function profile(over: ProfileOverrides = {}): CustomerProfile {
  const defaults: CustomerProfile = {
    customer: {
      id: "c1",
      brand_id: "b1",
      name: "Anjali Shah",
      email: "anjali@example.in",
      phone: "+91 98250 11111",
    },
    orders: 4,
    lifetimeValue: 8000,
    avgOrderValue: 2000,
    dues: 0,
    billsWithDues: 0,
    cancelledOrRefunded: 0,
    firstOrderAt: "2026-02-01T04:00:00.000Z",
    lastOrderAt: "2026-11-01T04:00:00.000Z",
    daysSinceLastOrder: 15,
    joinedAt: "2026-01-01T04:00:00.000Z",
    daysSinceJoin: 320,
    reviewCount: 1,
    avgRating: 4,
    openComplaints: 0,
    loyaltyPoints: 400,
    loyaltyTierId: "silver",
    membershipTierId: null,
    tags: ["regular"],
    source: "Instagram",
    priceTier: "retail",
    status: "active",
  };
  const merged = { ...defaults, ...over };
  // The profile mirrors the customer record, exactly as buildCustomerProfiles does.
  const customer: Customer = {
    id: "c1",
    brand_id: "b1",
    name: "Anjali Shah",
    email: "anjali@example.in",
    phone: "+91 98250 11111",
    tags: merged.tags,
    source: merged.source,
    price_tier: merged.priceTier,
    status: merged.status,
    ...over.customer,
  };
  return {
    ...merged,
    customer,
    source: customer.source ?? "",
    tags: customer.tags ?? [],
    priceTier: customer.price_tier ?? "retail",
    status: customer.status ?? "active",
  };
}

const BOOK = [
  profile({
    customer: { id: "vip", name: "Priya Homes", price_tier: "wholesale", source: "Referral" },
    tags: ["trade", "designer"],
    orders: 22,
    lifetimeValue: 640000,
    avgRating: 5,
    loyaltyPoints: 3200,
    loyaltyTierId: "gold",
    dues: 120000,
    billsWithDues: 2,
    daysSinceLastOrder: 8,
  }),
  profile({
    customer: { id: "quiet", name: "Tejas Panchal", source: "Walk-in" },
    orders: 1,
    lifetimeValue: 1500,
    avgRating: 2,
    loyaltyPoints: 75,
    loyaltyTierId: "bronze",
    daysSinceLastOrder: 96,
    openComplaints: 1,
    tags: [],
  }),
  profile({
    customer: { id: "fresh", name: "Nisha Doshi", created_at: "2026-11-05T10:00:00.000Z" },
    orders: 0,
    lifetimeValue: 0,
    avgRating: null,
    reviewCount: 0,
    loyaltyPoints: 0,
    loyaltyTierId: null,
    daysSinceLastOrder: null,
    lastOrderAt: null,
    daysSinceJoin: 11,
    tags: ["new"],
  }),
];

const match = (rules: SegmentRules) => segmentMemberIds(rules, BOOK);

describe("rulesToMatcher", () => {
  it("requires every condition in a rule set to hold", () => {
    expect(match({ minOrders: 2, minSpend: 500000 })).toEqual(["vip"]);
    expect(match({ minOrders: 2, minSpend: 1000000 })).toEqual([]);
  });

  it("treats order and spend bands as inclusive", () => {
    expect(match({ minOrders: 1, maxOrders: 1 })).toEqual(["quiet"]);
    expect(match({ minSpend: 1500, maxSpend: 1500 })).toEqual(["quiet"]);
  });

  it("never matches an unrated customer with a rating rule", () => {
    expect(match({ minRating: 1 })).toEqual(["vip", "quiet"]);
    expect(match({ maxRating: 3 })).toEqual(["quiet"]);
    expect(match({ minRating: 4.5 })).toEqual(["vip"]);
  });

  it("reads inactivity as silence, and a missing purchase history as no signal", () => {
    expect(match({ inactiveDays: 45 })).toEqual(["quiet"]);
    expect(match({ activeWithinDays: 30 })).toEqual(["vip"]);
  });

  it("matches all tags, not any", () => {
    expect(match({ tags: ["trade"] })).toEqual(["vip"]);
    expect(match({ tags: ["trade", "designer"] })).toEqual(["vip"]);
    expect(match({ tags: ["trade", "new"] })).toEqual([]);
  });

  it("ignores source case but not the rest of the string", () => {
    expect(match({ source: "referral" })).toEqual(["vip"]);
    expect(match({ source: "Referr" })).toEqual([]);
  });

  it("separates complaint state from money state", () => {
    expect(match({ hasOpenComplaints: true })).toEqual(["quiet"]);
    expect(match({ hasOpenComplaints: false })).toEqual(["vip", "fresh"]);
    expect(match({ hasOutstandingDues: true })).toEqual(["vip"]);
    expect(match({ hasOutstandingDues: false })).toEqual(["quiet", "fresh"]);
  });

  it("falls back to a membership tier when no loyalty tier exists", () => {
    expect(match({ loyaltyTier: "gold" })).toEqual(["vip"]);
    const memberOnly = profile({ loyaltyTierId: null, membershipTierId: "pro" });
    expect(segmentMemberIds({ loyaltyTier: "pro" }, [memberOnly])).toEqual([memberOnly.customer.id]);
  });

  it("keeps a points floor independent of spend", () => {
    expect(match({ minLoyaltyPoints: 100 })).toEqual(["vip"]);
  });
});

describe("isUsableRules", () => {
  it("refuses an empty rule set that would silently match everyone", () => {
    expect(isUsableRules(null)).toBe(false);
    expect(isUsableRules({})).toBe(false);
    expect(isUsableRules({ tags: [], source: "  ", minOrders: undefined })).toBe(false);
    expect(isUsableRules({ minOrders: 0 })).toBe(true);
    expect(isUsableRules({ hasOutstandingDues: false })).toBe(true);
  });
});

describe("manualMemberIds", () => {
  it("drops ids whose customer is gone", () => {
    expect(manualMemberIds(["vip", "ghost", "quiet"], BOOK)).toEqual(["vip", "quiet"]);
  });
});

describe("describeRules", () => {
  it("lists each condition once, in the order a person would read it", () => {
    expect(
      describeRules({
        minOrders: 5,
        minSpend: 50000,
        inactiveDays: 60,
        tags: ["trade", "designer"],
        minRating: 4,
        hasOutstandingDues: true,
        loyaltyTier: "gold",
      }),
    ).toBe(
      "orders ≥ 5 · spend ≥ 50000 · quiet for 60+ days · tagged trade + designer · rating ≥ 4★ · owing money · tier gold",
    );
  });

  it("returns an empty string for an empty rule set", () => {
    expect(describeRules({})).toBe("");
  });
});

describe("segmentRulesFromInput", () => {
  it("drops blank fields and keeps the ones a person filled in", () => {
    const { rules, error } = segmentRulesFromInput({
      ...EMPTY_SEGMENT_RULE_INPUT,
      minSpend: "250000",
      tags: "trade, designer |vip",
      source: "  Referral  ",
      priceTier: "wholesale",
      hasOpenComplaints: "no",
    });
    expect(error).toBeNull();
    expect(rules).toEqual({
      minSpend: 250000,
      tags: ["trade", "designer", "vip"],
      source: "Referral",
      priceTier: "wholesale",
      hasOpenComplaints: false,
    });
  });

  it("refuses a filter with no conditions", () => {
    const { rules, error } = segmentRulesFromInput(EMPTY_SEGMENT_RULE_INPUT);
    expect(rules).toBeNull();
    expect(error).toMatch(/at least one condition/i);
  });

  it("rejects inverted bands and impossible ratings", () => {
    expect(segmentRulesFromInput({ ...EMPTY_SEGMENT_RULE_INPUT, minOrders: "9", maxOrders: "3" }).error).toMatch(
      /minimum orders/i,
    );
    expect(segmentRulesFromInput({ ...EMPTY_SEGMENT_RULE_INPUT, minSpend: "900", maxSpend: "10" }).error).toMatch(
      /minimum spend/i,
    );
    expect(segmentRulesFromInput({ ...EMPTY_SEGMENT_RULE_INPUT, minRating: "7" }).error).toMatch(/1 and 5/);
    expect(segmentRulesFromInput({ ...EMPTY_SEGMENT_RULE_INPUT, maxRating: "0" }).error).toMatch(/1 and 5/);
  });

  it("ignores a price tier that is not one of the two the app sells at", () => {
    const { rules } = segmentRulesFromInput({ ...EMPTY_SEGMENT_RULE_INPUT, minOrders: "1", priceTier: "trade" });
    expect(rules?.priceTier).toBeUndefined();
  });

  it("rounds decimals rather than storing a rating the UI cannot show", () => {
    const { rules } = segmentRulesFromInput({ ...EMPTY_SEGMENT_RULE_INPUT, minRating: "3.6", minOrders: "2.4" });
    expect(rules).toEqual({ minRating: 4, minOrders: 2 });
  });
});

describe("the form and the matcher agree", () => {
  it("survives a round trip through the editor", () => {
    const rules: SegmentRules = {
      minOrders: 3,
      maxOrders: 30,
      minSpend: 1000,
      maxSpend: 999999,
      inactiveDays: 45,
      joinedWithinDays: 90,
      tags: ["trade", "designer"],
      source: "Referral",
      priceTier: "wholesale",
      minRating: 4,
      maxRating: 5,
      hasOpenComplaints: false,
      hasOutstandingDues: true,
      minLoyaltyPoints: 100,
      loyaltyTier: "gold",
    };
    const input = segmentRulesToInput(rules);
    expect(segmentRulesFromInput(input).rules).toEqual(rules);
  });

  it("reads an empty rule set back as blank inputs", () => {
    expect(segmentRulesToInput(null)).toEqual(EMPTY_SEGMENT_RULE_INPUT);
  });
});

describe("rulesToMatcher guards", () => {
  it("does not throw on a rule set with unknown keys", () => {
    const matcher = rulesToMatcher({ minOrders: 1 } as SegmentRules);
    expect(matcher(profile())).toBe(true);
    expect(typeof matcher).toBe("function");
  });
});
