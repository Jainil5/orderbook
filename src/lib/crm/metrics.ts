import type {
  Customer,
  Order,
  OrderStatus,
  PaymentStatus,
} from "@/types/database";
import type {
  Complaint,
  CrmOverview,
  CrmSettings,
  CustomerSegment,
  CustomerStat,
  Interaction,
  Lead,
  LeadStage,
  LoyaltyAccount,
  LoyaltyConfig,
  LoyaltyTransaction,
  MarketingCampaign,
  Membership,
  Review,
  ReviewSentiment,
  SegmentRules,
} from "@/types/crm";
import {
  ACTIVE_CUSTOMER_WINDOW_DAYS,
  LEAD_STAGES,
  NEW_CUSTOMER_WINDOW_DAYS,
} from "@/types/crm";

/**
 * Deterministic CRM calculations. Everything in this file is a pure function
 * over already-loaded rows — same inputs, same `asOf`, same numbers. No
 * random, no clock reads, no LLM. Pages and actions must present numbers from
 * here (or from simpler sums in `services/data.ts`); nothing else is
 * authoritative.
 */

const DAY_MS = 86_400_000;

/**
 * Orders that count as spend: not drafts/quotes, not cancelled/refunded.
 * Exported because a CRM write (loyalty earning from an order) has to agree
 * with the metrics that say what "a purchase" is — one list, no drift.
 */
export const SPEND_ORDER_STATUSES: OrderStatus[] = ["confirmed", "completed"];

export function isSpendOrder(order: Order): boolean {
  return SPEND_ORDER_STATUSES.includes(order.status);
}

function unpaidAmount(order: Order): number {
  const paid: number = order.amount_paid ?? 0;
  const settled: PaymentStatus[] = ["paid", "refunded"];
  if (settled.includes(order.payment_status)) return 0;
  if (!isSpendOrder(order)) return 0;
  return Math.max(0, order.grand_total - paid);
}

function dayIndex(iso: string, asOfMs: number): number {
  return Math.floor(asOfMs / DAY_MS) - Math.floor(new Date(iso).getTime() / DAY_MS);
}

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type CustomerStatsInput = {
  customers: Customer[];
  orders: Order[];
  interactions?: Interaction[];
  reviews?: Review[];
  complaints?: Complaint[];
  loyaltyAccounts?: LoyaltyAccount[];
  /** ISO instant the calculation is pinned to (server passes new Date()). */
  asOf: string;
};

/**
 * Per-customer derived stats. Status: an explicit "archived" wins; otherwise
 * active = last spend within ACTIVE_CUSTOMER_WINDOW_DAYS of asOf. New = first
 * spend (or customer record) within NEW_CUSTOMER_WINDOW_DAYS. Returning = 2+
 * spend orders. Lifetime value is currently defined as total spend — one
 * documented, boringly reproducible rule.
 */
