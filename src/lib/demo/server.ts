"use server";

import { revalidatePath } from "next/cache";
import { getDemoBrandPack, resolveDemoBrandCode } from "@/lib/demo/brands";
import {
  appendAudit,
  findBrand,
  listBrand,
  saveBrand,
  updateBrand,
} from "@/lib/csv/records";
import { buildOrderRecord } from "@/lib/orders/build-order-record";
import {
  crmFieldsFromInput,
  mergeCustomerCrmFields,
  withConsentStamped,
} from "@/lib/crm/customer-fields";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import { readDemoSessionBrand } from "@/lib/workspace/demo-session";
import type {
  AuditLogEntry,
  CreateOrderInput,
  CreateOrderResult,
  Customer,
  CustomerUpsertInput,
  Offer,
  OfferUpsertInput,
  Order,
  OrderStatus,
  Payment,
  PaymentStatus,
  RecordPaymentInput,
  RecordRefundInput,
  StockAdjustmentInput,
} from "@/types/database";

/**
 * Every write the demo workspaces can make, against `data/*.csv`.
 *
 * These functions used to keep user edits in an httpOnly cookie (the "mutable
 * bucket") layered on top of the fixture data, which meant the demo's real
 * state lived in one browser and nowhere else: invisible to a second tab on a
 * different device, gone when the cookie was cleared, and impossible to inspect
 * or hand-edit. The CSV layer is now the single store, so a write here is the
 * same row a live workspace would eventually keep in its database, and
 * `getDemoBrandPack` reads it straight back.
 *
 * Rules this file holds to:
 * - the brand comes from the signed-in session row, never from an argument;
 * - rows are written through `src/lib/csv/records.ts`, which stamps `brand_id`
 *   and refuses another brand's id;
 * - nothing here throws at a caller — every failure is `{ ok: false, message }`.
 */

async function activeDemoBrandCode(): Promise<DemoBrandCode> {
  /* The session row decides. The fallback is for a request with no session at
     all — a public quote link — where the brand only scopes a lookup. */
  return (await readDemoSessionBrand()) ?? resolveDemoBrandCode(null);
}

function revalidateAll() {
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  revalidatePath("/customers");
  revalidatePath("/billing");
  revalidatePath("/payments");
  revalidatePath("/offers");
  revalidatePath("/settings");
  revalidatePath("/kitchen");
}

function demoAudit(
  brandId: string,
  entry: Omit<
    AuditLogEntry,
    "id" | "created_at" | "brand_id" | "actor_email"
  >,
) {
  appendAudit(brandId, { ...entry, actor_email: null });
}

async function demoCustomers(brandId: string): Promise<Customer[]> {
  return listBrand<Customer>("customers", brandId).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

async function demoOffers(brandId: string): Promise<Offer[]> {
  return listBrand<Offer>("offers", brandId).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export async function submitDemoOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const brandId = pack.brand.id;
  const products = pack.products;

  let customers = await demoCustomers(brandId);
  let customerId = input.customerId;

  if (
    !customerId &&
    input.saveNewCustomer &&
    (input.walkInName?.trim() || input.customerPhone)
  ) {
    const newCustomer = saveBrand<Customer>("customers", brandId, {
      id: `demo-cust-${Date.now()}`,
      brand_id: brandId,
      name: input.walkInName?.trim() || "Walk-in customer",
      email: null,
      phone: input.customerPhone ?? null,
      notes: null,
    });
    customers = await demoCustomers(brandId);
    customerId = newCustomer.id;
  }

  const suffix = Math.floor(1000 + Math.random() * 9000);
  const isQuote = input.paymentStatus === "pending";
  const prefix = isQuote
    ? `${pack.orderNumberPrefix}-Q`
    : pack.orderNumberPrefix;
  const orderId = `demo-order-${Date.now()}`;
  const orderNumber = `${prefix}-${suffix}`;
  const offers = await demoOffers(brandId);

  const built = buildOrderRecord({
    brandId,
    orderId,
    orderNumber,
    products,
    customers,
    taxRatePercent: pack.settings.tax_rate_percent ?? 0,
    input: { ...input, customerId },
    offers,
  });

  if (!built.ok) {
    return { ok: false, code: "VALIDATION", message: built.message };
  }

  /* Stock moves once per product, whatever the line layout: summing the
     quantities first means two lines of the same product cannot each deduct
     from the pre-order figure. */
  const soldByProduct = new Map<string, number>();
  for (const line of built.record.items) {
    if (!line.product_id) continue;
    soldByProduct.set(
      line.product_id,
      (soldByProduct.get(line.product_id) ?? 0) + line.quantity,
    );
  }
  for (const [productId, quantity] of soldByProduct) {
    const product = products.find((p) => p.id === productId);
    if (!product || product.stock_qty == null) continue;
    updateBrand("products", brandId, productId, {
      stock_qty: Math.max(0, (product.stock_qty ?? 0) - quantity),
    });
  }

  if (built.record.appliedOffer) {
    const offer = offers.find((o) => o.id === built.record.appliedOffer!.id);
    if (offer) {
      updateBrand("offers", brandId, offer.id, {
        redemption_count: offer.redemption_count + 1,
      });
    }
  }

  saveBrand<Order>("orders", brandId, built.record.order);
  for (const item of built.record.items) {
    saveBrand("order_items", brandId, item);
  }
  demoAudit(brandId, {
    action: "order.created",
    entity_type: "order",
    entity_id: built.record.order.id,
    detail: built.record.order.order_number,
  });
  revalidateAll();

  return {
    ok: true,
    orderId: built.record.order.id,
    orderNumber: built.record.order.order_number,
  };
}

export async function saveDemoCustomer(input: CustomerUpsertInput) {
  const code = await activeDemoBrandCode();
  const brandId = getDemoBrandPack(code).brand.id;
  const name = input.name.trim();
  if (!name) return { ok: false as const, message: "Name is required." };
  const now = new Date().toISOString();
  const customer = saveBrand<Customer>("customers", brandId, {
    id: `demo-cust-${Date.now()}`,
    brand_id: brandId,
    name,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
    price_tier: input.price_tier === "wholesale" ? "wholesale" : "retail",
    created_at: now,
    ...withConsentStamped(crmFieldsFromInput(input), now),
  });
  demoAudit(brandId, {
    action: "customer.created",
    entity_type: "customer",
    entity_id: customer.id,
    detail: customer.name,
  });
  revalidatePath("/customers");
  return { ok: true as const, customer };
}

export async function updateDemoCustomer(
  customerId: string,
  input: CustomerUpsertInput,
) {
  const code = await activeDemoBrandCode();
  const brandId = getDemoBrandPack(code).brand.id;
  const existing = findBrand<Customer>("customers", brandId, customerId);
  if (!existing) return { ok: false as const, message: "Customer not found." };
  const updated: Customer = mergeCustomerCrmFields(existing, {
    name: input.name.trim() || existing.name,
    // undefined = this form does not manage the field → keep the stored value.
    email: input.email === undefined ? undefined : input.email?.trim() || null,
    phone: input.phone === undefined ? undefined : input.phone?.trim() || null,
    notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
    price_tier:
      input.price_tier === undefined
        ? undefined
        : input.price_tier === "wholesale"
          ? "wholesale"
          : "retail",
    ...withConsentStamped(crmFieldsFromInput(input), new Date().toISOString()),
  });
  updateBrand("customers", brandId, customerId, updated as unknown as Record<string, unknown>);
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true as const, customer: updated };
}

