/**
 * CRM reads, in one place.
 *
 * A page calls `loadCrmWorkspace()` once and gets every CRM collection for
 * the current brand plus the order/customer/staff rows the CRM is measured
 * against, already joined with the deterministic numbers from
 * src/lib/crm/metrics.ts. Nothing here computes a business total by hand and
 * nothing here writes.
 *
 * Storage split (deliberate, documented):
 * - CRM-owned tables → `CrmRepository` (CSV today, Supabase when enabled).
 * - Customers, orders, staff → the same readers the rest of the app already
 *   uses, so the CRM can never show a different truth than /orders or
 *   /customers. The CRM never copies money data out of them.
 */

import { csvBrandContext, listCustomers, listOffers } from "@/services/data";
import { listDemoCustomers, listDemoOffers, listDemoOrders, toDemoBrandCode } from "@/lib/demo/data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { canLogCrmActivity, canManageCrm } from "@/lib/security/authorization";
import { readBrandRows } from "@/lib/csv/store";
import {
  analyzeReviews,
  computeCrmOverview,
  computeCustomerStats,
  loyaltyConfigFor,
  segmentCustomerIds,
  type ReviewIntelligence,
} from "./metrics";
import {
  getCrmRepository,
  newCrmId,
  type CrmDriver,
  type CrmRepository,
} from "./repository";
import type { BrandRole, Customer, Offer, Order } from "@/types/database";
import { REVIEW_SOURCES } from "@/types/crm";
import type {
  CampaignRecipient,
  Complaint,
  CrmOverview,
  CrmSettings,
  CustomerSegment,
  CustomerStat,
  Interaction,
  Lead,
  LoyaltyAccount,
  LoyaltyTransaction,
  MarketingCampaign,
  Membership,
  Review,
  SegmentRules,
} from "@/types/crm";

/** Pick-list defaults for brands without a crm_settings row yet (live mode). */
export const DEFAULT_LEAD_SOURCES = [
  "Walk-in",
  "Referral",
  "Website enquiry",
  "Instagram",
  "WhatsApp",
  "Phone",
];

/**
 * Review sources are a closed enum, so the default is the stored *values*
 * ("in_store"), which `REVIEW_SOURCE_LABELS` turns into words on screen.
 * Lead sources stay free text on purpose — "Wedding expo" is a real answer and
 * no enum should refuse it.
 */
export const DEFAULT_REVIEW_SOURCES: string[] = REVIEW_SOURCES;

export type StaffOption = { id: string; name: string };

export type CrmWorkspace = {
  brandId: string;
  brandCode: string;
  driver: CrmDriver;
  mode: "live" | "demo";
  /** One instant for every derived number on this read. */
  asOf: string;
  repo: CrmRepository;

  /** Formatting + permission context, so a page only ever needs one load. */
  currencyCode: string;
  orderNumberColumn: string;
  role: BrandRole;
  canLog: boolean;
  canManage: boolean;

  customers: Customer[];
  orders: Order[];
  staff: StaffOption[];
  /** Existing offers — campaigns attach to these, the CRM never copies them. */
  offers: Offer[];

  leads: Lead[];
  interactions: Interaction[];
  reviews: Review[];
  complaints: Complaint[];
  segments: CustomerSegment[];
  campaigns: MarketingCampaign[];
  recipients: CampaignRecipient[];
  loyaltyAccounts: LoyaltyAccount[];
  loyaltyTransactions: LoyaltyTransaction[];
  memberships: Membership[];
  settings: CrmSettings;

  stats: CustomerStat[];
  overview: CrmOverview;
  reviewIntel: ReviewIntelligence;
};

