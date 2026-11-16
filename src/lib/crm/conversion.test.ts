process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import type { Customer } from "@/types/database";
import type { Lead } from "@/types/operations";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { DEMO_BRAND_CODES } from "@/lib/workspace/constants";
import type { CustomerProfile } from "./metrics";
import {
  EMPTY_CONVERSION_INPUT,
  conversionCheck,
  convertedLeadPatch,
  customerFromLead,
  findConversionClash,
  leadHistoryCount,
  type ConversionInput,
} from "./conversion";

const NOW = new Date("2026-11-16T09:00:00.000Z");

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: "l1",
    brand_id: "b1",
    contact_name: "Anjali Shah",
    phone: "+91 98250 11111",
    email: "anjali@example.in",
    source: "Instagram",
    requirement: "Table for six every Friday",
    site_address: null,
    stage: "quote_sent",
    estimated_value: 40000,
    owner_staff_id: null,
    next_action_at: "2026-11-20T04:00:00.000Z",
    quotation_number: null,
    created_at: "2026-11-01T04:00:00.000Z",
    converted_customer_id: null,
    converted_at: null,
    ...over,
  };
}

function input(over: Partial<ConversionInput> = {}): ConversionInput {
  return { ...EMPTY_CONVERSION_INPUT, ...over };
}

function profile(customer: Partial<Customer>): CustomerProfile {
  return {
    customer: {
      id: "c1",
      brand_id: "b1",
      name: "Existing",
      ...customer,
    } as Customer,
  } as CustomerProfile;
}

describe("customerFromLead", () => {
  it("carries the contact across and stamps the new record", () => {
    const customer = customerFromLead(
      lead({ site_address: "Pal, Surat 395009" }),
      input(),
      { brandId: "b1", id: "new-c", now: NOW },
    );
    expect(customer).toMatchObject({
      id: "new-c",
      brand_id: "b1",
      name: "Anjali Shah",
      email: "anjali@example.in",
      phone: "+91 98250 11111",
      address: "Pal, Surat 395009",
      status: "active",
      opted_out: false,
      created_at: NOW.toISOString(),
    });
  });

  it("leaves marketing consent off unless somebody ticks it", () => {
    expect(customerFromLead(lead(), input(), { brandId: "b1", id: "n", now: NOW }).marketing_consent).toBe(false);
    expect(
      customerFromLead(lead(), input({ marketing_consent: "yes" }), { brandId: "b1", id: "n", now: NOW })
        .marketing_consent,
    ).toBe(true);
  });

  it("records the enquiry and quotation in the note, not in a hidden table", () => {
    const note = customerFromLead(
      lead({ quotation_number: "BC-Q-100" }),
      input({ notes: "Prefers the courtyard" }),
      { brandId: "b1", id: "n", now: NOW },
    ).notes;
    expect(note).toBe(
      "Prefers the courtyard — Converted from enquiry \"Table for six every Friday\" (BC-Q-100)",
    );
    expect(
      customerFromLead(lead(), input(), { brandId: "b1", id: "n", now: NOW }).notes,
    ).toBe("Converted from enquiry \"Table for six every Friday\"");
  });

  it("splits tags on commas, newlines and pipes and caps the list", () => {
    expect(customerFromLead(lead(), input({ tags: "trade, designer\nVIP|repeat ," }), { brandId: "b1", id: "n", now: NOW }).tags).toEqual([
      "trade",
      "designer",
      "VIP",
      "repeat",
    ]);
    const many = Array.from({ length: 30 }, (_, i) => `t${i}`).join(",");
    expect(customerFromLead(lead(), input({ tags: many }), { brandId: "b1", id: "n", now: NOW }).tags).toHaveLength(12);
  });

  it("treats anything but wholesale as retail", () => {
    expect(customerFromLead(lead(), input({ price_tier: "wholesale" }), { brandId: "b1", id: "n", now: NOW }).price_tier).toBe(
      "wholesale",
    );
    expect(customerFromLead(lead(), input({ price_tier: "Wolesale" }), { brandId: "b1", id: "n", now: NOW }).price_tier).toBe(
      "retail",
    );
  });

  it("falls back to Pipeline when the enquiry never had a source", () => {
    expect(customerFromLead(lead({ source: null }), input(), { brandId: "b1", id: "n", now: NOW }).source).toBe("Pipeline");
  });

  it("trims and caps the name so a paste cannot blow up the column", () => {
    expect(customerFromLead(lead({ contact_name: "  Rajesh  " }), input(), { brandId: "b1", id: "n", now: NOW }).name).toBe(
      "Rajesh",
    );
    expect(
      customerFromLead(lead({ contact_name: "x".repeat(300) }), input(), { brandId: "b1", id: "n", now: NOW }).name,
    ).toHaveLength(120);
  });
});

