process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import type { CustomerReview } from "@/types/crm";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { DEMO_BRAND_CODES } from "@/lib/workspace/constants";
import {
  escalationCandidate,
  isUnanswered,
  lexiconScore,
  reviewAgeInDays,
  reviewInboxSummary,
  scoreReviewSentiment,
  unansweredReviews,
  validateReviewResponse,
} from "./reviews";

const NOW = new Date("2026-11-16T09:00:00.000+05:30");

function review(over: Partial<CustomerReview> = {}): CustomerReview {
  return {
    id: "r1",
    brand_id: "b1",
    customer_id: "c1",
    source: "Google Business Profile",
    rating: 5,
    text: "Lovely place, best filter coffee in the neighbourhood.",
    reviewed_at: "2026-11-10T10:00:00.000Z",
    response_text: null,
    responded_at: null,
    sentiment: "positive",
    tags: [],
    staff_mentioned: null,
    internal_notes: null,
    status: "new",
    complaint_id: null,
    ...over,
  };
}

describe("lexiconScore", () => {
  it("counts praise and complaint separately", () => {
    expect(lexiconScore("Lovely and helpful")).toBe(2);
    expect(lexiconScore("The food was cold and we waited too long")).toBe(-2);
    expect(lexiconScore("It was a Tuesday")).toBe(0);
  });

  it("matches from a word start, so suffixes do not count", () => {
    expect(lexiconScore("The greatest")).toBe(1);
    expect(lexiconScore("aegrate")).toBe(0);
  });

  it("is blind to case and extra whitespace", () => {
    expect(lexiconScore("LOVELY   helpful")).toBe(lexiconScore("lovely helpful"));
  });
});

describe("scoreReviewSentiment", () => {
  it("trusts the stars when the words say nothing", () => {
    expect(scoreReviewSentiment("Average.", 5)).toBe("positive");
    expect(scoreReviewSentiment("Average.", 3)).toBe("neutral");
    expect(scoreReviewSentiment("Average.", 1)).toBe("negative");
  });

  it("steps a four-or-five-star review down when the words complain", () => {
    expect(scoreReviewSentiment("The coffee was cold and we waited too long", 4)).toBe("neutral");
    expect(scoreReviewSentiment("It was fine", 4)).toBe("positive");
  });

  it("steps a low star rating up when the words are kind", () => {
    expect(scoreReviewSentiment("Lovely staff and great coffee", 2)).toBe("neutral");
    expect(scoreReviewSentiment("Confusing bill, cold food", 2)).toBe("negative");
  });

  it("moves a three-star review either way", () => {
    expect(scoreReviewSentiment("Lovely staff, very helpful", 3)).toBe("positive");
    expect(scoreReviewSentiment("Waited and waited, refund refused", 3)).toBe("negative");
    expect(scoreReviewSentiment("It existed", 3)).toBe("neutral");
  });

  it("never jumps two steps at once", () => {
    expect(scoreReviewSentiment("Lovely helpful great perfect", 1)).not.toBe("positive");
    expect(scoreReviewSentiment("cold wrong late damaged", 5)).not.toBe("negative");
  });

  it("is deterministic for the same words", () => {
    const text = "Chipped edge, they kept changing the delivery date";
    expect(scoreReviewSentiment(text, 2)).toBe(scoreReviewSentiment(text, 2));
  });
});

describe("the seeded inbox matches the scorer", () => {
  it("stores the label the deterministic scorer produces", () => {
    for (const code of DEMO_BRAND_CODES) {
      const { reviews } = getDemoBrandPack(code);
      expect(reviews.length).toBeGreaterThan(0);
      for (const row of reviews) {
        expect(
          [row.id, scoreReviewSentiment(row.text, row.rating)],
          `${code} ${row.id}`
        ).toEqual([row.id, row.sentiment]);
      }
    }
  });
});

