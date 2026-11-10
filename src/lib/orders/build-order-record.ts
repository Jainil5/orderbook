import type {
  CreateOrderInput,
  Customer,
  Offer,
  Order,
  OrderItem,
  Product,
} from "@/types/database";
import {
  computeCartTotals,
  lineNetTotal,
  productLineDiscountAmount,
} from "@/lib/pricing/discounts";
import {
  computeOfferDiscountAmount,
  findActiveOffer,
} from "@/lib/pricing/offers";
import { customerPriceTier, listUnitPrice } from "@/lib/pricing/unit-price";
import { parseProductModifiers } from "@/lib/products/modifiers";
import { validateCreateOrderInput } from "@/lib/security/validate-order";
import { localDayKey } from "@/lib/manager/time";

export type BuiltOrderRecord = {
  order: Order;
  items: OrderItem[];
  appliedOffer: Offer | null;
};

import { createPublicQuoteToken } from "@/lib/security/public-token";

type PricedLine = {
  product: Product;
  pricedProduct: Product;
  quantity: number;
  modifierLabels: string | null;
};

function buildPricedLines(params: {
  input: CreateOrderInput;
  products: Product[];
  customers: Customer[];
}): { ok: true; lines: PricedLine[] } | { ok: false; message: string } {
  const productById = new Map(params.products.map((p) => [p.id, p]));
  let tier = params.input.priceTier ?? "retail";
  if (params.input.customerId) {
    const customer = params.customers.find((c) => c.id === params.input.customerId);
    tier = customerPriceTier(customer);
  }

  const lines: PricedLine[] = [];
  for (const line of params.input.lines) {
    const product = productById.get(line.productId);
    if (!product || !product.is_active) {
      return {
        ok: false,
        message: "A product on this bill is invalid or inactive.",
      };
    }
    if (
      product.stock_qty != null &&
      Number.isFinite(product.stock_qty) &&
      line.quantity > product.stock_qty
    ) {
      return {
        ok: false,
        message: `Not enough stock for ${product.name} (${product.stock_qty} left).`,
      };
    }

    const modifiers = parseProductModifiers(product);
    const selected = modifiers.filter((m) =>
      line.modifierIds?.includes(m.id),
    );
    const modifierExtra = selected.reduce((sum, m) => sum + m.price, 0);
    const unitList = listUnitPrice(product, tier) + modifierExtra;
    const pricedProduct: Product = { ...product, price: unitList };

    lines.push({
      product,
      pricedProduct,
      quantity: line.quantity,
      modifierLabels: selected.length
        ? selected.map((m) => m.name).join(", ")
        : null,
    });
  }
  return { ok: true, lines };
}

export function buildOrderRecord(params: {
  brandId: string;
  orderId: string;
  orderNumber: string;
  products: Product[];
  customers: Customer[];
  taxRatePercent: number;
  input: CreateOrderInput;
  offers?: Offer[];
}): { ok: true; record: BuiltOrderRecord } | { ok: false; message: string } {
  const validation = validateCreateOrderInput(params.input);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const priced = buildPricedLines({
    input: params.input,
    products: params.products,
    customers: params.customers,
  });
  if (!priced.ok) return priced;

  const cartLines = priced.lines.map((l) => ({
    product: l.pricedProduct,
    quantity: l.quantity,
  }));

  const preOfferTotals = computeCartTotals({
    lines: cartLines,
    taxRatePercent: params.taxRatePercent,
    orderDiscount: params.input.orderDiscount ?? null,
  });

  let appliedOffer: Offer | null = null;
  let offerDiscountAmount = 0;
  const code = params.input.offerCode?.trim();
  if (code && params.offers?.length) {
    appliedOffer = findActiveOffer(code, params.offers);
    if (!appliedOffer) {
      return { ok: false, message: "Offer code is invalid or expired." };
    }
    offerDiscountAmount = computeOfferDiscountAmount(appliedOffer, {
      lines: cartLines,
      subtotalAfterProductDiscounts:
        preOfferTotals.subtotalAfterProductDiscounts -
        preOfferTotals.orderDiscountAmount,
    });
    if (offerDiscountAmount <= 0) {
      return {
        ok: false,
        message: "This offer does not apply to the current bill.",
      };
    }
  }

  const totals = computeCartTotals({
    lines: cartLines,
    taxRatePercent: params.taxRatePercent,
    orderDiscount: params.input.orderDiscount ?? null,
    offerDiscountAmount,
  });

  const isQuote = params.input.saveAsQuote === true;
  let customerName: string | null = null;
  if (params.input.customerId) {
    customerName =
      params.customers.find((c) => c.id === params.input.customerId)?.name ??
      null;
  } else if (params.input.walkInName?.trim()) {
    customerName = params.input.walkInName.trim();
  }

  const depositPercent =
    params.input.depositPercent != null &&
    Number.isFinite(params.input.depositPercent)
      ? Math.min(100, Math.max(0, params.input.depositPercent))
      : null;

  const amountPaid =
    isQuote && depositPercent != null && depositPercent > 0
      ? Math.round(((totals.grandTotal * depositPercent) / 100) * 100) / 100
      : 0;

  const serviceDate =
    params.input.serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(params.input.serviceDate)
      ? params.input.serviceDate
      : localDayKey(new Date());

  const createdAt = new Date().toISOString();
  const order: Order = {
    id: params.orderId,
    brand_id: params.brandId,
    order_number: params.orderNumber,
    status: isQuote ? "draft" : "pending",
    payment_status: "pending",
    customer_id: params.input.customerId,
    customer_name_snapshot: customerName,
    subtotal: totals.taxableSubtotal,
    discount_total: totals.discountTotal,
    tax_total: totals.taxTotal,
    fees_total: 0,
    grand_total: totals.grandTotal,
    notes: params.input.notes?.trim() || null,
    created_at: createdAt,
    table_tag: params.input.tableTag?.trim() || null,
    delivery_notes: params.input.deliveryNotes?.trim() || null,
    order_type: params.input.orderType ?? null,
    service_date: serviceDate,
    guests: params.input.guests ?? null,
    delivery_address: params.input.deliveryAddress?.trim() || null,
    payment_method: params.input.paymentMethod?.trim() || null,
    payment_reference: params.input.paymentReference?.trim().slice(0, 80) || null,
    deposit_percent: depositPercent,
    amount_paid: amountPaid,
    offer_code_snapshot: appliedOffer?.code ?? null,
    public_token: isQuote ? createPublicQuoteToken() : null,
    order_kind: "sale",
  };

  const items: OrderItem[] = priced.lines.map((line, index) => ({
    id: `${params.orderId}-line-${index + 1}`,
    order_id: params.orderId,
    product_id: line.product.id,
    product_name_snapshot: line.modifierLabels
      ? `${line.product.name} (${line.modifierLabels})`
      : line.product.name,
    quantity: line.quantity,
    unit_price: line.pricedProduct.price,
    line_discount: productLineDiscountAmount(
      line.pricedProduct,
      line.quantity,
    ),
    line_total: lineNetTotal(line.pricedProduct, line.quantity),
    product_image_url_snapshot: line.product.image_url ?? null,
    modifier_labels: line.modifierLabels,
  }));

  return { ok: true, record: { order, items, appliedOffer } };
}
