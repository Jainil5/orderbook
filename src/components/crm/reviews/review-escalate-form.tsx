"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { escalateReviewAction } from "@/services/crm-review-actions";
import { Field, FormFeedback, IDLE, Select, type FormStatus } from "./review-form-parts";
import {
  COMPLAINT_SEVERITIES,
  SEVERITY_LABELS,
} from "./review-vocabulary";

/**
 * Escalate: a person deciding a review needs a complaint record. It opens the
 * complaint, links `review_id`, and stamps the review “escalated” with its
 * `complaint_id` — all server-side in one action.
 *
 * The screen may *suggest* this for a negative review, but nothing is ever
 * escalated without somebody pressing this button.
 */
export function ReviewEscalateForm({
  reviewId,
  reviewerName,
  reviewText,
  customerName,
  staffOptions,
  onDone,
}: {
  reviewId: string;
  reviewerName: string | null;
  reviewText: string;
  customerName: string | null;
  staffOptions: { id: string; name: string }[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatus>(IDLE);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [owner, setOwner] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await escalateReviewAction({
      review_id: reviewId,
      subject,
      description,
      severity,
      assigned_staff_id: owner,
    });
    setBusy(false);
    if (result.ok) {
      setStatus({ kind: "ok", message: result.message ?? "Complaint opened." });
      router.refresh();
    } else {
      setStatus({ kind: "error", message: result.message });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-xs text-[var(--ob-text-muted)]">
        Opens a complaint owned by {customerName ?? "the business"} and marks
        this review escalated. No timer, no automation — the next step is
        whoever you assign it to.
      </p>

      <Field label="Complaint subject" required>
        <Input
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            if (status.kind !== "idle") setStatus(IDLE);
          }}
          aria-label="Complaint subject"
          placeholder={`Complaint from ${reviewerName ?? "a reviewer"} review`}
          required
        />
      </Field>

      <Field label="What went wrong" hint="Blank copies the review text.">
        <textarea
          className="ob-input min-h-20 w-full"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          aria-label="Complaint description"
          placeholder={reviewText.slice(0, 300)}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Severity" required>
          <Select
            value={severity}
            onChange={(event) => setSeverity(event.target.value)}
            aria-label="Complaint severity"
          >
            {COMPLAINT_SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {SEVERITY_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Owner" hint="Leave unassigned to decide later.">
          <Select
            value={owner}
            onChange={(event) => setOwner(event.target.value)}
            aria-label="Complaint owner"
          >
            <option value="">Unassigned</option>
            {staffOptions.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="danger" loading={busy} disabled={busy} className="px-3 py-2 text-xs">
          Open complaint
        </Button>
        {onDone ? (
          <Button
            type="button"
            variant="ghost"
            className="px-3 py-2 text-xs"
            onClick={onDone}
            disabled={busy}
          >
            Cancel
          </Button>
        ) : null}
        <FormFeedback status={status} />
      </div>
    </form>
  );
}
