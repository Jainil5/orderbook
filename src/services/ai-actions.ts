"use server";

/**
 * Server actions for `/ai`.
 *
 * The client only ever sends an id or a question — never record data. Every
 * action re-derives the workspace on the server, re-validates what it is about
 * to write through `lib/business/validate.ts`, refuses live workspaces with
 * `guardBusinessOps()`, and writes an audit entry. Accepting a proposal creates
 * an OrderBook task or note and nothing else: no message, no email, and no
 * purchase order sent to a supplier.
 */

import { revalidatePath } from "next/cache";
import {
  auditBusinessOps,
  guardBusinessOps,
  type BusinessGuard,
} from "@/lib/business/actions-kit";
import { notesCollection } from "@/lib/business/registry";
import { flag, oneOf, text } from "@/lib/business/validate";
import { getAutomationRule } from "@/lib/ai/automations";
import { answerQuestion, QUESTION_LIMIT } from "@/lib/ai/assistant";
import {
  findProposalById,
  loadAiContextFor,
  loadAiModel,
} from "@/lib/ai/loader";
import { getAiProvider } from "@/lib/ai/provider";
import {
  recordProposalDecision,
  setAutomationEnabledPref,
} from "@/lib/ai/prefs-store";
import { TASK_PRIORITIES } from "@/lib/manager/tasks";
import type { AssistantAnswer, AiActionProposal } from "@/lib/ai/types";
import { NOTE_CATEGORIES, type Note } from "@/types/business";
import { saveTaskAction } from "@/services/manager-ops-actions";

export type AiActionResult =
  | { ok: true; message: string; href: string | null }
  | { ok: false; message: string };

export type AssistantResult =
  | { ok: true; answer: AssistantAnswer }
  | { ok: false; message: string };

const TASKS_HREF = "/manager/productivity/tasks";
const NOTES_HREF = "/manager/productivity/notes";

/** Where the record a proposal created can be found afterwards. */
function outcomeHrefFor(proposal: AiActionProposal): string {
  return proposal.record.kind === "task" ? TASKS_HREF : NOTES_HREF;
}

function fail(message: string): AiActionResult {
  return { ok: false, message };
}

/** The `ok` half of `guardBusinessOps()` — brand code and brand id for writes. */
type Guarded = Extract<BusinessGuard, { ok: true }>;

/**
 * Writes the record a proposal describes. Both the accept button and "create
 * task from this" run through here, so a proposal can only ever become one of
 * two things: a task, or a note. Neither branch can send anything.
 */
async function applyProposal(
  proposal: AiActionProposal,
  guard: Guarded,
): Promise<AiActionResult> {
  const record = proposal.record;

  if (record.kind === "task") {
    const title = text(record.title, "Task title", 120);
    if (!title.ok) return fail(title.message);
    const description = text(record.description, "Task description", 500, false);
    if (!description.ok) return fail(description.message);
    const priority = oneOf(record.priority, TASK_PRIORITIES, "Priority");
    if (!priority.ok) return fail(priority.message);

    const saved = await saveTaskAction(null, {
      title: title.value,
      description: description.value,
      priority: priority.value,
    });
    if (!saved.ok) return fail(saved.message);
    return {
      ok: true,
      message: `Task created: "${title.value}". Nothing was sent to anyone — the follow-up is yours to do.`,
      href: TASKS_HREF,
    };
  }

  const title = text(record.title, "Note title", 120);
  if (!title.ok) return fail(title.message);
  const body = text(record.body, "Note body", 1200, false);
  if (!body.ok) return fail(body.message);
  const category = oneOf(record.category, NOTE_CATEGORIES, "Category");
  if (!category.ok) return fail(category.message);

  const now = new Date().toISOString();
  const note: Note = {
    id: notesCollection.nextId(),
    brand_id: guard.brandId,
    title: title.value,
    body: body.value,
    category: category.value,
    scope: "shared",
    pinned: false,
    linkedCustomerId: null,
    linkedStaffId: null,
    linkedAppointmentId: null,
    linkedTaskId: null,
    created_at: now,
    updated_at: now,
  };
  await notesCollection.append(guard.code, note);
  await auditBusinessOps(guard, "ai.proposal.note", "note", note.id, note.title);

  return {
    ok: true,
    message: `Draft purchase order saved as a note: "${title.value}". No order was placed with a supplier.`,
    href: NOTES_HREF,
  };
}

