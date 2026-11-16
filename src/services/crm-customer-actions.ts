"use server";

import { oneOf, text } from "@/lib/business/validate";
import {
  auditCrm,
  crmCsv,
  crmRefs,
  guardCrm,
  revalidateCrm,
  type CrmActionState,
} from "@/lib/crm/actions-kit";
import { loadCrmWorkspace, statById } from "@/lib/crm/loader";
import { updateCustomerAction } from "@/services/operations-actions";

/**
 * CRM writes against the *existing* customer entity. There is no CRM copy of
 * a customer: every change here goes through the app's single customer write
 * path (`updateCustomerAction`), which handles both the demo workspace and the
 * CSV/live store.
 *
 * The CRM never deletes a customer — an unwanted record is archived, so past
 * orders keep their counterparty.
 */

const CONSENT_VALUES = ["granted", "declined"] as const;
const GENDER_VALUES = ["male", "female", "other"] as const;
const PRICE_TIERS = ["retail", "wholesale"] as const;

export type CustomerProfileInput = {
  customerId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  price_tier?: string | null;
  dob?: string | null;
  gender?: string | null;
  address?: string | null;
  source?: string | null;
  /** Comma separated, as the form sends it. */
  tags?: string | null;
  marketing_consent?: string | null;
};

function optionalText(value: unknown, field: string, max = 200) {
  return text(value, field, max, false);
}

/**
 * A customer id must exist and belong to this brand. `refId` allows null
 * (optional references); a customer id never is, so it gets its own check.
 */
function knownCustomerId(value: unknown, customerIds: string[]) {
  const id = text(value, "Customer", 120);
  if (!id.ok) return id;
  if (!customerIds.includes(id.value)) {
    return { ok: false as const, message: "Customer not found." };
  }
  return id;
}

