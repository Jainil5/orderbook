process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import type { Customer } from "@/types/database";
import type { CustomerSegment, MarketingCampaign } from "@/types/crm";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { DEMO_BRAND_CODES } from "@/lib/workspace/constants";
import type { CustomerProfile } from "./metrics";
import {
  EMPTY_CAMPAIGN_INPUT,
  EMPTY_RESULT_INPUT,
  CAMPAIGN_TYPE_LABELS,
  audienceForSegment,
  campaignMetrics,
  isCampaignLive,
  validateCampaignInput,
  validateResultInput,
} from "./campaigns";

const NOW = new Date("2026-11-16T09:00:00.000+05:30");

function profile(
  id: string,
  over: Partial<Customer> & { orders?: number } = {},
): CustomerProfile {
  const { orders, ...customerFields } = over;
  const customer: Customer = {
    id,
    brand_id: "b1",
    name: `Customer ${id}`,
    email: `${id}@example.in`,
    phone: `+91 98250 00${id.slice(-1)}${id.slice(-1)}`,
    marketing_consent: true,
    opted_out: false,
    status: "active",
    ...customerFields,
  };
  const billCount = orders ?? 3;
  return {
    customer,
    orders: billCount,
    lifetimeValue: 2000 * billCount,
    avgOrderValue: 2000,
    dues: 0,
    billsWithDues: 0,
    cancelledOrRefunded: 0,
    firstOrderAt: billCount ? "2026-02-01T04:00:00.000Z" : null,
    lastOrderAt: billCount ? "2026-11-01T04:00:00.000Z" : null,
    daysSinceLastOrder: billCount ? 15 : null,
    joinedAt: "2026-01-01T04:00:00.000Z",
    daysSinceJoin: 320,
    reviewCount: 0,
    avgRating: null,
    openComplaints: 0,
    loyaltyPoints: 0,
    loyaltyTierId: null,
    membershipTierId: null,
    tags: [],
    source: "Walk-in",
    priceTier: "retail",
    status: customer.status ?? "active",
  };
}

function segment(over: Partial<CustomerSegment> = {}): CustomerSegment {
  return {
    id: "sg1",
    brand_id: "b1",
    name: "Regulars",
    description: "",
    kind: "manual",
    rules: null,
    member_ids: [],
    created_at: "2026-10-01T10:00:00.000Z",
    ...over,
  };
}

function campaign(over: Partial<MarketingCampaign> = {}): MarketingCampaign {
  return {
    id: "cm1",
    brand_id: "b1",
    name: "Win-back",
    description: "",
    type: "winback",
    channel: "whatsapp",
    segment_id: null,
    offer_id: null,
    starts_at: null,
    ends_at: null,
    status: "active",
    consent_required: true,
    messages_sent: 0,
    delivered: 0,
    responded: 0,
    redeemed: 0,
    revenue_attributed: 0,
    delivery: "not_connected",
    created_at: "2026-11-01T10:00:00.000Z",
    updated_at: "2026-11-01T10:00:00.000Z",
    ...over,
  };
}

const BOOK = [
  profile("ok"),
  profile("quiet", { orders: 0 }),
  profile("opted", { opted_out: true }),
  profile("noconsent", { marketing_consent: false }),
  profile("archived", { status: "archived" }),
  profile("noemail", { email: null }),
  profile("nophone", { phone: null }),
];

