"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/cn";
import { formatMoney, pluralize } from "@/lib/format";
import {
  CAMPAIGN_TYPE_LABELS,
  audienceForSegment,
  campaignMetrics,
  isCampaignLive,
  validateCampaignInput,
  EMPTY_CAMPAIGN_INPUT,
  EMPTY_RESULT_INPUT,
  type CampaignInput,
  type ResultInput,
} from "@/lib/crm/campaigns";
import type { CustomerProfile } from "@/lib/crm/metrics";
import { describeRules } from "@/lib/crm/segments";
import { toLocalInputValue } from "@/lib/manager/time";
import { useMounted } from "@/lib/use-mounted";
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  type CampaignChannel,
  type CampaignStatus,
  type CustomerSegment,
  type MarketingCampaign,
} from "@/types/crm";
import {
  deleteCampaignAction,
  logCampaignResultAction,
  saveCampaignAction,
  setCampaignStatusAction,
} from "@/services/crm-actions";

type OfferOption = {
  id: string;
  name: string;
  code: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  is_active: boolean;
};

type Filter = "all" | CampaignStatus;

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<CampaignStatus, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  scheduled: "warning",
  active: "success",
  paused: "warning",
  completed: "neutral",
  cancelled: "danger",
};

/**
 * Statuses a campaign can be moved to. A finished or cancelled one has no
 * forward move — re-running it is a new campaign with its own numbers.
 */
