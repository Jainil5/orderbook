import type { CartLine } from "@/components/billing/types";
import type { CartTotals } from "@/lib/pricing/discounts";
import {
  lineNetTotal,
  productLineDiscountAmount,
} from "@/lib/pricing/discounts";
import type { BillDocument, BillDocumentKind } from "@/lib/documents/types";
import type { Order, OrderItem, Product } from "@/types/database";
import type { BrandSettings } from "@/types/database";
import { getDocumentBrandProfile } from "@/lib/documents/brand-profile";

function attachIssuer(
  doc: BillDocument,
  brandCode: string | undefined,
  settings?: Pick<
    BrandSettings,
    "contact_email" | "contact_phone" | "brand_website_url" | "receipt_header"
  >,
): BillDocument {
  if (!brandCode) return doc;
  const issuer = getDocumentBrandProfile(brandCode, settings);
  if (!issuer) return doc;
  return { ...doc, brandCode, issuer };
}

export function productImageLookupFromProducts(
  products: Pick<Product, "id" | "image_url">[],
): Map<string, string | null> {
  return new Map(products.map((p) => [p.id, p.image_url ?? null]));
}

function resolveOrderLineImageUrl(
  item: OrderItem,
  productImageByProductId?: Map<string, string | null>,
): string | null {
  const snapshot = item.product_image_url_snapshot?.trim();
  if (snapshot) return snapshot;
  if (item.product_id && productImageByProductId?.has(item.product_id)) {
    return productImageByProductId.get(item.product_id) ?? null;
  }
  return null;
}

export function billDocumentFilename(doc: BillDocument): string {
  const prefix = doc.kind === "quotation" ? "Quotation" : "Bill";
  const safe = doc.orderNumber.replace(/[^\w-]+/g, "-");
  return `${prefix}-${safe}.pdf`;
}

export function inferDocumentKind(
  orderNumber: string,
  isQuote?: boolean,
): BillDocumentKind {
  if (isQuote) return "quotation";
  if (/-Q-/i.test(orderNumber) || orderNumber.includes("-Q")) {
    return "quotation";
  }
  return "bill";
}

export function buildBillDocumentFromCheckout(params: {
  orderNumber: string;
  isQuote: boolean;
  brandName: string;
  brandCode?: string;
  brandSettings?: Pick<
    BrandSettings,
    "contact_email" | "contact_phone" | "brand_website_url" | "receipt_header"
  >;
  receiptHeader: string | null;
  receiptFooter: string | null;
  currencyCode: string;
  taxRatePercent: number;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  paymentMethod: string | null;
  cart: CartLine[];
  totals: CartTotals;
}): BillDocument {
  const kind = inferDocumentKind(params.orderNumber, params.isQuote);
  const doc: BillDocument = {
    kind,
    orderNumber: params.orderNumber,
    brandName: params.brandName,
    receiptHeader: params.receiptHeader,
    receiptFooter: params.receiptFooter,
    currencyCode: params.currencyCode,
    taxRatePercent: params.taxRatePercent,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    notes: params.notes?.trim() || null,
    paymentMethod: kind === "quotation" ? null : params.paymentMethod,
    createdAt: new Date().toISOString(),
    lines: params.cart.map((line) => ({
      name: line.product.name,
      quantity: line.quantity,
      unit: line.product.unit,
      listUnitPrice: line.product.price,
      lineDiscount: productLineDiscountAmount(line.product, line.quantity),
      lineTotal: lineNetTotal(line.product, line.quantity),
      imageUrl: params.isQuote ? (line.product.image_url ?? null) : null,
    })),
    listSubtotal: params.totals.listSubtotal,
    productDiscountTotal: params.totals.productDiscountTotal,
    orderDiscountAmount: params.totals.orderDiscountAmount,
    taxableSubtotal: params.totals.taxableSubtotal,
    taxTotal: params.totals.taxTotal,
    grandTotal: params.totals.grandTotal,
  };
  return attachIssuer(doc, params.brandCode, params.brandSettings);
}

export function buildBillDocumentFromOrder(params: {
  order: Order;
  items: OrderItem[];
  brandName: string;
  brandCode?: string;
  brandSettings?: Pick<
    BrandSettings,
    "contact_email" | "contact_phone" | "brand_website_url" | "receipt_header"
  >;
  receiptHeader: string | null;
  receiptFooter: string | null;
  currencyCode: string;
  taxRatePercent: number;
  customerPhone?: string | null;
  productImageByProductId?: Map<string, string | null>;
}): BillDocument {
  const { order, items } = params;
  const kind =
    order.status === "draft" ||
    order.payment_status === "pending" ||
    inferDocumentKind(order.order_number) === "quotation"
      ? "quotation"
      : "bill";

  const productDiscountTotal = items.reduce(
    (s, i) => s + (i.line_discount ?? 0),
    0,
  );
  const listSubtotal = items.reduce(
    (s, i) => s + i.unit_price * i.quantity,
    0,
  );

  return attachIssuer(
    {
    kind,
    orderNumber: order.order_number,
    brandName: params.brandName,
    receiptHeader: params.receiptHeader,
    receiptFooter: params.receiptFooter,
    currencyCode: params.currencyCode,
    taxRatePercent: params.taxRatePercent,
    customerName: order.customer_name_snapshot,
    customerPhone: params.customerPhone ?? null,
    notes: order.notes,
    paymentMethod: null,
    createdAt: order.created_at,
    lines: items.map((item) => ({
      name: item.product_name_snapshot,
      quantity: item.quantity,
      unit: null,
      listUnitPrice: item.unit_price,
      lineDiscount: item.line_discount,
      lineTotal: item.line_total,
      imageUrl:
        kind === "quotation"
          ? resolveOrderLineImageUrl(item, params.productImageByProductId)
          : null,
    })),
    listSubtotal,
    productDiscountTotal,
    orderDiscountAmount: Math.max(
      0,
      order.discount_total - productDiscountTotal,
    ),
    taxableSubtotal: order.subtotal,
    taxTotal: order.tax_total,
    grandTotal: order.grand_total,
    },
    params.brandCode,
    params.brandSettings,
  );
}
