/**
 * Test-only factories.
 *
 * Nothing in the production code of the AI area imports this file. It exists so
 * `context.test.ts`, `insight-engine.test.ts`, `assistant.test.ts` and
 * `automations.test.ts` describe the same synthetic workspace: one fixed clock,
 * dates derived from the same helpers `context.ts` uses (so the fixtures never
 * depend on the machine's timezone), and entities that satisfy the real type
 * definitions rather than a loose `as` cast.
 */

import {
  addCalendarDays,
  rangeFromPreset,
  zoneDayStartUtc,
} from "@/lib/analytics/date-range";
import { isoDayOf } from "@/lib/business/overview";
import type {
  CashMovement,
  CashSession,
  Expense,
  LeaveRequest,
  PurchaseOrder,
  Supplier,
} from "@/types/business";
import type {
  Customer,
  Order,
  OrderItem,
  Product,
} from "@/types/database";
import type { Appointment, Shift, Task } from "@/types/operations";
import type { StaffMember } from "@/types/manager";
import {
  buildBusinessContext,
  type BusinessContext,
  type BusinessContextInput,
} from "./context";

/** Fixed clock: 06:00Z on 1 April 2026 — 11:30 IST, comfortably mid-day. */
export const NOW = new Date("2026-04-01T06:00:00.000Z");
export const TODAY = isoDayOf(NOW);
export const WINDOW = rangeFromPreset("30d", NOW);

/**
 * ISO instant `daysBack` business calendar days before the end of the window,
 * a few hours after that day's zone start — the same arithmetic `context.ts`
 * uses, so a fixture "5 days ago" is 5 days old by every rule in the engine.
 */
export function dayInstant(daysBack = 0, hoursAfterZoneStart = 3): string {
  const date = addCalendarDays(WINDOW.to, -daysBack);
  return new Date(
    zoneDayStartUtc(date) + hoursAfterZoneStart * 3_600_000,
  ).toISOString();
}

/** Calendar date `days` away from `calendarDate`, using the same helper as the context. */
export function addDays(calendarDate: string, days: number): string {
  return addCalendarDays(calendarDate, days);
}

/** `HH:mm` a given number of minutes from the clock `context.ts` reads. */
export function clockAt(offsetMinutes: number): string {
  const minutes = NOW.getHours() * 60 + NOW.getMinutes() + offsetMinutes;
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function product(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    brand_id: "b1",
    name: "Flat White",
    description: null,
    sku: "SKU-1",
    category: "Coffee",
    price: 220,
    cost_price: 55,
    unit: "cup",
    is_active: true,
    stock_qty: 40,
    low_stock_threshold: 10,
    ...over,
  };
}

export function order(over: Partial<Order> = {}): Order {
  return {
    id: "o1",
    brand_id: "b1",
    order_number: "BC-1001",
    status: "completed",
    payment_status: "paid",
    customer_id: "c1",
    customer_name_snapshot: "Ananya Rao",
    subtotal: 540,
    discount_total: 0,
    tax_total: 0,
    fees_total: 0,
    grand_total: 540,
    amount_paid: 540,
    notes: null,
    created_at: dayInstant(1),
    ...over,
  };
}

export function orderItem(over: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "i1",
    order_id: "o1",
    product_id: "p1",
    product_name_snapshot: "Flat White",
    quantity: 2,
    unit_price: 220,
    line_discount: 0,
    line_total: 440,
    ...over,
  };
}

export function customer(over: Partial<Customer> = {}): Customer {
  return {
    id: "c1",
    brand_id: "b1",
    name: "Ananya Rao",
    email: null,
    phone: null,
    ...over,
  };
}

export function task(over: Partial<Task> = {}): Task {
  return {
    id: "t1",
    brand_id: "b1",
    title: "Restock beans",
    description: "",
    assigneeStaffId: null,
    customerId: null,
    priority: "medium",
    dueAt: dayInstant(-1, 20),
    status: "open",
    ...over,
  };
}

