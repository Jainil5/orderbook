import { createCollection, type BusinessCollectionKey } from "./collections";
import { demoExpenses, demoCashMovements, demoCashSessions } from "@/lib/demo/business/finance";
import { demoNotes } from "@/lib/demo/business/notes";
import { demoPurchaseOrders, demoSuppliers } from "@/lib/demo/business/procurement";
import { demoAttendance, demoLeave } from "@/lib/demo/business/workforce";
import { demoExternalEvents, demoSyncActions } from "@/lib/demo/business/calendar";
import type { DemoBrandCode } from "@/lib/workspace/constants";

/**
 * The platform collections behind the four managers. Every Manager screen
 * reads through these so demo edits and fixtures merge the same way, and so a
 * live Supabase implementation only has to replace one file per collection.
 */
export const notesCollection = createCollection({
  key: "notes",
  idPrefix: "note",
  fixtures: demoNotes,
});

export const expensesCollection = createCollection({
  key: "expenses",
  idPrefix: "exp",
  fixtures: demoExpenses,
});

export const suppliersCollection = createCollection({
  key: "suppliers",
  idPrefix: "sup",
  fixtures: demoSuppliers,
});

export const purchaseOrdersCollection = createCollection({
  key: "purchaseOrders",
  idPrefix: "po",
  fixtures: demoPurchaseOrders,
});

export const attendanceCollection = createCollection({
  key: "attendance",
  idPrefix: "att",
  fixtures: demoAttendance,
});

export const leaveCollection = createCollection({
  key: "leave",
  idPrefix: "leave",
  fixtures: demoLeave,
});

export const cashMovementsCollection = createCollection({
  key: "cashMovements",
  idPrefix: "cashmv",
  fixtures: demoCashMovements,
});

export const cashSessionsCollection = createCollection({
  key: "cashSessions",
  idPrefix: "cashsn",
  fixtures: demoCashSessions,
});

export const externalEventsCollection = createCollection({
  key: "externalEvents",
  idPrefix: "ext",
  fixtures: demoExternalEvents,
});

export const syncActionsCollection = createCollection({
  key: "syncActions",
  idPrefix: "synca",
  fixtures: demoSyncActions,
});

export type BusinessData = {
  notes: ReturnType<typeof demoNotes>;
  expenses: ReturnType<typeof demoExpenses>;
  suppliers: ReturnType<typeof demoSuppliers>;
  purchaseOrders: ReturnType<typeof demoPurchaseOrders>;
  attendance: ReturnType<typeof demoAttendance>;
  leave: ReturnType<typeof demoLeave>;
  cashMovements: ReturnType<typeof demoCashMovements>;
  cashSessions: ReturnType<typeof demoCashSessions>;
  externalEvents: ReturnType<typeof demoExternalEvents>;
  syncActions: ReturnType<typeof demoSyncActions>;
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
