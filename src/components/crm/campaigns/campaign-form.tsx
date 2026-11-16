"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmPanel } from "@/components/crm/crm-ui";
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_CHANNEL_LABELS,
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPES,
  CAMPAIGN_TYPE_LABELS,
} from "@/components/crm/campaigns/campaign-options";
import { saveCampaignAction, type CampaignInput } from "@/services/crm-campaign-actions";
import type { MarketingCampaign } from "@/types/crm";

export type SegmentChoice = {
  id: string;
  name: string;
  kind: "dynamic" | "manual";
  /** Live numbers from the server read, never typed here. */
  matched: number;
  contactable: number;
};

type TextFieldKey =
  | "name"
  | "description"
  | "type"
  | "channel"
  | "status"
  | "segment_id"
  | "offer_id"
  | "start_date"
  | "end_date";

export type OfferChoice = {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
};

/**
 * Create or update a campaign.
 *
 * There is no target count, no "sent" count and no revenue box in this form.
 * Those are consequences: on save the audience is rebuilt from the chosen
 * segment through `consentedCustomerIds`, and every tally is recounted from
 * the recipient rows. The linked offer is a reference to an existing offer —
 * campaigns never copy one.
 */
export function CampaignForm({
  campaign,
  segments,
  offers,
  defaultSegmentId,
  today,
}: {
  /** Null when creating. */
  campaign: MarketingCampaign | null;
  segments: SegmentChoice[];
  offers: OfferChoice[];
  defaultSegmentId?: string | null;
  /** YYYY-MM-DD from the workspace read, so a new campaign starts today. */
  today: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState(() => ({
    name: campaign?.name ?? "",
    description: campaign?.description ?? "",
    type: campaign?.type ?? "offer",
    channel: campaign?.channel ?? "whatsapp",
    status: campaign?.status ?? "draft",
    segment_id: campaign?.segment_id ?? defaultSegmentId ?? "",
    offer_id: campaign?.offer_id ?? "",
    start_date: campaign?.start_date ?? today,
    end_date: campaign?.end_date ?? "",
    consent_only: campaign ? campaign.consent_only : true,
  }));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error"; message: string }>({
    kind: "idle",
    message: "",
  });

  const setField =
    (key: TextFieldKey) =>
    (
      event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    ) => {
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
      setStatus({ kind: "idle", message: "" });
    };

  const setConsentOnly = (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, consent_only: event.target.checked }));
    setStatus({ kind: "idle", message: "" });
  };

  const chosen = segments.find((segment) => segment.id === form.segment_id) ?? null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const input: CampaignInput = {
      ...(campaign ? { id: campaign.id } : {}),
      name: form.name,
      description: form.description,
      type: form.type,
      channel: form.channel,
      status: form.status,
      segment_id: form.segment_id,
      offer_id: form.offer_id,
      start_date: form.start_date,
      end_date: form.end_date,
      consent_only: form.consent_only,
    };
    const result = await saveCampaignAction(input);
    setBusy(false);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setStatus({ kind: "ok", message: result.message ?? "Campaign saved." });
    if (!campaign) {
      // Leave ?new=1 / ?segment=… behind so the screen shows the list again.
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      params.delete("segment");
      params.delete("edit");
      const qs = params.toString();
      router.replace(qs ? `/customers/campaigns?${qs}` : "/customers/campaigns");
    }
    router.refresh();
  }

  return (
    <CrmPanel
      title={campaign ? `Edit “${campaign.name}”` : "New campaign"}
      meta="Counts are derived, never typed"
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campaign name" required>
            <Input
              value={form.name}
              onChange={setField("name")}
              required
              maxLength={120}
              placeholder="Diwali gift-box offer"
            />
          </Field>
          <Field label="Description" hint="What the person on the counter would say.">
            <Input
              value={form.description}
              onChange={setField("description")}
              maxLength={500}
            />
          </Field>
          <Field label="Type">
            <select className="ob-input w-full" value={form.type} onChange={setField("type")}>
              {CAMPAIGN_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CAMPAIGN_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Channel"
            hint="How you contacted people. OrderBook has no delivery of any kind."
          >
            <select
              className="ob-input w-full"
              value={form.channel}
              onChange={setField("channel")}
            >
              {CAMPAIGN_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {CAMPAIGN_CHANNEL_LABELS[channel]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              className="ob-input w-full"
              value={form.status}
              onChange={setField("status")}
            >
              {CAMPAIGN_STATUSES.map((state) => (
                <option key={state} value={state}>
                  {CAMPAIGN_STATUS_LABELS[state]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Audience segment">
            <select
              className="ob-input w-full"
              value={form.segment_id}
              onChange={setField("segment_id")}
            >
              <option value="">Every customer (still consent-filtered)</option>
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name} — {segment.kind}, {segment.contactable} of{" "}
                  {segment.matched} contactable
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Linked offer"
            hint="Points at an existing offer; the CRM never copies or creates one."
          >
            <select className="ob-input w-full" value={form.offer_id} onChange={setField("offer_id")}>
              <option value="">No offer linked</option>
              {offers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {offer.name}
                  {offer.code ? ` (${offer.code})` : ""}
                  {offer.active ? "" : " — inactive"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start date" required>
            <Input
              type="date"
              value={form.start_date}
              onChange={setField("start_date")}
              required
            />
          </Field>
          <Field label="End date" hint="Blank: no planned end.">
            <Input type="date" value={form.end_date} onChange={setField("end_date")} />
          </Field>
        </div>

        <label className="ob-touch-target flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.consent_only}
            onChange={setConsentOnly}
          />
          <span>
            Consent-only campaign
            <span className="mt-0.5 block text-xs text-[var(--ob-text-muted)]">
              This is the recorded intent. The audience is consent-filtered
              whatever this says: a person without granted marketing consent
              can never become a recipient.
            </span>
          </span>
        </label>

        {chosen ? (
          <p className="rounded-[var(--ob-radius-md)] border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] p-3 text-sm">
            <span className="font-medium">“{chosen.name}”</span> matches{" "}
            {chosen.matched} customer{chosen.matched === 1 ? "" : "s"} right now;{" "}
            {chosen.contactable} of them may be contacted. Saving rebuilds the
            recipient list from those {chosen.contactable} and recounts every
            tally from the rows.
          </p>
        ) : (
          <p className="rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-3 text-sm text-[var(--ob-text-muted)]">
            No segment picked: the audience becomes every non-archived customer
            whose marketing consent is granted. Counts still come from the
            recipient rows, never from this form.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={busy}>
            {campaign ? "Save campaign" : "Create campaign"}
          </Button>
          <Link
            href="/customers/campaigns"
            className="ob-touch-target px-2 py-2 text-sm text-[var(--ob-text-muted)] underline"
          >
            Close
          </Link>
        </div>

        {status.kind !== "idle" ? (
          <p
            role={status.kind === "error" ? "alert" : "status"}
            className={
              status.kind === "error"
                ? "text-sm text-[var(--ob-danger)]"
                : "text-sm text-[var(--crm-lab-strong)]"
            }
          >
            {status.message}
          </p>
        ) : null}
      </form>
    </CrmPanel>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--ob-text-muted)]">
        {label}
        {required ? <span className="ml-0.5 text-[var(--ob-danger)]">*</span> : null}
      </span>
      <div className="mt-1">{children}</div>
      {hint ? (
        <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}
