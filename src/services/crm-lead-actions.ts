"use server";

import {
  LEAD_STAGES,
  type Lead,
} from "@/types/crm";
import { money, oneOf, refId, text, type Validated } from "@/lib/business/validate";
import {
  auditCrm,
  crmCsv,
  crmRecordId,
  crmRefs,
  crmReturnTo,
  field,
  guardCrm,
  optionalDate,
  revalidateCrm,
  requiredField,
} from "@/lib/crm/actions-kit";
import { loadCrmWorkspace } from "@/lib/crm/loader";
import { saveCustomerAction } from "@/services/operations-actions";

/**
 * CRM lead pipeline actions.
 *
 * The pipeline is edited with plain HTML forms, so each action takes FormData
 * and answers by redirecting back to `/customers/leads` with a `notice` or an
 * `error` — no client bundle, and the result is honest about what happened.
 *
 * Every write still goes through `guardCrm` (session + role), validates
 * against ids the brand really owns, writes through the CRM repository (brand
 * stamped), appends an audit entry and revalidates the CRM screens. Nothing
 * here trusts a client-supplied `brand_id`.
 */

const LEADS_PATH = "/customers/leads";

function leadText(form: FormData, name: string, label: string, max = 200) {
  return text(field(form, name) ?? "", label, max, false);
}

/** Stage values the pipeline understands, or `undefined` to leave it alone. */
function leadStage(value: string | undefined) {
  return value === undefined
    ? { ok: true as const, value: undefined }
    : oneOf(value, LEAD_STAGES, "Stage");
}

/** Validation failures all carry one field: the message the owner sees. */
function fail(result: Extract<Validated<unknown>, { ok: false }>) {
  return { ok: false as const, message: result.message };
}

/** Read + validate a whole lead form. Returns a row the repository can store. */
async function readLeadForm(form: FormData) {
  const name = requiredField(form, "name", "Lead name");
  if (!name.ok) return fail(name);
  const company = leadText(form, "company", "Company", 120);
  if (!company.ok) return fail(company);
  const phone = leadText(form, "phone", "Phone", 40);
  if (!phone.ok) return fail(phone);
  const email = leadText(form, "email", "Email", 160);
  if (!email.ok) return fail(email);
  const source = leadText(form, "source", "Source", 60);
  if (!source.ok) return fail(source);
  const notes = leadText(form, "notes", "Notes", 2000);
  if (!notes.ok) return fail(notes);
  const reason = leadText(form, "lost_reason", "Lost reason", 200);
  if (!reason.ok) return fail(reason);
  const stage = leadStage(field(form, "stage"));
  if (!stage.ok) return fail(stage);

  const rawValue = field(form, "estimated_value");
  const value = rawValue === undefined
    ? { ok: true as const, value: 0 }
    : money(rawValue, "Estimated value");
  if (!value.ok) return fail(value);

  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false as const, message: "No workspace is connected." };

  const assignee = refId(field(form, "assigned_staff_id"), crmRefs(crm).staffIds, "Owner");
  if (!assignee.ok) return fail(assignee);
  const followUp = optionalDate(field(form, "next_follow_up_at"));
  if (!followUp.ok) return fail(followUp);

  // An id from the form must be a lead this workspace owns: a stale or foreign
  // one is refused outright instead of quietly creating a second row.
  const id = crmRecordId(field(form, "id"), crmRefs(crm).leadIds, "Lead");
  if (!id.ok) return fail(id);
  const existing = await crm.repo.find("leads", id.value);

  return {
    ok: true as const,
    crm,
    existing,
    row: {
      id: id.value,
      name: name.value,
      company: company.value ?? null,
      phone: phone.value ?? null,
      email: email.value ?? null,
      source: source.value ?? null,
      estimated_value: value.value,
      assigned_staff_id: assignee.value,
      next_follow_up_at: followUp.value,
      notes: notes.value ?? null,
      ...(stage.value ? { stage: stage.value } : {}),
      ...(reason.value ? { lost_reason: reason.value } : {}),
    } satisfies Partial<Lead>,
  };
}

export async function saveLeadAction(form: FormData): Promise<void> {
  const guard = await guardCrm("log");
  if (!guard.ok) return crmReturnTo(LEADS_PATH, { error: guard.message });

  const parsed = await readLeadForm(form);
  if (!parsed.ok) return crmReturnTo(LEADS_PATH, { error: parsed.message });
  const { crm, existing, row } = parsed;

  const saved = existing
    ? await crm.repo.patch("leads", row.id, row)
    : await crm.repo.save("leads", { ...row, stage: row.stage ?? "new" });

  if (!saved) {
    return crmReturnTo(LEADS_PATH, { error: "Lead not found — nothing was changed." });
  }
  await auditCrm(
    guard,
    existing ? "crm.lead.updated" : "crm.lead.created",
    "crm_lead",
    saved.id,
    saved.name,
  );
  revalidateCrm();
  crmReturnTo(LEADS_PATH, { notice: existing ? "Lead updated." : `Lead “${saved.name}” added.` });
}

