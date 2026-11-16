"use server";

import { fail, oneOf, refId, text, type Validated } from "@/lib/business/validate";
import {
  auditCrm,
  crmCsv,
  crmRecordId,
  crmRefs,
  guardCrm,
  revalidateCrm,
  type CrmActionState,
} from "@/lib/crm/actions-kit";
import {
  consentedCustomerIds,
  describeSegmentRules,
  loadCrmWorkspace,
  segmentMemberIds,
} from "@/lib/crm/loader";
import type { Customer } from "@/types/database";
import type { CustomerSegment, SegmentRules } from "@/types/crm";

/**
 * Segment actions (manage scope).
 *
 * A dynamic segment stores RULES ONLY — membership is recomputed from real
 * customer/order/review rows on every read, so a saved segment can never carry
 * a stale member list. A manual segment stores `manual_customer_ids` and every
 * id is re-checked against the brand's own customers before it is written.
 */

const SEGMENT_KINDS = ["dynamic", "manual"] as const;
const PRICE_TIERS = ["retail", "wholesale"] as const;

export type SegmentInput = {
  id?: string | null;
  name: string;
  description?: string | null;
  kind: string;
  /** Dynamic rules. Blank means "no constraint on this field". */
  min_orders?: string | null;
  max_orders?: string | null;
  min_total_spend?: string | null;
  max_total_spend?: string | null;
  last_purchase_within_days?: string | null;
  last_purchase_over_days?: string | null;
  tags_any?: string | null;
  sources_any?: string | null;
  price_tiers_any?: string | null;
  has_outstanding_dues?: boolean | string | null;
  has_unresolved_complaints?: boolean | string | null;
  min_average_review_rating?: string | null;
  loyalty_tiers_any?: string | null;
  membership_plans_any?: string | null;
  /** Manual segments only. */
  manual_customer_ids?: string[] | null;
};

/* ------------------------------------------------------------------ */
/* Parsing helpers (shared by save + preview so the two cannot drift)  */
/* ------------------------------------------------------------------ */

function optionalText(value: unknown, field: string, max = 500) {
  return text(value, field, max, false);
}

function wholeNumber(value: unknown, field: string): Validated<number | null> {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return fail(`Enter a whole number (0 or more) for ${field}.`);
  }
  return { ok: true, value: n };
}

function amount(value: unknown, field: string): Validated<number | null> {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fail(`Enter a valid amount for ${field}.`);
  return { ok: true, value: Math.round(n * 100) / 100 };
}

