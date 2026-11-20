"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  CAMPAIGN_CHANNEL_LABELS,
  type CampaignChannel,
  type CampaignStatus,
  type MarketingCampaign,
} from "@/types/crm";
import { CAMPAIGN_TYPE_LABELS, campaignMetrics } from "@/lib/crm/campaigns";
import { formatDate, formatMoney } from "@/lib/format";
import { Megaphone } from "lucide-react";

/**
 * The channels this build treats as digital. `in_store` is a real campaign
 * channel in the CRM, but a poster on the counter is not an ad, so it stays
 * out of this board.
 */
const DIGITAL_CHANNELS: readonly CampaignChannel[] = ["whatsapp", "email", "sms"];

const STATUS_TONE: Record<
  CampaignStatus,
  "neutral" | "success" | "warning" | "danger"
> = {
  draft: "neutral",
  scheduled: "warning",
  active: "success",
  paused: "warning",
  completed: "neutral",
  cancelled: "danger",
};

function rate(value: number | null): string {
  return value == null ? "—" : `${value}%`;
}

export function DigitalAdsBoard({
  campaigns,
  currencyCode,
}: {
  campaigns: MarketingCampaign[];
  currencyCode: string;
}) {
  const digital = campaigns.filter((c) => DIGITAL_CHANNELS.includes(c.channel));
  const running = digital.filter((c) => c.status === "active");
  const reached = digital.reduce((sum, c) => sum + c.delivered, 0);
  const redeemed = digital.reduce((sum, c) => sum + c.redeemed, 0);
  const revenue = digital.reduce((sum, c) => sum + c.revenue_attributed, 0);

  const tiles = [
    { label: "Running now", value: String(running.length) },
    { label: "Delivered", value: reached.toLocaleString("en-IN") },
    { label: "Redeemed", value: redeemed.toLocaleString("en-IN") },
    { label: "Revenue attributed", value: formatMoney(revenue, currencyCode) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <p className="ob-label-quiet">{tile.label}</p>
            <p className="ob-num mt-1 text-[26px] leading-none">{tile.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-[var(--ob-leaf)]" aria-hidden />
          <h2 className="font-semibold">Digital campaigns on file</h2>
        </div>
        <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
          WhatsApp, email and SMS work logged against this business. In-store
          campaigns live under Customers → Campaigns and stay off this board.
        </p>

        {digital.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="No digital campaigns yet"
              description="Log one under Customers → Campaigns and its numbers land here."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {digital.map((campaign) => {
              const metrics = campaignMetrics(campaign);
              return (
                <li
                  key={campaign.id}
                  className="ob-row rounded-[var(--ob-radius-sm)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{campaign.name}</span>
                    <Badge tone={STATUS_TONE[campaign.status]}>
                      {campaign.status}
                    </Badge>
                    <Badge tone="neutral">{CAMPAIGN_CHANNEL_LABELS[campaign.channel]}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--ob-text-secondary)]">
                    {CAMPAIGN_TYPE_LABELS[campaign.type]}
                    {campaign.starts_at ? ` · from ${formatDate(campaign.starts_at)}` : ""}
                    {campaign.ends_at ? ` to ${formatDate(campaign.ends_at)}` : ""}
                  </p>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                    <div>
                      <dt className="ob-label-quiet">Sent</dt>
                      <dd className="ob-num">{campaign.messages_sent.toLocaleString("en-IN")}</dd>
                    </div>
                    <div>
                      <dt className="ob-label-quiet">Delivered</dt>
                      <dd className="ob-num">{rate(metrics.deliveredRate)}</dd>
                    </div>
                    <div>
                      <dt className="ob-label-quiet">Redeemed</dt>
                      <dd className="ob-num">{rate(metrics.redemptionRate)}</dd>
                    </div>
                    <div>
                      <dt className="ob-label-quiet">Revenue</dt>
                      <dd className="ob-num">
                        {formatMoney(campaign.revenue_attributed, currencyCode)}
                      </dd>
                    </div>
                  </dl>
                  {campaign.offer_id ? (
                    <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
                      Offer attached — the discount the ad promised is the one
                      Billing applies at checkout.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <p className="ob-fineprint mt-4">
          The demo is not connected to any ad platform. Every number on this
          board was logged by hand against a CRM campaign, so it reads as
          evidence rather than as a live report.{" "}
          <Link
            href="/customers/campaigns"
            className="text-[var(--ob-primary)] underline"
          >
            Open campaigns
          </Link>
        </p>
      </Card>
    </div>
  );
}
