import { syncActionsCollection } from "@/lib/business/registry";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import {
  buildEventBody,
  createEvent,
} from "./adapters/google-calendar";
import { createDraft } from "./adapters/gmail";
import { sendTemplate, sendText } from "./adapters/whatsapp";
import { getAccessToken } from "./vault";
import { isIntegrationId } from "./registry";
import type {
  IntegrationId,
  PendingSyncAction,
  PendingSyncActionType,
} from "@/types/integrations";

/**
 * The only path that lets anything leave the product for an external system.
 *
 * Callers can create a proposal (`awaiting_confirmation`) but never execute
 * one: execution requires the stored row to be `confirmed`, which only a
 * server action triggered by a user with edit rights can do. Payloads are
 * re-validated here from the stored fields — a tampered client request cannot
 * smuggle an arbitrary provider body through, because the client only ever
 * holds the action id.
 */

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_SUMMARY = 500;
const MAX_BODY = 4000;

export type ProposalInput = {
  /** Demo workspace code the row is stored under. */
  code: DemoBrandCode;
  brandId: string;
  integration: IntegrationId;
  type: PendingSyncActionType;
  summary: string;
  payload: Record<string, unknown>;
  localRefId: string | null;
  now?: string;
};

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function optStr(value: unknown, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return str(value, max);
}

/**
 * What the proposal would actually do, described in one line for the review
 * UI. Unknown keys are dropped here, so a payload cannot carry provider JSON.
 */
export function describeProposal(
  type: PendingSyncActionType,
  payload: Record<string, unknown>,
): string | null {
  switch (type) {
    case "create_calendar_event": {
      const summary = str(payload.summary, MAX_SUMMARY);
      const startsAt = str(payload.startsAt, 40);
      const endsAt = str(payload.endsAt, 40);
      if (!summary || !startsAt || !endsAt) return null;
      if (!RFC3339.test(startsAt) || !RFC3339.test(endsAt)) return null;
      return `Create "${summary}" in Google Calendar from ${startsAt} to ${endsAt}`;
    }
    case "create_gmail_draft": {
      const to = str(payload.to, 200);
      const subject = str(payload.subject, MAX_SUMMARY);
      const body = str(payload.body, MAX_BODY);
      if (!to || !subject || !body) return null;
      return `Draft an email to ${to}: "${subject}"`;
    }
    case "send_whatsapp_message": {
      const to = str(payload.to, 20);
      const body = optStr(payload.body, MAX_BODY) ?? optStr(payload.name, 64);
      if (!to || !body) return null;
      return `Send a WhatsApp message to ${to}`;
    }
    case "create_task":
      return null;
    default:
      // update_calendar_event and send_gmail_message are deliberately not
      // executable in this phase: rewriting somebody else's calendar entry or
      // sending mail on a user's behalf needs a review we have not built.
      return null;
  }
}

/** Strips everything the adapter does not need before the row is stored. */
export function sanitizePayload(
  type: PendingSyncActionType,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  switch (type) {
    case "create_calendar_event":
      for (const key of ["summary", "startsAt", "endsAt", "description", "location", "customerName"] as const) {
        const value = optStr(payload[key], key === "summary" ? MAX_SUMMARY : 400);
        if (value !== null) out[key] = value;
      }
      break;
    case "create_gmail_draft":
      for (const key of ["to", "subject", "body", "inReplyTo"] as const) {
        const value = optStr(payload[key], key === "body" ? MAX_BODY : 400);
        if (value !== null) out[key] = value;
      }
      break;
    case "send_whatsapp_message":
      for (const key of ["to", "body", "name", "languageCode"] as const) {
        const value = optStr(payload[key], key === "body" ? MAX_BODY : 64);
        if (value !== null) out[key] = value;
      }
      if (Array.isArray(payload.bodyValues)) {
        out.bodyValues = payload.bodyValues
          .filter((v): v is string => typeof v === "string")
          .slice(0, 3)
          .map((v) => v.slice(0, 60));
      }
      break;
    default:
      break;
  }
  return out;
}

export type ProposalResult =
  | { ok: true; id: string; message: string }
  | { ok: false; message: string };

export async function proposeAction(input: ProposalInput): Promise<ProposalResult> {
  if (!isIntegrationId(input.integration)) {
    return { ok: false, message: "Unknown integration." };
  }
  const description = describeProposal(input.type, input.payload);
  if (description === null) {
    return {
      ok: false,
      message:
        input.type === "create_task"
          ? "That change stays inside OrderBook, so it needs no external confirmation."
          : "This change cannot be proposed in this phase.",
    };
  }

  const now = input.now ?? new Date().toISOString();
  const action: PendingSyncAction = {
    id: syncActionsCollection.nextId(),
    brand_id: input.brandId,
    integration: input.integration,
    type: input.type,
    summary: input.summary.slice(0, MAX_SUMMARY),
    payload: sanitizePayload(input.type, input.payload),
    status: "awaiting_confirmation",
    createdAt: now,
    confirmedAt: null,
    executedAt: null,
    error: null,
    localRefId: input.localRefId,
  };
  await syncActionsCollection.append(input.code, action);
  return { ok: true, id: action.id, message: `Proposed: ${description}` };
}

/** Read one stored proposal so callers can report against the right channel. */
export async function loadAction(
  code: DemoBrandCode,
  actionId: string,
): Promise<PendingSyncAction | null> {
  const actions = await syncActionsCollection.load(code);
  return actions.find((entry) => entry.id === actionId) ?? null;
}

