import type { Customer } from "@/types/database";
import type { Lead } from "@/types/operations";
import type { CustomerProfile } from "./metrics";

/**
 * Turning a pipeline entry into a billing customer.
 *
 * Conversion never deletes the lead: it stamps `converted_customer_id` on the
 * lead row and creates the customer, so the enquiry, the requirement and every
 * interaction logged against the lead stay readable from the Customer 360.
 */

export type ConversionInput = {
  price_tier: string;
  tags: string;
  marketing_consent: string;
  notes: string;
};

export const EMPTY_CONVERSION_INPUT: ConversionInput = {
  price_tier: "",
  tags: "",
  marketing_consent: "no",
  notes: "",
};

/**
 * Consent is deliberately off by default. An enquiry that walked in through
 * Instagram did not opt in to marketing, so a converted lead cannot be
 * messaged until somebody ticks the box on the customer record.
 */
export function customerFromLead(
  lead: Lead,
  input: ConversionInput,
  params: { brandId: string; id: string; now: Date },
): Customer {
  const tags = input.tags
    .split(/[,\n|]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
  return {
    id: params.id,
    brand_id: params.brandId,
    name: lead.contact_name.trim().slice(0, 120),
    email: lead.email,
    phone: lead.phone,
    notes:
      [
        input.notes.trim() || null,
        `Converted from enquiry "${lead.requirement}"${lead.quotation_number ? ` (${lead.quotation_number})` : ""}`,
      ]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 500) || null,
    price_tier: input.price_tier === "wholesale" ? "wholesale" : "retail",
    status: "active",
    source: lead.source ?? "Pipeline",
    tags,
    address: lead.site_address,
    created_at: params.now.toISOString(),
    marketing_consent: input.marketing_consent === "yes",
    opted_out: false,
    custom_fields: null,
  };
}

/** The lead row after a conversion — stage closes, link to the customer is set. */
export function convertedLeadPatch(customerId: string, now: Date): Partial<Lead> {
  return {
    stage: "won",
    converted_customer_id: customerId,
    converted_at: now.toISOString(),
    next_action_at: null,
  };
}

/**
 * A customer that already shares the lead's phone or email: converting would
 * create a duplicate, so the UI offers to attach the enquiry to that record
 * instead.
 */
export function findConversionClash(
  lead: Lead,
  profiles: CustomerProfile[],
): CustomerProfile | null {
  const phone = (lead.phone ?? "").replace(/\D/g, "");
  const email = (lead.email ?? "").trim().toLowerCase();
  for (const profile of profiles) {
    const theirPhone = (profile.customer.phone ?? "").replace(/\D/g, "");
    if (phone.length >= 10 && theirPhone.endsWith(phone.slice(-10))) return profile;
    const theirEmail = (profile.customer.email ?? "").trim().toLowerCase();
    if (email && theirEmail === email) return profile;
  }
  return null;
}

export function conversionCheck(
  lead: Lead,
): { ok: true } | { ok: false; message: string } {
  if (lead.stage === "won" && lead.converted_customer_id) {
    return { ok: false, message: "This enquiry is already a customer." };
  }
  if (!lead.contact_name.trim()) {
    return { ok: false, message: "Add a contact name before converting." };
  }
  if (!lead.phone && !lead.email) {
    return {
      ok: false,
      message: "A customer record needs a phone or an email to bill against.",
    };
  }
  return { ok: true };
}

/** Interactions still logged on the lead — the count the conversion prompt shows. */
export function leadHistoryCount(
  leadId: string,
  interactions: { lead_id: string | null }[],
): number {
  return interactions.filter((i) => i.lead_id === leadId).length;
}