/** Null means "no workspace session" — callers redirect, never render empty. */
export async function loadCrmWorkspace(): Promise<CrmWorkspace | null> {
  const ws = await loadWorkspaceSession();
  if (!ws) return null;
  const repo = await getCrmRepository();
  const ctx = await csvBrandContext();
  if (!repo || !ctx) return null;

  const isDemo = ws.mode === "demo";
  const demoCode = isDemo ? toDemoBrandCode(ws.brand.code) : undefined;

  // Customers/orders/staff come from the app's existing readers, so the CRM
  // and the operational pages always agree on who and what is owed.
  const customers: Customer[] = isDemo
    ? await listDemoCustomers(undefined, demoCode)
    : ((await listCustomers()).data ?? []) as Customer[];

  const orders: Order[] = isDemo
    ? await listDemoOrders(undefined, demoCode)
    : (readBrandRows("orders", ctx.brandId) as unknown as Order[]);

  const staff: StaffOption[] = isDemo
    ? (await listDemoStaff(demoCode)).map((s) => ({ id: s.id, name: s.name }))
    : (
        readBrandRows("staff", ctx.brandId) as unknown as {
          id: string;
          name: string;
        }[]
      ).map((s) => ({ id: s.id, name: s.name }));

  // Offers stay the app's single discount model; campaigns point at one.
  const offers: Offer[] = isDemo
    ? await listDemoOffers(demoCode)
    : ((await listOffers()).data ?? []) as Offer[];

  const [
    leads,
    interactions,
    reviews,
    complaints,
    segments,
    campaigns,
    recipients,
    loyaltyAccounts,
    loyaltyTransactions,
    memberships,
    settingsRows,
  ] = await Promise.all([
    repo.list("leads"),
    repo.list("customer_interactions"),
    repo.list("customer_reviews"),
    repo.list("customer_complaints"),
    repo.list("customer_segments"),
    repo.list("marketing_campaigns"),
    repo.list("campaign_recipients"),
    repo.list("loyalty_accounts"),
    repo.list("loyalty_transactions"),
    repo.list("memberships"),
    repo.list("crm_settings"),
  ]);

  const asOf = new Date().toISOString();
  const settingsRow = settingsRows[0];
  // A blank CSV `json` cell decodes to null, not []: normalise here once so
  // `CrmSettings` means what it says and no screen has to defend again.
  const settings: CrmSettings = {
    // Brand-scoped because it doubles as the primary key the loyalty settings
    // action writes with: a fixed id would collide across brands.
    id: settingsRow?.id ?? `crm-settings-${ctx.brandCode}`,
    brand_id: ctx.brandId,
    loyalty: loyaltyConfigFor(settingsRow),
    lead_sources: settingsRow?.lead_sources?.length
      ? settingsRow.lead_sources
      : DEFAULT_LEAD_SOURCES,
    review_sources: settingsRow?.review_sources?.length
      ? settingsRow.review_sources
      : DEFAULT_REVIEW_SOURCES,
    updated_at: settingsRow?.updated_at ?? asOf,
  };

  const stats = computeCustomerStats({
    customers,
    orders,
    interactions,
    reviews,
    complaints,
    loyaltyAccounts,
    asOf,
  });

  return {
    brandId: ctx.brandId,
    brandCode: ctx.brandCode,
    driver: repo.driver,
    mode: ws.mode,
    asOf,
    repo,
    currencyCode: ws.settings.currency_code,
    orderNumberColumn: ws.profile.ordersNumberColumn,
    role: ws.role,
    canLog: canLogCrmActivity(ws.role),
    canManage: canManageCrm(ws.role),
    customers,
    orders,
    staff,
    offers,
    leads,
    interactions,
    reviews,
    complaints,
    segments,
    campaigns,
    recipients,
    loyaltyAccounts,
    loyaltyTransactions,
    memberships,
    settings,
    stats,
    overview: computeCrmOverview({
      customers,
      orders,
      interactions,
      reviews,
      complaints,
      loyaltyAccounts,
      leads,
      campaigns,
      asOf,
    }),
    reviewIntel: analyzeReviews(reviews, { asOf }),
  };
}

/* ------------------------------------------------------------------ */
/* Join helpers pages share (so no page re-derives them differently)   */
/* ------------------------------------------------------------------ */

export function statById(crm: CrmWorkspace): Map<string, CustomerStat> {
  return new Map(crm.stats.map((s) => [s.customerId, s]));
}

export function customerById(
  crm: CrmWorkspace,
  id: string | null | undefined,
): Customer | undefined {
  if (!id) return undefined;
  return crm.customers.find((c) => c.id === id);
}

export function leadById(
  crm: CrmWorkspace,
  id: string | null | undefined,
): Lead | undefined {
  if (!id) return undefined;
  return crm.leads.find((l) => l.id === id);
}

export function staffName(
  crm: CrmWorkspace,
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return crm.staff.find((s) => s.id === id)?.name ?? null;
}

export function ordersForCustomer(
  crm: CrmWorkspace,
  customerId: string,
): Order[] {
  return crm.orders
    .filter((o) => o.customer_id === customerId)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
}

