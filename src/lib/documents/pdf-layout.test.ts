import { describe, expect, it } from "vitest";
import {
  buildTotalsRows,
  computeTableColumns,
  formatPdfAmount,
  lineRowHeight,
  quotationValidUntil,
  splitStateTax,
} from "./pdf-layout";
import type { BillDocument } from "./types";

const A4_CONTENT_LEFT = 44;
const A4_CONTENT_WIDTH = 595.28 - 44 * 2;

function doc(overrides: Partial<BillDocument> = {}): BillDocument {
  return {
    kind: "quotation",
    orderNumber: "CF-Q-1",
    brandName: "Cubig Furniture",
    receiptHeader: null,
    receiptFooter: null,
    currencyCode: "INR",
    taxRatePercent: 18,
    customerName: "Asha Sheth",
    customerPhone: "9876500011",
    notes: null,
    paymentMethod: null,
    createdAt: "2026-11-11T10:00:00.000Z",
    lines: [],
    listSubtotal: 54900,
    productDiscountTotal: 0,
    orderDiscountAmount: 0,
    offerDiscountAmount: 0,
    taxableSubtotal: 54900,
    taxTotal: 9882,
    feesTotal: 0,
    grandTotal: 64782,
    ...overrides,
  };
}

describe("computeTableColumns", () => {
  it("keeps every column inside the content box, right-aligned to its edge", () => {
    const cols = computeTableColumns({
      contentLeft: A4_CONTENT_LEFT,
      contentWidth: A4_CONTENT_WIDTH,
      showPhoto: false,
    });
    const right = A4_CONTENT_LEFT + A4_CONTENT_WIDTH;
    expect(cols.amount.x + cols.amount.w).toBeCloseTo(right, 6);
    expect(cols.qty.x).toBeGreaterThan(cols.description.x);
    expect(cols.description.w).toBeGreaterThan(190);
    for (const col of Object.values(cols)) {
      expect(col.x).toBeGreaterThanOrEqual(A4_CONTENT_LEFT);
      expect(col.x + col.w).toBeLessThanOrEqual(right + 0.001);
    }
  });

  it("still leaves a usable description column when photos are shown", () => {
    const cols = computeTableColumns({
      contentLeft: A4_CONTENT_LEFT,
      contentWidth: A4_CONTENT_WIDTH,
      showPhoto: true,
    });
    expect(cols.photo.w).toBeGreaterThanOrEqual(48);
    expect(cols.description.w).toBeGreaterThanOrEqual(150);
    expect(cols.description.x).toBeGreaterThan(cols.photo.x + cols.photo.w - 1);
  });
});

describe("splitStateTax", () => {
  it("halves the rate and splits the tax so both lines add back exactly", () => {
    const split = splitStateTax(18, 9882);
    expect(split.cgstRate).toBe(9);
    expect(split.sgstRate).toBe(9);
    expect(split.cgstAmount + split.sgstAmount).toBe(9882);
  });

  it("splits an odd paisa so the two halves still add back exactly", () => {
    const split = splitStateTax(18, 101.01);
    expect(split.cgstAmount).toBe(50.51);
    expect(split.sgstAmount).toBe(50.5);
    expect(split.cgstAmount + split.sgstAmount).toBeCloseTo(101.01, 6);
  });

  it("leaves both halves at zero for an untaxed document", () => {
    const split = splitStateTax(0, 0);
    expect(split.cgstAmount).toBe(0);
    expect(split.sgstAmount).toBe(0);
  });
});

describe("buildTotalsRows", () => {
  it("hides discount rows that carry no money", () => {
    const labels = buildTotalsRows(doc()).map((r) => r.label);
    expect(labels).toEqual([
      "List subtotal",
      "Taxable amount",
      "CGST (9%)",
      "SGST (9%)",
      "Quotation total",
    ]);
  });

  it("shows every discount, the charges line and the advance due on a quotation", () => {
    const rows = buildTotalsRows(
      doc({
        productDiscountTotal: 4000,
        orderDiscountAmount: 1500,
        offerDiscountAmount: 900,
        taxableSubtotal: 48500,
        taxTotal: 8730,
        feesTotal: 4500,
        grandTotal: 61730,
        depositPercent: 40,
      }),
    );
    expect(rows.map((r) => r.label)).toEqual([
      "List subtotal",
      "Product discounts",
      "Order discount",
      "Offer discount",
      "Taxable amount",
      "CGST (9%)",
      "SGST (9%)",
      "Delivery & installation",
      "Quotation total",
      "Advance payable (40%)",
    ]);
    const advance = rows[rows.length - 1];
    expect(advance.amount).toBe(24692);
    expect(rows.find((r) => r.label === "Quotation total")?.tone).toBe("strong");
  });

  it("reports what is received and what is still owed on a bill", () => {
    const rows = buildTotalsRows(
      doc({ kind: "bill", amountPaid: 20000, paymentMethod: "UPI" }),
    );
    const tail = rows.slice(-3).map((r) => `${r.label}:${r.amount}:${r.tone}`);
    expect(tail).toEqual([
      "Total payable:64782:normal",
      "Amount received (UPI):-20000:discount",
      "Balance due:44782:strong",
    ]);
  });

  it("keeps a visible tax line even when the brand charges none", () => {
    const rows = buildTotalsRows(doc({ taxRatePercent: 0, taxTotal: 0 }));
    expect(rows.map((r) => r.label)).toEqual([
      "List subtotal",
      "Taxable amount",
      "Tax",
      "Quotation total",
    ]);
  });
});

describe("formatPdfAmount", () => {
  it("prints rupees as plain ASCII, which the standard PDF fonts can draw", () => {
    const out = formatPdfAmount(152000, "INR");
    expect(out).toBe("Rs. 1,52,000.00");
    expect(out).not.toMatch(/[^ -~]/);
  });

  it("signs nothing and names the currency when it is not rupees", () => {
    expect(formatPdfAmount(-6000, "INR")).toBe("Rs. 6,000.00");
    expect(formatPdfAmount(1200, "USD")).toBe("USD 1,200.00");
  });
});

describe("lineRowHeight", () => {
  it("grows with the wrapped text it has to hold", () => {
    const one = lineRowHeight({ nameLines: 1, metaLines: 0, showPhoto: false });
    const many = lineRowHeight({ nameLines: 2, metaLines: 2, showPhoto: false });
    expect(many).toBeGreaterThan(one);
  });

  it("never lets a thumbnail be clipped by its row", () => {
    const h = lineRowHeight({ nameLines: 1, metaLines: 0, showPhoto: true });
    expect(h).toBeGreaterThanOrEqual(50);
  });
});

describe("quotationValidUntil", () => {
  it("dates the offer forward by the validity window", () => {
    expect(quotationValidUntil("2026-11-11T10:00:00.000Z", 15)).toBe(
      "26 Nov 2026",
    );
  });

  it("falls back to a 15-day window", () => {
    expect(quotationValidUntil("2026-11-11T10:00:00.000Z")).toBe("26 Nov 2026");
  });
});
