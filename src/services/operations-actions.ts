"use server";

import { revalidatePath } from "next/cache";
import {
  recordDemoPayment,
  saveDemoCustomer,
  saveDemoOffer,
  updateDemoCustomer,
  updateDemoOrderStatus,
} from "@/lib/demo/server";
import {
  createCustomer,
  createOffer,
  recordPayment,
  updateCustomer,
  updateOrderStatus,
} from "@/services/data";
import {
  createCreditNoteLive,
  completeOrderLive,
  listOpenQuotesAndReceivables,
  recordRefundLive,
  recordStockAdjustmentLive,
  updateOrderNotesLive,
} from "@/services/order-operations";
import { listDemoOrders, toDemoBrandCode } from "@/lib/demo/data";
import { isOpenQuote, isOpenReceivable } from "@/lib/orders/order-rules";
import type {
  CustomerUpsertInput,
  OfferUpsertInput,
  OrderStatus,
  RecordPaymentInput,
  RecordRefundInput,
  StockAdjustmentInput,
} from "@/types/database";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { rowsToCsv } from "@/lib/export/csv";
import { listCustomers, listOrders } from "@/services/data";

function revalidateOps() {
  revalidatePath("/orders");
  revalidatePath("/payments");
  revalidatePath("/customers");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  revalidatePath("/products");
  revalidatePath("/billing");
}

export async function saveCustomerAction(input: CustomerUpsertInput) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  if (ws.mode === "demo") return saveDemoCustomer(input);
  const result = await createCustomer(input);
  if (result.ok) revalidatePath("/customers");
  return result;
}

export async function updateCustomerAction(
  customerId: string,
  input: CustomerUpsertInput,
) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  if (ws.mode === "demo") return updateDemoCustomer(customerId, input);
  return updateCustomer(customerId, input);
}

export async function saveOfferAction(input: OfferUpsertInput) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  if (ws.mode === "demo") return saveDemoOffer(input);
  return createOffer(input);
}

export async function updateOrderStatusAction(
  orderId: string,
  status: OrderStatus,
) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  if (ws.mode === "demo") return updateDemoOrderStatus(orderId, status);
  const result = await updateOrderStatus(orderId, status);
  if (result.ok) revalidateOps();
  return result;
}

export async function completeOrderAction(orderId: string) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  try {
    if (ws.mode === "demo") {
      const { completeDemoOrder } = await import("@/lib/demo/server");
      return await completeDemoOrder(orderId);
    }
    return await completeOrderLive(orderId);
  } catch {
    return { ok: false as const, message: "Could not save. Try again." };
  }
}

export async function recordPaymentAction(input: RecordPaymentInput) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  if (ws.mode === "demo") return recordDemoPayment(input);
  const result = await recordPayment(input);
  if (result.ok) revalidateOps();
  return result;
}

export async function recordRefundAction(input: RecordRefundInput) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  if (ws.mode === "demo") {
    const { recordDemoRefund } = await import("@/lib/demo/server");
    return recordDemoRefund(input);
  }
  const result = await recordRefundLive(input);
  if (result.ok) revalidateOps();
  return result;
}

export async function createCreditNoteAction(orderId: string) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  if (ws.mode === "demo") {
    const { createDemoCreditNote } = await import("@/lib/demo/server");
    return createDemoCreditNote(orderId);
  }
  const result = await createCreditNoteLive(orderId);
  if (result.ok) revalidateOps();
  return result;
}

export async function updateOrderNotesAction(orderId: string, notes: string) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  if (ws.mode === "demo") {
    const { updateDemoOrderNotes } = await import("@/lib/demo/server");
    return updateDemoOrderNotes(orderId, notes);
  }
  return updateOrderNotesLive(orderId, notes);
}

export async function recordStockAdjustmentAction(input: StockAdjustmentInput) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  if (ws.mode === "demo") {
    const { recordDemoStockAdjustment } = await import("@/lib/demo/server");
    return recordDemoStockAdjustment(input);
  }
  return recordStockAdjustmentLive(input);
}

export async function loadOpenQuotesAction() {
  const ws = await loadWorkspaceSession();
  if (!ws) return { data: [] as import("@/types/database").Order[] };
  if (ws.mode === "demo") {
    const orders = await listDemoOrders(undefined, toDemoBrandCode(ws.brand.code));
    return {
      data: orders.filter((o) => isOpenQuote(o) || isOpenReceivable(o)).slice(0, 20),
    };
  }
  return listOpenQuotesAndReceivables();
}

export async function exportOrdersCsvAction() {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  if (ws.mode === "demo") {
    const orders = await listDemoOrders(undefined, toDemoBrandCode(ws.brand.code));
    const csv = rowsToCsv(
      ["Order #", "Customer", "Total", "Status", "Payment", "Created"],
      orders.map((o) => [
        o.order_number,
        o.customer_name_snapshot,
        o.grand_total,
        o.status,
        o.payment_status,
        o.created_at,
      ]),
    );
    return { ok: true as const, csv, filename: "orders.csv" };
  }
  const { data } = await listOrders({ page: 1, pageSize: 500 });
  const csv = rowsToCsv(
    ["Order #", "Customer", "Total", "Status", "Payment", "Created"],
    data.map((o) => [
      o.order_number,
      o.customer_name_snapshot,
      o.grand_total,
      o.status,
      o.payment_status,
      o.created_at,
    ]),
  );
  return { ok: true as const, csv, filename: "orders.csv" };
}

export async function exportCustomersCsvAction() {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  if (ws.mode === "demo") {
    const { listDemoCustomers } = await import("@/lib/demo/data");
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
  const { data } = await listCustomers();
  const csv = rowsToCsv(
    ["Name", "Phone", "Email", "Tier", "Notes"],
    data.map((c) => [
      c.name,
      c.phone,
      c.email,
      c.price_tier ?? "retail",
      c.notes ?? "",
    ]),
  );
  return { ok: true as const, csv, filename: "customers.csv" };
}