describe("the inbox", () => {
  it("treats a blank reply as no reply", () => {
    expect(isUnanswered(review({ response_text: null }))).toBe(true);
    expect(isUnanswered(review({ response_text: "   " }))).toBe(true);
    expect(isUnanswered(review({ response_text: "Sorry about that." }))).toBe(false);
  });

  it("queues the silence oldest first", () => {
    const rows = [
      review({ id: "a", response_text: "replied", reviewed_at: "2026-11-01T10:00:00.000Z" }),
      review({ id: "b", reviewed_at: "2026-11-12T10:00:00.000Z" }),
      review({ id: "c", reviewed_at: "2026-11-02T10:00:00.000Z" }),
    ];
    expect(unansweredReviews(rows).map((r) => r.id)).toEqual(["c", "b"]);
  });

  it("ages a review in local days", () => {
    expect(reviewAgeInDays(review({ reviewed_at: "2026-11-14T17:30:00.000Z" }), NOW)).toBe(2);
    expect(reviewAgeInDays(review({ reviewed_at: "2026-12-01T10:00:00.000Z" }), NOW)).toBe(0);
  });

  it("escalates what hurts and leaves the praise alone", () => {
    expect(escalationCandidate(review({ sentiment: "negative", rating: 4 }))).toBe(true);
    expect(escalationCandidate(review({ sentiment: "neutral", rating: 2 }))).toBe(true);
    expect(escalationCandidate(review({ sentiment: "neutral", rating: 3 }))).toBe(true);
    expect(escalationCandidate(review({ sentiment: "positive", rating: 5 }))).toBe(false);
    expect(escalationCandidate(review({ sentiment: "positive", rating: 5, response_text: "Thanks" }))).toBe(false);
  });

  it("does not escalate twice", () => {
    expect(
      escalationCandidate(review({ sentiment: "negative", rating: 1, complaint_id: "cp1" })),
    ).toBe(false);
  });

  it("only counts a three-star review as stale when nobody replied", () => {
    const answered = review({ rating: 3, sentiment: "neutral", response_text: "Noted, thank you" });
    expect(escalationCandidate(answered)).toBe(false);
  });
});

describe("reviewInboxSummary", () => {
  const rows = [
    review({ id: "r1", rating: 5, sentiment: "positive", source: "Google Business Profile", staff_mentioned: "Nikhil" }),
    review({
      id: "r2",
      rating: 2,
      sentiment: "negative",
      source: "Google Business Profile",
      text: "Cold coffee, we waited too long",
      reviewed_at: "2026-10-20T10:00:00.000Z",
    }),
    review({
      id: "r3",
      rating: 4,
      sentiment: "positive",
      source: "Zomato",
      response_text: "Glad you came back.",
      staff_mentioned: "Nikhil",
    }),
    review({ id: "r4", rating: 1, sentiment: "negative", source: "Zomato", text: "Broken chair", complaint_id: "cp1" }),
  ];
  const summary = reviewInboxSummary(rows, NOW);

  it("totals the ratings and the sentiment spread", () => {
    expect(summary.total).toBe(4);
    expect(summary.averageRating).toBe(3);
    expect(summary.byRating).toEqual({ 1: 1, 2: 1, 3: 0, 4: 1, 5: 1 });
    expect(summary.bySentiment).toEqual({ positive: 2, neutral: 0, negative: 2 });
  });

  it("reports how long the worst silence has run", () => {
    expect(summary.unanswered).toBe(3);
    expect(summary.oldestUnansweredDays).toBe(reviewAgeInDays(rows[1], NOW));
  });

  it("counts escalation candidates once each", () => {
    expect(summary.escalationCandidates).toBe(1);
  });

  it("ranks sources by volume, each with its own average", () => {
    expect(summary.bySource).toEqual([
      { source: "Google Business Profile", count: 2, averageRating: 3.5 },
      { source: "Zomato", count: 2, averageRating: 2.5 },
    ]);
  });

  it("splits staff mentions into praise and blame", () => {
    expect(summary.staffMentions).toEqual([{ name: "Nikhil", positive: 2, negative: 0 }]);
  });

  it("handles an empty inbox without dividing by zero", () => {
    const empty = reviewInboxSummary([], NOW);
    expect(empty.total).toBe(0);
    expect(empty.averageRating).toBeNull();
    expect(empty.oldestUnansweredDays).toBeNull();
    expect(empty.bySource).toEqual([]);
    expect(empty.staffMentions).toEqual([]);
  });
});

describe("validateReviewResponse", () => {
  it("requires something to post", () => {
    expect(validateReviewResponse("   ").ok).toBe(false);
  });

  it("trims what it accepts", () => {
    const result = validateReviewResponse("  Sorry about the wait.  ");
    expect(result.ok && result.value).toBe("Sorry about the wait.");
  });

  it("refuses a reply too long for any public channel", () => {
    expect(validateReviewResponse("a".repeat(501)).ok).toBe(false);
    expect(validateReviewResponse("a".repeat(500)).ok).toBe(true);
  });
});
