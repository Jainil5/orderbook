import {
  COMPLAINT_SEVERITIES,
  REVIEW_SOURCES,
  type ComplaintSeverity,
  type CustomerComplaint,
  type CustomerReview,
  type ReviewSentiment,
} from "@/types/crm";
import { wholeDaysSince } from "@/lib/manager/time";

/**
 * Deterministic review sentiment.
 *
 * The reviewer's own star rating sets the baseline; a fixed lexicon can move
 * the label one step when the words clearly disagree with the stars (four
 * stars with two complaints is still a mixed review). No model is involved, so
 * the same text always scores the same way and OrderBook AI can later be
 * measured against this label instead of inventing one.
 */

const POSITIVE_PHRASES = [
  "lovely",
  "outstanding",
  "best",
  "worth the trip",
  "knowledgeable",
  "on time",
  "exactly",
  "cleaner",
  "default cafe",
  "grateful",
  "great",
  "perfect",
  "helpful",
  "promised",
  "proper",
  "remembers",
  "without being asked",
  "fits",
  "good",
  "fine",
] as const;

const NEGATIVE_PHRASES = [
  "cold",
  "wrong",
  "confusing",
  "part payment",
  "waited",
  "waiting",
  "late",
  "too loud",
  "chipped",
  "refund",
  "damage",
  "broken",
  "poor",
  "worst",
  "keeps changing",
  "moved twice",
  "chase",
] as const;

/** How far the words have to disagree with the stars to move the label. */
const LEXICON_OVERRIDE_MARGIN = 2;

export function lexiconScore(text: string): number {
  const haystack = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const hits = (phrases: readonly string[]) =>
    phrases.reduce((n, p) => (haystack.includes(` ${p}`) ? n + 1 : n), 0);
  return hits(POSITIVE_PHRASES) - hits(NEGATIVE_PHRASES);
}

function baseline(rating: number): ReviewSentiment {
  if (rating >= 4) return "positive";
  if (rating <= 2) return "negative";
  return "neutral";
}

export function scoreReviewSentiment(text: string, rating: number): ReviewSentiment {
  const fromStars = baseline(rating);
  const score = lexiconScore(text);
  if (fromStars === "positive" && score <= -LEXICON_OVERRIDE_MARGIN) return "neutral";
  if (fromStars === "negative" && score >= LEXICON_OVERRIDE_MARGIN) return "neutral";
  if (fromStars === "neutral" && score >= LEXICON_OVERRIDE_MARGIN) return "positive";
  if (fromStars === "neutral" && score <= -LEXICON_OVERRIDE_MARGIN) return "negative";
  return fromStars;
}

export function isUnanswered(review: CustomerReview): boolean {
  return !review.response_text || review.response_text.trim() === "";
}

/** Reviews nobody has replied to, oldest first — the inbox order. */
export function unansweredReviews(reviews: CustomerReview[]): CustomerReview[] {
  return reviews
    .filter(isUnanswered)
    .sort((a, b) => new Date(a.reviewed_at).getTime() - new Date(b.reviewed_at).getTime());
}

/** An unanswered negative review goes stale faster than an unanswered praise. */
export function reviewAgeInDays(review: CustomerReview, now: Date): number {
  return Math.max(0, wholeDaysSince(review.reviewed_at, now));
}

/**
 * A review deserves a complaint record when it is negative or low-rated and is
 * either unanswered or already escalated but with nothing tracking it.
 */
export function escalationCandidate(review: CustomerReview): boolean {
  if (review.complaint_id) return false;
  if (review.sentiment === "negative" || review.rating <= 2) return true;
  return review.rating <= 3 && isUnanswered(review);
}

export type ReviewInboxSummary = {
  total: number;
  averageRating: number | null;
  byRating: Record<1 | 2 | 3 | 4 | 5, number>;
  bySentiment: Record<ReviewSentiment, number>;
  unanswered: number;
  oldestUnansweredDays: number | null;
  escalationCandidates: number;
  bySource: { source: string; count: number; averageRating: number }[];
  staffMentions: { name: string; positive: number; negative: number }[];
};

export function reviewInboxSummary(
  reviews: CustomerReview[],
  now: Date = new Date(),
): ReviewInboxSummary {
  const byRating: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const bySentiment: Record<ReviewSentiment, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
  };
  const sourceBuckets = new Map<string, number[]>();
  const mentions = new Map<string, { positive: number; negative: number }>();

  let ratingSum = 0;
  for (const review of reviews) {
    byRating[review.rating as 1 | 2 | 3 | 4 | 5] += 1;
    bySentiment[review.sentiment] += 1;
    ratingSum += review.rating;
    const bucket = sourceBuckets.get(review.source);
    if (bucket) bucket.push(review.rating);
    else sourceBuckets.set(review.source, [review.rating]);
    if (review.staff_mentioned) {
      const key = review.staff_mentioned;
      const tally = mentions.get(key) ?? { positive: 0, negative: 0 };
      if (review.sentiment === "positive") tally.positive += 1;
      if (review.sentiment === "negative") tally.negative += 1;
      mentions.set(key, tally);
    }
  }

  const stale = unansweredReviews(reviews).filter((r) => r.sentiment !== "positive");

  return {
    total: reviews.length,
    averageRating: reviews.length
      ? Math.round((ratingSum / reviews.length) * 100) / 100
      : null,
    byRating,
    bySentiment,
    unanswered: reviews.filter(isUnanswered).length,
    oldestUnansweredDays: stale.length ? reviewAgeInDays(stale[0], now) : null,
    escalationCandidates: reviews.filter(escalationCandidate).length,
    bySource: [...sourceBuckets.entries()]
      .map(([source, ratings]) => ({
        source,
        count: ratings.length,
        averageRating: Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 100) / 100,
      }))
      .sort((a, b) => b.count - a.count),
    staffMentions: [...mentions.entries()]
      .map(([name, tally]) => ({ name, ...tally }))
      .sort((a, b) => b.positive + b.negative - (a.positive + a.negative)),
  };
}