export async function saveDemoOffer(input: OfferUpsertInput) {
  const code = await activeDemoBrandCode();
  const brandId = getDemoBrandPack(code).brand.id;
  const offer = saveBrand<Offer>("offers", brandId, {
    id: `demo-offer-${Date.now()}`,
    brand_id: brandId,
    name: input.name.trim(),
    code: input.code.trim().toUpperCase(),
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    scope: input.scope,
    scope_value: input.scope_value?.trim() || null,
    min_order_amount: input.min_order_amount ?? null,
    max_discount: input.max_discount ?? null,
    starts_at: input.starts_at ?? null,
    ends_at: input.ends_at ?? null,
    is_active: input.is_active !== false,
    redemption_count: 0,
    usage_limit: input.usage_limit ?? null,
  });
  revalidatePath("/offers");
  return { ok: true as const, offer };
}

export async function updateDemoOrderStatus(
  orderId: string,
  status: OrderStatus,
) {
  const code = await activeDemoBrandCode();
  const brandId = getDemoBrandPack(code).brand.id;
  if (!updateBrand("orders", brandId, orderId, { status })) {
    return { ok: false as const, message: "Order not found." };
  }
  demoAudit(brandId, {
    action: "order.status",
    entity_type: "order",
    entity_id: orderId,
    detail: status,
  });
  revalidateAll();
  return { ok: true as const };
}

export async function recordDemoPayment(input: RecordPaymentInput) {
  const code = await activeDemoBrandCode();
  const brandId = getDemoBrandPack(code).brand.id;
  const order = findBrand<Order>("orders", brandId, input.orderId);
  if (!order) return { ok: false as const, message: "Order not found." };
  const amount = Math.max(0, input.amount);
  if (amount <= 0) return { ok: false as const, message: "Enter an amount." };

  saveBrand<Payment>("payments", brandId, {
    id: `demo-pay-${Date.now()}`,
    brand_id: brandId,
    order_id: order.id,
    amount,
    method: input.method,
    status: "paid" as PaymentStatus,
    created_at: new Date().toISOString(),
    split_label: input.splitLabel?.trim().slice(0, 80) || null,
    notes: input.notes?.trim().slice(0, 500) || null,
  });

  const paid = roundMoney((order.amount_paid ?? 0) + amount);
  const payment_status: PaymentStatus =
    paid >= order.grand_total ? "paid" : paid > 0 ? "partial" : "pending";
  updateBrand("orders", brandId, order.id, {
    amount_paid: paid,
    payment_status,
  });

  demoAudit(brandId, {
    action: "payment.recorded",
    entity_type: "order",
    entity_id: order.id,
    detail: String(amount),
  });
  revalidateAll();
  return { ok: true as const };
}

