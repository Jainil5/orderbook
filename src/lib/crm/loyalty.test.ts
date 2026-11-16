process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import type { Order } from "@/types/database";
import type { LoyaltyEntry, LoyaltyRules } from "@/types/crm";
import { getDemoBrandPack } from "@/lib/demo/brands";
import {
  checkRedemption,
  expiryFor,
  expiringPoints,
  isExpired,
  loyaltyBalance,
  loyaltySummary,
  pointsForOrder,
  pointsValue,
  tierById,
  tierForSpend,
} from "./loyalty";

const NOW = new Date("2026-11-16T09:00:00.000+05:30");

const CAFE: LoyaltyRules = {
  brand_id: "b1",
  earn_mode: "per_amount",
  earn_amount_per_point: 20,
  earn_points_per_order: 0,
  point_value: 0.5,
  expiry_days: 365,
  redemption_enabled: true,
  tiers: [
    { id: "bronze", name: "Bronze", min_spend: 0, discount_percent: 0 },
    { id: "silver", name: "Silver", min_spend: 1200, discount_percent: 5 },
    { id: "gold", name: "Gold", min_spend: 2300, discount_percent: 10 },
  ],
};

const STUDIO: LoyaltyRules = {
  brand_id: "b2",
  earn_mode: "per_order",
  earn_amount_per_point: 0,
  earn_points_per_order: 120,
  point_value: 0.25,
  expiry_days: null,
  redemption_enabled: true,
  tiers: [{ id: "trade", name: "Trade", min_spend: 100000, discount_percent: 5 }],
};

function entry(over: Partial<LoyaltyEntry> = {}): LoyaltyEntry {
  return {
    id: "ly1",
    brand_id: "b1",
    customer_id: "c1",
    kind: "earn",
    points: 100,
    reason: "Bill BC-1042",
    order_id: null,
    expires_at: null,
    created_at: "2026-11-01T10:00:00.000Z",
    ...over,
  };
}

function bill(over: Partial<Order> = {}): Order {
  return {
    id: "o1",
    brand_id: "b1",
    order_number: "BC-1042",
    status: "completed",
    payment_status: "paid",
    customer_id: "c1",
    customer_name_snapshot: "Anjali Shah",
    subtotal: 600,
    discount_total: 0,
    tax_total: 0,
    fees_total: 0,
    grand_total: 600,
    notes: null,
    created_at: "2026-11-10T04:00:00.000Z",
    ...over,
  };
}

describe("the two programmes earn differently", () => {
  it("a café rupee rule floors at the spend threshold", () => {
    expect(pointsForOrder(CAFE, bill({ grand_total: 640 }))).toBe(32);
    expect(pointsForOrder(CAFE, bill({ grand_total: 619 }))).toBe(30);
    expect(pointsForOrder(CAFE, bill({ grand_total: 19 }))).toBe(0);
  });

  it("a studio order rule ignores the size of the bill", () => {
    expect(pointsForOrder(STUDIO, bill({ grand_total: 400 }))).toBe(120);
    expect(pointsForOrder(STUDIO, bill({ grand_total: 1400000 }))).toBe(120);
  });

  it("refuses to earn on a cancelled or refunded bill", () => {
    expect(pointsForOrder(CAFE, bill({ status: "cancelled", grand_total: 5000 }))).toBe(0);
    expect(pointsForOrder(CAFE, bill({ status: "refunded", grand_total: 5000 }))).toBe(0);
    expect(pointsForOrder(STUDIO, bill({ status: "cancelled" }))).toBe(0);
  });

  it("earns nothing when the configured threshold is zero or negative", () => {
    expect(pointsForOrder({ ...CAFE, earn_amount_per_point: 0 }, bill({ grand_total: 5000 }))).toBe(0);
    expect(pointsForOrder({ ...CAFE, earn_amount_per_point: -20 }, bill({ grand_total: 5000 }))).toBe(0);
  });

  it("never reports a negative grant", () => {
    expect(pointsForOrder(CAFE, bill({ grand_total: -800, status: "refunded" }))).toBe(0);
    expect(pointsForOrder({ ...STUDIO, earn_points_per_order: -50 }, bill())).toBe(0);
  });
});

