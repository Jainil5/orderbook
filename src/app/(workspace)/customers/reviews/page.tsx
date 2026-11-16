import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import {
  CrmPanel,
  CrmSectionHeader,
  CrmStatRow,
  CrmSubnav,
  type CrmStat,
} from "@/components/crm/crm-ui";
import { CsvExportButton } from "@/components/export/csv-export-button";
import {
  ComplaintList,
  type ComplaintRowData,
} from "@/components/crm/reviews/complaint-list";
import { ReviewFilters } from "@/components/crm/reviews/review-filters";
import { ReviewIntelPanels } from "@/components/crm/reviews/review-intel";
import {
  ReviewList,
  type ReviewRowData,
} from "@/components/crm/reviews/review-list";
import { ReviewRecordForm } from "@/components/crm/reviews/review-record-form";
import { CustomerSearchBar } from "@/components/customers/customer-search-bar";
import {
  REVIEW_SOURCE_LABELS,
  REVIEW_TABS,
  REVIEW_TAB_LABELS,
  REVIEW_TAB_STATUS,
  reviewTabFor,
  type ReviewTab,
} from "@/components/crm/reviews/review-vocabulary";
import {
  customerById,
  loadCrmWorkspace,
  staffName,
  type CrmWorkspace,
} from "@/lib/crm/loader";
import { classifyReviewSentiment } from "@/lib/crm/metrics";
import { exportReviewsCsvAction } from "@/services/crm-review-actions";
import {
  REVIEW_SOURCES,
  type Complaint,
  type Review,
  type ReviewSource,
} from "@/types/crm";

/**
 * Review inbox + complaints — `/customers/reviews`.
 *
 * One `loadCrmWorkspace()` read, four tabs, all state in the URL:
 * `?tab=inbox|answered|escalated|complaints`, `?id=` to focus one row (the CRM
 * overview deep-links `?tab=complaints&id=<complaintId>`), plus `?rating=`,
 * `?sentiment=`, `?source=` and `?q=`.
 *
 * Every aggregate on this page is the loader's `crm.reviewIntel`
 * (`analyzeReviews`) — the only per-row derivation here is
 * `classifyReviewSentiment`, i.e. the sentiment the review already carries
 * (recorded label, otherwise the stars). Nothing here invents a model, and
 * nothing is escalated, answered or resolved automatically: those are recorded
 * human decisions in `src/services/crm-review-actions.ts`.
 */