export function computeCustomerStats(input: CustomerStatsInput): CustomerStat[] {
  const asOfMs = new Date(input.asOf).getTime();
  const interactions = input.interactions ?? [];
  const reviews = input.reviews ?? [];
  const complaints = input.complaints ?? [];
  const accounts = input.loyaltyAccounts ?? [];

  return input.customers.map((customer) => {
    const spendOrders = input.orders
      .filter((o) => o.customer_id === customer.id && isSpendOrder(o))
      .sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    const totalSpend = round2(
      spendOrders.reduce((sum, o) => sum + o.grand_total, 0),
    );
    const outstandingDues = round2(
      input.orders
        .filter((o) => o.customer_id === customer.id)
        .reduce((sum, o) => sum + unpaidAmount(o), 0),
    );
    const last = spendOrders[0]?.created_at ?? null;
    const first = spendOrders.length
      ? spendOrders[spendOrders.length - 1].created_at
      : null;
    const loyalty = accounts.find((a) => a.customer_id === customer.id);
    const customerReviews = reviews.filter((r) => r.customer_id === customer.id);
    const avgRating = customerReviews.length
      ? round2(
          customerReviews.reduce((s, r) => s + r.rating, 0) /
            customerReviews.length,
        )
      : null;
    const unresolved = complaints.filter(
      (c) =>
        c.customer_id === customer.id &&
        (c.status === "open" || c.status === "in_progress"),
    ).length;

    const lastDaysAgo = last ? dayIndex(last, asOfMs) : null;
    const status: CustomerStat["status"] =
      customer.status === "archived"
        ? "archived"
        : lastDaysAgo !== null && lastDaysAgo <= ACTIVE_CUSTOMER_WINDOW_DAYS
          ? "active"
          : "inactive";
    const recordDaysAgo = customer.created_at
      ? dayIndex(customer.created_at, asOfMs)
      : null;
    const isNew =
      (first !== null && dayIndex(first, asOfMs) <= NEW_CUSTOMER_WINDOW_DAYS) ||
      (first === null &&
        recordDaysAgo !== null &&
        recordDaysAgo <= NEW_CUSTOMER_WINDOW_DAYS);

    return {
      customerId: customer.id,
      name: customer.name,
      status,
      isNew,
      isReturning: spendOrders.length >= 2,
      totalOrders: spendOrders.length,
      totalSpend,
      avgOrderValue: spendOrders.length ? round2(totalSpend / spendOrders.length) : 0,
      firstPurchaseAt: first,
      lastPurchaseAt: last,
      visitCount: interactions.filter(
        (i) => i.customer_id === customer.id && i.type === "store_visit",
      ).length,
      appointmentCount: interactions.filter(
        (i) => i.customer_id === customer.id && i.type === "appointment",
      ).length,
      outstandingDues,
      loyaltyPoints: loyalty?.points_balance ?? 0,
      lifetimeValue: totalSpend,
      averageReviewRating: avgRating,
      unresolvedComplaints: unresolved,
    };
  });
}

export type OverviewInput = CustomerStatsInput & {
  leads: Lead[];
  campaigns: MarketingCampaign[];
  followUpHorizonDays?: number;
  recentLimit?: number;
};

/**
 * Everything the CRM overview shows, from one deterministic pass. Months in
 * the trend arrays are the six calendar months ending at `asOf`, oldest
 * first — stable output even for empty months.
 */
