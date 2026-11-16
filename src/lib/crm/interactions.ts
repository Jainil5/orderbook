import type { Task } from "@/types/operations";
import { INTERACTION_TYPES, type InteractionType, type CustomerInteraction } from "@/types/crm";
import { dueAtMs } from "@/lib/manager/time";

/**
 * Logged touchpoints. A follow-up is not a second task system: it becomes a
 * regular Productivity Manager task, so the work shows up wherever the team
 * already works its day.
 */

export type InteractionInput = {
  customer_id: string;
  lead_id: string;
  type: string;
  summary: string;
  detail: string;
  occurred_at: string;
  staff_id: string;
  outcome: string;
  next_follow_up_at: string;
  attachment_url: string;
};

export const EMPTY_INTERACTION_INPUT: InteractionInput = {
  customer_id: "",
  lead_id: "",
  type: "call",
  summary: "",
  detail: "",
  occurred_at: "",
  staff_id: "",
  outcome: "",
  next_follow_up_at: "",
  attachment_url: "",
};

export type InteractionValues = {
  customer_id: string | null;
  lead_id: string | null;
  type: InteractionType;
  summary: string;
  detail: string | null;
  occurred_at: string;
  staff_id: string | null;
  outcome: string | null;
  next_follow_up_at: string | null;
  attachment_url: string | null;
};

function optional(value: string, max: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function validateInteractionInput(
  input: InteractionInput,
  known: { customerIds: string[]; staffIds: string[]; leadIds: string[] },
): { ok: true; value: InteractionValues } | { ok: false; message: string } {
  if (!INTERACTION_TYPES.includes(input.type as InteractionType)) {
    return { ok: false, message: "Pick what kind of interaction this was." };
  }
  const summary = input.summary.trim().slice(0, 160);
  if (!summary) return { ok: false, message: "One line describing the interaction." };

  const customerId = input.customer_id.trim();
  const leadId = input.lead_id.trim();
  if (customerId && leadId) {
    return { ok: false, message: "Log an interaction against a customer or a lead, not both." };
  }
  if (!customerId && !leadId) {
    return { ok: false, message: "Choose the customer or lead this was with." };
  }
  if (customerId && !known.customerIds.includes(customerId)) {
    return { ok: false, message: "Pick a customer from the list." };
  }
  if (leadId && !known.leadIds.includes(leadId)) {
    return { ok: false, message: "Pick a lead from the pipeline." };
  }
  if (input.staff_id.trim() && !known.staffIds.includes(input.staff_id.trim())) {
    return { ok: false, message: "Pick a colleague from the staff list." };
  }

  const occurredAt = input.occurred_at.trim();
  const occurred = occurredAt ? new Date(occurredAt) : new Date();
  if (Number.isNaN(occurred.getTime())) {
    return { ok: false, message: "That interaction date doesn't look right." };
  }

  const followUp = input.next_follow_up_at.trim();
  if (followUp && Number.isNaN(new Date(followUp).getTime())) {
    return { ok: false, message: "Enter a valid follow-up date." };
  }

  const attachment = optional(input.attachment_url, 300);
  if (attachment && !/^https?:\/\//i.test(attachment)) {
    return { ok: false, message: "Attachment links have to start with http:// or https://." };
  }

  return {
    ok: true,
    value: {
      customer_id: customerId || null,
      lead_id: leadId || null,
      type: input.type as InteractionType,
      summary,
      detail: optional(input.detail, 1000),
      occurred_at: occurred.toISOString(),
      staff_id: input.staff_id.trim() || null,
      outcome: optional(input.outcome, 160),
      next_follow_up_at: followUp ? new Date(followUp).toISOString() : null,
      attachment_url: attachment,
    },
  };
}

export function isFollowUpDue(interaction: CustomerInteraction, now: Date): boolean {
  if (!interaction.next_follow_up_at) return false;
  return dueAtMs(interaction.next_follow_up_at) < now.getTime();
}

export function dueFollowUps(
  interactions: CustomerInteraction[],
  now: Date,
): CustomerInteraction[] {
  return interactions
    .filter((i) => isFollowUpDue(i, now))
    .sort(
      (a, b) =>
        new Date(a.next_follow_up_at!).getTime() - new Date(b.next_follow_up_at!).getTime(),
    );
}

/** Anything with a future follow-up, soonest first — the "what's next" rail. */
export function upcomingFollowUps(
  interactions: CustomerInteraction[],
  now: Date,
): CustomerInteraction[] {
  return interactions
    .filter(
      (i) =>
        i.next_follow_up_at !== null && dueAtMs(i.next_follow_up_at) >= now.getTime(),
    )
    .sort(
      (a, b) =>
        new Date(a.next_follow_up_at!).getTime() - new Date(b.next_follow_up_at!).getTime(),
    );
}

export type TaskDraft = {
  title: string;
  description: string;
  assigneeStaffId: string | null;
  customerId: string | null;
  priority: Task["priority"];
  dueAt: string | null;
};

/**
 * The task a follow-up turns into. Complaints arrive as high priority because
 * that is the one thing a customer will not forgive a delay on.
 */
export function taskDraftFromInteraction(interaction: CustomerInteraction): TaskDraft {
  const who = interaction.summary.trim();
  return {
    title: `Follow up: ${who}`.slice(0, 120),
    description: [
      interaction.outcome ? `Outcome so far: ${interaction.outcome}` : null,
      interaction.detail ? interaction.detail : null,
      interaction.customer_id
        ? null
        : "Logged against a lead that has not converted yet.",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 1000),
    assigneeStaffId: interaction.staff_id,
    customerId: interaction.customer_id,
    priority: interaction.type === "complaint" ? "high" : "medium",
    dueAt: interaction.next_follow_up_at,
  };
}

export function sortInteractions(interactions: CustomerInteraction[]): CustomerInteraction[] {
  return [...interactions].sort(
    (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );
}
