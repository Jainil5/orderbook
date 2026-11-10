"use server";

import { revalidatePath } from "next/cache";
import {
  appendDemoAudit,
  readDemoMutableBucket,
  updateDemoMutableBucket,
} from "@/lib/demo/mutable-store";
import {
  applyOrderPatches,
  mergeDemoCustomers,
  mergeDemoOffers,
  mergeDemoProducts,
} from "@/lib/demo/merge-entities";
import { getDemoBrandPack, resolveDemoBrandCode } from "@/lib/demo/brands";
import {
  patchDemoOrderInStore,
  readDemoOrderStore,
} from "@/lib/demo/order-store";
import { buildOrderRecord } from "@/lib/orders/build-order-record";
import { allowedStatusTransitions } from "@/lib/orders/order-rules";
import { matchOrCreateCustomerId } from "@/lib/demo/customer-identity";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import {
  DEMO_WORKSPACE_COOKIE,
  parseDemoBrandCodeFromCookie,
} from "@/lib/workspace/constants";
import { cookies } from "next/headers";
import type {
  CreateOrderInput,
  CreateOrderResult,
  Customer,
  CustomerUpsertInput,
  Offer,
  OfferUpsertInput,
  Order,
  OrderStatus,
  PaymentStatus,
  Product,
  ProductUpsertInput,
  RecordPaymentInput,
  RecordRefundInput,
  StockAdjustmentInput,
} from "@/types/database";
import { appendDemoOrderRecord } from "@/lib/demo/order-store";

async function activeDemoBrandCode(): Promise<DemoBrandCode> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(DEMO_WORKSPACE_COOKIE)?.value;
  return parseDemoBrandCodeFromCookie(raw) ?? resolveDemoBrandCode(null);
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

export async function demoWorkspaceMeta() {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  return {
    brand: pack.brand,
    settings: pack.settings,
    demoBrandCode: code,
  };
}

async function demoCustomers(code: DemoBrandCode): Promise<Customer[]> {
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  return mergeDemoCustomers(pack.customers, bucket);
}

async function demoOffers(code: DemoBrandCode): Promise<Offer[]> {
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  return mergeDemoOffers(pack.offers, bucket);
}

function numOrNull(v: number | null | string | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function productFromInput(
  pack: ReturnType<typeof getDemoBrandPack>,
  id: string,
  input: ProductUpsertInput,
): Product {
  return {
    id,
    brand_id: pack.brand.id,
    name: input.name.trim(),
    description: input.description ?? null,
    sku: input.sku ?? null,
    category: input.category ?? null,
    price: Number(input.price),
    cost_price: numOrNull(input.cost_price),
    unit: input.unit ?? null,
    is_active: input.is_active !== false,
    default_discount_percent: numOrNull(input.default_discount_percent),
    image_url: input.image_url ?? null,
    stock_qty: numOrNull(input.stock_qty),
    low_stock_threshold: numOrNull(input.low_stock_threshold),
    wholesale_price: numOrNull(input.wholesale_price),
    modifiers_json: input.modifiers_json ?? null,
  };
}

/** Editable fields only — id/brand_id never change, so keep them out of the cookie. */
function productOverrideFields(
  pack: ReturnType<typeof getDemoBrandPack>,
  id: string,
  input: ProductUpsertInput,
): Partial<Product> {
  const fields: Partial<Product> = { ...productFromInput(pack, id, input) };
  delete fields.id;
  delete fields.brand_id;
  return fields;
}

/**
 * Persist a demo product edit. Existing (pack) products get a partial
 * override in `productOverrides`; products created in the demo workspace are
 * stored in full in `bucket.products` so Billing/catalog pages see them too.
 */
export async function saveDemoProduct(
  productId: string | null,
  input: ProductUpsertInput,
): Promise<{ ok: true; product: Product } | { ok: false; error: string }> {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  if (!input.name.trim()) return { ok: false, error: "Name is required." };
  if (!Number.isFinite(Number(input.price)) || Number(input.price) < 0) {
    return { ok: false, error: "Price must be a valid number." };
  }
  const bucket = await readDemoMutableBucket(code);
  const base = pack.products.find((p) => p.id === productId);
  const existing =
    base ?? bucket.products.find((p) => p.id === productId) ?? null;

  if (productId && existing) {
    const id = productId;
    const product = productFromInput(pack, id, input);
    const fields = productOverrideFields(pack, id, input);
    await updateDemoMutableBucket(code, (b) => {
      if (base) {
        return {
          ...b,
          productOverrides: {
            ...b.productOverrides,
            [id]: { ...b.productOverrides[id], ...fields },
          },
        };
      }
      return {
        ...b,
        products: b.products.map((p) => (p.id === id ? product : p)),
      };
    });
    revalidateAll();
    revalidatePath("/products");
    return { ok: true, product };
  }

  const id = `demo-prod-${Date.now()}`;
  const product = productFromInput(pack, id, input);
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    products: [...b.products, product],
  }));
  revalidateAll();
  revalidatePath("/products");
  return { ok: true, product };
}

