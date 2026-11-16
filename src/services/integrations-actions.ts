"use server";

import { revalidatePath } from "next/cache";
import { guardBusinessOps, auditBusinessOps } from "@/lib/business/actions-kit";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { toDemoBrandCode } from "@/lib/demo/data";
import { isValidBrandCode } from "@/lib/security/input";
import {
  forgetConnection,
  getAccessToken,
  setSelectedCalendar,
} from "@/lib/integrations/vault";
import { syncIntegration } from "@/lib/integrations/sync";
import {
  cancelAction,
  executeConfirmedAction,
  loadAction,
  markActionConfirmed,
  proposeAction,
} from "@/lib/integrations/executor";
import {
  forgetIntegrationState,
  recordSyncRun,
  setIntegrationError,
  setSelectedCalendarId,
} from "@/lib/integrations/state";
import { isIntegrationId } from "@/lib/integrations/registry";
import {
  isValidCalendarId,
  listCalendars,
} from "@/lib/integrations/adapters/google-calendar";
import type { IntegrationId } from "@/types/integrations";

/**
 * Server actions behind the integrations screen.
 *
 * Each one re-checks the role guard, the integration id and (where relevant)
 * the proposal state. None of them returns a token, a scope grant beyond what
 * the registry declares, or any provider payload — only `ok` and a short
 * human-readable message, which is what the client re-renders.
 */

export type IntegrationActionResult = { ok: true; message: string } | { ok: false; message: string };

function badIntegration(): IntegrationActionResult {
  return { ok: false, message: "Unknown integration." };
}

function revalidate(): void {
  revalidatePath("/manager/productivity/integrations");
  revalidatePath("/manager/productivity");
  revalidatePath("/manager/productivity/calendar");
  revalidatePath("/ai");
}

/** Demo-workspace ops guard: collections + audit live there for now. */
async function opsGuard(integration: string): Promise<
  { ok: true; code: ReturnType<typeof toDemoBrandCode>; brandId: string; id: IntegrationId } | { ok: false; message: string }
> {
  if (!isIntegrationId(integration)) return { ok: false, message: "Unknown integration." };
  const guard = await guardBusinessOps();
  if (!guard.ok) return { ok: false, message: guard.message };
  return { ok: true, code: guard.code, brandId: guard.brandId, id: integration };
}

export async function runSyncAction(
  integration: string,
): Promise<IntegrationActionResult> {
  const guard = await opsGuard(integration);
  if (!guard.ok) return { ok: false, message: guard.message };

  const outcome = await syncIntegration(guard.code, guard.brandId, guard.id);
  await auditBusinessOps(
    { code: guard.code, brandId: guard.brandId },
    outcome.ok ? "integration.sync" : "integration.sync_failed",
    "integration",
    guard.id,
    outcome.message,
  );
  revalidate();
  return { ok: outcome.ok, message: outcome.message };
}

export async function disconnectIntegrationAction(
  integration: string,
): Promise<IntegrationActionResult> {
  if (!isIntegrationId(integration)) return badIntegration();
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false, message: "Not signed in." };
  if (!["owner", "admin", "manager"].includes(ws.role)) {
    return { ok: false, message: "Only owners, admins and managers can disconnect accounts." };
  }
  const code = ws.brand.code;
  if (!isValidBrandCode(code)) return { ok: false, message: "Unknown workspace." };

  const forgot = await forgetConnection(toDemoBrandCode(code), integration);
  if (!forgot.ok) return { ok: false, message: forgot.message };
  await forgetIntegrationState(toDemoBrandCode(code), integration);
  await recordSyncRun(toDemoBrandCode(code), {
    integration,
    ranAt: new Date().toISOString(),
    ok: true,
    imported: 0,
    message: "Disconnected. Stored credentials were deleted.",
  });
  revalidate();
  return {
    ok: true,
    message: `Disconnected ${integration}. Saved credentials were deleted from the server.`,
  };
}

/**
 * Confirms and runs one proposal in a single user gesture. The two steps stay
 * separate inside the executor so the stored row always records who approved
 * what, and a failed run can be retried without re-approving.
 */