export function computeCrmOverview(input: OverviewInput): CrmOverview {
  const asOfMs = new Date(input.asOf).getTime();
  const stats = computeCustomerStats(input);
  const spendCustomers = stats.filter((s) => s.totalOrders > 0);
  const allReviews = input.reviews ?? [];
  const allComplaints = input.complaints ?? [];
  const allInteractions = input.interactions ?? [];

  const rated = allReviews.filter((r) => r.rating > 0);
  const leadsByStage = Object.fromEntries(
    LEAD_STAGES.map((stage) => [
      stage,
      input.leads.filter((l) => l.stage === stage).length,
    ]),
  ) as Record<LeadStage, number>;
  const won = leadsByStage.won;
  const lost = leadsByStage.lost;
  const closed = won + lost;

  // Six-month window ending at asOf.
  const months: string[] = [];
  const anchor = new Date(asOfMs);
  for (let back = 5; back >= 0; back--) {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - back, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  // Acquisition: month of each customer's first spend (no spend → their
  // record date, if kept). Customers outside the window are simply not
  // counted in these buckets.
  const acquisitionTrend = months.map((month) => ({
    month,
    newCustomers: spendCustomers.filter(
      (s) => s.firstPurchaseAt && monthKey(s.firstPurchaseAt) === month,
    ).length,
  }));

  // New vs returning per month: an order in month M is "returning" when the
  // customer had another spend order strictly before M; otherwise "new".
  const newVsReturning = months.map((month) => {
    let newCustomers = 0;
    let returning = 0;
    for (const order of input.orders) {
      if (!isSpendOrder(order) || monthKey(order.created_at) !== month) continue;
      const prior = input.orders.some(
        (o) =>
          o.customer_id === order.customer_id &&
          o.id !== order.id &&
          isSpendOrder(o) &&
          monthKey(o.created_at) < month,
      );
      if (prior) returning++;
      else newCustomers++;
    }
    return { month, newCustomers, returning };
  });

  const horizon = input.followUpHorizonDays ?? 3;
  const dueBy = new Date(asOfMs + horizon * DAY_MS).toISOString();
  const isDue = (iso: string | null) => iso !== null && iso <= dueBy;
  const openStages: LeadStage[] = ["new", "site_visit", "quote_sent", "negotiating"];

  const leadFollowUps = input.leads
    .filter((l) => openStages.includes(l.stage) && isDue(l.next_follow_up_at))
    .sort((a, b) => String(a.next_follow_up_at).localeCompare(String(b.next_follow_up_at)));
  const interactionFollowUps = allInteractions
    .filter((i) => isDue(i.next_follow_up_at))
    .sort((a, b) =>
      String(a.next_follow_up_at).localeCompare(String(b.next_follow_up_at)),
    );
  const complaintFollowUps = allComplaints
    .filter((c) => c.status === "open" || c.status === "in_progress")
    .sort((a, b) => a.opened_at.localeCompare(b.opened_at));

  const limit = input.recentLimit ?? 5;
  const recentInteractions = [...allInteractions]
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, limit);
  const recentReviews = [...allReviews]
    .sort((a, b) => b.review_date.localeCompare(a.review_date))
    .slice(0, limit);

  return {
    totals: {
      customers: stats.length,
      newCustomers: stats.filter((s) => s.isNew).length,
      returningCustomers: stats.filter((s) => s.isReturning).length,
      activeCustomers: stats.filter((s) => s.status === "active").length,
      inactiveCustomers: stats.filter((s) => s.status === "inactive").length,
      customerLifetimeRevenue: round2(
        spendCustomers.reduce((sum, s) => sum + s.totalSpend, 0),
      ),
      averageCustomerSpend: spendCustomers.length
        ? round2(
            spendCustomers.reduce((sum, s) => sum + s.totalSpend, 0) /
              spendCustomers.length,
          )
        : 0,
      unresolvedComplaints: complaintFollowUps.length,
      averageReviewRating: rated.length
        ? round2(rated.reduce((s, r) => s + r.rating, 0) / rated.length)
        : null,
      unansweredReviews: allReviews.filter(
        (r) => r.response_status === "unanswered",
      ).length,
      totalLeads: input.leads.length,
      leadConversionRate: closed ? round2((won / closed) * 100) : null,
    },
    leadsByStage,
    acquisitionTrend,
    newVsReturning,
    campaignPerformance: input.campaigns
      .filter((c) => c.status === "active" || c.status === "completed")
      .sort((a, b) => b.start_date.localeCompare(a.start_date)),
    followUpsDue: {
      leads: leadFollowUps,
      interactions: interactionFollowUps,
      complaints: complaintFollowUps,
    },
    recentInteractions,
    recentReviews,
  };
}

/* ------------------------------------------------------------------ */
/* Segments                                                            */
/* ------------------------------------------------------------------ */

export type SegmentData = {
  customers: Customer[];
  stats: CustomerStat[];
  reviews?: Review[];
  memberships?: Membership[];
  loyaltyAccounts?: LoyaltyAccount[];
};

/**
 * Membership of a dynamic segment, computed fresh every call. A rule with no
 * constraints matches nothing (safer than matching everyone). Manual
 * segments return their stored ids, minus archived customers.
 */
