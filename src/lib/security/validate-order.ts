import type { CreateOrderInput } from "@/types/database";
import { sanitizePaymentMethod } from "@/lib/security/input";

const MAX_LINES = 50;
const MAX_QTY = 10_000;
const MAX_NOTE_LENGTH = 500;

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

  if (input.offerCode && input.offerCode.length > 64) {
    return { ok: false, message: "Invalid offer code." };
  }

  if (!sanitizePaymentMethod(input.paymentMethod)) {
    return { ok: false, message: "Invalid payment method." };
  }

  return { ok: true };
}
