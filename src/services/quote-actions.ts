"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { findDemoOrderByPublicToken } from "@/lib/demo/public-quote";
import {
  patchDemoOrderInStore,
  readDemoOrderStore,
} from "@/lib/demo/order-store";
import { getDemoBrandPack } from "@/lib/demo/brands";
import { updateDemoMutableBucket } from "@/lib/demo/mutable-store";
import { appendDemoAudit } from "@/lib/demo/mutable-store";
import { DEMO_BRAND_CODES, type DemoBrandCode } from "@/lib/workspace/constants";
import type { OrderStatus } from "@/types/database";
import { acceptQuoteByTokenLive } from "@/services/quotes";
import {
  consumeRateLimit,
  rateLimitKeyFromHeaders,
} from "@/lib/security/rate-limit";
import { normalizePublicQuoteToken } from "@/lib/security/public-token";

async function locateDemoOrderBrand(orderId: string): Promise<DemoBrandCode | null> {
  for (const code of DEMO_BRAND_CODES) {
    const pack = getDemoBrandPack(code);
    if (pack.orders.some((o) => o.id === orderId)) return code;
    const stored = await readDemoOrderStore(code);
    if (stored.orders.some((o) => o.id === orderId)) return code;
  }
  return null;
}

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
  const live = await acceptQuoteByTokenLive(normalized);
  if (live.ok) {
    return { ok: true as const, orderNumber: live.orderNumber };
  }

  const match = await findDemoOrderByPublicToken(normalized);
  if (match) {
    const code = await locateDemoOrderBrand(match.order.id);
    if (!code) {
      return { ok: false as const, message: "Quote not found." };
    }
    const patch = {
      status: "confirmed" as OrderStatus,
    };
    await patchDemoOrderInStore(code, match.order.id, patch);
    await updateDemoMutableBucket(code, (b) => ({
      ...b,
      orderPatches: {
        ...b.orderPatches,
        [match.order.id]: { ...b.orderPatches[match.order.id], ...patch },
      },
    }));
    await appendDemoAudit(code, {
      brand_id: match.order.brand_id,
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
    message: live.message ?? "Quote not found or already processed.",
  };
}
