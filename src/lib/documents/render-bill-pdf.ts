import type { jsPDF } from "jspdf";
import type { BillDocument } from "@/lib/documents/types";
import { imageFormatFromDataUrl } from "@/lib/documents/load-image-data-url";
import {
  advanceDueAmount,
  buildDetailRows,
  buildTotalsRows,
  computeTableColumns,
  formatDocumentDateTime,
  formatPdfAmount,
  lineRowHeight,
  type TableColumns,
} from "@/lib/documents/pdf-layout";

const COLORS = {
  primary: [20, 20, 19] as const,
  primaryLight: [240, 240, 238] as const,
  text: [20, 20, 19] as const,
  muted: [111, 111, 108] as const,
  border: [201, 201, 197] as const,
  rowAlt: [247, 247, 245] as const,
  white: [255, 255, 255] as const,
  accent: [130, 130, 126] as const,
  success: [47, 107, 76] as const,
};

const MARGIN = 44;
/** Blank band kept clear at the foot of every page for the stamped footer. */
const FOOTER_BAND = 56;
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

/**
 * The masthead: who issued the paper and which document it is. The brand's
 * address and contact are printed once, in the footer band, so the sheet reads
 * top-down — who, which order, what it costs, where to write.
 */
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
    pdf.text(formatDocumentDateTime(doc.createdAt), pageWidth - MARGIN, 56, {
      align: "right",
    });
    layout.y = headerH + 24;
    return;
  }

  const letterheadH = 84;
  const titleBarH = 32;
  setColor(pdf, COLORS.white, "fill");
  pdf.rect(0, 0, pageWidth, letterheadH, "F");
  setColor(pdf, COLORS.border, "draw");
  pdf.line(0, letterheadH, pageWidth, letterheadH);

  const drewLogo = logoDataUrl
    ? drawLogo(pdf, logoDataUrl, MARGIN, 16, 168, 44)
    : false;
  if (!drewLogo) {
    font(pdf, "bold", 16, COLORS.text);
    pdf.text(issuer.legalName, MARGIN, 38);
  }
  if (issuer.tagline) {
    font(pdf, "normal", 8, COLORS.muted);
    pdf.text(issuer.tagline, MARGIN, drewLogo ? 72 : 52);
  }

  /* No address block up here any more — the masthead carries the mark and the
     document's own title, and the contact details belong at the foot. The legal
     name only appears on the right when the logo took the left. */
  font(pdf, "bold", 9, COLORS.text);
  if (drewLogo) {
    pdf.text(issuer.legalName, pageWidth - MARGIN, 24, { align: "right" });
  }
  font(pdf, "normal", 8, COLORS.muted);
  pdf.text(
    formatDocumentDateTime(doc.createdAt),
    pageWidth - MARGIN,
    drewLogo ? 37 : 24,
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

/**
 * The document's own details, printed flat between two hairlines — number,
 * date, customer, mobile, and the rest. Two columns because the list is long;
 * no boxes, because this is a sheet of paper rather than a screen.
 */
function drawDetails(layout: Layout, doc: BillDocument, isQuote: boolean) {
  const { pdf, contentWidth } = layout;
  const rows = buildDetailRows(doc);
  const colW = (contentWidth - 16) / 2;
  const labelSize = 7.5;
  const valueSize = 9;
  /** Values are right-aligned in the column, so labels get a fixed gutter. */
  const valueWidth = colW - 96;

  // Measured before anything is drawn: a wrapped address makes the block taller.
  const measured = rows.map((row) => {
    font(pdf, "normal", valueSize, COLORS.text);
    const lines: string[] = pdf.splitTextToSize(row.value, valueWidth);
    return { ...row, lines: Math.max(1, lines.length) };
  });
  const half = Math.ceil(measured.length / 2);
  const columnHeight = (start: number, end: number) => {
    let height = 0;
    for (let index = start; index < end; index += 1) {
      height += 12 * measured[index].lines + 3;
    }
    return height;
  };
  const blockH =
    Math.max(columnHeight(0, half), columnHeight(half, measured.length)) + 26;

  ensurePage(layout, blockH);
  const top = layout.y;
  setColor(pdf, COLORS.border, "draw");
  pdf.line(MARGIN, top, MARGIN + contentWidth, top);
  pdf.line(MARGIN, top + blockH, MARGIN + contentWidth, top + blockH);

  // Plain capitals: jsPDF's standard fonts are WinAnsi, so a letter-spaced or
  // thin-spaced title would print as garbage glyphs.
  font(pdf, "bold", labelSize, COLORS.muted);
  pdf.text(isQuote ? "QUOTATION DETAILS" : "BILL DETAILS", MARGIN, top + 14);

  let y = top + 30;
  measured.forEach((row, index) => {
    const column = index < half ? 0 : 1;
    if (index === half) y = top + 30;
    const x = MARGIN + column * (colW + 16);
    const lines: string[] = pdf.splitTextToSize(row.value, valueWidth);
    font(pdf, "normal", labelSize, COLORS.muted);
    pdf.text(row.label.toUpperCase(), x, y);
    font(pdf, "normal", valueSize, COLORS.text);
    pdf.text(lines, x + colW - 4, y, { align: "right" });
    y += 12 * Math.max(1, lines.length) + 3;
  });

  layout.y = top + blockH + 14;
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

/**
 * The money, printed flat at the right edge of the sheet — the same rows the
 * browser export lays out, with no panel around them.
 */
function drawTotals(layout: Layout, doc: BillDocument) {
  const { pdf, pageWidth } = layout;
  const rows = buildTotalsRows(doc);
  const totalsW = Math.min(268, layout.contentWidth);
  const totalsX = pageWidth - MARGIN - totalsW;
  const right = totalsX + totalsW;
  const rowH = 15;

  layout.y += 10;
  ensurePage(layout, rows.length * rowH + 16);

  let ty = layout.y + 14;
  rows.forEach((row, index) => {
    const strong = row.tone === "strong";
    const color = strong
      ? COLORS.text
      : row.tone === "discount"
        ? COLORS.success
        : COLORS.muted;
    if (index === 0 || strong) {
      setColor(pdf, COLORS.border, "draw");
      pdf.line(totalsX, ty - 10, right, ty - 10);
    }
    font(pdf, strong ? "bold" : "normal", strong ? 11 : 9, color);
    pdf.text(row.label, totalsX, ty);
    pdf.text(money(row.amount, layout.currency), right, ty, { align: "right" });
    ty += rowH;
  });

  layout.y = ty + 4;

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

/**
 * The footer band, stamped on every page: where the brand is and how to reach
 * it, then what this paper is. Printing it per page is the point — a quotation
 * that runs to three pages still carries its address on each of them.
 */
function stampFooters(layout: Layout, doc: BillDocument, primary: Rgb) {
  const { pdf, pageHeight } = layout;
  const issuer = doc.issuer;
  const issuerName = issuer?.legalName ?? doc.brandName;
  const label = doc.kind === "quotation" ? "quotation" : "invoice";
  const pageCount = pdf.getNumberOfPages();
  const rule = pageHeight - 46;
  const contact = issuer
    ? [issuer.addressLines.join(", "), issuer.phone, issuer.email]
        .map((value) => value.trim())
        .filter(Boolean)
        .join(" · ")
    : "";
  const site = issuer
    ? issuer.websiteUrl.replace(/^https?:\/\//, "")
    : "OrderBook";

  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    setColor(pdf, COLORS.border, "draw");
    pdf.line(MARGIN, rule, MARGIN + layout.contentWidth, rule);
    if (contact) {
      font(pdf, "normal", 7.5, COLORS.muted);
      const fitted: string[] = pdf.splitTextToSize(contact, layout.contentWidth - 120);
      pdf.text(fitted[0] ?? contact, MARGIN, rule + 9);
      setColor(pdf, primary, "text");
      pdf.text(site, MARGIN + layout.contentWidth, rule + 9, { align: "right" });
    }
    font(pdf, "normal", 7.5, COLORS.muted);
    pdf.text(`Computer-generated ${label} from ${issuerName}.`, MARGIN, rule + 19);
    pdf.text(`Page ${page} of ${pageCount}`, MARGIN + layout.contentWidth / 2, rule + 19, {
      align: "center",
    });
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
  const showLineImages = lineImageDataUrls.some((url) =>
    Boolean(url?.trim()),
  );

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
  drawDetails(layout, doc, isQuote);

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
