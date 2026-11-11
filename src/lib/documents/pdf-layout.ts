import type { BillDocument } from "./types";

/**
 * Pure geometry and money arithmetic for the PDF renderer. Nothing here touches
 * jsPDF, so every rule the printed document depends on is unit-testable.
 */

export type Column = { x: number; w: number };

export type TableColumns = {
  index: Column;
  photo: Column;
  description: Column;
  qty: Column;
  rate: Column;
  discount: Column;
  amount: Column;
};

const COL = {
  index: 20,
  photo: 54,
  qty: 46,
  rate: 62,
  discount: 58,
  amount: 82,
  gap: 8,
};

export function computeTableColumns(params: {
  contentLeft: number;
  contentWidth: number;
  showPhoto: boolean;
}): TableColumns {
  const { contentLeft, contentWidth, showPhoto } = params;
  const right = contentLeft + contentWidth;

  const amount: Column = { x: right - COL.amount, w: COL.amount };
  const discount: Column = {
    x: amount.x - COL.gap - COL.discount,
    w: COL.discount,
  };
  const rate: Column = { x: discount.x - COL.gap - COL.rate, w: COL.rate };
  const qty: Column = { x: rate.x - COL.gap - COL.qty, w: COL.qty };

  const index: Column = { x: contentLeft, w: COL.index };
  const photo: Column = showPhoto
    ? { x: index.x + index.w, w: COL.photo }
    : { x: index.x + index.w, w: 0 };
  const descriptionStart = photo.x + photo.w;
  const description: Column = {
    x: descriptionStart,
    w: qty.x - COL.gap - descriptionStart,
  };

  return { index, photo, description, qty, rate, discount, amount };
}

export type TaxSplit = {
  cgstRate: number;
  sgstRate: number;
  cgstAmount: number;
  sgstAmount: number;
};

export function splitStateTax(taxRatePercent: number, taxTotal: number): TaxSplit {
  const half = round2(taxRatePercent / 2);
  const cgstAmount = round2(taxTotal / 2);
  return {
    cgstRate: half,
    sgstRate: half,
    cgstAmount,
    sgstAmount: round2(taxTotal - cgstAmount),
  };
}

export type TotalsTone = "normal" | "discount" | "strong" | "sub";

export type TotalsRow = { label: string; amount: number; tone: TotalsTone };

/**
 * jsPDF's standard 14 fonts are WinAnsi-encoded, which has no rupee sign and no
 * U+2212 minus; both print as garbage glyphs that also blow out the measured
 * text width. Printed amounts stay ASCII, so GST invoices read "Rs." like the
 * paper ones do.
 */
export function formatPdfAmount(amount: number, currencyCode: string): string {
  const digits = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return currencyCode === "INR" ? `Rs. ${digits}` : `${currencyCode} ${digits}`;
}

export function advanceDueAmount(grandTotal: number, depositPercent: number) {
  return round2((grandTotal * depositPercent) / 100);
}

export function buildTotalsRows(doc: BillDocument): TotalsRow[] {
  const isQuote = doc.kind === "quotation";
  const rows: TotalsRow[] = [
    { label: "List subtotal", amount: doc.listSubtotal, tone: "normal" },
  ];
  if (doc.productDiscountTotal > 0) {
    rows.push({
      label: "Product discounts",
      amount: -doc.productDiscountTotal,
      tone: "discount",
    });
  }
  if (doc.orderDiscountAmount > 0) {
    rows.push({
      label: "Order discount",
      amount: -doc.orderDiscountAmount,
      tone: "discount",
    });
  }
  if ((doc.offerDiscountAmount ?? 0) > 0) {
    rows.push({
      label: "Offer discount",
      amount: -(doc.offerDiscountAmount ?? 0),
      tone: "discount",
    });
  }
  rows.push({
    label: "Taxable amount",
    amount: doc.taxableSubtotal,
    tone: "normal",
  });

  if (doc.taxRatePercent > 0) {
    const split = splitStateTax(doc.taxRatePercent, doc.taxTotal);
    rows.push(
      {
        label: `CGST (${trimRate(split.cgstRate)}%)`,
        amount: split.cgstAmount,
        tone: "normal",
      },
      {
        label: `SGST (${trimRate(split.sgstRate)}%)`,
        amount: split.sgstAmount,
        tone: "normal",
      },
    );
  } else {
    rows.push({ label: "Tax", amount: doc.taxTotal, tone: "normal" });
  }

  if ((doc.feesTotal ?? 0) > 0) {
    rows.push({
      label: "Delivery & installation",
      amount: doc.feesTotal ?? 0,
      tone: "normal",
    });
  }

  rows.push({
    label: isQuote ? "Quotation total" : "Total payable",
    amount: doc.grandTotal,
    tone: isQuote ? "strong" : "normal",
  });

  if (isQuote) {
    if (doc.depositPercent && doc.depositPercent > 0) {
      rows.push({
        label: `Advance payable (${trimRate(doc.depositPercent)}%)`,
        amount: advanceDueAmount(doc.grandTotal, doc.depositPercent),
        tone: "sub",
      });
    }
    return rows;
  }

  const paid = doc.amountPaid ?? 0;
  if (paid > 0) {
    rows.push({
      label: doc.paymentMethod
        ? `Amount received (${doc.paymentMethod})`
        : "Amount received",
      amount: -paid,
      tone: "discount",
    });
    rows.push({
      label: "Balance due",
      amount: round2(doc.grandTotal - paid),
      tone: "strong",
    });
  } else {
    rows.push({ label: "Balance due", amount: doc.grandTotal, tone: "strong" });
  }
  return rows;
}

export function lineRowHeight(params: {
  nameLines: number;
  metaLines: number;
  showPhoto: boolean;
}) {
  const text = 12 * params.nameLines + 10 * params.metaLines + 12;
  return Math.max(params.showPhoto ? 52 : 22, text);
}

export function quotationValidUntil(createdAt: string, days = 15) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function round2(amount: number) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function trimRate(rate: number) {
  return String(Number(rate.toFixed(2)));
}