export function evaluateSegment(
  segment: CustomerSegment,
  data: SegmentData,
): string[] {
  const live = data.customers.filter((c) => c.status !== "archived");
  if (segment.kind === "manual") {
    const liveIds = new Set(live.map((c) => c.id));
    // An empty CSV cell decodes to null, so never assume the array is there.
    return (segment.manual_customer_ids ?? []).filter((id) => liveIds.has(id));
  }

  const rules = segment.rules ?? {};
  const statsById = new Map(data.stats.map((s) => [s.customerId, s]));
  const hasAnyRule = Object.values(rules).some((v) => v !== null && v !== undefined);
  if (!hasAnyRule) return [];

  return live
    .filter((customer) => {
      const stat = statsById.get(customer.id);
      if (!stat) return false;
      if (rules.minOrders != null && stat.totalOrders < rules.minOrders) return false;
      if (rules.maxOrders != null && stat.totalOrders > rules.maxOrders) return false;
      if (
        rules.minTotalSpend != null &&
        stat.totalSpend < rules.minTotalSpend
      )
        return false;
      if (
        rules.maxTotalSpend != null &&
        stat.totalSpend > rules.maxTotalSpend
      )
        return false;
      // The two purchase-window rules need `asOf`, so they run in
      // filterSegmentByPurchaseWindow — never here.
      if (rules.tagsAny?.length) {
        const tags = customer.tags ?? [];
        if (!rules.tagsAny.some((t) => tags.includes(t))) return false;
      }
      if (rules.sourcesAny?.length) {
        if (!customer.source || !rules.sourcesAny.includes(customer.source))
          return false;
      }
      if (rules.priceTiersAny?.length) {
        if (!customer.price_tier || !rules.priceTiersAny.includes(customer.price_tier))
          return false;
      }
      if (rules.hasOutstandingDues && stat.outstandingDues <= 0) return false;
      if (rules.hasUnresolvedComplaints && stat.unresolvedComplaints <= 0) return false;
      if (rules.minAverageReviewRating != null) {
        if (stat.averageReviewRating === null) return false;
        if (stat.averageReviewRating < rules.minAverageReviewRating) return false;
      }
      if (rules.loyaltyTiersAny?.length) {
        const tier = (data.loyaltyAccounts ?? []).find(
          (a) => a.customer_id === customer.id,
        )?.tier;
        if (!tier || !rules.loyaltyTiersAny.includes(tier)) return false;
      }
      if (rules.membershipPlansAny?.length) {
        const plans = (data.memberships ?? [])
          .filter(
            (m) => m.customer_id === customer.id && m.status === "active",
          )
          .map((m) => m.plan);
        if (!rules.membershipPlansAny.some((p) => plans.includes(p))) return false;
      }
      return true;
    })
    .map((c) => c.id);
}

/** Second pass for the two time-window rules (they need `asOf`). */
export function filterSegmentByPurchaseWindow(
  customerIds: string[],
  statsById: Map<string, CustomerStat>,
  rules: SegmentRules,
  asOf: string,
): string[] {
  const asOfMs = new Date(asOf).getTime();
  return customerIds.filter((id) => {
    const stat = statsById.get(id);
    if (!stat) return false;
    if (rules.lastPurchaseWithinDays != null) {
      if (!stat.lastPurchaseAt) return false;
      if (dayIndex(stat.lastPurchaseAt, asOfMs) > rules.lastPurchaseWithinDays)
        return false;
    }
    if (rules.lastPurchaseOverDays != null) {
      if (stat.lastPurchaseAt) {
        if (dayIndex(stat.lastPurchaseAt, asOfMs) < rules.lastPurchaseOverDays)
          return false;
      }
      // A customer with no purchase history has no "last purchase" date, so a
      // date-window rule never matches them — same as an empty date field in
      // any filter UI. They belong in a "no orders yet" rule, not a lapse rule.
      if (!stat.lastPurchaseAt) return false;
      if (dayIndex(stat.lastPurchaseAt, asOfMs) < rules.lastPurchaseOverDays)
        return false;
    }
    return true;
  });
}

/**
 * The one call pages and actions should use: rule pass + purchase-window pass,
 * so the second pass can never be forgotten by a caller.
 */
export function segmentCustomerIds(
  segment: CustomerSegment,
  data: SegmentData,
  asOf: string,
): string[] {
  const ids = evaluateSegment(segment, data);
  if (segment.kind === "manual") return ids;
  const statsById = new Map(data.stats.map((s) => [s.customerId, s]));
  return filterSegmentByPurchaseWindow(ids, statsById, segment.rules ?? {}, asOf);
}

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