export function appointment(over: Partial<Appointment> = {}): Appointment {
  return {
    id: "a1",
    brand_id: "b1",
    title: "Table for four",
    customerId: "c1",
    staffIds: [],
    startsAt: `${TODAY}T10:00:00.000Z`,
    endsAt: `${TODAY}T11:00:00.000Z`,
    location: "Front room",
    serviceId: null,
    status: "scheduled",
    notes: "",
    ...over,
  };
}

export function shift(over: Partial<Shift> = {}): Shift {
  return {
    id: "sh1",
    brand_id: "b1",
    staffId: "s1",
    date: TODAY,
    start: clockAt(-120),
    end: clockAt(120),
    note: "",
    ...over,
  };
}

export function staff(over: Partial<StaffMember> = {}): StaffMember {
  return {
    id: "s1",
    brand_id: "b1",
    name: "Ravi Menon",
    role: "cashier",
    phone: null,
    email: null,
    status: "active",
    availability: "available",
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

export function expense(over: Partial<Expense> = {}): Expense {
  return {
    id: "e1",
    brand_id: "b1",
    title: "Rent",
    category: "rent",
    amount: 2000,
    method: "bank",
    incurredOn: TODAY,
    recurring: "monthly",
    supplierId: null,
    notes: "",
    created_at: `${TODAY}T06:00:00.000Z`,
    ...over,
  };
}

export function supplier(over: Partial<Supplier> = {}): Supplier {
  return {
    id: "sup1",
    brand_id: "b1",
    name: "Bean Wholesale Co",
    contactName: null,
    phone: null,
    email: null,
    category: null,
    leadTimeDays: 2,
    paymentTerms: null,
    notes: "",
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

export function purchaseOrder(over: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: "po1",
    brand_id: "b1",
    poNumber: "PO-1",
    supplierId: "sup1",
    status: "ordered",
    expectedOn: addCalendarDays(TODAY, -1),
    createdAt: `${TODAY}T06:00:00.000Z`,
    lines: [],
    notes: "",
    ...over,
  };
}

export function cashMovement(over: Partial<CashMovement> = {}): CashMovement {
  return {
    id: "cm1",
    brand_id: "b1",
    date: TODAY,
    direction: "in",
    amount: 1500,
    reason: "Counter sales",
    method: "cash",
    source: "billing",
    refId: null,
    ...over,
  };
}

export function cashSession(over: Partial<CashSession> = {}): CashSession {
  return {
    id: "cs1",
    brand_id: "b1",
    date: TODAY,
    openingBalance: 500,
    countedBalance: null,
    closedAt: null,
    staffId: null,
    note: "",
    ...over,
  };
}

export function leave(over: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: "lv1",
    brand_id: "b1",
    staffId: "s1",
    startsOn: TODAY,
    endsOn: TODAY,
    kind: "casual",
    status: "pending",
    reason: "Personal",
    createdAt: `${TODAY}T06:00:00.000Z`,
    ...over,
  };
}

/** What a test may change about the synthetic workspace. */
export type WorkspaceSeed = BusinessContextInput;

/** An empty workspace: every rule must be able to face this without guessing. */
export function baseInput(
  over: Partial<BusinessContextInput> = {},
): BusinessContextInput {
  return {
    brandCode: "BR-1",
    brandName: "Test Brand",
    currencyCode: "INR",
    orders: [],
    orderItems: [],
    products: [],
    customers: [],
    tasks: [],
    appointments: [],
    shifts: [],
    staff: [],
    expenses: [],
    purchaseOrders: [],
    suppliers: [],
    cashMovements: [],
    cashSessions: [],
    leave: [],
    ...over,
  };
}

export function fixtureContext(
  over: Partial<BusinessContextInput> = {},
  now: Date = NOW,
): BusinessContext {
  return buildBusinessContext(baseInput(over), now);
}
