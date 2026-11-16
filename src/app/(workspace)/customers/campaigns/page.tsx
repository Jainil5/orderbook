import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CrmChip,
  CrmReadOnlyNote,
  CrmSectionHeader,
  CrmStatRow,
  CrmSubnav,
  type CrmStat,
} from "@/components/crm/crm-ui";
import { CampaignDetail } from "@/components/crm/campaigns/campaign-detail";
import { CampaignForm } from "@/components/crm/campaigns/campaign-form";
import {
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_TONES,
  CAMPAIGN_TYPE_LABELS,
} from "@/components/crm/campaigns/campaign-options";
import {
  consentedCustomerIds,
  loadCrmWorkspace,
  segmentMemberIds,
} from "@/lib/crm/loader";
import { formatDate, formatMoney } from "@/lib/format";

/**
 * Campaigns — the audience, and what a human recorded against it.
 *
 * `?id=<campaignId>` deep-links a campaign (this is the link the CRM overview
 * uses). Nothing here sends anything: recipient rows come only from
 * `consentedCustomerIds`, and the tallies are recounted from those rows, so a
 * number can never be typed into an input and stored as a result.
 */
export default async function CrmCampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; new?: string; edit?: string; segment?: string }>;
}) {
  const crm = await loadCrmWorkspace();
  if (!crm) redirect("/login");
  const sp = await searchParams;

  const money = (value: number) => formatMoney(value, crm.currencyCode);

  const segmentChoices = crm.segments.map((segment) => {
    const matched = segmentMemberIds(crm, segment);
    return {
      id: segment.id,
      name: segment.name,
      kind: segment.kind,
      matched: matched.length,
      contactable: consentedCustomerIds(crm, matched).length,
    };
  });

  const offerChoices = crm.offers.map((offer) => ({
    id: offer.id,
    name: offer.name,
    code: offer.code ?? null,
    active: offer.is_active,
  }));

  const campaigns = [...crm.campaigns].sort((a, b) =>
    b.start_date.localeCompare(a.start_date),
  );

  const overviewStats: CrmStat[] = [
    {
      label: "Campaigns",
      value: String(campaigns.length),
      hint: `${campaigns.filter((c) => c.status === "draft").length} draft · ${
        campaigns.filter((c) => c.status === "cancelled").length
      } cancelled`,
    },
    {
      label: "Active now",
      value: String(campaigns.filter((c) => c.status === "active").length),
      hint: "Status is set by whoever runs the campaign",
    },
    {
      label: "Recorded as sent",
      value: String(
        campaigns.reduce((sum, campaign) => sum + campaign.marked_sent_count, 0),
      ),
      hint: "Counted from recipient rows, never estimated",
    },
    {
      label: "Revenue attributed",
      value: money(
        campaigns.reduce((sum, campaign) => sum + campaign.revenue_attributed, 0),
      ),
      hint: "Only redemptions carrying a real order",
    },
  ];

  const canManage = crm.canManage;
  const editing = sp.edit
    ? crm.campaigns.find((campaign) => campaign.id === sp.edit) ?? null
    : null;
  const showForm = canManage && (Boolean(sp.new) || Boolean(editing));
  const viewed = sp.id
    ? crm.campaigns.find((campaign) => campaign.id === sp.id) ?? null
    : null;
  const viewedMissing = Boolean(sp.id) && !viewed;

  return (
    <PageShell title="Campaigns">
      <CrmSubnav />
      <CrmSectionHeader
        title="Campaigns and audiences"
        description="Point a campaign at a saved segment, record what a person actually did for each recipient, and let OrderBook recount the numbers from those rows. There is no delivery, no simulation and no invented rate anywhere on this screen."
        actions={
          canManage ? (
            <Link
              href="/customers/campaigns?new=1"
              className="ob-touch-target rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-3 py-1.5 text-sm font-medium text-[var(--crm-leaf)]"
            >
              New campaign
            </Link>
          ) : null
        }
      />

      {!canManage ? (
        <CrmReadOnlyNote role={crm.role}>
          You can see every campaign, its audience and what has been recorded.
          Creating campaigns and recording outcomes are hidden.
        </CrmReadOnlyNote>
      ) : null}

      <CrmStatRow stats={overviewStats} />

      {showForm ? (
        <div className="mb-4">
          <CampaignForm
            campaign={editing}
            segments={segmentChoices}
            offers={offerChoices}
            defaultSegmentId={sp.segment ?? null}
            today={crm.asOf.slice(0, 10)}
          />
        </div>
      ) : null}

      {viewedMissing ? (
        <p role="alert" className="mb-4 text-sm text-[var(--ob-danger)]">
          No campaign with that id exists in this brand.{" "}
          <Link href="/customers/campaigns" className="underline">
            Back to all campaigns
          </Link>
        </p>
      ) : null}

      {viewed ? (
        <div className="mb-6">
          <CampaignDetail crm={crm} campaign={viewed} canManage={canManage} />
        </div>
      ) : null}

      <h3 className="mb-2 mt-2 text-sm font-semibold">
        All campaigns ({campaigns.length})
      </h3>
      {campaigns.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          description={
            canManage
              ? "Pick a segment — or no segment at all — and OrderBook builds the audience from the customers you are allowed to contact. Then record what happened, person by person."
              : "Nobody has recorded a campaign for this brand yet. A manager can create one and log the outcomes."
          }
        />
      ) : (
        <div className="ob-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => {
            const segment = crm.segments.find((s) => s.id === campaign.segment_id);
            const offer = crm.offers.find((o) => o.id === campaign.offer_id);
            return (
              <Link
                key={campaign.id}
                href={`/customers/campaigns?id=${campaign.id}`}
                className="ob-touch-target block h-full"
              >
                <Card className="h-full p-4 transition-colors hover:border-[var(--crm-wash-line)] hover:bg-[var(--crm-wash)]">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-semibold">
                      {campaign.name}
                    </p>
                    <CrmChip tone={CAMPAIGN_STATUS_TONES[campaign.status]}>
                      {CAMPAIGN_STATUS_LABELS[campaign.status]}
                    </CrmChip>
                  </div>
                  <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
                    {CAMPAIGN_TYPE_LABELS[campaign.type]} ·{" "}
                    {CAMPAIGN_CHANNEL_LABELS[campaign.channel]} ·{" "}
                    {formatDate(campaign.start_date).slice(0, 6)}
                    {campaign.end_date
                      ? ` → ${formatDate(campaign.end_date).slice(0, 6)}`
                      : " → open"}
                  </p>
                  <p className="mt-1 truncate text-xs text-[var(--ob-text-muted)]">
                    Segment: {segment?.name ?? "everybody (consented)"} · Offer:{" "}
                    {offer?.name ?? "none linked"}
                  </p>
                  <p className="mt-2 text-xs">
                    {campaign.targeted_count} targeted ·{" "}
                    {campaign.marked_sent_count} marked sent ·{" "}
                    {campaign.response_count} responded ·{" "}
                    {campaign.redemption_count} redeemed
                    {campaign.revenue_attributed
                      ? ` · ${money(campaign.revenue_attributed)}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
                    {campaign.consent_only
                      ? "Consent-only"
                      : "Consent flag off — audience is still consent-filtered"}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}

