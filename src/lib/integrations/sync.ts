import {
  externalEventsCollection,
  syncActionsCollection,
} from "@/lib/business/registry";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import { getGoogleOAuthConfig } from "./config";
import {
  fetchEvents,
  toExternalEvent as calendarToRow,
} from "./adapters/google-calendar";
import {
  buildQuery,
  readMessage,
  search,
  toExternalEvent as mailToRow,
} from "./adapters/gmail";
import { getAccessToken, hasStoredConnection } from "./vault";
import { recordSyncRun, readSelectedCalendarId } from "./state";
import type {
  ExternalEvent,
  IntegrationId,
  PendingSyncAction,
  PendingSyncActionStatus,
} from "@/types/integrations";

/**
 * Pull side of the integration layer: read the external system, normalise into
 * `ExternalEvent` rows the unified agenda can render, and store them per
 * brand. Everything here is read-only against the provider — writes back to
 * Google or WhatsApp only ever happen through `executor.ts`, after a human
 * confirms the proposal.
 *
 * Without OAuth credentials on the server, `syncIntegration` reports
 * `not_configured` and touches nothing, so demo workspaces keep showing their
 * seeded agenda rows instead of pretending a live import ran.
 */

const LOOKBACK_DAYS = 7;
const LOOKAHEAD_DAYS = 30;
/** Read-only Gmail filter, chosen by us — never user input. */
const UNREAD_QUERY = "is:unread newer_than:7d";
const MAX_MAIL_PER_RUN = 25;

export type SyncOutcome = {
  integration: IntegrationId;
  ok: boolean;
  /** Nothing was attempted: no credentials, or no connected account. */
  notConfigured: boolean;
  imported: number;
  refreshed: number;
  skipped: number;
  message: string;
};

function windowStart(now: Date): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - LOOKBACK_DAYS);
  return date.toISOString();
}

function windowEnd(now: Date): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + LOOKAHEAD_DAYS);
  return date.toISOString();
}

/**
 * Idempotent import keyed on `source + externalId`: a second run refreshes
 * changed rows rather than duplicating the same meeting or message.
 */
async function upsertRows(
  code: DemoBrandCode,
  rows: ExternalEvent[],
): Promise<{ imported: number; refreshed: number }> {
  const existing = await externalEventsCollection.load(code);
  const byKey = new Map(
    existing.map((row) => [`${row.source}:${row.externalId}`, row] as const),
  );

  let imported = 0;
  let refreshed = 0;
  for (const row of rows) {
    const found = byKey.get(`${row.source}:${row.externalId}`);
    if (found) {
      const changed =
        found.title !== row.title ||
        found.startsAt !== row.startsAt ||
        found.endsAt !== row.endsAt ||
        found.snippet !== row.snippet ||
        found.needsFollowUp !== row.needsFollowUp;
      if (changed) {
        await externalEventsCollection.patch(code, found.id, row);
        refreshed++;
      }
      continue;
    }
    await externalEventsCollection.append(code, {
      ...row,
      id: externalEventsCollection.nextId(),
    });
    imported++;
  }
  return { imported, refreshed };
}

async function pullCalendar(
  code: DemoBrandCode,
  brandId: string,
  accessToken: string,
  account: string | null,
  now: Date,
): Promise<Omit<SyncOutcome, "integration" | "notConfigured">> {
  const calendarId = (await readSelectedCalendarId(code, "google_calendar")) ?? undefined;
  const result = await fetchEvents({
    accessToken,
    calendarId,
    timeMin: windowStart(now),
    timeMax: windowEnd(now),
  });
  if (!result.ok) {
    return { ok: false, imported: 0, refreshed: 0, skipped: 0, message: result.message };
  }

  const syncedAt = now.toISOString();
  const rows = result.data.map((event) =>
    calendarToRow(event, { brandId, accountLabel: account, syncedAt }),
  );
  const counts = await upsertRows(code, rows);
  return {
    ok: true,
    ...counts,
    skipped: 0,
    message:
      rows.length === 0
        ? "No events in the current window."
        : `Imported ${counts.imported} event(s), refreshed ${counts.refreshed}.`,
  };
}

