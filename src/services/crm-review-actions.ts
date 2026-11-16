"use server";

import { oneOf, refId, text } from "@/lib/business/validate";

import {
  auditCrm,
  crmCsv,
  crmRecordId,
  crmRefs,
  guardCrm,
  optionalDate,
  revalidateCrm,
  type CrmActionState,
} from "@/lib/crm/actions-kit";
import { loadCrmWorkspace, staffName } from "@/lib/crm/loader";
import { classifyReviewSentiment } from "@/lib/crm/metrics";
import { newCrmId } from "@/lib/crm/repository";
import {
  COMPLAINT_SEVERITIES,
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  REVIEW_SENTIMENTS,
  REVIEW_SOURCES,
  type Complaint,
  type ComplaintSeverity,
  type ComplaintStatus,
  type Review,
  type ReviewSentiment,
} from "@/types/crm";

/**
 * Review inbox + complaint actions.
 *
 * Same shape as every CRM write: `guardCrm` (session + role) →
 * `loadCrmWorkspace` (the ids this brand really owns) → validate → repository
 * write (brand-stamped) → `auditCrm` → `revalidateCrm`. `brand_id` is never
 * taken from form data, and sentiment is never invented here: a review keeps
 * the sentiment a human recorded, otherwise
 * `classifyReviewSentiment`/`crm.reviewIntel` decide from the stars.
 */

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

export type ReviewInput = {
  id?: string | null;
  source?: string | null;
  rating: string | number;
  text: string;
  reviewer_name?: string | null;
  customer_id?: string | null;
  /** `YYYY-MM-DD` from a date input. Defaults to today. */
  review_date?: string | null;
  /** Leave empty to let the stars decide (metrics rule, not a model here). */
  sentiment?: string | null;
  /** Comma separated, as the form sends it. */
  tags?: string | null;
  /** Staff id — stored as the staff *name*, the shape `staff_mentioned` uses. */
  staff_mentioned_id?: string | null;
  internal_notes?: string | null;
};

function optionalText(
  value: unknown,
  field: string,
  max = 200,
): { ok: true; value: string } | { ok: false; message: string } {
  return text(value, field, max, false);
}

/** A reference the form must always answer (a review id, a customer id). */
function requiredRef(
  value: unknown,
  known: readonly string[],
  field: string,
): { ok: true; value: string } | { ok: false; message: string } {
  const result = refId(value, known, field, true);
  if (!result.ok) return result;
  if (!result.value) return { ok: false, message: `${field} is required.` };
  return { ok: true, value: result.value };
}

function ratingOf(
  value: unknown,
): { ok: true; value: number } | { ok: false; message: string } {
  const n =
    typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    return { ok: false, message: "Pick a rating between 1 and 5 stars." };
  }
  return { ok: true, value: n };
}

/** Comma separated input → clean, de-duplicated tag list. */
function tagsOf(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(",") : String(value ?? "");
  const list: string[] = [];
  for (const part of raw.split(",")) {
    const tag = part.trim().slice(0, 40);
    if (tag && !list.includes(tag)) list.push(tag);
  }
  return list.slice(0, 12);
}

function sentimentOf(
  value: unknown,
): { ok: true; value: ReviewSentiment | null } | { ok: false; message: string } {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { ok: true, value: null };
  return oneOf(raw, REVIEW_SENTIMENTS, "Sentiment");
}

