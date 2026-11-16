import { csvBrandId } from "@/lib/csv/source";
import {
  dropBrand,
  listBrand,
  newRecordId,
  saveBrand,
  updateBrand,
} from "@/lib/csv/records";
import type { CsvTable } from "@/lib/csv/schema";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type {
  AttendanceRecord,
  CashMovement,
  CashSession,
  Expense,
  LeaveRequest,
  Note,
  PurchaseOrder,
  Supplier,
} from "@/types/business";
import type { ExternalEvent, PendingSyncAction } from "@/types/integrations";

/**
 * Entity collections that the four managers read and write.
 *
 * A collection is now a thin view over one `data/*.csv` table: `load` lists the
 * brand's rows, `append` writes a new one, `patch` merges into an existing row
 * and `remove` deletes it. Everything is brand-scoped by `brand_id`, so another
 * brand's row can never be read or touched, and an edit survives a server
 * restart because it is a file — the reason the chunked-cookie bucket was
 * dropped. Live workspaces keep these on the Supabase side once
 * `docs/DATABASE_CONTRACT.md` tables exist.
 */
export type BusinessCollections = {
  notes: Note;
  expenses: Expense;
  suppliers: Supplier;
  purchaseOrders: PurchaseOrder;
  attendance: AttendanceRecord;
  leave: LeaveRequest;
  cashMovements: CashMovement;
  cashSessions: CashSession;
  externalEvents: ExternalEvent;
  syncActions: PendingSyncAction;
};

export type BusinessCollectionKey = keyof BusinessCollections;

export type Collection<T> = {
  key: BusinessCollectionKey;
  load(brandCode: DemoBrandCode): Promise<T[]>;
  append(brandCode: DemoBrandCode, entity: T): Promise<void>;
  patch(brandCode: DemoBrandCode, id: string, value: Partial<T>): Promise<void>;
  remove(brandCode: DemoBrandCode, id: string): Promise<void>;
  nextId(): string;
};

/**
 * Collection keys are camelCase app names; the CSV file is the snake_case table.
 * Two keys differ from their table name (`leave`, `purchaseOrders`), so the
 * mapping is stated once here instead of at each registry entry.
 */
const TABLE_BY_KEY: Record<BusinessCollectionKey, CsvTable> = {
  notes: "notes",
  expenses: "expenses",
  suppliers: "suppliers",
  purchaseOrders: "purchase_orders",
  attendance: "attendance",
  leave: "leave_requests",
  cashMovements: "cash_movements",
  cashSessions: "cash_sessions",
  externalEvents: "external_events",
  syncActions: "sync_actions",
};

export function createCollection<T extends { id: string }>(params: {
  key: BusinessCollectionKey;
  idPrefix: string;
  /**
   * Unused: the rows were fixtures, and `seed.ts` already wrote them into the
   * CSV on first access, so reading the table is reading the fixtures plus every
   * edit since. Kept in the signature because the registry passes it.
   */
  fixtures: (brandCode: DemoBrandCode) => T[];
}): Collection<T> {
  const table = TABLE_BY_KEY[params.key];

  return {
    key: params.key,
    async load(brandCode) {
      return listBrand<T>(table, csvBrandId(brandCode));
    },
    async append(brandCode, entity) {
      saveBrand(table, csvBrandId(brandCode), entity);
    },
    async patch(brandCode, id, value) {
      /* A miss means the row is gone or belongs to another brand. Callers read
         the row back first, so this stays silent like the bucket override did. */
      updateBrand(table, csvBrandId(brandCode), id, value as Record<string, unknown>);
    },
    async remove(brandCode, id) {
      dropBrand(table, csvBrandId(brandCode), id);
    },
    nextId() {
      return newRecordId(params.idPrefix);
    },
  };
}
