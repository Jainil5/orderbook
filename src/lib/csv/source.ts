/**
 * The read side of the CSV storage: how the workspace's data layers source
 * their base rows.
 *
 * Resolution rule, stated once here:
 * - Everything is served from `data/*.csv` (auto-seeded from the fixture
 *   packs on first read).
 * - Products and orders are the two Supabase-backed tables when a live
 *   Supabase session exists (`services/data.ts` keeps that path); with no
 *   Supabase configured — Railway without keys — the same pages read the
 *   exact same rows from these CSVs, so products stay online either way.
 * - All other entities are CSV-only; their Supabase code is commented out at
 *   the call sites in `services/data.ts`.
 *
 * App edits are written back to these same files, so a CSV is both the base
 * data and the current state — an owner can open it in a spreadsheet, change
 * what the app shows, and see that change on the next request.
 */

import { getRawDemoBrandPack } from "@/lib/demo/brands/packs";
import type { DemoBrandPack } from "@/lib/demo/brands/types";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { StaffMember } from "@/types/manager";
import type {
  Appointment,
  FieldVisit,
  Service,
  ServiceJob,
  Shift,
  Task,
} from "@/types/operations";
import type {
  Customer,
  Offer,
  Order,
  OrderItem,
  Payment,
  Product,
} from "@/types/database";
import { readAllRows, readBrandRows } from "./store";
import type { CsvTable } from "./schema";

export function csvBrandId(code: DemoBrandCode): string {
  return getRawDemoBrandPack(code).brand.id;
}

function rows<T>(table: CsvTable, brandId: string): T[] {
  return readBrandRows(table, brandId) as unknown as T[];
}

/**
 * A demo pack whose record arrays come from CSV instead of fixtures. Brand,
 * settings, and the precomputed `analytics` snapshot stay fixture-backed —
 * analytics is derived display data, not a table.
 */
export function csvPackFor(code: DemoBrandCode): DemoBrandPack {
  const raw = getRawDemoBrandPack(code);
  const brandId = raw.brand.id;
  const orders = rows<Order>("orders", brandId);
  const orderIds = new Set(orders.map((order) => order.id));
  return {
    ...raw,
    products: rows<Product>("products", brandId),
    customers: rows<Customer>("customers", brandId),
    orders,
    // order_items.csv is keyed by order_id, not brand_id — scope it through
    // this brand's orders (same rule the live Supabase path uses).
    orderItems: (readAllRows("order_items") as unknown as OrderItem[]).filter(
      (item) => orderIds.has(item.order_id),
    ),
    offers: rows<Offer>("offers", brandId),
    payments: rows<Payment>("payments", brandId),
    staff: rows<StaffMember>("staff", brandId),
    services: rows<Service>("services", brandId),
    serviceJobs: rows<ServiceJob>("service_jobs", brandId),
    appointments: rows<Appointment>("appointments", brandId),
    visits: rows<FieldVisit>("visits", brandId),
    shifts: rows<Shift>("shifts", brandId),
    tasks: rows<Task>("tasks", brandId),
  };
}

/**
 * Wrap a fixture provider into a CSV-backed one for the business collections.
 * The fallback stays in the type only as the seed source (through `seed.ts`);
 * at read time the CSV file is the truth, auto-seeded from it on first access.
 */
export function csvFixtures<T extends { id: string }>(
  table: CsvTable,
): (code: DemoBrandCode) => T[] {
  return (code) => rows<T>(table, csvBrandId(code));
}

/** Stock adjustments: CSV history plus app edits, in that order. */
export function csvStockAdjustmentRows<T>(brandId: string): T[] {
  return rows<T>("stock_adjustments", brandId);
}
