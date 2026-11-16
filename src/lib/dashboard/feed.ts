import { lowStockProducts, productStock } from "@/lib/business/overview";
import { formatMoney } from "@/lib/format";
import { staffAvailabilitySummary } from "@/lib/manager/staff";
import type {
  AuditLogEntry,
  Order,
  Product,
} from "@/types/database";
import type { Appointment } from "@/types/operations";
import type { StaffMember } from "@/types/manager";

/**
 * Shapes the raw records a workspace already has into the small lists the
 * Dashboard cards render. Pure and server-safe so both the demo and live
 * branches of the page feed the same component.
 */

export type ActivityItem = {
  id: string;
  kind: "order" | "audit";
  label: string;
  detail: string;
  href: string;
  /** ISO instant, used for ordering the merged feed. */
  at: string;
};

export type DashboardAppointment = {
  id: string;
  title: string;
  startsAt: string;
  staffNames: string[];
};

export type DashboardStockAlert = {
  id: string;
  name: string;
  stock: number;
  threshold: number;
};

export type DashboardStaffAvailability = ReturnType<
  typeof staffAvailabilitySummary
> & { onShiftNow: number };

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "order.created": "Order created",
  "order.status": "Order status changed",
  "order.note": "Order note added",
  "payment.recorded": "Payment recorded",
  "payment.refunded": "Refund recorded",
  "quote.accepted": "Quotation accepted",
  "customer.created": "Customer added",
  "customer.updated": "Customer updated",
  "product.created": "Product added",
  "product.updated": "Product updated",
  "stock.adjusted": "Stock adjusted",
};

function humanizeAction(action: string): string {
  const known = AUDIT_ACTION_LABELS[action];
  if (known) return known;
  return action
    .replace(/[._]/g, " ")
    .replace(/^\p{L}/u, (letter) => letter.toUpperCase());
}

function entityHref(entityType: string, entityId: string | null): string {
  if (entityId && entityType === "order") return `/orders/${entityId}`;
  if (entityId && entityType === "customer") return `/customers/${entityId}`;
  if (entityType === "product") return "/manager/products/catalogue";
  if (entityType === "payment") return "/manager/finance/payments";
  return "/orders";
}

/**
 * Merges recent orders with recent audit entries into one newest-first feed.
 * An `order.created` audit row is dropped when the order itself is already in
 * the feed, so a fresh sale is not listed twice.
 */
export function buildRecentActivity(params: {
  orders: Order[];
  audit?: AuditLogEntry[];
  currencyCode: string;
  limit?: number;
}): ActivityItem[] {
  const limit = params.limit ?? 8;
  const orderRows: ActivityItem[] = params.orders.map((order) => ({
    id: `order-${order.id}`,
    kind: "order",
    label: order.order_number,
    detail: `${order.customer_name_snapshot ?? "Walk-in"} · ${formatMoney(
      order.grand_total,
      params.currencyCode,
    )} · ${order.status}`,
    href: `/orders/${order.id}`,
    at: order.created_at,
  }));
  const seenOrders = new Set(params.orders.map((order) => order.id));

  const auditRows: ActivityItem[] = (params.audit ?? [])
    .filter(
      (entry) =>
        !(
          entry.action === "order.created" &&
          entry.entity_id != null &&
          seenOrders.has(entry.entity_id)
        ),
    )
    .map((entry) => ({
      id: `audit-${entry.id}`,
      kind: "audit",
      label: humanizeAction(entry.action),
      detail: entry.detail
        ? `${entry.detail} · ${entry.actor_email ?? "system"}`
        : `${entry.entity_type} · ${entry.actor_email ?? "system"}`,
      href: entityHref(entry.entity_type, entry.entity_id),
      at: entry.created_at,
    }));

  return [...orderRows, ...auditRows]
    .sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    )
    .slice(0, limit);
}

function sameCalendarDay(instant: string, now: Date): boolean {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/** Today's scheduled appointments, soonest first, with staff names attached. */
export function appointmentsForDay(
  appointments: Appointment[],
  staff: StaffMember[],
  now: Date = new Date(),
  limit = 5,
): DashboardAppointment[] {
  const nameById = new Map(staff.map((member) => [member.id, member.name]));
  return appointments
    .filter(
      (appointment) =>
        appointment.status === "scheduled" &&
        sameCalendarDay(appointment.startsAt, now),
    )
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    )
    .slice(0, limit)
    .map((appointment) => ({
      id: appointment.id,
      title: appointment.title,
      startsAt: appointment.startsAt,
      staffNames: appointment.staffIds.map(
        (id) => nameById.get(id) ?? "Unassigned",
      ),
    }));
}

/** Lowest-stock-first reorder list, using the shared low-stock definition. */
export function stockAlerts(
  products: Product[],
  limit = 5,
): DashboardStockAlert[] {
  return lowStockProducts(products)
    .slice(0, limit)
    .map((product) => ({
      id: product.id,
      name: product.name,
      stock: productStock(product),
      threshold: product.low_stock_threshold ?? 0,
    }));
}

export function staffAvailability(
  staff: StaffMember[],
  onShiftNow: number,
): DashboardStaffAvailability {
  return { ...staffAvailabilitySummary(staff), onShiftNow };
}
