"use server";

import { cookies, headers } from "next/headers";
import { listDemoProductsMerged } from "@/lib/demo/data";
import { SITE_BRAND_CODE } from "@/lib/demo/site-brand";
import { submitDemoOrder } from "@/lib/demo/server";
import { isValidOptionalCustomerPhone, sanitizePaymentMethod } from "@/lib/security/input";
import { consumeRateLimit, rateLimitKeyFromHeaders } from "@/lib/security/rate-limit";
import {
  DEMO_WORKSPACE_COOKIE,
  parseDemoBrandCodeFromCookie,
} from "@/lib/workspace/constants";

/** A web tray is a personal order, not a bulk upload. */
const MAX_SITE_LINES = 20;
const MAX_SITE_QTY = 20;
const MAX_SITE_REQUESTS = 15;
const SITE_REQUEST_WINDOW_MS = 10 * 60 * 1000;

export type SiteOrderLine = {
  productId: string;
  quantity: number;
  /** Modifier option ids picked on the site; the counter's own defaults fill the rest. */
  optionIds: string[];
};

/** The three ways a cafe order leaves the counter, mirroring `OrderType`.
 *  Exported types only: a `"use server"` module may export async functions. */
const SITE_ORDER_MODES = ["dine_in", "takeaway", "delivery"] as const;

export type PlaceSiteOrderInput = {
  lines: SiteOrderLine[];
  name?: string;
  phone?: string;
  note?: string;
  /** How they mean to settle up at the counter. No money moves online. */
  tender?: string;
  /** Eat in, collect it, or send it out. */
  mode?: string;
  /** Dine-in only. */
  guests?: string;
  /** Home delivery only. */
  address?: string;
};

export type PlaceSiteOrderResult =
  | { ok: true; orderNumber: string }
  | { ok: false; message: string };

function rateLimited(retryAfterSec: number): PlaceSiteOrderResult {
  return {
    ok: false,
    message: `Too many orders from this connection. Try again in ${retryAfterSec} seconds.`,
  };
}

/**
 * Turn a website tray into a real order.
 *
 * Nothing about money is trusted from the browser: the line ids are resolved
 * against the live catalog and `submitDemoOrder` prices them the way the
 * counter would, so the saved bill can never disagree with the menu.
 */
export async function placeSiteOrder(
  input: PlaceSiteOrderInput,
): Promise<PlaceSiteOrderResult> {
  const limited = consumeRateLimit(
    `site-order:${rateLimitKeyFromHeaders(await headers())}`,
    MAX_SITE_REQUESTS,
    SITE_REQUEST_WINDOW_MS,
  );
  if (!limited.allowed) return rateLimited(limited.retryAfterSec);

  const activeBrand =
    parseDemoBrandCodeFromCookie(
      (await cookies()).get(DEMO_WORKSPACE_COOKIE)?.value,
    ) ?? SITE_BRAND_CODE;
  if (activeBrand !== SITE_BRAND_CODE) {
    return {
      ok: false,
      message:
        "This browser is demoing another business right now. Open the Brewery Cafe demo to order from this site.",
    };
  }

  const lines = Array.isArray(input?.lines) ? input.lines : [];
  if (!lines.length) return { ok: false, message: "Your tray is empty." };
  if (lines.length > MAX_SITE_LINES) {
    return { ok: false, message: "That is too many lines for one order." };
  }

  const catalog = await listDemoProductsMerged({ activeOnly: true }, SITE_BRAND_CODE);
  const byId = new Map(catalog.map((product) => [product.id, product] as const));
  const orderLines = [];
  for (const line of lines) {
    const product = byId.get(line?.productId);
    if (!product || !product.is_active || product.unavailable) {
      return { ok: false, message: "Something on your tray is no longer on the menu." };
    }
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_SITE_QTY
    ) {
      return { ok: false, message: `Check the count on ${product.name}.` };
    }
    const optionIds = Array.isArray(line.optionIds)
      ? line.optionIds.filter((id) => typeof id === "string").slice(0, 12)
      : [];
    orderLines.push({
      productId: product.id,
      quantity: line.quantity,
      modifierIds: optionIds,
    });
  }

  const name = input.name?.trim().slice(0, 120) ?? "";
  const phone = input.phone?.trim() ?? "";
  const note = input.note?.trim().slice(0, 500) ?? "";
  // A website order is settled at the counter, so the tender is a note for the
  // cashier rather than a payment method: passing one would mark the bill paid.
  const tender = input.tender?.trim() ? sanitizePaymentMethod(input.tender) : null;

  const mode = SITE_ORDER_MODES.find((m) => m === input.mode) ?? null;
  const guestsRaw = input.guests?.trim() ?? "";
  const guests = guestsRaw ? Number(guestsRaw) : null;
  const address = input.address?.trim().slice(0, 300) ?? "";

  if (!mode) return { ok: false, message: "Tell us how you want the order." };
  if (phone && !isValidOptionalCustomerPhone(phone)) {
    return { ok: false, message: "Enter a valid mobile number (8–15 digits)." };
  }
  if (input.tender?.trim() && !tender) return { ok: false, message: "Choose how you will pay." };
  if (mode === "dine_in" && guestsRaw && (!Number.isInteger(guests) || !guests || guests < 1 || guests > 99)) {
    return { ok: false, message: "Table size must be a whole number between 1 and 99." };
  }
  if (mode === "delivery" && address.length < 10) {
    return { ok: false, message: "Add a delivery address — flat, street, landmark, pincode." };
  }

  const modeLabel = mode === "dine_in" ? "Dine-in" : mode === "delivery" ? "Home delivery" : "Takeaway";
  // The marker leads the notes and is never dropped: it is how the workspace
  // tells a website order from one rung in at the counter.
  const notes = [
    `Website order · ${modeLabel}`,
    note || null,
    tender ? `Paying by ${tender}` : null,
  ]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 500);

  const result = await submitDemoOrder({
    customerId: null,
    customerPhone: phone || null,
    walkInName: name || undefined,
    notes,
    lines: orderLines,
    paymentMethod: "",
    paymentStatus: "pending",
    orderType: mode,
    guests: mode === "dine_in" ? guests : null,
    deliveryAddress: mode === "delivery" ? address : undefined,
  });

  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true, orderNumber: result.orderNumber };
}