describe("expiry", () => {
  it("only lapses grants, never corrections", () => {
    const past = "2020-01-01T00:00:00.000Z";
    expect(isExpired(entry({ expires_at: past }), NOW)).toBe(true);
    expect(isExpired(entry({ kind: "bonus", expires_at: past }), NOW)).toBe(true);
    expect(isExpired(entry({ kind: "redeem", points: -10, expires_at: past }), NOW)).toBe(false);
    expect(isExpired(entry({ kind: "expire", points: -10, expires_at: past }), NOW)).toBe(false);
    expect(isExpired(entry({ kind: "adjust", points: -10, expires_at: past }), NOW)).toBe(false);
  });

  it("keeps points that never expire", () => {
    expect(isExpired(entry({ expires_at: null }), NOW)).toBe(false);
  });

  it("computes the lapse date from the brand's rule", () => {
    expect(expiryFor(CAFE, new Date("2026-01-01T00:00:00.000Z"))).toBe(
      new Date(Date.UTC(2027, 0, 1)).toISOString(),
    );
    expect(expiryFor(STUDIO, NOW)).toBeNull();
  });
});

describe("loyaltyBalance", () => {
  it("adds live grants and subtracts every debit", () => {
    const entries = [
      entry({ id: "a", points: 100 }),
      entry({ id: "b", points: 40, expires_at: "2026-12-01T00:00:00.000Z" }),
      entry({ id: "c", points: 30, expires_at: "2026-11-01T00:00:00.000Z" }),
      entry({ id: "d", points: -25, kind: "redeem" }),
      entry({ id: "e", points: -5, kind: "expire" }),
    ];
    expect(loyaltyBalance(entries, NOW)).toBe(110);
  });

  it("is zero with nothing recorded", () => {
    expect(loyaltyBalance([], NOW)).toBe(0);
  });
});

describe("expiringPoints", () => {
  const entries = [
    entry({ id: "soon", points: 20, expires_at: "2026-11-20T00:00:00.000Z" }),
    entry({ id: "later", points: 50, expires_at: "2027-06-01T00:00:00.000Z" }),
    entry({ id: "gone", points: 15, expires_at: "2026-11-01T00:00:00.000Z" }),
    entry({ id: "never", points: 80, expires_at: null }),
    entry({ id: "debit", points: -20, kind: "redeem", expires_at: "2026-11-20T00:00:00.000Z" }),
  ];

  it("collects only grants that lapse inside the window", () => {
    expect(expiringPoints(entries, NOW, 30).points).toBe(20);
    expect(expiringPoints(entries, NOW, 30).entries.map((e) => e.id)).toEqual(["soon"]);
    expect(expiringPoints(entries, NOW, 300).points).toBe(70);
  });

  it("lists the earliest lapse first", () => {
    const withTwo = [
      ...entries,
      entry({ id: "first", points: 5, expires_at: "2026-11-18T00:00:00.000Z" }),
    ];
    expect(expiringPoints(withTwo, NOW, 30).entries.map((e) => e.id)).toEqual(["first", "soon"]);
  });

  it("sees nothing coming due in a programme without expiry", () => {
    expect(expiringPoints([entry({ id: "never", expires_at: null })], NOW, 365)).toEqual({
      points: 0,
      entries: [],
    });
  });
});

describe("what a balance is worth", () => {
  it("converts at the brand's point value", () => {
    expect(pointsValue(CAFE, 100)).toBe(50);
    expect(pointsValue(STUDIO, 101)).toBe(25.25);
    expect(pointsValue(CAFE, 0)).toBe(0);
  });

  it("gives the highest tier the lifetime spend has reached", () => {
    expect(tierForSpend(CAFE, 0)?.id).toBe("bronze");
    expect(tierForSpend(CAFE, 1199)?.id).toBe("bronze");
    expect(tierForSpend(CAFE, 1200)?.id).toBe("silver");
    expect(tierForSpend(CAFE, 9000)?.id).toBe("gold");
  });

  it("leaves a customer unranked when the programme starts above them", () => {
    expect(tierForSpend(STUDIO, 40000)).toBeNull();
    expect(tierForSpend({ ...CAFE, tiers: [] }, 9000)).toBeNull();
  });

  it("looks tiers up by id and answers null for none", () => {
    expect(tierById(CAFE, "gold")?.discount_percent).toBe(10);
    expect(tierById(CAFE, "platinum")).toBeNull();
    expect(tierById(CAFE, null)).toBeNull();
  });
});

