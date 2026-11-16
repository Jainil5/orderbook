/**
 * Read-only channel status for the `/ai` page.
 *
 * The connection itself is not this area's business: OAuth, tokens and the
 * actual account live behind `/manager/productivity/integrations`. This module
 * only *reads* that area's state — the server configuration, the status-only
 * prefs slice and whether a vault connection exists — so the `/ai` page can
 * say honestly which channels exist instead of asserting "nothing configured"
 * forever. No token, cipher or credential value crosses this boundary: the
 * probe answers with a status, and status is all this file renders.
 *
 * Nothing in this file can send, and nothing in it should be made able to.
 * A connected channel here is context, not capability: accepting a proposal
 * still only ever writes an OrderBook record, and outbound delivery stays
 * behind the integrations area's own confirm-before-send flow.
 */

import { readIntegrationConfiguration } from "@/lib/integrations/config";
import { readIntegrationPrefs } from "@/lib/integrations/state";
import { hasStoredConnection } from "@/lib/integrations/vault";
import type { IntegrationId, IntegrationStatus } from "@/types/integrations";
import type { AiChannelStatus } from "./types";

export const CHANNEL_GUIDANCE =
  "Channel delivery is a separate integration area. Until a connection is made there, OrderBook AI only ever creates records inside OrderBook — tasks and notes — and never sends a message.";

/** Which integration row backs each AI channel, and whether Google backs it. */
const CHANNEL_BACKING: Record<
  AiChannelStatus["id"],
  { integration: IntegrationId; googleBacked: boolean }
> = {
  whatsapp: { integration: "whatsapp", googleBacked: false },
  gmail: { integration: "gmail", googleBacked: true },
  google_calendar: { integration: "google_calendar", googleBacked: true },
};

/** Honest copy per state, so a connected channel is never described as absent. */
const SUMMARIES: Record<AiChannelStatus["id"], Record<IntegrationStatus, string>> = {
  whatsapp: {
    not_configured:
      "This server has no WhatsApp Business credentials, so no messages can be sent or read from here.",
    disconnected:
      "WhatsApp credentials exist on this server, but this business has not connected its Business account in the integrations area yet.",
    connected:
      "WhatsApp is connected in the integrations area. OrderBook AI still never sends from here — accepting a proposal only ever creates a task or a note.",
    error:
      "WhatsApp is connected, but its last call failed. Check the account on the integrations page before relying on it.",
  },
  gmail: {
    not_configured:
      "This server has no Gmail credentials, so OrderBook AI cannot draft or send email.",
    disconnected:
      "Google sign-in is configured on this server, but this business has not connected a Gmail account yet.",
    connected:
      "Gmail is connected in the integrations area. OrderBook AI still never emails from here — it only ever creates records inside OrderBook.",
    error:
      "Gmail is connected, but its last call failed. Reconnect or retry from the integrations page.",
  },
  google_calendar: {
    not_configured:
      "This server has no Google Calendar credentials, so bookings stay inside OrderBook only.",
    disconnected:
      "Google sign-in is configured on this server, but no Google Calendar is connected for this business yet.",
    connected:
      "Google Calendar is connected in the integrations area. Sync runs there — OrderBook AI only ever creates records inside OrderBook.",
    error:
      "Google Calendar is connected, but its last sync failed. Check the integrations page before trusting the sync.",
  },
};

const UNLOCKS: Record<AiChannelStatus["id"], string> = {
  whatsapp:
    "Sending a quote, a payment reminder or a booking confirmation would start here — after an explicit confirmation from you, every time.",
  gmail:
    "Drafting the follow-up for an unanswered quote, and reading replies back into the customer timeline.",
  google_calendar:
    "Two-way sync for appointments and the reminder tasks the automations propose.",
};

const LABELS: Record<AiChannelStatus["id"], string> = {
  whatsapp: "WhatsApp",
  gmail: "Gmail",
  google_calendar: "Google Calendar",
};

async function resolveStatus(
  brandCode: string,
  channelId: AiChannelStatus["id"],
  configuration: ReturnType<typeof readIntegrationConfiguration>,
  lastError: string | undefined,
): Promise<IntegrationStatus> {
  const { integration, googleBacked } = CHANNEL_BACKING[channelId];

  // Mirrors the integrations read model: Google needs OAuth *and* a vault key,
  // WhatsApp is a server-side token, so being configured *is* being connected.
  const configured = googleBacked
    ? configuration.google && configuration.vault
    : configuration.whatsapp;
  if (!configured) return "not_configured";

  const connected = googleBacked
    ? (await hasStoredConnection(brandCode, integration)).connected
    : true;
  if (!connected) return "disconnected";

  return lastError ? "error" : "connected";
}

/**
 * Reads the integrations area's non-secret state per brand. Called on the
 * server by `loader.ts`; the result is plain data across the boundary.
 */
export async function buildChannelStatuses(
  brandCode: string,
): Promise<AiChannelStatus[]> {
  const configuration = readIntegrationConfiguration();
  const prefs = await readIntegrationPrefs(brandCode);

  const ids = Object.keys(CHANNEL_BACKING) as AiChannelStatus["id"][];
  const statuses = await Promise.all(
    ids.map((id) =>
      resolveStatus(
        brandCode,
        id,
        configuration,
        prefs.status?.[CHANNEL_BACKING[id].integration]?.lastError,
      ),
    ),
  );

  return ids.map((id, index) => {
    const status = statuses[index];
    return {
      id,
      label: LABELS[id],
      status,
      summary: SUMMARIES[id][status],
      unlocks: UNLOCKS[id],
    };
  });
}
