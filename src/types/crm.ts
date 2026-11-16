/**
 * CRM entity types — the single vocabulary for the whole CRM module.
 *
 * Column names here map 1:1 to `data/*.csv` (src/lib/csv/schema.ts) and to the
 * Supabase tables documented in supabase/migrations/0002_crm.sql, so the CSV
 * repository (current deployment mode) and the dormant Supabase repository
 * speak exactly the same shape. Every business-owned record carries `brand_id`
 * as its tenancy key; order/payment/billing truth stays in the existing
 * entities — the CRM references them by id and never copies their money data.
 */

/* ------------------------------------------------------------------ */
/* Leads                                                               */
/* ------------------------------------------------------------------ */

/**
 * Stage vocabulary the business asked for (New, Site Visit, Quote Sent,
 * Negotiating, Won, Lost). OrderBook had no pipeline board before the CRM,
 * so these labels are the ones the CRM introduces — quoted from the spec's
 * existing Manager leads, which turn out not to exist in this repo.
 */
export type LeadStage =
  | "new"
  | "site_visit"
  | "quote_sent"
  | "negotiating"
  | "won"
  | "lost";

export const LEAD_STAGES: LeadStage[] = [
  "new",
  "site_visit",
  "quote_sent",
  "negotiating",
  "won",
  "lost",
];

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  site_visit: "Site Visit",
  quote_sent: "Quote Sent",
  negotiating: "Negotiating",
  won: "Won",
  lost: "Lost",
};

export type Lead = {
  id: string;
  brand_id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  /** Free-text origin: walk-in, referral, Instagram, site enquiry… */
  source: string | null;
  stage: LeadStage;
  estimated_value: number;
  assigned_staff_id: string | null;
  /** ISO date the next follow-up is due (drives reminders). */
  next_follow_up_at: string | null;
  notes: string | null;
  lost_reason: string | null;
  /** Set on conversion — links to the resulting customer, never duplicates. */
  customer_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------------ */
/* Interactions                                                        */
/* ------------------------------------------------------------------ */

export type InteractionType =
  | "call"
  | "whatsapp"
  | "email"
  | "meeting"
  | "store_visit"
  | "appointment"
  | "note"
  | "complaint"
  | "follow_up";

export const INTERACTION_TYPES: InteractionType[] = [
  "call",
  "whatsapp",
  "email",
  "meeting",
  "store_visit",
  "appointment",
  "note",
  "complaint",
  "follow_up",
];

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

export type Interaction = {
  id: string;
  brand_id: string;
  customer_id: string | null;
  lead_id: string | null;
  type: InteractionType;
  subject: string | null;
  description: string;
  occurred_at: string;
  staff_id: string | null;
  /** Outcome in the owner's words: "callback agreed", "resolved"… */
  outcome: string | null;
  next_follow_up_at: string | null;
  /** [{ name, href }] — app-level attachment records (uploaded later). */
  attachments: { name: string; href: string }[] | null;
  /** Productivity Manager task id when a follow-up became a task. */
  task_id: string | null;
  created_at: string;
};

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

export type ReviewSource =
  | "in_store"
  | "whatsapp"
  | "email"
  | "phone"
  | "google"
  | "other";

export const REVIEW_SOURCES: ReviewSource[] = [
  "in_store",
  "whatsapp",
  "email",
  "phone",
  "google",
  "other",
];

/** Display wording for the stored source values. */
export const REVIEW_SOURCE_LABELS: Record<ReviewSource, string> = {
  in_store: "In store",
  whatsapp: "WhatsApp",
  email: "Email",
  phone: "Phone",
  google: "Google",
  other: "Other",
};

export type ReviewSentiment = "positive" | "neutral" | "negative";
export const REVIEW_SENTIMENTS: ReviewSentiment[] = [
  "positive",
  "neutral",
  "negative",
];
export type ReviewResponseStatus = "unanswered" | "answered" | "escalated";

export type Review = {
  id: string;
  brand_id: string;
  source: ReviewSource;
  /** 1–5 stars. */
  rating: number;
  text: string;
  reviewer_name: string | null;
  /** Linked when identifiable; reviews may be anonymous. */
  customer_id: string | null;
  review_date: string;
  sentiment: ReviewSentiment | null;
  tags: string[];
  response_status: ReviewResponseStatus;
  response_text: string | null;
  responded_at: string | null;
  internal_notes: string | null;
  /** Staff the review mentions (feedback attribution). */
  staff_mentioned: string | null;
  /** Set when the review was escalated into a complaint. */
  complaint_id: string | null;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------------ */
/* Complaints                                                          */
/* ------------------------------------------------------------------ */

export type ComplaintSeverity = "low" | "medium" | "high";
export const COMPLAINT_SEVERITIES: ComplaintSeverity[] = ["low", "medium", "high"];
export const COMPLAINT_SEVERITY_LABELS: Record<ComplaintSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};
export type ComplaintStatus = "open" | "in_progress" | "resolved" | "closed";
export const COMPLAINT_STATUSES: ComplaintStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];
export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

