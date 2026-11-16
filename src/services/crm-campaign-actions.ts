"use server";

import { day, oneOf, refId, text } from "@/lib/business/validate";
import {
  auditCrm,
  crmCsv,
  crmRecordId,
  crmRefs,
  flag,
  guardCrm,
  revalidateCrm,
  type CrmActionState,
} from "@/lib/crm/actions-kit";
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  type CampaignRecipient,
  type MarketingCampaign,
  type RecipientStatus,
} from "@/types/crm";
import {
  consentedCustomerIds,
  loadCrmWorkspace,
  planCampaignRecipients,
  recountCampaign,
  type CrmWorkspace,
} from "@/lib/crm/loader";

/**
 * Campaign actions (manage scope).
 *
 * Two rules drive this whole file:
 * 1. Nothing is ever "sent" here. A person records what happened, and the only
 *    evidence OrderBook keeps is the timestamp on that recipient row.
 * 2. No number on a campaign is typed in. `targeted / marked sent / responded /
 *    redeemed / revenue` are recounted from recipient rows by
 *    `recountCampaign`, and the audience itself comes only from
 *    `planCampaignRecipients`, which selects through `consentedCustomerIds`.
 */

export type CampaignInput = {
  id?: string | null;
  name: string;
  description?: string | null;
  type: string;
  channel: string;
  status: string;
  segment_id?: string | null;
  offer_id?: string | null;
  /** YYYY-MM-DD from a date input. */
  start_date: string;
  end_date?: string | null;
  consent_only?: boolean | string | null;
};

function optionalText(value: unknown, field: string, max = 500) {
  return text(value, field, max, false);
}

/* ------------------------------------------------------------------ */
/* Audience + tallies                                                  */
/* ------------------------------------------------------------------ */

/**
 * Rebuild a campaign's recipient rows from its segment + consent, then store
 * the derived numbers. Only ever called when the audience actually changed
 * (or when a human asks for a rebuild) — recorded outcomes are otherwise left
 * alone so a finished campaign keeps its history.
 */
async function applyAudiencePlan(
  crm: CrmWorkspace,
  campaign: MarketingCampaign,
): Promise<{ added: number; dropped: number; kept: number; targeted: number }> {
  const plan = planCampaignRecipients(crm, campaign);
  for (const row of plan.add) {
    await crm.repo.save("campaign_recipients", row);
  }
  for (const row of plan.drop) {
    // Someone who left the consented audience is not a recipient, so their row
    // goes; the exclusion reason is shown on the campaign screen.
    await crm.repo.remove("campaign_recipients", row.id);
  }
  const nextRows = [
    ...crm.recipients.filter((r) => r.campaign_id !== campaign.id),
    ...plan.keep,
    ...plan.add,
  ];
  const tallies = recountCampaign({ ...crm, recipients: nextRows }, campaign);
  await crm.repo.patch("marketing_campaigns", campaign.id, tallies);
  return {
    added: plan.add.length,
    dropped: plan.drop.length,
    kept: plan.keep.length,
    targeted: tallies.targeted_count,
  };
}

/** Store the tallies that follow from the recipient rows as they are now. */
async function recountOnly(
  crm: CrmWorkspace,
  campaign: MarketingCampaign,
): Promise<void> {
  const tallies = recountCampaign(crm, campaign);
  await crm.repo.patch("marketing_campaigns", campaign.id, tallies);
}

/**
 * Write one recipient and refresh its campaign's derived numbers in the same
 * call, so no outcome can be recorded without the counts moving with it.
 */
async function patchRecipient(
  crm: CrmWorkspace,
  recipient: CampaignRecipient,
  patch: Partial<CampaignRecipient>,
): Promise<CampaignRecipient | null> {
  const updated = await crm.repo.patch("campaign_recipients", recipient.id, patch);
  if (!updated) return null;
  const campaign = crm.campaigns.find((c) => c.id === recipient.campaign_id);
  if (campaign) {
    const nextRows = crm.recipients.map((r) => (r.id === recipient.id ? updated : r));
    const tallies = recountCampaign({ ...crm, recipients: nextRows }, campaign);
    await crm.repo.patch("marketing_campaigns", campaign.id, tallies);
  }
  return updated;
}

