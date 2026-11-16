/**
 * CRM entity types for the CSV-backed demo dataset (data/demo/<brand>/*.csv).
 *
 * Customers stay the single `Customer` row from `types/database.ts` — the CRM
 * enriches that record instead of duplicating it, so billing, orders and the
 * customer 360 all read the same id.
 */

export const INTERACTION_TYPES = [
  "call",
  "whatsapp",
  "email",
  "meeting",
  "store_visit",
  "appointment",
  "note",
  "complaint",
  "follow_up",
] as const;

export type InteractionType = (typeof INTERACTION_TYPES)[number];

export const INTERACTION_TYPE_LABELS: Record<InteractionType, string> = {
  call: "Phone call",
  whatsapp: "WhatsApp",
  email: "Email",
  meeting: "Meeting",
  store_visit: "Store visit",
  appointment: "Appointment",
  note: "Internal note",
  complaint: "Complaint",
  follow_up: "Follow-up",
};

/**
 * A logged touchpoint. Exactly one of `customer_id` / `lead_id` is set in
 * practice: leads that convert keep their history on the lead row.
 */
export type CustomerInteraction = {
  id: string;
  brand_id: string;
  customer_id: string | null;
  lead_id: string | null;
  type: InteractionType;
  summary: string;
  detail: string | null;
  occurred_at: string;
  staff_id: string | null;
  outcome: string | null;
  next_follow_up_at: string | null;
  /** Follow-up handed to the Productivity Manager as a task, once created. */
  task_id: string | null;
  attachment_url: string | null;
};

export const REVIEW_STATUSES = [
  "new",
  "acknowledged",
  "escalated",
  "closed",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_SOURCES = [
  "Google Business Profile",
  "Zomato",
  "Instagram",
  "WhatsApp",
  "In-store card",
  "Walk-in feedback",
] as const;

export const REVIEW_SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type ReviewSentiment = (typeof REVIEW_SENTIMENTS)[number];

/**
 * `sentiment` is written by the deterministic lexicon scorer in
 * `lib/crm/reviews.ts`, never by a model — the record keeps a stable answer
 * that OrderBook AI can later be measured against.
 */
export type CustomerReview = {
  id: string;
  brand_id: string;
  customer_id: string | null;
  source: string;
  rating: number;
  text: string;
  reviewed_at: string;
  response_text: string | null;
  responded_at: string | null;
  sentiment: ReviewSentiment;
  tags: string[];
  /** Staff name the reviewer called out, praised or blamed. */
  staff_mentioned: string | null;
  internal_notes: string | null;
  status: ReviewStatus;
  complaint_id: string | null;
};

export const COMPLAINT_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "closed",
] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export const COMPLAINT_SEVERITIES = ["low", "medium", "high"] as const;
export type ComplaintSeverity = (typeof COMPLAINT_SEVERITIES)[number];

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

export type CustomerComplaint = {
  id: string;
  brand_id: string;
  customer_id: string | null;
  review_id: string | null;
  interaction_id: string | null;
  subject: string;
  detail: string | null;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  owner_staff_id: string | null;
  raised_at: string;
  resolved_at: string | null;
};

/**
 * Filter conditions a dynamic segment stores so membership is recomputed from
 * live customer and transaction data instead of a hand-maintained list.
 */
export type SegmentRules = {
  minOrders?: number;
  maxOrders?: number;
  minSpend?: number;
  maxSpend?: number;
  /** No purchase within this many days. */
  inactiveDays?: number;
  /** At least one purchase within this many days. */
  activeWithinDays?: number;
  /** First purchase within this many days. */
  joinedWithinDays?: number;
  tags?: string[];
  source?: string;
  priceTier?: "retail" | "wholesale";
  minRating?: number;
  maxRating?: number;
  hasOpenComplaints?: boolean;
  hasOutstandingDues?: boolean;
  minLoyaltyPoints?: number;
  loyaltyTier?: string;
};

