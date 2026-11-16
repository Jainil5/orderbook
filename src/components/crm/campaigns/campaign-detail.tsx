import Link from "next/link";
import { CrmChip, CrmKeyValue, CrmPanel } from "@/components/crm/crm-ui";
import {
  CampaignAudiencePanel,
  type CampaignRecipientRow,
} from "@/components/crm/campaigns/campaign-audience-panel";
import {
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_TONES,
  CAMPAIGN_TYPE_LABELS,
} from "@/components/crm/campaigns/campaign-options";
import {
  consentedCustomerIds,
  customerById,
  recountCampaign,
  segmentMemberIds,
  statById,
  type CrmWorkspace,
} from "@/lib/crm/loader";
import { formatDate, formatMoney } from "@/lib/format";
import type { CustomerStat, MarketingCampaign } from "@/types/crm";

const RECIPIENT_PAGE = 150;

/** Newest recorded instant among a set of timestamps. */
function latest(values: (string | null)[]): string | null {
  const filled = values.filter((value): value is string => Boolean(value)).sort();
  return filled.length ? filled[filled.length - 1] : null;
}

/**
 * One campaign, fully joined server-side: what it is, who is in the audience
 * today, and what a person recorded against each recipient.
 *
 * The tallies shown here are `recountCampaign()` over the recipient rows on
 * this read, not the stored numbers, so a row edited elsewhere cannot leave a
 * stale figure on screen. Excluded people are segment members who fail the
 * consent gate — they are listed as excluded and never as recipients.
 */
