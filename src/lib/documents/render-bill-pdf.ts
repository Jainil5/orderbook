import type { jsPDF } from "jspdf";
import type { BillDocument } from "@/lib/documents/types";
import { formatMoney } from "@/lib/format";
import { imageFormatFromDataUrl } from "@/lib/documents/load-image-data-url";

const COLORS = {
  primary: [27, 54, 84] as const,
  primaryLight: [232, 237, 243] as const,
  text: [18, 24, 38] as const,
  muted: [107, 119, 137] as const,
  border: [207, 214, 224] as const,
  rowAlt: [248, 250, 252] as const,
  white: [255, 255, 255] as const,
  accent: [15, 118, 110] as const,
};

function hexRgb([r, g, b]: readonly [number, number, number]) {
  return { r, g, b };
}

function money(amount: number, currency: string) {
  return formatMoney(amount, currency);
}

function formatDocDate(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

type Layout = {
  pdf: jsPDF;
  margin: number;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
  y: number;
  showLineImages: boolean;
};

function ensurePage(layout: Layout, needed: number) {
  if (layout.y + needed <= layout.pageHeight - layout.margin) return;
  layout.pdf.addPage();
  layout.y = layout.margin;
}

function ensureTableRow(layout: Layout, needed: number) {
  if (layout.y + needed <= layout.pageHeight - layout.margin) return;
  layout.pdf.addPage();
  layout.y = layout.margin;
  drawTableHeader(layout);
}

function setColor(
  pdf: jsPDF,
  color: readonly [number, number, number],
  mode: "fill" | "text" | "draw",
) {
  const { r, g, b } = hexRgb(color);
  if (mode === "fill") pdf.setFillColor(r, g, b);
  if (mode === "text") pdf.setTextColor(r, g, b);
  if (mode === "draw") pdf.setDrawColor(r, g, b);
}

function drawTableHeader(layout: Layout) {
  const { pdf, margin, pageWidth } = layout;
  const headerH = 22;
  const xQty = pageWidth - margin - 198;
  const xRate = pageWidth - margin - 148;
  const xDisc = pageWidth - margin - 88;
  const xAmt = pageWidth - margin - 4;
  const descX = layout.showLineImages ? margin + 72 : margin + 28;

  setColor(pdf, COLORS.primaryLight, "fill");
  pdf.rect(margin, layout.y, layout.contentWidth, headerH, "F");
  setColor(pdf, COLORS.border, "draw");
  pdf.rect(margin, layout.y, layout.contentWidth, headerH, "S");

  setColor(pdf, COLORS.text, "text");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  const hy = layout.y + 14;
  pdf.text("#", margin + 8, hy);
  if (layout.showLineImages) {
    pdf.text("Photo", margin + 28, hy);
  }
  pdf.text("Description", descX, hy);
  pdf.text("Qty", xQty, hy, { align: "right" });
  pdf.text("Rate", xRate, hy, { align: "right" });
  pdf.text("Discount", xDisc, hy, { align: "right" });
  pdf.text("Amount", xAmt, hy, { align: "right" });
  layout.y += headerH;
}

export function renderBillPdf(
  doc: BillDocument,
  pdf: jsPDF,
  opts?: { logoDataUrl?: string | null; lineImageDataUrls?: (string | null)[] },
): void {
  const margin = 44;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const isQuote = doc.kind === "quotation";
  const lineImageDataUrls = opts?.lineImageDataUrls ?? [];
  const showLineImages =
    isQuote && lineImageDataUrls.some((url) => Boolean(url?.trim()));
  const layout: Layout = {
    pdf,
    margin,
    pageWidth,
    pageHeight,
    contentWidth,
    y: 0,
    showLineImages,
  };

  const issuer = doc.issuer ?? null;
  const primary = issuer?.accentColor ?? COLORS.primary;
  const docTitle = isQuote ? "QUOTATION" : "TAX INVOICE";
  const docSubtitle = issuer
    ? isQuote
      ? (issuer.quotationTerms ??
        "Proforma estimate — not a receipt until payment is confirmed.")
      : (issuer.invoiceTerms ??
        "Bill / receipt for goods and services listed below.")
    : isQuote
      ? "Proforma estimate — not a receipt until payment is confirmed."
      : "Bill / receipt for goods and services listed below.";

  if (issuer) {
    const letterheadH = 92;
    const titleBarH = 34;
    setColor(pdf, COLORS.white, "fill");
    pdf.rect(0, 0, pageWidth, letterheadH, "F");
    setColor(pdf, COLORS.border, "draw");
    pdf.line(0, letterheadH, pageWidth, letterheadH);

    const logoW = 148;
    const logoH = 38;
    if (opts?.logoDataUrl) {
      pdf.addImage(opts.logoDataUrl, "PNG", margin, 18, logoW, logoH);
    } else {
      setColor(pdf, COLORS.text, "text");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(16);
      pdf.text(issuer.legalName, margin, 36);
    }

    setColor(pdf, COLORS.text, "text");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text(issuer.legalName, pageWidth - margin, 22, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    setColor(pdf, COLORS.muted, "text");
    let contactY = 34;
    for (const line of issuer.addressLines) {
      pdf.text(line, pageWidth - margin, contactY, { align: "right" });
      contactY += 11;
    }
    pdf.text(issuer.phone, pageWidth - margin, contactY, { align: "right" });
    contactY += 11;
    pdf.text(issuer.email, pageWidth - margin, contactY, { align: "right" });
    contactY += 11;
    pdf.text(issuer.websiteUrl.replace(/^https?:\/\//, ""), pageWidth - margin, contactY, {
      align: "right",
    });

    setColor(pdf, primary, "fill");
    pdf.rect(0, letterheadH, pageWidth, titleBarH, "F");
    setColor(pdf, COLORS.white, "text");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text(docTitle, margin, letterheadH + 22);
    pdf.text(doc.orderNumber, pageWidth - margin, letterheadH + 22, {
      align: "right",
    });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(formatDocDate(doc.createdAt), pageWidth - margin, letterheadH + 32, {
      align: "right",
    });

    layout.y = letterheadH + titleBarH + 26;
  } else {
    const headerH = 72;
    setColor(pdf, COLORS.primary, "fill");
    pdf.rect(0, 0, pageWidth, headerH, "F");
    setColor(pdf, COLORS.white, "text");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(doc.receiptHeader ?? doc.brandName, margin, 32);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(doc.brandName, margin, 48);

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text(docTitle, pageWidth - margin, 28, { align: "right" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(doc.orderNumber, pageWidth - margin, 44, { align: "right" });
    pdf.setFontSize(8);
    pdf.text(formatDocDate(doc.createdAt), pageWidth - margin, 56, {
      align: "right",
    });

    layout.y = headerH + 28;
  }

  // Meta cards
  const cardH = 68;
  const colW = (contentWidth - 16) / 2;
  setColor(pdf, COLORS.border, "draw");
  setColor(pdf, COLORS.white, "fill");
  pdf.roundedRect(margin, layout.y, colW, cardH, 4, 4, "FD");
  pdf.roundedRect(margin + colW + 16, layout.y, colW, cardH, 4, 4, "FD");

  setColor(pdf, COLORS.muted, "text");
  pdf.setFontSize(8);
  pdf.setFont("helvetica", "bold");
  pdf.text("BILL TO", margin + 12, layout.y + 16);
  pdf.text("DOCUMENT DETAILS", margin + colW + 28, layout.y + 16);

  setColor(pdf, COLORS.text, "text");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  const customerLine = doc.customerName?.trim() || "Walk-in customer";
  pdf.text(customerLine, margin + 12, layout.y + 32);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  if (doc.customerPhone) {
    pdf.text(`Mobile: ${doc.customerPhone}`, margin + 12, layout.y + 46);
  }

  const detailX = margin + colW + 28;
  pdf.text(`Number: ${doc.orderNumber}`, detailX, layout.y + 32);
  pdf.text(`Currency: ${doc.currencyCode}`, detailX, layout.y + 46);
  if (doc.paymentMethod && !isQuote) {
    pdf.text(`Payment: ${doc.paymentMethod}`, detailX, layout.y + 58);
  } else if (isQuote) {
    pdf.text("Status: Awaiting acceptance", detailX, layout.y + 58);
  }

  layout.y += cardH + 22;

  setColor(pdf, COLORS.muted, "text");
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "italic");
  const subWrapped = pdf.splitTextToSize(docSubtitle, contentWidth);
  pdf.text(subWrapped, margin, layout.y);
  layout.y += 14 * subWrapped.length + 8;

  drawTableHeader(layout);

  const xQty = pageWidth - margin - 198;
  const xRate = pageWidth - margin - 148;
  const xDisc = pageWidth - margin - 88;
  const xAmt = pageWidth - margin - 4;
  const descX = showLineImages ? margin + 72 : margin + 28;
  const descMaxW = showLineImages ? 166 : 210;
  const rowH = showLineImages ? 52 : 20;
  const thumbSize = 36;

  doc.lines.forEach((line, index) => {
    ensureTableRow(layout, rowH + 4);
    if (index % 2 === 1) {
      setColor(pdf, COLORS.rowAlt, "fill");
      pdf.rect(margin, layout.y, contentWidth, rowH, "F");
    }
    setColor(pdf, COLORS.border, "draw");
    pdf.line(margin, layout.y + rowH, margin + contentWidth, layout.y + rowH);

    const imageDataUrl = lineImageDataUrls[index];
    if (showLineImages && imageDataUrl) {
      try {
        pdf.addImage(
          imageDataUrl,
          imageFormatFromDataUrl(imageDataUrl),
          margin + 28,
          layout.y + 8,
          thumbSize,
          thumbSize,
        );
      } catch {
        /* skip broken image */
      }
    }

    setColor(pdf, COLORS.text, "text");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    const rowY = layout.y + (showLineImages ? 28 : 13);
    pdf.text(String(index + 1), margin + 8, rowY);
    const desc = pdf.splitTextToSize(line.name, descMaxW);
    pdf.text(desc[0] ?? line.name, descX, rowY);
    const qtyLabel = line.unit
      ? `${line.quantity} ${line.unit}`
      : String(line.quantity);
    pdf.text(qtyLabel, xQty, rowY, { align: "right" });
    pdf.text(money(line.listUnitPrice, doc.currencyCode), xRate, rowY, {
      align: "right",
    });
    pdf.text(
      line.lineDiscount > 0
        ? `−${money(line.lineDiscount, doc.currencyCode)}`
        : "—",
      xDisc,
      rowY,
      { align: "right" },
    );
    pdf.setFont("helvetica", "bold");
    pdf.text(money(line.lineTotal, doc.currencyCode), xAmt, rowY, {
      align: "right",
    });
    layout.y += rowH;
  });

  layout.y += 16;
  ensurePage(layout, 160);

  // Totals panel
  const totalsW = 220;
  const totalsX = pageWidth - margin - totalsW;
  const totalsLines: { label: string; value: string; bold?: boolean }[] = [
    { label: "List subtotal", value: money(doc.listSubtotal, doc.currencyCode) },
  ];
  if (doc.productDiscountTotal > 0) {
    totalsLines.push({
      label: "Product discounts",
      value: `−${money(doc.productDiscountTotal, doc.currencyCode)}`,
    });
  }
  if (doc.orderDiscountAmount > 0) {
    totalsLines.push({
      label: "Order discount",
      value: `−${money(doc.orderDiscountAmount, doc.currencyCode)}`,
    });
  }
  totalsLines.push({
    label: "Taxable amount",
    value: money(doc.taxableSubtotal, doc.currencyCode),
  });
  totalsLines.push({
    label: `Tax (${doc.taxRatePercent}%)`,
    value: money(doc.taxTotal, doc.currencyCode),
  });
  totalsLines.push({
    label: isQuote ? "Quotation total" : "Amount due",
    value: money(doc.grandTotal, doc.currencyCode),
    bold: true,
  });

  const totalsH = 16 + totalsLines.length * 18 + 12;
  setColor(pdf, COLORS.primaryLight, "fill");
  pdf.roundedRect(totalsX, layout.y, totalsW, totalsH, 4, 4, "F");
  setColor(pdf, COLORS.border, "draw");
  pdf.roundedRect(totalsX, layout.y, totalsW, totalsH, 4, 4, "S");

  let ty = layout.y + 20;
  for (const row of totalsLines) {
    setColor(pdf, COLORS.muted, "text");
    pdf.setFont("helvetica", row.bold ? "bold" : "normal");
    pdf.setFontSize(row.bold ? 11 : 9);
    pdf.text(row.label, totalsX + 12, ty);
    setColor(pdf, COLORS.text, "text");
    pdf.text(row.value, totalsX + totalsW - 12, ty, { align: "right" });
    ty += 18;
  }

  layout.y += totalsH + 20;

  if (doc.notes?.trim()) {
    ensurePage(layout, 48);
    setColor(pdf, COLORS.muted, "text");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text("Notes", margin, layout.y);
    layout.y += 14;
    setColor(pdf, COLORS.text, "text");
    pdf.setFont("helvetica", "normal");
    const notes = pdf.splitTextToSize(doc.notes.trim(), contentWidth);
    pdf.text(notes, margin, layout.y);
    layout.y += 14 * notes.length + 8;
  }

  if (doc.receiptFooter?.trim()) {
    ensurePage(layout, 40);
    setColor(pdf, COLORS.border, "draw");
    pdf.line(margin, layout.y, margin + contentWidth, layout.y);
    layout.y += 14;
    setColor(pdf, COLORS.muted, "text");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    const footer = pdf.splitTextToSize(doc.receiptFooter.trim(), contentWidth);
    pdf.text(footer, margin, layout.y);
    layout.y += 14 * footer.length;
  }

  // Footer strip
  const footY = pageHeight - 28;
  setColor(pdf, COLORS.muted, "text");
  pdf.setFontSize(8);
  pdf.text(
    isQuote
      ? issuer
        ? "Computer-generated quotation from Cubig Furniture."
        : "This quotation is computer-generated and valid without signature unless stated otherwise."
      : issuer
        ? "Thank you for choosing Cubig Furniture."
        : "Thank you for your business.",
    margin,
    footY,
  );
  setColor(pdf, issuer ? primary : COLORS.accent, "text");
  pdf.text(issuer?.websiteUrl.replace(/^https?:\/\//, "") ?? "OrderBook", pageWidth - margin, footY, {
    align: "right",
  });
}
