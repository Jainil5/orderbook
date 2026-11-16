"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CrmChip, CrmKeyValue, CrmRating } from "@/components/crm/crm-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import {
  assignComplaintAction,
  recordComplaintResolutionAction,
  setComplaintStatusAction,
} from "@/services/crm-review-actions";
import { Field, FormFeedback, IDLE, Select, type FormStatus } from "./review-form-parts";
import {
  COMPLAINT_NEXT_STEP,
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_STATUS_TONE,
  SEVERITY_LABELS,
  SEVERITY_TONE,
} from "./review-vocabulary";
import type { ComplaintSeverity, ComplaintStatus } from "@/types/crm";

/** One complaint, already joined with the names the row shows. */
export type ComplaintRowData = {
  id: string;
  subject: string;
  description: string | null;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  openedAt: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  ownerId: string | null;
  ownerName: string | null;
  customerId: string | null;
  customerName: string | null;
  reviewRating: number | null;
  reviewId: string | null;
};

/**
 * Complaints, worked by hand. Status, owner and resolution are three separate
 * recorded decisions — there is no workflow behind them and nothing moves a
 * complaint on a timer.
 */
export function ComplaintList({
  rows,
  staffOptions,
  canManage,
  focusedId,
}: {
  rows: ComplaintRowData[];
  staffOptions: { id: string; name: string }[];
  canManage: boolean;
  focusedId?: string;
}) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No complaints match these filters"
        description="Complaints are opened from a review (Escalate) or logged elsewhere in the CRM. Nothing opens by itself."
      />
    );
  }
  return (
    <div>
      <p className="mb-2 text-xs text-[var(--ob-text-muted)]">
        {rows.length} shown
        {focusedId ? " · deep-linked complaint highlighted" : ""}
      </p>
      <ul className="ob-stagger space-y-3">
        {rows.map((row) => (
          <ComplaintCard
            key={row.id}
            row={row}
            staffOptions={staffOptions}
            canManage={canManage}
            focused={row.id === focusedId}
          />
        ))}
      </ul>
    </div>
  );
}

