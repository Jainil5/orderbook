import type { DocumentBrandProfile } from "@/lib/documents/brand-profile";

export type BillDocumentKind = "bill" | "quotation";

export type { DocumentBrandProfile };

export type BillLineItem = {
  name: string;
  quantity: number;
  unit: string | null;
  listUnitPrice: number;
  lineDiscount: number;
  lineTotal: number;
  /** Product photo for quotation PDFs and previews */
  imageUrl?: string | null;
  /** Catalog code, printed under the description when known. */
  sku?: string | null;
  /** Catalog description, wrapped under the name when known. */
  description?: string | null;
};

export type BillDocument = {
  kind: BillDocumentKind;
  orderNumber: string;
  brandName: string;
  brandCode?: string;
  issuer?: DocumentBrandProfile | null;
  receiptHeader: string | null;
  receiptFooter: string | null;
  currencyCode: string;
  taxRatePercent: number;
  customerName: string | null;
  customerPhone: string | null;
  /** Site / delivery address captured on the order, printed on project documents. */
  customerAddress?: string | null;
  notes: string | null;
  paymentMethod: string | null;
  createdAt: string;
  /** Delivery / installation date chosen at billing. */
  serviceDate?: string | null;
  lines: BillLineItem[];
  listSubtotal: number;
  productDiscountTotal: number;
  orderDiscountAmount: number;
  offerDiscountAmount?: number;
  taxableSubtotal: number;
  taxTotal: number;
  /** Untaxed delivery / installation charges. */
  feesTotal?: number;
  grandTotal: number;
  /** Advance or deposit already received against this document. */
  amountPaid?: number;
  /** Deposit percentage asked for on a quotation. */
  depositPercent?: number | null;
  /** Set when this bill was raised from an accepted quotation. */
  referenceNumber?: string | null;
};