/** Deterministic sentiment: stars decide; the stored value always wins. */
export function classifyReviewSentiment(
  review: Review,
): ReviewSentiment {
  if (review.sentiment) return review.sentiment;
  if (review.rating >= 4) return "positive";
  if (review.rating === 3) return "neutral";
  return "negative";
}

export type ReviewIntelligence = {
  average: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  sentimentCounts: Record<ReviewSentiment, number>;
  unanswered: number;
  escalated: number;
  monthlyTrend: { month: string; average: number | null; count: number }[];
  commonComplaintTags: { tag: string; count: number }[];
  praisedTags: { tag: string; count: number }[];
  staffMentions: { staff: string; positive: number; negative: number }[];
};

export function analyzeReviews(
  reviews: Review[],
  options?: { months?: number; asOf?: string },
): ReviewIntelligence {
  const months = options?.months ?? 6;
  const asOfMs = options?.asOf
    ? new Date(options.asOf).getTime()
    : reviews.reduce((max, r) => Math.max(max, new Date(r.review_date).getTime()), 0);
  const anchor = new Date(asOfMs || Date.UTC(1970, 0, 1));
  const buckets: string[] = [];
  for (let back = months - 1; back >= 0; back--) {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - back, 1));
    buckets.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const sentimentCounts: Record<ReviewSentiment, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
  };
  const tagCount = new Map<string, number>();
  const praiseCount = new Map<string, number>();
  const staffMap = new Map<string, { positive: number; negative: number }>();

  for (const review of reviews) {
    const bucket = (review.rating === 1
      ? 1
      : Math.min(5, Math.max(1, Math.round(review.rating)))) as 1 | 2 | 3 | 4 | 5;
    distribution[bucket]++;
    const sentiment = classifyReviewSentiment(review);
    sentimentCounts[sentiment]++;
    for (const tag of review.tags ?? []) {
      if (sentiment === "negative") tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
      if (sentiment === "positive")
        praiseCount.set(tag, (praiseCount.get(tag) ?? 0) + 1);
    }
    if (review.staff_mentioned) {
      const entry = staffMap.get(review.staff_mentioned) ?? {
        positive: 0,
        negative: 0,
      };
      if (sentiment === "positive") entry.positive++;
      if (sentiment === "negative") entry.negative++;
      staffMap.set(review.staff_mentioned, entry);
    }
  }

  const withRatings = reviews.filter((r) => r.rating > 0);
  const monthlyTrend = buckets.map((month) => {
    const inMonth = reviews.filter(
      (r) => r.rating > 0 && monthKey(r.review_date) === month,
    );
    return {
      month,
      count: inMonth.length,
      average: inMonth.length
        ? round2(inMonth.reduce((s, r) => s + r.rating, 0) / inMonth.length)
        : null,
    };
  });

  const sortCounts = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ tag, count }));

  return {
    average: withRatings.length
      ? round2(withRatings.reduce((s, r) => s + r.rating, 0) / withRatings.length)
      : null,
    distribution,
    sentimentCounts,
    unanswered: reviews.filter((r) => r.response_status === "unanswered").length,
    escalated: reviews.filter((r) => r.response_status === "escalated").length,
    monthlyTrend,
    commonComplaintTags: sortCounts(tagCount),
    praisedTags: sortCounts(praiseCount),
    staffMentions: [...staffMap.entries()]
      .map(([staff, counts]) => ({ staff, ...counts }))
      .sort((a, b) => b.positive + b.negative - (a.positive + a.negative)),
  };
}

/* ------------------------------------------------------------------ */
/* Duplicate detection                                                 */
/* ------------------------------------------------------------------ */

export type DuplicateGroup = {
  reason: "phone" | "email";
  key: string;
  customerIds: string[];
};

const digits = (value: string) => value.replace(/\D/g, "");