export async function setDemoProductActive(
  productId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  if (pack.products.some((p) => p.id === productId)) {
    await updateDemoMutableBucket(code, (b) => ({
      ...b,
      productOverrides: {
        ...b.productOverrides,
        [productId]: { ...b.productOverrides[productId], is_active: isActive },
      },
    }));
  } else {
    await updateDemoMutableBucket(code, (b) => ({
      ...b,
      products: b.products.map((p) =>
        p.id === productId ? { ...p, is_active: isActive } : p,
      ),
    }));
  }
  revalidateAll();
  revalidatePath("/products");
  return { ok: true };
}

export async function submitDemoOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  const products = mergeDemoProducts(pack.products, bucket);

  let customers = await demoCustomers(code);
  let customerId = input.customerId;

  if (!customerId && input.customerPhone) {
    const identity = matchOrCreateCustomerId(
      customers,
      input.customerPhone,
      input.walkInName,
      pack.brand.id,
    );
    if (identity.created) {
      const created = identity.created;
      await updateDemoMutableBucket(code, (b) => ({
        ...b,
        customers: [created, ...b.customers],
      }));
      customers = await demoCustomers(code);
    }
    customerId = identity.id;
  }

  const suffix = Math.floor(1000 + Math.random() * 9000);
  const isQuote = input.saveAsQuote === true;
  const prefix = isQuote
    ? `${pack.orderNumberPrefix}-Q`
    : pack.orderNumberPrefix;
  const orderId = `demo-order-${Date.now()}`;
  const orderNumber = `${prefix}-${suffix}`;
  const offers = await demoOffers(code);

  const built = buildOrderRecord({
    brandId: pack.brand.id,
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

  for (const line of built.record.items) {
    const productId = line.product_id;
    if (!productId) continue;
    const product = products.find((p) => p.id === productId);
    if (product?.stock_qty == null) continue;
    const nextQty = Math.max(0, (product.stock_qty ?? 0) - line.quantity);
    await updateDemoMutableBucket(code, (b) => ({
      ...b,
      productOverrides: {
        ...b.productOverrides,
        [productId]: {
          ...b.productOverrides[productId],
          stock_qty: nextQty,
        },
      },
    }));
  }

  if (built.record.appliedOffer) {
    const offerId = built.record.appliedOffer.id;
    await updateDemoMutableBucket(code, (b) => {
      const inBucket = b.offers.find((o) => o.id === offerId);
      if (inBucket) {
        return {
          ...b,
          offers: b.offers.map((o) =>
            o.id === offerId
              ? { ...o, redemption_count: o.redemption_count + 1 }
              : o,
          ),
        };
      }
      const base = pack.offers.find((o) => o.id === offerId);
      if (base) {
        return {
          ...b,
          offers: [
            { ...base, redemption_count: base.redemption_count + 1 },
            ...b.offers,
          ],
        };
      }
      return b;
    });
  }

  await appendDemoOrderRecord(
    code,
    built.record.order,
    built.record.items,
  );
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
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
  const pack = getDemoBrandPack(code);
  const name = input.name.trim();
  if (!name) return { ok: false as const, message: "Name is required." };
  const customer: Customer = {
    id: `demo-cust-${Date.now()}`,
    brand_id: pack.brand.id,
    name,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
    price_tier: input.price_tier === "wholesale" ? "wholesale" : "retail",
  };
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    customers: [customer, ...b.customers],
  }));
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
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
  const customers = await demoCustomers(code);
  const existing = customers.find((c) => c.id === customerId);
  if (!existing) return { ok: false as const, message: "Customer not found." };
  const updated: Customer = {
    ...existing,
    name: input.name.trim() || existing.name,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
  };
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    customers: [
      updated,
      ...b.customers.filter((c) => c.id !== customerId),
    ],
  }));
  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true as const, customer: updated };
}

