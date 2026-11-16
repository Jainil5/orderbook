/**
 * Integration architecture for external channels (Google Calendar, Gmail,
 * WhatsApp, and later Outlook/Microsoft Calendar).
 *
 * Rules the rest of the codebase must keep honouring:
 * - OAuth happens server-side only. Access/refresh tokens live in a
 *   server-side store (`brand_integrations`, columns encrypted at rest) and
 *   are never sent to the browser or written to a cookie.
 * - Client-visible state is this file's `IntegrationConnection`, which carries
 *   a display label and scopes only.
 * - Anything that changes an external system (create event, send email) is
 *   modelled as a `PendingSyncAction` that a human confirms before the adapter
 *   runs it.
 */

export type IntegrationId =
  | "google_calendar"
  | "gmail"
  | "whatsapp"
  | "outlook";

export type IntegrationStatus =
  /** Server has no OAuth credentials configured for this provider. */
  | "not_configured"
  /** Credentials exist but this brand has not connected. */
  | "disconnected"
  | "connected"
  /** Connected, but the last call failed and needs attention. */
  | "error";

export type IntegrationCapability =
  | "read_calendar"
  | "write_calendar"
  | "read_email"
  | "draft_email"
  | "send_email"
  | "send_whatsapp_message";

export type IntegrationConnection = {
  id: IntegrationId;
  label: string;
  status: IntegrationStatus;
  /** Masked account label, e.g. "owner@cafe.example" or the calendar name. */
  accountLabel: string | null;
  capabilities: IntegrationCapability[];
  /** OAuth scopes actually granted, for display and audit only. */
  scopes: string[];
  lastSyncAt: string | null;
  lastError: string | null;
  /** Id of the external calendar selected for two-way sync. */
  calendarId: string | null;
};

export type ExternalEventSource = "google_calendar" | "gmail" | "outlook";

/**
 * Normalised row in the unified calendar: either an event pulled from an
 * external calendar or an email thread that carries a scheduled commitment.
 */
export type ExternalEvent = {
  id: string;
  brand_id: string;
  source: ExternalEventSource;
  externalId: string;
  kind: "event" | "email";
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  /** Display name / mailbox, never credentials. */
  accountLabel: string | null;
  customerId: string | null;
  attendeeCount: number | null;
  /** Short quoted text for `kind: "email"` rows. */
  snippet: string | null;
  needsFollowUp: boolean;
  syncedAt: string;
};

export type PendingSyncActionType =
  | "create_calendar_event"
  | "update_calendar_event"
  | "create_gmail_draft"
  | "send_gmail_message"
  | "send_whatsapp_message"
  | "create_task";

export type PendingSyncActionStatus =
  | "draft"
  | "awaiting_confirmation"
  | "confirmed"
  | "executed"
  | "failed"
  | "cancelled";

/**
 * An outbound change the platform wants to make in an external system.
 * Nothing leaves the app until the status is `confirmed` by a user with the
 * right role.
 */
export type PendingSyncAction = {
  id: string;
  brand_id: string;
  integration: IntegrationId;
  type: PendingSyncActionType;
  summary: string;
  /** Provider payload, validated by the adapter at execution time. */
  payload: Record<string, unknown>;
  status: PendingSyncActionStatus;
  createdAt: string;
  confirmedAt: string | null;
  executedAt: string | null;
  error: string | null;
  /** OrderBook appointment/event the action maps to, when there is one. */
  localRefId: string | null;
};

export type SyncRunLog = {
  id: string;
  brand_id: string;
  integration: IntegrationId;
  ranAt: string;
  ok: boolean;
  imported: number;
  message: string | null;
};
