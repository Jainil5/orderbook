import type { WebOrderInput } from "@/lib/demo/server";
import { isValidOptionalCustomerPhone } from "@/lib/security/input";

/**
 * The public storefront's order boundary (`POST /api/site/[brand]/order`).
 * A visitor's cart arrives as plain JSON over a normal fetch, so every field
 * is treated as hostile text here: the same limits `placeWebOrder` applies
 * after the ticket is built, applied before anything is written.
 *
 * Quantities are clamped rather than rejected — a customer who tapped "+"
 * nineteen times should still get their order, not an error — but an order
 * from which we silently dropped items would be a ticket the kitchen builds
 * wrongly, so a too-long list comes back as a message instead. Same for
 * anything that would make the ticket unreadable: no name, no lines, a phone
 * that cannot be dialled back.
 */
export const WEB_ORDER_LIMITS = {
  /** Hard ceiling on the request body, so the endpoint is never a sink. */
  bodyBytes: 64 * 1024,
  lines: 20,
  quantity: 20,
  modifiers: 8,
  customerName: 60,
  phone: 16,
  address: 240,
  notes: 300,
  offerCode: 64,
  id: 64,
} as const;

export type WebOrderPayload = {
  customerName?: string;
  phone?: string;
  fulfilment?: string;
  address?: string;
  notes?: string;
  offerCode?: string;
  lines?: unknown;
};

export type WebOrderPayloadVerdict =
  | { ok: true; input: WebOrderInput }
  | { ok: false; message: string };

/**
 * Read a printable field. Numbers are accepted as well as strings: a phone
 * typed into a numeric keypad can arrive as `9876543210`, and dropping it
 * quietly would cost the counter its way of calling the customer back.
 */
function text(value: unknown, max: number): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).trim().slice(0, max);
  }
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function optionalText(value: unknown, max: number): string | undefined {
  const out = text(value, max);
  return out || undefined;
}

/**
 * Turn whatever arrived in the request body into a `WebOrderInput`, or into a
 * one-line message for the customer. Never throws: a malformed body is a
 * normal outcome for a public endpoint (stale tab, tampered request, bot).
 */
export function parseWebOrderPayload(
  payload: unknown,
): WebOrderPayloadVerdict {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return {
      ok: false,
      message: "This order did not reach us properly — please try again.",
    };
  }
  const body = payload as WebOrderPayload;

  const customerName = text(body.customerName, WEB_ORDER_LIMITS.customerName);
  if (!customerName) {
    return { ok: false, message: "Tell us who the order is for." };
  }

  const phone = optionalText(body.phone, WEB_ORDER_LIMITS.phone);
  if (phone && !isValidOptionalCustomerPhone(phone)) {
    return {
      ok: false,
      message: "Enter a valid mobile number (8–15 digits).",
    };
  }

  const fulfilment = text(body.fulfilment, 16).toLowerCase();
  if (fulfilment !== "takeaway" && fulfilment !== "delivery") {
    return {
      ok: false,
      message: "Choose pickup at the counter or delivery.",
    };
  }

  const address = optionalText(body.address, WEB_ORDER_LIMITS.address);
  if (fulfilment === "delivery" && !address) {
    return { ok: false, message: "Add a delivery address." };
  }

  const rawLines = body.lines;
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    return { ok: false, message: "Pick at least one item first." };
  }
  if (rawLines.length > WEB_ORDER_LIMITS.lines) {
    return {
      ok: false,
      message: `That list is longer than ${WEB_ORDER_LIMITS.lines} items — split it into two orders.`,
    };
  }

  const lines: WebOrderInput["lines"] = [];
  for (const raw of rawLines) {
    if (typeof raw !== "object" || raw === null) {
      return { ok: false, message: "One of the items in your list is unreadable." };
    }
    const line = raw as { productId?: unknown; quantity?: unknown; modifierIds?: unknown };
    const productId = text(line.productId, WEB_ORDER_LIMITS.id);
    if (!productId) {
      return { ok: false, message: "One of the items in your list is unreadable." };
    }
    const quantity = Number(line.quantity);
    lines.push({
      productId,
      quantity: Number.isFinite(quantity)
        ? Math.max(1, Math.min(WEB_ORDER_LIMITS.quantity, Math.round(quantity)))
        : 1,
      modifierIds: Array.isArray(line.modifierIds)
        ? line.modifierIds
            .slice(0, WEB_ORDER_LIMITS.modifiers)
            .map((id) => text(id, WEB_ORDER_LIMITS.id))
            .filter(Boolean)
        : [],
    });
  }

  const input: WebOrderInput = {
    customerName,
    phone,
    fulfilment,
    address,
    notes: optionalText(body.notes, WEB_ORDER_LIMITS.notes),
    offerCode: optionalText(body.offerCode, WEB_ORDER_LIMITS.offerCode),
    lines,
  };
  return { ok: true, input };
}
