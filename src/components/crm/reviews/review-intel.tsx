import { CrmChip, CrmPanel } from "@/components/crm/crm-ui";
import {
  RATING_VALUES,
  SENTIMENT_LABELS,
  SENTIMENT_TONE,
} from "./review-vocabulary";
import type { ReviewIntelligence } from "@/lib/crm/metrics";
import type { ReviewSentiment } from "@/types/crm";

/**
 * Review intelligence — every number on these panels is `crm.reviewIntel`
 * (`analyzeReviews`) read straight off the loader. Nothing here adds up,
 * averages or re-classifies anything.
 */
export function ReviewIntelPanels({
  intel,
  totalReviews,
}: {
  intel: ReviewIntelligence;
  totalReviews: number;
}) {
  const tallest = Math.max(
    1,
    ...RATING_VALUES.map((stars) => intel.distribution[stars]),
  );

  return (
    <div className="ob-stagger mb-4 grid gap-4 lg:grid-cols-2">
      <CrmPanel
        title="Rating spread"
        meta={
          intel.average === null
            ? `${totalReviews} recorded`
            : `Average ${intel.average.toFixed(2)} · ${totalReviews} recorded`
        }
      >
        <ul className="space-y-1.5">
          {RATING_VALUES.map((stars) => {
            const count = intel.distribution[stars];
            return (
              <li key={stars} className="flex items-center gap-3 text-sm">
                <span className="w-8 shrink-0 tabular-nums text-[var(--ob-text-muted)]">
                  {stars}★
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--crm-wash)]">
                  <span
                    className="block h-full rounded-full bg-[var(--crm-lab)]"
                    style={{ width: `${Math.round((count / tallest) * 100)}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right font-medium tabular-nums">
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      </CrmPanel>

      <CrmPanel
        title="Sentiment and replies"
        meta={`${intel.unanswered} awaiting a reply · ${intel.escalated} escalated`}
      >
        <div className="flex flex-wrap gap-2">
          {(Object.keys(intel.sentimentCounts) as ReviewSentiment[]).map((key) => (
            <CrmChip key={key} tone={SENTIMENT_TONE[key]}>
              {SENTIMENT_LABELS[key]}
              <span className="tabular-nums opacity-70">
                {intel.sentimentCounts[key]}
              </span>
            </CrmChip>
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--ob-text-muted)]">
          Sentiment is the label a person recorded; otherwise the stars decide.
          Reply state (“awaiting a reply”, “escalated”) is counted separately
          from response_status.
        </p>
      </CrmPanel>

      <CrmPanel title="Tags customers use" meta="Negative · then positive">
        <TagBlock label="Behind the complaints" tags={intel.commonComplaintTags} tone="danger" />
        <TagBlock label="Behind the praise" tags={intel.praisedTags} tone="positive" />
      </CrmPanel>

      <CrmPanel
        title="Staff named in reviews"
        meta={intel.staffMentions.length ? `${intel.staffMentions.length} named` : "Nobody named yet"}
      >
        {intel.staffMentions.length === 0 ? (
          <p className="text-sm text-[var(--ob-text-muted)]">
            Record who a review mentions and the praise and the complaints get
            attributed here.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--ob-border)] text-sm">
            {intel.staffMentions.slice(0, 6).map((mention) => (
              <li key={mention.staff} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">{mention.staff}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs">
                  <span className="crm-sentiment-positive tabular-nums">
                    {mention.positive} positive
                  </span>
                  <span className="crm-sentiment-negative tabular-nums">
                    {mention.negative} negative
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CrmPanel>
    </div>
  );
}

function TagBlock({
  label,
  tags,
  tone,
}: {
  label: string;
  tags: { tag: string; count: number }[];
  tone: "danger" | "positive";
}) {
  return (
    <div className="mb-3 last:mb-0">
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
        {label}
      </h4>
      {tags.length === 0 ? (
        <p className="text-xs text-[var(--ob-text-muted)]">Nothing tagged yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.slice(0, 8).map((entry) => (
            <CrmChip key={entry.tag} tone={tone}>
              {entry.tag}
              <span className="tabular-nums opacity-70">{entry.count}</span>
            </CrmChip>
          ))}
        </div>
      )}
    </div>
  );
}