describe("audienceForSegment", () => {
  const run = (
    seg: ReturnType<typeof segment> | null,
    options: { consentRequired: boolean; channel: "whatsapp" | "email" | "sms" | "in_store" },
  ) => {
    const result = audienceForSegment(seg, BOOK, options);
    return {
      ids: result.recipients.map((p) => p.customer.id),
      reasons: Object.fromEntries(result.excluded.map((e) => [e.profile.customer.id, e.reason])),
    };
  };

  it("reaches the whole consented book when no segment is chosen", () => {
    expect(run(null, { consentRequired: true, channel: "whatsapp" }).ids).toEqual([
      "ok",
      "quiet",
      "noemail",
    ]);
  });

  it("names the reason every customer was left out", () => {
    const { reasons } = run(null, { consentRequired: true, channel: "email" });
    expect(reasons).toEqual({
      opted: "Opted out",
      noconsent: "No marketing consent",
      archived: "Archived",
      noemail: "No email on file",
    });
  });

  it("needs an address per channel", () => {
    expect(run(null, { consentRequired: true, channel: "email" }).ids).toEqual([
      "ok",
      "quiet",
      "nophone",
    ]);
    expect(run(null, { consentRequired: true, channel: "sms" }).reasons.noemail).toBeUndefined();
    expect(run(null, { consentRequired: true, channel: "sms" }).reasons.nophone).toBe("No phone on file");
  });

  it("never broadcasts to someone who opted out, consent switch or not", () => {
    expect(run(null, { consentRequired: false, channel: "whatsapp" }).reasons.opted).toBe("Opted out");
  });

  it("treats an in-store conversation as service, not a broadcast", () => {
    const { ids, reasons } = run(null, { consentRequired: true, channel: "in_store" });
    expect(ids).toEqual(["ok", "quiet", "noconsent", "noemail", "nophone"]);
    expect(reasons.archived).toBe("Archived");
  });

  it("honours a manual segment's list", () => {
    const seg = segment({ member_ids: ["ok", "opted", "ghost"] });
    expect(run(seg, { consentRequired: true, channel: "whatsapp" }).ids).toEqual(["ok"]);
  });

  it("re-evaluates a dynamic segment against live data", () => {
    const seg = segment({ kind: "dynamic", rules: { minOrders: 2 } });
    expect(run(seg, { consentRequired: true, channel: "whatsapp" }).ids).toEqual(["ok", "noemail"]);
  });

  it("falls back to the stored list when a dynamic segment has no usable rules", () => {
    const seg = segment({ kind: "dynamic", rules: {}, member_ids: ["ok"] });
    expect(run(seg, { consentRequired: true, channel: "whatsapp" }).ids).toEqual(["ok"]);
  });
});

describe("campaignMetrics", () => {
  it("refuses to invent rates from nothing", () => {
    const metrics = campaignMetrics(campaign());
    expect(metrics.reach).toBe(0);
    expect(metrics.deliveredRate).toBeNull();
    expect(metrics.responseRate).toBeNull();
    expect(metrics.redemptionRate).toBeNull();
    expect(metrics.revenuePerMessage).toBeNull();
  });

  it("derives the funnel from the numbers a human logged", () => {
    const metrics = campaignMetrics(
      campaign({ delivery: "manual_log", messages_sent: 200, delivered: 180, responded: 30, redeemed: 12, revenue_attributed: 36000 }),
    );
    expect(metrics.deliveredRate).toBe(90);
    expect(metrics.responseRate).toBe(15);
    expect(metrics.redemptionRate).toBe(6);
    expect(metrics.revenuePerMessage).toBe(180);
    expect(metrics.canReportDelivery).toBe(true);
  });

  it("never presents an unconnected campaign as measured", () => {
    expect(campaignMetrics(campaign()).canReportDelivery).toBe(false);
  });
});

describe("validateCampaignInput", () => {
  const KNOWN = { segmentIds: ["sg1"], offerIds: ["of1"] };

  it("accepts a plain draft", () => {
    const result = validateCampaignInput({ ...EMPTY_CAMPAIGN_INPUT, name: "Diwali" }, KNOWN);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.segment_id).toBeNull();
      expect(result.value.offer_id).toBeNull();
      expect(result.value.starts_at).toBeNull();
      expect(result.value.consent_required).toBe(true);
    }
  });

  it("needs a name", () => {
    expect(validateCampaignInput({ ...EMPTY_CAMPAIGN_INPUT, name: "  " }, KNOWN).ok).toBe(false);
  });

  it("only offers types the labels cover", () => {
    expect(validateCampaignInput({ ...EMPTY_CAMPAIGN_INPUT, name: "x", type: "blast" }, KNOWN).ok).toBe(false);
    for (const type of Object.keys(CAMPAIGN_TYPE_LABELS)) {
      expect(validateCampaignInput({ ...EMPTY_CAMPAIGN_INPUT, name: "x", type }, KNOWN).ok).toBe(true);
    }
  });

  it("rejects a channel or status outside the enum", () => {
    expect(validateCampaignInput({ ...EMPTY_CAMPAIGN_INPUT, name: "x", channel: "telepathy" }, KNOWN).ok).toBe(false);
    expect(validateCampaignInput({ ...EMPTY_CAMPAIGN_INPUT, name: "x", status: "sent" }, KNOWN).ok).toBe(false);
  });

  it("will not point at a segment or offer that does not exist", () => {
    expect(validateCampaignInput({ ...EMPTY_CAMPAIGN_INPUT, name: "x", segment_id: "sg9" }, KNOWN).ok).toBe(false);
    expect(validateCampaignInput({ ...EMPTY_CAMPAIGN_INPUT, name: "x", offer_id: "of9" }, KNOWN).ok).toBe(false);
    expect(validateCampaignInput({ ...EMPTY_CAMPAIGN_INPUT, name: "x", segment_id: "sg1", offer_id: "of1" }, KNOWN).ok).toBe(true);
  });

  it("keeps a campaign from ending before it starts", () => {
    const bad = {
      ...EMPTY_CAMPAIGN_INPUT,
      name: "x",
      starts_at: "2026-12-01",
      ends_at: "2026-11-01",
    };
    expect(validateCampaignInput(bad, KNOWN)).toEqual({
      ok: false,
      message: expect.stringMatching(/cannot end before/i),
    });
  });

  it("rejects a date it cannot read", () => {
    expect(validateCampaignInput({ ...EMPTY_CAMPAIGN_INPUT, name: "x", starts_at: "whenever" }, KNOWN).ok).toBe(false);
  });

  it("stores a bare date as the moment the day begins", () => {
    const result = validateCampaignInput(
      { ...EMPTY_CAMPAIGN_INPUT, name: "Diwali drop", starts_at: "2026-11-08", ends_at: "2026-11-12", consent_required: "no" },
      KNOWN,
    );
    expect(result.ok && result.value.starts_at).toBe(new Date(2026, 10, 8, 0, 0).toISOString());
    expect(result.ok && result.value.consent_required).toBe(false);
    expect(result.ok && result.value.name).toBe("Diwali drop");
  });
});