export function segmentData(crm: CrmWorkspace) {
  return {
    customers: crm.customers,
    stats: crm.stats,
    reviews: crm.reviews,
    memberships: crm.memberships,
    loyaltyAccounts: crm.loyaltyAccounts,
  };
}

/** Live members of a segment, recomputed from data on every call. */
export function segmentMemberIds(
  crm: CrmWorkspace,
  segment: CustomerSegment,
): string[] {
  return segmentCustomerIds(segment, segmentData(crm), crm.asOf);
}

export function segmentMembers(
  crm: CrmWorkspace,
  segment: CustomerSegment,
): Customer[] {
  const ids = new Set(segmentMemberIds(crm, segment));
  return crm.customers.filter((c) => ids.has(c.id));
}

/** Marketing audience: consent granted, not opted out, not archived. */
export function consentedCustomerIds(
  crm: CrmWorkspace,
  customerIds: string[],
): string[] {
  const byId = new Map(crm.customers.map((c) => [c.id, c]));
  return customerIds.filter((id) => {
    const customer = byId.get(id);
    if (!customer || customer.status === "archived") return false;
    return customer.marketing_consent === "granted" && !customer.opted_out_at;
  });
}

/**
 * Recompute a campaign audience from its segment + consent rules. Pure — the
 * caller writes the rows. Recorded states for people still in the audience
 * are preserved, so a rebuild never re-sends to someone already marked sent.
 */
export type RecipientPlan = {
  keep: CampaignRecipient[];
  add: CampaignRecipient[];
  drop: CampaignRecipient[];
};

export function planCampaignRecipients(
  crm: CrmWorkspace,
  campaign: MarketingCampaign,
): RecipientPlan {
  const segment = crm.segments.find((s) => s.id === campaign.segment_id);
  const audience = consentedCustomerIds(
    crm,
    segment
      ? segmentMemberIds(crm, segment)
      : crm.customers.filter((c) => c.status !== "archived").map((c) => c.id),
  );
  const existing = crm.recipients.filter((r) => r.campaign_id === campaign.id);
  const audienceSet = new Set(audience);
  const existingIds = new Set(existing.map((r) => r.customer_id));
  return {
    keep: existing.filter((r) => r.customer_id && audienceSet.has(r.customer_id)),
    add: audience
      .filter((id) => !existingIds.has(id))
      .map((customerId): CampaignRecipient => ({
        id: newCrmId(),
        brand_id: campaign.brand_id,
        campaign_id: campaign.id,
        customer_id: customerId,
        lead_id: null,
        status: "selected",
        marked_sent_at: null,
        responded_at: null,
        redeemed_at: null,
        order_id: null,
        note: null,
        created_at: crm.asOf,
        updated_at: crm.asOf,
      })),
    drop: existing.filter((r) => !r.customer_id || !audienceSet.has(r.customer_id)),
  };
}

/** Honest campaign tallies — counted from recipient states, never typed in. */
export function recountCampaign(
  crm: CrmWorkspace,
  campaign: MarketingCampaign,
): Pick<
  MarketingCampaign,
  | "targeted_count"
  | "marked_sent_count"
  | "response_count"
  | "redemption_count"
  | "revenue_attributed"
> {
  const rows = crm.recipients.filter((r) => r.campaign_id === campaign.id);
  const orderById = new Map(crm.orders.map((o) => [o.id, o]));
  const attributed = rows.reduce((sum, r) => {
    if (!r.redeemed_at || !r.order_id) return sum;
    const order = orderById.get(r.order_id);
    return order ? sum + order.grand_total : sum;
  }, 0);
  return {
    targeted_count: rows.length,
    marked_sent_count: rows.filter((r) => r.marked_sent_at !== null).length,
    response_count: rows.filter((r) => r.responded_at !== null).length,
    redemption_count: rows.filter((r) => r.redeemed_at !== null).length,
    revenue_attributed: Math.round(attributed * 100) / 100,
  };
}

/* ------------------------------------------------------------------ */
/* 360° timeline                                                       */
/* ------------------------------------------------------------------ */

export type CrmTimelineEntry = {
  id: string;
  kind: "interaction" | "review" | "complaint" | "lead" | "loyalty" | "membership";
  when: string;
  title: string;
  detail: string | null;
  href: string;
  tone: "neutral" | "success" | "warning" | "danger";
};