function roundMoney(amount: number) {
  return Math.round(amount * 100) / 100;
}

export async function updateDemoOrderNotes(orderId: string, notes: string) {
  const code = await activeDemoBrandCode();
  const brandId = getDemoBrandPack(code).brand.id;
  const patch = { notes: notes.trim().slice(0, 2000) || null };
  if (!updateBrand("orders", brandId, orderId, patch)) {
    return { ok: false as const, message: "Order not found." };
  }
  revalidateAll();
  return { ok: true as const };
}

export async function createDemoCreditNote(sourceOrderId: string) {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const brandId = pack.brand.id;
  const source = findBrand<Order>("orders", brandId, sourceOrderId);
  if (!source) return { ok: false as const, message: "Order not found." };
  if (source.status === "draft") {
    return { ok: false as const, message: "Confirm the quote before issuing a credit note." };
  }
  const creditId = `demo-cn-${Date.now()}`;
  const creditNumber = `CN-${pack.orderNumberPrefix}-${Date.now().toString().slice(-4)}`;
  const creditOrder: Order = {
    ...source,
    id: creditId,
    order_number: creditNumber,
    status: "refunded",
    payment_status: "refunded",
    grand_total: -Math.abs(source.grand_total),
    subtotal: -Math.abs(source.subtotal),
    tax_total: -Math.abs(source.tax_total),
    discount_total: -Math.abs(source.discount_total),
    notes: `Credit note for ${source.order_number}`,
    parent_order_id: sourceOrderId,
    order_kind: "credit_note",
    created_at: new Date().toISOString(),
    amount_paid: 0,
    public_token: null,
  };
  saveBrand<Order>("orders", brandId, creditOrder);
  updateBrand("orders", brandId, sourceOrderId, {
    status: "refunded",
    payment_status: "refunded",
  });
  demoAudit(brandId, {
    action: "order.credit_note",
    entity_type: "order",
    entity_id: creditId,
    detail: creditNumber,
  });
  revalidateAll();
  return { ok: true as const, creditOrderId: creditId, orderNumber: creditNumber };
}

export async function recordDemoRefund(input: RecordRefundInput) {
  const code = await activeDemoBrandCode();
  const brandId = getDemoBrandPack(code).brand.id;
  const order = findBrand<Order>("orders", brandId, input.orderId);
  if (!order) return { ok: false as const, message: "Order not found." };
  const now = new Date().toISOString();
  saveBrand("refunds", brandId, {
    id: `demo-ref-${Date.now()}`,
    brand_id: brandId,
    order_id: input.orderId,
    payment_id: input.paymentId ?? null,
    amount: input.amount,
    reason: input.reason.trim().slice(0, 500) || null,
    created_at: now,
  });
  /* The refund shows up in the money ledger as a negative payment, which is how
     the payments screen and the analytics totals have always read it. */
  saveBrand<Payment>("payments", brandId, {
    id: `demo-refpay-${Date.now()}`,
    brand_id: brandId,
    order_id: input.orderId,
    amount: -input.amount,
    method: "Refund",
    status: "refunded",
    created_at: now,
  });
  updateBrand("orders", brandId, input.orderId, {
    status: "refunded",
    payment_status: "refunded",
  });
  demoAudit(brandId, {
    action: "order.refunded",
    entity_type: "order",
    entity_id: input.orderId,
    detail: String(input.amount),
  });
  revalidateAll();
  return { ok: true as const };
}

export async function recordDemoStockAdjustment(input: StockAdjustmentInput) {
  const code = await activeDemoBrandCode();
  const brandId = getDemoBrandPack(code).brand.id;
  const product = findBrand<{ id: string; stock_qty: number | null }>(
    "products",
    brandId,
    input.productId,
  );
  if (!product) return { ok: false as const, message: "Product not found." };
  const next = (product.stock_qty ?? 0) + input.deltaQty;
  saveBrand("stock_adjustments", brandId, {
    id: `demo-adj-${Date.now()}`,
    brand_id: brandId,
    product_id: input.productId,
    delta_qty: input.deltaQty,
    reason: input.reason.trim().slice(0, 200),
    created_at: new Date().toISOString(),
  });
  updateBrand("products", brandId, input.productId, { stock_qty: next });
  revalidatePath("/products");
  revalidatePath("/billing");
  return { ok: true as const, stockQty: next };
}

export async function acceptDemoQuote(publicToken: string) {
  const code = await activeDemoBrandCode();
  const brandId = getDemoBrandPack(code).brand.id;
  const order = listBrand<Order>("orders", brandId).find(
    (o) => o.public_token === publicToken,
  );
  if (!order) return { ok: false as const, message: "Quote not found." };
  const patch = {
    status: "confirmed" as OrderStatus,
    payment_status: "pending" as PaymentStatus,
  };
  updateBrand("orders", brandId, order.id, patch);
  demoAudit(brandId, {
    action: "quote.accepted",
    entity_type: "order",
    entity_id: order.id,
    detail: order.order_number,
  });
  revalidateAll();
  return { ok: true as const, orderNumber: order.order_number };
}
