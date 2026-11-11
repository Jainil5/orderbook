import type { Lead, LeadStage } from "@/types/operations";
import { LEAD_STAGES } from "@/types/operations";
import { dueAtMs } from "./time";

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: "New enquiry",
  site_visit: "Site visit",
  quote_sent: "Quote sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

/** Stages a lead can still move back out of; the other two end the pipeline. */
export const OPEN_LEAD_STAGES: LeadStage[] = [
  "new",
  "site_visit",
  "quote_sent",
  "negotiating",
];

export type LeadInput = {
  contact_name: string;
  phone: string;
  email: string;
  source: string;
  requirement: string;
  site_address: string;
  stage: string;
  estimated_value: string;
  owner_staff_id: string;
  next_action_at: string;
};

export type LeadValues = {
  contact_name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  requirement: string;
  site_address: string | null;
  stage: LeadStage;
  estimated_value: number;
  owner_staff_id: string | null;
  next_action_at: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function optional(value: string, max: number): string | null {
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

/**
 * A bare date means "call them that day", so it anchors on the work morning.
 * Reading it as UTC midnight would put the follow-up at 05:30 IST.
 */
function toFollowUpIso(value: string): string | null {
  if (!value.trim()) return null;
  if (DATE_ONLY_RE.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d, 9, 0).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function validateLeadInput(
  input: LeadInput,
  known: { staffIds: string[] },
): { ok: true; value: LeadValues } | { ok: false; message: string } {
  const contact_name = input.contact_name.trim().slice(0, 120);
  if (!contact_name) return { ok: false, message: "A contact name is required." };

  const requirement = input.requirement.trim().slice(0, 500);
  if (!requirement) {
    return { ok: false, message: "Describe the requirement you are quoting for." };
  }

  const amount = input.estimated_value.replace(/[,\s]/g, "");
  const estimated_value = amount ? Number(amount) : 0;
  if (!Number.isFinite(estimated_value) || estimated_value < 0) {
    return { ok: false, message: "Enter the estimated value in whole rupees." };
  }

  const email = optional(input.email, 160);
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, message: "That email address doesn't look right." };
  }

  if (!LEAD_STAGES.includes(input.stage as LeadStage)) {
    return { ok: false, message: "Pick a valid pipeline stage." };
  }

  const owner_staff_id = optional(input.owner_staff_id, 60);
  if (owner_staff_id && !known.staffIds.includes(owner_staff_id)) {
    return { ok: false, message: "Pick a valid owner from the staff list." };
  }

  const nextAction = input.next_action_at.trim();
  if (nextAction && toFollowUpIso(nextAction) === null) {
    return { ok: false, message: "Enter a valid follow-up date." };
  }

  return {
    ok: true,
    value: {
      contact_name,
      phone: optional(input.phone, 20),
      email,
      source: optional(input.source, 60),
      requirement,
      site_address: optional(input.site_address, 240),
      stage: input.stage as LeadStage,
      estimated_value: Math.round(estimated_value),
      owner_staff_id,
      next_action_at: toFollowUpIso(nextAction),
    },
  };
}

export function leadStageNeighbours(
  stage: LeadStage,
): { back: LeadStage | null; forward: LeadStage | null } {
  const index = LEAD_STAGES.indexOf(stage);
  return {
    back: index > 0 ? LEAD_STAGES[index - 1] : null,
    forward: index < LEAD_STAGES.length - 1 ? LEAD_STAGES[index + 1] : null,
  };
}

export function isLeadOverdue(lead: Lead, now: Date): boolean {
  if (lead.next_action_at === null) return false;
  if (!OPEN_LEAD_STAGES.includes(lead.stage)) return false;
  return dueAtMs(lead.next_action_at) < now.getTime();
}

export type PipelineSummary = {
  openCount: number;
  openValue: number;
  wonValue: number;
  closedCount: number;
  winRatePercent: number | null;
  byStage: Record<LeadStage, { count: number; value: number; label: string }>;
};

export function pipelineSummary(leads: Lead[]): PipelineSummary {
  const byStage = Object.fromEntries(
    LEAD_STAGES.map((stage) => [stage, { count: 0, value: 0, label: LEAD_STAGE_LABELS[stage] }]),
  ) as PipelineSummary["byStage"];

  let openCount = 0;
  let openValue = 0;
  let wonCount = 0;
  let wonValue = 0;
  let closedCount = 0;

  for (const lead of leads) {
    const bucket = byStage[lead.stage];
    bucket.count += 1;
    bucket.value += lead.estimated_value;

    if (lead.stage === "won" || lead.stage === "lost") {
      closedCount += 1;
      if (lead.stage === "won") {
        wonCount += 1;
        wonValue += lead.estimated_value;
      }
    } else {
      openCount += 1;
      openValue += lead.estimated_value;
    }
  }

  return {
    openCount,
    openValue,
    wonValue,
    closedCount,
    winRatePercent:
      closedCount === 0 ? null : Math.round((wonCount / closedCount) * 100),
    byStage,
  };
}
