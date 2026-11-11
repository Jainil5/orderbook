import type { jsPDF } from "jspdf";
import type { BillDocument } from "@/lib/documents/types";
import { imageFormatFromDataUrl } from "@/lib/documents/load-image-data-url";
import {
  advanceDueAmount,
  buildTotalsRows,
  computeTableColumns,
  formatPdfAmount,
  lineRowHeight,
  quotationValidUntil,
  type TableColumns,
} from "@/lib/documents/pdf-layout";

const COLORS = {
  primary: [27, 54, 84] as const,
  primaryLight: [232, 237, 243] as const,
  text: [18, 24, 38] as const,
  muted: [107, 119, 137] as const,
  border: [207, 214, 224] as const,
  rowAlt: [248, 250, 252] as const,
  white: [255, 255, 255] as const,
  accent: [15, 118, 110] as const,
  success: [21, 128, 61] as const,
};

const MARGIN = 44;
/** Blank band kept clear at the foot of every page for the stamped footer. */
const FOOTER_BAND = 34;
const THUMB = 40;
const LINE_HEIGHT = 12;
const META_LINE_HEIGHT = 10;

type Rgb = readonly [number, number, number];

type Layout = {
  pdf: jsPDF;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
  bottomLimit: number;
  y: number;
  cols: TableColumns;
  showLineImages: boolean;
  currency: string;
};

function money(amount: number, currency: string) {
  return `${amount < 0 ? "-" : ""}${formatPdfAmount(amount, currency)}`;
}

function formatDocDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateOnly(value: string) {
  if (!value) return "";
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function setColor(pdf: jsPDF, color: Rgb, mode: "fill" | "text" | "draw") {
  if (mode === "fill") pdf.setFillColor(color[0], color[1], color[2]);
  if (mode === "text") pdf.setTextColor(color[0], color[1], color[2]);
  if (mode === "draw") pdf.setDrawColor(color[0], color[1], color[2]);
}

function font(
  pdf: jsPDF,
  style: "normal" | "bold" | "italic",
  size: number,
  color: Rgb,
) {
  pdf.setFont("helvetica", style);
  pdf.setFontSize(size);
  setColor(pdf, color, "text");
}

function rightEdge(col: { x: number; w: number }) {
  return col.x + col.w - 4;
}

/** Starts a new page when `needed` points no longer fit. True when it broke. */
function ensurePage(layout: Layout, needed: number) {
  if (layout.y + needed <= layout.bottomLimit) return false;
  layout.pdf.addPage();
  layout.y = MARGIN;
  return true;
}

function drawTableHeader(layout: Layout) {
  const { pdf, cols } = layout;
  const headerH = 20;

  setColor(pdf, COLORS.primaryLight, "fill");
  pdf.rect(MARGIN, layout.y, layout.contentWidth, headerH, "F");
  setColor(pdf, COLORS.border, "draw");
  pdf.line(
    MARGIN,
    layout.y + headerH,
    MARGIN + layout.contentWidth,
    layout.y + headerH,
  );

  font(pdf, "bold", 8, COLORS.muted);
  const hy = layout.y + 13;
  pdf.text("#", cols.index.x + 4, hy);
  if (layout.showLineImages) pdf.text("Photo", cols.photo.x + 4, hy);
  pdf.text("Description", cols.description.x + 4, hy);
  pdf.text("Qty", rightEdge(cols.qty), hy, { align: "right" });
  pdf.text("Rate", rightEdge(cols.rate), hy, { align: "right" });
  pdf.text("Disc", rightEdge(cols.discount), hy, { align: "right" });
  pdf.text("Amount", rightEdge(cols.amount), hy, { align: "right" });
  layout.y += headerH;
}

/** Scales the logo into its box instead of stretching it to fixed dimensions. */
function drawLogo(
  pdf: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  boxW: number,
  boxH: number,
) {
  try {
    const props = pdf.getImageProperties(dataUrl);
    const scale = Math.min(boxW / props.width, boxH / props.height);
    const w = props.width * scale;
    const h = props.height * scale;
    pdf.addImage(dataUrl, "PNG", x, y + (boxH - h) / 2, w, h);
    return true;
  } catch {
    return false;
  }
}

function drawLetterhead(
  layout: Layout,
  doc: BillDocument,
  primary: Rgb,
  logoDataUrl: string | null,
) {
  const { pdf, pageWidth } = layout;
  const issuer = doc.issuer;
  const docTitle = doc.kind === "quotation" ? "QUOTATION" : "TAX INVOICE";

  if (!issuer) {
    const headerH = 72;
    setColor(pdf, COLORS.primary, "fill");
    pdf.rect(0, 0, pageWidth, headerH, "F");
    font(pdf, "bold", 18, COLORS.white);
    pdf.text(doc.receiptHeader ?? doc.brandName, MARGIN, 32);
    font(pdf, "normal", 10, COLORS.white);
    pdf.text(doc.brandName, MARGIN, 48);
    font(pdf, "bold", 11, COLORS.white);
    pdf.text(docTitle, pageWidth - MARGIN, 28, { align: "right" });
    pdf.text(doc.orderNumber, pageWidth - MARGIN, 44, { align: "right" });
    font(pdf, "normal", 8, COLORS.white);
    pdf.text(formatDocDate(doc.createdAt), pageWidth - MARGIN, 56, {
      align: "right",
    });
    layout.y = headerH + 24;
    return;
  }

  const letterheadH = 96;
  const titleBarH = 32;
  setColor(pdf, COLORS.white, "fill");
  pdf.rect(0, 0, pageWidth, letterheadH, "F");
  setColor(pdf, COLORS.border, "draw");
  pdf.line(0, letterheadH, pageWidth, letterheadH);

  const drewLogo = logoDataUrl
    ? drawLogo(pdf, logoDataUrl, MARGIN, 18, 168, 46)
    : false;
  if (!drewLogo) {
    font(pdf, "bold", 16, COLORS.text);
    pdf.text(issuer.legalName, MARGIN, 38);
  }
  if (issuer.tagline) {
    font(pdf, "normal", 8, COLORS.muted);
    pdf.text(issuer.tagline, MARGIN, drewLogo ? 76 : 52);
  }

  font(pdf, "bold", 9, COLORS.text);
  pdf.text(issuer.legalName, pageWidth - MARGIN, 24, { align: "right" });
  font(pdf, "normal", 8, COLORS.muted);
  let contactY = 37;
  for (const line of [...issuer.addressLines, issuer.phone, issuer.email]) {
    pdf.text(line, pageWidth - MARGIN, contactY, { align: "right" });
    contactY += 10;
  }
  pdf.text(
    issuer.websiteUrl.replace(/^https?:\/\//, ""),
    pageWidth - MARGIN,
    contactY,
    { align: "right" },
  );

  setColor(pdf, primary, "fill");
  pdf.rect(0, letterheadH, pageWidth, titleBarH, "F");
  font(pdf, "bold", 11, COLORS.white);
  pdf.text(docTitle, MARGIN, letterheadH + 21);
  pdf.text(doc.orderNumber, pageWidth - MARGIN, letterheadH + 21, {
    align: "right",
  });
  layout.y = letterheadH + titleBarH + 22;
}

function drawMetaCards(layout: Layout, doc: BillDocument) {
  const { pdf, contentWidth } = layout;
  const isQuote = doc.kind === "quotation";
  const colW = (contentWidth - 16) / 2;
  const pad = 12;

  const left: string[] = [];
  if (doc.customerPhone) left.push(`Mobile: ${doc.customerPhone}`);
  if (doc.customerAddress?.trim()) {
    left.push(
      ...pdf
        .splitTextToSize(`Site: ${doc.customerAddress.trim()}`, colW - pad * 2)
        .slice(0, 3),
    );
  }

  const right: string[] = [
    `Number: ${doc.orderNumber}`,
    `Date: ${formatDocDate(doc.createdAt)}`,
    `Currency: ${doc.currencyCode}`,
  ];
  if (doc.serviceDate) {
    right.push(
      `${isQuote ? "Target delivery" : "Delivery / installation"}: ${formatDateOnly(doc.serviceDate)}`,
    );
  }
  if (isQuote) {
    right.push(`Valid until: ${quotationValidUntil(doc.createdAt)}`);
    right.push("Status: Awaiting acceptance");
  } else {
    if (doc.referenceNumber) {
      right.push(`Against quotation: ${doc.referenceNumber}`);
    }
    right.push(`Payment: ${doc.paymentMethod ?? "pending"}`);
  }

  const cardH =
    Math.max(
      72,
      46 + left.length * META_LINE_HEIGHT,
      30 + right.length * META_LINE_HEIGHT,
    ) + pad;

  setColor(pdf, COLORS.white, "fill");
  setColor(pdf, COLORS.border, "draw");
  pdf.roundedRect(MARGIN, layout.y, colW, cardH, 4, 4, "FD");
  pdf.roundedRect(MARGIN + colW + 16, layout.y, colW, cardH, 4, 4, "FD");

  font(pdf, "bold", 8, COLORS.muted);
  pdf.text(isQuote ? "QUOTE FOR" : "BILL TO", MARGIN + pad, layout.y + 16);
  pdf.text("DOCUMENT DETAILS", MARGIN + colW + 16 + pad, layout.y + 16);

  font(pdf, "bold", 11, COLORS.text);
  pdf.text(
    doc.customerName?.trim() || "Walk-in customer",
    MARGIN + pad,
    layout.y + 32,
  );
  font(pdf, "normal", 8.5, COLORS.muted);
  let ly = layout.y + 46;
  for (const line of left) {
    pdf.text(line, MARGIN + pad, ly);
    ly += META_LINE_HEIGHT;
  }

  font(pdf, "normal", 8.5, COLORS.text);
  let ry = layout.y + 30;
  for (const line of right) {
    pdf.text(line, MARGIN + colW + 16 + pad, ry);
    ry += META_LINE_HEIGHT;
  }

  layout.y += cardH + 16;
}

function drawLines(
  layout: Layout,
  doc: BillDocument,
  lineImageDataUrls: (string | null)[],
) {
  const { pdf, cols } = layout;
  const wrapWidth = cols.description.w - 8;

  doc.lines.forEach((line, index) => {
    const nameLines = pdf.splitTextToSize(line.name, wrapWidth);
    const metaBits = [
      line.sku?.trim() ? `SKU ${line.sku.trim()}` : null,
      line.description?.trim() || null,
    ].filter(Boolean);
    const metaLines: string[] = metaBits.length
      ? pdf.splitTextToSize(metaBits.join(" · "), wrapWidth).slice(0, 3)
      : [];

    const rowH = lineRowHeight({
      nameLines: nameLines.length,
      metaLines: metaLines.length,
      showPhoto: layout.showLineImages,
    });

    if (ensurePage(layout, rowH + 6)) drawTableHeader(layout);

    if (index % 2 === 1) {
      setColor(pdf, COLORS.rowAlt, "fill");
      pdf.rect(MARGIN, layout.y, layout.contentWidth, rowH, "F");
    }
    setColor(pdf, COLORS.border, "draw");
    pdf.line(MARGIN, layout.y + rowH, MARGIN + layout.contentWidth, layout.y + rowH);

    const image = lineImageDataUrls[index];
    if (layout.showLineImages && image?.trim()) {
      try {
        pdf.addImage(
          image,
          imageFormatFromDataUrl(image),
          cols.photo.x + (cols.photo.w - THUMB) / 2,
          layout.y + (rowH - THUMB) / 2,
          THUMB,
          THUMB,
        );
      } catch {
        /* a photo that will not decode must never cost the whole document */
      }
    }

    const baseY = layout.y + 15;
    font(pdf, "normal", 9, COLORS.muted);
    pdf.text(String(index + 1), cols.index.x + 4, baseY);

    font(pdf, "bold", 9.5, COLORS.text);
    pdf.text(nameLines, cols.description.x + 4, baseY);
    if (metaLines.length) {
      font(pdf, "normal", 8, COLORS.muted);
      let my = baseY + LINE_HEIGHT * nameLines.length;
      for (const meta of metaLines) {
        pdf.text(meta, cols.description.x + 4, my);
        my += META_LINE_HEIGHT;
      }
    }

    font(pdf, "normal", 9, COLORS.text);
    pdf.text(
      line.unit ? `${line.quantity} ${line.unit}` : String(line.quantity),
      rightEdge(cols.qty),
      baseY,
      { align: "right" },
    );
    pdf.text(money(line.listUnitPrice, layout.currency), rightEdge(cols.rate), baseY, {
      align: "right",
    });
    pdf.text(
      line.lineDiscount > 0
        ? money(-line.lineDiscount, layout.currency)
        : "—",
      rightEdge(cols.discount),
      baseY,
      { align: "right" },
    );
    font(pdf, "bold", 9, COLORS.text);
    pdf.text(money(line.lineTotal, layout.currency), rightEdge(cols.amount), baseY, {
      align: "right",
    });

    layout.y += rowH;
  });
}

function drawTotals(layout: Layout, doc: BillDocument) {
  const { pdf, pageWidth } = layout;
  const rows = buildTotalsRows(doc);
  const totalsW = Math.min(248, layout.contentWidth);
  const totalsX = pageWidth - MARGIN - totalsW;
  const rowH = 16;
  const totalsH = 20 + rows.length * rowH;

  layout.y += 10;
  ensurePage(layout, totalsH);

  setColor(pdf, COLORS.primaryLight, "fill");
  pdf.roundedRect(totalsX, layout.y, totalsW, totalsH, 4, 4, "F");
  setColor(pdf, COLORS.border, "draw");
  pdf.roundedRect(totalsX, layout.y, totalsW, totalsH, 4, 4, "S");

  let ty = layout.y + 18;
  for (const row of rows) {
    const strong = row.tone === "strong";
    const color = strong
      ? COLORS.text
      : row.tone === "discount"
        ? COLORS.success
        : COLORS.muted;
    font(pdf, strong ? "bold" : "normal", strong ? 11 : 9, color);
    pdf.text(row.label, totalsX + 12, ty);
    pdf.text(money(row.amount, layout.currency), totalsX + totalsW - 12, ty, {
      align: "right",
    });
    if (row.tone === "sub") {
      setColor(pdf, COLORS.border, "draw");
      pdf.line(totalsX + 12, ty + 4, totalsX + totalsW - 12, ty + 4);
    }
    ty += rowH;
  }

  layout.y += totalsH + 10;

  if (doc.kind === "quotation" && doc.depositPercent && doc.depositPercent > 0) {
    const advance = advanceDueAmount(doc.grandTotal, doc.depositPercent);
    font(pdf, "italic", 8.5, COLORS.muted);
    const note = pdf.splitTextToSize(
      `Confirm this quotation and pay the advance of ${money(advance, layout.currency)} to book production. The balance is due before dispatch.`,
      layout.contentWidth,
    );
    pdf.text(note, MARGIN, layout.y);
    layout.y += 11 * note.length + 6;
  }
}

function drawTextBlock(
  layout: Layout,
  title: string,
  body: string,
  style: "text" | "muted" = "text",
) {
  const { pdf } = layout;
  const lines = pdf.splitTextToSize(body, layout.contentWidth);
  ensurePage(layout, 13 + lines.length * 11 + 6);
  if (title) {
    font(pdf, "bold", 9, COLORS.muted);
    pdf.text(title, MARGIN, layout.y);
    layout.y += 13;
  }
  font(pdf, "normal", 9, style === "muted" ? COLORS.muted : COLORS.text);
  pdf.text(lines, MARGIN, layout.y);
  layout.y += 11 * lines.length + 6;
}

function drawTermsAndSignature(layout: Layout, doc: BillDocument, terms: string) {
  const { pdf, contentWidth } = layout;
  const issuer = doc.issuer;
  const blockH = 76;

  if (layout.y + blockH > layout.bottomLimit) {
    pdf.addPage();
    layout.y = MARGIN;
  } else {
    layout.y = layout.bottomLimit - blockH;
  }

  const leftW = contentWidth * 0.55;
  const rightX = MARGIN + contentWidth - 150;

  font(pdf, "bold", 8.5, COLORS.muted);
  pdf.text(
    doc.kind === "quotation" ? "Terms of this quotation" : "Terms",
    MARGIN,
    layout.y,
  );
  font(pdf, "normal", 8.5, COLORS.text);
  pdf.text(pdf.splitTextToSize(terms, leftW).slice(0, 6), MARGIN, layout.y + 13);

  font(pdf, "bold", 8.5, COLORS.muted);
  pdf.text(issuer ? `For ${issuer.legalName}` : "Authorised signatory", rightX, layout.y);
  setColor(pdf, COLORS.border, "draw");
  pdf.line(rightX, layout.y + 42, rightX + 150, layout.y + 42);
  font(pdf, "normal", 8, COLORS.muted);
  pdf.text("Signature", rightX, layout.y + 52);
}

function stampFooters(layout: Layout, doc: BillDocument, primary: Rgb) {
  const { pdf } = layout;
  const issuerName = doc.issuer?.legalName ?? doc.brandName;
  const pageCount = pdf.getNumberOfPages();
  const label = doc.kind === "quotation" ? "quotation" : "invoice";
  const site = (doc.issuer?.websiteUrl ?? "OrderBook").replace(/^https?:\/\//, "");

  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    const y = layout.pageHeight - 20;
    setColor(pdf, COLORS.border, "draw");
    pdf.line(MARGIN, y - 9, MARGIN + layout.contentWidth, y - 9);
    font(pdf, "normal", 8, COLORS.muted);
    pdf.text(`Computer-generated ${label} from ${issuerName}.`, MARGIN, y);
    pdf.text(`Page ${page} of ${pageCount}`, MARGIN + layout.contentWidth / 2, y, {
      align: "center",
    });
    setColor(pdf, doc.issuer ? primary : COLORS.accent, "text");
    pdf.text(site, MARGIN + layout.contentWidth, y, { align: "right" });
  }
}

export function renderBillPdf(
  doc: BillDocument,
  pdf: jsPDF,
  opts?: { logoDataUrl?: string | null; lineImageDataUrls?: (string | null)[] },
): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const isQuote = doc.kind === "quotation";
  const lineImageDataUrls = opts?.lineImageDataUrls ?? [];
  const showLineImages =
    isQuote && lineImageDataUrls.some((url) => Boolean(url?.trim()));

  const layout: Layout = {
    pdf,
    pageWidth,
    pageHeight,
    contentWidth,
    bottomLimit: pageHeight - MARGIN - FOOTER_BAND,
    y: 0,
    showLineImages,
    currency: doc.currencyCode,
    cols: computeTableColumns({
      contentLeft: MARGIN,
      contentWidth,
      showPhoto: showLineImages,
    }),
  };

  const primary = doc.issuer?.accentColor ?? COLORS.primary;
  const terms = isQuote
    ? (doc.issuer?.quotationTerms ??
      "Prices are exclusive of taxes unless stated above. Quotation valid for 15 days.")
    : (doc.issuer?.invoiceTerms ??
      "Payment as per agreed terms. Goods are covered by the company warranty policy.");

  drawLetterhead(layout, doc, primary, opts?.logoDataUrl ?? null);
  drawMetaCards(layout, doc);

  ensurePage(layout, 40);
  font(pdf, "italic", 9, COLORS.muted);
  const descriptor = pdf.splitTextToSize(
    isQuote
      ? "Proforma estimate — not a receipt until payment is confirmed."
      : "Bill / receipt for the goods and services listed below.",
    contentWidth,
  );
  pdf.text(descriptor, MARGIN, layout.y);
  layout.y += 11 * descriptor.length + 10;

  drawTableHeader(layout);
  drawLines(layout, doc, lineImageDataUrls);
  drawTotals(layout, doc);

  if (doc.notes?.trim()) drawTextBlock(layout, "Notes", doc.notes.trim());
  if (doc.receiptFooter?.trim()) {
    drawTextBlock(layout, "", doc.receiptFooter.trim(), "muted");
  }

  drawTermsAndSignature(layout, doc, terms);
  stampFooters(layout, doc, primary);
}
