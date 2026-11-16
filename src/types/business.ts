/**
 * Platform business entities used by the four specialized managers.
 *
 * These extend the operational types in `types/operations.ts` (tasks,
 * appointments, visits, shifts, services) and the transactional types in
 * `types/database.ts` (orders, payments, refunds, products). Field naming
 * follows the existing convention: `snake_case` for `id`/`brand_id`/timestamps,
 * camelCase for the rest, matching `types/operations.ts`.
 */

export type NoteScope = "personal" | "shared";

export const NOTE_CATEGORIES = [
  "general",
  "customer",
  "operations",
  "finance",
  "idea",
  "meeting",
] as const;

export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export type Note = {
  id: string;
  brand_id: string;
  title: string;
  body: string;
  category: NoteCategory;
  scope: NoteScope;
  pinned: boolean;
  linkedCustomerId: string | null;
  linkedStaffId: string | null;
  linkedAppointmentId: string | null;
  linkedTaskId: string | null;
  created_at: string;
  updated_at: string;
};

export const EXPENSE_CATEGORIES = [
  "raw_materials",
  "rent",
  "utilities",
  "salaries",
  "marketing",
  "maintenance",
  "delivery",
  "packaging",
  "software",
  "other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type ExpenseRecurring = "none" | "weekly" | "monthly";

export type Expense = {
  id: string;
  brand_id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  method: string;
  /** ISO date (YYYY-MM-DD) the expense was incurred. */
  incurredOn: string;
  recurring: ExpenseRecurring;
  supplierId: string | null;
  notes: string;
  created_at: string;
};

export type Supplier = {
  id: string;
  brand_id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  category: string | null;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  notes: string;
  is_active: boolean;
  created_at: string;
};

export type PurchaseOrderLine = {
  productId: string | null;
  name: string;
  qty: number;
  unitCost: number;
  receivedQty: number;
};

export type PurchaseOrderStatus =
  | "draft"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";

export type PurchaseOrder = {
  id: string;
  brand_id: string;
  poNumber: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  expectedOn: string | null;
  createdAt: string;
  lines: PurchaseOrderLine[];
  notes: string;
};

export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "late",
  "half_day",
  "leave",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export type AttendanceRecord = {
  id: string;
  brand_id: string;
  staffId: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  note: string;
};

export const LEAVE_KINDS = ["casual", "sick", "earned", "unpaid"] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];

export type LeaveStatus = "pending" | "approved" | "rejected";

export type LeaveRequest = {
  id: string;
  brand_id: string;
  staffId: string;
  startsOn: string;
  endsOn: string;
  kind: LeaveKind;
  status: LeaveStatus;
  reason: string;
  createdAt: string;
};

export type CashMovementDirection = "in" | "out";

export type CashMovement = {
  id: string;
  brand_id: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  direction: CashMovementDirection;
  amount: number;
  reason: string;
  method: string;
  /** Where the record came from: a bill, an expense, or entered by hand. */
  source: "billing" | "expense" | "manual";
  refId: string | null;
};

export type CashSession = {
  id: string;
  brand_id: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  openingBalance: number;
  /** Null until the drawer is counted and closed. */
  countedBalance: number | null;
  closedAt: string | null;
  staffId: string | null;
  note: string;
};

export type BusinessEntityKind =
  | "notes"
  | "expenses"
  | "suppliers"
  | "purchaseOrders"
  | "attendance"
  | "leave"
  | "cashMovements"
  | "cashSessions";