/** Customers sharing the same phone (last 10 digits) or the same email. */
export function findDuplicateCustomers(customers: Customer[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const byKey = (
    reason: DuplicateGroup["reason"],
    extract: (c: Customer) => string | null,
  ) => {
    const map = new Map<string, string[]>();
    for (const customer of customers) {
      const key = extract(customer);
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), customer.id]);
    }
    for (const [key, ids] of map) {
      if (ids.length > 1) groups.push({ reason, key, customerIds: ids });
    }
  };
  byKey("phone", (c) => {
    const d = c.phone ? digits(c.phone) : "";
    return d.length >= 8 ? d.slice(-10) : null;
  });
  byKey("email", (c) => (c.email ? c.email.trim().toLowerCase() : null));
  return groups;
}

/* ------------------------------------------------------------------ */
/* Follow-up → Productivity task bridge                                */
/* ------------------------------------------------------------------ */

/** A follow-up interaction worth turning into a Productivity task. */
export function followUpTaskDraft(interaction: Interaction): {
  title: string;
  dueDate: string;
  notes: string;
} | null {
  if (!interaction.next_follow_up_at) return null;
  return {
    title: `Follow-up: ${interaction.subject ?? "customer"}`.slice(0, 120),
    dueDate: interaction.next_follow_up_at,
    notes: interaction.description.slice(0, 500),
  };
}

/* ------------------------------------------------------------------ */
/* Loyalty engine (configuration decides everything)                   */
/* ------------------------------------------------------------------ */

export const DEFAULT_LOYALTY_CONFIG: LoyaltyConfig = {
  enabled: false,
  earn_points_per_unit: 0,
  redeem_value_per_point: 0,
  points: "floor",
  expiry_days: null,
  tiers: [],
};

export function loyaltyConfigFor(
  settings: CrmSettings | null | undefined,
): LoyaltyConfig {
  return settings?.loyalty ?? DEFAULT_LOYALTY_CONFIG;
}

/** Points for a completed order amount. floor() rounding, per config. */
export function pointsForOrder(
  grandTotal: number,
  config: LoyaltyConfig,
): number {
  if (!config.enabled || config.earn_points_per_unit <= 0) return 0;
  return Math.floor(grandTotal * config.earn_points_per_unit);
}

export function redemptionValue(points: number, config: LoyaltyConfig): number {
  if (!config.enabled) return 0;
  return round2(points * config.redeem_value_per_point);
}

/** Highest tier whose lifetime-points threshold is met; null when none. */
export function tierForLifetimePoints(
  lifetimePoints: number,
  config: LoyaltyConfig,
): string | null {
  const reached = config.tiers
    .filter((t) => lifetimePoints >= t.min_lifetime_points)
    .sort((a, b) => b.min_lifetime_points - a.min_lifetime_points);
  return reached[0]?.name ?? null;
}

/**
 * Points about to lapse within `withinDays`: positive earn/bonus
 * transactions whose expires_at is in the window, minus nothing (simple,
 * documented rule — the ledger is the truth).
 */
export function expiringPointsReport(
  transactions: LoyaltyTransaction[],
  asOf: string,
  withinDays = 30,
): { customerId: string; points: number; expiresAt: string }[] {
  const asOfMs = new Date(asOf).getTime();
  const horizonMs = asOfMs + withinDays * DAY_MS;
  const byCustomerExpiry = new Map<string, Map<string, number>>();
  for (const txn of transactions) {
    if (txn.kind !== "earn" && txn.kind !== "bonus") continue;
    if (!txn.expires_at) continue;
    const at = new Date(txn.expires_at).getTime();
    if (at <= asOfMs || at > horizonMs) continue;
    const perCustomer =
      byCustomerExpiry.get(txn.customer_id) ?? new Map<string, number>();
    perCustomer.set(
      txn.expires_at,
      (perCustomer.get(txn.expires_at) ?? 0) + txn.points,
    );
    byCustomerExpiry.set(txn.customer_id, perCustomer);
  }
  const rows: { customerId: string; points: number; expiresAt: string }[] = [];
  for (const [customerId, perExpiry] of byCustomerExpiry) {
    for (const [expiresAt, points] of perExpiry) {
      rows.push({ customerId, points, expiresAt });
    }
  }
  return rows.sort(
    (a, b) =>
      a.expiresAt.localeCompare(b.expiresAt) ||
      a.customerId.localeCompare(b.customerId),
  );
}
