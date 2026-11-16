import { createCollection, type BusinessCollectionKey } from "./collections";
import { csvFixtures } from "@/lib/csv/source";
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
 * The platform collections behind the four managers. Every Manager screen
 * reads and writes through these, and a collection is one `data/*.csv` table:
 * base rows are auto-seeded from the demo fixtures on first access, then every
 * in-app add, edit and delete is a row in that file (see
 * `src/lib/business/collections.ts`). Nothing layers on top any more, so a row
 * an owner edits by hand is exactly what the screen shows.
 */
export const notesCollection = createCollection<Note>({
  key: "notes",
  idPrefix: "note",
  fixtures: csvFixtures<Note>("notes"),
});

export const expensesCollection = createCollection<Expense>({
  key: "expenses",
  idPrefix: "exp",
  fixtures: csvFixtures<Expense>("expenses"),
});

export const suppliersCollection = createCollection<Supplier>({
  key: "suppliers",
  idPrefix: "sup",
  fixtures: csvFixtures<Supplier>("suppliers"),
});

export const purchaseOrdersCollection = createCollection<PurchaseOrder>({
  key: "purchaseOrders",
  idPrefix: "po",
  fixtures: csvFixtures<PurchaseOrder>("purchase_orders"),
});

export const attendanceCollection = createCollection<AttendanceRecord>({
  key: "attendance",
  idPrefix: "att",
  fixtures: csvFixtures<AttendanceRecord>("attendance"),
});

export const leaveCollection = createCollection<LeaveRequest>({
  key: "leave",
  idPrefix: "leave",
  fixtures: csvFixtures<LeaveRequest>("leave_requests"),
});

export const cashMovementsCollection = createCollection<CashMovement>({
  key: "cashMovements",
  idPrefix: "cashmv",
  fixtures: csvFixtures<CashMovement>("cash_movements"),
});

export const cashSessionsCollection = createCollection<CashSession>({
  key: "cashSessions",
  idPrefix: "cashsn",
  fixtures: csvFixtures<CashSession>("cash_sessions"),
});

export const externalEventsCollection = createCollection<ExternalEvent>({
  key: "externalEvents",
  idPrefix: "ext",
  fixtures: csvFixtures<ExternalEvent>("external_events"),
});

export const syncActionsCollection = createCollection<PendingSyncAction>({
  key: "syncActions",
  idPrefix: "synca",
  fixtures: csvFixtures<PendingSyncAction>("sync_actions"),
});

export type BusinessData = {
  notes: Note[];
  expenses: Expense[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  attendance: AttendanceRecord[];
  leave: LeaveRequest[];
  cashMovements: CashMovement[];
  cashSessions: CashSession[];
  externalEvents: ExternalEvent[];
  syncActions: PendingSyncAction[];
};

/** One round trip per collection — used by overview pages that span managers. */
export async function loadBusinessData(brandCode: DemoBrandCode): Promise<BusinessData> {
  const [
    notes,
    expenses,
    suppliers,
    purchaseOrders,
    attendance,
    leave,
    cashMovements,
    cashSessions,
    externalEvents,
    syncActions,
  ] = await Promise.all([
    notesCollection.load(brandCode),
    expensesCollection.load(brandCode),
    suppliersCollection.load(brandCode),
    purchaseOrdersCollection.load(brandCode),
    attendanceCollection.load(brandCode),
    leaveCollection.load(brandCode),
    cashMovementsCollection.load(brandCode),
    cashSessionsCollection.load(brandCode),
    externalEventsCollection.load(brandCode),
    syncActionsCollection.load(brandCode),
  ]);

  return {
    notes,
    expenses,
    suppliers,
    purchaseOrders,
    attendance,
    leave,
    cashMovements,
    cashSessions,
    externalEvents,
    syncActions,
  };
}

export type { BusinessCollectionKey };
