"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import {
  briefForMover,
  briefForTopic,
  type CampaignEvidence,
  type ContentBrief,
  type GrowthSignals,
  type MoverRow,
  type QuestionTopic,
} from "@/lib/marketing/signals";
import { formatMoney } from "@/lib/format";
import { MessageSquareText, Sparkles, TrendingDown } from "lucide-react";

const WINDOWS = [7, 30, 90];

/** The content screen reads these params and prefills the brief. */
function briefHref(brief: ContentBrief): string {
  const params = new URLSearchParams({
    product: brief.productId ?? "",
    objective: brief.objective,
    kind: brief.kind,
    seconds: String(brief.seconds),
    notes: brief.notes,
  });
  return `/marketing/content?${params.toString()}`;
}

function trendText(trend: number | null): string {
  if (trend == null) return "no history to compare";
  if (trend === 0) return "flat on the previous window";
  return `${trend > 0 ? "+" : "−"}${Math.abs(trend)}% vs the window before`;
}

function BriefLink({ brief, label }: { brief: ContentBrief; label: string }) {
  return (
    <Link
      href={briefHref(brief)}
      className="text-xs font-semibold text-[var(--ob-primary)] underline underline-offset-2"
    >
      {label}
    </Link>
  );
}

function MoverList({
  title,
  hint,
  rows,
  currencyCode,
  kind,
  icon,
}: {
  title: string;
  hint: string;
  rows: MoverRow[];
  currencyCode: string;
  kind: "top" | "slow";
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-semibold">{title}</h2>
      </div>
      <p className="mt-1 text-sm text-[var(--ob-text-muted)]">{hint}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--ob-text-muted)]">
          Nothing to report in this window.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--ob-border)]">
          {rows.map((row) => (
            <li key={`${row.productId ?? row.name}`} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{row.name}</span>
                <span className="ob-num text-sm">
                  {row.units} sold · {formatMoney(row.revenue, currencyCode)}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
                {trendText(row.trend)}
                {row.margin != null
                  ? ` · margin ${formatMoney(row.margin, currencyCode)} a unit`
                  : " · no cost on file"}
              </p>
              <div className="mt-2">
                <BriefLink
                  brief={briefForMover(row, kind)}
                  label={kind === "top" ? "Make a reel of it" : "Write it back into demand"}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TopicList({
  title,
  hint,
  topics,
  emptyLabel,
}: {
  title: string;
  hint: string;
  topics: QuestionTopic[];
  emptyLabel: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <MessageSquareText
          className="h-5 w-5 text-[var(--ob-leaf)]"
          aria-hidden
        />
        <h2 className="font-semibold">{title}</h2>
      </div>
      <p className="mt-1 text-sm text-[var(--ob-text-muted)]">{hint}</p>
      {topics.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--ob-text-muted)]">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {topics.map((topic) => (
            <li key={topic.topic} className="rounded-[var(--ob-radius-sm)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium capitalize">{topic.topic}</span>
                <Badge tone="neutral">
                  {topic.count} {topic.count === 1 ? "mention" : "mentions"}
                </Badge>
              </div>
              {topic.examples.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-[var(--ob-text-secondary)]">
                  {topic.examples.map((example, index) => (
                    <li key={`${topic.topic}-${index}`}>“{example}”</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-2">
                <BriefLink
                  brief={briefForTopic(topic)}
                  label="Answer it in a post"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function verdictTone(verdict: CampaignEvidence["verdict"]) {
  if (verdict === "worked") return "success" as const;
  if (verdict === "quiet") return "warning" as const;
  return "neutral" as const;
}

export function GrowthSignalsPanel({
  signals,
  currencyCode,
  activeWindow,
}: {
  signals: GrowthSignals;
  currencyCode: string;
  activeWindow: number;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="ob-label-quiet">Window</span>
        {WINDOWS.map((days) => (
          <Link
            key={days}
            href={`/marketing/signals?window=${days}`}
            className={cn(
              "ob-press rounded-full border px-3 py-1 text-xs font-semibold",
              days === activeWindow
                ? "border-[var(--ob-leaf)] text-[var(--ob-leaf-ink)]"
                : "border-[var(--ob-border)] text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]",
            )}
          >
            {days} days
          </Link>
        ))}
        <span className="ml-auto text-xs text-[var(--ob-text-muted)]">
          {signals.window.label}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="ob-label-quiet">Unanswered reviews</p>
          <p className="ob-num mt-1 text-[26px] leading-none">
            {signals.unansweredReviews}
          </p>
          <Link
            href="/customers/reviews"
            className="mt-2 inline-block text-xs text-[var(--ob-primary)] underline"
          >
            Open the inbox
          </Link>
        </Card>
        <Card>
          <p className="ob-label-quiet">Open complaints</p>
          <p className="ob-num mt-1 text-[26px] leading-none">
            {signals.openComplaints}
          </p>
          <Link
            href="/customers/reviews"
            className="mt-2 inline-block text-xs text-[var(--ob-primary)] underline"
          >
            See what is wrong
          </Link>
        </Card>
        <Card>
          <p className="ob-label-quiet">Campaigns worth repeating</p>
          <p className="ob-num mt-1 text-[26px] leading-none">
            {signals.campaignEvidence.filter((c) => c.verdict === "worked").length}
          </p>
          <Link
            href="/marketing/ads"
            className="mt-2 inline-block text-xs text-[var(--ob-primary)] underline"
          >
            Ads board
          </Link>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MoverList
          title="What is moving"
          hint="Sold in the window, ranked by units. The trend is the same length before it."
          rows={signals.topMovers}
          currencyCode={currencyCode}
          kind="top"
          icon={<Sparkles className="h-5 w-5 text-[var(--ob-leaf)]" aria-hidden />}
        />
        <MoverList
          title="What is not"
          hint="On the menu, sold before, quiet now — usually an offer or a reminder fixes it."
          rows={signals.slowMovers}
          currencyCode={currencyCode}
          kind="slow"
          icon={
            <TrendingDown className="h-5 w-5 text-[var(--ob-warning)]" aria-hidden />
          }
        />
        <TopicList
          title="Questions people keep asking"
          hint="Grouped from logged interactions and reviews by a fixed keyword rule — nothing invented."
          topics={signals.questions}
          emptyLabel="No repeated questions logged in this window."
        />
        <TopicList
          title="Objections that cost you sales"
          hint="The same log, read for complaints: price, wait, portion, delivery."
          topics={signals.objections}
          emptyLabel="No repeated complaints logged in this window."
        />
      </div>

      <Card>
        <h2 className="font-semibold">Did the campaign actually sell anything?</h2>
        <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
          Reach numbers are hand-logged, so they are the soft part of a campaign.
          These counts come from bills that carry the campaign&apos;s offer code.
        </p>
        {signals.campaignEvidence.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No campaigns in this window"
              description="Log one under Customers → Campaigns and its offer code ties it to real bills."
            />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--ob-border)]">
            {signals.campaignEvidence.map((campaign) => (
              <li key={campaign.campaignId} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{campaign.name}</span>
                  <Badge tone={verdictTone(campaign.verdict)}>{campaign.verdict.replace("_", " ")}</Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--ob-text-secondary)]">
                  {campaign.ordersFromOfferCode}{" "}
                  {campaign.ordersFromOfferCode === 1 ? "bill" : "bills"} carried its
                  code ·{" "}
                  {formatMoney(campaign.revenueFromOfferCode, currencyCode)} traced,{" "}
                  {formatMoney(campaign.revenueAttributed, currencyCode)} claimed ·{" "}
                  {campaign.redeemed} redemptions logged
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="ob-fineprint mt-3">
          When a campaign has no offer code, nothing can be traced to it, and this
          board says so rather than crediting it.
        </p>
      </Card>
    </div>
  );
}
