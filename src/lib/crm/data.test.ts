import { describe, expect, it } from "vitest";
import { getDemoBrandPack } from "@/lib/demo/brands";
import type { DemoMutableBucket } from "@/lib/demo/mutable-store";
import { DEMO_BRAND_CODES } from "@/lib/workspace/constants";
import type { CustomerInteraction, MarketingCampaign } from "@/types/crm";
import { mergeCrm } from "./data";

/**
 * `loadCrmWorkspace` and `readDemoMutableBucket` need a request's cookies, so
 * the tested surface is `mergeCrm` — the pure half the read layer is built on.
 */
describe("mergeCrm", () => {
  const pack = getDemoBrandPack("BR-1");
  const brandId = pack.settings.brand_id;
  const bucket = (over: Partial<DemoMutableBucket> = {}) =>
    ({ ...over } as DemoMutableBucket);

  it("survives a cookie written before the CRM existed", () => {
    const crm = mergeCrm(pack, {} as DemoMutableBucket);
    expect(crm.interactions.length).toBeGreaterThan(0);
    expect(crm.reviews.length).toBeGreaterThan(0);
    expect(crm.loyaltyRules).not.toBeNull();
    expect(crm.loyaltyLedger.length).toBeGreaterThan(0);
  });

  it("adds a browser-created row without touching the seeded ones", () => {
    const added: CustomerInteraction = {
      id: "i-new",
      brand_id: brandId,
      customer_id: "c1",
      lead_id: null,
      type: "note",
      summary: "Called back about the booking",
      detail: null,
      occurred_at: "2026-11-16T04:00:00.000Z",
      staff_id: null,
      outcome: null,
      next_follow_up_at: null,
      task_id: null,
      attachment_url: null,
    };
    const crm = mergeCrm(pack, bucket({ interactions: [added] }));
    expect(crm.interactions).toHaveLength(pack.interactions.length + 1);
    expect(crm.interactions.at(-1)?.id).toBe("i-new");
    expect(crm.interactions.find((i) => i.id === "i-new")?.summary).toBe(
      "Called back about the booking",
    );
  });

  it("patches an existing row in place, keeping the order of the pack", () => {
    const first = pack.campaigns[0];
    const crm = mergeCrm(
      pack,
      bucket({
        campaignOverrides: { [first.id]: { status: "paused" } as Partial<MarketingCampaign> },
      }),
    );
    expect(crm.campaigns).toHaveLength(pack.campaigns.length);
    expect(crm.campaigns[0].id).toBe(first.id);
    expect(crm.campaigns[0].status).toBe("paused");
    expect(crm.campaigns[0].name).toBe(first.name);
  });

  it("tombstones a row the demo user deleted", () => {
    const id = pack.reviews[0].id;
    const crm = mergeCrm(pack, bucket({ reviewOverrides: { [id]: { deleted: true } } }));
    expect(crm.reviews).toHaveLength(pack.reviews.length - 1);
    expect(crm.reviews.some((r) => r.id === id)).toBe(false);
  });

  it("keeps the loyalty ledger append-only", () => {
    const correction = {
      id: "ly-fix",
      brand_id: brandId,
      customer_id: "c1",
      kind: "adjust" as const,
      points: -5,
      reason: "Reversed an accidental grant",
      order_id: null,
      expires_at: null,
      created_at: "2026-01-01T04:00:00.000Z",
    };
    const crm = mergeCrm(pack, bucket({ loyaltyLedger: [correction] }));
    expect(crm.loyaltyLedger).toHaveLength(pack.loyaltyLedger.length + 1);
    // Sorted by time, so the oldest entry first is the new back-dated correction.
    expect(crm.loyaltyLedger[0].id).toBe("ly-fix");
    expect(crm.loyaltyLedger.at(-1)?.id).not.toBe("ly-fix");
  });

  it("merges a rules override instead of replacing the programme", () => {
    const rules = pack.loyaltyRules[0];
    const crm = mergeCrm(pack, bucket({ loyaltyRulesOverride: { point_value: 1 } }));
    expect(crm.loyaltyRules?.point_value).toBe(1);
    expect(crm.loyaltyRules?.tiers).toEqual(rules.tiers);
    expect(crm.loyaltyRules?.earn_mode).toBe(rules.earn_mode);
  });

  it("has exactly one loyalty programme per brand", () => {
    for (const code of DEMO_BRAND_CODES) {
      expect(getDemoBrandPack(code).loyaltyRules).toHaveLength(1);
    }
  });
});

describe("the shipped CRM packs", () => {
  for (const code of DEMO_BRAND_CODES) {
    const pack = getDemoBrandPack(code);
    const brandId = pack.settings.brand_id;

    it(`${code}: every CRM row carries the brand`, () => {
      const rows = [
        ...pack.interactions,
        ...pack.reviews,
        ...pack.complaints,
        ...pack.segments,
        ...pack.campaigns,
        ...pack.loyaltyLedger,
        ...pack.memberships,
      ];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.brand_id).toBe(brandId);
      expect(pack.loyaltyRules[0].brand_id).toBe(brandId);
    });

    it(`${code}: merging is stable and never mixes brands`, () => {
      const crm = mergeCrm(pack, {} as DemoMutableBucket);
      const again = mergeCrm(pack, {} as DemoMutableBucket);
      expect(crm).toEqual(again);
      const other = mergeCrm(
        getDemoBrandPack(code === "BR-1" ? "BR-2" : "BR-1"),
        {} as DemoMutableBucket,
      );
      const ids = new Set(crm.interactions.map((i) => i.id));
      for (const row of other.interactions) expect(ids.has(row.id)).toBe(false);
    });
  }
});
