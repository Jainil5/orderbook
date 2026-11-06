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
  notes: string | null;
  paymentMethod: string | null;
  createdAt: string;
  lines: BillLineItem[];
  listSubtotal: number;
  productDiscountTotal: number;
  orderDiscountAmount: number;
  taxableSubtotal: number;
  taxTotal: number;
  grandTotal: number;
};
