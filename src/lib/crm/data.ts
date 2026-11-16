import { listDemoCustomers, listDemoOrders, listDemoPayments } from "@/lib/demo/data";
import { getDemoBrandPack } from "@/lib/demo/brands";
import type { DemoBrandPack } from "@/lib/demo/brands/types";
import { readDemoMutableBucket, type DemoMutableBucket } from "@/lib/demo/mutable-store";
import { listDemoLeads } from "@/lib/demo/operations-data";
import { listDemoStaff } from "@/lib/demo/staff-data";
import { mergeOpsEntities } from "@/lib/manager/ops-shared";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { Customer, Order, Payment } from "@/types/database";
import type { Lead } from "@/types/operations";
import type { StaffMember } from "@/types/manager";
import type {
  CustomerComplaint,
  CustomerInteraction,
  CustomerReview,
  CustomerSegment,
  LoyaltyEntry,
  LoyaltyRules,
  MarketingCampaign,
  Membership,
} from "@/types/crm";

/**
 * CRM read layer. Every collection follows the same pack + cookie-override merge
 * the operations modules use, so a change made in the demo browser is visible
 * to the actions that validate against it without a second source of truth.
 */
export type DemoCrm = {
  interactions: CustomerInteraction[];
  reviews: CustomerReview[];
  complaints: CustomerComplaint[];
  segments: CustomerSegment[];
  campaigns: MarketingCampaign[];
  loyaltyRules: LoyaltyRules | null;
  loyaltyLedger: LoyaltyEntry[];
  memberships: Membership[];
};

export function mergeCrm(
  pack: DemoBrandPack,
  bucket: DemoMutableBucket,
): DemoCrm {
  const rules = pack.loyaltyRules[0];
  return {
    interactions: mergeOpsEntities(
      pack.interactions,
      bucket.interactions ?? [],
      bucket.interactionOverrides ?? {},
    ),
    reviews: mergeOpsEntities(
      pack.reviews,
      bucket.reviews ?? [],
      bucket.reviewOverrides ?? {},
    ),
    complaints: mergeOpsEntities(
      pack.complaints,
      bucket.complaints ?? [],
      bucket.complaintOverrides ?? {},
    ),
    segments: mergeOpsEntities(
      pack.segments,
      bucket.segments ?? [],
      bucket.segmentOverrides ?? {},
    ),
    campaigns: mergeOpsEntities(
      pack.campaigns,
      bucket.campaigns ?? [],
      bucket.campaignOverrides ?? {},
    ),
    loyaltyRules: rules
      ? { ...rules, ...(bucket.loyaltyRulesOverride ?? {}) }
      : null,
    // Append-only: corrections arrive as their own `adjust` entry.
    loyaltyLedger: [...pack.loyaltyLedger, ...(bucket.loyaltyLedger ?? [])].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    ),
    memberships: mergeOpsEntities(
      pack.memberships,
      bucket.memberships ?? [],
      bucket.membershipOverrides ?? {},
    ),
  };
}

export async function loadDemoCrm(brandCode?: DemoBrandCode): Promise<DemoCrm> {
  const code = brandCode ?? "BR-1";
  return mergeCrm(getDemoBrandPack(code), await readDemoMutableBucket(code));
}

/** Everything a CRM page renders: the CRM rows plus the data they are measured against. */
export type CrmWorkspace = DemoCrm & {
  code: DemoBrandCode;
  customers: Customer[];
  orders: Order[];
  payments: Payment[];
  leads: Lead[];
  staff: StaffMember[];
  currencyCode: string;
};

export async function loadCrmWorkspace(brandCode?: DemoBrandCode): Promise<CrmWorkspace> {
  const code = brandCode ?? "BR-1";
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  const [customers, orders, payments, leads, staff] = await Promise.all([
    listDemoCustomers(undefined, code),
    listDemoOrders(undefined, code),
    listDemoPayments(code),
    listDemoLeads(code),
    listDemoStaff(code),
  ]);
  return {
    code,
    ...mergeCrm(pack, bucket),
    customers,
    orders,
    payments,
    leads,
    staff,
    currencyCode: pack.settings.currency_code,
  };
}
