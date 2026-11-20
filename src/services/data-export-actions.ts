"use server";

import {
  listDemoCustomers,
  listDemoOrderItemsForOrders,
  listDemoOrders,
  listDemoPayments,
  toDemoBrandCode,
} from "@/lib/demo/data";
import { rowsToCsv } from "@/lib/export/csv";
import {
  filterByMonths,
  isMonthKey,
  orderDateValue,
  summarizeMonths,
} from "@/lib/export/months";
import { localDayKey } from "@/lib/manager/time";
import { ORDER_TYPE_LABELS } from "@/lib/orders/order-labels";
import { isRevenueOrder } from "@/lib/orders/order-rules";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { Customer, Order, OrderItem, Payment } from "@/types/database";

/** What the Export data picker offers — every row set is read-only. */
export type ExportDataset = "orders" | "order_items" | "payments";

/** One month row in the picker: what a merchant is about to export. */
export type ExportMonthInfo = {
  key: string;
  label: string;
  orders: number;
  items: number;
  payments: number;
  revenue: number;
};

const DATASETS: readonly ExportDataset[] = ["orders", "order_items", "payments"];

const ORDER_HEADERS = [
  "Order #",
  "Date",
  "Customer",
  "Items",
  "Subtotal",
  "Discount",
  "Tax",
  "Grand total",
  "Status",
  "Payment status",
  "Method",
  "Type",
  "Offer code",
  "Notes",
] as const;

const ORDER_ITEM_HEADERS = [
  "Order #",
  "Date",
  "Product",
  "Qty",
  "Unit price",
  "Line discount",
  "Line total",
  "Modifiers",
] as const;

const PAYMENT_HEADERS = [
  "Date",
  "Order #",
  "Customer",
  "Amount",
  "Method",
  "Status",
  "Split",
  "Notes",
] as const;

/**
 * `isRevenueOrder` is the repo's revenue rule — only completed bills earn, so
 * quotes, cancellations and refunds are already out. A credit note is also a
 * `completed` row (with a negative total), so it is excluded the way the rest
 * of the codebase excludes it, by `order_kind` rather than a new rule.
 */
function earnsRevenue(order: Order): boolean {
  return order.order_kind !== "credit_note" && isRevenueOrder(order);
}

/** The day a row is filed under, in the same local zone the workspace shows. */
function displayDate(iso: string): string {
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? iso : localDayKey(new Date(ms));
}

function orderDisplayDate(order: Order): string {
  const serviceDate = order.service_date?.trim();
  return serviceDate ? serviceDate : displayDate(order.created_at);
}

