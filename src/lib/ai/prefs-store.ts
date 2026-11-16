/**
 * AI preferences, stored per brand in that brand's `brand_settings` row in
 * `data/brand_settings.csv`, through `lib/workspace/prefs.ts`. No new file and
 * no new table is introduced.
 *
 * Values live under the namespaced keys `PrefsEntry` already owns
 * (`aiAutomationPrefs`, `aiProposalLog`) so they cannot collide with the
 * settings the workspace shell stores alongside them, and each area writes
 * only its own column (`ai_automations`, `ai_proposals`).
 */

import {
  readPrefsEntry,
  updatePrefsEntry,
  type PrefsEntry,
} from "@/lib/workspace/prefs";
import { AUTOMATION_RULES } from "./automations";
import type { AiPrefsState, AiProposalLogEntry } from "./types";

export const AI_AUTOMATION_PREF_KEY = "aiAutomationPrefs";
export const AI_PROPOSAL_LOG_KEY = "aiProposalLog";

/** Kept small on purpose: the log is history, not a ledger. */
const MAX_LOG_ENTRIES = 40;

const KNOWN_RULE_IDS = new Set(AUTOMATION_RULES.map((rule) => rule.id));

function sanitizeEnabled(value: unknown): Record<string, boolean> {
  if (typeof value !== "object" || value === null) return {};
  const enabled: Record<string, boolean> = {};
  for (const [ruleId, flag] of Object.entries(value)) {
    if (!KNOWN_RULE_IDS.has(ruleId)) continue;
    if (typeof flag === "boolean") enabled[ruleId] = flag;
  }
  return enabled;
}

function sanitizeLog(value: unknown): Record<string, AiProposalLogEntry> {
  if (typeof value !== "object" || value === null) return {};
  const handled: Record<string, AiProposalLogEntry> = {};
  for (const [proposalId, raw] of Object.entries(value)) {
    if (typeof raw !== "object" || raw === null) continue;
    const entry = raw as Partial<AiProposalLogEntry>;
    if (entry.status !== "accepted" && entry.status !== "rejected") continue;
    if (typeof entry.at !== "string") continue;
    handled[proposalId] = {
      status: entry.status,
      at: entry.at,
      outcomeHref:
        typeof entry.outcomeHref === "string" ? entry.outcomeHref.slice(0, 200) : undefined,
      outcomeLabel:
        typeof entry.outcomeLabel === "string"
          ? entry.outcomeLabel.slice(0, 120)
          : undefined,
    };
  }
  return handled;
}

/** Drops the oldest decisions once the cap is hit; insertion order is kept. */
function trimLog(handled: Record<string, AiProposalLogEntry>) {
  const ids = Object.keys(handled);
  if (ids.length <= MAX_LOG_ENTRIES) return handled;
  const trimmed: Record<string, AiProposalLogEntry> = {};
  for (const id of ids.slice(ids.length - MAX_LOG_ENTRIES)) {
    trimmed[id] = handled[id];
  }
  return trimmed;
}

export async function readAiPrefs(brandCode: string): Promise<AiPrefsState> {
  const entry = await readPrefsEntry(brandCode);
  return {
    enabled: sanitizeEnabled(entry[AI_AUTOMATION_PREF_KEY]),
    handled: sanitizeLog(entry[AI_PROPOSAL_LOG_KEY]),
  };
}

export async function setAutomationEnabledPref(
  brandCode: string,
  ruleId: string,
  enabled: boolean,
): Promise<void> {
  if (!KNOWN_RULE_IDS.has(ruleId)) return;
  const current = await readAiPrefs(brandCode);
  const patch: PrefsEntry = {
    [AI_AUTOMATION_PREF_KEY]: { ...current.enabled, [ruleId]: enabled },
  };
  await updatePrefsEntry(brandCode, patch);
}

export async function recordProposalDecision(
  brandCode: string,
  proposalId: string,
  decision: AiProposalLogEntry,
): Promise<void> {
  const current = await readAiPrefs(brandCode);
  const patch: PrefsEntry = {
    [AI_PROPOSAL_LOG_KEY]: trimLog({ ...current.handled, [proposalId]: decision }),
  };
  await updatePrefsEntry(brandCode, patch);
}
