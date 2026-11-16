"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/cn";
import { formatDate, pluralize } from "@/lib/format";
import {
  COMPLAINT_SEVERITY_LABELS,
  EMPTY_COMPLAINT_INPUT,
  EMPTY_REVIEW_INPUT,
  escalationCandidate,
  isUnanswered,
  reviewAgeInDays,
  reviewInboxSummary,
  type ComplaintInput,
  type ReviewInput,
} from "@/lib/crm/reviews";
import { toLocalInputValue } from "@/lib/manager/time";
import { useMounted } from "@/lib/use-mounted";
import {
  REVIEW_SOURCES,
  type ComplaintSeverity,
  type ComplaintStatus,
  type CustomerComplaint,
  type CustomerReview,
  type ReviewStatus,
} from "@/types/crm";
import {
  deleteComplaintAction,
  deleteReviewAction,
  respondToReviewAction,
  saveComplaintAction,
  saveReviewAction,
  setComplaintStatusAction,
  setReviewStatusAction,
} from "@/services/crm-actions";

type Option = { id: string; name: string };
type Filter = "all" | "unanswered" | "negative" | "escalating";

const STATUS_LABELS: Record<ReviewStatus, string> = {
  new: "New",
  acknowledged: "Acknowledged",
  escalated: "Escalated",
  closed: "Closed",
};

const STATUS_TONE: Record<ReviewStatus, "neutral" | "success" | "warning" | "danger"> = {
  new: "warning",
  acknowledged: "neutral",
  escalated: "danger",
  closed: "success",
};

const SENTIMENT_TONE = {
  positive: "success",
  neutral: "neutral",
  negative: "danger",
} as const;

const SEVERITY_TONE: Record<ComplaintSeverity, "neutral" | "warning" | "danger"> = {
  low: "neutral",
  medium: "warning",
  high: "danger",
};

const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5`} className="ob-num font-semibold">
      {"★".repeat(rating)}
      <span className="text-[var(--ob-line-hover)]">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

function agoLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} ${pluralize(days, "day")} ago`;
}

function toComplaintInput(review: CustomerReview): ComplaintInput {
  return {
    ...EMPTY_COMPLAINT_INPUT,
    customer_id: review.customer_id ?? "",
    review_id: review.id,
    subject: review.text.slice(0, 80) || "Complaint from a review",
    detail: review.text,
    severity: review.rating <= 2 ? "high" : "medium",
    raised_at: toLocalInputValue(new Date().toISOString()),
  };
}

/**
 * The reputation desk. Sentiment here is a deterministic lexicon score, not a
 * model guess, so the same review always gets the same answer — and an
 * unanswered low rating is what the escalation filter is really for.
 */
