import { cookies } from "next/headers";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import { readChunkedCookie, writeChunkedCookie } from "./chunked-cookie";
import type {
  AuditLogEntry,
  Customer,
  Offer,
  Order,
  Payment,
  Product,
  Refund,
  StockAdjustment,
} from "@/types/database";
import type { StaffMember } from "@/types/manager";
import type { Appointment, FieldVisit, Service, ServiceJob, Shift, Task } from "@/types/operations";
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

export const DEMO_MUTABLE_COOKIE = "ob_demo_mutable_v1";

export type DemoMutableBucket = {
  customers: Customer[];
  offers: Offer[];
  payments: Payment[];
  orderPatches: Record<string, Partial<Order>>;
  productOverrides: Record<string, Partial<Product>>;
  auditLog: AuditLogEntry[];
  stockAdjustments: StockAdjustment[];
  refunds: Refund[];
  staff: StaffMember[];
  staffOverrides: Record<string, Partial<StaffMember>>;
  services: Service[];
  serviceOverrides: Record<string, Partial<Service> & { deleted?: boolean }>;
  serviceJobs: ServiceJob[];
  serviceJobOverrides: Record<string, Partial<ServiceJob> & { deleted?: boolean }>;
  appointments: Appointment[];
  appointmentOverrides: Record<string, Partial<Appointment> & { deleted?: boolean }>;
  tasks: Task[];
  taskOverrides: Record<string, Partial<Task> & { deleted?: boolean }>;
  shifts: Shift[];
  shiftOverrides: Record<string, Partial<Shift> & { deleted?: boolean }>;
  visits: FieldVisit[];
  visitOverrides: Record<string, Partial<FieldVisit> & { deleted?: boolean }>;
  notes: Note[];
  noteOverrides: Record<string, Partial<Note> & { deleted?: boolean }>;
  expenses: Expense[];
  expenseOverrides: Record<string, Partial<Expense> & { deleted?: boolean }>;
  suppliers: Supplier[];
  supplierOverrides: Record<string, Partial<Supplier> & { deleted?: boolean }>;
  purchaseOrders: PurchaseOrder[];
  purchaseOrderOverrides: Record<
    string,
    Partial<PurchaseOrder> & { deleted?: boolean }
  >;
  attendance: AttendanceRecord[];
  attendanceOverrides: Record<
    string,
    Partial<AttendanceRecord> & { deleted?: boolean }
  >;
  leave: LeaveRequest[];
  leaveOverrides: Record<string, Partial<LeaveRequest> & { deleted?: boolean }>;
  cashMovements: CashMovement[];
  cashMovementOverrides: Record<
    string,
    Partial<CashMovement> & { deleted?: boolean }
  >;
  cashSessions: CashSession[];
  cashSessionOverrides: Record<
    string,
    Partial<CashSession> & { deleted?: boolean }
  >;
  externalEvents: ExternalEvent[];
  externalEventOverrides: Record<
    string,
    Partial<ExternalEvent> & { deleted?: boolean }
  >;
  syncActions: PendingSyncAction[];
  syncActionOverrides: Record<
    string,
    Partial<PendingSyncAction> & { deleted?: boolean }
  >;
};

type DemoMutableStore = Partial<Record<DemoBrandCode, DemoMutableBucket>>;

function emptyBucket(): DemoMutableBucket {
  return {
    customers: [],
    offers: [],
    payments: [],
    orderPatches: {},
    productOverrides: {},
    auditLog: [],
    stockAdjustments: [],
    refunds: [],
    staff: [],
    staffOverrides: {},
    services: [],
    serviceOverrides: {},
    serviceJobs: [],
    serviceJobOverrides: {},
    appointments: [],
    appointmentOverrides: {},
    tasks: [],
    taskOverrides: {},
    shifts: [],
    shiftOverrides: {},
    visits: [],
    visitOverrides: {},
    notes: [],
    noteOverrides: {},
    expenses: [],
    expenseOverrides: {},
    suppliers: [],
    supplierOverrides: {},
    purchaseOrders: [],
    purchaseOrderOverrides: {},
    attendance: [],
    attendanceOverrides: {},
    leave: [],
    leaveOverrides: {},
    cashMovements: [],
    cashMovementOverrides: {},
    cashSessions: [],
    cashSessionOverrides: {},
    externalEvents: [],
    externalEventOverrides: {},
    syncActions: [],
    syncActionOverrides: {},
  };
}

function parseStore(raw: string | undefined): DemoMutableStore {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as DemoMutableStore;
  } catch {
    return {};
  }
}

export async function readDemoMutableBucket(
  brandCode: DemoBrandCode,
): Promise<DemoMutableBucket> {
  const cookieStore = await cookies();
  const store = parseStore(readChunkedCookie(cookieStore, DEMO_MUTABLE_COOKIE));
  return store[brandCode] ?? emptyBucket();
}

async function writeDemoMutableStore(store: DemoMutableStore): Promise<void> {
  const cookieStore = await cookies();
  writeChunkedCookie(cookieStore, DEMO_MUTABLE_COOKIE, JSON.stringify(store), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function updateDemoMutableBucket(
  brandCode: DemoBrandCode,
  mutate: (bucket: DemoMutableBucket) => DemoMutableBucket,
): Promise<void> {
  const cookieStore = await cookies();
  const store = parseStore(readChunkedCookie(cookieStore, DEMO_MUTABLE_COOKIE));
  const current = store[brandCode] ?? emptyBucket();
  store[brandCode] = mutate(current);
  await writeDemoMutableStore(store);
}

export async function appendDemoAudit(
  brandCode: DemoBrandCode,
  entry: Omit<AuditLogEntry, "id" | "created_at">,
): Promise<void> {
  await updateDemoMutableBucket(brandCode, (bucket) => ({
    ...bucket,
    auditLog: [
      {
        ...entry,
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date().toISOString(),
      },
      ...bucket.auditLog,
    ].slice(0, 200),
  }));
}
