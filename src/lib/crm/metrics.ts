import type { Customer, Order, OrderStatus } from "@/types/database";
import type { CustomerComplaint, CustomerReview, LoyaltyEntry, LoyaltyRules, Membership } from "@/types/crm";
import { isOpenReceivable, isRevenueOrder } from "@/lib/orders/order-rules";
import { wholeDaysSince } from "@/lib/manager/time";
import { loyaltyBalance, tierForSpend } from "./loyalty";
import { isUnanswered } from "./reviews";

/**
 * Deterministic customer rollups. Every number on a CRM screen is computed here
 * from the same order rows Billing writes, so the CRM and Analytics can never
 * disagree — and nothing is estimated by a model.
 */

export type CustomerProfile = {
  customer: Customer;
  /** Completed bills only — the shared revenue rule. */
  orders: number;
  lifetimeValue: number;
  avgOrderValue: number;
  /** Unpaid balance across every non-cancelled bill. */
  dues: number;
  billsWithDues: number;
  cancelledOrRefunded: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
  joinedAt: string;
  daysSinceJoin: number;
  reviewCount: number;
  avgRating: number | null;
  openComplaints: number;
  loyaltyPoints: number;
  loyaltyTierId: string | null;
  membershipTierId: string | null;
  tags: string[];
  source: string;
  priceTier: "retail" | "wholesale";
  status: NonNullable<Customer["status"]>;
};

/** No purchase for this long, but not yet written off as lost. */
export const AT_RISK_DAYS = 45;
/** Beyond this the relationship is treated as dormant. */
export const DORMANT_DAYS = 120;

export function isAtRisk(profile: CustomerProfile): boolean {
  if (profile.orders === 0) return false;
  if (profile.daysSinceLastOrder === null) return false;
  return profile.daysSinceLastOrder >= AT_RISK_DAYS && profile.daysSinceLastOrder < DORMANT_DAYS;
}

export function isDormant(profile: CustomerProfile): boolean {
  if (profile.orders === 0) return false;
  return (profile.daysSinceLastOrder ?? 0) >= DORMANT_DAYS;
}

export type ProfileSource = {
  customers: Customer[];
  orders: Order[];
  reviews: CustomerReview[];
  complaints: CustomerComplaint[];
  loyaltyLedger: LoyaltyEntry[];
  loyaltyRules: LoyaltyRules | null;
  memberships: Membership[];
};

/**
 * One pass over the orders per customer. `now` is injected so the same data
 * yields the same profile in a test and in the browser.
 */
export function buildCustomerProfiles(
  {
    customers,
    orders,
    reviews,
    complaints,
    loyaltyLedger,
    loyaltyRules,
    memberships,
  }: ProfileSource,
  now: Date = new Date(),
): CustomerProfile[] {
  const byCustomer = new Map<string, Order[]>();
  for (const order of orders) {
    if (!order.customer_id) continue;
    const list = byCustomer.get(order.customer_id);
    if (list) list.push(order);
    else byCustomer.set(order.customer_id, [order]);
  }

  const reviewsByCustomer = new Map<string, CustomerReview[]>();
  for (const review of reviews) {
    if (!review.customer_id) continue;
    const list = reviewsByCustomer.get(review.customer_id);
    if (list) list.push(review);
    else reviewsByCustomer.set(review.customer_id, [review]);
  }

  const openComplaints = new Map<string, number>();
  for (const complaint of complaints) {
    if (!complaint.customer_id) continue;
    if (complaint.status === "resolved" || complaint.status === "closed") continue;
    openComplaints.set(
      complaint.customer_id,
      (openComplaints.get(complaint.customer_id) ?? 0) + 1,
    );
  }

  const activeMembership = new Map<string, Membership>();
  for (const m of memberships) {
    if (m.status !== "active") continue;
    activeMembership.set(m.customer_id, m);
  }

  return customers.map((customer) => {
    const theirs = (byCustomer.get(customer.id) ?? []).slice().sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const earned = theirs.filter(isRevenueOrder);
    const lifetimeValue = earned.reduce((sum, o) => sum + o.grand_total, 0);
    const dues = theirs
      .filter((o) => isOpenReceivable(o))
      .reduce((sum, o) => sum + (o.grand_total - (o.amount_paid ?? 0)), 0);
    const billsWithDues = theirs.filter((o) => isOpenReceivable(o)).length;
    const lastOrderAt = earned.length ? earned[earned.length - 1].created_at : null;
    const firstOrderAt = earned.length ? earned[0].created_at : null;
    const theirReviews = reviewsByCustomer.get(customer.id) ?? [];
    const points = loyaltyBalance(
      loyaltyLedger.filter((e) => e.customer_id === customer.id),
      now,
    );
    const joinedAt = customer.created_at ?? firstOrderAt ?? now.toISOString();
    const avgRating = theirReviews.length
      ? Math.round(
          (theirReviews.reduce((sum, r) => sum + r.rating, 0) / theirReviews.length) * 10,
        ) / 10
      : null;

    return {
      customer,
      orders: earned.length,
      lifetimeValue: Math.round(lifetimeValue),
      avgOrderValue: earned.length ? Math.round(lifetimeValue / earned.length) : 0,
      dues: Math.round(dues),
      billsWithDues,
      cancelledOrRefunded: theirs.filter(
        (o) => o.status === "cancelled" || o.status === "refunded",
      ).length,
      firstOrderAt,
      lastOrderAt,
      daysSinceLastOrder: lastOrderAt ? wholeDaysSince(lastOrderAt, now) : null,
      joinedAt,
      daysSinceJoin: Math.max(0, wholeDaysSince(joinedAt, now)),
      reviewCount: theirReviews.length,
      avgRating,
      openComplaints: openComplaints.get(customer.id) ?? 0,
      loyaltyPoints: points,
      loyaltyTierId: loyaltyRules ? tierForSpend(loyaltyRules, lifetimeValue)?.id ?? null : null,
      membershipTierId: activeMembership.get(customer.id)?.tier_id ?? null,
      tags: customer.tags ?? [],
      source: customer.source ?? "",
      priceTier: customer.price_tier ?? "retail",
      status: customer.status ?? "active",
    };
  });
}