export function ReviewsInbox({
  reviews,
  complaints,
  customers,
  staff,
}: {
  reviews: CustomerReview[];
  complaints: CustomerComplaint[];
  customers: Option[];
  staff: Option[];
}) {
  const router = useRouter();
  const respondRef = useRef<HTMLDialogElement>(null);
  const complaintRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sourceFilter, setSourceFilter] = useState("");
  const [reply, setReply] = useState("");
  const [answering, setAnswering] = useState<CustomerReview | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewInput>(EMPTY_REVIEW_INPUT);
  const [editingReview, setEditingReview] = useState<CustomerReview | null>(null);
  const [complaintForm, setComplaintForm] = useState<ComplaintInput>(EMPTY_COMPLAINT_INPUT);
  const [editingComplaint, setEditingComplaint] = useState<CustomerComplaint | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        return true;
      }
      setError(result.message ?? "Could not save.");
      return false;
    } catch {
      setError("Could not save. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function startReply(review: CustomerReview) {
    setAnswering(review);
    setReply(review.response_text ?? "");
    setError(null);
    respondRef.current?.showModal();
  }

  function startComplaint(review: CustomerReview | null, complaint?: CustomerComplaint) {
    setEditingComplaint(complaint ?? null);
    setComplaintForm(
      complaint
        ? {
            customer_id: complaint.customer_id ?? "",
            review_id: complaint.review_id ?? "",
            interaction_id: complaint.interaction_id ?? "",
            subject: complaint.subject,
            detail: complaint.detail ?? "",
            severity: complaint.severity,
            owner_staff_id: complaint.owner_staff_id ?? "",
            raised_at: toLocalInputValue(complaint.raised_at),
          }
        : review
          ? toComplaintInput(review)
          : EMPTY_COMPLAINT_INPUT,
    );
    setError(null);
    complaintRef.current?.showModal();
  }

  function startReviewEdit(review: CustomerReview | null) {
    setEditingReview(review);
    setReviewForm(
      review
        ? {
            customer_id: review.customer_id ?? "",
            source: review.source,
            rating: String(review.rating),
            text: review.text,
            reviewed_at: toLocalInputValue(review.reviewed_at),
            staff_mentioned: review.staff_mentioned ?? "",
            internal_notes: review.internal_notes ?? "",
            tags: review.tags.join(", "),
          }
        : EMPTY_REVIEW_INPUT,
    );
    setError(null);
  }

  const mounted = useMounted();
  const now = new Date();
  const summary = reviewInboxSummary(reviews, now);
  const nameOf = (list: Option[], id: string | null) =>
    id ? list.find((item) => item.id === id)?.name ?? "Unknown" : null;
  const maxRating = Math.max(1, ...Object.values(summary.byRating));

  const visible = reviews.filter((review) => {
    if (sourceFilter && review.source !== sourceFilter) return false;
    if (filter === "unanswered") return isUnanswered(review);
    if (filter === "negative") return review.sentiment === "negative";
    if (filter === "escalating") return escalationCandidate(review);
    return true;
  });

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: reviews.length },
    { key: "unanswered", label: "Unanswered", count: summary.unanswered },
    {
      key: "negative",
      label: "Negative",
      count: reviews.filter((r) => r.sentiment === "negative").length,
    },
    { key: "escalating", label: "Should escalate", count: summary.escalationCandidates },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Reviews" value={String(summary.total)} hint="Across every source" />
        <StatCard
          label="Average"
          value={summary.averageRating === null ? "—" : summary.averageRating.toFixed(2)}
          hint="Stars, all sources"
        />
        <StatCard
          label="Unanswered"
          value={String(summary.unanswered)}
          tone={summary.unanswered ? "down" : "up"}
          hint={
            summary.oldestUnansweredDays === null
              ? "Nothing waiting"
              : `Oldest waiting ${summary.oldestUnansweredDays} ${pluralize(summary.oldestUnansweredDays, "day")}`
          }
        />
        <StatCard
          label="Should escalate"
          value={String(summary.escalationCandidates)}
          tone={summary.escalationCandidates ? "down" : "neutral"}
          hint="Low, negative and still unanswered"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <h2 className="ob-label-quiet">Rating spread</h2>
          <ul className="mt-2 space-y-1.5">
            {([5, 4, 3, 2, 1] as const).map((stars) => (
              <li key={stars} className="flex items-center gap-2 text-sm">
                <span className="ob-num w-14 shrink-0">
                  {stars} ★{" "}
                  <span className="text-[var(--ob-text-muted)]">({summary.byRating[stars]})</span>
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--ob-tint-wash)]">
                  <span
                    className="block h-full rounded-full bg-[var(--ob-leaf)]"
                    style={{
                      width: `${Math.round((summary.byRating[stars] / maxRating) * 100)}%`,
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <h2 className="ob-label-quiet">Sources</h2>
          {summary.bySource.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ob-text-muted)]">Nothing recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {summary.bySource.map((row) => (
                <li key={row.source} className="flex items-baseline justify-between gap-2">
                  <button
                    type="button"
                    className={cn(
                      "text-left hover:underline",
                      sourceFilter === row.source
                        ? "font-semibold text-[var(--ob-primary)]"
                        : "text-[var(--ob-text)]",
                    )}
                    onClick={() =>
                      setSourceFilter((prev) => (prev === row.source ? "" : row.source))
                    }
                  >
                    {row.source}
                  </button>
                  <span className="ob-num text-[var(--ob-text-muted)]">
                    {row.count} · {row.averageRating.toFixed(1)}★
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
            Sources are where the review was actually collected — this build wires up no live
            Google or Zomato account.
          </p>
        </Card>
        <Card className="p-4">
          <h2 className="ob-label-quiet">Staff named</h2>
          {summary.staffMentions.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
              No reviewer called anybody out by name.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {summary.staffMentions.map((mention) => (
                <li key={mention.name} className="flex items-baseline justify-between gap-2">
                  <span>{mention.name}</span>
                  <span className="ob-num text-[var(--ob-text-muted)]">
                    <span className="text-[var(--ob-success)]">{mention.positive}+</span>{" "}
                    <span className="text-[var(--ob-danger)]">{mention.negative}−</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--ob-danger)]">
          {error}
        </p>
      ) : null}

      <Card className="p-4">
        <h2 className="font-semibold">
          {editingReview ? "Edit review" : "Record a review or feedback"}
        </h2>
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => saveReviewAction(editingReview?.id ?? null, reviewForm));
            if (ok) startReviewEdit(null);
          }}
        >
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Customer (optional)</span>
            <select
              className="ob-input mt-1 w-full"
              value={reviewForm.customer_id}
              onChange={(e) => setReviewForm((p) => ({ ...p, customer_id: e.target.value }))}
              disabled={pending}
            >
              <option value="">Anonymous</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Source</span>
            <select
              className="ob-input mt-1 w-full"
              value={reviewForm.source}
              onChange={(e) => setReviewForm((p) => ({ ...p, source: e.target.value }))}
              disabled={pending}
            >
              {REVIEW_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Rating</span>
            <select
              className="ob-input mt-1 w-full"
              value={reviewForm.rating}
              onChange={(e) => setReviewForm((p) => ({ ...p, rating: e.target.value }))}
              disabled={pending}
            >
              {[5, 4, 3, 2, 1].map((stars) => (
                <option key={stars} value={stars}>
                  {stars} ★
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">When</span>
            <input
              className="ob-input mt-1 w-full"
              type="datetime-local"
              value={reviewForm.reviewed_at}
              onChange={(e) => setReviewForm((p) => ({ ...p, reviewed_at: e.target.value }))}
              disabled={pending}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Staff named (optional)</span>
            <select
              className="ob-input mt-1 w-full"
              value={reviewForm.staff_mentioned}
              onChange={(e) => setReviewForm((p) => ({ ...p, staff_mentioned: e.target.value }))}
              disabled={pending}
            >
              <option value="">Nobody</option>
              {staff.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Tags</span>
            <input
              className="ob-input mt-1 w-full"
              value={reviewForm.tags}
              onChange={(e) => setReviewForm((p) => ({ ...p, tags: e.target.value }))}
              placeholder="delivery, service, price"
              disabled={pending}
            />
          </label>
          <label className="block text-sm sm:col-span-2 lg:col-span-3">
            <span className="text-[var(--ob-text-muted)]">What they said</span>
            <textarea
              className="ob-input mt-1 min-h-20 w-full"
              value={reviewForm.text}
              onChange={(e) => setReviewForm((p) => ({ ...p, text: e.target.value }))}
              maxLength={2000}
              required
              disabled={pending}
            />
            <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
              Sentiment is scored from the words and the stars as you save.
            </span>
          </label>
          <label className="block text-sm sm:col-span-2 lg:col-span-3">
            <span className="text-[var(--ob-text-muted)]">Internal note (never shown to the customer)</span>
            <input
              className="ob-input mt-1 w-full"
              value={reviewForm.internal_notes}
              onChange={(e) => setReviewForm((p) => ({ ...p, internal_notes: e.target.value }))}
              maxLength={500}
              disabled={pending}
            />
          </label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving…" : editingReview ? "Save changes" : "Record it"}
            </button>
            {editingReview ? (
              <button
                type="button"
                className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
                disabled={pending}
                onClick={() => startReviewEdit(null)}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </Card>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter reviews">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            className={cn(
              "ob-press flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold",
              filter === item.key
                ? "border-[var(--ob-leaf)] bg-[var(--ob-leaf)] text-[var(--ob-leaf-ink)]"
                : "border-[var(--ob-line)] bg-[var(--ob-tint-wash)] text-[var(--ob-text-muted)]",
            )}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
            <span className="tabular-nums opacity-70">{item.count}</span>
          </button>
        ))}
        {sourceFilter ? (
          <button
            type="button"
            className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm"
            onClick={() => setSourceFilter("")}
          >
            {sourceFilter} ✕
          </button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="No reviews in this view"
          description="Record feedback above, or widen the filter — an unanswered low rating is the one worth chasing."
        />
      ) : (
        <div className="space-y-2">
          {visible.map((review) => (
            <Card key={review.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <Stars rating={review.rating} />
                    <Badge tone={SENTIMENT_TONE[review.sentiment]}>{review.sentiment}</Badge>
                    <Badge tone={STATUS_TONE[review.status]}>{STATUS_LABELS[review.status]}</Badge>
                    <span className="text-sm text-[var(--ob-text-muted)]">{review.source}</span>
                  </p>
                  <p className="mt-1">{review.text}</p>
                  <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
                    {nameOf(customers, review.customer_id) ?? "Anonymous"}
                    {mounted ? ` · ${agoLabel(reviewAgeInDays(review, now))}` : ""}
                    {review.staff_mentioned ? ` · named ${review.staff_mentioned}` : ""}
                    {review.tags.length ? ` · ${review.tags.join(", ")}` : ""}
                  </p>
                  {review.response_text ? (
                    <p className="mt-2 border-l-2 border-[var(--ob-line)] pl-3 text-sm">
                      Replied: {review.response_text}
                    </p>
                  ) : null}
                  {review.internal_notes ? (
                    <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
                      Internal: {review.internal_notes}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="ob-press ob-btn-primary ob-touch-target rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                    disabled={pending}
                    onClick={() => startReply(review)}
                  >
                    {review.response_text ? "Edit reply" : "Reply"}
                  </button>
                  {review.status !== "acknowledged" ? (
                    <button
                      type="button"
                      className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                      disabled={pending}
                      onClick={() => run(() => setReviewStatusAction(review.id, "acknowledged"))}
                    >
                      Acknowledge
                    </button>
                  ) : null}
                  {review.status !== "closed" ? (
                    <button
                      type="button"
                      className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                      disabled={pending}
                      onClick={() => run(() => setReviewStatusAction(review.id, "closed"))}
                    >
                      Close
                    </button>
                  ) : null}
                  {review.complaint_id ? (
                    <Badge tone="danger">Escalated</Badge>
                  ) : (
                    <button
                      type="button"
                      className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                      disabled={pending}
                      onClick={() => startComplaint(review)}
                    >
                      Raise a complaint
                    </button>
                  )}
                  <button
                    type="button"
                    className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                    disabled={pending}
                    onClick={() => startReviewEdit(review)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                    disabled={pending}
                    onClick={() => run(() => deleteReviewAction(review.id))}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="ob-label-quiet">Complaints</h2>
          <button
            type="button"
            className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            disabled={pending}
            onClick={() => startComplaint(null)}
          >
            Log a complaint
          </button>
        </div>
        {complaints.length === 0 ? (
          <Card className="p-4 text-sm text-[var(--ob-text-muted)]">
            Nothing open. A complaint raised from a review inherits that customer automatically.
          </Card>
        ) : (
          complaints.map((complaint) => (
            <Card key={complaint.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {complaint.subject}
                    <Badge tone={SEVERITY_TONE[complaint.severity]} className="ml-2">
                      {COMPLAINT_SEVERITY_LABELS[complaint.severity]}
                    </Badge>
                    <Badge
                      tone={
                        complaint.status === "resolved" || complaint.status === "closed"
                          ? "success"
                          : complaint.status === "in_progress"
                            ? "warning"
                            : "danger"
                      }
                      className="ml-2"
                    >
                      {COMPLAINT_STATUS_LABELS[complaint.status]}
                    </Badge>
                  </p>
                  {complaint.detail ? (
                    <p className="mt-1 text-sm text-[var(--ob-text-muted)]">{complaint.detail}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
                    {complaint.customer_id ? (
                      <Link
                        href={`/customers/${complaint.customer_id}`}
                        className="text-[var(--ob-primary)] hover:underline"
                      >
                        {nameOf(customers, complaint.customer_id) ?? "Customer"}
                      </Link>
                    ) : (
                      "No customer attached"
                    )}
                    {nameOf(staff, complaint.owner_staff_id)
                      ? ` · owner ${nameOf(staff, complaint.owner_staff_id)}`
                      : " · unowned"}
                    {mounted ? ` · raised ${formatDate(complaint.raised_at)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {complaint.status === "open" ? (
                    <button
                      type="button"
                      className="ob-press ob-btn-primary ob-touch-target rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                      disabled={pending}
                      onClick={() => run(() => setComplaintStatusAction(complaint.id, "in_progress"))}
                    >
                      Start
                    </button>
                  ) : null}
                  {complaint.status !== "resolved" && complaint.status !== "closed" ? (
                    <button
                      type="button"
                      className="ob-press ob-btn-primary ob-touch-target rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                      disabled={pending}
                      onClick={() => run(() => setComplaintStatusAction(complaint.id, "resolved"))}
                    >
                      Resolve
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                      disabled={pending}
                      onClick={() =>
                        run(() =>
                          setComplaintStatusAction(
                            complaint.id,
                            complaint.status === "resolved" ? "closed" : "open",
                          ),
                        )
                      }
                    >
                      {complaint.status === "resolved" ? "Close" : "Reopen"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                    disabled={pending}
                    onClick={() => startComplaint(null, complaint)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                    disabled={pending}
                    onClick={() => run(() => deleteComplaintAction(complaint.id))}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}
      </section>

      <dialog
        ref={respondRef}
        className="m-auto max-h-[90vh] w-[min(100%,30rem)] overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)] backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]"
        onClose={() => setError(null)}
      >
        <form
          className="space-y-3 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!answering) return;
            const ok = await run(() => respondToReviewAction(answering.id, reply));
            if (ok) {
              respondRef.current?.close();
              setAnswering(null);
            }
          }}
        >
          <h2 className="font-semibold">Reply to {answering?.rating}★</h2>
          <p className="text-sm text-[var(--ob-text-muted)]">{answering?.text}</p>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Your reply</span>
            <textarea
              className="ob-input mt-1 min-h-24 w-full"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={600}
              required
              disabled={pending}
            />
            <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
              Stored on the review. This build posts nothing to Google or Zomato, so publishing
              the reply stays your job wherever it is actually hosted.
            </span>
          </label>
          {error ? (
            <p role="alert" className="text-sm text-[var(--ob-danger)]">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving…" : "Save reply"}
            </button>
            <button
              type="button"
              className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => respondRef.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={complaintRef}
        className="m-auto max-h-[90vh] w-[min(100%,34rem)] overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)] backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]"
        onClose={() => setError(null)}
      >
        <form
          className="space-y-3 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() =>
              saveComplaintAction(editingComplaint?.id ?? null, complaintForm),
            );
            if (ok) {
              complaintRef.current?.close();
              setEditingComplaint(null);
            }
          }}
        >
          <h2 className="font-semibold">{editingComplaint ? "Edit complaint" : "Raise a complaint"}</h2>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Subject</span>
            <input
              className="ob-input mt-1 w-full"
              value={complaintForm.subject}
              onChange={(e) => setComplaintForm((p) => ({ ...p, subject: e.target.value }))}
              maxLength={160}
              required
              disabled={pending}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Customer</span>
              <select
                className="ob-input mt-1 w-full"
                value={complaintForm.customer_id}
                onChange={(e) => setComplaintForm((p) => ({ ...p, customer_id: e.target.value }))}
                disabled={pending}
              >
                <option value="">From the review or call</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Owner</span>
              <select
                className="ob-input mt-1 w-full"
                value={complaintForm.owner_staff_id}
                onChange={(e) =>
                  setComplaintForm((p) => ({ ...p, owner_staff_id: e.target.value }))
                }
                disabled={pending}
              >
                <option value="">Unassigned</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Severity</span>
              <select
                className="ob-input mt-1 w-full"
                value={complaintForm.severity}
                onChange={(e) => setComplaintForm((p) => ({ ...p, severity: e.target.value }))}
                disabled={pending}
              >
                {(["low", "medium", "high"] as const).map((severity) => (
                  <option key={severity} value={severity}>
                    {COMPLAINT_SEVERITY_LABELS[severity]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Raised</span>
              <input
                className="ob-input mt-1 w-full"
                type="datetime-local"
                value={complaintForm.raised_at}
                onChange={(e) => setComplaintForm((p) => ({ ...p, raised_at: e.target.value }))}
                disabled={pending}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Detail</span>
            <textarea
              className="ob-input mt-1 min-h-20 w-full"
              value={complaintForm.detail}
              onChange={(e) => setComplaintForm((p) => ({ ...p, detail: e.target.value }))}
              maxLength={2000}
              disabled={pending}
            />
          </label>
          {complaintForm.review_id ? (
            <p className="text-xs text-[var(--ob-text-muted)]">
              Linked to a review — saving escalates that review too, so the two never drift apart.
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving…" : "Save complaint"}
            </button>
            <button
              type="button"
              className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => complaintRef.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
