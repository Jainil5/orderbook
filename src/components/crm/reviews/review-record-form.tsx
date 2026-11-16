"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveReviewAction } from "@/services/crm-review-actions";
import { Field, FormFeedback, IDLE, Select, type FormStatus } from "./review-form-parts";
import {
  RATING_VALUES,
  SENTIMENT_LABELS,
  SENTIMENT_VALUES,
} from "./review-vocabulary";
import type { ReviewSentiment } from "@/types/crm";

const EMPTY = (today: string) => ({
  rating: "",
  source: "",
  text: "",
  reviewer_name: "",
  customer_id: "",
  staff_mentioned_id: "",
  tags: "",
  sentiment: "",
  review_date: today,
  internal_notes: "",
});

/**
 * Record a review the way it arrived: a Google review phoned in, a comment
 * card, a WhatsApp message. The row enters the inbox unanswered — replying is
 * its own action, so "answered" always means a person wrote the words.
 */
export function ReviewRecordForm({
  customerOptions,
  staffOptions,
  sourceOptions,
  today,
}: {
  customerOptions: { id: string; name: string }[];
  staffOptions: { id: string; name: string }[];
  sourceOptions: { value: string; label: string }[];
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<FormStatus>(IDLE);
  const [form, setForm] = useState(EMPTY(today));

  const set =
    (key: keyof ReturnType<typeof EMPTY>) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) => {
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
      if (status.kind !== "idle") setStatus(IDLE);
    };

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await saveReviewAction(form);
    setBusy(false);
    if (result.ok) {
      setStatus({ kind: "ok", message: result.message ?? "Review recorded." });
      setForm(EMPTY(today));
      router.refresh();
    } else {
      setStatus({ kind: "error", message: result.message });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-xs text-[var(--ob-text-muted)]">
        Logged exactly as it came in. It waits in the inbox until someone
        answers it or opens a complaint.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rating" required>
          <Select
            value={form.rating}
            onChange={set("rating")}
            aria-label="Rating"
            required
          >
            <option value="">Pick stars</option>
            {RATING_VALUES.map((stars) => (
              <option key={stars} value={String(stars)}>
                {stars} star{stars === 1 ? "" : "s"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source" required>
          <Select value={form.source} onChange={set("source")} aria-label="Source" required>
            <option value="">Pick a source</option>
            {sourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Review date">
          <Input
            type="date"
            value={form.review_date}
            onChange={set("review_date")}
            aria-label="Review date"
          />
        </Field>
        <Field label="Reviewer name" hint="Blank keeps the review anonymous.">
          <Input
            value={form.reviewer_name}
            onChange={set("reviewer_name")}
            placeholder="Rhea D"
            aria-label="Reviewer name"
          />
        </Field>
        <Field label="Customer" hint="Only link it when you are sure who wrote it.">
          <Select
            value={form.customer_id}
            onChange={set("customer_id")}
            aria-label="Linked customer"
          >
            <option value="">Not linked</option>
            {customerOptions.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Staff mentioned" hint="Praise and complaints both get attributed.">
          <Select
            value={form.staff_mentioned_id}
            onChange={set("staff_mentioned_id")}
            aria-label="Staff mentioned"
          >
            <option value="">Nobody</option>
            {staffOptions.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Review" required>
        <textarea
          className="ob-input min-h-24 w-full"
          value={form.text}
          onChange={set("text")}
          aria-label="Review text"
          placeholder="What the customer actually said…"
          required
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tags" hint="Comma separated. Segments can match on these.">
          <Input
            value={form.tags}
            onChange={set("tags")}
            placeholder="wait, quality"
            aria-label="Tags"
          />
        </Field>
        <Field label="Sentiment" hint="Left blank, the stars decide.">
          <Select
            value={form.sentiment}
            onChange={set("sentiment")}
            aria-label="Sentiment"
          >
            <option value="">Let the stars decide</option>
            {SENTIMENT_VALUES.map((value: ReviewSentiment) => (
              <option key={value} value={value}>
                {SENTIMENT_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Internal notes" hint="Never shown to the customer.">
        <textarea
          className="ob-input min-h-20 w-full"
          value={form.internal_notes}
          onChange={set("internal_notes")}
          aria-label="Internal notes"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy} disabled={busy}>
          Record review
        </Button>
        <FormFeedback status={status} />
      </div>
    </form>
  );
}
