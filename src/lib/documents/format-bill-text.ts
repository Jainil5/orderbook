import type { BillDocument } from "@/lib/documents/types";
import { formatMoney } from "@/lib/format";

export type BillTextVariant = "default" | "whatsapp";

export function formatBillPlainText(
  doc: BillDocument,
  variant: BillTextVariant = "default",
): string {
  const title =
    doc.kind === "quotation"
      ? `Quotation ${doc.orderNumber}`
      : `Bill ${doc.orderNumber}`;
  const header = doc.receiptHeader ?? doc.brandName;
  const lines: string[] = [header, title, ""];

  if (doc.issuer) {
    lines.push(doc.issuer.tagline);
    for (const line of doc.issuer.addressLines) lines.push(line);
    lines.push(`${doc.issuer.phone} · ${doc.issuer.email}`);
    lines.push(doc.issuer.websiteUrl);
    lines.push("");
  }

  if (variant === "whatsapp") {
    const capsName = doc.customerName?.trim().toUpperCase() ?? "";
    if (capsName) lines.push(capsName);
  } else if (doc.customerName) {
    lines.push(`Customer: ${doc.customerName}`);
  }

  if (doc.customerPhone) lines.push(`Mobile: ${doc.customerPhone}`);
  lines.push(`Date: ${new Date(doc.createdAt).toLocaleString("en-IN")}`);
  lines.push("");

  for (const line of doc.lines) {
    const qty = line.unit
      ? `${line.quantity} ${line.unit}`
      : String(line.quantity);
    lines.push(
      `• ${line.name} × ${qty} — ${formatMoney(line.lineTotal, doc.currencyCode)}`,
    );
  }

  lines.push("");
  if (doc.productDiscountTotal > 0) {
    lines.push(
      `Product discounts: -${formatMoney(doc.productDiscountTotal, doc.currencyCode)}`,
    );
  }
  if (doc.orderDiscountAmount > 0) {
    lines.push(
      `Order discount: -${formatMoney(doc.orderDiscountAmount, doc.currencyCode)}`,
    );
  }
  lines.push(`Subtotal: ${formatMoney(doc.taxableSubtotal, doc.currencyCode)}`);
  lines.push(
    `Tax (${doc.taxRatePercent}%): ${formatMoney(doc.taxTotal, doc.currencyCode)}`,
  );
  lines.push(`Total: ${formatMoney(doc.grandTotal, doc.currencyCode)}`);

  if (doc.paymentMethod) {
    lines.push(`Payment: ${doc.paymentMethod}`);
  }
  if (doc.notes) lines.push(`Notes: ${doc.notes}`);
  if (doc.receiptFooter) {
    lines.push("");
    lines.push(doc.receiptFooter);
  }

  return lines.join("\n").slice(0, 3800);
}

/** @deprecated Use formatBillPlainText */
export const formatBillText = formatBillPlainText;
