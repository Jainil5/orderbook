import type {
  IntegrationId,
  IntegrationPrefs,
  IntegrationRun,
  IntegrationStatusEntry,
} from "@/types/integrations";
import { readPrefsEntry, updatePrefsEntry } from "@/lib/workspace/prefs";

/**
 * Non-secret integration state, stored in the brand's `brand_settings` row in
 * `data/brand_settings.csv` (through `lib/workspace/prefs.ts`).
 *
 * This module deliberately holds *status* only: last sync time, last error,
 * selected calendar id and a short run log. OAuth tokens live in the vault
 * (`vault.ts`) and are never written here, so nothing on this page path can
 * leak a credential through a stored row, a render, or a client component.
 */

export type { IntegrationPrefs, IntegrationRun as SyncRun, IntegrationStatusEntry };

/** Local alias — the re-export above does not bind the name in this file. */
type SyncRun = IntegrationRun;

const RUN_LOG_LIMIT = 10;

export async function readIntegrationPrefs(
  brandCode: string,
): Promise<IntegrationPrefs> {
  const entry = await readPrefsEntry(brandCode);
  return entry.integrations ?? {};
}

async function mutate(
  brandCode: string,
  change: (current: IntegrationPrefs) => IntegrationPrefs,
): Promise<void> {
  const entry = await readPrefsEntry(brandCode);
  const merged = change(entry.integrations ?? {});
  // Keep the other slices of the prefs entry intact.
  await updatePrefsEntry(brandCode, { ...entry, integrations: merged });
}

function withStatus(
  current: IntegrationPrefs,
  integration: IntegrationId,
  patch: IntegrationStatusEntry,
): IntegrationPrefs {
  return {
    ...current,
    status: {
      ...current.status,
      [integration]: { ...current.status?.[integration], ...patch },
    },
  };
}

export async function recordSyncRun(
  brandCode: string,
  run: SyncRun,
): Promise<void> {
  await mutate(brandCode, (current) =>
    withStatus(
      { ...current, runs: [run, ...(current.runs ?? [])].slice(0, RUN_LOG_LIMIT) },
      run.integration,
      {
        lastSyncAt: run.ranAt,
        lastError: run.ok ? undefined : (run.message ?? "Sync failed").slice(0, 200),
      },
    ),
  );
}

export async function setIntegrationError(
  brandCode: string,
  integration: IntegrationId,
  message: string | null,
): Promise<void> {
  await mutate(brandCode, (current) =>
    withStatus(current, integration, {
      lastError: message ? message.slice(0, 200) : undefined,
    }),
  );
}

export async function setSelectedCalendarId(
  brandCode: string,
  integration: IntegrationId,
  calendarId: string | null,
): Promise<void> {
  await mutate(brandCode, (current) =>
    withStatus(current, integration, { calendarId }),
  );
}

/** Read the stored calendar choice without touching the vault. */
export async function readSelectedCalendarId(
  brandCode: string,
  integration: IntegrationId,
): Promise<string | null> {
  const prefs = await readIntegrationPrefs(brandCode);
  return prefs.status?.[integration]?.calendarId ?? null;
}

export async function forgetIntegrationState(
  brandCode: string,
  integration: IntegrationId,
): Promise<void> {
  await mutate(brandCode, (current) => {
    const status = { ...current.status };
    delete status[integration];
    return {
      status,
      runs: (current.runs ?? []).filter((run) => run.integration !== integration),
    };
  });
}