export default async function CrmReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    id?: string;
    q?: string;
    rating?: string;
    sentiment?: string;
    source?: string;
  }>;
}) {
  const crm = await loadCrmWorkspace();
  if (!crm) redirect("/login");
  const sp = await searchParams;

  const tab = reviewTabFor(sp.tab);
  const focusedId = sp.id?.trim() ?? "";
  const query = sp.q?.trim() ?? "";
  const rating = /^\d$/.test(sp.rating ?? "") ? (sp.rating as string) : "";
  const sentiment = ["positive", "neutral", "negative"].includes(
    sp.sentiment?.trim() ?? "",
  )
    ? (sp.sentiment as string).trim()
    : "";
  const source = (REVIEW_SOURCES as string[]).includes(sp.source?.trim() ?? "")
    ? (sp.source as string).trim()
    : "";

  const sourceOptions = reviewSourceOptions(crm);
  const rows =
    tab === "complaints"
      ? []
      : reviewRows(
          crm,
          crm.reviews
            .filter(
              (review) =>
                REVIEW_TAB_STATUS[tab] === null ||
                review.response_status === REVIEW_TAB_STATUS[tab],
            )
            .filter((review) =>
              rating ? String(roundStars(review.rating)) === rating : true,
            )
            .filter((review) =>
              sentiment ? classifyReviewSentiment(review) === sentiment : true,
            )
            .filter((review) => (source ? review.source === source : true))
            .filter((review) => matchesQuery(crm, review, query)),
        );

  const complaints =
    tab === "complaints"
      ? complaintRows(
          crm,
          crm.complaints.filter((complaint) =>
            matchesComplaintQuery(crm, complaint, query),
          ),
        )
      : [];

  /**
   * A `?id=` that is not in the tab it was linked into (a 360° timeline links a
   * bare `/customers/reviews?id=…`) gets one honest line pointing at where the
   * row really is, instead of an empty screen.
   */
  let deepLink: { message: string; href: string } | null = null;
  if (focusedId) {
    if (tab === "complaints") {
      if (!complaints.some((complaint) => complaint.id === focusedId)) {
        const complaint = crm.complaints.find((c) => c.id === focusedId);
        deepLink = complaint
          ? {
              message: `“${complaint.subject}” is not in this filtered list.`,
              href: "/customers/reviews?tab=complaints",
            }
          : {
              message: "No complaint with that reference for this brand.",
              href: "/customers/reviews?tab=complaints",
            };
      }
    } else if (!rows.some((review) => review.id === focusedId)) {
      const review = crm.reviews.find((r) => r.id === focusedId);
      const targetTab =
        REVIEW_TABS.find(
          (id) => REVIEW_TAB_STATUS[id] === review?.response_status,
        ) ?? "inbox";
      deepLink = review
        ? {
            message: `That review is in the ${REVIEW_TAB_LABELS[targetTab]} tab${
              rating || sentiment || source || query ? " — or filtered out here" : ""
            }.`,
            href: `/customers/reviews?tab=${targetTab}&id=${review.id}`,
          }
        : {
            message: "No review with that reference for this brand.",
            href: "/customers/reviews",
          };
    }
  }

  const stats: CrmStat[] = [
    {
      label: "Average rating",
      value:
        crm.reviewIntel.average === null
          ? "—"
          : crm.reviewIntel.average.toFixed(2),
      hint: `${crm.reviews.length} reviews recorded`,
    },
    {
      label: "Awaiting a reply",
      value: String(crm.reviewIntel.unanswered),
      hint: "The inbox — a reply is written by a person",
      href: "/customers/reviews?tab=inbox",
    },
    {
      label: "Escalated",
      value: String(crm.reviewIntel.escalated),
      hint: "Reviews turned into complaint records",
      href: "/customers/reviews?tab=escalated",
    },
    {
      label: "Open complaints",
      value: String(crm.overview.totals.unresolvedComplaints),
      hint: "Each one waits on its owner, not on a timer",
      href: "/customers/reviews?tab=complaints",
    },
  ];

  return (
    <PageShell
      title="Reviews"
      headerActions={
        <CsvExportButton
          label="Export reviews"
          onExport={exportReviewsCsvAction}
        />
      }
    >
      <CrmSubnav />
      <CrmSectionHeader
        title={`Reviews · ${REVIEW_TAB_LABELS[tab]}`}
        description="Every rating, tag and reply for this brand. Negative sentiment is only a hint — replying and escalating stay human decisions, and a complaint is closed when someone records how."
        actions={
          crm.canLog && tab !== "complaints" ? (
            <a
              href="#record-review"
              className="ob-touch-target rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-3 py-1.5 text-sm font-medium text-[var(--crm-leaf)]"
            >
              Record a review
            </a>
          ) : null
        }
      />

      <CrmStatRow stats={stats} />

      <div className="mb-3">
        <Suspense
          fallback={
            <div className="h-10 max-w-md animate-pulse rounded-md bg-[var(--ob-surface-muted)]" />
          }
        >
          <CustomerSearchBar
            initialQuery={query}
            basePath="/customers/reviews"
            placeholder="Search reviews, reviewers, tags, staff…"
            ariaLabel="Search reviews"
          />
        </Suspense>
      </div>

      <ReviewFilters
        tab={tab}
        q={query}
        rating={rating}
        sentiment={sentiment}
        source={source}
        distribution={crm.reviewIntel.distribution}
        sourceOptions={sourceOptions}
      />

      <ReviewIntelPanels
        intel={crm.reviewIntel}
        totalReviews={crm.reviews.length}
      />

      {deepLink ? (
        <p
          role="status"
          className="mb-3 rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-3 py-2 text-sm text-[var(--crm-bark)]"
        >
          {deepLink.message}{" "}
          <Link
            href={deepLink.href}
            className="ob-touch-target text-[var(--ob-primary)] hover:underline"
          >
            Show that list
          </Link>
        </p>
      ) : null}

      {tab === "complaints" ? (
        <CrmPanel
          title="Complaints"
          meta={`${complaints.length} shown · ${crm.overview.totals.unresolvedComplaints} still open`}
        >
          <ComplaintList
            rows={complaints}
            staffOptions={crm.staff}
            canManage={crm.canManage}
            focusedId={focusedId || undefined}
          />
        </CrmPanel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CrmPanel
              title={`${REVIEW_TAB_LABELS[tab]} reviews`}
              meta={`${rows.length} shown of ${crm.reviews.length} recorded`}
            >
              <ReviewList
                rows={rows}
                staffOptions={crm.staff}
                canLog={crm.canLog}
                canManage={crm.canManage}
                focusedId={focusedId || undefined}
                emptyTitle={EMPTY[tab].title}
                emptyDescription={EMPTY[tab].description}
              />
            </CrmPanel>
          </div>

          {crm.canLog ? (
            <div id="record-review" className="lg:col-span-1">
              <CrmPanel title="Record a review" meta="Enters the inbox unanswered">
                <ReviewRecordForm
                  customerOptions={crm.customers.map((customer) => ({
                    id: customer.id,
                    name: customer.name,
                  }))}
                  staffOptions={crm.staff}
                  sourceOptions={sourceOptions}
                  today={crm.asOf.slice(0, 10)}
                />
              </CrmPanel>
            </div>
          ) : (
            <CrmPanel title="Recording reviews" className="lg:col-span-1">
              <p className="text-sm text-[var(--ob-text-muted)]">
                Your role can read the inbox and every figure here, but not
                record or answer reviews. Ask an owner, admin or manager.
              </p>
            </CrmPanel>
          )}
        </div>
      )}
    </PageShell>
  );
}

