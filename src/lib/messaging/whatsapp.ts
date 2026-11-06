import type { BillDocument } from "@/lib/documents/types";
import { formatBillPlainText } from "@/lib/documents/format-bill-text";

const DEFAULT_COUNTRY_CODE = "91";

/** Digits only, with country code, for wa.me links. */
export function toWhatsAppPhoneDigits(
  phone: string,
  defaultCountryCode = DEFAULT_COUNTRY_CODE,
): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.length === 10) return `${defaultCountryCode}${digits}`;
  return digits;
}

export function buildWhatsAppShareUrl(phoneDigits: string, message: string): string {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`;
}

export function openWhatsAppWithMessage(phone: string, message: string): boolean {
  const digits = toWhatsAppPhoneDigits(phone);
  if (!digits) return false;
  const url = buildWhatsAppShareUrl(digits, message);
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

export function openWhatsAppWithBill(doc: BillDocument): boolean {
  if (!doc.customerPhone?.trim()) return false;
  const message = formatBillPlainText(doc, "whatsapp");
  return openWhatsAppWithMessage(doc.customerPhone, message);
}