/** Record a review exactly as it arrived — it enters the inbox unanswered. */
export async function saveReviewAction(
  input: ReviewInput,
): Promise<CrmActionState> {
  const guard = await guardCrm("log");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };
  const refs = crmRefs(crm);

  const source = oneOf(input.source, REVIEW_SOURCES, "Source");
  if (!source.ok) return source;
  const rating = ratingOf(input.rating);
  if (!rating.ok) return rating;
  const body = text(input.text, "Review text", 2000);
  if (!body.ok) return body;
  const reviewer = optionalText(input.reviewer_name, "Reviewer name", 120);
  if (!reviewer.ok) return reviewer;
  const notes = optionalText(input.internal_notes, "Internal notes", 2000);
  if (!notes.ok) return notes;
  const sentiment = sentimentOf(input.sentiment);
  if (!sentiment.ok) return sentiment;

  const customerId = refId(input.customer_id, refs.customerIds, "Customer");
  if (!customerId.ok) return customerId;
  const staffId = refId(
    input.staff_mentioned_id,
    refs.staffIds,
    "Staff mentioned",
  );
  if (!staffId.ok) return staffId;
  const when = optionalDate(input.review_date);
  if (!when.ok) return when;

  // An id from the client has to be this workspace's own row — see crmRecordId.
  const id = crmRecordId(input.id, refs.reviewIds, "Review");
  if (!id.ok) return id;
  const row = {
    id: id.value,
    source: source.value,
    rating: rating.value,
    text: body.value,
    reviewer_name: reviewer.value || null,
    customer_id: customerId.value,
    review_date: when.value ?? crm.asOf,
    // Blank means "the stars decide" — metrics owns that rule.
    sentiment: sentiment.value,
    tags: tagsOf(input.tags),
    staff_mentioned: staffId.value ? staffName(crm, staffId.value) : null,
    internal_notes: notes.value || null,
  };

  const existing = await crm.repo.find("customer_reviews", id.value);
  const saved = existing
    ? await crm.repo.patch("customer_reviews", id.value, row)
    : await crm.repo.save("customer_reviews", {
        ...row,
        brand_id: guard.brandId,
        response_status: "unanswered",
      });
  if (!saved) return { ok: false, message: "Review not found." };

  await auditCrm(
    guard,
    existing ? "crm.review.updated" : "crm.review.created",
    "crm_review",
    saved.id,
    `${saved.rating}★ · ${saved.reviewer_name ?? "Anonymous"}`,
  );
  revalidateCrm(
    saved.customer_id ? `/customers/${saved.customer_id}` : "/customers/reviews",
  );
  return {
    ok: true,
    message: existing
      ? "Review updated."
      : "Review recorded — it waits in the inbox for a reply.",
  };
}

export type ReviewReplyInput = {
  review_id: string;
  response_text: string;
  internal_notes?: string | null;
};

/**
 * The reply a person writes. Sets `response_text`, stamps `responded_at` and
 * moves the review to "answered" — the only way a review becomes answered.
 */
export async function replyToReviewAction(
  input: ReviewReplyInput,
): Promise<CrmActionState> {
  const guard = await guardCrm("log");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const reviewId = requiredRef(
    input.review_id,
    crmRefs(crm).reviewIds,
    "Review",
  );
  if (!reviewId.ok) return reviewId;
  const existing = await crm.repo.find("customer_reviews", reviewId.value);
  if (!existing) return { ok: false, message: "Review not found." };

  const reply = text(input.response_text, "Reply", 2000);
  if (!reply.ok) return reply;
  const notes = optionalText(input.internal_notes, "Internal notes", 2000);
  if (!notes.ok) return notes;

  const patch: Partial<Review> = {
    response_text: reply.value,
    responded_at: new Date().toISOString(),
    response_status: "answered",
  };
  if (notes.value) patch.internal_notes = notes.value;

  const saved = await crm.repo.patch("customer_reviews", reviewId.value, patch);
  if (!saved) return { ok: false, message: "Review not found." };

  await auditCrm(
    guard,
    "crm.review.replied",
    "crm_review",
    saved.id,
    reply.value.slice(0, 120),
  );
  revalidateCrm(
    saved.customer_id ? `/customers/${saved.customer_id}` : "/customers/reviews",
  );
  return { ok: true, message: "Reply recorded — the review is marked answered." };
}