/** Furthest recorded stage — the status never walks backwards. */
function statusFor(recipient: CampaignRecipient, when: {
  marked_sent_at?: string | null;
  responded_at?: string | null;
  redeemed_at?: string | null;
}): RecipientStatus {
  const marked = when.marked_sent_at ?? recipient.marked_sent_at;
  const responded = when.responded_at ?? recipient.responded_at;
  const redeemed = when.redeemed_at ?? recipient.redeemed_at;
  if (redeemed) return "redeemed";
  if (responded) return "responded";
  if (marked) return "marked_sent";
  return "selected";
}

/** Consent is a hard gate, even on "record what happened" writes. */
function consentBlocker(crm: CrmWorkspace, customerId: string | null): string | null {
  if (!customerId) return "This recipient row has no customer behind it, so consent cannot be checked.";
  if (consentedCustomerIds(crm, [customerId]).length === 1) return null;
  const customer = crm.customers.find((c) => c.id === customerId);
  if (!customer) return "That customer is no longer in this brand's directory.";
  if (customer.status === "archived") return "That customer record is archived.";
  if (customer.opted_out_at)
    return `That customer opted out of marketing on ${customer.opted_out_at.slice(0, 10)}.`;
  if (customer.marketing_consent === "declined")
    return "That customer declined marketing consent.";
  return `Marketing consent for ${customer.name} has never been recorded — grant it on their profile first.`;
}

async function loadRecipient(
  id: string,
): Promise<
  | { ok: true; crm: CrmWorkspace; recipient: CampaignRecipient }
  | { ok: false; message: string }
> {
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };
  const recipient = await crm.repo.find("campaign_recipients", id);
  if (!recipient) return { ok: false, message: "Recipient not found." };
  return { ok: true, crm, recipient };
}

/* ------------------------------------------------------------------ */
/* Campaign create / update                                            */
/* ------------------------------------------------------------------ */

export async function saveCampaignAction(input: CampaignInput): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };
  const refs = crmRefs(crm);

  const name = text(input.name, "Campaign name", 120);
  if (!name.ok) return name;
  const description = optionalText(input.description, "Description", 500);
  if (!description.ok) return description;
  const type = oneOf(input.type, CAMPAIGN_TYPES, "Campaign type");
  if (!type.ok) return type;
  const channel = oneOf(input.channel, CAMPAIGN_CHANNELS, "Channel");
  if (!channel.ok) return channel;
  const status = oneOf(input.status, CAMPAIGN_STATUSES, "Status");
  if (!status.ok) return status;

  // Audiences and offers are references, never copies: the campaign points at
  // one existing segment and at most one existing offer.
  const segmentId = refId(input.segment_id, refs.segmentIds, "Segment");
  if (!segmentId.ok) return segmentId;
  const offerId = refId(input.offer_id, refs.offerIds, "Offer");
  if (!offerId.ok) return offerId;

  const start = day(input.start_date, "Start date");
  if (!start.ok) return start;
  const end = day(input.end_date, "End date", false);
  if (!end.ok) return end;
  if (end.value && end.value < start.value) {
    return { ok: false, message: "The end date cannot be before the start date." };
  }

  const id = crmRecordId(input.id, refs.campaignIds, "Campaign");
  if (!id.ok) return id;

  const row = {
    id: id.value,
    name: name.value,
    description: description.value || null,
    type: type.value,
    channel: channel.value,
    segment_id: segmentId.value,
    offer_id: offerId.value,
    status: status.value,
    start_date: start.value,
    end_date: end.value || null,
    // Recorded as intent. The audience itself is always consent-filtered, so
    // turning this off cannot put a non-consented person in the list.
    consent_only: flag(input.consent_only ?? true),
  };

  const existing = await crm.repo.find("marketing_campaigns", row.id);
  const saved = existing
    ? await crm.repo.patch("marketing_campaigns", row.id, row)
    : await crm.repo.save("marketing_campaigns", {
        ...row,
        brand_id: guard.brandId,
        // Never client-supplied: seeded at zero, then recounted from rows.
        targeted_count: 0,
        marked_sent_count: 0,
        response_count: 0,
        redemption_count: 0,
        revenue_attributed: 0,
      });
  if (!saved) return { ok: false, message: "Campaign not found." };

  const audienceChanged =
    !existing ||
    existing.segment_id !== saved.segment_id ||
    existing.consent_only !== saved.consent_only ||
    // A brand-new campaign has no rows yet, so it always needs building.
    !crm.recipients.some((r) => r.campaign_id === saved.id);

  let summary: string;
  if (audienceChanged) {
    const plan = await applyAudiencePlan(crm, saved);
    summary = `Audience rebuilt: ${plan.targeted} contactable in the list (${plan.added} added, ${plan.dropped} removed).`;
  } else {
    await recountOnly(crm, saved);
    summary = "Audience unchanged, so the recorded outcomes were kept as they were.";
  }

  await auditCrm(
    guard,
    existing ? "crm.campaign.updated" : "crm.campaign.created",
    "crm_campaign",
    saved.id,
    `${saved.name} — ${summary}`,
  );
  revalidateCrm();
  return { ok: true, message: `${existing ? "Campaign updated" : "Campaign created"}. ${summary}` };
}

