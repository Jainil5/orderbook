/**
 * Row mappers for the CRM tables in `data/demo/<brand>/*.csv`.
 *
 * Kept apart from `mappers.ts` so the CRM stays a self-contained module: adding
 * a CRM column touches this file and the CRM packs, nothing in billing.
 */

import type {
  CampaignChannel,
  CampaignDeliveryState,
  CampaignStatus,
  CampaignType,
  CustomerComplaint,
  CustomerInteraction,
  CustomerReview,
  CustomerSegment,
  InteractionType,
  LoyaltyEntry,
  LoyaltyEntryKind,
  LoyaltyRules,
  LoyaltyTier,
  MarketingCampaign,
  Membership,
  ReviewSentiment,
  ReviewStatus,
  SegmentRules,
} from "@/types/crm";
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_DELIVERY_STATES,
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  COMPLAINT_SEVERITIES,
  COMPLAINT_STATUSES,
  INTERACTION_TYPES,
  LOYALTY_EARN_MODES,
  LOYALTY_ENTRY_KINDS,
  MEMBERSHIP_STATUSES,
  REVIEW_SENTIMENTS,
  REVIEW_STATUSES,
} from "@/types/crm";
import {
  bool,
  json,
  num,
  pipeList,
  reqNum,
  reqStr,
  str,
  type CsvRow,
} from "./parse-csv";

function oneOf<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
  source: string,
): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`Invalid ${field} "${value}" in ${source}`);
  }
  return value as T;
}

export function mapInteraction(r: CsvRow, source: string): CustomerInteraction {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    customer_id: str(r.customer_id),
    lead_id: str(r.lead_id),
    type: oneOf<InteractionType>(
      reqStr(r.type, "type", source),
      INTERACTION_TYPES,
      "interaction type",
      source,
    ),
    summary: reqStr(r.summary, "summary", source),
    detail: str(r.detail),
    occurred_at: reqStr(r.occurred_at, "occurred_at", source),
    staff_id: str(r.staff_id),
    outcome: str(r.outcome),
    next_follow_up_at: str(r.next_follow_up_at),
    task_id: str(r.task_id),
    attachment_url: str(r.attachment_url),
  };
}

export function mapReview(r: CsvRow, source: string): CustomerReview {
  const rating = reqNum(r.rating, "rating", source);
  if (rating < 1 || rating > 5) {
    throw new Error(`Review rating out of 1-5 range in ${source}: ${rating}`);
  }
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    customer_id: str(r.customer_id),
    source: reqStr(r.source, "source", source),
    rating,
    text: reqStr(r.text, "text", source),
    reviewed_at: reqStr(r.reviewed_at, "reviewed_at", source),
    response_text: str(r.response_text),
    responded_at: str(r.responded_at),
    sentiment: oneOf<ReviewSentiment>(
      reqStr(r.sentiment, "sentiment", source),
      REVIEW_SENTIMENTS,
      "review sentiment",
      source,
    ),
    tags: pipeList(r.tags),
    staff_mentioned: str(r.staff_mentioned),
    internal_notes: str(r.internal_notes),
    status: oneOf<ReviewStatus>(
      reqStr(r.status, "status", source),
      REVIEW_STATUSES,
      "review status",
      source,
    ),
    complaint_id: str(r.complaint_id),
  };
}

export function mapComplaint(r: CsvRow, source: string): CustomerComplaint {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    customer_id: str(r.customer_id),
    review_id: str(r.review_id),
    interaction_id: str(r.interaction_id),
    subject: reqStr(r.subject, "subject", source),
    detail: str(r.detail),
    severity: oneOf(
      reqStr(r.severity, "severity", source),
      COMPLAINT_SEVERITIES,
      "complaint severity",
      source,
    ),
    status: oneOf(
      reqStr(r.status, "status", source),
      COMPLAINT_STATUSES,
      "complaint status",
      source,
    ),
    owner_staff_id: str(r.owner_staff_id),
    raised_at: reqStr(r.raised_at, "raised_at", source),
    resolved_at: str(r.resolved_at),
  };
}

export function mapSegment(r: CsvRow, source: string): CustomerSegment {
  const kind = oneOf(r.kind ?? "dynamic", ["dynamic", "manual"] as const, "segment kind", source);
  const rules = kind === "dynamic" ? json<SegmentRules>(r.rules_json) : null;
  if (kind === "dynamic" && !rules) {
    throw new Error(`Dynamic segment needs rules_json in ${source}`);
  }
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    name: reqStr(r.name, "name", source),
    description: r.description ?? "",
    kind,
    rules,
    member_ids: pipeList(r.member_ids),
    created_at: reqStr(r.created_at, "created_at", source),
  };
}

