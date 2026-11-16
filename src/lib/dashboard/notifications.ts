import {
  isOutOfStock,
  isoDayOf,
  type ManagerRollups,
} from "@/lib/business/overview";
import { formatMoney } from "@/lib/format";
import { isTaskOverdue } from "@/lib/manager/tasks";
import { isOpenReceivable } from "@/lib/orders/order-rules";
import { ALL_MANAGER_SECTIONS } from "@/lib/workspace/managers";
import type { LeaveRequest, PurchaseOrder } from "@/types/business";
import type { Order, Product } from "@/types/database";
import type { Task } from "@/types/operations";

/**
 * The Dashboard "Important notifications" list.
 *
 * Every row is derived from records the workspace already holds — nothing here
 * is invented or threshold-guessed beyond what is stated on the row. The rules
 * are pure so the card and its tests share one definition of "overdue".
 */

export type NotificationSeverity = "critical" | "warning" | "info";

export type NotificationRuleId =
  | "out_of_stock"
  | "overdue_invoices"
  | "overdue_tasks"
  | "purchase_order_late"
  | "pending_leave";

export type DashboardNotification = {
  id: NotificationRuleId;
  severity: NotificationSeverity;
  /** What needs attention, e.g. "Overdue invoices". */
  title: string;
  /** The evidence: count, amount and the oldest item, so the row explains itself. */
  detail: string;
  /** Short module label shown beside the row. */
  module: string;
  /** Route into the module that clears the item. */
  href: string;
  count: number;
};

export type DashboardNotificationInput = {
  rollups: ManagerRollups;
  orders: Order[];
  products: Product[];
  tasks: Task[];
  leave: LeaveRequest[];
  purchaseOrders: PurchaseOrder[];
  currencyCode: string;
  now?: Date;
};

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Section hrefs/labels come from the manager registry so routes cannot drift. */
function section(key: string): { href: string; module: string } {
  const found = ALL_MANAGER_SECTIONS.find((s) => s.key === key);
  return { href: found?.href ?? "/manager", module: found?.navLabel ?? "Manager" };
}

/** Whole days between a `YYYY-MM-DD` calendar date and "today", never negative. */
export function daysSinceCalendarDate(value: string, now: Date): number {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return 0;
  const then = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const today = isoDayOf(now).split("-").map(Number);
  const nowStamp = Date.UTC(today[0], today[1] - 1, today[2]);
  return Math.max(0, Math.round((nowStamp - then) / 86_400_000));
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

type RuleResult = { title: string; detail: string; count: number } | null;

type Rule = {
  id: NotificationRuleId;
  severity: NotificationSeverity;
  module: string;
  href: string;
  build: (input: DashboardNotificationInput, now: Date) => RuleResult;
};

const RULES: Rule[] = [
  {
    id: "out_of_stock",
    severity: "critical",
    ...section("inventory"),
    build: ({ products }) => {
      const rows = products.filter(isOutOfStock);
      if (!rows.length) return null;
      const named = rows
        .slice(0, 2)
        .map((product) => product.name)
        .join(", ");
      return {
        title: "Out of stock",
        detail: `${plural(rows.length, "item")} at zero stock${
          named ? `: ${named}${rows.length > 2 ? "…" : ""}` : ""
        }.`,
        count: rows.length,
      };
    },
  },
  {
    id: "overdue_invoices",
    severity: "critical",
    ...section("receivables"),
    build: ({ orders, rollups, currencyCode }, now) => {
      const aged = orders
        .filter((order) => order.created_at && isOpenReceivable(order))
        .map((order) => ({
          order,
          age: daysSinceCalendarDate(isoDayOf(new Date(order.created_at)), now),
        }))
        .filter((row) => row.age > 0);
      if (!aged.length) return null;
      const due = aged.reduce(
        (total, row) => total + (row.order.grand_total - (row.order.amount_paid ?? 0)),
        0,
      );
      const oldest = aged.reduce((max, row) => Math.max(max, row.age), 0);
      return {
        title: "Overdue invoices",
        detail: `${plural(aged.length, "invoice")} unpaid for more than a day — ${formatMoney(
          due,
          currencyCode,
        )} of ${formatMoney(rollups.outstandingAmount, currencyCode)} outstanding, oldest ${plural(oldest, "day")} old.`,
        count: aged.length,
      };
    },
  },
  {
    id: "overdue_tasks",
    severity: "warning",
    ...section("tasks"),
    build: ({ tasks }, now) => {
      const rows = tasks.filter((task) => isTaskOverdue(task, now));
      if (!rows.length) return null;
      const oldest = rows.reduce((best, task) =>
        new Date(task.dueAt ?? 0).getTime() < new Date(best.dueAt ?? 0).getTime()
          ? task
          : best,
      );
      const days = daysSinceCalendarDate(
        isoDayOf(new Date(oldest.dueAt ?? now)),
        now,
      );
      return {
        title: "Overdue tasks",
        detail: `${plural(rows.length, "task")} past their due date — "${oldest.title}" was due ${plural(
          days,
          "day",
        )} ago.`,
        count: rows.length,
      };
    },
  },
  {
    id: "purchase_order_late",
    severity: "warning",
    ...section("procurement"),
    build: ({ purchaseOrders }, now) => {
      const rows = purchaseOrders
        .filter(
          (po) =>
            (po.status === "ordered" || po.status === "partially_received") &&
            po.expectedOn != null &&
            daysSinceCalendarDate(po.expectedOn, now) > 0,
        )
        .map((po) => ({ po, days: daysSinceCalendarDate(po.expectedOn ?? "", now) }))
        .sort((a, b) => b.days - a.days);
      if (!rows.length) return null;
      return {
        title: "Purchase orders late",
        detail: `${plural(rows.length, "order")} past the expected date — ${rows[0].po.poNumber} was due ${plural(
          rows[0].days,
          "day",
        )} ago.`,
        count: rows.length,
      };
    },
  },
  {
    id: "pending_leave",
    severity: "info",
    ...section("attendance"),
    build: ({ leave }) => {
      const rows = leave.filter((entry) => entry.status === "pending");
      if (!rows.length) return null;
      return {
        title: "Leave awaiting approval",
        detail: `${plural(rows.length, "request")} pending — ${rows[0].kind} leave from ${rows[0].startsOn}.`,
        count: rows.length,
      };
    },
  },
];

/**
 * Notifications ordered by severity (critical → warning → info), then by the
 * rule order above, so the list is stable for identical inputs.
 */
export function buildDashboardNotifications(
  input: DashboardNotificationInput,
): DashboardNotification[] {
  const now = input.now ?? new Date();
  const rows: DashboardNotification[] = [];
  for (const rule of RULES) {
    const built = rule.build(input, now);
    if (!built) continue;
    rows.push({
      id: rule.id,
      severity: rule.severity,
      module: rule.module,
      href: rule.href,
      ...built,
    });
  }
  const order = RULES.map((rule) => rule.id);
  return rows.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      order.indexOf(a.id) - order.indexOf(b.id),
  );
}