/* ------------------------------------------------------------------ */
/* Escalating a review into a complaint                                */
/* ------------------------------------------------------------------ */

export type EscalateReviewInput = {
  review_id: string;
  subject: string;
  description?: string | null;
  severity?: string | null;
  assigned_staff_id?: string | null;
};

/**
 * A human decision, on the record: it opens a complaint row, links it back to
 * the review (`review_id`) and stamps the review "escalated" with its
 * `complaint_id`. Nothing here escalates on its own — a negative review is
 * only ever a suggestion in the UI.
 */
export async function escalateReviewAction(
  input: EscalateReviewInput,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };
  const refs = crmRefs(crm);

  const reviewId = requiredRef(input.review_id, refs.reviewIds, "Review");
  if (!reviewId.ok) return reviewId;
  const review = await crm.repo.find("customer_reviews", reviewId.value);
  if (!review) return { ok: false, message: "Review not found." };
  if (review.complaint_id && crm.complaints.some((c) => c.id === review.complaint_id)) {
    return { ok: false, message: "This review is already linked to a complaint." };
  }

  const subject = text(input.subject, "Complaint subject", 200);
  if (!subject.ok) return subject;
  const description = optionalText(input.description, "Description", 2000);
  if (!description.ok) return description;

  const rawSeverity = typeof input.severity === "string" ? input.severity.trim() : "";
  const severity = rawSeverity
    ? oneOf(rawSeverity, COMPLAINT_SEVERITIES, "Severity")
    : { ok: true as const, value: "medium" as ComplaintSeverity };
  if (!severity.ok) return severity;

  const ownerId = refId(input.assigned_staff_id, refs.staffIds, "Owner");
  if (!ownerId.ok) return ownerId;

  const now = new Date().toISOString();
  const complaintId = newCrmId();
  const complaint = await crm.repo.save("customer_complaints", {
    id: complaintId,
    brand_id: guard.brandId,
    customer_id: review.customer_id,
    lead_id: null,
    review_id: review.id,
    interaction_id: null,
    subject: subject.value,
    description: description.value || review.text.slice(0, 2000),
    severity: severity.value,
    status: "open",
    assigned_staff_id: ownerId.value,
    resolution_notes: null,
    opened_at: now,
    resolved_at: null,
  });
  if (!complaint) return { ok: false, message: "Could not open the complaint." };

  const escalated = await crm.repo.patch("customer_reviews", review.id, {
    response_status: "escalated",
    complaint_id: complaint.id,
  });
  if (!escalated) return { ok: false, message: "Review not found." };

  await auditCrm(
    guard,
    "crm.complaint.created",
    "crm_complaint",
    complaint.id,
    complaint.subject,
  );
  await auditCrm(
    guard,
    "crm.review.escalated",
    "crm_review",
    review.id,
    `→ complaint ${complaint.id}`,
  );
  revalidateCrm(
    complaint.customer_id ? `/customers/${complaint.customer_id}` : "/customers/reviews",
  );
  return {
    ok: true,
    message: `Complaint opened: ${complaint.subject}. The review is marked escalated.`,
  };
}

/* ------------------------------------------------------------------ */
/* Complaints                                                          */
/* ------------------------------------------------------------------ */

/**
 * Status is a human statement about the world, so it is recorded as one.
 * `resolved_at` is stamped by the server when a person moves the complaint to
 * resolved/closed, and cleared if it goes back to open work. No timer ever
 * moves a complaint on its own.
 */