export const SEGMENT_RULE_FIELDS = [
  "minOrders",
  "maxOrders",
  "minSpend",
  "maxSpend",
  "inactiveDays",
  "activeWithinDays",
  "joinedWithinDays",
  "tags",
  "source",
  "priceTier",
  "minRating",
  "maxRating",
  "hasOpenComplaints",
  "hasOutstandingDues",
  "minLoyaltyPoints",
  "loyaltyTier",
] as const satisfies readonly (keyof SegmentRules)[];

export type CustomerSegment = {
  id: string;
  brand_id: string;
  name: string;
  description: string;
  kind: "dynamic" | "manual";
  rules: SegmentRules | null;
  /** Populated for `manual` segments only. */
  member_ids: string[];
  created_at: string;
};

export const CAMPAIGN_CHANNELS = [
  "whatsapp",
  "email",
  "sms",
  "in_store",
] as const;

export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const CAMPAIGN_CHANNEL_LABELS: Record<CampaignChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
  in_store: "In-store",
};

export const CAMPAIGN_STATUSES = [
  "draft",
  "scheduled",
  "active",
  "paused",
  "completed",
  "cancelled",
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_TYPES = [
  "offer",
  "winback",
  "retention",
  "reputation",
  "new_business",
  "birthday",
  "event_invite",
  "loyalty_promo",
] as const;

export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

/**
 * The demo has no messaging provider wired up, so `delivery` records how the
 * counters were produced: `manual_log` means a human typed the numbers they
 * observed, and nothing in the app claims a message was sent.
 */
export const CAMPAIGN_DELIVERY_STATES = ["not_connected", "manual_log"] as const;
export type CampaignDeliveryState = (typeof CAMPAIGN_DELIVERY_STATES)[number];

export type MarketingCampaign = {
  id: string;
  brand_id: string;
  name: string;
  description: string;
  type: CampaignType;
  channel: CampaignChannel;
  segment_id: string | null;
  offer_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: CampaignStatus;
  /** Only consented, non-opted-out customers join the recipient list. */
  consent_required: boolean;
  messages_sent: number;
  delivered: number;
  responded: number;
  redeemed: number;
  revenue_attributed: number;
  delivery: CampaignDeliveryState;
  created_at: string;
  updated_at: string;
};

export type LoyaltyTier = {
  id: string;
  name: string;
  /** Lifetime spend that unlocks the tier, in whole currency units. */
  min_spend: number;
  discount_percent: number;
};

/**
 * Every rule is data, not code: a café earns per rupee spent and expires
 * yearly, a furniture studio can earn per order and never expire.
 */
export const LOYALTY_EARN_MODES = ["per_amount", "per_order"] as const;
export type LoyaltyEarnMode = (typeof LOYALTY_EARN_MODES)[number];

export type LoyaltyRules = {
  brand_id: string;
  earn_mode: LoyaltyEarnMode;
  /** Currency spent per point when `earn_mode` is `per_amount`. */
  earn_amount_per_point: number;
  /** Points granted per order when `earn_mode` is `per_order`. */
  earn_points_per_order: number;
  /** Currency value of one point at redemption. */
  point_value: number;
  /** Blank means points never expire. */
  expiry_days: number | null;
  redemption_enabled: boolean;
  tiers: LoyaltyTier[];
};

export const LOYALTY_ENTRY_KINDS = [
  "earn",
  "redeem",
  "adjust",
  "expire",
  "bonus",
] as const;

export type LoyaltyEntryKind = (typeof LOYALTY_ENTRY_KINDS)[number];

/** `points` is signed: redemptions and expiries carry negative values. */
export type LoyaltyEntry = {
  id: string;
  brand_id: string;
  customer_id: string;
  kind: LoyaltyEntryKind;
  points: number;
  reason: string;
  order_id: string | null;
  expires_at: string | null;
  created_at: string;
};

export const MEMBERSHIP_STATUSES = ["active", "expired", "cancelled"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export type Membership = {
  id: string;
  brand_id: string;
  customer_id: string;
  tier_id: string;
  started_at: string;
  expires_at: string | null;
  status: MembershipStatus;
  notes: string | null;
};