async function pullGmail(
  code: DemoBrandCode,
  brandId: string,
  accessToken: string,
  account: string | null,
  now: Date,
): Promise<Omit<SyncOutcome, "integration" | "notConfigured">> {
  const query = buildQuery(UNREAD_QUERY);
  if (!query) {
    return {
      ok: false,
      imported: 0,
      refreshed: 0,
      skipped: 0,
      message: "The Gmail read filter was rejected by policy.",
    };
  }

  const ids = await search(accessToken, query);
  if (!ids.ok) {
    return { ok: false, imported: 0, refreshed: 0, skipped: 0, message: ids.message };
  }

  const syncedAt = now.toISOString();
  const rows: ExternalEvent[] = [];
  let skipped = 0;
  for (const id of ids.data.slice(0, MAX_MAIL_PER_RUN)) {
    const message = await readMessage(accessToken, id);
    if (!message.ok) {
      skipped++;
      continue;
    }
    rows.push(mailToRow(message.data, { brandId, accountLabel: account, syncedAt }));
  }

  const counts = await upsertRows(code, rows);
  return {
    ok: true,
    ...counts,
    skipped,
    message:
      rows.length === 0
        ? "No unread mail waiting for a reply."
        : `Imported ${counts.imported} message(s), refreshed ${counts.refreshed}.`,
  };
}

/**
 * Reads one channel into the unified agenda. Only `google_calendar` and
 * `gmail` have an import path; WhatsApp is send-only and Outlook is planned.
 */
export async function syncIntegration(
  code: DemoBrandCode,
  brandId: string,
  integration: IntegrationId,
  now: Date = new Date(),
): Promise<SyncOutcome> {
  if (integration !== "google_calendar" && integration !== "gmail") {
    return {
      integration,
      ok: false,
      notConfigured: true,
      imported: 0,
      refreshed: 0,
      skipped: 0,
      message:
        integration === "whatsapp"
          ? "WhatsApp is send-only: nothing to import."
          : "This channel has no import path yet.",
    };
  }

  if (!getGoogleOAuthConfig()) {
    return {
      integration,
      ok: false,
      notConfigured: true,
      imported: 0,
      refreshed: 0,
      skipped: 0,
      message:
        "Live import is off because this server has no Google credentials. The agenda rows you see come from the demo workspace.",
    };
  }

  const stored = await hasStoredConnection(code, integration);
  if (!stored.connected) {
    return {
      integration,
      ok: false,
      notConfigured: true,
      imported: 0,
      refreshed: 0,
      skipped: 0,
      message: "Connect the account first — nothing was imported.",
    };
  }

  const token = await getAccessToken(code, integration);
  if (!token.ok) {
    const outcome: SyncOutcome = {
      integration,
      ok: false,
      notConfigured: token.reason === "no_credentials",
      imported: 0,
      refreshed: 0,
      skipped: 0,
      message: token.message,
    };
    await recordSyncRun(code, {
      integration,
      ranAt: now.toISOString(),
      ok: false,
      imported: 0,
      message: token.message,
    });
    return outcome;
  }

  const detail =
    integration === "google_calendar"
      ? await pullCalendar(code, brandId, token.token, token.account, now)
      : await pullGmail(code, brandId, token.token, token.account, now);

  const outcome: SyncOutcome = { integration, notConfigured: false, ...detail };
  await recordSyncRun(code, {
    integration,
    ranAt: now.toISOString(),
    ok: detail.ok,
    imported: detail.imported,
    message: detail.message,
  });
  return outcome;
}

/**
 * Proposals waiting for a human. `failed` rows stay visible so a retry is a
 * deliberate act rather than a silent background loop.
 */
export async function pendingProposals(
  code: DemoBrandCode,
  statuses: readonly PendingSyncActionStatus[] = [
    "draft",
    "awaiting_confirmation",
    "failed",
  ],
): Promise<PendingSyncAction[]> {
  const actions = await syncActionsCollection.load(code);
  return actions
    .filter((action) => statuses.includes(action.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