const NEXT_STATUSES: Record<CampaignStatus, CampaignStatus[]> = {
  draft: ["scheduled", "active", "cancelled"],
  scheduled: ["active", "cancelled"],
  active: ["paused", "completed", "cancelled"],
  paused: ["active", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

function toInput(campaign: MarketingCampaign): CampaignInput {
  return {
    name: campaign.name,
    description: campaign.description,
    type: campaign.type,
    channel: campaign.channel,
    segment_id: campaign.segment_id ?? "",
    offer_id: campaign.offer_id ?? "",
    starts_at: campaign.starts_at ? toLocalInputValue(campaign.starts_at).slice(0, 10) : "",
    ends_at: campaign.ends_at ? toLocalInputValue(campaign.ends_at).slice(0, 10) : "",
    status: campaign.status,
    consent_required: campaign.consent_required ? "yes" : "no",
  };
}

function discountLabel(offer: OfferOption, currencyCode: string): string {
  return offer.discount_type === "percent"
    ? `${offer.discount_value}% off`
    : `${formatMoney(offer.discount_value, currencyCode)} off`;
}

/**
 * Who should be contacted, what offer applies, and what came back.
 *
 * The board never claims a message left the building: delivery counters are a
 * human's observation, and a campaign with nothing logged says so plainly.
 */
export function CampaignsManager({
  campaigns,
  segments,
  profiles,
  offers,
  currencyCode,
}: {
  campaigns: MarketingCampaign[];
  segments: CustomerSegment[];
  profiles: CustomerProfile[];
  offers: OfferOption[];
  currencyCode: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLDialogElement>(null);
  const resultRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<MarketingCampaign | null>(null);
  const [form, setForm] = useState<CampaignInput>(EMPTY_CAMPAIGN_INPUT);
  const [resultsFor, setResultsFor] = useState<MarketingCampaign | null>(null);
  const [results, setResults] = useState<ResultInput>(EMPTY_RESULT_INPUT);

  const mounted = useMounted();
  const now = new Date();

  const segmentById = new Map(segments.map((s) => [s.id, s]));
  const offerById = new Map(offers.map((o) => [o.id, o]));

  function audienceOf(campaign: MarketingCampaign) {
    const segment = campaign.segment_id
      ? segmentById.get(campaign.segment_id) ?? null
      : null;
    return audienceForSegment(segment, profiles, {
      consentRequired: campaign.consent_required,
      channel: campaign.channel as CampaignChannel,
    });
  }

  const patch = (fields: Partial<CampaignInput>) =>
    setForm((prev) => ({ ...prev, ...fields }));

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        return true;
      }
      setError(result.message ?? "Could not save.");
      return false;
    } catch {
      setError("Could not save. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function startEdit(campaign: MarketingCampaign | null) {
    setEditing(campaign);
    setForm(campaign ? toInput(campaign) : EMPTY_CAMPAIGN_INPUT);
    setError(null);
  }

  function startResults(campaign: MarketingCampaign) {
    setResultsFor(campaign);
    setResults({
      ...EMPTY_RESULT_INPUT,
      messages_sent: String(campaign.messages_sent),
      delivered: String(campaign.delivered),
      responded: String(campaign.responded),
      redeemed: String(campaign.redeemed),
      revenue_attributed: String(campaign.revenue_attributed),
    });
    setError(null);
  }

  // The same rules the server applies, run here so the audience preview and the
  // save button agree with what will actually be written.
  const draftSegmentId = form.segment_id;
  const draftAudience = audienceForSegment(
    draftSegmentId ? segmentById.get(draftSegmentId) ?? null : null,
    profiles,
    {
      consentRequired: form.consent_required !== "no",
      channel: (form.channel || "whatsapp") as CampaignChannel,
    },
  );
  const formCheck = validateCampaignInput(form, {
    segmentIds: segments.map((s) => s.id),
    offerIds: offers.map((o) => o.id),
  });

  const liveCount = mounted
    ? campaigns.filter((c) => isCampaignLive(c, now)).length
    : campaigns.filter((c) => c.status === "active").length;
  const reachable = campaigns.reduce(
    (sum, c) => sum + audienceOf(c).recipients.length,
    0,
  );
  const logged = campaigns.filter((c) => c.messages_sent > 0).length;

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: campaigns.length },
    ...CAMPAIGN_STATUSES.map((status) => ({
      key: status as Filter,
      label: STATUS_LABELS[status],
      count: campaigns.filter((c) => c.status === status).length,
    })),
  ];

  const shown = campaigns.filter((c) => filter === "all" || c.status === filter);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Campaigns" value={String(campaigns.length)} hint="Saved on this brand" />
        <StatCard label="Live now" value={String(liveCount)} hint="Active inside its dates" tone="up" />
        <StatCard
          label="People reachable"
          value={String(reachable)}
          hint="Consent and contact details allow it"
        />
        <StatCard
          label="Results logged"
          value={`${logged}/${campaigns.length}`}
          hint={logged ? "Typed by hand from what you saw" : "Nothing recorded yet"}
        />
      </div>

      <Card className="p-4 text-sm text-[var(--ob-text-muted)]">
        <span className="font-semibold text-[var(--ob-text)]">This build does not send.</span>{" "}
        No WhatsApp, SMS or email account is wired up, so a campaign here is a plan and an
        audience list. The numbers under it are only ever what you observed and typed in —
        the app never invents a delivery.
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-[var(--ob-danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter campaigns">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              className={cn(
                "ob-press flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold",
                filter === f.key
                  ? "border-[var(--ob-leaf)] bg-[var(--ob-leaf)] text-[var(--ob-leaf-ink)]"
                  : "border-[var(--ob-line)] bg-[var(--ob-tint-wash)] text-[var(--ob-text-muted)] hover:border-[var(--ob-line-hover)] hover:text-[var(--ob-text)]",
              )}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="tabular-nums opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
          disabled={pending}
          onClick={() => {
            startEdit(null);
            formRef.current?.showModal();
          }}
        >
          New campaign
        </button>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="No campaigns here yet"
          description="A campaign is a segment, an offer and a date range — the shortlist you would otherwise read out to yourself before messaging people."
        />
      ) : (
        <div className="space-y-3">
          {shown.map((campaign) => {
            const audience = audienceOf(campaign);
            const metrics = campaignMetrics(campaign);
            const segment = campaign.segment_id
              ? segmentById.get(campaign.segment_id) ?? null
              : null;
            const offer = campaign.offer_id ? offerById.get(campaign.offer_id) ?? null : null;
            const excludedBy = audience.excluded.reduce<Record<string, number>>((acc, e) => {
              acc[e.reason] = (acc[e.reason] ?? 0) + 1;
              return acc;
            }, {});
            const live = mounted && isCampaignLive(campaign, now);
            return (
              <Card key={campaign.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {campaign.name}
                      <Badge tone={STATUS_TONE[campaign.status]} className="ml-2">
                        {STATUS_LABELS[campaign.status]}
                      </Badge>
                      {live ? (
                        <Badge tone="success" className="ml-2">
                          Running
                        </Badge>
                      ) : null}
                    </p>
                    <p className="text-sm text-[var(--ob-text-muted)]">
                      {CAMPAIGN_TYPE_LABELS[campaign.type]} ·{" "}
                      {CAMPAIGN_CHANNEL_LABELS[campaign.channel as CampaignChannel]}
                      {segment ? ` · ${segment.name}` : " · Everyone on file"}
                      {offer
                        ? ` · ${offer.name}${offer.code ? ` (${offer.code})` : ""} — ${discountLabel(offer, currencyCode)}`
                        : ""}
                    </p>
                    <p className="text-xs text-[var(--ob-text-muted)]">
                      {[
                        campaign.starts_at
                          ? `from ${campaign.starts_at.slice(0, 10)}`
                          : "no start date",
                        campaign.ends_at ? `until ${campaign.ends_at.slice(0, 10)}` : "no end date",
                        campaign.consent_required
                          ? "consent required"
                          : "consent not required for this one",
                      ].join(" · ")}
                    </p>
                    {campaign.description ? (
                      <p className="mt-1 text-sm">{campaign.description}</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="ob-num text-2xl font-semibold">{audience.recipients.length}</p>
                    <p className="text-xs text-[var(--ob-text-muted)]">
                      {segment && segment.kind === "dynamic"
                        ? "reachable · rules: " + describeRules(segment.rules ?? {})
                        : "reachable now"}
                    </p>
                  </div>
                </div>

                {audience.excluded.length ? (
                  <div className="mt-2 flex flex-wrap gap-1 text-xs">
                    {Object.entries(excludedBy).map(([reason, count]) => (
                      <span key={reason} className="ob-tag">
                        {count} {reason.toLowerCase()}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--ob-line)] pt-3 sm:grid-cols-5">
                  {[
                    { label: "Sent", value: String(metrics.reach) },
                    {
                      label: "Delivered",
                      value:
                        metrics.deliveredRate === null ? "—" : `${metrics.deliveredRate}%`,
                    },
                    {
                      label: "Responded",
                      value:
                        metrics.responseRate === null ? "—" : `${metrics.responseRate}%`,
                    },
                    {
                      label: "Redeemed",
                      value:
                        metrics.redemptionRate === null ? "—" : `${metrics.redemptionRate}%`,
                    },
                    {
                      label: "Revenue",
                      value: formatMoney(campaign.revenue_attributed, currencyCode),
                    },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <p className="ob-label-quiet">{stat.label}</p>
                      <p className="ob-num font-semibold">{stat.value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
                  {metrics.canReportDelivery
                    ? "Counted from what you logged by hand."
                    : "Nothing has been sent or counted — the counters stay at zero until you log what actually happened."}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {NEXT_STATUSES[campaign.status].map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={cn(
                        "ob-touch-target rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50",
                        status === "cancelled"
                          ? "ob-btn-ghost text-[var(--ob-danger)]"
                          : status === campaign.status
                            ? "ob-btn-secondary"
                            : "ob-btn-primary ob-press",
                      )}
                      disabled={pending}
                      onClick={() => run(() => setCampaignStatusAction(campaign.id, status))}
                    >
                      {status === "active" && campaign.status === "paused"
                        ? "Resume"
                        : `Mark ${STATUS_LABELS[status].toLowerCase()}`}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                    disabled={pending}
                    onClick={() => {
                      startResults(campaign);
                      resultRef.current?.showModal();
                    }}
                  >
                    Log results
                  </button>
                  <Link
                    href={`/customers/directory?segment=${campaign.segment_id ?? ""}`}
                    className={cn(
                      "ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold",
                      !campaign.segment_id && "hidden",
                    )}
                  >
                    See the segment
                  </Link>
                  <button
                    type="button"
                    className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
                    disabled={pending}
                    onClick={() => {
                      startEdit(campaign);
                      formRef.current?.showModal();
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--ob-danger)] disabled:opacity-50"
                    disabled={pending}
                    onClick={() => run(() => deleteCampaignAction(campaign.id))}
                  >
                    Delete
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <dialog
        ref={formRef}
        className="m-auto max-h-[90vh] w-[min(100%,44rem)] overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)] backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]"
        onClose={() => setError(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() =>
              saveCampaignAction(editing?.id ?? null, form),
            );
            if (ok) {
              formRef.current?.close();
              startEdit(null);
            }
          }}
        >
          <h2 className="font-semibold">
            {editing ? "Edit campaign" : "New campaign"}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Name</span>
              <input
                className="ob-input mt-1 w-full"
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                maxLength={120}
                required
                disabled={pending}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">What is it for</span>
              <select
                className="ob-input mt-1 w-full"
                value={form.type}
                onChange={(e) => patch({ type: e.target.value })}
                disabled={pending}
              >
                {CAMPAIGN_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CAMPAIGN_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">How you will reach them</span>
              <select
                className="ob-input mt-1 w-full"
                value={form.channel}
                onChange={(e) => patch({ channel: e.target.value })}
                disabled={pending}
              >
                {CAMPAIGN_CHANNELS.map((channel) => (
                  <option key={channel} value={channel}>
                    {CAMPAIGN_CHANNEL_LABELS[channel]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Segment</span>
              <select
                className="ob-input mt-1 w-full"
                value={form.segment_id}
                onChange={(e) => patch({ segment_id: e.target.value })}
                disabled={pending}
              >
                <option value="">Everyone on file</option>
                {segments.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Offer</span>
              <select
                className="ob-input mt-1 w-full"
                value={form.offer_id}
                onChange={(e) => patch({ offer_id: e.target.value })}
                disabled={pending}
              >
                <option value="">No offer attached</option>
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name}
                    {offer.code ? ` (${offer.code})` : ""} —{" "}
                    {discountLabel(offer, currencyCode)}
                    {offer.is_active ? "" : " · inactive"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Status</span>
              <select
                className="ob-input mt-1 w-full"
                value={form.status}
                onChange={(e) => patch({ status: e.target.value })}
                disabled={pending}
              >
                {CAMPAIGN_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Starts</span>
              <input
                className="ob-input mt-1 w-full"
                type="date"
                value={form.starts_at}
                onChange={(e) => patch({ starts_at: e.target.value })}
                disabled={pending}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Ends</span>
              <input
                className="ob-input mt-1 w-full"
                type="date"
                value={form.ends_at}
                onChange={(e) => patch({ ends_at: e.target.value })}
                disabled={pending}
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Note to yourself</span>
            <textarea
              className="ob-input mt-1 w-full"
              rows={2}
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              maxLength={500}
              disabled={pending}
            />
          </label>

          <fieldset className="space-y-2 rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-3">
            <legend className="px-1 text-sm text-[var(--ob-text-muted)]">
              Consent gate
            </legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="consent-required"
                checked={form.consent_required === "yes"}
                onChange={() => patch({ consent_required: "yes" })}
                disabled={pending}
              />
              <span>
                Only people who opted in
                <span className="block text-xs text-[var(--ob-text-muted)]">
                  Anyone without marketing consent, or who opted out, drops off the list.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="consent-required"
                checked={form.consent_required === "no"}
                onChange={() => patch({ consent_required: "no" })}
                disabled={pending}
              />
              <span>
                Consent not required for this one
                <span className="block text-xs text-[var(--ob-text-muted)]">
                  Use it for in-store conversations. An explicit opt-out still blocks every
                  channel.
                </span>
              </span>
            </label>
          </fieldset>

          <p className="text-sm text-[var(--ob-text-muted)]">
            <span className="ob-num font-semibold text-[var(--ob-text)]">
              {draftAudience.recipients.length}
            </span>{" "}
            of {profiles.length} {pluralize(profiles.length, "customer")} are reachable under these settings
            {draftAudience.excluded.length
              ? ` · ${draftAudience.excluded.length} held back`
              : ""}
            .
          </p>
          {!formCheck.ok ? (
            <p className="text-sm text-[var(--ob-warning)]">{formCheck.message}</p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending || !formCheck.ok}
            >
              {pending ? "Saving…" : editing ? "Save changes" : "Create campaign"}
            </button>
            <button
              type="button"
              className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => {
                formRef.current?.close();
                startEdit(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={resultRef}
        className="m-auto max-h-[90vh] w-[min(100%,34rem)] overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)] backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]"
        onClose={() => setError(null)}
      >
        <form
          className="space-y-4 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!resultsFor) return;
            const ok = await run(() => logCampaignResultAction(resultsFor.id, results));
            if (ok) {
              resultRef.current?.close();
              setResultsFor(null);
            }
          }}
        >
          <h2 className="font-semibold">Log what happened</h2>
          <p className="text-sm text-[var(--ob-text-muted)]">
            These are your own numbers, read off the tool you actually used — the campaign
            reaches {resultsFor ? audienceOf(resultsFor).recipients.length : 0} people on this
            build&apos;s list. Saving them flips the campaign to
            <span className="font-semibold"> manually logged</span>; nothing here is a report
            from a messaging provider.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { key: "messages_sent", label: "Messages sent" },
                { key: "delivered", label: "Delivered" },
                { key: "responded", label: "Responded" },
                { key: "redeemed", label: "Redeemed" },
                { key: "revenue_attributed", label: "Revenue attributed" },
              ] as const
            ).map((field) => (
              <label key={field.key} className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">{field.label}</span>
                <input
                  className="ob-input mt-1 w-full"
                  type="number"
                  min={0}
                  step={1}
                  value={results[field.key]}
                  onChange={(e) =>
                    setResults((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  disabled={pending}
                />
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="ob-press ob-btn-primary ob-touch-target rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving…" : "Save the numbers"}
            </button>
            <button
              type="button"
              className="ob-touch-target ob-btn-ghost rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => resultRef.current?.close()}
            >
              Cancel
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
