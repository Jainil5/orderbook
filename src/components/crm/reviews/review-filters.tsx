import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  RATING_VALUES,
  REVIEW_TABS,
  REVIEW_TAB_LABELS,
  SENTIMENT_LABELS,
  SENTIMENT_VALUES,
  type ReviewTab,
} from "./review-vocabulary";
import type { ReviewSentiment } from "@/types/crm";

/**
 * Tabs and filters, all as links.
 *
 * State lives in the URL (`?tab= &rating= &sentiment= &source= &q=`) so the
 * screen is shareable and the back button works; the deep links the CRM
 * overview uses (`?tab=complaints&id=…`, `?id=…`) land here unchanged.
 */
export function ReviewFilters({
  tab,
  q,
  rating,
  sentiment,
  source,
  distribution,
  sourceOptions,
}: {
  tab: ReviewTab;
  q: string;
  rating: string;
  sentiment: string;
  source: string;
  /** Star spread of every review — straight from `crm.reviewIntel`. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  sourceOptions: { value: string; label: string }[];
}) {
  const hrefFor = (changes: Record<string, string>) => {
    // The focused row (`?id=`) is deliberately not carried across a tab or
    // filter change — it points at one row of the set it came from.
    const next = { tab, q, rating, sentiment, source, ...changes };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      const trimmed = (value ?? "").trim();
      if (!trimmed) continue;
      if (key === "tab" && trimmed === "inbox") continue; // inbox is the default
      params.set(key, trimmed);
    }
    const qs = params.toString();
    return qs ? `/customers/reviews?${qs}` : "/customers/reviews";
  };

  const filtering = Boolean(rating || sentiment || source);
  const isReviewTab = tab !== "complaints";

  return (
    <div className="mb-4 space-y-3">
      <div
        role="tablist"
        aria-label="Reviews"
        className="ob-scroll-x flex gap-1 border-b border-[var(--ob-border)] pb-px"
      >
        {REVIEW_TABS.map((id) => {
          const selected = id === tab;
          return (
            <Link
              key={id}
              href={hrefFor({ tab: id })}
              role="tab"
              aria-selected={selected}
              className={cn(
                "ob-touch-target -mb-px shrink-0 snap-start rounded-t-md border-b-2 px-3 py-2.5 text-sm font-medium transition sm:px-4",
                selected
                  ? "border-[var(--crm-lab-strong)] text-[var(--crm-lab-strong)]"
                  : "border-transparent text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]",
              )}
            >
              {REVIEW_TAB_LABELS[id]}
            </Link>
          );
        })}
      </div>

      {isReviewTab ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[var(--ob-text-muted)]">Stars</span>
            {RATING_VALUES.map((value) => {
              const selected = rating === String(value);
              return (
                <Link
                  key={value}
                  href={hrefFor({ rating: selected ? "" : String(value) })}
                  aria-pressed={selected}
                  className={chipClass(selected)}
                >
                  {value}★
                  <span className="ml-1 tabular-nums opacity-70">
                    {distribution[value]}
                  </span>
                </Link>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[var(--ob-text-muted)]">Sentiment</span>
            {SENTIMENT_VALUES.map((value: ReviewSentiment) => {
              const selected = sentiment === value;
              return (
                <Link
                  key={value}
                  href={hrefFor({ sentiment: selected ? "" : value })}
                  aria-pressed={selected}
                  className={chipClass(selected)}
                >
                  {SENTIMENT_LABELS[value]}
                </Link>
              );
            })}
          </div>

          {sourceOptions.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[var(--ob-text-muted)]">Source</span>
              {sourceOptions.map((option) => {
                const selected = source === option.value;
                return (
                  <Link
                    key={option.value}
                    href={hrefFor({ source: selected ? "" : option.value })}
                    aria-pressed={selected}
                    className={chipClass(selected)}
                  >
                    {option.label}
                  </Link>
                );
              })}
            </div>
          ) : null}

          {filtering || q ? (
            <Link
              href={hrefFor({ rating: "", sentiment: "", source: "", q: "" })}
              className="ob-touch-target text-[var(--ob-primary)] hover:underline"
            >
              Clear filters
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function chipClass(selected: boolean) {
  return cn(
    "ob-touch-target inline-flex items-center rounded-full border px-2 py-0.5 transition",
    selected
      ? "border-[var(--crm-wash-line)] bg-[var(--crm-wash)] font-medium text-[var(--crm-lab-strong)]"
      : "border-[var(--ob-border)] text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]",
  );
}
