import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { CsvExportButton } from "@/components/export/csv-export-button";
import {
  CrmReadOnlyNote,
  CrmSectionHeader,
  CrmStatRow,
  CrmSubnav,
  type CrmStat,
} from "@/components/crm/crm-ui";
import {
  SegmentListCard,
  SegmentDetail,
  audienceExclusionReason,
  type SegmentMemberRow,
} from "@/components/crm/segments/segment-detail";
import { SegmentEditor } from "@/components/crm/segments/segment-editor";
import type { PickerCustomer } from "@/components/crm/segments/manual-customer-picker";
import {
  DEFAULT_LEAD_SOURCES,
  consentedCustomerIds,
  customerById,
  describeSegmentRules,
  loadCrmWorkspace,
  segmentMemberIds,
  statById,
} from "@/lib/crm/loader";
import { exportSegmentsCsvAction } from "@/services/crm-segment-actions";
import type { CustomerSegment } from "@/types/crm";

/**
 * Segments — saved filters and hand-picked lists.
 *
 * `?id=<segmentId>` deep-links one segment and shows its live members (this is
 * the link the CRM overview uses). `?new=dynamic|manual` and `?edit=<id>` open
 * the editor, so the whole screen stays shareable and back-button-correct.
 *
 * Dynamic membership is never stored: every count below comes from
 * `segmentMemberIds()` over this brand's real orders, reviews, dues, loyalty
 * and membership rows, and "who we may contact" is that list filtered through
 * `consentedCustomerIds()`.
 */
