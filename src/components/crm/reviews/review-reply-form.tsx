"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { replyToReviewAction } from "@/services/crm-review-actions";
import { Field, FormFeedback, IDLE, type FormStatus } from "./review-form-parts";

/**
 * Write the reply. The server stamps `responded_at` and moves the review to
 * “answered”, so an answered review always has words a person wrote behind it.
 */
export function ReviewReplyForm({
  reviewId,
  reviewerName,
  initialResponse,
  initialNotes,
  onDone,
}: {
  reviewId: string;
  reviewerName: string | null;
  initialResponse: string | null;
  initialNotes: string | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatus>(IDLE);
  const [responseText, setResponseText] = useState(initialResponse ?? "");
  const [internalNotes, setInternalNotes] = useState(initialNotes ?? "");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await replyToReviewAction({
      review_id: reviewId,
      response_text: responseText,
      internal_notes: internalNotes,
    });
    setBusy(false);
    if (result.ok) {
      setStatus({ kind: "ok", message: result.message ?? "Reply recorded." });
      router.refresh();
    } else {
      setStatus({ kind: "error", message: result.message });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field
        label="Reply"
        required
        hint={
          reviewerName
            ? `Signed by the business and posted back to ${reviewerName}.`
            : "Signed by the business."
        }
      >
        <textarea
          className="ob-input min-h-24 w-full"
          value={responseText}
          onChange={(event) => {
            setResponseText(event.target.value);
            if (status.kind !== "idle") setStatus(IDLE);
          }}
          aria-label={`Reply to ${reviewerName ?? "this review"}`}
          placeholder="Thanks for telling us — here is what we did…"
          required
        />
      </Field>
      <Field label="Internal note" hint="Kept on the review, never sent.">
        <Input
          value={internalNotes}
          onChange={(event) => setInternalNotes(event.target.value)}
          aria-label={`Internal note for ${reviewerName ?? "this review"}`}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy} disabled={busy} className="px-3 py-2 text-xs">
          {initialResponse ? "Save reply again" : "Send reply"}
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