export type Complaint = {
  id: string;
  brand_id: string;
  customer_id: string | null;
  lead_id: string | null;
  review_id: string | null;
  interaction_id: string | null;
  subject: string;
  description: string | null;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  assigned_staff_id: string | null;
  resolution_notes: string | null;
  opened_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------------ */
/* Segments                                                            */
/* ------------------------------------------------------------------ */

/**
 * A segment is a saved filter (dynamic) or a hand-picked list (manual).
 * Dynamic membership is always re-computed from real customer/order/review
 * data — never a duplicated list.
 */
export type SegmentRules = {
  minOrders?: number | null;
  maxOrders?: number | null;
  minTotalSpend?: number | null;
  maxTotalSpend?: number | null;
  /** Qualify when last purchase is within N days of `asOf`. */
  lastPurchaseWithinDays?: number | null;
  /** Qualify when last purchase is older than N days (or never). */
  lastPurchaseOverDays?: number | null;
  tagsAny?: string[] | null;
  sourcesAny?: string[] | null;
  priceTiersAny?: ("retail" | "wholesale")[] | null;
  hasOutstandingDues?: boolean | null;
  hasUnresolvedComplaints?: boolean | null;
  minAverageReviewRating?: number | null;
  loyaltyTiersAny?: string[] | null;
  membershipPlansAny?: string[] | null;
};

export type CustomerSegment = {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  kind: "dynamic" | "manual";
  rules: SegmentRules;
  /** Only used when kind === "manual". */
  manual_customer_ids: string[];
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

export type CampaignType =
  | "offer"
  | "announcement"
  | "reminder"
  | "winback"
  | "loyalty";

export type CampaignChannel = "whatsapp" | "email" | "sms" | "in_store";

/**
 * Honesty rule: nothing is "sent" by the app. `marked_sent` is only ever set
 * by the owner recording a real delivery (bulk list export → provider, or a
 * future official integration). Counts are tallies of recorded states.
 */
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "active"
  | "completed"
  | "cancelled";

export type MarketingCampaign = {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  type: CampaignType;
  channel: CampaignChannel;
  segment_id: string | null;
  offer_id: string | null;
  status: CampaignStatus;
  start_date: string;
  end_date: string | null;
  /** Only customers with granted marketing consent are ever selected. */
  consent_only: boolean;
  targeted_count: number;
  marked_sent_count: number;
  response_count: number;
  redemption_count: number;
  revenue_attributed: number;
  created_at: string;
  updated_at: string;
};

export type RecipientStatus =
  | "selected"
  | "marked_sent"
  | "responded"
  | "redeemed"
  | "opted_out";

/* Campaign vocabulary — one set of values and words for every screen and
   action. Stored as enum values; labels are display-only. Chip tones stay in
   the components layer (`components/crm/campaigns/campaign-options.ts`). */

export const CAMPAIGN_TYPES: CampaignType[] = [
  "offer",
  "announcement",
  "reminder",
  "winback",
  "loyalty",
];
export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  offer: "Offer",
  announcement: "Announcement",
  reminder: "Reminder",
  winback: "Win-back",
  loyalty: "Loyalty",
};

export const CAMPAIGN_CHANNELS: CampaignChannel[] = [
  "whatsapp",
  "email",
  "sms",
  "in_store",
];
export const CAMPAIGN_CHANNEL_LABELS: Record<CampaignChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  sms: "SMS",
  in_store: "In store",
};

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "draft",
  "scheduled",
  "active",
  "completed",
  "cancelled",
];
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const RECIPIENT_STATUSES: RecipientStatus[] = [
  "selected",
  "marked_sent",
  "responded",
  "redeemed",
  "opted_out",
];
export const RECIPIENT_STATUS_LABELS: Record<RecipientStatus, string> = {
  selected: "Selected",
  marked_sent: "Marked sent",
  responded: "Responded",
  redeemed: "Redeemed",
  opted_out: "Opted out",
};

