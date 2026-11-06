"use server";

import { revalidatePath } from "next/cache";
import {
  canEditOrderNotes,
  isOpenQuote,
  isOpenReceivable,
  isPostedOrder,
} from "@/lib/orders/order-rules";
import { canManageOrderOperations } from "@/lib/security/authorization";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Order, OrderItem, RecordRefundInput } from "@/types/database";
import { PRODUCT_COLUMNS } from "@/lib/products/columns";

async function requireBrand() {
  const live = await loadLiveWorkspace();
  if (!live) throw new Error("Unauthorized");
  return live;
}

async function requireOrderOpsBrand() {
  const live = await requireBrand();
  if (!canManageOrderOperations(live.member.role)) {
    throw new Error("Forbidden");
  }
  return live;
}

function revalidateOrderViews() {
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/payments");
  revalidatePath("/analytics");
}

export async function listOpenQuotesAndReceivables(): Promise<{
  data: Order[];
  error?: string;
}> {
  try {
    const live = await requireBrand();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, brand_id, order_number, status, payment_status, customer_id, customer_name_snapshot, subtotal, discount_total, tax_total, fees_total, grand_total, notes, created_at, amount_paid, public_token, parent_order_id, order_kind",
      )
      .eq("brand_id", live.brand.id)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error) return { data: [], error: error.message };
    const rows = (data ?? []) as Order[];
    return {
      data: rows.filter((o) => isOpenQuote(o) || isOpenReceivable(o)).slice(0, 20),
    };
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Unable to load open items.",
    };
  }
}

export async function updateOrderNotesLive(
  orderId: string,
  notes: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const live = await requireBrand();
    const supabase = await createSupabaseServerClient();
    const { data: order } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .eq("brand_id", live.brand.id)
      .maybeSingle();
    if (!order) return { ok: false, message: "Order not found." };
    if (!canEditOrderNotes(order as Order)) {
      return { ok: false, message: "Notes cannot be edited." };
    }
    const { error } = await supabase
      .from("orders")
      .update({ notes: notes.trim().slice(0, 2000) || null })
      .eq("id", orderId)
      .eq("brand_id", live.brand.id);
    if (error) return { ok: false, message: error.message };
    revalidateOrderViews();
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not update notes." };
  }
}

export async function createCreditNoteLive(
  sourceOrderId: string,
): Promise<
  { ok: true; creditOrderId: string; orderNumber: string } | { ok: false; message: string }
> {
  try {
    const live = await requireOrderOpsBrand();
    const supabase = await createSupabaseServerClient();
    const { data: source } = await supabase
      .from("orders")
      .select("*")
      .eq("id", sourceOrderId)
      .eq("brand_id", live.brand.id)
      .maybeSingle();
    if (!source) return { ok: false, message: "Order not found." };
    if ((source as Order).status === "draft") {
      return { ok: false, message: "Confirm or complete the order before issuing a credit note." };
    }
    if (isPostedOrder(source as Order) && (source as Order).status === "refunded") {
      return { ok: false, message: "Order already refunded." };
    }

    const { data: items } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", sourceOrderId);

    const creditId = crypto.randomUUID();
    const creditNumber = `CN-${live.brand.code}-${Date.now().toString().slice(-6)}`;
    const createdAt = new Date().toISOString();

    const creditOrder: Partial<Order> = {
      id: creditId,
      brand_id: live.brand.id,
      order_number: creditNumber,
      status: "refunded",
      payment_status: "refunded",
      customer_id: (source as Order).customer_id,
      customer_name_snapshot: (source as Order).customer_name_snapshot,
      subtotal: -(source as Order).subtotal,
      discount_total: -(source as Order).discount_total,
      tax_total: -(source as Order).tax_total,
      fees_total: 0,
      grand_total: -(source as Order).grand_total,
      notes: `Credit note for ${(source as Order).order_number}`,
      created_at: createdAt,
      parent_order_id: sourceOrderId,
      order_kind: "credit_note",
      amount_paid: 0,
    };

    const { error: insertError } = await supabase.from("orders").insert(creditOrder);
    if (insertError) return { ok: false, message: insertError.message };

    const creditItems = (items ?? []).map((item, index) => ({
      ...(item as OrderItem),
      id: `${creditId}-line-${index + 1}`,
      order_id: creditId,
      line_total: -Math.abs((item as OrderItem).line_total),
      quantity: (item as OrderItem).quantity,
    }));
    if (creditItems.length) {
      await supabase.from("order_items").insert(creditItems);
    }

    await supabase
      .from("orders")
      .update({ status: "refunded", payment_status: "refunded" })
      .eq("id", sourceOrderId)
      .eq("brand_id", live.brand.id);

    revalidateOrderViews();
    return { ok: true, creditOrderId: creditId, orderNumber: creditNumber };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not create credit note.",
    };
  }
}

