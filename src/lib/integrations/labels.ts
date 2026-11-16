import type {
  IntegrationCapability,
  PendingSyncActionType,
} from "@/types/integrations";

/**
 * Display strings for the integrations screen. Kept apart from the registry so
 * the registry stays free of UI wording and can be imported by tests,
 * adapters and server actions without pulling labels along.
 */

export const CAPABILITY_LABELS: Record<IntegrationCapability, string> = {
  read_calendar: "Read your calendar",
  write_calendar: "Create events after you confirm",
  read_email: "Read messages",
  draft_email: "Save drafts",
  send_email: "Send email",
  send_whatsapp_message: "Send WhatsApp messages",
};

/** `https://www.googleapis.com/auth/gmail.readonly` → `gmail.readonly`. */
export function scopeLabel(scope: string): string {
  const tail = scope.split("/").pop() ?? scope;
  return tail.replace(/^https:/, "") || scope;
}

export const ACTION_TYPE_LABELS: Record<PendingSyncActionType, string> = {
  create_calendar_event: "New calendar event",
  update_calendar_event: "Calendar change (not supported yet)",
  create_gmail_draft: "New email draft",
  send_gmail_message: "Send email (not supported)",
  send_whatsapp_message: "WhatsApp message",
  create_task: "OrderBook task (stays in-app)",
};

export const STATUS_LABELS: Record<
  "connected" | "disconnected" | "not_configured" | "error",
  string
> = {
  connected: "Connected",
  disconnected: "Not connected",
  not_configured: "Needs setup",
  error: "Needs attention",
};
