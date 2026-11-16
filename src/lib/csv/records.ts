/**
 * Brand-scoped record access on top of the raw CSV store.
 *
 * `store.ts` speaks in cells and table names; this is the layer the app's write
 * paths actually use — one place where the two rules every demo/CSV write must
 * honour live:
 *
 * 1. **Tenancy.** A row is only ever read, changed or deleted by the brand that
 *    owns it. `updateBrand`/`dropBrand` return `false` instead of throwing, so
 *    a server action can answer with its own `{ ok: false, message }` instead of
 *    crashing a request. (`CsvCrmRepository` throws, and the CRM actions have to
 *    pre-check ids — see `crmRecordId` in `src/lib/crm/actions-kit.ts`. These
 *    helpers are the non-throwing form of the same rule.)
 * 2. **`brand_id` is stamped, never supplied.** Callers pass it explicitly and
 *    it is written onto the row, so no client payload can choose a brand.
 *
 * Everything here is synchronous, like the store underneath it: the read cache
 * is keyed on mtime+size, so a write is visible to the next request in the same
 * process without a restart.
 */

import type { AuditLogEntry } from "@/types/database";
import { findRow, patchRow, readAllRows, readBrandRows, removeRow, upsertRow } from "./store";
import { TABLE_SCHEMAS, type CsvTable } from "./schema";

/** Ids stay readable and collision-free without a database sequence. */
export function newRecordId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Whether a table carries its own tenancy column. `order_items` does not — it is
 * scoped through its parent order — so brand checks have to be skipped there
 * rather than compare against a column that is never stored.
 */
function isBrandScoped(table: CsvTable): boolean {
  return TABLE_SCHEMAS[table].columns.some((col) => col.name === "brand_id");
}

/** The rows of `table` this brand owns, in file order. */
export function listBrand<T>(table: CsvTable, brandId: string): T[] {
  return (
    isBrandScoped(table) ? readBrandRows(table, brandId) : readAllRows(table)
  ) as unknown as T[];
}

/** Rows of a table without a `brand_id` column, filtered by a parent id. */
export function listChildren<T>(
  table: CsvTable,
  field: string,
  value: string,
): T[] {
  return readAllRows(table)
    .filter((row) => row[field] === value)
    .map((row) => row as unknown as T);
}

/** One row by id, or null when it does not exist *or* belongs to another brand. */
export function findBrand<T>(
  table: CsvTable,
  brandId: string,
  id: string,
): T | null {
  const row = findRow(table, id);
  if (!row) return null;
  if (isBrandScoped(table) && row.brand_id !== brandId) return null;
  return row as unknown as T;
}

/** Insert or merge a row for this brand. `row.id` is required. */
export function saveBrand<T extends { id: string; brand_id?: string }>(
  table: CsvTable,
  brandId: string,
  row: T,
): T {
  const next = isBrandScoped(table)
    ? { ...row, brand_id: brandId }
    : { ...row };
  upsertRow(table, next as unknown as Record<string, unknown>);
  return next as T;
}

/**
 * Merge `patch` into an owned row. `false` means "no such row for this brand" —
 * the caller decides what that means for the user.
 */
export function updateBrand(
  table: CsvTable,
  brandId: string,
  id: string,
  patch: Record<string, unknown>,
): boolean {
  if (!findBrand(table, brandId, id)) return false;
  return patchRow(table, id, patch);
}

/** Hard delete of an owned row. `false` = not found for this brand. */
export function dropBrand(table: CsvTable, brandId: string, id: string): boolean {
  if (!findBrand(table, brandId, id)) return false;
  return removeRow(table, id);
}

/* ------------------------------------------------------------------ */
/* Audit trail — `audit_log.csv`                                       */
/* ------------------------------------------------------------------ */

/** Newest first, which is the order every audit reader displays. */
export function listAudit(brandId: string): AuditLogEntry[] {
  return listBrand<AuditLogEntry>("audit_log", brandId)
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function appendAudit(
  brandId: string,
  entry: Omit<AuditLogEntry, "id" | "created_at" | "brand_id"> & {
    created_at?: string;
  },
): AuditLogEntry {
  const row: AuditLogEntry = {
    id: newRecordId("audit"),
    brand_id: brandId,
    actor_email: entry.actor_email ?? null,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id ?? null,
    detail: entry.detail ?? null,
    created_at: entry.created_at ?? new Date().toISOString(),
  };
  upsertRow("audit_log", row as unknown as Record<string, unknown>);
  return row;
}