export async function saveDemoOffer(input: OfferUpsertInput) {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const offer: Offer = {
    id: `demo-offer-${Date.now()}`,
    brand_id: pack.brand.id,
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
  };
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    offers: [offer, ...b.offers],
  }));
  revalidatePath("/offers");
  return { ok: true as const, offer };
}

export async function updateDemoOrderStatus(
  orderId: string,
  status: OrderStatus,
) {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const patched = await patchDemoOrderInStore(code, orderId, { status });
  if (!patched) {
    await updateDemoMutableBucket(code, (b) => ({
      ...b,
      orderPatches: { ...b.orderPatches, [orderId]: { status } },
    }));
  }
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
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
  const pack = getDemoBrandPack(code);
  const stored = await readDemoOrderStore(code);
  const baseOrders = [...pack.orders, ...stored.orders];
  const order = baseOrders.find((o) => o.id === input.orderId);
  if (!order) return { ok: false as const, message: "Order not found." };
  const amount = Math.max(0, input.amount);
  if (amount <= 0) return { ok: false as const, message: "Enter an amount." };

  const payment = {
    id: `demo-pay-${Date.now()}`,
    brand_id: pack.brand.id,
    order_id: order.id,
    amount,
    method: input.method,
    status: "paid" as PaymentStatus,
    created_at: new Date().toISOString(),
    split_label: input.splitLabel?.trim().slice(0, 80) || null,
    notes: input.notes?.trim().slice(0, 500) || null,
  };

  const paid = roundMoney((order.amount_paid ?? 0) + amount);
  const payment_status: PaymentStatus =
    paid >= order.grand_total ? "paid" : paid > 0 ? "partial" : "pending";

  const patch = { amount_paid: paid, payment_status };
  const patched = await patchDemoOrderInStore(code, order.id, patch);
  if (!patched) {
    await updateDemoMutableBucket(code, (b) => ({
      ...b,
      orderPatches: {
        ...b.orderPatches,
        [order.id]: { ...b.orderPatches[order.id], ...patch },
      },
    }));
  }

  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    payments: [payment, ...b.payments],
  }));
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
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

export async function completeDemoOrder(orderId: string) {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  const stored = await readDemoOrderStore(code);
  const orders = applyOrderPatches(
    [...pack.orders, ...stored.orders],
    bucket,
  );
  const order = orders.find((o) => o.id === orderId);
  if (!order) return { ok: false as const, message: "Order not found." };
  if (!allowedStatusTransitions(order.status).includes("completed")) {
    return {
      ok: false as const,
      message:
        order.status === "cancelled"
          ? "Order is already cancelled."
          : "Order is already completed.",
    };
  }

  const method = order.payment_method?.trim() || null;
  const patch: Partial<Order> = {
    status: "completed",
    ...(method
      ? { payment_status: "paid" as PaymentStatus, amount_paid: order.grand_total }
      : {}),
  };
  const patched = await patchDemoOrderInStore(code, order.id, patch);
  if (!patched) {
    await updateDemoMutableBucket(code, (b) => ({
      ...b,
      orderPatches: {
        ...b.orderPatches,
        [order.id]: { ...b.orderPatches[order.id], ...patch },
      },
    }));
  }

  if (method) {
    const payment = {
      id: `demo-pay-${Date.now()}`,
      brand_id: pack.brand.id,
      order_id: order.id,
      amount: order.grand_total,
      method,
      status: "paid" as PaymentStatus,
      created_at: new Date().toISOString(),
      split_label: null,
      notes: "Auto-recorded at completion",
    };
    await updateDemoMutableBucket(code, (b) => ({
      ...b,
      payments: [payment, ...b.payments],
    }));
    await appendDemoAudit(code, {
      brand_id: pack.brand.id,
      actor_email: null,
      action: "payment.recorded",
      entity_type: "order",
      entity_id: order.id,
      detail: `auto:${method}`,
    });
  }

  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
    action: "order.status",
    entity_type: "order",
    entity_id: order.id,
    detail: "completed",
  });
  revalidateAll();
  return { ok: true as const, orderNumber: order.order_number };
}

