"use server";

import {
  completeDemoOrder,
  createDemoCreditNote,
  recordDemoPayment,
  recordDemoRefund,
  recordDemoStockAdjustment,
  saveDemoCustomer,
  saveDemoOffer,
  updateDemoCustomer,
  updateDemoOrderNotes,
  updateDemoOrderStatus,
} from "@/lib/demo/server";
import { listDemoCustomers, listDemoOrders, toDemoBrandCode } from "@/lib/demo/data";
import { isOpenQuote, isOpenReceivable } from "@/lib/orders/order-rules";
import { ORDER_TYPE_LABELS } from "@/lib/orders/order-labels";
import { localDayKey } from "@/lib/manager/time";
import type {
  CustomerUpsertInput,
  OfferUpsertInput,
  Order,
  OrderStatus,
  RecordPaymentInput,
  RecordRefundInput,
  StockAdjustmentInput,
} from "@/types/database";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { rowsToCsv } from "@/lib/export/csv";

export async function saveCustomerAction(input: CustomerUpsertInput) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  return saveDemoCustomer(input);
}

export async function updateCustomerAction(
  customerId: string,
  input: CustomerUpsertInput,
) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  return updateDemoCustomer(customerId, input);
}

export async function saveOfferAction(input: OfferUpsertInput) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  return saveDemoOffer(input);
}

export async function updateOrderStatusAction(
  orderId: string,
  status: OrderStatus,
) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  return updateDemoOrderStatus(orderId, status);
}

export async function completeOrderAction(orderId: string) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  try {
    return await completeDemoOrder(orderId);
  } catch {
    return { ok: false as const, message: "Could not save. Try again." };
  }
}

export async function recordPaymentAction(input: RecordPaymentInput) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  return recordDemoPayment(input);
}

export async function recordRefundAction(input: RecordRefundInput) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  return recordDemoRefund(input);
}

export async function createCreditNoteAction(orderId: string) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  return createDemoCreditNote(orderId);
}

export async function updateOrderNotesAction(orderId: string, notes: string) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  return updateDemoOrderNotes(orderId, notes);
}

export async function recordStockAdjustmentAction(input: StockAdjustmentInput) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  return recordDemoStockAdjustment(input);
}

export async function loadOpenQuotesAction() {
  const ws = await loadWorkspaceSession();
  if (!ws) return { data: [] as Order[] };
  const orders = await listDemoOrders(undefined, toDemoBrandCode(ws.brand.code));
  return {
    data: orders.filter((o) => isOpenQuote(o) || isOpenReceivable(o)).slice(0, 20),
  };
}

export async function exportOrdersCsvAction() {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  const header = [
    "Order #",
    "Customer",
    "Total",
    "Status",
    "Payment",
    "Method",
    "Type",
    "Date",
    "Created",
  ];
  const orderRow = (o: Order) => [
    o.order_number,
    o.customer_name_snapshot,
    o.grand_total,
    o.status,
    o.payment_status,
    o.payment_method ?? "",
    o.order_type ? ORDER_TYPE_LABELS[o.order_type] : "",
    o.service_date ?? localDayKey(new Date(o.created_at)),
    o.created_at,
  ];
  const orders = await listDemoOrders(undefined, toDemoBrandCode(ws.brand.code));
  const csv = rowsToCsv(header, orders.map(orderRow));
  return { ok: true as const, csv, filename: "orders.csv" };
}

export async function exportCustomersCsvAction() {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  const customers = await listDemoCustomers(undefined, toDemoBrandCode(ws.brand.code));
  const csv = rowsToCsv(
    ["Name", "Phone", "Email", "Tier", "Notes"],
    customers.map((c) => [
      c.name,
      c.phone,
      c.email,
      c.price_tier ?? "retail",
      c.notes ?? "",
    ]),
  );
  return { ok: true as const, csv, filename: "customers.csv" };
}