/**
 * Re-derive the audience on demand — a dynamic segment may have moved since
 * the last save. Nothing else on the campaign changes.
 */
export async function rebuildCampaignAudienceAction(
  campaignId: string,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const campaign = await crm.repo.find("marketing_campaigns", campaignId);
  if (!campaign) return { ok: false, message: "Campaign not found." };

  const plan = await applyAudiencePlan(crm, campaign);
  await auditCrm(
    guard,
    "crm.campaign.audience_rebuilt",
    "crm_campaign",
    campaign.id,
    `${campaign.name} — ${plan.targeted} recipients, ${plan.added} added, ${plan.dropped} removed`,
  );
  revalidateCrm();
  return {
    ok: true,
    message: `Audience rebuilt: ${plan.targeted} in the list (${plan.added} added, ${plan.dropped} removed). Counts recounted from those rows.`,
  };
}

/* ------------------------------------------------------------------ */
/* Recording outcomes                                                  */
/* ------------------------------------------------------------------ */

export async function markRecipientSentAction(
  recipientId: string,
  note?: string | null,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const loaded = await loadRecipient(recipientId);
  if (!loaded.ok) return loaded;
  const { crm, recipient } = loaded;

  const blocker = consentBlocker(crm, recipient.customer_id);
  if (blocker) return { ok: false, message: `Not recorded. ${blocker}` };
  if (recipient.marked_sent_at) {
    return {
      ok: true,
      message: `Already recorded as sent on ${recipient.marked_sent_at.slice(0, 16)}. Nothing was rewritten.`,
    };
  }

  const extra = optionalText(note, "Note", 500);
  if (!extra.ok) return extra;
  const updated = await patchRecipient(crm, recipient, {
    marked_sent_at: crm.asOf,
    status: statusFor(recipient, { marked_sent_at: crm.asOf }),
    ...(extra.value ? { note: extra.value } : {}),
  });
  if (!updated) return { ok: false, message: "Recipient not found." };

  await auditCrm(
    guard,
    "crm.campaign.recipient_marked_sent",
    "crm_campaign_recipient",
    recipient.id,
    `campaign ${recipient.campaign_id} marked sent at ${crm.asOf}`,
  );
  revalidateCrm();
  return { ok: true, message: "Recorded as sent. OrderBook did not send anything — you told us it happened." };
}

export async function markRecipientRespondedAction(
  recipientId: string,
  note?: string | null,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const loaded = await loadRecipient(recipientId);
  if (!loaded.ok) return loaded;
  const { crm, recipient } = loaded;

  const blocker = consentBlocker(crm, recipient.customer_id);
  if (blocker) return { ok: false, message: `Not recorded. ${blocker}` };
  if (recipient.responded_at) {
    return {
      ok: true,
      message: `Already recorded as a response on ${recipient.responded_at.slice(0, 16)}. Nothing was rewritten.`,
    };
  }

  const extra = optionalText(note, "Note", 500);
  if (!extra.ok) return extra;
  const updated = await patchRecipient(crm, recipient, {
    responded_at: crm.asOf,
    status: statusFor(recipient, { responded_at: crm.asOf }),
    ...(extra.value ? { note: extra.value } : {}),
  });
  if (!updated) return { ok: false, message: "Recipient not found." };

  await auditCrm(
    guard,
    "crm.campaign.recipient_responded",
    "crm_campaign_recipient",
    recipient.id,
    `campaign ${recipient.campaign_id} responded at ${crm.asOf}`,
  );
  revalidateCrm();
  return { ok: true, message: "Response recorded and the campaign recounted." };
}