export async function acceptProposalAction(
  proposalId: string,
): Promise<AiActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return fail(guard.message);

  const id = text(proposalId, "Proposal", 200);
  if (!id.ok) return fail(id.message);

  const proposal = await findProposalById(guard.code, id.value);
  if (!proposal) {
    return fail(
      "That proposal is no longer here — the records behind it have changed. Reload /ai and check the inbox.",
    );
  }
  if (proposal.status !== "draft") {
    return fail(`That proposal was already ${proposal.status}.`);
  }

  const result = await applyProposal(proposal, guard);
  if (!result.ok) return result;

  await recordProposalDecision(guard.code, proposal.id, {
    status: "accepted",
    at: new Date().toISOString(),
    outcomeHref: result.href ?? outcomeHrefFor(proposal),
    outcomeLabel: result.href ? "Open what was created" : undefined,
  });
  await auditBusinessOps(
    guard,
    "ai.proposal.accepted",
    proposal.record.kind,
    proposal.id,
    proposal.title,
  );
  revalidatePath("/ai");
  if (result.href) revalidatePath(result.href);
  return result;
}

export async function dismissProposalAction(
  proposalId: string,
): Promise<AiActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return fail(guard.message);

  const id = text(proposalId, "Proposal", 200);
  if (!id.ok) return fail(id.message);

  const proposal = await findProposalById(guard.code, id.value);
  if (!proposal) {
    return fail("That proposal is no longer here. Reload /ai and try again.");
  }
  if (proposal.status !== "draft") {
    return fail(`That proposal was already ${proposal.status}.`);
  }

  await recordProposalDecision(guard.code, proposal.id, {
    status: "rejected",
    at: new Date().toISOString(),
  });
  await auditBusinessOps(
    guard,
    "ai.proposal.dismissed",
    "proposal",
    proposal.id,
    proposal.title,
  );
  revalidatePath("/ai");
  return {
    ok: true,
    message: "Dismissed. Nothing was created, and this one will not come back.",
    href: null,
  };
}

export async function setAutomationEnabledAction(
  ruleId: string,
  enabled: boolean | string,
): Promise<AiActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return fail(guard.message);

  const id = text(ruleId, "Rule", 80);
  if (!id.ok) return fail(id.message);
  const rule = getAutomationRule(id.value);
  if (!rule) return fail("Unknown automation rule.");

  const on = flag(enabled);
  await setAutomationEnabledPref(guard.code, rule.id, on);
  await auditBusinessOps(
    guard,
    on ? "ai.automation.enabled" : "ai.automation.disabled",
    "automation_rule",
    rule.id,
    rule.name,
  );
  revalidatePath("/ai");
  return {
    ok: true,
    message: on
      ? `${rule.name} is on. It will only ever add proposals for you to accept.`
      : `${rule.name} is off. It proposes nothing until you switch it back on.`,
    href: null,
  };
}

/**
 * "Create task from this" on a recommendation card. Same path as the inbox:
 * the recommendation is converted into a proposal on the server, validated and
 * created there, and recorded as accepted so it cannot be created twice.
 */
export async function createTaskFromInsightAction(
  insightId: string,
): Promise<AiActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return fail(guard.message);

  const id = text(insightId, "Insight", 120);
  if (!id.ok) return fail(id.message);

  const model = await loadAiModel(guard.code);
  const recommendation = model.recommendations.find(
    (rec) => rec.insightId === id.value,
  );
  if (!recommendation) {
    return fail(
      "That insight no longer has a next action attached — the data behind it changed.",
    );
  }

  const proposalId = `rec-${recommendation.insightId}`;
  const fresh = await findProposalById(guard.code, proposalId);
  if (!fresh) return fail("Could not rebuild that proposal. Reload /ai.");
  if (fresh.status !== "draft") {
    return fail(`That action was already ${fresh.status}.`);
  }

  const result = await applyProposal(fresh, guard);
  if (!result.ok) return result;

  await recordProposalDecision(guard.code, fresh.id, {
    status: "accepted",
    at: new Date().toISOString(),
    outcomeHref: result.href ?? outcomeHrefFor(fresh),
    outcomeLabel: result.href ? "Open what was created" : undefined,
  });
  await auditBusinessOps(
    guard,
    "ai.insight.task_created",
    fresh.record.kind,
    fresh.id,
    fresh.title,
  );
  revalidatePath("/ai");
  if (result.href) revalidatePath(result.href);
  return result;
}

export async function askAssistantAction(question: string): Promise<AssistantResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return { ok: false, message: guard.message };

  const asked = text(question, "Question", QUESTION_LIMIT);
  if (!asked.ok || asked.value.length === 0) {
    return {
      ok: false,
      message: "Ask something about your own records — sales, stock, balances, today.",
    };
  }

  const ctx = await loadAiContextFor(guard.code);
  const provider = getAiProvider();
  const answer = answerQuestion(ctx, asked.value, {
    engineLabel: provider.label,
  });
  return { ok: true, answer };
}