export async function recordRefundLive(
  input: RecordRefundInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, message: "Enter a valid refund amount." };
  }
  try {
    const live = await requireOrderOpsBrand();
    const supabase = await createSupabaseServerClient();
    const { data: order } = await supabase
      .from("orders")
      .select("id, grand_total, payment_status, amount_paid")
      .eq("id", input.orderId)
      .eq("brand_id", live.brand.id)
      .maybeSingle();
    if (!order) return { ok: false, message: "Order not found." };

    const { error: refundError } = await supabase.from("refunds").insert({
      brand_id: live.brand.id,
      order_id: input.orderId,
      payment_id: input.paymentId ?? null,
      amount: input.amount,
      reason: input.reason.trim().slice(0, 500) || null,
    });

    if (refundError) {
      const { error: payError } = await supabase.from("payments").insert({
        brand_id: live.brand.id,
        order_id: input.orderId,
        amount: -input.amount,
        method: "Refund",
        status: "refunded",
        notes: input.reason.trim().slice(0, 500) || null,
      });
      if (payError) return { ok: false, message: payError.message };
    }

    await supabase
      .from("orders")
      .update({ payment_status: "refunded", status: "refunded" })
      .eq("id", input.orderId)
      .eq("brand_id", live.brand.id);

    revalidateOrderViews();
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not record refund." };
  }
}

export async function recordStockAdjustmentLive(input: {
  productId: string;
  deltaQty: number;
  reason: string;
}): Promise<{ ok: true; stockQty: number | null } | { ok: false; message: string }> {
  try {
    const live = await requireOrderOpsBrand();
    const supabase = await createSupabaseServerClient();
    const reason = input.reason.trim();
    if (!reason) return { ok: false, message: "Reason is required." };
    if (!Number.isFinite(input.deltaQty) || input.deltaQty === 0) {
      return { ok: false, message: "Enter a non-zero quantity change." };
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .select(`${PRODUCT_COLUMNS}`)
      .eq("id", input.productId)
      .eq("brand_id", live.brand.id)
      .maybeSingle();
    if (productError || !product) {
      return { ok: false, message: "Product not found." };
    }

    const current = (product as { stock_qty?: number | null }).stock_qty;
    const next =
      current != null && Number.isFinite(current)
        ? current + input.deltaQty
        : input.deltaQty;

    const { error: adjError } = await supabase.from("stock_adjustments").insert({
      brand_id: live.brand.id,
      product_id: input.productId,
      delta_qty: input.deltaQty,
      reason,
    });

    if (adjError && process.env.NODE_ENV === "development") {
      // table may be missing — still try product update
    }

    const { error: updateError } = await supabase
      .from("products")
      .update({ stock_qty: next })
      .eq("id", input.productId)
      .eq("brand_id", live.brand.id);

    if (updateError) return { ok: false, message: updateError.message };
    revalidatePath("/products");
    revalidatePath("/billing");
    return { ok: true, stockQty: next };
  } catch {
    return { ok: false, message: "Could not adjust stock." };
  }
}