export function CampaignDetail({
  crm,
  campaign,
  canManage,
}: {
  crm: CrmWorkspace;
  campaign: MarketingCampaign;
  canManage: boolean;
}) {
  const money = (value: number) => formatMoney(value, crm.currencyCode);
  const stats = statById(crm);

  const segment = crm.segments.find((item) => item.id === campaign.segment_id) ?? null;
  const offer = crm.offers.find((item) => item.id === campaign.offer_id) ?? null;

  // The same two calls the actions use, so the screen and the write agree.
  const audienceIds = segment
    ? segmentMemberIds(crm, segment)
    : crm.customers
        .filter((customer) => customer.status !== "archived")
        .map((customer) => customer.id);
  const contactableIds = consentedCustomerIds(crm, audienceIds);
  const contactableSet = new Set(contactableIds);

  const rows = crm.recipients.filter((row) => row.campaign_id === campaign.id);
  const tallies = recountCampaign(crm, campaign);

  const recipientRows: CampaignRecipientRow[] = rows.map((row) => {
    const customer = customerById(crm, row.customer_id);
    const order = row.order_id
      ? crm.orders.find((item) => item.id === row.order_id)
      : undefined;
    const contactable = contactableSet.has(row.customer_id ?? "");
    return {
      id: row.id,
      customerId: row.customer_id ?? null,
      name: customer?.name ?? "Removed customer",
      contact: customer ? customer.phone ?? customer.email ?? null : null,
      status: row.status,
      markedSentAt: row.marked_sent_at,
      respondedAt: row.responded_at,
      redeemedAt: row.redeemed_at,
      orderLabel: order ? order.order_number : row.order_id ? row.order_id : null,
      orderAmount: order ? order.grand_total : null,
      note: row.note,
      contactable,
      exclusionReason: contactable
        ? null
        : consentGateReason(crm, row.customer_id, stats.get(row.customer_id ?? "")),
      orders: customer
        ? crm.orders
            .filter((item) => item.customer_id === customer.id)
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .slice(0, 25)
            .map((item) => ({
              id: item.id,
              label: `${item.order_number} · ${formatDate(item.created_at).slice(0, 6)} · ${money(
                item.grand_total,
              )}`,
            }))
        : [],
    };
  });

  const excluded = audienceIds
    .filter((id) => !contactableSet.has(id))
    .map((id) => {
      const customer = customerById(crm, id);
      return {
        id,
        name: customer?.name ?? "Customer",
        reason: consentGateReason(crm, id, stats.get(id)),
      };
    });

  return (
    <div className="space-y-4">
      <CrmPanel
        title={campaign.name}
        meta={`${CAMPAIGN_STATUS_LABELS[campaign.status]} · ${CAMPAIGN_CHANNEL_LABELS[campaign.channel]}`}
        actions={
          canManage ? (
            <Link
              href={`/customers/campaigns?id=${campaign.id}&edit=${campaign.id}`}
              className="ob-touch-target rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-2.5 py-1 text-xs font-medium text-[var(--crm-ink)]"
            >
              Edit campaign
            </Link>
          ) : null
        }
      >
        {campaign.description ? (
          <p className="mb-3 text-sm text-[var(--ob-text-secondary)]">
            {campaign.description}
          </p>
        ) : null}
        <CrmKeyValue
          items={[
            { label: "Type", value: CAMPAIGN_TYPE_LABELS[campaign.type] },
            { label: "Channel", value: CAMPAIGN_CHANNEL_LABELS[campaign.channel] },
            {
              label: "Status",
              value: (
                <CrmChip tone={CAMPAIGN_STATUS_TONES[campaign.status]}>
                  {CAMPAIGN_STATUS_LABELS[campaign.status]}
                </CrmChip>
              ),
            },
            {
              label: "Runs",
              value: `${formatDate(campaign.start_date).slice(0, 6)} → ${
                campaign.end_date ? formatDate(campaign.end_date).slice(0, 6) : "open"
              }`,
            },
            {
              label: "Segment",
              value: segment ? (
                <Link
                  href={`/customers/segments?id=${segment.id}`}
                  className="text-[var(--ob-primary)] hover:underline"
                >
                  {segment.name}
                </Link>
              ) : (
                "Every consented customer"
              ),
            },
            {
              label: "Linked offer",
              value: offer ? (
                <Link
                  href="/offers"
                  className="text-[var(--ob-primary)] hover:underline"
                >
                  {offer.name}
                  {offer.code ? ` (${offer.code})` : ""}
                </Link>
              ) : (
                "None — the campaign never copies an offer"
              ),
            },
            {
              label: "Consent-only flag",
              value: campaign.consent_only ? (
                <CrmChip tone="positive">on</CrmChip>
              ) : (
                <CrmChip tone="warning">off (still consent-filtered)</CrmChip>
              ),
            },
            {
              label: "Last saved",
              value: formatDate(campaign.updated_at),
            },
          ]}
        />
      </CrmPanel>

      <CampaignAudiencePanel
        campaignId={campaign.id}
        campaignName={campaign.name}
        segmentId={segment?.id ?? null}
        segmentName={segment?.name ?? null}
        currencyCode={crm.currencyCode}
        canManage={canManage}
        tallies={tallies}
        lastRecorded={{
          selected: latest(rows.map((row) => row.created_at)),
          sent: latest(rows.map((row) => row.marked_sent_at)),
          responded: latest(rows.map((row) => row.responded_at)),
          redeemed: latest(rows.map((row) => row.redeemed_at)),
        }}
        recipients={recipientRows.slice(0, RECIPIENT_PAGE)}
        excluded={excluded}
        audience={{
          matched: audienceIds.length,
          contactable: contactableIds.length,
        }}
        shownLimit={recipientRows.length > RECIPIENT_PAGE ? RECIPIENT_PAGE : null}
      />
    </div>
  );
}

/**
 * The one reason a matched person is not in an audience, read straight off
 * their own customer record (never guessed).
 */
function consentGateReason(
  crm: CrmWorkspace,
  customerId: string | null,
  stat: CustomerStat | undefined,
): string | null {
  if (!customerId) return "No customer behind this row";
  const customer = customerById(crm, customerId);
  if (!customer) return "Not in this brand's directory";
  if (customer.status === "archived" || stat?.status === "archived")
    return "Archived";
  if (customer.opted_out_at)
    return `Opted out ${customer.opted_out_at.slice(0, 10)}`;
  if (customer.marketing_consent === "declined") return "Consent declined";
  if (!customer.marketing_consent) return "Consent never recorded";
  return null;
}