/** Everything the CRM knows about one customer, newest first. */
export function customerTimeline(
  crm: CrmWorkspace,
  customerId: string,
): CrmTimelineEntry[] {
  const entries: CrmTimelineEntry[] = [];

  for (const i of crm.interactions.filter((r) => r.customer_id === customerId)) {
    entries.push({
      id: i.id,
      kind: "interaction",
      when: i.occurred_at,
      title: i.subject ?? i.type,
      detail: i.description,
      href: `/customers/interactions?id=${i.id}`,
      tone: "neutral",
    });
  }
  for (const r of crm.reviews.filter((x) => x.customer_id === customerId)) {
    entries.push({
      id: r.id,
      kind: "review",
      when: r.review_date,
      title: `${r.rating} star review`,
      detail: r.text,
      href: `/customers/reviews?id=${r.id}`,
      tone: r.rating >= 4 ? "success" : r.rating <= 2 ? "danger" : "neutral",
    });
  }
  for (const c of crm.complaints.filter((x) => x.customer_id === customerId)) {
    entries.push({
      id: c.id,
      kind: "complaint",
      when: c.opened_at,
      title: c.subject,
      detail: c.resolution_notes ?? c.description,
      href: `/customers/reviews?tab=complaints&id=${c.id}`,
      tone: c.status === "resolved" || c.status === "closed" ? "success" : "warning",
    });
  }
  for (const l of crm.leads.filter((x) => x.customer_id === customerId)) {
    entries.push({
      id: l.id,
      kind: "lead",
      when: l.converted_at ?? l.created_at,
      title: l.converted_at ? `Converted from lead — ${l.name}` : `Lead — ${l.name}`,
      detail: l.company ?? l.source,
      href: `/customers/leads?id=${l.id}`,
      tone: "neutral",
    });
  }
  for (const t of crm.loyaltyTransactions.filter((x) => x.customer_id === customerId)) {
    entries.push({
      id: t.id,
      kind: "loyalty",
      when: t.created_at,
      title: `${t.points >= 0 ? "+" : ""}${t.points} points`,
      detail: t.reason,
      href: `/customers/loyalty?customer=${t.customer_id}`,
      tone: t.points >= 0 ? "success" : "warning",
    });
  }
  for (const m of crm.memberships.filter((x) => x.customer_id === customerId)) {
    entries.push({
      id: m.id,
      kind: "membership",
      when: m.started_at,
      title: `${m.plan} membership`,
      detail: m.ends_at ? `Renews or ends ${m.ends_at.slice(0, 10)}` : null,
      href: `/customers/loyalty?tab=memberships`,
      tone: m.status === "active" ? "success" : "neutral",
    });
  }

  return entries.sort((a, b) => b.when.localeCompare(a.when));
}

/** Rules summary for the segments UI — words, not raw JSON. */
export function describeSegmentRules(rules: SegmentRules): string[] {
  const lines: string[] = [];
  if (rules.minOrders != null) lines.push(`At least ${rules.minOrders} orders`);
  if (rules.maxOrders != null) lines.push(`At most ${rules.maxOrders} orders`);
  if (rules.minTotalSpend != null) lines.push(`Total spend at least ${rules.minTotalSpend}`);
  if (rules.maxTotalSpend != null) lines.push(`Total spend up to ${rules.maxTotalSpend}`);
  if (rules.lastPurchaseWithinDays != null)
    lines.push(`Last purchase within ${rules.lastPurchaseWithinDays} days`);
  if (rules.lastPurchaseOverDays != null)
    lines.push(`No purchase for ${rules.lastPurchaseOverDays}+ days`);
  if (rules.tagsAny?.length) lines.push(`Tagged ${rules.tagsAny.join(", ")}`);
  if (rules.sourcesAny?.length) lines.push(`From ${rules.sourcesAny.join(", ")}`);
  if (rules.priceTiersAny?.length)
    lines.push(`Price tier ${rules.priceTiersAny.join(", ")}`);
  if (rules.hasOutstandingDues) lines.push("Has outstanding dues");
  if (rules.hasUnresolvedComplaints) lines.push("Has unresolved complaints");
  if (rules.minAverageReviewRating != null)
    lines.push(`Average review at least ${rules.minAverageReviewRating} stars`);
  if (rules.loyaltyTiersAny?.length)
    lines.push(`Loyalty tier ${rules.loyaltyTiersAny.join(", ")}`);
  if (rules.membershipPlansAny?.length)
    lines.push(`Member of ${rules.membershipPlansAny.join(", ")}`);
  return lines;
}
