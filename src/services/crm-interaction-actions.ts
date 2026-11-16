"use server";

import { INTERACTION_TYPES } from "@/types/crm";
import { oneOf, refId, text } from "@/lib/business/validate";
import {
  auditCrm,
  crmRecordId,
  crmRefs,
  guardCrm,
  optionalDate,
  revalidateCrm,
  type CrmActionState,
} from "@/lib/crm/actions-kit";
import { loadCrmWorkspace, type CrmWorkspace } from "@/lib/crm/loader";
import { followUpTaskDraft } from "@/lib/crm/metrics";
import {
  DEMO_BRAND_CODES,
  type DemoBrandCode,
} from "@/lib/workspace/constants";
import { saveTaskAction } from "@/services/manager-ops-actions";

/**
 * CRM interaction log.
 *
 * Same shape as every other CRM action: guard → load → validate against ids the
 * brand really owns → write through the repository → audit → revalidate. A
 * `brand_id` is never taken from the form. Recording an interaction is "log"
 * scope: it is a note of something a human already did, and nothing here sends
 * or pretends to send a message.
 */

export type InteractionInput = {
  id?: string | null;
  customer_id?: string | null;
  lead_id?: string | null;
  type?: string | null;
  subject?: string | null;
  description?: string | null;
  occurred_at?: string | null;
  staff_id?: string | null;
  outcome?: string | null;
  next_follow_up_at?: string | null;
};

function optionalTextField(
  value: unknown,
  field: string,
  max: number,
): { ok: true; value: string } | { ok: false; message: string } {
  return text(value, field, max, false);
}

/** Log (or edit) one interaction against a customer, a lead, or both. */
export async function saveInteractionAction(
  input: InteractionInput,
): Promise<CrmActionState> {
  const guard = await guardCrm("log");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };
  const refs = crmRefs(crm);

  const typeResult = oneOf(input.type, INTERACTION_TYPES, "Type");
  if (!typeResult.ok) return typeResult;

  const description = text(input.description, "Description", 2000);
  if (!description.ok) return description;
  const subject = optionalTextField(input.subject, "Subject", 120);
  if (!subject.ok) return subject;
  const outcome = optionalTextField(input.outcome, "Outcome", 200);
  if (!outcome.ok) return outcome;

  const customerId = refId(input.customer_id, refs.customerIds, "Customer");
  if (!customerId.ok) return customerId;
  const leadId = refId(input.lead_id, refs.leadIds, "Lead");
  if (!leadId.ok) return leadId;
  if (!customerId.value && !leadId.value) {
    return {
      ok: false,
      message: "Pick the customer or the lead this activity belongs to.",
    };
  }

  const staffId = refId(input.staff_id, refs.staffIds, "Staff member");
  if (!staffId.ok) return staffId;

  // `occurred_at` is required on the row; a blank input means "just now", using
  // the one instant this read was taken at.
  const occurred = optionalDate(input.occurred_at);
  if (!occurred.ok) return occurred;
  const followUp = optionalDate(input.next_follow_up_at);
  if (!followUp.ok) return followUp;

  // An id from the client has to be this workspace's own row — see crmRecordId.
  const id = crmRecordId(input.id, refs.interactionIds, "Interaction");
  if (!id.ok) return id;
  const row = {
    id: id.value,
    customer_id: customerId.value,
    lead_id: leadId.value,
    type: typeResult.value,
    subject: subject.value || null,
    description: description.value,
    occurred_at: occurred.value ?? crm.asOf,
    staff_id: staffId.value,
    outcome: outcome.value || null,
    next_follow_up_at: followUp.value,
  };

  const existing = await crm.repo.find("customer_interactions", id.value);
  const saved = existing
    ? await crm.repo.patch("customer_interactions", id.value, row)
    : await crm.repo.save("customer_interactions", row);
  if (!saved) return { ok: false, message: "Interaction not found." };

  await auditCrm(
    guard,
    existing ? "crm.interaction.updated" : "crm.interaction.created",
    "crm_interaction",
    saved.id,
    `${saved.type}: ${saved.subject || saved.description.slice(0, 60)}`,
  );
  revalidateCrm();
  return { ok: true };
}

/**
 * Turn a logged follow-up into exactly one Productivity task.
 *
 * The task is created through the app's existing operations path, which returns
 * the new id; `interaction.task_id` is the guard against a second task for the
 * same follow-up — once it is set this action refuses to run again.
 */
export async function createFollowUpTaskAction(
  interactionId: string,
): Promise<CrmActionState> {
  const guard = await guardCrm("log");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const interaction = await crm.repo.find("customer_interactions", interactionId);
  if (!interaction) return { ok: false, message: "Interaction not found." };
  if (interaction.task_id) {
    return {
      ok: false,
      message: "This follow-up is already tracked by a task — open it instead.",
    };
  }

  const draft = followUpTaskDraft(interaction);
  if (!draft) {
    return {
      ok: false,
      message: "Add a next follow-up date before turning this into a task.",
    };
  }

  const code = demoBrandCode(crm);
  if (!code) {
    return {
      ok: false,
      message:
        "Tasks are not connected to live workspaces yet, so the follow-up stays on the interaction.",
    };
  }

  const created = await saveTaskAction(null, {
    title: draft.title,
    description: draft.notes,
    dueAt: draft.dueDate,
    priority: "medium",
    // Only pass references this brand really has — the ops validator rejects
    // anything else, and a silent failure here would orphan the task.
    assigneeStaffId:
      interaction.staff_id && crm.staff.some((s) => s.id === interaction.staff_id)
        ? interaction.staff_id
        : undefined,
    customerId:
      interaction.customer_id &&
      crm.customers.some((c) => c.id === interaction.customer_id)
        ? interaction.customer_id
        : undefined,
  });
  if (!created.ok) return { ok: false, message: created.message };

  const saved = await crm.repo.patch("customer_interactions", interactionId, {
    task_id: created.id,
  });
  if (!saved) {
    return {
      ok: false,
      message:
        `Task ${created.id} was created but this interaction could not be updated.`,
    };
  }

  await auditCrm(
    guard,
    "crm.interaction.follow_up_task_created",
    "crm_interaction",
    interactionId,
    `${draft.title} → task ${created.id}`,
  );
  revalidateCrm("/manager/productivity/tasks");
  return { ok: true, message: `Follow-up added to tasks (${created.id}).` };
}

/** Demo operations live under a `BR-n` code; null means "no task store here". */
function demoBrandCode(crm: CrmWorkspace): DemoBrandCode | null {
  if (crm.mode !== "demo") return null;
  return DEMO_BRAND_CODES.includes(crm.brandCode as DemoBrandCode)
    ? (crm.brandCode as DemoBrandCode)
    : null;
}
