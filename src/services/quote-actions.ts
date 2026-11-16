"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { supabaseEnabled } from "@/lib/env";
import { findDemoOrderByPublicToken } from "@/lib/demo/public-quote";
import { appendAudit, updateBrand } from "@/lib/csv/records";
import type { OrderStatus } from "@/types/database";
import { acceptQuoteByTokenLive } from "@/services/quotes";
import {
  consumeRateLimit,
  rateLimitKeyFromHeaders,
} from "@/lib/security/rate-limit";
import { normalizePublicQuoteToken } from "@/lib/security/public-token";

export async function acceptPublicQuoteAction(token: string) {
  const headerList = await headers();
  const rateKey = `quote-accept:${rateLimitKeyFromHeaders(headerList)}`;
  const limited = consumeRateLimit(rateKey, 20, 10 * 60 * 1000);
  if (!limited.allowed) {
    return {
      ok: false as const,
      message: `Too many attempts. Try again in ${limited.retryAfterSec} seconds.`,
    };
  }

  const normalized = normalizePublicQuoteToken(token) ?? token.trim();
  // The Supabase RPC only exists to run when Supabase is on. Attempting it
  // first unconditionally threw on a keyless deployment before the CSV lookup
  // below ever ran, so a demo quote could not be accepted at all.
  const live = supabaseEnabled()
    ? await acceptQuoteByTokenLive(normalized)
    : null;
  if (live?.ok) {
    return { ok: true as const, orderNumber: live.orderNumber };
  }

  /* A token is the whole capability here: whoever holds it may confirm that one
     quotation. The brand is taken from the matched order row, never from the
     request, so the write stays inside the tenant the quote belongs to — and a
     visitor with no workspace cookie at all can still accept their quote. */
  const match = await findDemoOrderByPublicToken(normalized);
  if (match) {
    const brandId = match.order.brand_id;
    const patched = updateBrand("orders", brandId, match.order.id, {
      status: "confirmed" as OrderStatus,
    });
    if (!patched) {
      return { ok: false as const, message: "Quote not found." };
    }
    appendAudit(brandId, {
      actor_email: null,
      action: "quote.accepted_public",
      entity_type: "order",
      entity_id: match.order.id,
      detail: match.order.order_number,
    });
    revalidatePath("/orders");
    revalidatePath("/kitchen");
    return { ok: true as const, orderNumber: match.order.order_number };
  }

  return {
    ok: false as const,
    message: live?.message ?? "Quote not found or already processed.",
  };
}
