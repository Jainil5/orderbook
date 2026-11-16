import type {
  IntegrationCapability,
  IntegrationConnection,
  IntegrationId,
  IntegrationStatus,
} from "@/types/integrations";

/**
 * Static description of every channel the platform can talk to: what it is for,
 * which OAuth scopes we ask for, what it may do, and which env vars light it
 * up. Scopes are deliberately read-mostly:
 *
 * - calendar: `calendar.readonly` for the unified agenda; the `.events` scope
 *   is only requested so a *confirmed* create can happen. There is no
 *   `calendar` full-access scope, so we cannot silently rewrite someone's
 *   calendar.
 * - gmail: `gmail.readonly` + `gmail.compose` — read and draft only. There is
 *   deliberately no `gmail.send` scope: sending email requires a scope we do
 *   not request in this phase.
 * - whatsapp: no OAuth; a server-side Cloud API token, send-only, and every
 *   send needs a human to confirm it first.
 */

export type IntegrationDefinition = {
  id: IntegrationId;
  label: string;
  shortLabel: string;
  purpose: string;
  provider: "google" | "meta" | "microsoft";
  scopes: string[];
  capabilities: IntegrationCapability[];
  /** Capability we refuse to request, shown so the boundary is visible. */
  notRequested: IntegrationCapability[];
  requiredEnv: string[];
  /** Outbound changes always go through a confirmable proposal. */
  confirmationRequired: boolean;
  docs: string;
};

export const INTEGRATION_DEFINITIONS: Record<IntegrationId, IntegrationDefinition> = {
  google_calendar: {
    id: "google_calendar",
    label: "Google Calendar",
    shortLabel: "Calendar",
    purpose:
      "Pull external events into the unified agenda and create bookings after you confirm them.",
    provider: "google",
    scopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    capabilities: ["read_calendar", "write_calendar"],
    notRequested: [],
    requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NEXT_PUBLIC_APP_URL"],
    confirmationRequired: true,
    docs: "docs/PRODUCT_ARCHITECTURE.md",
  },
  gmail: {
    id: "gmail",
    label: "Gmail",
    shortLabel: "Gmail",
    purpose:
      "Read messages that carry commitments so they appear as follow-ups, and prepare drafts you can review.",
    provider: "google",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
    ],
    capabilities: ["read_email", "draft_email"],
    notRequested: ["send_email"],
    requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NEXT_PUBLIC_APP_URL"],
    confirmationRequired: true,
    docs: "docs/PRODUCT_ARCHITECTURE.md",
  },
  whatsapp: {
    id: "whatsapp",
    label: "WhatsApp Business",
    shortLabel: "WhatsApp",
    purpose:
      "Send approved reminders and order updates from your business number through the official Cloud API.",
    provider: "meta",
    scopes: [],
    capabilities: ["send_whatsapp_message"],
    notRequested: [],
    requiredEnv: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
    confirmationRequired: true,
    docs: "docs/PRODUCT_ARCHITECTURE.md",
  },
  outlook: {
    id: "outlook",
    label: "Microsoft 365 Calendar",
    shortLabel: "Outlook",
    purpose:
      "Planned: the same read-and-confirm pattern for Outlook/Microsoft calendars.",
    provider: "microsoft",
    scopes: [],
    capabilities: ["read_calendar", "write_calendar"],
    notRequested: [],
    requiredEnv: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
    confirmationRequired: true,
    docs: "docs/PRODUCT_ARCHITECTURE.md",
  },
};

export const INTEGRATION_IDS = Object.keys(
  INTEGRATION_DEFINITIONS,
) as IntegrationId[];

/** Google connections share one OAuth transaction; scope decides what we ask for. */
export function scopesForGoogle(integration: IntegrationId): string[] {
  const definition = INTEGRATION_DEFINITIONS[integration];
  if (!definition || definition.provider !== "google") return [];
  return definition.scopes;
}

/** The two Google rows are authorised together so one consent covers both. */
export function googleConsentScopes(integrations: IntegrationId[]): string[] {
  const set = new Set<string>();
  for (const id of integrations) {
    for (const scope of scopesForGoogle(id)) set.add(scope);
  }
  return [...set];
}

export function getIntegrationDefinition(id: IntegrationId): IntegrationDefinition {
  return INTEGRATION_DEFINITIONS[id];
}

/** Scope strings we will never ask for — asserted by tests. */
export const FORBIDDEN_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://mail.google.com/",
] as const;

export function assertSafeScopes(scopes: readonly string[]): void {
  for (const scope of scopes) {
    if ((FORBIDDEN_SCOPES as readonly string[]).includes(scope)) {
      throw new Error(`Integration scope not allowed by policy: ${scope}`);
    }
  }
}

export function connectionStatus(
  id: IntegrationId,
  configured: boolean,
  connected: boolean,
  lastError: string | null,
): IntegrationStatus {
  if (!configured) return "not_configured";
  if (connected) return lastError ? "error" : "connected";
  return "disconnected";
}

export type ConnectionView = {
  id: IntegrationId;
  label: string;
  shortLabel: string;
  purpose: string;
  status: IntegrationStatus;
  capabilities: IntegrationCapability[];
  notRequested: IntegrationCapability[];
  scopes: string[];
  accountLabel: string | null;
  requiredEnv: string[];
  confirmationRequired: boolean;
  /** Short message from the last failed call, never a provider body. */
  lastError: string | null;
  lastSyncAt: string | null;
  /** Which external calendar feeds the agenda, when one was picked. */
  calendarId: string | null;
};

/**
 * The only integration shape a page may render: status, capabilities and a
 * masked account label. No token, no client secret, no cipher text.
 */
export function buildConnectionView(
  id: IntegrationId,
  input: {
    configured: boolean;
    connected: boolean;
    lastError: string | null;
    accountLabel: string | null;
    scopes: string[];
    lastSyncAt?: string | null;
    calendarId?: string | null;
  },
): ConnectionView {
  const definition = INTEGRATION_DEFINITIONS[id];
  return {
    id: definition.id,
    label: definition.label,
    shortLabel: definition.shortLabel,
    purpose: definition.purpose,
    status: connectionStatus(id, input.configured, input.connected, input.lastError),
    capabilities: definition.capabilities,
    notRequested: definition.notRequested,
    scopes: input.connected ? input.scopes : definition.scopes,
    accountLabel: input.accountLabel,
    requiredEnv: definition.requiredEnv,
    confirmationRequired: definition.confirmationRequired,
    lastError: input.lastError,
    lastSyncAt: input.lastSyncAt ?? null,
    calendarId: input.calendarId ?? null,
  };
}

export function isIntegrationId(value: unknown): value is IntegrationId {
  return typeof value === "string" && value in INTEGRATION_DEFINITIONS;
}

export function unknownConnection(id: IntegrationId): IntegrationConnection {
  const definition = INTEGRATION_DEFINITIONS[id];
  return {
    id,
    label: definition.label,
    status: "not_configured",
    accountLabel: null,
    capabilities: definition.capabilities,
    scopes: definition.scopes,
    lastSyncAt: null,
    lastError: null,
    calendarId: null,
  };
}
