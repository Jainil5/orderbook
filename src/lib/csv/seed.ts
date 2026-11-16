/**
 * Row sources for seeding `data/*.csv` when a table file is missing.
 *
 * Seeding always reads the RAW fixture modules (never the CSV-backed view), so
 * it can't recurse, and a fresh container on Railway rebuilds the same tables
 * the checked-in CSVs contain. The rows carry their fixture `brand_id`
 * (`demo-brewery-cafe`, `demo-cubig-furniture`) — the same id the workspace
 * session resolves for that demo brand.
 *
 * `stock_adjustments` seeds empty on purpose: nobody authors those rows in the
 * fixture packs, so the file exists only to receive what the app writes when a
 * stock adjustment is saved.
 */

import {
  DEMO_BRAND_CODES,
  getRawDemoBrandPack,
} from "@/lib/demo/brands/packs";
import { demoExpenses, demoCashMovements, demoCashSessions } from "@/lib/demo/business/finance";
import { demoNotes } from "@/lib/demo/business/notes";
import { demoPurchaseOrders, demoSuppliers } from "@/lib/demo/business/procurement";
import { demoAttendance, demoLeave } from "@/lib/demo/business/workforce";
import { demoExternalEvents, demoSyncActions } from "@/lib/demo/business/calendar";
import {
  demoCampaigns,
  demoCampaignRecipients,
  demoComplaints,
  demoCrmSettings,
  demoInteractions,
  demoLeads,
  demoLoyaltyAccounts,
  demoLoyaltyTransactions,
  demoMemberships,
  demoReviews,
  demoSegments,
} from "@/lib/demo/business/crm";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { CsvTable } from "./schema";

type Rows = Record<string, unknown>[];

function fromPacks(
  pick: (pack: ReturnType<typeof getRawDemoBrandPack>) => { id: string }[],
): Rows {
  const rows: Rows = [];
  for (const code of DEMO_BRAND_CODES) {
    for (const row of pick(getRawDemoBrandPack(code))) {
      rows.push(row as unknown as Record<string, unknown>);
    }
  }
  return rows;
}

function fromBusiness(
  pick: (code: DemoBrandCode) => { id: string }[],
): Rows {
  const rows: Rows = [];
  for (const code of DEMO_BRAND_CODES) {
    for (const row of pick(code)) {
      rows.push(row as unknown as Record<string, unknown>);
    }
  }
  return rows;
}

export function seedTableRows(table: CsvTable): Rows {
  switch (table) {
    case "products":
      return fromPacks((p) => p.products);
    case "orders":
      return fromPacks((p) => p.orders);
    case "order_items":
      return fromPacks((p) => p.orderItems);
    case "customers":
      return fromPacks((p) => p.customers);
    case "offers":
      return fromPacks((p) => p.offers);
    case "payments":
      return fromPacks((p) => p.payments);
    case "staff":
      return fromPacks((p) => p.staff);
    case "services":
      return fromPacks((p) => p.services);
    case "service_jobs":
      return fromPacks((p) => p.serviceJobs);
    case "appointments":
      return fromPacks((p) => p.appointments);
    case "visits":
      return fromPacks((p) => p.visits);
    case "shifts":
      return fromPacks((p) => p.shifts);
    case "tasks":
      return fromPacks((p) => p.tasks);
    case "notes":
      return fromBusiness(demoNotes);
    case "expenses":
      return fromBusiness(demoExpenses);
    case "suppliers":
      return fromBusiness(demoSuppliers);
    case "purchase_orders":
      return fromBusiness(demoPurchaseOrders);
    case "cash_movements":
      return fromBusiness(demoCashMovements);
    case "cash_sessions":
      return fromBusiness(demoCashSessions);
    case "attendance":
      return fromBusiness(demoAttendance);
    case "leave_requests":
      return fromBusiness(demoLeave);
    case "external_events":
      return fromBusiness(demoExternalEvents);
    case "sync_actions":
      return fromBusiness(demoSyncActions);
    case "stock_adjustments":
      return [];
    case "leads":
      return fromBusiness(demoLeads);
    case "customer_interactions":
      return fromBusiness(demoInteractions);
    case "customer_reviews":
      return fromBusiness(demoReviews);
    case "customer_complaints":
      return fromBusiness(demoComplaints);
    case "customer_segments":
      return fromBusiness(demoSegments);
    case "marketing_campaigns":
      return fromBusiness(demoCampaigns);
    case "campaign_recipients":
      return fromBusiness(demoCampaignRecipients);
    case "loyalty_accounts":
      return fromBusiness(demoLoyaltyAccounts);
    case "loyalty_transactions":
      return fromBusiness(demoLoyaltyTransactions);
    case "memberships":
      return fromBusiness(demoMemberships);
    case "crm_settings":
      return fromBusiness(demoCrmSettings);
    /* Refunds, audit trail and brand settings are created by the app itself —
       they have no fixture history to seed, and an empty table is honest about
       that. `brand_settings` is the exception: one row per demo brand, taken
       from that brand's fixture settings so the CSV is a complete picture of
       the workspace an owner can edit offline. */
    case "refunds":
      return [];
    case "audit_log":
      return [];
    /* A session is created by signing in and nothing else. Seeding one would
       hand every visitor of a fresh checkout a live login, so the table starts
       empty and stays empty until someone uses the login screen. */
    case "sessions":
      return [];
    case "brand_settings":
      return DEMO_BRAND_CODES.map((code) => {
        const pack = getRawDemoBrandPack(code);
        return {
          id: pack.brand.id,
          brand_id: pack.brand.id,
          receipt_header: pack.settings.receipt_header ?? null,
          receipt_footer: pack.settings.receipt_footer ?? null,
          contact_email: pack.settings.contact_email ?? null,
          contact_phone: pack.settings.contact_phone ?? null,
          quotation_builder_enabled: Boolean(
            pack.settings.quotation_builder_enabled,
          ),
          brand_website_url: pack.settings.brand_website_url ?? null,
          /* null = "the industry profile decides", which is exactly what
             resolveIndustry() does with a missing pref. */
          industry: null,
          hidden_manager_modules: null,
          integrations: null,
          ai_automations: null,
          ai_proposals: null,
          updated_at: "",
        };
      });
  }
}