export type CampaignRecipient = {
  id: string;
  brand_id: string;
  campaign_id: string;
  customer_id: string | null;
  lead_id: string | null;
  status: RecipientStatus;
  marked_sent_at: string | null;
  responded_at: string | null;
  redeemed_at: string | null;
  /** Order that carried the campaign's offer code (attribution). */
  order_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------------ */
/* Loyalty & memberships                                               */
/* ------------------------------------------------------------------ */

/**
 * Configurable — no loyalty model is hardcoded. One JSON per brand,
 * stored in crm_settings.loyalty.
 */
export type LoyaltyTier = {
  name: string;
  /** Lifetime points needed to reach this tier. */
  min_lifetime_points: number;
  /** Optional percent benefit attached to the tier (display + future use). */
  discount_percent: number | null;
};

export type LoyaltyConfig = {
  enabled: boolean;
  /** Points earned per 1 unit of order grand total (e.g. 0.25 = 1 pt / ₹4). */
  earn_points_per_unit: number;
  /** Currency value of one point when redeeming (e.g. 0.5). */
  redeem_value_per_point: number;
  /** Rounded down to whole points. */
  points: "floor";
  /** null = points never expire; else days after which earned points lapse. */
  expiry_days: number | null;
  tiers: LoyaltyTier[];
};

export type LoyaltyAccount = {
  id: string;
  brand_id: string;
  customer_id: string;
  points_balance: number;
  lifetime_points: number;
  tier: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LoyaltyTxKind = "earn" | "redeem" | "expire" | "adjust" | "bonus";

export type LoyaltyTransaction = {
  id: string;
  brand_id: string;
  account_id: string;
  customer_id: string;
  kind: LoyaltyTxKind;
  /** Signed: earn/bonus positive, redeem/expire negative. */
  points: number;
  balance_after: number;
  reason: string | null;
  order_id: string | null;
  expires_at: string | null;
  created_at: string;
};

export type MembershipStatus = "active" | "paused" | "expired" | "cancelled";
export const MEMBERSHIP_STATUSES: MembershipStatus[] = [
  "active",
  "paused",
  "expired",
  "cancelled",
];
export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  active: "Active",
  paused: "Paused",
  expired: "Expired",
  cancelled: "Cancelled",
};

export type Membership = {
  id: string;
  brand_id: string;
  customer_id: string;
  /** Business-defined plan name ("Design Club", "Gold Table"…). */
  plan: string;
  status: MembershipStatus;
  started_at: string;
  ends_at: string | null;
  auto_renew: boolean;
  /** Free-form benefit list for display. */
  benefits: string[];
  price: number;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export type CrmSettings = {
  id: string;
  brand_id: string;
  loyalty: LoyaltyConfig;
  /** Configurable pick-lists so the CRM adapts per business category. */
  lead_sources: string[];
  review_sources: string[];
  updated_at: string;
};

/* ------------------------------------------------------------------ */
/* Derived analytics inputs (never stored — computed deterministically) */
/* ------------------------------------------------------------------ */

export type CustomerStat = {
  customerId: string;
  name: string;
  /** stored status ("archived") wins; otherwise derived from recency. */
  status: "active" | "inactive" | "archived";
  isNew: boolean;
  isReturning: boolean;
  totalOrders: number;
  totalSpend: number;
  avgOrderValue: number;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  visitCount: number;
  appointmentCount: number;
  outstandingDues: number;
  loyaltyPoints: number;
  lifetimeValue: number;
  averageReviewRating: number | null;
  unresolvedComplaints: number;
};

export type CrmOverview = {
  totals: {
    customers: number;
    newCustomers: number;
    returningCustomers: number;
    activeCustomers: number;
    inactiveCustomers: number;
    customerLifetimeRevenue: number;
    averageCustomerSpend: number;
    unresolvedComplaints: number;
    averageReviewRating: number | null;
    unansweredReviews: number;
    totalLeads: number;
    leadConversionRate: number | null;
  };
  leadsByStage: Record<LeadStage, number>;
  acquisitionTrend: { month: string; newCustomers: number }[];
  newVsReturning: { month: string; newCustomers: number; returning: number }[];
  campaignPerformance: MarketingCampaign[];
  followUpsDue: {
    leads: Lead[];
    interactions: Interaction[];
    complaints: Complaint[];
  };
  recentInteractions: Interaction[];
  recentReviews: Review[];
};

/** Day windows for derived customer status — deterministic, one place. */
export const ACTIVE_CUSTOMER_WINDOW_DAYS = 90;
export const NEW_CUSTOMER_WINDOW_DAYS = 30;