export default async function CrmSegmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; new?: string; edit?: string }>;
}) {
  const crm = await loadCrmWorkspace();
  if (!crm) redirect("/login");
  const sp = await searchParams;

  const stats = statById(crm);
  const campaignsBySegment = new Map<string, { id: string; name: string }[]>();
  for (const campaign of crm.campaigns) {
    if (!campaign.segment_id) continue;
    const list = campaignsBySegment.get(campaign.segment_id) ?? [];
    list.push({ id: campaign.id, name: campaign.name });
    campaignsBySegment.set(campaign.segment_id, list);
  }

  const rows = crm.segments
    .map((segment) => {
      const matched = segmentMemberIds(crm, segment);
      return {
        segment,
        matched,
        contactable: consentedCustomerIds(crm, matched),
        ruleLines: describeSegmentRules(segment.rules ?? {}),
        campaigns: campaignsBySegment.get(segment.id) ?? [],
      };
    })
    .sort((a, b) => a.segment.name.localeCompare(b.segment.name));

  const reachable = new Set<string>();
  for (const row of rows) for (const id of row.contactable) reachable.add(id);
  const dynamicCount = rows.filter((r) => r.segment.kind === "dynamic").length;
  const inUse = rows.filter((r) => r.campaigns.length).length;
  const largest = rows.reduce(
    (best, row) => (row.matched.length > best.matched.length ? row : best),
    { matched: [] as string[], segment: null as CustomerSegment | null },
  );

  const overviewStats: CrmStat[] = [
    {
      label: "Saved segments",
      value: String(rows.length),
      hint: `${dynamicCount} dynamic · ${rows.length - dynamicCount} manual`,
    },
    {
      label: "People you may contact",
      value: String(reachable.size),
      hint: "Consent granted, not opted out, not archived",
      href: "/customers/directory?consent=granted",
    },
    {
      label: "Used by campaigns",
      value: String(inUse),
      hint: inUse ? "Deleting these needs the campaign moved first" : "No campaign points at one yet",
      href: "/customers/campaigns",
    },
    {
      label: "Biggest audience",
      value: String(largest.matched.length),
      hint: largest.segment ? largest.segment.name : "Nothing saved yet",
    },
  ];

  const canManage = crm.canManage;
  const editing = sp.edit
    ? crm.segments.find((segment) => segment.id === sp.edit) ?? null
    : null;
  const creating = Boolean(sp.new);
  const showEditor = canManage && (creating || Boolean(editing));

  const viewed = sp.id ? rows.find((row) => row.segment.id === sp.id) ?? null : null;
  const viewedMissing = Boolean(sp.id) && !viewed;

  const memberRows: SegmentMemberRow[] = viewed
    ? viewed.matched.flatMap((id) => {
        const customer = customerById(crm, id);
        if (!customer) return [];
        const contactable = viewed.contactable.includes(id);
        return [
          {
            customer,
            stat: stats.get(id),
            contactable,
            reason: contactable ? null : audienceExclusionReason(customer, stats.get(id)),
            loyaltyTier:
              crm.loyaltyAccounts.find((account) => account.customer_id === id)?.tier ??
              null,
            activeMembershipPlans: crm.memberships
              .filter((membership) => membership.customer_id === id && membership.status === "active")
              .map((membership) => membership.plan),
          },
        ];
      })
    : [];

  const pickerCustomers: PickerCustomer[] = crm.customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone ?? null,
    email: customer.email ?? null,
    consent: customer.marketing_consent ?? null,
    optedOutAt: customer.opted_out_at ?? null,
    archived: customer.status === "archived",
  }));

  const unique = (values: (string | null | undefined)[]): string[] =>
    [...new Set(values.map((v) => v?.trim()).filter((v): v is string => Boolean(v)))].sort();

  const options = {
    tags: unique(crm.customers.flatMap((customer) => customer.tags ?? [])),
    sources: unique([
      ...DEFAULT_LEAD_SOURCES,
      ...(crm.settings.lead_sources ?? []),
      ...crm.customers.map((customer) => customer.source),
    ]),
    loyaltyTiers: unique((crm.settings.loyalty?.tiers ?? []).map((tier) => tier.name)),
    membershipPlans: unique(crm.memberships.map((membership) => membership.plan)),
  };

  return (
    <PageShell
      title="Segments"
      headerActions={
        <CsvExportButton label="Export segments" onExport={exportSegmentsCsvAction} />
      }
    >
      <CrmSubnav />
      <CrmSectionHeader
        title="Audience segments"
        description="A dynamic segment is a saved filter that is re-evaluated against live order, review, dues, loyalty and membership data on every read. A manual segment is exactly the people you tick. Nothing here stores a member list, so a segment can never go stale."
        actions={
          canManage ? (
            <>
              <Link
                href="/customers/segments?new=dynamic"
                className="ob-touch-target rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-3 py-1.5 text-sm font-medium text-[var(--crm-leaf)]"
              >
                New dynamic segment
              </Link>
              <Link
                href="/customers/segments?new=manual"
                className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 py-1.5 text-sm font-medium"
              >
                New manual segment
              </Link>
            </>
          ) : null
        }
      />

      {!canManage ? (
        <CrmReadOnlyNote role={crm.role}>
          You can see every segment and its live members, but creating, editing
          or deleting a segment is hidden.
        </CrmReadOnlyNote>
      ) : null}

      <CrmStatRow stats={overviewStats} />

      {showEditor ? (
        <div className="mb-4">
          <SegmentEditor
            segment={editing}
            defaultKind={sp.new === "manual" ? "manual" : "dynamic"}
            options={options}
            customers={pickerCustomers}
            currencyCode={crm.currencyCode}
          />
        </div>
      ) : null}

      {viewedMissing ? (
        <p role="alert" className="mb-4 text-sm text-[var(--ob-danger)]">
          No segment with that id exists in this brand.{" "}
          <Link href="/customers/segments" className="underline">
            Back to all segments
          </Link>
        </p>
      ) : null}

      {viewed ? (
        <div className="mb-4">
          <SegmentDetail
            asOf={crm.asOf}
            segment={viewed.segment}
            ruleLines={viewed.ruleLines}
            members={memberRows}
            currencyCode={crm.currencyCode}
            canManage={canManage}
            campaignsUsing={viewed.campaigns}
          />
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No saved segments yet"
          description={
            canManage
              ? "Build a filter (spend, recency, tags, dues, reviews, loyalty tier, membership plan) or pick a handful of people by hand, then point a campaign at it."
              : "Nobody has saved a segment for this brand yet. A manager can build one from orders, reviews, dues, loyalty and membership data."
          }
        />
      ) : (
        <>
          <h3 className="mb-2 mt-6 text-sm font-semibold">
            All segments ({rows.length})
          </h3>
          <div className="ob-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <div key={row.segment.id} className="flex flex-col gap-2">
                <SegmentListCard
                  segment={row.segment}
                  ruleLines={row.ruleLines}
                  matched={row.matched.length}
                  contactable={row.contactable.length}
                  campaigns={row.campaigns}
                />
                {canManage ? (
                  <div className="flex flex-wrap gap-3 px-1 text-xs">
                    <Link
                      href={`/customers/segments?edit=${row.segment.id}`}
                      className="ob-touch-target text-[var(--ob-primary)] underline"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/customers/segments?id=${row.segment.id}`}
                      className="ob-touch-target text-[var(--ob-text-muted)] underline"
                    >
                      Members
                    </Link>
                    <Link
                      href={`/customers/campaigns?new=1&segment=${row.segment.id}`}
                      className="ob-touch-target text-[var(--ob-text-muted)] underline"
                    >
                      Use in a campaign
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}