export async function confirmSyncAction(id: string): Promise<IntegrationActionResult> {
  if (typeof id !== "string" || id.length > 40) {
    return { ok: false, message: "Unknown proposal." };
  }
  const guard = await guardBusinessOps();
  if (!guard.ok) return { ok: false, message: guard.message };

  const confirmed = await markActionConfirmed(guard.code, id);
  if (!confirmed.ok) {
    await auditBusinessOps(
      { code: guard.code, brandId: guard.brandId },
      "integration.action_rejected",
      "sync_action",
      id,
      confirmed.message,
    );
    revalidate();
    return { ok: false, message: confirmed.message };
  }

  const result = await executeConfirmedAction(guard.code, id);
  await auditBusinessOps(
    { code: guard.code, brandId: guard.brandId },
    result.ok ? "integration.action_executed" : "integration.action_failed",
    "sync_action",
    id,
    result.message,
  );
  if (!result.ok) {
    // Record the failure against the channel the proposal actually belongs to.
    const action = await loadAction(guard.code, id);
    if (action) {
      await setIntegrationError(guard.code, action.integration, result.message);
    }
  }
  revalidate();
  return result;
}

export async function dismissSyncAction(id: string): Promise<IntegrationActionResult> {
  if (typeof id !== "string" || id.length > 40) {
    return { ok: false, message: "Unknown proposal." };
  }
  const guard = await guardBusinessOps();
  if (!guard.ok) return { ok: false, message: guard.message };

  const result = await cancelAction(guard.code, id);
  if (result.ok) {
    await auditBusinessOps(
      { code: guard.code, brandId: guard.brandId },
      "integration.action_cancelled",
      "sync_action",
      id,
      "Discarded by user; nothing was sent.",
    );
  }
  revalidate();
  return result;
}

/** Which external calendar feeds the unified agenda. */
export async function selectCalendarAction(
  integration: string,
  calendarId: string | null,
): Promise<IntegrationActionResult> {
  if (!isIntegrationId(integration)) return badIntegration();
  if (integration !== "google_calendar") {
    return { ok: false, message: "Only Google Calendar has a calendar picker." };
  }
  if (calendarId !== null && !isValidCalendarId(calendarId)) {
    return { ok: false, message: "Invalid calendar id." };
  }
  const guard = await opsGuard(integration);
  if (!guard.ok) return { ok: false, message: guard.message };

  // Store first: the vault is the source of truth, and prefs should not claim
  // a calendar the token record rejected.
  const stored = await setSelectedCalendar(guard.code, integration, calendarId);
  if (!stored.ok) return { ok: false, message: stored.message };
  await setSelectedCalendarId(guard.code, integration, calendarId);

  await auditBusinessOps(
    { code: guard.code, brandId: guard.brandId },
    "integration.calendar_selected",
    "integration",
    integration,
    calendarId ?? "account default",
  );
  revalidate();
  return {
    ok: true,
    message: calendarId
      ? "Syncing that calendar into the unified agenda."
      : "Using the account's default calendar.",
  };
}

/**
 * Lists the connected Google account's calendars so the operator can pick
 * which one feeds the unified agenda. Calendar ids and display names are the
 * user's own data; no credential is part of this response.
 */
export async function listGoogleCalendarsAction(): Promise<
  | { ok: true; calendars: { id: string; summary: string; primary: boolean }[] }
  | { ok: false; message: string }
> {
  const guard = await opsGuard("google_calendar");
  if (!guard.ok) return { ok: false, message: guard.message };

  const token = await getAccessToken(guard.code, "google_calendar");
  if (!token.ok) return { ok: false, message: token.message };

  const listed = await listCalendars(token.token);
  if (!listed.ok) return { ok: false, message: listed.message };
  return { ok: true, calendars: listed.data.slice(0, 50) };
}

/**
 * Turn a WhatsApp message the operator typed into a proposal. Nothing is sent
 * here: the row lands in the confirmation queue, and only `confirmSyncAction`
 * runs it through the Cloud API adapter.
 */
export async function proposeWhatsAppMessageAction(input: {
  to: string;
  body: string;
}): Promise<IntegrationActionResult> {
  const guard = await opsGuard("whatsapp");
  if (!guard.ok) return { ok: false, message: guard.message };

  const to = typeof input.to === "string" ? input.to.trim() : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (!/^\+?[0-9 ()-]{8,20}$/.test(to)) {
    return { ok: false, message: "Enter the number in international format." };
  }
  if (body.length < 2 || body.length > 480) {
    return { ok: false, message: "Write a message between 2 and 480 characters." };
  }

  const proposed = await proposeAction({
    code: guard.code,
    brandId: guard.brandId,
    integration: "whatsapp",
    type: "send_whatsapp_message",
    summary: body.slice(0, 120),
    payload: { to, body },
    localRefId: null,
  });
  if (!proposed.ok) return { ok: false, message: proposed.message };

  await auditBusinessOps(
    { code: guard.code, brandId: guard.brandId },
    "integration.action_proposed",
    "sync_action",
    proposed.id,
    `WhatsApp message proposed to ${to}; awaiting confirmation.`,
  );
  revalidate();
  return {
    ok: true,
    message: "Added to the confirmation queue. Nothing has been sent yet.",
  };
}