export type ReviewResponse = { text: string; respondedAt: string };

export function validateReviewResponse(text: string): { ok: true; value: string } | { ok: false; message: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: "Write the reply you want posted." };
  if (trimmed.length > 500) {
    return { ok: false, message: "Keep the reply under 500 characters." };
  }
  return { ok: true, value: trimmed };
}

/**
 * Recording a review by hand — the desk exists even though no live Google or
 * Zomato feed is wired up, so the source is chosen from the list the inbox
 * groups by rather than typed free.
 */
export type ReviewInput = {
  customer_id: string;
  source: string;
  rating: string;
  text: string;
  reviewed_at: string;
  staff_mentioned: string;
  internal_notes: string;
  tags: string;
};

export const EMPTY_REVIEW_INPUT: ReviewInput = {
  customer_id: "",
  source: "Google Business Profile",
  rating: "5",
  text: "",
  reviewed_at: "",
  staff_mentioned: "",
  internal_notes: "",
  tags: "",
};

export type NewReview = Omit<
  CustomerReview,
  "id" | "brand_id" | "response_text" | "responded_at" | "status" | "complaint_id"
>;

function clampText(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function tagList(value: string): string[] {
  return value
    .split(/[,\n|]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function validateReviewInput(
  input: ReviewInput,
  known: { customerIds: string[] },
  now: Date = new Date(),
): { ok: true; value: NewReview } | { ok: false; message: string } {
  const text = clampText(input.text, 1000);
  if (!text) return { ok: false, message: "Paste what the customer said." };
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, message: "Rate it in whole stars, 1 to 5." };
  }
  if (!REVIEW_SOURCES.includes(input.source as (typeof REVIEW_SOURCES)[number])) {
    return { ok: false, message: "Pick where the review came from." };
  }
  const customerId = input.customer_id.trim();
  if (customerId && !known.customerIds.includes(customerId)) {
    return { ok: false, message: "Pick a customer from the list." };
  }
  const reviewedAt = input.reviewed_at.trim();
  const parsed = reviewedAt ? new Date(reviewedAt) : now;
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, message: "That review date doesn't look right." };
  }
  return {
    ok: true,
    value: {
      customer_id: customerId || null,
      source: input.source,
      rating,
      text,
      reviewed_at: parsed.toISOString(),
      staff_mentioned: clampText(input.staff_mentioned, 60) || null,
      internal_notes: clampText(input.internal_notes, 500) || null,
      tags: tagList(input.tags),
      // The label always comes from the deterministic scorer — never typed in.
      sentiment: scoreReviewSentiment(text, rating),
    },
  };
}

export const COMPLAINT_SEVERITY_LABELS: Record<ComplaintSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/**
 * A complaint raised from the review desk, a call log or straight from the
 * customer. Escalation links both rows so the 360 shows the same story twice
 * rather than two unrelated records.
 */
export type ComplaintInput = {
  customer_id: string;
  review_id: string;
  interaction_id: string;
  subject: string;
  detail: string;
  severity: string;
  owner_staff_id: string;
  raised_at: string;
};

export const EMPTY_COMPLAINT_INPUT: ComplaintInput = {
  customer_id: "",
  review_id: "",
  interaction_id: "",
  subject: "",
  detail: "",
  severity: "medium",
  owner_staff_id: "",
  raised_at: "",
};

export type NewComplaint = Omit<
  CustomerComplaint,
  "id" | "brand_id" | "status" | "resolved_at"
>;

export function validateComplaintInput(
  input: ComplaintInput,
  known: {
    customerIds: string[];
    reviewIds: string[];
    interactionIds: string[];
    staffIds: string[];
  },
  now: Date = new Date(),
): { ok: true; value: NewComplaint } | { ok: false; message: string } {
  const subject = clampText(input.subject, 160);
  if (!subject) return { ok: false, message: "Say what went wrong." };
  if (!COMPLAINT_SEVERITIES.includes(input.severity as ComplaintSeverity)) {
    return { ok: false, message: "Pick how serious this is." };
  }
  const customerId = input.customer_id.trim();
  const reviewId = input.review_id.trim();
  const interactionId = input.interaction_id.trim();
  if (!customerId && !reviewId && !interactionId) {
    return { ok: false, message: "Choose whose complaint this is." };
  }
  if (customerId && !known.customerIds.includes(customerId)) {
    return { ok: false, message: "Pick a customer from the list." };
  }
  if (reviewId && !known.reviewIds.includes(reviewId)) {
    return { ok: false, message: "That review is not in the inbox." };
  }
  if (interactionId && !known.interactionIds.includes(interactionId)) {
    return { ok: false, message: "That interaction is not in the log." };
  }
  const staffId = input.owner_staff_id.trim();
  if (staffId && !known.staffIds.includes(staffId)) {
    return { ok: false, message: "Pick a colleague from the staff list." };
  }
  const raisedAt = input.raised_at.trim();
  const parsed = raisedAt ? new Date(raisedAt) : now;
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, message: "That raised date doesn't look right." };
  }
  return {
    ok: true,
    value: {
      customer_id: customerId || null,
      review_id: reviewId || null,
      interaction_id: interactionId || null,
      subject,
      detail: clampText(input.detail, 1000) || null,
      severity: input.severity as ComplaintSeverity,
      owner_staff_id: staffId || null,
      raised_at: parsed.toISOString(),
    },
  };
}
