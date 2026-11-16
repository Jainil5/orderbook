import type { Customer, CustomerUpsertInput } from "@/types/database";

/**
 * The CRM-only columns of a customer record, with one merge rule shared by
 * every write path (the CSV service and the CRM actions) so they cannot
 * drift:
 *
 * - `undefined` means "this form does not manage that field" → keep what is
 *   stored. The customers page sends name/email/phone/notes only, so a save
 *   there must never wipe tags, consent or an archive flag.
 * - `null` or `""` means "clear it".
 *
 * Only the customers service and the CRM actions use this — never trust a
 * client-supplied `brand_id` or `id`.
 */
export const CUSTOMER_CRM_FIELDS = [
  "dob",
  "gender",
  "address",
  "source",
  "tags",
  "custom_fields",
  "status",
  "marketing_consent",
  "opted_out_at",
] as const;

export type CustomerCrmField = (typeof CUSTOMER_CRM_FIELDS)[number];
export type CustomerCrmValues = Pick<Customer, CustomerCrmField>;

const GENDERS = ["male", "female", "other"] as const;
const CONSENTS = ["granted", "declined"] as const;

function cleaned(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const raw = String(value).trim().slice(0, 300);
  return raw === "" ? null : raw;
}

/** Tags as a de-duplicated, ordered list of non-empty labels (max 20). */
export function normalizeTags(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const out: string[] = [];
  for (const item of raw) {
    const tag = String(item).trim().slice(0, 40);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= 20) break;
  }
  return out;
}

export function normalizeCustomFields(
  value: unknown,
): Record<string, string> | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const label = key.trim().slice(0, 40);
    const text = item === null || item === undefined ? "" : String(item).trim().slice(0, 200);
    if (!label || !text) continue;
    out[label] = text;
    if (Object.keys(out).length >= 20) break;
  }
  return out;
}

/**
 * Read the CRM columns out of an upsert input, leaving anything the caller
 * did not send as `undefined` so the merge can skip it.
 */
export function crmFieldsFromInput(
  input: CustomerUpsertInput,
): Partial<CustomerCrmValues> {
  const next: Partial<CustomerCrmValues> = {};
  const dob = cleaned(input.dob);
  if (dob !== undefined) next.dob = dob;
  const address = cleaned(input.address);
  if (address !== undefined) next.address = address;
  const source = cleaned(input.source);
  if (source !== undefined) next.source = source;
  // An unrecognised value means the form is stale, not that the field was
  // cleared — leave the stored value alone.
  if (input.gender !== undefined) {
    if (input.gender === null || GENDERS.includes(input.gender)) {
      next.gender = input.gender;
    }
  }
  if (input.marketing_consent !== undefined) {
    if (input.marketing_consent === null || CONSENTS.includes(input.marketing_consent)) {
      next.marketing_consent = input.marketing_consent;
    }
  }
  if (input.status !== undefined) {
    next.status = input.status === "archived" ? "archived" : null;
  }
  const optedOut = cleaned(input.opted_out_at);
  if (optedOut !== undefined) next.opted_out_at = optedOut;
  const tags = normalizeTags(input.tags);
  if (tags !== undefined) next.tags = tags;
  const fields = normalizeCustomFields(input.custom_fields);
  if (fields !== undefined) next.custom_fields = fields;
  return next;
}

/**
 * Merge any defined fields into a stored customer. Fields present as
 * `undefined` are skipped — that is what keeps a form which manages only
 * contact details from clearing tags, consent or an archive flag.
 */
export function mergeCustomerCrmFields(
  existing: Customer,
  updates: Partial<Customer>,
): Customer {
  const next: Customer = { ...existing };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    Object.assign(next, { [key]: value });
  }
  return next;
}

/** When consent is declined or an opt-out is recorded, stamp the opt-out date. */
export function withConsentStamped(
  values: Partial<CustomerCrmValues>,
  nowIso: string,
): Partial<CustomerCrmValues> {
  if (values.marketing_consent === undefined) return values;
  if (values.marketing_consent === "declined" && !values.opted_out_at) {
    return { ...values, opted_out_at: nowIso };
  }
  if (values.marketing_consent === "granted") return { ...values, opted_out_at: null };
  return values;
}
