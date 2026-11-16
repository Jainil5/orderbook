/**
 * The review/complaint vocabulary this screen renders.
 *
 * `src/types/crm.ts` owns the values and the stored-word labels, so the form
 * selects here and the server actions validate against exactly the same words.
 * What lives here is what only a screen needs: tab routing, tones and the
 * plain-language guidance line. Nothing here derives a number.
 */

import {
  COMPLAINT_SEVERITIES,
  COMPLAINT_SEVERITY_LABELS,
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  REVIEW_SENTIMENTS,
  REVIEW_SOURCE_LABELS,
  type ComplaintSeverity,
  type ComplaintStatus,
  type ReviewResponseStatus,
  type ReviewSentiment,
  type ReviewSource,
} from "@/types/crm";

/**
 * The value lists and the stored-word labels now live with the entities in
 * `src/types/crm.ts` — one place, so a server action and this screen cannot
 * drift apart on what "in_progress" is called. What stays here is display
 * wording (tabs, tones, the guidance line) that only a screen needs.
 */
export {
  COMPLAINT_SEVERITIES,
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  REVIEW_SOURCE_LABELS,
};

/* Tabs — all state lives in the URL (`?tab=`), so a link is a tab change. */

export const REVIEW_TABS = [
  "inbox",
  "answered",
  "escalated",
  "complaints",
] as const;

export type ReviewTab = (typeof REVIEW_TABS)[number];

export const REVIEW_TAB_LABELS: Record<ReviewTab, string> = {
  inbox: "Inbox",
  answered: "Answered",
  escalated: "Escalated",
  complaints: "Complaints",
};

/** Unknown or missing `?tab=` always lands on the inbox — never a blank page. */
export function reviewTabFor(value: string | undefined | null): ReviewTab {
  return REVIEW_TABS.includes(value as ReviewTab)
    ? (value as ReviewTab)
    : "inbox";
}

/** Which response status a review tab shows (null for the complaints tab). */
export const REVIEW_TAB_STATUS: Record<ReviewTab, ReviewResponseStatus | null> = {
  inbox: "unanswered",
  answered: "answered",
  escalated: "escalated",
  complaints: null,
};

/* Sources */

export function reviewSourceLabel(source: ReviewSource | string): string {
  return REVIEW_SOURCE_LABELS[source as ReviewSource] ?? source;
}

/* Sentiment — counts come from `crm.reviewIntel`; this is display wording. */

export const SENTIMENT_VALUES: ReviewSentiment[] = REVIEW_SENTIMENTS;

export const SENTIMENT_LABELS: Record<ReviewSentiment, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

export const SENTIMENT_TONE: Record<
  ReviewSentiment,
  "positive" | "warning" | "danger"
> = {
  positive: "positive",
  neutral: "warning",
  negative: "danger",
};

/* Response status */

export const RESPONSE_STATUS_LABELS: Record<ReviewResponseStatus, string> = {
  unanswered: "Awaiting reply",
  answered: "Answered",
  escalated: "Escalated",
};

/* Ratings */

export const RATING_VALUES = [5, 4, 3, 2, 1] as const;

/* Complaints */

export const SEVERITY_LABELS: Record<ComplaintSeverity, string> =
  COMPLAINT_SEVERITY_LABELS;

export const SEVERITY_TONE: Record<
  ComplaintSeverity,
  "neutral" | "warning" | "danger"
> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};



export const COMPLAINT_STATUS_TONE: Record<
  ComplaintStatus,
  "neutral" | "warning" | "positive" | "danger"
> = {
  open: "danger",
  in_progress: "warning",
  resolved: "positive",
  closed: "neutral",
};

/**
 * The one honest "next action" a status implies. It is guidance for the person
 * holding the phone, not a workflow: nothing here fires a timer or moves a
 * complaint by itself.
 */
export const COMPLAINT_NEXT_STEP: Record<ComplaintStatus, string> = {
  open: "Assign an owner, then record what was promised.",
  in_progress: "Finish the fix and record the resolution.",
  resolved: "Close it once the customer has confirmed.",
  closed: "Nothing outstanding — reopen with a reason if it comes back.",
};

export function isComplaintStatus(value: string): value is ComplaintStatus {
  return COMPLAINT_STATUSES.includes(value as ComplaintStatus);
}
