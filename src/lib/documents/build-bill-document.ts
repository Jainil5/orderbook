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

type CatalogLine = Pick<
  Product,
  "id" | "unit" | "sku" | "description" | "image_url"
>;

function catalogFor(
  productId: string | null,
  products?: CatalogLine[],
): CatalogLine | undefined {
  if (!productId || !products) return undefined;
  return products.find((p) => p.id === productId);
}

function resolveOrderLineImageUrl(
  item: OrderItem,
  catalog?: CatalogLine,
): string | null {
  const snapshot = item.product_image_url_snapshot?.trim();
  if (snapshot) return snapshot;
  return catalog?.image_url ?? null;
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
  serviceDate?: string | null;
  siteAddress?: string | null;
  depositPercent?: number | null;
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
    customerAddress: params.siteAddress?.trim() || null,
    notes: params.notes?.trim() || null,
    paymentMethod: kind === "quotation" ? null : params.paymentMethod,
    createdAt: new Date().toISOString(),
    serviceDate: params.serviceDate ?? null,
    lines: params.cart.map((line) => ({
      name: line.product.name,
      quantity: line.quantity,
      unit: line.product.unit,
      listUnitPrice: line.product.price,
      lineDiscount: productLineDiscountAmount(line.product, line.quantity),
      lineTotal: lineNetTotal(line.product, line.quantity),
      imageUrl: params.isQuote ? (line.product.image_url ?? null) : null,
      sku: line.product.sku ?? null,
      description: line.product.description ?? null,
    })),
    listSubtotal: params.totals.listSubtotal,
    productDiscountTotal: params.totals.productDiscountTotal,
    orderDiscountAmount: params.totals.orderDiscountAmount,
    offerDiscountAmount: params.totals.offerDiscountAmount,
    taxableSubtotal: params.totals.taxableSubtotal,
    taxTotal: params.totals.taxTotal,
    feesTotal: params.totals.feesTotal,
    grandTotal: params.totals.grandTotal,
    depositPercent: params.depositPercent ?? null,
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
  products?: CatalogLine[];
  /** Quote number this bill was raised from, for the reference line. */
  referenceNumber?: string | null;
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
    customerAddress: order.delivery_address?.trim() || null,
    notes: order.notes,
    paymentMethod: kind === "quotation" ? null : order.payment_method ?? null,
    createdAt: order.created_at,
    serviceDate: order.service_date ?? null,
    lines: items.map((item) => {
      const catalog = catalogFor(item.product_id, params.products);
      return {
        name: item.product_name_snapshot,
        quantity: item.quantity,
        unit: catalog?.unit ?? null,
        listUnitPrice: item.unit_price,
        lineDiscount: item.line_discount,
        lineTotal: item.line_total,
        imageUrl:
          kind === "quotation"
            ? resolveOrderLineImageUrl(item, catalog)
            : null,
        sku: catalog?.sku ?? null,
        description: catalog?.description ?? null,
      };
    }),
    listSubtotal,
    productDiscountTotal,
    orderDiscountAmount: Math.max(
      0,
      order.discount_total - productDiscountTotal,
    ),
    taxableSubtotal: order.subtotal,
    taxTotal: order.tax_total,
    feesTotal: order.fees_total ?? 0,
    grandTotal: order.grand_total,
    amountPaid: order.amount_paid ?? 0,
    depositPercent: order.deposit_percent ?? null,
    referenceNumber: params.referenceNumber ?? null,
    },
    params.brandCode,
    params.brandSettings,
  );
}