export async function updateDemoOrderNotes(orderId: string, notes: string) {
  const code = await activeDemoBrandCode();
  const patch = { notes: notes.trim().slice(0, 2000) || null };
  await patchDemoOrderInStore(code, orderId, patch);
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    orderPatches: { ...b.orderPatches, [orderId]: { ...b.orderPatches[orderId], ...patch } },
  }));
  revalidateAll();
  return { ok: true as const };
}

export async function createDemoCreditNote(sourceOrderId: string) {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const stored = await readDemoOrderStore(code);
  const orders = [...pack.orders, ...stored.orders];
  const source = orders.find((o) => o.id === sourceOrderId);
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
  await appendDemoOrderRecord(code, creditOrder, []);
  await patchDemoOrderInStore(code, sourceOrderId, {
    status: "refunded",
    payment_status: "refunded",
  });
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    orderPatches: {
      ...b.orderPatches,
      [sourceOrderId]: { status: "refunded", payment_status: "refunded" },
    },
  }));
  revalidateAll();
  return { ok: true as const, creditOrderId: creditId, orderNumber: creditNumber };
}

export async function recordDemoRefund(input: RecordRefundInput) {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const stored = await readDemoOrderStore(code);
  const order = [...pack.orders, ...stored.orders].find((o) => o.id === input.orderId);
  if (!order) return { ok: false as const, message: "Order not found." };
  const refund = {
    id: `demo-ref-${Date.now()}`,
    brand_id: pack.brand.id,
    order_id: input.orderId,
    payment_id: input.paymentId ?? null,
    amount: input.amount,
    reason: input.reason.trim().slice(0, 500) || null,
    created_at: new Date().toISOString(),
  };
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    refunds: [refund, ...b.refunds],
    payments: [
      {
        id: `demo-refpay-${Date.now()}`,
        brand_id: pack.brand.id,
        order_id: input.orderId,
        amount: -input.amount,
        method: "Refund",
        status: "refunded",
        created_at: new Date().toISOString(),
      },
      ...b.payments,
    ],
  }));
  await patchDemoOrderInStore(code, input.orderId, {
    status: "refunded",
    payment_status: "refunded",
  });
  revalidateAll();
  return { ok: true as const };
}

export async function recordDemoStockAdjustment(input: StockAdjustmentInput) {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const product = pack.products.find((p) => p.id === input.productId);
  if (!product) return { ok: false as const, message: "Product not found." };
  const bucket = await readDemoMutableBucket(code);
  const override = bucket.productOverrides[input.productId] ?? {};
  const current =
    override.stock_qty ?? product.stock_qty ?? 0;
  const next = current + input.deltaQty;
  const entry = {
    id: `demo-adj-${Date.now()}`,
    brand_id: pack.brand.id,
    product_id: input.productId,
    delta_qty: input.deltaQty,
    reason: input.reason.trim().slice(0, 200),
    created_at: new Date().toISOString(),
  };
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    stockAdjustments: [entry, ...b.stockAdjustments],
    productOverrides: {
      ...b.productOverrides,
      [input.productId]: { ...b.productOverrides[input.productId], stock_qty: next },
    },
  }));
  revalidatePath("/products");
  revalidatePath("/billing");
  return { ok: true as const, stockQty: next };
}

export async function acceptDemoQuote(publicToken: string) {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const stored = await readDemoOrderStore(code);
  const orders = [...pack.orders, ...stored.orders];
  const order = orders.find((o) => o.public_token === publicToken);
  if (!order) return { ok: false as const, message: "Quote not found." };
  const patch = {
    status: "confirmed" as OrderStatus,
    payment_status: "pending" as PaymentStatus,
  };
  await patchDemoOrderInStore(code, order.id, patch);
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    orderPatches: { ...b.orderPatches, [order.id]: { ...b.orderPatches[order.id], ...patch } },
  }));
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
    action: "quote.accepted",
    entity_type: "order",
    entity_id: order.id,
    detail: order.order_number,
  });
  revalidateAll();
  return { ok: true as const, orderNumber: order.order_number };
}