/** Order statuses that count as still-open work for a project business. */
const OPEN_WORK_STATUSES: OrderStatus[] = ["draft", "pending", "confirmed"];

export function isOpenWork(order: Order): boolean {
  return OPEN_WORK_STATUSES.includes(order.status);
}

export type CrmOverview = {
  totalCustomers: number;
  activeCustomers: number;
  atRiskCustomers: number;
  dormantCustomers: number;
  newCustomers30d: number;
  birthdayCustomers: number;
  totalLifetimeValue: number;
  avgLifetimeValue: number;
  totalDues: number;
  customersWithDues: number;
  revenue30d: number;
  bills30d: number;
  openLeads: number;
  pipelineValue: number;
  openComplaints: number;
  highSeverityComplaints: number;
  reviewsAwaitingReply: number;
  followUpsDue: number;
  topSpenders: CustomerProfile[];
  atRiskList: CustomerProfile[];
};

export type OverviewInput = {
  profiles: CustomerProfile[];
  orders: Order[];
  leads: { stage: string; estimated_value: number }[];
  complaints: CustomerComplaint[];
  reviews: CustomerReview[];
  /** Interactions whose follow-up has arrived or passed. */
  followUpsDue: number;
  /** Open lead stages: `won`/`lost` are closed and stay out of the pipeline. */
  openLeadStages: string[];
  now?: Date;
};

/**
 * The CRM home page in one deterministic object. `followUpsDue` is counted by
 * `lib/crm/interactions.ts` because it needs the clock and the task link.
 */
export function crmOverview(input: OverviewInput): CrmOverview {
  const now = input.now ?? new Date();
  const profiles = input.profiles;
  const totalLifetimeValue = profiles.reduce((s, p) => s + p.lifetimeValue, 0);
  const totalDues = profiles.reduce((s, p) => s + p.dues, 0);

  let revenue30d = 0;
  let bills30d = 0;
  for (const order of input.orders) {
    if (!isRevenueOrder(order)) continue;
    if (wholeDaysSince(order.created_at, now) > 30 || wholeDaysSince(order.created_at, now) < 0) {
      continue;
    }
    revenue30d += order.grand_total;
    bills30d += 1;
  }

  let openLeads = 0;
  let pipelineValue = 0;
  for (const lead of input.leads) {
    if (!input.openLeadStages.includes(lead.stage)) continue;
    openLeads += 1;
    pipelineValue += lead.estimated_value;
  }

  const atRiskList = profiles.filter(isAtRisk);
  const month = now.getMonth();

  return {
    totalCustomers: profiles.length,
    activeCustomers: profiles.filter((p) => p.status === "active").length,
    atRiskCustomers: atRiskList.length,
    dormantCustomers: profiles.filter(isDormant).length,
    newCustomers30d: profiles.filter((p) => p.daysSinceJoin <= 30).length,
    birthdayCustomers: profiles.filter((p) => {
      const dob = p.customer.date_of_birth;
      return !!dob && Number(dob.slice(5, 7)) === month + 1;
    }).length,
    totalLifetimeValue: Math.round(totalLifetimeValue),
    avgLifetimeValue: profiles.length ? Math.round(totalLifetimeValue / profiles.length) : 0,
    totalDues: Math.round(totalDues),
    customersWithDues: profiles.filter((p) => p.dues > 0).length,
    revenue30d: Math.round(revenue30d),
    bills30d,
    openLeads,
    pipelineValue: Math.round(pipelineValue),
    openComplaints: input.complaints.filter(
      (c) => c.status === "open" || c.status === "in_progress",
    ).length,
    highSeverityComplaints: input.complaints.filter(
      (c) => c.severity === "high" && c.status !== "resolved" && c.status !== "closed",
    ).length,
    reviewsAwaitingReply: input.reviews.filter(isUnanswered).length,
    followUpsDue: input.followUpsDue,
    topSpenders: [...profiles].sort((a, b) => b.lifetimeValue - a.lifetimeValue).slice(0, 5),
    atRiskList: atRiskList.sort((a, b) => (b.dues - a.dues) || (b.lifetimeValue - a.lifetimeValue)),
  };
}

/** Distinct values behind the directory filters, so the UI offers what exists. */
export function filterUniverse(profiles: CustomerProfile[]): {
  tags: string[];
  sources: string[];
  priceTiers: ("retail" | "wholesale")[];
} {
  const tags = new Set<string>();
  const sources = new Set<string>();
  const priceTiers = new Set<"retail" | "wholesale">();
  for (const p of profiles) {
    p.tags.forEach((t) => tags.add(t));
    if (p.source) sources.add(p.source);
    priceTiers.add(p.priceTier);
  }
  return {
    tags: [...tags].sort(),
    sources: [...sources].sort(),
    priceTiers: [...priceTiers].sort(),
  };
}
