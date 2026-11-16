import {
  externalEventsCollection,
  syncActionsCollection,
} from "@/lib/business/registry";
import { canEditBrandSettings } from "@/lib/security/authorization";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { BrandRole } from "@/types/database";
import type { PendingSyncAction } from "@/types/integrations";
import { readIntegrationConfiguration, type IntegrationConfiguration } from "./config";
import {
  INTEGRATION_IDS,
  buildConnectionView,
  type ConnectionView,
} from "./registry";
import { readIntegrationPrefs, type IntegrationPrefs, type SyncRun } from "./state";
import { describeVault, hasStoredConnection, type VaultStatus } from "./vault";

/**
 * Read model for `/manager/productivity/integrations`.
 *
 * Assembles only fields that are safe to render: per-integration status,
 * granted scope names, a masked account label, the last sync runs, imported
 * row counts and any proposals waiting for a human. The vault is consulted
 * just enough to say "connected" and show the label — no token, no cipher,
 * no refresh secret crosses this boundary.
 */

export type IntegrationsView = {
  connections: ConnectionView[];
  runs: SyncRun[];
  pendingActions: PendingSyncAction[];
  /** External rows currently in the unified agenda, by source. */
  imported: { google_calendar: number; gmail: number };
  needsFollowUp: number;
  configuration: IntegrationConfiguration;
  vault: VaultStatus;
  canManage: boolean;
  /** What the operator still has to set, as variable names only. */
  missingEnv: string[];
};

export async function loadIntegrationsView(params: {
  code: DemoBrandCode;
  role: BrandRole;
  live: boolean;
}): Promise<IntegrationsView> {
  const configuration = readIntegrationConfiguration();
  const prefs: IntegrationPrefs = await readIntegrationPrefs(params.code);

  const connections = await Promise.all(
    INTEGRATION_IDS.map(async (id) => {
      const googleBacked = id === "google_calendar" || id === "gmail";
      const configured = googleBacked
        ? configuration.google && configuration.vault
        : id === "whatsapp"
          ? configuration.whatsapp
          : false;

      // WhatsApp uses a server-side token from the environment, so being
      // configured *is* being connected. Google needs a stored OAuth grant.
      const stored = !configured
        ? { connected: false, account: null, scopes: [] }
        : googleBacked
          ? await hasStoredConnection(params.code, id)
          : { connected: true, account: "Business number", scopes: [] as string[] };

      const status = prefs.status?.[id];
      return buildConnectionView(id, {
        configured,
        connected: stored.connected,
        lastError: status?.lastError ?? null,
        accountLabel: stored.account,
        scopes: stored.scopes,
        lastSyncAt: status?.lastSyncAt ?? null,
        calendarId: status?.calendarId ?? null,
      });
    }),
  );

  const [events, actions] = await Promise.all([
    externalEventsCollection.load(params.code),
    syncActionsCollection.load(params.code),
  ]);

  const missingEnv: string[] = [];
  if (!configuration.google) missingEnv.push("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET");
  if (!configuration.vault) missingEnv.push("INTEGRATION_ENCRYPTION_KEY");
  if (!configuration.whatsapp) missingEnv.push("WHATSAPP_ACCESS_TOKEN");

  return {
    connections,
    runs: prefs.runs ?? [],
    pendingActions: actions
      .filter(
        (action) =>
          action.status === "awaiting_confirmation" || action.status === "failed",
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12),
    imported: {
      google_calendar: events.filter((event) => event.source === "google_calendar").length,
      gmail: events.filter((event) => event.source === "gmail").length,
    },
    needsFollowUp: events.filter((event) => event.needsFollowUp).length,
    configuration,
    vault: describeVault(params.live),
    canManage: canEditBrandSettings(params.role),
    missingEnv,
  };
}