const EMPTY: Record<ReviewTab, { title: string; description: string }> = {
  inbox: {
    title: "Nothing is waiting for a reply",
    description:
      "Every recorded review has an answer. Record one from the panel on the right, or open the answered tab.",
  },
  answered: {
    title: "No answered reviews yet",
    description:
      "A reply is written by a person and stamped with the moment it was recorded — that is the only way a review gets here.",
  },
  escalated: {
    title: "No escalated reviews",
    description:
      "Escalating a review opens a complaint record and keeps both linked. Negative sentiment only suggests it; it never does it.",
  },
  complaints: { title: "", description: "" },
};

/* ------------------------------------------------------------------ */
/* Row joins (names only — every number comes from the loader/metrics)  */
/* ------------------------------------------------------------------ */

function reviewRows(crm: CrmWorkspace, reviews: Review[]): ReviewRowData[] {
  return [...reviews]
    .sort((a, b) => b.review_date.localeCompare(a.review_date))
    .map((review) => ({
      id: review.id,
      rating: review.rating,
      sourceLabel: REVIEW_SOURCE_LABELS[review.source] ?? review.source,
      text: review.text,
      reviewerName: review.reviewer_name,
      customerId: review.customer_id,
      customerName: customerById(crm, review.customer_id)?.name ?? null,
      staffMentioned: review.staff_mentioned,
      tags: review.tags ?? [], // an empty CSV json cell decodes to null
      reviewDate: review.review_date,
      respondedAt: review.responded_at,
      responseStatus: review.response_status,
      responseText: review.response_text,
      internalNotes: review.internal_notes,
      sentiment: classifyReviewSentiment(review),
      complaintId: review.complaint_id,
    }));
}