/**
 * Redemption is the one outcome that carries money, so the order it points at
 * is validated against this brand's real orders — and must be that customer's
 * own order. Revenue attributed is then whatever `recountCampaign` sums.
 */
export async function markRecipientRedeemedAction(
  recipientId: string,
  orderId?: string | null,
  note?: string | null,
): Promise<CrmActionState> {
  const guard = await guardCrm("manage");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };
  const refs = crmRefs(crm);

  const recipient = await crm.repo.find("campaign_recipients", recipientId);
  if (!recipient) return { ok: false, message: "Recipient not found." };

  // The order has to be real, this brand's, and this customer's — otherwise
  // `revenue_attributed` would be crediting someone else's money.
  const clean = refId(orderId, refs.orderIds, "Order");
  if (!clean.ok) return clean;
  const wantedOrderId = clean.value;
  if (wantedOrderId && recipient.customer_id) {
    const order = crm.orders.find((o) => o.id === wantedOrderId);
    if (order?.customer_id && order.customer_id !== recipient.customer_id) {
      return {
        ok: false,
        message: "That order belongs to a different customer, so it cannot carry this redemption.",
      };
    }
  }

  const blocker = consentBlocker(crm, recipient.customer_id);
  if (blocker) return { ok: false, message: `Not recorded. ${blocker}` };
  if (recipient.redeemed_at) {
    return {
      ok: true,
      message: `Already recorded as redeemed on ${recipient.redeemed_at.slice(0, 16)}. Nothing was rewritten.`,
    };
  }

  const extra = optionalText(note, "Note", 500);
  if (!extra.ok) return extra;
  const updated = await patchRecipient(crm, recipient, {
    redeemed_at: crm.asOf,
    order_id: clean.value,
    status: statusFor(recipient, { redeemed_at: crm.asOf }),
    ...(extra.value ? { note: extra.value } : {}),
  });
  if (!updated) return { ok: false, message: "Recipient not found." };

  await auditCrm(
    guard,
    "crm.campaign.recipient_redeemed",
    "crm_campaign_recipient",
    recipient.id,
    `campaign ${recipient.campaign_id} redeemed${clean.value ? ` on order ${clean.value}` : ""}`,
  );
  revalidateCrm();
  return {
    ok: true,
    message: clean.value
      ? "Redemption recorded against that order and the campaign recounted."
      : "Redemption recorded without an order, so no revenue was attributed.",
  };
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

/**
 * The bulk contact list for a campaign — consented recipients only. This is
 * the honest hand-off: export it, send it yourself, then come back and record
 * what happened.
 */
export async function exportCampaignAudienceCsvAction(
  campaignId: string,
): Promise<{ ok: true; csv: string; filename: string } | { ok: false; message: string }> {
  const guard = await guardCrm("log");
  if (!guard.ok) return guard;
  const crm = await loadCrmWorkspace();
  if (!crm) return { ok: false, message: "No workspace is connected." };

  const campaign = await crm.repo.find("marketing_campaigns", campaignId);
  if (!campaign) return { ok: false, message: "Campaign not found." };

  const rows = crm.recipients
    .filter((r) => r.campaign_id === campaignId)
    .filter((r) => consentedCustomerIds(crm, [r.customer_id ?? ""]).length === 1)
    .map((r) => {
      const customer = crm.customers.find((c) => c.id === r.customer_id);
      const order = r.order_id ? crm.orders.find((o) => o.id === r.order_id) : undefined;
      return {
        name: customer?.name ?? "",
        phone: customer?.phone ?? "",
        email: customer?.email ?? "",
        status: r.status,
        marked_sent_at: r.marked_sent_at ?? "",
        responded_at: r.responded_at ?? "",
        redeemed_at: r.redeemed_at ?? "",
        order_number: order?.order_number ?? "",
        note: r.note ?? "",
      };
    });
  return crmCsv(`crm-campaign-audience-${guard.brandCode}-${campaignId}.csv`, rows);
}