/** Sort key for "oldest → newest"; undated rows sink to the top of the file. */
function instantOf(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function isExportDataset(value: unknown): value is ExportDataset {
  return typeof value === "string" && (DATASETS as readonly string[]).includes(value);
}

function exportFilename(
  brandCode: string,
  dataset: ExportDataset,
  months: readonly string[],
): string {
  const only = months.length === 1 ? months[0] : undefined;
  const suffix = only ?? `${months.length}months`;
  return `orderbook-${brandCode}-${dataset}-${suffix}.csv`;
}

/** A line item plus the bill it belongs to — the join the item export needs. */
type DatedItem = { item: OrderItem; order: Order };

type ExportData = {
  orders: Order[];
  items: DatedItem[];
  payments: Payment[];
  customersById: Map<string, Customer>;
  ordersById: Map<string, Order>;
  itemCountByOrder: Map<string, number>;
};

async function loadExportData(code: DemoBrandCode): Promise<ExportData> {
  const [orders, orderItems, payments, customers] = await Promise.all([
    listDemoOrders(undefined, code),
    listDemoOrderItemsForOrders(code),
    listDemoPayments(code),
    listDemoCustomers(undefined, code),
  ]);
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  // Lines belong to their bill: they inherit its service day, and a line whose
  // order is not in this brand's merged rows has no date and no tenancy, so it
  // is not exported.
  const items: DatedItem[] = [];
  const itemCountByOrder = new Map<string, number>();
  for (const row of orderItems) {
    const order = ordersById.get(row.order_id);
    if (!order) continue;
    items.push({ item: row, order });
    itemCountByOrder.set(order.id, (itemCountByOrder.get(order.id) ?? 0) + 1);
  }
  return {
    orders,
    items,
    payments,
    customersById: new Map(customers.map((customer) => [customer.id, customer])),
    ordersById,
    itemCountByOrder,
  };
}

/** The name billing recorded, falling back to the live customer record. */
function customerName(order: Order, data: ExportData): string {
  const snapshot = order.customer_name_snapshot?.trim();
  if (snapshot) return snapshot;
  if (!order.customer_id) return "";
  return data.customersById.get(order.customer_id)?.name ?? "";
}

function buildMonthInfos(data: ExportData): ExportMonthInfo[] {
  const orderBuckets = summarizeMonths(data.orders, {
    dateOf: (order) => orderDateValue(order),
    amountOf: (order) => (earnsRevenue(order) ? order.grand_total : 0),
  });
  const itemBuckets = summarizeMonths(data.items, {
    dateOf: (row) => orderDateValue(row.order),
  });
  const paymentBuckets = summarizeMonths(data.payments, {
    dateOf: (payment) => payment.created_at,
  });

  const byKey = new Map<string, ExportMonthInfo>();
  const bucketFor = (key: string, label: string): ExportMonthInfo => {
    const existing =
      byKey.get(key) ?? { key, label, orders: 0, items: 0, payments: 0, revenue: 0 };
    byKey.set(key, existing);
    return existing;
  };

  for (const bucket of orderBuckets) {
    const month = bucketFor(bucket.key, bucket.label);
    month.orders = bucket.count;
    month.revenue = bucket.amount;
  }
  for (const bucket of itemBuckets) {
    bucketFor(bucket.key, bucket.label).items = bucket.count;
  }
  for (const bucket of paymentBuckets) {
    bucketFor(bucket.key, bucket.label).payments = bucket.count;
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.key === b.key ? 0 : a.key < b.key ? 1 : -1,
  );
}

function ordersCsv(orders: Order[], data: ExportData): string {
  return rowsToCsv(
    [...ORDER_HEADERS],
    orders.map((order) => [
      order.order_number,
      orderDisplayDate(order),
      customerName(order, data),
      data.itemCountByOrder.get(order.id) ?? 0,
      order.subtotal,
      order.discount_total,
      order.tax_total,
      order.grand_total,
      order.status,
      order.payment_status,
      order.payment_method ?? "",
      order.order_type ? ORDER_TYPE_LABELS[order.order_type] : "",
      order.offer_code_snapshot ?? "",
      order.notes ?? "",
    ]),
  );
}

function orderItemsCsv(items: DatedItem[]): string {
  return rowsToCsv(
    [...ORDER_ITEM_HEADERS],
    items.map(({ item, order }) => [
      order.order_number,
      orderDisplayDate(order),
      item.product_name_snapshot,
      item.quantity,
      item.unit_price,
      item.line_discount,
      item.line_total,
      item.modifier_labels ?? "",
    ]),
  );
}

function paymentsCsv(payments: Payment[], data: ExportData): string {
  return rowsToCsv(
    [...PAYMENT_HEADERS],
    payments.map((payment) => {
      const order = data.ordersById.get(payment.order_id);
      return [
        displayDate(payment.created_at),
        order?.order_number ?? "",
        order ? customerName(order, data) : "",
        payment.amount,
        payment.method,
        payment.status,
        payment.split_label ?? "",
        payment.notes ?? "",
      ];
    }),
  );
}

/**
 * The months this business has data for, newest first, with the counts and
 * revenue the picker shows beside each one.
 */
export async function exportDataMonthsAction(): Promise<
  { ok: true; months: ExportMonthInfo[] } | { ok: false; message: string }
> {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  const data = await loadExportData(toDemoBrandCode(ws.brand.code));
  return { ok: true as const, months: buildMonthInfos(data) };
}

/**
 * One dataset for one or more months. Tenancy comes from the session cookie and
 * the month list is validated before any row is read; nothing is written.
 */
export async function exportDataCsvAction(input: {
  dataset: ExportDataset;
  months: string[];
}): Promise<{ ok: true; csv: string; filename: string } | { ok: false; message: string }> {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  const dataset = input?.dataset;
  if (!isExportDataset(dataset)) {
    return { ok: false as const, message: "Unknown dataset." };
  }
  const months = Array.isArray(input?.months) ? input.months : [];
  if (months.length === 0) {
    return { ok: false as const, message: "Pick at least one month." };
  }
  if (!months.every((month) => isMonthKey(month))) {
    return { ok: false as const, message: "Invalid month." };
  }

  const code = toDemoBrandCode(ws.brand.code);
  const data = await loadExportData(code);
  const brandCode = ws.brand.code;

  if (dataset === "orders") {
    const rows = filterByMonths(data.orders, (order) => orderDateValue(order), months).sort(
      (a, b) => instantOf(orderDateValue(a)) - instantOf(orderDateValue(b)),
    );
    return {
      ok: true as const,
      csv: ordersCsv(rows, data),
      filename: exportFilename(brandCode, dataset, months),
    };
  }

  if (dataset === "order_items") {
    const rows = filterByMonths(data.items, (row) => orderDateValue(row.order), months).sort(
      (a, b) =>
        instantOf(orderDateValue(a.order)) -
          instantOf(orderDateValue(b.order)) ||
        a.order.order_number.localeCompare(b.order.order_number),
    );
    return {
      ok: true as const,
      csv: orderItemsCsv(rows),
      filename: exportFilename(brandCode, dataset, months),
    };
  }

  const rows = filterByMonths(data.payments, (payment) => payment.created_at, months).sort(
    (a, b) => instantOf(a.created_at) - instantOf(b.created_at),
  );
  return {
    ok: true as const,
    csv: paymentsCsv(rows, data),
    filename: exportFilename(brandCode, dataset, months),
  };
}

/** Same month list as `exportDataMonthsAction`, plus who and which money. */
export async function exportDataSummaryAction(): Promise<
  | {
      ok: true;
      months: ExportMonthInfo[];
      brandName: string;
      currencyCode: string;
    }
  | { ok: false; message: string }
> {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  const data = await loadExportData(toDemoBrandCode(ws.brand.code));
  return {
    ok: true as const,
    months: buildMonthInfos(data),
    brandName: ws.brand.name,
    currencyCode: ws.settings.currency_code,
  };
}