function rating(value: unknown): Validated<number | null> {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 5) {
    return fail("Average review rating must be between 0 and 5.");
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/** Comma-separated input → clean, de-duplicated list. */
function csvList(value: unknown): string[] {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value.join(",") : "";
  const seen: string[] = [];
  for (const part of raw.split(",")) {
    const item = part.trim().slice(0, 60);
    if (item && !seen.includes(item)) seen.push(item);
  }
  return seen.slice(0, 60);
}

function priceTierList(value: unknown): Validated<string[] | null> {
  const list = csvList(value);
  if (!list.length) return { ok: true, value: null };
  for (const tier of list) {
    if (!(PRICE_TIERS as readonly string[]).includes(tier)) {
      return fail("Pick a valid price tier (retail or wholesale).");
    }
  }
  return { ok: true, value: list };
}

function truthy(value: unknown): boolean | null {
  if (value === true || value === "true" || value === "on") return true;
  if (value === false || value === "false") return null;
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw === "1";
}

function rulesFromInput(input: SegmentInput): Validated<SegmentRules> {
  const minOrders = wholeNumber(input.min_orders, "minimum orders");
  if (!minOrders.ok) return minOrders;
  const maxOrders = wholeNumber(input.max_orders, "maximum orders");
  if (!maxOrders.ok) return maxOrders;
  if (minOrders.value != null && maxOrders.value != null && minOrders.value > maxOrders.value) {
    return fail("Minimum orders cannot be higher than maximum orders.");
  }
  const minSpend = amount(input.min_total_spend, "minimum total spend");
  if (!minSpend.ok) return minSpend;
  const maxSpend = amount(input.max_total_spend, "maximum total spend");
  if (!maxSpend.ok) return maxSpend;
  if (minSpend.value != null && maxSpend.value != null && minSpend.value > maxSpend.value) {
    return fail("Minimum total spend cannot be higher than maximum total spend.");
  }
  const within = wholeNumber(input.last_purchase_within_days, "last purchase within days");
  if (!within.ok) return within;
  const over = wholeNumber(input.last_purchase_over_days, "no purchase for days");
  if (!over.ok) return over;
  if (within.value != null && over.value != null) {
    return fail(
      "Pick one purchase window: a segment cannot mean both “bought recently” and “bought long ago”.",
    );
  }
  const minRating = rating(input.min_average_review_rating);
  if (!minRating.ok) return minRating;
  const tiers = priceTierList(input.price_tiers_any);
  if (!tiers.ok) return tiers;

  const rules: SegmentRules = {
    minOrders: minOrders.value,
    maxOrders: maxOrders.value,
    minTotalSpend: minSpend.value,
    maxTotalSpend: maxSpend.value,
    lastPurchaseWithinDays: within.value,
    lastPurchaseOverDays: over.value,
    tagsAny: csvList(input.tags_any).length ? csvList(input.tags_any) : null,
    sourcesAny: csvList(input.sources_any).length ? csvList(input.sources_any) : null,
    priceTiersAny: tiers.value as SegmentRules["priceTiersAny"],
    hasOutstandingDues: truthy(input.has_outstanding_dues),
    hasUnresolvedComplaints: truthy(input.has_unresolved_complaints),
    minAverageReviewRating: minRating.value,
    loyaltyTiersAny: csvList(input.loyalty_tiers_any).length ? csvList(input.loyalty_tiers_any) : null,
    membershipPlansAny: csvList(input.membership_plans_any).length
      ? csvList(input.membership_plans_any)
      : null,
  };
  return { ok: true, value: rules };
}

function ruleCount(rules: SegmentRules): number {
  return Object.values(rules).filter((v) => v !== null && v !== undefined && v !== false).length;
}

function manualIdsFromInput(
  value: unknown,
  customerIds: readonly string[],
): Validated<string[]> {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  const ids: string[] = [];
  for (const item of raw) {
    const result = refId(item, customerIds, "Customer");
    if (!result.ok || !result.value) {
      return fail(
        "One of the selected customers does not belong to this brand. Refresh the list and pick again.",
      );
    }
    if (!ids.includes(result.value)) ids.push(result.value);
  }
  return { ok: true, value: ids.slice(0, 5000) };
}

/** Draft segment from form input — used for previews, never stored as-is. */
function draftSegment(input: SegmentInput, kind: "dynamic" | "manual", crmBrandId: string, asOf: string, rules: SegmentRules, manualIds: string[]): CustomerSegment {
  return {
    id: typeof input.id === "string" && input.id ? input.id : "segment-draft",
    brand_id: crmBrandId,
    name: "Segment draft",
    description: null,
    kind,
    rules: kind === "dynamic" ? rules : {},
    manual_customer_ids: kind === "manual" ? manualIds : [],
    created_at: asOf,
    updated_at: asOf,
  };
}

/** Why a matched customer may not be contacted, in the customer's own record. */
function exclusionReason(customer: Customer | undefined): string {
  if (!customer) return "No longer in the customer directory";
  if (customer.status === "archived") return "Archived customer";
  if (customer.opted_out_at) return `Opted out ${customer.opted_out_at.slice(0, 10)}`;
  if (customer.marketing_consent === "declined") return "Marketing consent declined";
  return "Marketing consent never asked";
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export async function saveSegmentAction(input: SegmentInput): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };
  const refs = crmRefs(crm);

  const name = text(input.name, "Segment name", 120);
  if (!name.ok) return name;
  const description = optionalText(input.description, "Description", 500);
  if (!description.ok) return description;
  const kind = oneOf(input.kind, SEGMENT_KINDS, "Segment type");
  if (!kind.ok) return kind;

  const emptyRules: SegmentRules = {};
  let rules: SegmentRules = emptyRules;
  let manualIds: string[] = [];

  if (kind.value === "dynamic") {
    const parsed = rulesFromInput(input);
    if (!parsed.ok) return parsed;
    rules = parsed.value;
    if (ruleCount(rules) === 0) {
      return {
        ok: false,
        message:
          "Add at least one rule. A dynamic segment with no rules is never allowed to quietly match everybody.",
      };
    }
    manualIds = [];
  } else {
    const parsed = manualIdsFromInput(input.manual_customer_ids, refs.customerIds);
    if (!parsed.ok) return parsed;
    manualIds = parsed.value;
    rules = emptyRules;
  }

  // An id from the client has to be this workspace's own row — see crmRecordId.
  const id = crmRecordId(input.id, refs.segmentIds, "Segment");
  if (!id.ok) return id;
  const row = {
    id: id.value,
    name: name.value,
    description: description.value || null,
    kind: kind.value,
    rules,
    manual_customer_ids: manualIds,
  };

  const existing = await crm.repo.find("customer_segments", id.value);
  const saved = existing
    ? await crm.repo.patch("customer_segments", id.value, row)
    : await crm.repo.save("customer_segments", { ...row, brand_id: guard.brandId });
  if (!saved) return { ok: false, message: "Segment not found." };

  const matched = segmentMemberIds(crm, saved).length;
  const contactable = consentedCustomerIds(crm, segmentMemberIds(crm, saved)).length;
  await auditCrm(
    guard,
    existing ? "crm.segment.updated" : "crm.segment.created",
    "crm_segment",
    saved.id,
    `${saved.name} — ${matched} live members, ${contactable} contactable`,
  );
  revalidateCrm();
  return {
    ok: true,
    message: `${existing ? "Segment updated" : "Segment created"} — ${matched} live member${
      matched === 1 ? "" : "s"
    }, ${contactable} you may contact.`,
  };
}

