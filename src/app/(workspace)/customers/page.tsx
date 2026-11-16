import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CrmChip,
  CrmPanel,
  CrmRating,
  CrmSectionHeader,
  CrmStageChip,
  CrmStatRow,
  CrmSubnav,
  type CrmStat,
} from "@/components/crm/crm-ui";
import { CsvExportButton } from "@/components/export/csv-export-button";
import { CRM_SECTIONS } from "@/lib/workspace/crm-nav";
import { findDuplicateCustomers } from "@/lib/crm/metrics";
import { loadCrmWorkspace, type CrmWorkspace } from "@/lib/crm/loader";
import { exportCrmCustomersCsvAction } from "@/services/crm-customer-actions";
import {
  ACTIVE_CUSTOMER_WINDOW_DAYS,
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  NEW_CUSTOMER_WINDOW_DAYS,
} from "@/types/crm";
import { formatDate, formatMoney } from "@/lib/format";

const OPEN_LEAD_STAGES = LEAD_STAGES.filter(
  (stage) => stage !== "won" && stage !== "lost",
);

/**
 * CRM overview — the one screen that answers "how is the customer side of the
 * business doing" without opening six pages.
 *
 * Every number is computed once by `loadCrmWorkspace()` from this brand's real
 * orders, reviews, leads and complaints. Nothing here is an estimate and
 * nothing here pretends to have sent something: campaign figures are what a
 * person recorded against each recipient.
 */