async function runGoogleCalendar(
  code: DemoBrandCode,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const token = await getAccessToken(code, "google_calendar");
  if (!token.ok) return { ok: false, message: token.message };

  const built = buildEventBody({
    summary: String(payload.summary ?? ""),
    startsAt: String(payload.startsAt ?? ""),
    endsAt: String(payload.endsAt ?? ""),
    description: optStr(payload.description, 400),
    location: optStr(payload.location, 200),
    customerName: optStr(payload.customerName, 200),
  });
  if (!built.ok) return { ok: false, message: built.message };

  const created = await createEvent({
    accessToken: token.token,
    calendarId: token.calendarId ?? undefined,
    draft: {
      summary: String(payload.summary ?? ""),
      startsAt: String(payload.startsAt ?? ""),
      endsAt: String(payload.endsAt ?? ""),
      description: optStr(payload.description, 400),
      location: optStr(payload.location, 200),
      customerName: optStr(payload.customerName, 200),
    },
  });
  if (!created.ok) return { ok: false, message: created.message };
  return {
    ok: true,
    message: `Created event ${created.data.externalId} in Google Calendar.`,
  };
}

async function runGmailDraft(
  code: DemoBrandCode,
  payload: Record<string, unknown>,
): Promise<ActionResult> {
  const token = await getAccessToken(code, "gmail");
  if (!token.ok) return { ok: false, message: token.message };

  const draft = await createDraft({
    accessToken: token.token,
    grantedScopes: token.scopes,
    to: String(payload.to ?? ""),
    subject: String(payload.subject ?? ""),
    body: String(payload.body ?? ""),
    inReplyTo: optStr(payload.inReplyTo, 64),
  });
  if (!draft.ok) return { ok: false, message: draft.message };
  return { ok: true, message: `Saved Gmail draft ${draft.data.draftId}.` };
}

async function runWhatsApp(payload: Record<string, unknown>): Promise<ActionResult> {
  if (payload.name) {
    const result = await sendTemplate({
      to: payload.to,
      name: payload.name,
      languageCode: payload.languageCode,
      bodyValues: payload.bodyValues,
    });
    if (!result.ok) return { ok: false, message: result.message };
    return { ok: true, message: `WhatsApp message queued (${result.data.messageId ?? "no id"}).` };
  }
  const result = await sendText({ to: payload.to, body: payload.body });
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, message: `WhatsApp message sent (${result.data.messageId ?? "no id"}).` };
}

/**
 * Executes a proposal the user has already confirmed. Anything else returns
 * without touching a provider — including `awaiting_confirmation`, which is
 * exactly the state the UI shows a Confirm button for.
 */
export async function executeConfirmedAction(
  code: DemoBrandCode,
  actionId: string,
  now = new Date().toISOString(),
): Promise<ActionResult> {
  const actions = await syncActionsCollection.load(code);
  const action = actions.find((entry) => entry.id === actionId);
  if (!action) return { ok: false, message: "Proposal not found." };

  if (action.status === "executed") {
    return { ok: false, message: "That change already went out." };
  }
  if (action.status !== "confirmed") {
    return {
      ok: false,
      message:
        action.status === "awaiting_confirmation"
          ? "Confirm the change first — nothing was sent."
          : `This proposal is ${action.status}, so it will not run.`,
    };
  }

  // Re-check the description policy: a row edited directly in storage cannot
  // introduce an action type this phase does not support.
  const description = describeProposal(action.type, action.payload);
  if (description === null) {
    await syncActionsCollection.patch(code, actionId, {
      status: "failed",
      error: "Not allowed in this phase.",
      executedAt: now,
    });
    return { ok: false, message: "That action is not allowed in this phase." };
  }

  const result =
    action.type === "create_calendar_event"
      ? await runGoogleCalendar(code, action.payload)
      : action.type === "create_gmail_draft"
        ? await runGmailDraft(code, action.payload)
        : action.type === "send_whatsapp_message"
          ? await runWhatsApp(action.payload)
          : { ok: false as const, message: "No adapter for that action." };

  await syncActionsCollection.patch(code, actionId, {
    status: result.ok ? "executed" : "failed",
    error: result.ok ? null : result.message.slice(0, 200),
    executedAt: now,
  });
  return result;
}

export async function markActionConfirmed(
  code: DemoBrandCode,
  actionId: string,
  now = new Date().toISOString(),
): Promise<ActionResult> {
  const actions = await syncActionsCollection.load(code);
  const action = actions.find((entry) => entry.id === actionId);
  if (!action) return { ok: false, message: "Proposal not found." };
  if (action.status !== "awaiting_confirmation") {
    return { ok: false, message: `This proposal is already ${action.status}.` };
  }
  if (describeProposal(action.type, action.payload) === null) {
    return { ok: false, message: "That action is not allowed in this phase." };
  }
  await syncActionsCollection.patch(code, actionId, {
    status: "confirmed",
    confirmedAt: now,
  });
  return { ok: true, message: "Confirmed. Running it now." };
}

export async function cancelAction(
  code: DemoBrandCode,
  actionId: string,
): Promise<ActionResult> {
  const actions = await syncActionsCollection.load(code);
  const action = actions.find((entry) => entry.id === actionId);
  if (!action) return { ok: false, message: "Proposal not found." };
  if (action.status === "executed") {
    return { ok: false, message: "Already sent — the change is outside OrderBook now." };
  }
  await syncActionsCollection.patch(code, actionId, { status: "cancelled" });
  return { ok: true, message: "Discarded. Nothing was sent." };
}