export function mapCampaign(r: CsvRow, source: string): MarketingCampaign {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    name: reqStr(r.name, "name", source),
    description: r.description ?? "",
    type: oneOf<CampaignType>(
      reqStr(r.type, "type", source),
      CAMPAIGN_TYPES,
      "campaign type",
      source,
    ),
    channel: oneOf<CampaignChannel>(
      reqStr(r.channel, "channel", source),
      CAMPAIGN_CHANNELS,
      "campaign channel",
      source,
    ),
    segment_id: str(r.segment_id),
    offer_id: str(r.offer_id),
    starts_at: str(r.starts_at),
    ends_at: str(r.ends_at),
    status: oneOf<CampaignStatus>(
      reqStr(r.status, "status", source),
      CAMPAIGN_STATUSES,
      "campaign status",
      source,
    ),
    consent_required: r.consent_required === "" ? true : bool(r.consent_required),
    messages_sent: num(r.messages_sent, "messages_sent", source) ?? 0,
    delivered: num(r.delivered, "delivered", source) ?? 0,
    responded: num(r.responded, "responded", source) ?? 0,
    redeemed: num(r.redeemed, "redeemed", source) ?? 0,
    revenue_attributed: num(r.revenue_attributed, "revenue_attributed", source) ?? 0,
    delivery: oneOf<CampaignDeliveryState>(
      r.delivery ?? "not_connected",
      CAMPAIGN_DELIVERY_STATES,
      "campaign delivery state",
      source,
    ),
    created_at: reqStr(r.created_at, "created_at", source),
    updated_at: reqStr(r.updated_at, "updated_at", source),
  };
}

function mapLoyaltyTier(row: unknown, source: string): LoyaltyTier {
  const t = row as Partial<LoyaltyTier>;
  if (!t?.id || !t?.name || typeof t.min_spend !== "number") {
    throw new Error(`Malformed loyalty tier in ${source}`);
  }
  return {
    id: t.id,
    name: t.name,
    min_spend: t.min_spend,
    discount_percent: t.discount_percent ?? 0,
  };
}

export function mapLoyaltyRules(r: CsvRow, source: string): LoyaltyRules {
  const earnMode = oneOf(
    reqStr(r.earn_mode, "earn_mode", source),
    LOYALTY_EARN_MODES,
    "loyalty earn mode",
    source,
  );
  const tiers = json<unknown[]>(r.tiers_json) ?? [];
  return {
    brand_id: reqStr(r.brand_id, "brand_id", source),
    earn_mode: earnMode,
    earn_amount_per_point: num(r.earn_amount_per_point, "earn_amount_per_point", source) ?? 0,
    earn_points_per_order: num(r.earn_points_per_order, "earn_points_per_order", source) ?? 0,
    point_value: reqNum(r.point_value, "point_value", source),
    expiry_days: num(r.expiry_days, "expiry_days", source),
    redemption_enabled: r.redemption_enabled === "" ? true : bool(r.redemption_enabled),
    tiers: tiers.map((t) => mapLoyaltyTier(t, source)),
  };
}

export function mapLoyaltyEntry(r: CsvRow, source: string): LoyaltyEntry {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    customer_id: reqStr(r.customer_id, "customer_id", source),
    kind: oneOf<LoyaltyEntryKind>(
      reqStr(r.kind, "kind", source),
      LOYALTY_ENTRY_KINDS,
      "loyalty entry kind",
      source,
    ),
    points: reqNum(r.points, "points", source),
    reason: r.reason ?? "",
    order_id: str(r.order_id),
    expires_at: str(r.expires_at),
    created_at: reqStr(r.created_at, "created_at", source),
  };
}

export function mapMembership(r: CsvRow, source: string): Membership {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    customer_id: reqStr(r.customer_id, "customer_id", source),
    tier_id: reqStr(r.tier_id, "tier_id", source),
    started_at: reqStr(r.started_at, "started_at", source),
    expires_at: str(r.expires_at),
    status: oneOf(
      reqStr(r.status, "status", source),
      MEMBERSHIP_STATUSES,
      "membership status",
      source,
    ),
    notes: str(r.notes),
  };
}