describe("convertedLeadPatch", () => {
  it("closes the board slot and links the customer", () => {
    expect(convertedLeadPatch("new-c", NOW)).toEqual({
      stage: "won",
      converted_customer_id: "new-c",
      converted_at: NOW.toISOString(),
      next_action_at: null,
    });
  });
});

describe("conversionCheck", () => {
  it("refuses to convert the same enquiry twice", () => {
    expect(
      conversionCheck(lead({ stage: "won", converted_customer_id: "c1" })),
    ).toEqual({ ok: false, message: "This enquiry is already a customer." });
  });

  it("needs a name", () => {
    expect(conversionCheck(lead({ contact_name: "   " })).ok).toBe(false);
  });

  it("needs something to bill against", () => {
    expect(conversionCheck(lead({ phone: null, email: null })).ok).toBe(false);
  });

  it("accepts a phone-only enquiry", () => {
    expect(conversionCheck(lead({ email: null }))).toEqual({ ok: true });
  });
});

describe("findConversionClash", () => {
  it("matches on the last ten digits whatever the formatting", () => {
    const book = [profile({ id: "c9", phone: "98250-11111" })];
    expect(findConversionClash(lead({ phone: "+91 98250 11111" }), book)?.customer.id).toBe("c9");
  });

  it("matches email case-insensitively", () => {
    const book = [profile({ id: "c9", email: "Anjali@Example.in", phone: null })];
    expect(findConversionClash(lead({ email: "anjali@example.in" }), book)?.customer.id).toBe("c9");
  });

  it("will not match a short number", () => {
    const book = [profile({ id: "c9", phone: "1234" })];
    expect(findConversionClash(lead({ phone: "1234", email: null }), book)).toBeNull();
  });

  it("stays quiet when the lead has no contact details at all", () => {
    const book = [profile({ id: "c9", phone: null, email: null })];
    expect(findConversionClash(lead({ phone: null, email: null }), book)).toBeNull();
  });

  it("returns the first hit, so the UI can offer that record", () => {
    const book = [profile({ id: "a", email: "x@example.in" }), profile({ id: "b", email: "x@example.in" })];
    expect(findConversionClash(lead({ email: "x@example.in" }), book)?.customer.id).toBe("a");
  });
});

describe("leadHistoryCount", () => {
  it("counts only this lead's interactions", () => {
    expect(
      leadHistoryCount("l1", [{ lead_id: "l1" }, { lead_id: "l2" }, { lead_id: null }, { lead_id: "l1" }]),
    ).toBe(2);
  });
});

describe("the conversion columns in the shipped packs", () => {
  for (const code of DEMO_BRAND_CODES) {
    it(`${code}: every converted enquiry points at a real customer`, () => {
      const pack = getDemoBrandPack(code);
      const converted = pack.leads.filter((l) => l.converted_customer_id || l.converted_at);
      for (const l of converted) {
        expect(l.stage).toBe("won");
        expect(l.converted_at).not.toBeNull();
        const customer = pack.customers.find((c) => c.id === l.converted_customer_id);
        expect(customer).toBeDefined();
        // Same rule the conversion action applies: the customer is created at
        // the moment of the conversion, and the enquiry predates it.
        expect(customer!.created_at).toBe(l.converted_at);
        expect(Date.parse(l.created_at)).toBeLessThan(Date.parse(l.converted_at!));
      }
    });
  }
});