function complaintRows(
  crm: CrmWorkspace,
  complaints: Complaint[],
): ComplaintRowData[] {
  const rank = (status: Complaint["status"]) =>
    status === "open" ? 0 : status === "in_progress" ? 1 : status === "resolved" ? 2 : 3;
  return [...complaints]
    .sort(
      (a, b) =>
        rank(a.status) - rank(b.status) ||
        a.opened_at.localeCompare(b.opened_at),
    )
    .map((complaint) => ({
      id: complaint.id,
      subject: complaint.subject,
      description: complaint.description,
      severity: complaint.severity,
      status: complaint.status,
      openedAt: complaint.opened_at,
      resolvedAt: complaint.resolved_at,
      resolutionNotes: complaint.resolution_notes,
      ownerId: complaint.assigned_staff_id,
      ownerName: staffName(crm, complaint.assigned_staff_id),
      customerId: complaint.customer_id,
      customerName: customerById(crm, complaint.customer_id)?.name ?? null,
      reviewId: complaint.review_id,
      reviewRating:
        crm.reviews.find((review) => review.id === complaint.review_id)
          ?.rating ?? null,
    }));
}

/**
 * Same star-bucket rule `analyzeReviews` uses for its distribution, so the
 * `?rating=` chips and the spread panel can never disagree.
 */
function roundStars(rating: number): number {
  return rating === 1 ? 1 : Math.min(5, Math.max(1, Math.round(rating)));
}

function matchesQuery(
  crm: CrmWorkspace,
  review: Review,
  query: string,
): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  const customer = customerById(crm, review.customer_id);
  return (
    review.text.toLowerCase().includes(needle) ||
    (review.reviewer_name ?? "").toLowerCase().includes(needle) ||
    (review.staff_mentioned ?? "").toLowerCase().includes(needle) ||
    (customer?.name ?? "").toLowerCase().includes(needle) ||
    (review.tags ?? []).some((tag) => tag.toLowerCase().includes(needle))
  );
}

function matchesComplaintQuery(
  crm: CrmWorkspace,
  complaint: Complaint,
  query: string,
): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  const customer = customerById(crm, complaint.customer_id);
  return (
    complaint.subject.toLowerCase().includes(needle) ||
    (complaint.description ?? "").toLowerCase().includes(needle) ||
    (complaint.resolution_notes ?? "").toLowerCase().includes(needle) ||
    (customer?.name ?? "").toLowerCase().includes(needle) ||
    (staffName(crm, complaint.assigned_staff_id) ?? "")
      .toLowerCase()
      .includes(needle)
  );
}

/**
 * Source pick-list: this brand's configured `review_sources` first (labels or
 * values both normalise to the stored enum), then any source the app supports
 * that the brand has not listed. Ordering only — the stored vocabulary stays
 * `REVIEW_SOURCES`.
 */
function reviewSourceOptions(
  crm: CrmWorkspace,
): { value: string; label: string }[] {
  const configured = (crm.settings.review_sources ?? [])
    .map(normalizeSource)
    .filter((value): value is ReviewSource => value !== null);
  const ordered: ReviewSource[] = [];
  for (const value of [...configured, ...REVIEW_SOURCES]) {
    if (!ordered.includes(value)) ordered.push(value);
  }
  return ordered.map((value) => ({
    value,
    label: REVIEW_SOURCE_LABELS[value],
  }));
}

function normalizeSource(value: string): ReviewSource | null {
  const raw = value.trim();
  if ((REVIEW_SOURCES as string[]).includes(raw)) return raw as ReviewSource;
  const match = REVIEW_SOURCES.find(
    (source) => REVIEW_SOURCE_LABELS[source].toLowerCase() === raw.toLowerCase(),
  );
  return match ?? null;
}