export async function deleteSegmentAction(id: string): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const segment = await crm.repo.find("customer_segments", id);
  if (!segment) return { ok: false, message: "Segment not found." };

  // A campaign that still points here would lose its audience mid-flight.
  const users = crm.campaigns.filter((campaign) => campaign.segment_id === id);
  if (users.length) {
    const names = users.slice(0, 3).map((c) => `“${c.name}”`).join(", ");
    return {
      ok: false,
      message: `Cannot delete — ${users.length} campaign${
        users.length === 1 ? "" : "s"
      } still use${users.length === 1 ? "s" : ""} this segment (${names}${
        users.length > 3 ? ", …" : ""
      }). Re-point or cancel ${users.length === 1 ? "it" : "them"} first.`,
    };
  }

  await crm.repo.remove("customer_segments", id);
  await auditCrm(guard, "crm.segment.deleted", "crm_segment", id, segment.name);
  revalidateCrm();
  return { ok: true, message: "Segment deleted. Campaigns were not touched." };
}

/* ------------------------------------------------------------------ */
/* Preview: who matches vs who we may contact                          */
/* ------------------------------------------------------------------ */

export type SegmentPreview = {
  kind: "dynamic" | "manual";
  matched: number;
  contactable: number;
  blocked: number;
  ruleLines: string[];
  sample: { name: string; contactable: boolean; reason: string | null }[];
};

export type SegmentPreviewResult =
  | { ok: true; preview: SegmentPreview }
  | { ok: false; message: string };

export async function previewSegmentAudienceAction(
  input: SegmentInput,
): Promise<SegmentPreviewResult> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };
  const refs = crmRefs(crm);

  const kind = oneOf(input.kind, SEGMENT_KINDS, "Segment type");
  if (!kind.ok) return kind;

  let rules: SegmentRules = {};
  let manualIds: string[] = [];
  if (kind.value === "dynamic") {
    const parsed = rulesFromInput(input);
    if (!parsed.ok) return parsed;
    rules = parsed.value;
    if (ruleCount(rules) === 0) {
      return { ok: false, message: "Add at least one rule before previewing." };
    }
  } else {
    const parsed = manualIdsFromInput(input.manual_customer_ids, refs.customerIds);
    if (!parsed.ok) return parsed;
    manualIds = parsed.value;
    if (!manualIds.length) {
      return { ok: false, message: "Pick at least one customer for a manual segment." };
    }
  }

  const draft = draftSegment(input, kind.value, guard.brandId, crm.asOf, rules, manualIds);
  const matchedIds = segmentMemberIds(crm, draft);
  const contactableIds = consentedCustomerIds(crm, matchedIds);
  const contactableSet = new Set(contactableIds);
  const byId = new Map(crm.customers.map((c) => [c.id, c]));
  const sample = matchedIds.slice(0, 12).map((id) => ({
    name: byId.get(id)?.name ?? "Customer",
    contactable: contactableSet.has(id),
    reason: contactableSet.has(id) ? null : exclusionReason(byId.get(id)),
  }));

  return {
    ok: true,
    preview: {
      kind: kind.value,
      matched: matchedIds.length,
      contactable: contactableIds.length,
      blocked: matchedIds.length - contactableIds.length,
      ruleLines: describeSegmentRules(rules),
      sample,
    },
  };
}

/** The saved segments with their live counts, for the owner to work offline. */
export async function exportSegmentsCsvAction(): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; message: string }
> {
  const guard = await guardCrm("log");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const rows = crm.segments.map((segment) => {
    const matchedIds = segmentMemberIds(crm, segment);
    const contactable = consentedCustomerIds(crm, matchedIds);
    return {
      name: segment.name,
      kind: segment.kind,
      description: segment.description ?? "",
      live_members: matchedIds.length,
      contactable_members: contactable.length,
      rules: describeSegmentRules(segment.rules).join("; "),
      manual_customer_ids:
        segment.kind === "manual" ? (segment.manual_customer_ids ?? []).length : "",
      used_by_campaigns: crm.campaigns.filter((c) => c.segment_id === segment.id).length,
      updated_at: segment.updated_at,
    };
  });
  return crmCsv(`crm-segments-${guard.brandCode}.csv`, rows);
}
