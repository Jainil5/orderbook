import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  type CampaignChannel,
  type CampaignStatus,
  type CampaignType,
  type MarketingCampaign,
} from "@/types/crm";
import type { CustomerProfile } from "./metrics";
import { segmentMemberIds, isUsableRules } from "./segments";
import type { CustomerSegment } from "@/types/crm";

/**
 * Campaigns decide *who should be contacted*; nothing here pretends a message
 * left the building. Delivery counters are either zero (`not_connected`) or a
 * human's observation (`manual_log`), and the UI says which.
 */

export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  offer: "Offer",
  winback: "Win-back",
  retention: "Retention",
  reputation: "Reputation",
  new_business: "New business",
  birthday: "Birthday",
  event_invite: "Event invite",
  loyalty_promo: "Loyalty promo",
};

export type EligibleAudience = {
  /** Everyone the campaign may legally and sensibly reach. */
  recipients: CustomerProfile[];
  excluded: { profile: CustomerProfile; reason: string }[];
};

/**
 * Consent is evaluated per channel: marketing consent is required for the
 * outbound channels, an in-store conversation is not a broadcast. An explicit
 * opt-out always wins, and an archived customer is never contacted.
 */
export function audienceForSegment(
  segment: CustomerSegment | null,
  profiles: CustomerProfile[],
  options: { consentRequired: boolean; channel: CampaignChannel },
): EligibleAudience {
  const outbound = options.channel !== "in_store";
  const memberIds =
    segment === null
      ? null
      : segment.kind === "dynamic" && segment.rules && isUsableRules(segment.rules)
        ? new Set(segmentMemberIds(segment.rules, profiles))
        : new Set(segment.member_ids);

  const recipients: CustomerProfile[] = [];
  const excluded: EligibleAudience["excluded"] = [];
  for (const profile of profiles) {
    if (memberIds && !memberIds.has(profile.customer.id)) continue;
    if (profile.status === "archived") {
      excluded.push({ profile, reason: "Archived" });
      continue;
    }
    if (profile.customer.opted_out) {
      excluded.push({ profile, reason: "Opted out" });
      continue;
    }
    if (options.consentRequired && outbound && !profile.customer.marketing_consent) {
      excluded.push({ profile, reason: "No marketing consent" });
      continue;
    }
    if (outbound && options.channel === "email" && !profile.customer.email) {
      excluded.push({ profile, reason: "No email on file" });
      continue;
    }
    if (outbound && (options.channel === "sms" || options.channel === "whatsapp") && !profile.customer.phone) {
      excluded.push({ profile, reason: "No phone on file" });
      continue;
    }
    recipients.push(profile);
  }
  return { recipients, excluded };
}

export type CampaignMetrics = {
  reach: number;
  deliveredRate: number | null;
  responseRate: number | null;
  redemptionRate: number | null;
  revenuePerMessage: number | null;
  /** Nothing in this build can send, so the UI must not imply otherwise. */
  canReportDelivery: boolean;
};

export function campaignMetrics(campaign: MarketingCampaign): CampaignMetrics {
  const sent = campaign.messages_sent;
  const rate = (numerator: number) =>
    sent > 0 ? Math.round((numerator / sent) * 1000) / 10 : null;
  return {
    reach: sent,
    deliveredRate: rate(campaign.delivered),
    responseRate: rate(campaign.responded),
    redemptionRate: rate(campaign.redeemed),
    revenuePerMessage: sent > 0 ? Math.round(campaign.revenue_attributed / sent) : null,
    canReportDelivery: campaign.delivery === "manual_log",
  };
}

export type CampaignInput = {
  name: string;
  description: string;
  type: string;
  channel: string;
  segment_id: string;
  offer_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  consent_required: string;
};

export const EMPTY_CAMPAIGN_INPUT: CampaignInput = {
  name: "",
  description: "",
  type: "offer",
  channel: "whatsapp",
  segment_id: "",
  offer_id: "",
  starts_at: "",
  ends_at: "",
  status: "draft",
  consent_required: "yes",
};

export type CampaignValues = {
  name: string;
  description: string;
  type: CampaignType;
  channel: CampaignChannel;
  segment_id: string | null;
  offer_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: CampaignStatus;
  consent_required: boolean;
};

/**
 * `<input type="date">` yields `YYYY-MM-DD`, which JS would otherwise read as
 * UTC midnight and put a Diwali drop a half day early in IST.
 */
function toStartIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (day) {
    return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])).toISOString();
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function validateCampaignInput(
  input: CampaignInput,
  known: { segmentIds: string[]; offerIds: string[] },
): { ok: true; value: CampaignValues } | { ok: false; message: string } {
  const name = input.name.trim().slice(0, 120);
  if (!name) return { ok: false, message: "Give the campaign a name." };
  if (!CAMPAIGN_TYPES.includes(input.type as CampaignType)) {
    return { ok: false, message: "Pick what the campaign is for." };
  }
  if (!CAMPAIGN_CHANNELS.includes(input.channel as CampaignChannel)) {
    return { ok: false, message: "Pick how you intend to reach people." };
  }
  if (!CAMPAIGN_STATUSES.includes(input.status as CampaignStatus)) {
    return { ok: false, message: "Pick a campaign status." };
  }
  if (input.segment_id && !known.segmentIds.includes(input.segment_id)) {
    return { ok: false, message: "Pick a saved segment, or leave it on everyone." };
  }
  if (input.offer_id && !known.offerIds.includes(input.offer_id)) {
    return { ok: false, message: "Pick an offer from the Offers list." };
  }

  const startsAt = toStartIso(input.starts_at);
  const endsAt = toStartIso(input.ends_at);
  if (input.starts_at.trim() && startsAt === null) {
    return { ok: false, message: "Enter a valid start date." };
  }
  if (input.ends_at.trim() && endsAt === null) {
    return { ok: false, message: "Enter a valid end date." };
  }
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) {
    return { ok: false, message: "The campaign cannot end before it starts." };
  }

  return {
    ok: true,
    value: {
      name,
      description: input.description.trim().slice(0, 500),
      type: input.type as CampaignType,
      channel: input.channel as CampaignChannel,
      segment_id: input.segment_id || null,
      offer_id: input.offer_id || null,
      starts_at: startsAt,
      ends_at: endsAt,
      status: input.status as CampaignStatus,
      consent_required: input.consent_required !== "no",
    },
  };
}

export type ResultInput = {
  messages_sent: string;
  delivered: string;
  responded: string;
  redeemed: string;
  revenue_attributed: string;
};

export const EMPTY_RESULT_INPUT: ResultInput = {
  messages_sent: "",
  delivered: "",
  responded: "",
  redeemed: "",
  revenue_attributed: "",
};

export type ResultValues = {
  messages_sent: number;
  delivered: number;
  responded: number;
  redeemed: number;
  revenue_attributed: number;
  delivery: "manual_log";
};

/**
 * Logging observed results is allowed; the numbers are the shopkeeper's own
 * record. They are checked against each other so a typo cannot invent a
 * conversion rate above 100%.
 */
export function validateResultInput(
  input: ResultInput,
  audienceSize: number,
): { ok: true; value: ResultValues } | { ok: false; message: string } {
  type Read = { value: number } | { error: string };
  const read = (value: string, label: string, max?: number): Read => {
    const trimmed = value.trim().replace(/[,\s]/g, "");
    if (!trimmed) return { value: 0 };
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 0) {
      return { error: `${label} has to be a whole number.` };
    }
    const rounded = Math.round(n);
    if (max !== undefined && rounded > max) {
      return { error: `${label} cannot be more than ${max}` };
    }
    return { value: rounded };
  };

  const readings: Read[] = [
    read(input.messages_sent, "Messages sent", Math.max(audienceSize, 0)),
    read(input.delivered, "Delivered"),
    read(input.responded, "Responded"),
    read(input.redeemed, "Redeemed"),
    read(input.revenue_attributed, "Revenue"),
  ];
  for (const reading of readings) {
    if ("error" in reading) return { ok: false, message: reading.error };
  }
  const [messages_sent, delivered, responded, redeemed, revenue_attributed] = readings.map(
    (reading) => (reading as { value: number }).value,
  );
  if (delivered > messages_sent) {
    return { ok: false, message: "Delivered cannot exceed the number you sent." };
  }
  if (responded > messages_sent) {
    return { ok: false, message: "Responses cannot exceed the number you sent." };
  }
  if (redeemed > responded) {
    return { ok: false, message: "Redemptions cannot exceed the responses." };
  }
  return {
    ok: true,
    value: {
      messages_sent,
      delivered,
      responded,
      redeemed,
      revenue_attributed,
      delivery: "manual_log",
    },
  };
}

export function isCampaignLive(campaign: MarketingCampaign, now: Date): boolean {
  if (campaign.status !== "active") return false;
  const ms = now.getTime();
  if (campaign.starts_at && new Date(campaign.starts_at).getTime() > ms) return false;
  if (campaign.ends_at && new Date(campaign.ends_at).getTime() < ms) return false;
  return true;
}