function ComplaintCard({
  row,
  staffOptions,
  canManage,
  focused,
}: {
  row: ComplaintRowData;
  staffOptions: { id: string; name: string }[];
  canManage: boolean;
  focused: boolean;
}) {
  const cardRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (focused) cardRef.current?.scrollIntoView({ block: "center" });
  }, [focused]);

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
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {row.subject}
        </span>
        <CrmChip tone={SEVERITY_TONE[row.severity]}>
          {SEVERITY_LABELS[row.severity]} severity
        </CrmChip>
        <CrmChip tone={COMPLAINT_STATUS_TONE[row.status]}>
          {COMPLAINT_STATUS_LABELS[row.status]}
        </CrmChip>
        <span className="shrink-0 text-xs text-[var(--ob-text-muted)]">
          opened {row.openedAt.slice(0, 10)}
        </span>
      </div>

      {row.description ? (
        <p className="mt-2 text-sm text-[var(--ob-text-secondary)]">
          {row.description}
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
          { label: "Owner", value: row.ownerName ?? "Unassigned" },
          {
            label: "Resolved",
            value: row.resolvedAt ? row.resolvedAt.slice(0, 10) : "Not yet",
          },
          {
            label: "From review",
            value: row.reviewId ? (
              <span className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/customers/reviews?id=${row.reviewId}`}
                  className="ob-touch-target text-[var(--ob-primary)] hover:underline"
                >
                  Review record
                </Link>
                {row.reviewRating !== null ? (
                  <CrmRating rating={row.reviewRating} />
                ) : null}
              </span>
            ) : (
              "Logged elsewhere"
            ),
          },
        ]}
      />

      <p className="mt-3 rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-3 py-2 text-xs text-[var(--crm-bark)]">
        <span className="font-medium">Next action:</span>{" "}
        {COMPLAINT_NEXT_STEP[row.status]}
      </p>

      {row.resolutionNotes ? (
        <div className="crm-surface mt-3 rounded-md border px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--crm-bark)]">
            Resolution recorded
          </p>
          <p className="mt-1 text-sm">{row.resolutionNotes}</p>
        </div>
      ) : null}

      {canManage ? (
        <ComplaintControls row={row} staffOptions={staffOptions} />
      ) : (
        <p className="mt-3 text-xs text-[var(--ob-text-muted)]">
          Only owners, admins and managers can change a complaint.
        </p>
      )}
    </li>
  );
}

function ComplaintControls({
  row,
  staffOptions,
}: {
  row: ComplaintRowData;
  staffOptions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<FormStatus>(IDLE);

  // Selects and notes are seeded from the row and re-seeded when the server
  // copy changes (router.refresh()), so a saved value never goes stale on screen.
  const [statusDraft, setStatusDraft] = useState<string>(row.status);
  const [prevStatus, setPrevStatus] = useState(row.status);
  if (prevStatus !== row.status) {
    setPrevStatus(row.status);
    setStatusDraft(row.status);
  }
  const [ownerDraft, setOwnerDraft] = useState(row.ownerId ?? "");
  const [prevOwner, setPrevOwner] = useState(row.ownerId ?? "");
  if (prevOwner !== (row.ownerId ?? "")) {
    setPrevOwner(row.ownerId ?? "");
    setOwnerDraft(row.ownerId ?? "");
  }
  const [notesDraft, setNotesDraft] = useState(row.resolutionNotes ?? "");
  const [prevNotes, setPrevNotes] = useState(row.resolutionNotes ?? "");
  if (prevNotes !== (row.resolutionNotes ?? "")) {
    setPrevNotes(row.resolutionNotes ?? "");
    setNotesDraft(row.resolutionNotes ?? "");
  }

  async function run(
    key: string,
    action: () => Promise<{ ok: boolean; message?: string }>,
    fallback: string,
  ) {
    setBusy(key);
    setStatus(IDLE);
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      setStatus({
        kind: "error",
        message: result.message ?? "That did not save.",
      });
      return;
    }
    setStatus({ kind: "ok", message: result.message ?? fallback });
    router.refresh();
  }

  return (
    <div className="mt-3 grid gap-3 border-t border-[var(--ob-border)] pt-3 sm:grid-cols-2">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            "status",
            () => setComplaintStatusAction(row.id, statusDraft),
            "Status recorded.",
          );
        }}
      >
        <Field label="Status" hint="A person records it; nothing moves on a timer.">
          <Select
            value={statusDraft}
            onChange={(event) => setStatusDraft(event.target.value)}
            aria-label={`Status for ${row.subject}`}
          >
            {COMPLAINT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {COMPLAINT_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          type="submit"
          variant="secondary"
          className="px-3 py-2 text-xs"
          loading={busy === "status"}
          disabled={busy !== null || statusDraft === row.status}
        >
          Save status
        </Button>
      </form>

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            "owner",
            () => assignComplaintAction(row.id, ownerDraft || null),
            ownerDraft ? "Owner recorded." : "Owner cleared.",
          );
        }}
      >
        <Field label="Owner" hint="Who is chasing this today.">
          <Select
            value={ownerDraft}
            onChange={(event) => setOwnerDraft(event.target.value)}
            aria-label={`Owner for ${row.subject}`}
          >
            <option value="">Unassigned</option>
            {staffOptions.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          type="submit"
          variant="secondary"
          className="px-3 py-2 text-xs"
          loading={busy === "owner"}
          disabled={busy !== null || ownerDraft === (row.ownerId ?? "")}
        >
          Save owner
        </Button>
      </form>

      <form
        className="space-y-2 sm:col-span-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            "resolution",
            () => recordComplaintResolutionAction(row.id, notesDraft),
            "Resolution recorded.",
          );
        }}
      >
        <Field
          label="Resolution notes"
          required
          hint="What was actually done. Recording it marks the complaint resolved."
        >
          <Input
            value={notesDraft}
            onChange={(event) => setNotesDraft(event.target.value)}
            aria-label={`Resolution notes for ${row.subject}`}
            placeholder="Refunded ₹1,200 and the rota was changed"
            required
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          className="px-3 py-2 text-xs"
          loading={busy === "resolution"}
          disabled={busy !== null || notesDraft.trim() === ""}
        >
          Record resolution
        </Button>
      </form>

      {/* One feedback line for all three recorded decisions. */}
      <div className="sm:col-span-2">
        <FormFeedback status={status} />
      </div>
    </div>
  );
}
