import type { CreateOrderInput } from "@/types/database";
import {
  isValidOptionalCustomerPhone,
  sanitizePaymentMethod,
} from "@/lib/security/input";

const MAX_LINES = 50;
const MAX_QTY = 10_000;
const MAX_NOTE_LENGTH = 500;
const MAX_ORDER_DISCOUNT = 10_000_000;

export function validateCreateOrderInput(
  input: CreateOrderInput,
): { ok: true } | { ok: false; message: string } {
  if (!input.lines?.length) {
    return { ok: false, message: "Add at least one line item." };
  }
  if (input.lines.length > MAX_LINES) {
    return { ok: false, message: "Too many line items on one order." };
  }

  for (const line of input.lines) {
    if (!line.productId || typeof line.productId !== "string") {
      return { ok: false, message: "Invalid product on order." };
    }
    if (
      !Number.isFinite(line.quantity) ||
      line.quantity <= 0 ||
      line.quantity > MAX_QTY
    ) {
      return { ok: false, message: "Invalid quantity." };
    }
  }

  if (input.notes && input.notes.length > MAX_NOTE_LENGTH) {
    return { ok: false, message: "Notes are too long." };
  }

  if (input.walkInName && input.walkInName.length > 120) {
    return { ok: false, message: "Customer name is too long." };
  }

  if (!isValidOptionalCustomerPhone(input.customerPhone ?? undefined)) {
    return { ok: false, message: "Enter a valid mobile number (8–15 digits)." };
  }

  if (input.offerCode && input.offerCode.length > 64) {
    return { ok: false, message: "Invalid offer code." };
  }

  // Empty method = payment-pending intent; recorded when the order completes.
  if (input.paymentMethod?.trim() && !sanitizePaymentMethod(input.paymentMethod)) {
    return { ok: false, message: "Invalid payment method." };
  }

  const od = input.orderDiscount;
  if (od) {
    if (od.type !== "percent" && od.type !== "fixed") {
      return { ok: false, message: "Invalid order discount." };
    }
    if (!Number.isFinite(od.value) || od.value < 0) {
      return { ok: false, message: "Invalid order discount value." };
    }
    if (od.type === "percent" && od.value > 100) {
      return { ok: false, message: "Order discount percent cannot exceed 100." };
    }
    if (od.type === "fixed" && od.value > MAX_ORDER_DISCOUNT) {
      return { ok: false, message: "Order discount amount is too large." };
    }
  }

  const fees = input.feesTotal;
  if (fees != null) {
    if (!Number.isFinite(fees) || fees < 0 || fees > MAX_ORDER_DISCOUNT) {
      return { ok: false, message: "Invalid delivery or installation charges." };
    }
  }

  for (const line of input.lines) {
    if (line.lineDiscount != null) {
      if (
        !Number.isFinite(line.lineDiscount) ||
        line.lineDiscount < 0 ||
        line.lineDiscount > MAX_ORDER_DISCOUNT
      ) {
        return { ok: false, message: "Invalid line discount." };
      }
    }
  }

  return { ok: true };
}
