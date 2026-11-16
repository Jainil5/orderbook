"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CrmChip, CrmKeyValue, CrmRating } from "@/components/crm/crm-ui";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { ReviewEscalateForm } from "./review-escalate-form";
import { ReviewReplyForm } from "./review-reply-form";
import {
  RESPONSE_STATUS_LABELS,
  SENTIMENT_LABELS,
  SENTIMENT_TONE,
} from "./review-vocabulary";
import type { ReviewResponseStatus, ReviewSentiment } from "@/types/crm";

/** One review, already joined with the names the row shows. */
export type ReviewRowData = {
  id: string;
  rating: number;
  sourceLabel: string;
  text: string;
  reviewerName: string | null;
  customerId: string | null;
  customerName: string | null;
  staffMentioned: string | null;
  tags: string[];
  reviewDate: string;
  respondedAt: string | null;
  responseStatus: ReviewResponseStatus;
  responseText: string | null;
  internalNotes: string | null;
  /** metrics' per-row sentiment: the recorded label, else the stars. */
  sentiment: ReviewSentiment;
  complaintId: string | null;
};

/**
 * The inbox itself. Every row can be answered, and a person (never the
 * sentiment) can escalate it into a complaint.
 */
export function ReviewList({
  rows,
  staffOptions,
  canLog,
  canManage,
  focusedId,
  emptyTitle,
  emptyDescription,
}: {
  rows: ReviewRowData[];
  staffOptions: { id: string; name: string }[];
  canLog: boolean;
  canManage: boolean;
  focusedId?: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (!rows.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div>
      <p className="mb-2 text-xs text-[var(--ob-text-muted)]">
        {rows.length} shown
        {focusedId ? " · deep-linked row opened for reply" : ""}
      </p>
      <ul className="ob-stagger space-y-3">
        {rows.map((row) => (
          <ReviewCard
            key={row.id}
            row={row}
            staffOptions={staffOptions}
            canLog={canLog}
            canManage={canManage}
            focused={row.id === focusedId}
          />
        ))}
      </ul>
    </div>
  );
}

const STATUS_TONE: Record<
  ReviewResponseStatus,
  "warning" | "positive" | "danger"
> = {
  unanswered: "warning",
  answered: "positive",
  escalated: "danger",
};

function ReviewCard({
  row,
  staffOptions,
  canLog,
  canManage,
  focused,
}: {
  row: ReviewRowData;
  staffOptions: { id: string; name: string }[];
  canLog: boolean;
  canManage: boolean;
  focused: boolean;
}) {
  const [panel, setPanel] = useState<"reply" | "escalate" | null>(
    focused && canLog ? "reply" : null,
  );
  const cardRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (focused) cardRef.current?.scrollIntoView({ block: "center" });
  }, [focused]);

  const looksNegative =
    row.sentiment === "negative" && row.responseStatus === "unanswered";

  return (
    <li
      ref={cardRef}
      data-focused={focused ? "true" : undefined}
      className={cn(
        "ob-card p-4",
        focused && "border-[var(--crm-lab)] ring-1 ring-[var(--crm-lab)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <CrmRating rating={row.rating} />
        <span className="min-w-0 truncate text-sm font-semibold">
          {row.reviewerName ?? "Anonymous"}
        </span>
        <CrmChip>{row.sourceLabel}</CrmChip>
        <CrmChip tone={SENTIMENT_TONE[row.sentiment]}>
          {SENTIMENT_LABELS[row.sentiment]}
        </CrmChip>
        <CrmChip tone={STATUS_TONE[row.responseStatus]}>
          {RESPONSE_STATUS_LABELS[row.responseStatus]}
        </CrmChip>
        <span className="ml-auto shrink-0 text-xs text-[var(--ob-text-muted)]">
          {row.reviewDate.slice(0, 10)}
        </span>
      </div>

      <p className="mt-2 text-sm">{row.text}</p>

      {looksNegative ? (
        <p className="mt-2 rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-3 py-2 text-xs text-[var(--crm-bark)]">
          <span className="font-medium">This looks negative.</span> Worth a
          reply, or a complaint if it needs follow-up — the choice stays yours,
          nothing escalates on its own.
        </p>
      ) : null}

      {row.responseText ? (
        <div className="crm-surface mt-3 rounded-md border px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--crm-bark)]">
            Reply · {row.respondedAt ? row.respondedAt.slice(0, 10) : "recorded"}
          </p>
          <p className="mt-1 text-sm">{row.responseText}</p>
        </div>
      ) : null}

      {row.internalNotes ? (
        <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
          Internal note: {row.internalNotes}
        </p>
      ) : null}

      <CrmKeyValue
        className="mt-3"
        items={[
          {
            label: "Customer",
            value: row.customerId ? (
              <Link
                href={`/customers/${row.customerId}`}
                className="ob-touch-target text-[var(--ob-primary)] hover:underline"
              >
                {row.customerName ?? "Profile"}
              </Link>
            ) : (
              "Not linked"
            ),
          },
          { label: "Staff mentioned", value: row.staffMentioned ?? "—" },
          {
            label: "Tags",
            value: row.tags.length ? (
              <span className="flex flex-wrap gap-1">
                {row.tags.map((tag) => (
                  <CrmChip key={tag}>{tag}</CrmChip>
                ))}
              </span>
            ) : (
              "—"
            ),
          },
          {
            label: "Complaint",
            value: row.complaintId ? (
              <Link
                href={`/customers/reviews?tab=complaints&id=${row.complaintId}`}
                className="ob-touch-target text-[var(--ob-primary)] hover:underline"
              >
                Open complaint record
              </Link>
            ) : (
              "None"
            ),
          },
        ]}
      />

      {canLog || canManage ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canLog ? (
            <Button
              type="button"
              variant={panel === "reply" ? "primary" : "secondary"}
              className="px-3 py-2 text-xs"
              onClick={() => setPanel(panel === "reply" ? null : "reply")}
            >
              {row.responseText ? "Edit reply" : "Reply"}
            </Button>
          ) : null}
          {canManage && !row.complaintId ? (
            <Button
              type="button"
              variant={panel === "escalate" ? "danger" : "secondary"}
              className="px-3 py-2 text-xs"
              onClick={() =>
                setPanel(panel === "escalate" ? null : "escalate")
              }
            >
              Escalate to complaint
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-[var(--ob-text-muted)]">
          Your role can read reviews but not answer or escalate them.
        </p>
      )}

      {panel === "reply" && canLog ? (
        <div className="crm-surface mt-3 rounded-md border p-3">
          <ReviewReplyForm
            reviewId={row.id}
            reviewerName={row.reviewerName}
            initialResponse={row.responseText}
            initialNotes={row.internalNotes}
            onDone={() => setPanel(null)}
          />
        </div>
      ) : null}

      {panel === "escalate" && canManage ? (
        <div className="crm-surface mt-3 rounded-md border p-3">
          <ReviewEscalateForm
            reviewId={row.id}
            reviewerName={row.reviewerName}
            reviewText={row.text}
            customerName={row.customerName}
            staffOptions={staffOptions}
            onDone={() => setPanel(null)}
          />
        </div>
      ) : null}
    </li>
  );
}
