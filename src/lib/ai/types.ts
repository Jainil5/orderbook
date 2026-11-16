/**
 * OrderBook AI domain types.
 *
 * Two rules are encoded in these shapes and the rest of the area must keep
 * honouring them:
 *
 * 1. Everything is *grounded*. An insight always carries the numbers and the
 *    entity names it was derived from (`evidence`), so the owner can check the
 *    work instead of trusting it.
 * 2. Nothing is *done*. An action is an `AiActionProposal` that stays in
 *    `draft` until a human accepts it, and accepting creates an OrderBook
 *    record only — a task or a note. There is deliberately no field here that
 *    could represent "emailed" or "sent on WhatsApp"; outbound delivery is the
 *    channel integrations area (`/manager/productivity/integrations`).
 */

import type { NoteCategory } from "@/types/business";
import type { TaskPriority } from "@/types/operations";
import type { IntegrationStatus } from "@/types/integrations";

export type AiSeverity = "critical" | "warning" | "opportunity" | "info";

export type AiInsightKind =
  | "receivables"
  | "quotes"
  | "inventory"
  | "margin"
  | "sales"
  | "tasks"
  | "appointments"
  | "staffing"
  | "expenses"
  | "procurement"
  | "cash";

/** One checked fact behind an insight: what it is, how big, and where it lives. */
export type AiEvidence = {
  label: string;
  value: string;
  href?: string;
};

export type AiMetric = { label: string; value: string };

export type AiInsight = {
  id: string;
  kind: AiInsightKind;
  severity: AiSeverity;
  headline: string;
  detail: string;
  evidence: AiEvidence[];
  metric: AiMetric | null;
  /** Sorts inside a severity band; larger sorts first. Deterministic. */
  score: number;
  actionHref: string;
  actionLabel: string;
};

export type AiRecommendation = {
  id: string;
  insightId: string;
  kind: AiInsightKind;
  title: string;
  /** Why this is worth doing now, quoting the same numbers as the insight. */
  why: string;
  /** Where the work actually gets finished. */
  href: string;
  linkLabel: string;
  evidence: AiEvidence[];
  /** The OrderBook record this creates when the owner accepts the proposal. */
  record: AiProposalRecord;
  /** Honest limit of the action, shown next to the accept button. */
  deliveryNote: string;
};

export type AiProposalStatus = "draft" | "accepted" | "rejected";

/** Task priority reuses the operations enum so proposals need no mapping. */
export type AiTaskPriority = TaskPriority;

/**
 * What accepting a proposal writes. Only OrderBook records — never an external
 * send. `note` is a draft purchase order written into Notes, not into the
 * procurement tables, so a buyer still reviews and raises the real PO.
 */
export type AiProposalRecord =
  | {
      kind: "task";
      title: string;
      description: string;
      priority: TaskPriority;
    }
  | {
      kind: "note";
      title: string;
      body: string;
      category: NoteCategory;
    };

export type AiActionProposal = {
  /** Stable, content-derived id: same data + same rule = same id. */
  id: string;
  ruleId: string | null;
  ruleName: string | null;
  title: string;
  /** Plain-language "what will happen", written out before anything is saved. */
  whatWillHappen: string;
  record: AiProposalRecord;
  evidence: AiEvidence[];
  /** Where to look after accepting. */
  actionHref: string;
  actionLabel: string;
  status: AiProposalStatus;
  createdAt: string;
  outcomeHref?: string;
  outcomeLabel?: string;
  deliveryNote: string;
};

export type AutomationRule = {
  id: string;
  name: string;
  /** When it fires, in plain words. */
  trigger: string;
  /** What lands in the proposals inbox. */
  creates: string;
  href: string;
  linkLabel: string;
  defaultEnabled: boolean;
  /** Always true in this build: every automation is confirm-before-write. */
  requiresConfirmation: true;
  deliveryNote: string;
};

export type AssistantGrounding = {
  label: string;
  value: string;
  href: string;
};

export type AssistantAnswer = {
  question: string;
  text: string;
  grounding: AssistantGrounding[];
  /** Follow-up questions the engine can actually answer. */
  suggestions: string[];
  /**
   * `model` is only ever set by a real provider response. The local engine
   * always answers as `engine`, and `engineLabel` states that in the UI.
   */
  source: "engine" | "model";
  engineLabel: string;
  intent: string | null;
};

export type AiChannelStatus = {
  id: "whatsapp" | "gmail" | "google_calendar";
  label: string;
  /**
   * Real connection status, read from the integrations area by `channels.ts`.
   * Reporting a status here changes nothing about what this area can do:
   * there is no send path in `lib/ai` and accepting a proposal only ever
   * writes an OrderBook record.
   */
  status: IntegrationStatus;
  summary: string;
  unlocks: string;
};

/** What `/ai` renders. Built on the server, plain data across the boundary. */
export type AiWorkspaceView = {
  brandName: string;
  currencyCode: string;
  provider: AiProviderState;
  channels: AiChannelStatus[];
  insights: AiInsight[];
  recommendations: AiRecommendation[];
  rules: AutomationRule[];
  /** Rule id -> enabled, after defaults are applied. */
  automationState: Record<string, boolean>;
  proposals: AiActionProposal[];
  handled: AiActionProposal[];
  assistantPrompts: string[];
  generatedAt: string;
};

export type AiProviderState = {
  status: "not_configured" | "configured";
  /** Safe to render. Never contains a key or a base URL value. */
  label: string;
  model: string | null;
  /** Names of the server env vars checked — values are never returned. */
  envNames: readonly string[];
  /** Env var names that are unset, so the UI can say what is missing. */
  missing: readonly string[];
};

/** Persisted per brand in that brand's `brand_settings` row (see `lib/ai/prefs-store.ts`). */
export type AiPrefsState = {
  enabled: Record<string, boolean>;
  /** proposal id -> last human decision, so the inbox does not refill itself. */
  handled: Record<string, AiProposalLogEntry>;
};

export type AiProposalLogEntry = {
  status: "accepted" | "rejected";
  at: string;
  outcomeHref?: string;
  outcomeLabel?: string;
};