/** Moving a card between columns. Lost needs a reason worth keeping. */
export async function moveLeadStageAction(form: FormData): Promise<void> {
  const guard = await guardCrm("log");
  if (!guard.ok) return crmReturnTo(LEADS_PATH, { error: guard.message });

  const id = requiredField(form, "id", "Lead");
  if (!id.ok) return crmReturnTo(LEADS_PATH, { error: id.message });
  const stage = oneOf(field(form, "stage") ?? "", LEAD_STAGES, "Stage");
  if (!stage.ok) return crmReturnTo(LEADS_PATH, { error: stage.message });
  const reason = leadText(form, "lost_reason", "Lost reason", 200);
  if (!reason.ok) return crmReturnTo(LEADS_PATH, { error: reason.message });

  const patch: Partial<Lead> = { stage: stage.value };
  patch.lost_reason =
    stage.value === "lost" ? reason.value || "Not specified" : null;

  const updated = await guard.repo.patch("leads", id.value, patch);
  if (!updated) {
    return crmReturnTo(LEADS_PATH, { error: "Lead not found — nothing was moved." });
  }
  await auditCrm(
    guard,
    "crm.lead.moved",
    "crm_lead",
    id.value,
    `${updated.name} → ${stage.value}`,
  );
  revalidateCrm();
  crmReturnTo(LEADS_PATH, {
    notice: `“${updated.name}” moved to ${stage.value.replace("_", " ")}.`,
  });
}

/**
 * Convert a lead into a customer. The customer record is created through the
 * app's existing customer path (the `customers` CSV), so there is exactly one
 * customer entity and never a duplicate.
 */
export async function convertLeadAction(form: FormData): Promise<void> {
  const guard = await guardCrm("log");
  if (!guard.ok) return crmReturnTo(LEADS_PATH, { error: guard.message });

  const id = requiredField(form, "id", "Lead");
  if (!id.ok) return crmReturnTo(LEADS_PATH, { error: id.message });

  const lead = await guard.repo.find("leads", id.value);
  if (!lead) return crmReturnTo(LEADS_PATH, { error: "Lead not found." });
  if (lead.customer_id) {
    return crmReturnTo(`/customers/${lead.customer_id}`, {
      error: "This lead already became a customer.",
    });
  }

  const created = await saveCustomerAction({
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    notes: lead.notes,
    source: lead.source,
    marketing_consent: null,
  });
  if (!created.ok) {
    return crmReturnTo(LEADS_PATH, { error: `Could not create the customer: ${created.message}` });
  }

  const now = new Date().toISOString();
  await guard.repo.patch("leads", id.value, {
    customer_id: created.customer.id,
    converted_at: now,
    stage: "won",
  });
  await auditCrm(
    guard,
    "crm.lead.converted",
    "crm_lead",
    id.value,
    `${lead.name} → ${created.customer.name}`,
  );
  revalidateCrm(`/customers/${created.customer.id}`);
  crmReturnTo(LEADS_PATH, {
    notice: `“${lead.name}” became a customer and is marked won.`,
  });
}

export async function deleteLeadAction(form: FormData): Promise<void> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return crmReturnTo(LEADS_PATH, { error: guard.message });
  const id = requiredField(form, "id", "Lead");
  if (!id.ok) return crmReturnTo(LEADS_PATH, { error: id.message });
  // Deletion is deliberate: the form has to say so.
  if (field(form, "confirm") !== "on") {
    return crmReturnTo(LEADS_PATH, {
      error: "Tick the confirmation box to delete a lead.",
      query: { id: id.value },
    });
  }
  const lead = await guard.repo.find("leads", id.value);
  if (!lead) return crmReturnTo(LEADS_PATH, { error: "Lead not found." });
  await guard.repo.remove("leads", id.value);
  await auditCrm(guard, "crm.lead.deleted", "crm_lead", id.value, lead.name);
  revalidateCrm();
  crmReturnTo(LEADS_PATH, { notice: `Lead “${lead.name}” deleted.` });
}

/** Set the date this lead is next touched — feeds the overview follow-ups. */
export async function logLeadFollowUpAction(form: FormData): Promise<void> {
  const guard = await guardCrm("log");
  if (!guard.ok) return crmReturnTo(LEADS_PATH, { error: guard.message });

  const id = requiredField(form, "id", "Lead");
  if (!id.ok) return crmReturnTo(LEADS_PATH, { error: id.message });
  const when = optionalDate(field(form, "next_follow_up_at"));
  if (!when.ok) return crmReturnTo(LEADS_PATH, { error: when.message });
  if (!when.value) {
    return crmReturnTo(LEADS_PATH, { error: "Pick a follow-up date." });
  }

  const updated = await guard.repo.patch("leads", id.value, {
    next_follow_up_at: when.value,
  });
  if (!updated) {
    return crmReturnTo(LEADS_PATH, { error: "Lead not found — nothing was scheduled." });
  }
  await auditCrm(guard, "crm.lead.follow_up_set", "crm_lead", id.value, when.value);
  revalidateCrm();
  crmReturnTo(LEADS_PATH, {
    notice: `Follow-up for “${updated.name}” set to ${when.value.slice(0, 10)}.`,
  });
}

/** Export the pipeline for the owner to work through offline. */
export async function exportLeadsCsvAction(): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; message: string }
> {
  const guard = await guardCrm("log");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };
  const ownerName = (id: string | null) =>
    crm.staff.find((s) => s.id === id)?.name ?? "";
  const rows = crm.leads.map((lead) => ({
    name: lead.name,
    company: lead.company ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    source: lead.source ?? "",
    stage: lead.stage,
    estimated_value: lead.estimated_value,
    owner: ownerName(lead.assigned_staff_id),
    next_follow_up_at: lead.next_follow_up_at ?? "",
    lost_reason: lead.lost_reason ?? "",
    created_at: lead.created_at,
  }));
  return crmCsv(`crm-leads-${guard.brandCode}.csv`, rows);
}
