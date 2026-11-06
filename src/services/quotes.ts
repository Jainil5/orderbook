"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { normalizePublicQuoteToken } from "@/lib/security/public-token";

export async function acceptQuoteByTokenLive(token: string): Promise<
  | { ok: true; orderNumber: string; orderId: string }
  | { ok: false; message: string }
> {
  const trimmed = normalizePublicQuoteToken(token) ?? token.trim();
  if (trimmed.length < 16) {
    return { ok: false, message: "Invalid link." };
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("accept_quote_by_token", {
    p_token: trimmed,
  });

  if (error) {
    const msg =
      error.message.includes("not_found") || error.code === "P0001"
        ? "Quote not found or already accepted."
        : process.env.NODE_ENV === "development"
          ? error.message
          : "Could not accept quotation.";
    return { ok: false, message: msg };
  }

  const row = data as {
    order_id?: string;
    order_number?: string;
  };
  if (!row?.order_id || !row?.order_number) {
    return { ok: false, message: "Unexpected response from server." };
  }

  revalidatePath("/orders");
  revalidatePath("/dashboard");
  return {
    ok: true,
    orderId: row.order_id,
    orderNumber: row.order_number,
  };
}

export async function fetchAnalyticsSnapshotLive(
  fromIso: string,
  toIso: string,
): Promise<
  | {
      ok: true;
      orderCount: number;
      netSales: number;
      discountTotal: number;
      paidAmount: number;
      pendingAmount: number;
    }
  | { ok: false; message: string }
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("analytics_orders_snapshot", {
    p_from: fromIso,
    p_to: toIso,
  });

  if (error) {
    return {
      ok: false,
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Analytics RPC unavailable.",
    };
  }

  const row = data as Record<string, number>;
  return {
    ok: true,
    orderCount: Number(row.order_count ?? 0),
    netSales: Number(row.net_sales ?? 0),
    discountTotal: Number(row.discount_total ?? 0),
    paidAmount: Number(row.paid_amount ?? 0),
    pendingAmount: Number(row.pending_amount ?? 0),
  };
}