export default async function CrmOverviewPage() {
  const crm = await loadCrmWorkspace();
  if (!crm) redirect("/login");

  const { totals, leadsByStage, acquisitionTrend } = crm.overview;
  const duplicates = findDuplicateCustomers(crm.customers);
  const money = (value: number) => formatMoney(value, crm.currencyCode);
  /** `rate` formats a 0–1 fraction; `percent` formats a value that is already a percentage (CRM metrics return 0–100, never fractions). */
  const rate = (value: number | null) =>
    value === null ? "—" : `${Math.round(value * 100)}%`;
  const percent = (value: number | null) =>
    value === null ? "—" : `${Math.round(value)}%`;
  const openLeads = OPEN_LEAD_STAGES.reduce((sum, s) => sum + leadsByStage[s], 0);
  const dueCount =
    crm.overview.followUpsDue.leads.length +
    crm.overview.followUpsDue.interactions.length +
    crm.overview.followUpsDue.complaints.length;

  const stats: CrmStat[] = [
    {
      label: "Customers",
      value: String(totals.customers),
      hint: `${totals.activeCustomers} bought in the last ${ACTIVE_CUSTOMER_WINDOW_DAYS} days`,
      href: "/customers/directory",
    },
    {
      label: "New customers",
      value: String(totals.newCustomers),
      hint: `First seen within ${NEW_CUSTOMER_WINDOW_DAYS} days`,
      href: "/customers/directory?sort=created",
    },
    {
      label: "Customer revenue",
      value: money(totals.customerLifetimeRevenue),
      hint: `Average ${money(totals.averageCustomerSpend)} per customer`,
    },
    {
      label: "Repeat rate",
      value: rate(
        totals.customers ? totals.returningCustomers / totals.customers : null,
      ),
      hint: `${totals.returningCustomers} returning · ${totals.inactiveCustomers} dormant`,
    },
  ];

  const pipelineStats: CrmStat[] = [
    {
      label: "Open leads",
      value: String(openLeads),
      hint: `${totals.totalLeads} leads ever · ${percent(totals.leadConversionRate)} converted`,
      href: "/customers/leads",
    },
    {
      label: "Follow-ups due",
      value: String(dueCount),
      hint: dueCount ? "Leads, calls and complaints" : "Nothing waiting",
      href: "/customers/interactions",
    },
    {
      label: "Average review",
      value: crm.reviewIntel.average === null ? "—" : crm.reviewIntel.average.toFixed(2),
      hint: `${crm.reviewIntel.unanswered} unanswered of ${crm.reviews.length}`,
      href: "/customers/reviews",
    },
    {
      label: "Open complaints",
      value: String(totals.unresolvedComplaints),
      hint: totals.unresolvedComplaints ? "Needs an owner" : "Nothing outstanding",
      href: "/customers/reviews?tab=complaints",
    },
  ];

  const maxNew = Math.max(1, ...acquisitionTrend.map((m) => m.newCustomers));

  return (
    <PageShell
      title="Customers"
      headerActions={
        <CsvExportButton
          label="Export customers"
          onExport={exportCrmCustomersCsvAction}
        />
      }
    >
      <CrmSubnav />
      <CrmSectionHeader
        title="CRM overview"
        description={`Brand ${crm.brandCode} · figures as of ${formatDate(crm.asOf)}. Recomputed from orders, reviews, leads and loyalty records on every visit.`}
        actions={
          <Link
            href="/customers/leads?new=1"
            className="ob-touch-target rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-3 py-1.5 text-sm font-medium text-[var(--crm-leaf)]"
          >
            Add a lead
          </Link>
        }
      />

      <CrmStatRow stats={stats} />
      <CrmStatRow stats={pipelineStats} />

      <div className="grid gap-4 lg:grid-cols-3">
        <CrmPanel title="Pipeline" meta={`${totals.totalLeads} leads`} className="lg:col-span-1">
          <ul className="space-y-1.5">
            {LEAD_STAGES.map((stage) => (
              <li key={stage}>
                <Link
                  href={`/customers/leads?stage=${stage}`}
                  className="ob-touch-target flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--ob-surface-muted)]"
                >
                  <CrmStageChip stage={stage} label={LEAD_STAGE_LABELS[stage]} />
                  <span className="text-sm font-semibold tabular-nums">
                    {leadsByStage[stage]}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CrmPanel>

        <CrmPanel
          title="Follow-ups due"
          meta={dueCount ? `${dueCount} waiting` : "Nothing overdue"}
          className="lg:col-span-2"
        >
          <FollowUpList crm={crm} />
        </CrmPanel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <CrmPanel title="New customers by month" meta="Last 6 months" className="lg:col-span-1">
          {acquisitionTrend.length === 0 ? (
            <EmptyState title="No customers yet" />
          ) : (
            <ul className="space-y-2">
              {acquisitionTrend.map((month) => (
                <li key={month.month} className="flex items-center gap-3 text-sm">
                  <span className="w-14 shrink-0 text-[var(--ob-text-muted)]">
                    {month.month}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--crm-wash)]">
                    <span
                      className="block h-full rounded-full bg-[var(--crm-lab)]"
                      style={{
                        width: `${Math.round((month.newCustomers / maxNew) * 100)}%`,
                      }}
                    />
                  </span>
                  <span className="w-6 text-right font-medium tabular-nums">
                    {month.newCustomers}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CrmPanel>

        <CrmPanel title="Latest reviews" meta={`${crm.reviews.length} recorded`}>
          {crm.overview.recentReviews.length === 0 ? (
            <EmptyState title="No reviews recorded" />
          ) : (
            <ul className="space-y-3">
              {crm.overview.recentReviews.slice(0, 5).map((review) => (
                <li key={review.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <CrmRating rating={review.rating} />
                    <span className="truncate font-medium">
                      {review.reviewer_name ?? "Anonymous"}
                    </span>
                    <CrmChip
                      tone={
                        review.response_status === "unanswered"
                          ? "warning"
                          : review.response_status === "escalated"
                            ? "danger"
                            : "positive"
                      }
                    >
                      {review.response_status}
                    </CrmChip>
                  </div>
                  {review.text ? (
                    <p className="mt-1 line-clamp-2 text-[var(--ob-text-muted)]">
                      {review.text}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/customers/reviews"
            className="mt-3 inline-block text-sm text-[var(--ob-primary)]"
          >
            Review inbox →
          </Link>
        </CrmPanel>

        <CrmPanel title="Campaigns" meta={`${crm.campaigns.length} recorded`}>
          {crm.overview.campaignPerformance.length === 0 ? (
            <p className="text-sm text-[var(--ob-text-muted)]">
              No campaigns yet. A campaign never sends anything by itself — you
              record who was contacted and what came back.
            </p>
          ) : (
            <ul className="space-y-3">
              {crm.overview.campaignPerformance.slice(0, 4).map((campaign) => (
                <li key={campaign.id} className="text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/customers/campaigns?id=${campaign.id}`}
                      className="truncate font-medium text-[var(--ob-primary)]"
                    >
                      {campaign.name}
                    </Link>
                    <CrmChip tone={campaign.status === "active" ? "positive" : "neutral"}>
                      {campaign.status}
                    </CrmChip>
                  </div>
                  <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
                    {campaign.targeted_count} targeted ·{" "}
                    {campaign.marked_sent_count} marked sent ·{" "}
                    {campaign.redemption_count} redeemed
                    {campaign.revenue_attributed
                      ? ` · ${money(campaign.revenue_attributed)}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/customers/campaigns"
            className="mt-3 inline-block text-sm text-[var(--ob-primary)]"
          >
            All campaigns →
          </Link>
        </CrmPanel>
      </div>

      {duplicates.length > 0 ? (
        <CrmPanel
          title="Possible duplicate customers"
          meta={`${duplicates.length} group${duplicates.length === 1 ? "" : "s"}`}
          className="mt-4"
        >
          <p className="mb-3 text-sm text-[var(--ob-text-muted)]">
            The same phone number or email on more than one customer. Spend is
            split between them, so segments and lifetime value understate the
            relationship.
          </p>
          <ul className="space-y-2 text-sm">
            {duplicates.slice(0, 6).map((group) => (
              <li key={`${group.reason}-${group.key}`} className="flex flex-wrap items-center gap-2">
                <CrmChip tone="warning" className="uppercase">
                  {group.reason}
                </CrmChip>
                <span className="text-[var(--ob-text-muted)]">{group.key}</span>
                {group.customerIds.map((id) => {
                  const customer = crm.customers.find((c) => c.id === id);
                  return (
                    <Link
                      key={id}
                      href={`/customers/${id}`}
                      className="text-[var(--ob-primary)] hover:underline"
                    >
                      {customer?.name ?? "Customer"}
                    </Link>
                  );
                })}
              </li>
            ))}
          </ul>
        </CrmPanel>
      ) : null}

      <h2 className="mt-6 mb-3 text-sm font-semibold">Where to next</h2>
      <div className="ob-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CRM_SECTIONS.filter((section) => section.key !== "overview").map(
          (section) => (
            <Link key={section.href} href={section.href} className="ob-touch-target block">
              <Card className="h-full p-4 transition-colors hover:border-[var(--crm-wash-line)] hover:bg-[var(--crm-wash)]">
                <p className="text-sm font-semibold">{section.label}</p>
                <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
                  {section.description}
                </p>
              </Card>
            </Link>
          ),
        )}
      </div>
    </PageShell>
  );
}

/** Leads, logged interactions and complaints that are waiting on someone. */
function FollowUpList({ crm }: { crm: CrmWorkspace }) {
  const { leads, interactions, complaints } = crm.overview.followUpsDue;
  if (!leads.length && !interactions.length && !complaints.length) {
    return (
      <p className="text-sm text-[var(--ob-text-muted)]">
        Nothing is overdue. Follow-up dates come from leads, logged
        interactions and open complaints — set one while working on either.
      </p>
    );
  }
  const rows: {
    key: string;
    href: string;
    title: string;
    when: string;
    tone: "warning" | "danger";
  }[] = [
    ...complaints.slice(0, 3).map((complaint) => ({
      key: `complaint-${complaint.id}`,
      href: `/customers/reviews?tab=complaints&id=${complaint.id}`,
      title: `${complaint.subject} (${complaint.severity} complaint)`,
      when: complaint.opened_at,
      tone: "danger" as const,
    })),
    ...leads.slice(0, 4).map((lead) => ({
      key: `lead-${lead.id}`,
      href: `/customers/leads?id=${lead.id}`,
      title: `${lead.name} — lead follow-up`,
      when: lead.next_follow_up_at ?? lead.created_at,
      tone: "warning" as const,
    })),
    ...interactions.slice(0, 4).map((interaction) => ({
      key: `interaction-${interaction.id}`,
      href: `/customers/interactions?id=${interaction.id}`,
      title: `${interaction.subject ?? "Follow-up"} — logged interaction`,
      when: interaction.next_follow_up_at ?? interaction.occurred_at,
      tone: "warning" as const,
    })),
  ];
  return (
    <ul className="divide-y divide-[var(--ob-border)]">
      {rows.map((row) => (
        <li key={row.key}>
          <Link
            href={row.href}
            className="ob-touch-target flex items-center justify-between gap-3 py-2 text-sm hover:underline"
          >
            <span className="min-w-0 truncate">{row.title}</span>
            <CrmChip tone={row.tone}>{formatDate(row.when).slice(0, 6)}</CrmChip>
          </Link>
        </li>
      ))}
    </ul>
  );
}
