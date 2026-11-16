import type { Product } from "@/types/database";
import type { Expense, LeaveRequest, PurchaseOrder } from "@/types/business";
import type { Appointment, Shift, Task } from "@/types/operations";
import { isTaskOverdue } from "@/lib/manager/tasks";
import { isOpenReceivable, isOpenQuote } from "@/lib/orders/order-rules";
import type { Order } from "@/types/database";

/**
 * Cross-manager rollups: the handful of numbers every overview screen
 * (`/manager`, the four manager landing pages, the Dashboard) agrees on, so
 * the same definition of "today" or "low stock" is not reimplemented per page.
 */

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function inMonth(a: Date, now: Date): boolean {
  return a.getFullYear() === now.getFullYear() && a.getMonth() === now.getMonth();
}

export function productStock(product: Product): number {
  return product.stock_qty ?? 0;
}

export function isLowStock(product: Product): boolean {
  if (!product.is_active) return false;
  const threshold = product.low_stock_threshold;
  if (threshold == null) return false;
  return productStock(product) <= threshold;
}

export function isOutOfStock(product: Product): boolean {
  return product.is_active && product.low_stock_threshold != null && productStock(product) <= 0;
}

export function lowStockProducts(products: Product[]): Product[] {
  return products
    .filter(isLowStock)
    .sort((a, b) => productStock(a) - productStock(b));
}

/** Cost-basis inventory valuation, ignoring lines with no cost on record. */
export function inventoryValuation(products: Product[]): {
  units: number;
  costValue: number;
  retailValue: number;
} {
  let units = 0;
  let costValue = 0;
  let retailValue = 0;
  for (const product of products) {
    const qty = productStock(product);
    if (qty <= 0) continue;
    units += qty;
    costValue += qty * (product.cost_price ?? 0);
    retailValue += qty * product.price;
  }
  return { units, costValue, retailValue };
}

/** In stock, active, and absent from every order line in the window. */
export function isDeadStock(
  product: Product,
  soldProductIds: ReadonlySet<string>,
): boolean {
  return product.is_active && productStock(product) > 0 && !soldProductIds.has(product.id);
}

export type RollupInput = {
  orders: Order[];
  products: Product[];
  tasks: Task[];
  appointments: Appointment[];
  shifts: Shift[];
  expenses: Expense[];
  purchaseOrders: PurchaseOrder[];
  leave: LeaveRequest[];
};

export type ManagerRollups = {
  salesToday: number;
  ordersToday: number;
  pendingOrders: number;
  outstandingAmount: number;
  openQuotes: number;
  tasksOpen: number;
  tasksOverdue: number;
  tasksDueToday: number;
  appointmentsToday: number;
  onShiftNow: number;
  lowStockCount: number;
  outOfStockCount: number;
  expensesThisMonth: number;
  openPurchaseOrders: number;
  pendingLeave: number;
};

export function computeRollups(
  input: RollupInput,
  now: Date = new Date(),
): ManagerRollups {
  const todayOrders = input.orders.filter((o) =>
    sameDay(new Date(o.created_at), now),
  );
  const salesToday = todayOrders
    .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
    .reduce((total, o) => total + o.grand_total, 0);

  const outstanding = input.orders.filter(isOpenReceivable);
  const shiftStart = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const today = input.shifts.filter((s) => s.date === isoDayOf(now));

  return {
    salesToday,
    ordersToday: todayOrders.length,
    pendingOrders: input.orders.filter(
      (o) => o.status === "confirmed" || o.status === "draft",
    ).length,
    outstandingAmount: outstanding.reduce(
      (total, o) => total + (o.grand_total - (o.amount_paid ?? 0)),
      0,
    ),
    openQuotes: input.orders.filter(isOpenQuote).length,
    tasksOpen: input.tasks.filter((t) => t.status !== "done").length,
    tasksOverdue: input.tasks.filter((t) => isTaskOverdue(t, now)).length,
    tasksDueToday: input.tasks.filter(
      (t) => t.status !== "done" && t.dueAt && sameDay(new Date(t.dueAt), now),
    ).length,
    appointmentsToday: input.appointments.filter(
      (a) =>
        a.status === "scheduled" && sameDay(new Date(a.startsAt), now),
    ).length,
    onShiftNow: today.filter(
      (s) => shiftStart(s.start) <= minutesNow && minutesNow < shiftStart(s.end),
    ).length,
    lowStockCount: input.products.filter(isLowStock).length,
    outOfStockCount: input.products.filter(isOutOfStock).length,
    expensesThisMonth: input.expenses
      .filter((e) => inMonth(new Date(e.incurredOn), now))
      .reduce((total, e) => total + e.amount, 0),
    openPurchaseOrders: input.purchaseOrders.filter(
      (po) => po.status === "ordered" || po.status === "partially_received",
    ).length,
    pendingLeave: input.leave.filter((l) => l.status === "pending").length,
  };
}

export function isoDayOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