describe("validateResultInput", () => {
  it("reads blanks as zero and keeps the numbers whole", () => {
    const result = validateResultInput({ ...EMPTY_RESULT_INPUT, messages_sent: "1,000", responded: "12" }, 1000);
    expect(result.ok && result.value).toEqual({
      messages_sent: 1000,
      delivered: 0,
      responded: 12,
      redeemed: 0,
      revenue_attributed: 0,
      delivery: "manual_log",
    });
  });

  it("labels every entry as a human observation, never as a send report", () => {
    const result = validateResultInput(EMPTY_RESULT_INPUT, 10);
    expect(result.ok && result.value.delivery).toBe("manual_log");
  });

  it("caps sent at the audience it was aimed at", () => {
    expect(validateResultInput({ ...EMPTY_RESULT_INPUT, messages_sent: "50" }, 20)).toEqual({
      ok: false,
      message: expect.stringMatching(/cannot be more than 20/),
    });
  });

  it("refuses a funnel that gets wider as it goes", () => {
    const fail = (over: Partial<typeof EMPTY_RESULT_INPUT>) => {
      const result = validateResultInput({ ...EMPTY_RESULT_INPUT, ...over }, 10);
      return result.ok ? "" : result.message;
    };
    expect(fail({ messages_sent: "10", delivered: "11" })).toMatch(/delivered/i);
    expect(fail({ messages_sent: "10", responded: "11" })).toMatch(/responses/i);
    expect(fail({ messages_sent: "10", responded: "5", redeemed: "6" })).toMatch(/redemptions/i);
  });

  it("rejects negatives and nonsense", () => {
    for (const value of ["-3", "abc", "1.5.2"]) {
      expect(validateResultInput({ ...EMPTY_RESULT_INPUT, delivered: value }, 10).ok).toBe(false);
    }
  });

  it("rounds rupees rather than storing fractions of a paisa", () => {
    const result = validateResultInput({ ...EMPTY_RESULT_INPUT, messages_sent: "4", revenue_attributed: "1999.6" }, 4);
    expect(result.ok && result.value.revenue_attributed).toBe(2000);
  });
});

describe("isCampaignLive", () => {
  it("is live only inside its own window", () => {
    expect(isCampaignLive(campaign(), NOW)).toBe(true);
    expect(
      isCampaignLive(campaign({ starts_at: "2026-12-01T00:00:00.000Z" }), NOW),
    ).toBe(false);
    expect(isCampaignLive(campaign({ ends_at: "2026-11-01T00:00:00.000Z" }), NOW)).toBe(false);
  });

  it("stays quiet outside the active status", () => {
    for (const status of ["draft", "scheduled", "paused", "completed", "cancelled"] as const) {
      expect(isCampaignLive(campaign({ status }), NOW)).toBe(false);
    }
  });
});

describe("the shipped campaigns", () => {
  it("type every campaign from the shared list", () => {
    for (const code of DEMO_BRAND_CODES) {
      for (const row of getDemoBrandPack(code).campaigns) {
        expect(CAMPAIGN_TYPE_LABELS[row.type], `${code} ${row.id}`).toBeDefined();
      }
    }
  });

  it("claims no delivery it cannot prove", () => {
    for (const code of DEMO_BRAND_CODES) {
      for (const row of getDemoBrandPack(code).campaigns) {
        if (row.delivery === "not_connected") {
          expect([row.id, row.messages_sent, row.delivered], code).toEqual([row.id, 0, 0]);
        } else {
          expect(campaignMetrics(row).canReportDelivery).toBe(true);
        }
      }
    }
  });
});