describe("checkRedemption", () => {
  const entries = [
    entry({ id: "a", points: 100 }),
    entry({ id: "b", points: 30, expires_at: "2026-11-01T00:00:00.000Z" }),
  ];

  it("needs a programme before it needs a balance", () => {
    expect(checkRedemption({ rules: null, entries, points: 10, now: NOW })).toEqual({
      ok: false,
      message: expect.stringMatching(/no loyalty programme/i),
    });
    expect(
      checkRedemption({ rules: { ...CAFE, redemption_enabled: false }, entries, points: 10, now: NOW }).ok,
    ).toBe(false);
  });

  it("rejects a request that is not a positive number of points", () => {
    for (const points of [0, -10, NaN]) {
      expect(checkRedemption({ rules: CAFE, entries, points, now: NOW }).ok).toBe(false);
    }
  });

  it("counts lapsed points as unspendable", () => {
    const result = checkRedemption({ rules: CAFE, entries, points: 101, now: NOW });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/only 100 points/i);
  });

  it("accepts a whole balance and reports its value", () => {
    expect(checkRedemption({ rules: CAFE, entries, points: 100, now: NOW })).toEqual({
      ok: true,
      worth: 50,
    });
  });

  it("truncates a fraction instead of overspending", () => {
    expect(checkRedemption({ rules: CAFE, entries, points: 99.9, now: NOW })).toEqual({
      ok: true,
      worth: 49.5,
    });
  });
});

describe("loyaltySummary", () => {
  const entries = [
    entry({ id: "a", customer_id: "c1", points: 100 }),
    entry({ id: "b", customer_id: "c1", points: -40, kind: "redeem" }),
    entry({ id: "c", customer_id: "c2", points: 60, expires_at: "2026-01-01T00:00:00.000Z" }),
    entry({ id: "d", customer_id: "c3", points: -12, kind: "expire" }),
    entry({ id: "e", customer_id: "c4", points: 25, kind: "bonus" }),
  ];
  const spend = new Map([
    ["c1", 3000],
    ["c2", 1500],
    ["c3", 900],
    ["c4", 0],
  ]);
  const summary = loyaltySummary({ rules: CAFE, entries, lifetimeValueByCustomer: spend, now: NOW });

  it("counts the members the ledger has ever touched", () => {
    expect(summary.members).toBe(4);
  });

  it("keeps only live balances in the liability", () => {
    expect(summary.pointsOutstanding).toBe(85);
    expect(summary.valueOutstanding).toBe(42.5);
  });

  it("reports the two kinds of debit separately", () => {
    expect(summary.pointsRedeemed).toBe(40);
    expect(summary.pointsExpired).toBe(12);
  });

  it("seats every customer in the tier they reached, richest first", () => {
    expect(summary.byTier.map((t) => [t.tier.id, t.members])).toEqual([
      ["gold", 1],
      ["silver", 1],
      ["bronze", 2],
    ]);
  });

  it("answers with zeros for a brand that runs no programme", () => {
    const none = loyaltySummary({ rules: null, entries: [], lifetimeValueByCustomer: new Map(), now: NOW });
    expect(none.members).toBe(0);
    expect(none.valueOutstanding).toBe(0);
    expect(none.byTier).toEqual([]);
  });
});

describe("the shipped programmes", () => {
  it("gives the café a rupee rule with an annual lapse", () => {
    const rules = getDemoBrandPack("BR-1").loyaltyRules[0];
    expect(rules.earn_mode).toBe("per_amount");
    expect(rules.earn_amount_per_point).toBe(20);
    expect(rules.expiry_days).toBe(365);
    expect(rules.tiers.map((t) => t.id)).toEqual(["bronze", "silver", "gold"]);
  });

  it("gives the furniture studio a per-order rule that never lapses", () => {
    const rules = getDemoBrandPack("BR-2").loyaltyRules[0];
    expect(rules.earn_mode).toBe("per_order");
    expect(rules.earn_points_per_order).toBe(120);
    expect(rules.expiry_days).toBeNull();
    expect(rules.point_value).toBe(0.25);
  });

  it("holds the ledger inside the rules that govern it", () => {
    for (const code of ["BR-1", "BR-2"] as const) {
      const pack = getDemoBrandPack(code);
      const rules = pack.loyaltyRules[0];
      for (const row of pack.loyaltyLedger) {
        if (row.kind === "earn" || row.kind === "bonus") {
          expect(row.points, `${code} ${row.id}`).toBeGreaterThan(0);
        }
        if (row.kind === "redeem" || row.kind === "expire") {
          expect(row.points, `${code} ${row.id}`).toBeLessThan(0);
        }
        if (rules.expiry_days === null) {
          expect(row.expires_at, `${code} ${row.id}`).toBeNull();
        }
      }
    }
  });
});