export async function setComplaintStatusAction(
  id: string,
  status: string,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;

  const next = oneOf(status, COMPLAINT_STATUSES, "Status");
  if (!next.ok) return next;

  const existing = await guard.repo.find("customer_complaints", id);
  if (!existing) return { ok: false, message: "Complaint not found." };
  const settled = next.value === "resolved" || next.value === "closed";

  const patch: Partial<Complaint> = {
    status: next.value,
    resolved_at: settled ? (existing.resolved_at ?? new Date().toISOString()) : null,
  };
  const saved = await guard.repo.patch("customer_complaints", id, patch);
  if (!saved) return { ok: false, message: "Complaint not found." };

  await auditCrm(
    guard,
    "crm.complaint.status_changed",
    "crm_complaint",
    saved.id,
    `${existing.status} → ${saved.status}`,
  );
  revalidateCrm(
    saved.customer_id ? `/customers/${saved.customer_id}` : "/customers/reviews",
  );
  return {
    ok: true,
    message: `Status recorded: ${COMPLAINT_STATUS_LABELS[saved.status]}.`,
  };
}

/** Hand the complaint to someone, or take it off them (`null`). */
export async function assignComplaintAction(
  id: string,
  assignedStaffId: string | null,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const owner = refId(assignedStaffId, crmRefs(crm).staffIds, "Owner");
  if (!owner.ok) return owner;
  const existing = await crm.repo.find("customer_complaints", id);
  if (!existing) return { ok: false, message: "Complaint not found." };

  const saved = await crm.repo.patch("customer_complaints", id, {
    assigned_staff_id: owner.value,
  });
  if (!saved) return { ok: false, message: "Complaint not found." };

  await auditCrm(
    guard,
    "crm.complaint.assigned",
    "crm_complaint",
    saved.id,
    owner.value ? (staffName(crm, owner.value) ?? owner.value) : "unassigned",
  );
  revalidateCrm();
  return {
    ok: true,
    message: owner.value
      ? `Owner recorded: ${staffName(crm, owner.value)}.`
      : "Owner cleared — nobody is chasing this yet.",
  };
}

/**
 * What actually fixed it, in the owner's words. Recording a resolution is the
 * human act that closes the loop — it also marks the complaint resolved.
 */
export async function recordComplaintResolutionAction(
  id: string,
  resolutionNotes: string,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;

  const notes = text(resolutionNotes, "Resolution notes", 2000);
  if (!notes.ok) return notes;

  const existing = await guard.repo.find("customer_complaints", id);
  if (!existing) return { ok: false, message: "Complaint not found." };

  const saved = await guard.repo.patch("customer_complaints", id, {
    resolution_notes: notes.value,
    status: "resolved" as ComplaintStatus,
    resolved_at: existing.resolved_at ?? new Date().toISOString(),
  });
  if (!saved) return { ok: false, message: "Complaint not found." };

  await auditCrm(
    guard,
    "crm.complaint.resolved",
    "crm_complaint",
    saved.id,
    notes.value.slice(0, 120),
  );
  revalidateCrm(
    saved.customer_id ? `/customers/${saved.customer_id}` : "/customers/reviews",
  );
  return {
    ok: true,
    message: "Resolution recorded — the complaint is marked resolved.",
  };
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

/** The whole review log, one row per review, built on the server. */
export async function exportReviewsCsvAction(): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; message: string }
> {
  const guard = await guardCrm("log");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const customerName = (id: string | null) =>
    crm.customers.find((c) => c.id === id)?.name ?? "";
  const rows = [...crm.reviews]
    .sort((a, b) => b.review_date.localeCompare(a.review_date))
    .map((review) => ({
      review_date: review.review_date.slice(0, 10),
      source: review.source,
      rating: review.rating,
      sentiment: classifyReviewSentiment(review),
      response_status: review.response_status,
      reviewer_name: review.reviewer_name ?? "Anonymous",
      customer: customerName(review.customer_id),
      staff_mentioned: review.staff_mentioned ?? "",
      tags: (review.tags ?? []).join(" | "),
      text: review.text,
      response_text: review.response_text ?? "",
      responded_at: review.responded_at ?? "",
      complaint_id: review.complaint_id ?? "",
      internal_notes: review.internal_notes ?? "",
    }));
  return crmCsv(`crm-reviews-${guard.brandCode}.csv`, rows);
}