export async function updateCustomerProfileAction(
  input: CustomerProfileInput,
): Promise<CrmActionState> {
  const guard = await guardCrm("log");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const customerId = knownCustomerId(input.customerId, crmRefs(crm).customerIds);
  if (!customerId.ok) return customerId;
  const stored = crm.customers.find((c) => c.id === customerId.value);
  if (!stored) return { ok: false, message: "Customer not found." };

  const name = optionalText(input.name, "Name", 120);
  if (!name.ok) return name;
  const email = optionalText(input.email, "Email", 160);
  if (!email.ok) return email;
  const phone = optionalText(input.phone, "Phone", 40);
  if (!phone.ok) return phone;
  const notes = optionalText(input.notes, "Notes", 4000);
  if (!notes.ok) return notes;
  const address = optionalText(input.address, "Address", 300);
  if (!address.ok) return address;
  const source = optionalText(input.source, "Source", 60);
  if (!source.ok) return source;
  const dob = optionalText(input.dob, "Date of birth", 20);
  if (!dob.ok) return dob;

  // This form manages every field it renders: an empty value clears it, a
  // value it does not render at all (undefined) keeps what is stored.
  const gender = input.gender
    ? oneOf(input.gender, GENDER_VALUES, "Gender")
    : { ok: true as const, value: undefined };
  if (!gender.ok) return gender;

  const tier =
    input.price_tier === undefined
      ? { ok: true as const, value: undefined }
      : oneOf(input.price_tier || "retail", PRICE_TIERS, "Price list");
  if (!tier.ok) return tier;

  const consent = input.marketing_consent
    ? oneOf(input.marketing_consent, CONSENT_VALUES, "Marketing consent")
    : { ok: true as const, value: undefined };
  if (!consent.ok) return consent;

  const saved = await updateCustomerAction(customerId.value, {
    name: name.value || stored.name,
    email: email.value || null,
    phone: phone.value || null,
    notes: notes.value || null,
    price_tier: tier.value,
    dob: dob.value || null,
    gender: gender.value,
    address: address.value || null,
    source: source.value || null,
    // The form sends one comma-separated field; the stored shape is a list.
    tags: (input.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    marketing_consent: consent.value,
  });
  if (!saved.ok) return { ok: false, message: saved.message };

  await auditCrm(
    guard,
    "crm.customer.updated",
    "customer",
    customerId.value,
    saved.customer.name,
  );
  revalidateCrm(`/customers/${customerId.value}`);
  return { ok: true };
}

/**
 * Consent is recorded explicitly and dated. Declining stamps the opt-out;
 * granting clears it (both handled by the shared consent helper).
 */
export async function setMarketingConsentAction(
  customerId: string,
  consent: string,
): Promise<CrmActionState> {
  const guard = await guardCrm("log");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const id = knownCustomerId(customerId, crmRefs(crm).customerIds);
  if (!id.ok) return id;
  const customer = crm.customers.find((c) => c.id === id.value);
  if (!customer) return { ok: false, message: "Customer not found." };
  const value = oneOf(consent, CONSENT_VALUES, "Marketing consent");
  if (!value.ok) return value;

  const saved = await updateCustomerAction(id.value, {
    name: customer.name,
    marketing_consent: value.value,
  });
  if (!saved.ok) return { ok: false, message: saved.message };

  await auditCrm(
    guard,
    value.value === "granted" ? "crm.customer.consent_granted" : "crm.customer.consent_declined",
    "customer",
    id.value,
    value.value,
  );
  revalidateCrm(`/customers/${id.value}`);
  return { ok: true };
}

/** Archive ≠ delete: the customer stops appearing in audiences but keeps orders. */
export async function setCustomerArchivedAction(
  customerId: string,
  archived: boolean,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const id = knownCustomerId(customerId, crmRefs(crm).customerIds);
  if (!id.ok) return id;
  const customer = crm.customers.find((c) => c.id === id.value);
  if (!customer) return { ok: false, message: "Customer not found." };

  const saved = await updateCustomerAction(id.value, {
    name: customer.name,
    status: archived ? "archived" : null,
  });
  if (!saved.ok) return { ok: false, message: saved.message };

  await auditCrm(
    guard,
    archived ? "crm.customer.archived" : "crm.customer.restored",
    "customer",
    id.value,
    customer.name,
  );
  revalidateCrm(`/customers/${id.value}`);
  return { ok: true };
}

/** Add or remove one tag without resending the whole profile. */
export async function toggleCustomerTagAction(
  customerId: string,
  tag: string,
): Promise<CrmActionState> {
  const guard = await guardCrm("log");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const id = knownCustomerId(customerId, crmRefs(crm).customerIds);
  if (!id.ok) return id;
  const label = text(tag, "Tag", 40);
  if (!label.ok) return label;
  const customer = crm.customers.find((c) => c.id === id.value);
  if (!customer) return { ok: false, message: "Customer not found." };

  const current = customer.tags ?? [];
  const next = current.includes(label.value)
    ? current.filter((t) => t !== label.value)
    : [...current, label.value];

  const saved = await updateCustomerAction(id.value, {
    name: customer.name,
    tags: next,
  });
  if (!saved.ok) return { ok: false, message: saved.message };

  await auditCrm(
    guard,
    next.includes(label.value) ? "crm.customer.tag_added" : "crm.customer.tag_removed",
    "customer",
    id.value,
    label.value,
  );
  revalidateCrm(`/customers/${id.value}`);
  return { ok: true };
}

/** The whole directory with its derived numbers — what the owner actually mails. */
export async function exportCrmCustomersCsvAction(): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; message: string }
> {
  const guard = await guardCrm("log");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };
  const stats = statById(crm);
  const rows = crm.customers.map((customer) => {
    const stat = stats.get(customer.id);
    return {
      name: customer.name,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      status: customer.status ?? "active",
      price_tier: customer.price_tier ?? "retail",
      source: customer.source ?? "",
      tags: (customer.tags ?? []).join(" | "),
      marketing_consent: customer.marketing_consent ?? "unset",
      opted_out_at: customer.opted_out_at ?? "",
      orders: stat?.totalOrders ?? 0,
      total_spend: stat?.totalSpend ?? 0,
      lifetime_value: stat?.lifetimeValue ?? 0,
      outstanding_dues: stat?.outstandingDues ?? 0,
      loyalty_points: stat?.loyaltyPoints ?? 0,
      average_review: stat?.averageReviewRating ?? "",
      first_purchase: stat?.firstPurchaseAt ?? "",
      last_purchase: stat?.lastPurchaseAt ?? "",
    };
  });
  return crmCsv(`crm-customers-${guard.brandCode}.csv`, rows);
}
