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
  mergeDemoIngredients,
  mergeDemoInventory,
  mergeDemoOffers,
  mergeDemoProducts,
} from "@/lib/demo/merge-entities";
import {
  aggregateOrderUsage,
  consumptionMovements,
  isConsumingOrder,
} from "@/lib/inventory/stock";
import { getDemoBrandPack, resolveDemoBrandCode } from "@/lib/demo/brands";
import {
  patchDemoOrderInStore,
  readDemoOrderStore,
} from "@/lib/demo/order-store";
import { allowedStatusTransitions, canVoidOrCreditNote } from "@/lib/orders/order-rules";
import { buildOrderRecord } from "@/lib/orders/build-order-record";
import { appendDemoOrderRecord } from "@/lib/demo/order-store";
import { newOpsId } from "@/lib/manager/ops-shared";
import {
  findCustomerByPhone,
  phoneDigits,
} from "@/lib/demo/customer-identity";
import { sanitizePaymentMethod } from "@/lib/security/input";
import { roundMoney } from "@/lib/pricing/discounts";
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
  InventoryAdjustment,
  InventoryAdjustmentInput,
  InventoryAdjustmentKind,
  InventoryItem,
  InventoryItemUpsertInput,
  Offer,
  OfferUpsertInput,
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  PaymentStatus,
  Product,
  ProductIngredient,
  ProductIngredientInput,
  ProductUpsertInput,
  RecordPaymentInput,
  RecordRefundInput,
  Refund,
  StockAdjustment,
  StockAdjustmentInput,
} from "@/types/database";
import {
  DEMO_LIMITS,
  limitMessage,
} from "@/lib/demo/read-only";

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
  revalidatePath("/manager/payments");
  revalidatePath("/offers");
  revalidatePath("/settings");
  revalidatePath("/kitchen");
  revalidatePath("/catalog");
  revalidatePath("/products");
}

/** Seeded + browser-created orders with the mutable patches applied. */
async function mergedDemoOrders(code: DemoBrandCode): Promise<Order[]> {
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  const stored = await readDemoOrderStore(code);
  const byId = new Map<string, Order>();
  for (const order of pack.orders) byId.set(order.id, order);
  for (const order of stored.orders) byId.set(order.id, order);
  return applyOrderPatches(Array.from(byId.values()), bucket);
}

/**
 * Documents share one number sequence per brand (BC-1060, CF-2216…), so a
 * credit note continues the same prefix as the bills it corrects.
 */
async function nextDocumentNumber(code: DemoBrandCode): Promise<string> {
  const pack = getDemoBrandPack(code);
  const stored = await readDemoOrderStore(code);
  const all = [...pack.orders, ...stored.orders];
  const used = new Set(all.map((o) => o.order_number));
  let max = 0;
  let prefix = "DEMO";
  for (const o of all) {
    const m = /^(.*?)-(\d+)$/.exec(o.order_number);
    if (m) {
      prefix = m[1];
      max = Math.max(max, Number(m[2]));
    }
  }
  let n = max + 1;
  while (used.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
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
 * Persist a demo product edit. Only pack products are reachable: the demo ships a
 * fixed catalog, so the create branch is rejected and edits land in
 * `productOverrides` as a partial override.
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

  // Create: browser-created products live in full in the mutable bucket, so
  // billing, catalog and analytics all read them through `mergeDemoProducts`.
  const id = newOpsId("demo-product");
  const product = productFromInput(pack, id, input);
  const current = await readDemoMutableBucket(code);
  if (current.products.length >= DEMO_LIMITS.products) {
    return { ok: false, error: limitMessage("The product catalog is full") };
  }
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    products: [product, ...b.products],
  }));
  revalidateAll();
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

export async function setDemoProductUnavailable(
  productId: string,
  unavailable: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  const inPack = pack.products.some((p) => p.id === productId);
  const inBucket = bucket.products.some((p) => p.id === productId);
  if (!inPack && !inBucket) return { ok: false, error: "Product not found." };

  if (inPack) {
    await updateDemoMutableBucket(code, (b) => ({
      ...b,
      productOverrides: {
        ...b.productOverrides,
        [productId]: { ...b.productOverrides[productId], unavailable },
      },
    }));
  } else {
    await updateDemoMutableBucket(code, (b) => ({
      ...b,
      products: b.products.map((p) =>
        p.id === productId ? { ...p, unavailable } : p,
      ),
    }));
  }
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
    action: "product.updated",
    entity_type: "product",
    entity_id: productId,
    detail: `unavailable:${unavailable}`,
  });
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
  const customers = mergeDemoCustomers(pack.customers, bucket);

  // Match the mobile number against existing customers, else create one
  // (capped). The bill always saves: at the cap the order keeps its walk-in
  // name snapshot instead of a customer row.
  let customerId = input.customerId;
  let customerName = input.walkInName?.trim() || null;
  const rawPhone = input.customerPhone?.trim() ?? "";
  let createdCustomer: Customer | null = null;
  if (phoneDigits(rawPhone)) {
    const matched = findCustomerByPhone(customers, rawPhone);
    if (matched) {
      customerId = matched.id;
      customerName = customerName || matched.name;
    } else if (bucket.customers.length < DEMO_LIMITS.customers) {
      createdCustomer = {
        id: newOpsId("demo-customer"),
        brand_id: pack.brand.id,
        name: customerName || `Guest ${phoneDigits(rawPhone)!.slice(-4)}`,
        email: null,
        phone: rawPhone,
        notes: null,
        price_tier: "retail",
        created_at: new Date().toISOString(),
      };
      customerId = createdCustomer.id;
      customerName = customerName || createdCustomer.name;
    }
  }

  const record = buildOrderRecord({
    brandId: pack.brand.id,
    orderId: newOpsId("demo-order"),
    orderNumber: await nextDocumentNumber(code),
    products: mergeDemoProducts(pack.products, bucket),
    customers: createdCustomer ? [createdCustomer, ...customers] : customers,
    taxRatePercent: pack.settings.tax_rate_percent ?? 0,
    input: { ...input, customerId, walkInName: customerName ?? undefined },
    offers: mergeDemoOffers(pack.offers, bucket),
  });
  if (!record.ok) {
    return { ok: false, code: "VALIDATION", message: record.message };
  }
  const { order, items } = record.record;
  if (createdCustomer) {
    await updateDemoMutableBucket(code, (b) => ({
      ...b,
      customers: [createdCustomer, ...b.customers],
    }));
  }
  await appendDemoOrderRecord(code, order, items);
  // Sales eat stock: the same bill that adds a payment also moves the shelf,
  // so "6 packs of bread" this morning means something after lunch service.
  await recordOrderConsumption(code, pack, order, items);

  // Money taken at the counter (a bill) or a quotation deposit lands in the
  // ledger right away, so Payments and the order header agree.
  const paidAtCounter =
    !input.saveAsQuote && input.paymentMethod.trim() ? order.grand_total : 0;
  const paidNow = Math.max(paidAtCounter, order.amount_paid ?? 0);
  if (paidNow > 0) {
    const method = sanitizePaymentMethod(input.paymentMethod) ?? "Deposit";
    const payment: Payment = {
      id: newOpsId("demo-pay"),
      brand_id: pack.brand.id,
      order_id: order.id,
      amount: roundMoney(paidNow),
      method,
      status: "paid",
      created_at: order.created_at,
      split_label: null,
      notes: input.saveAsQuote ? "Quotation deposit" : null,
    };
    await updateDemoMutableBucket(code, (b) => ({
      ...b,
      payments: [payment, ...b.payments].slice(0, DEMO_LIMITS.payments),
    }));
    const patch: Partial<Order> = {
      amount_paid: roundMoney(paidNow),
      payment_status:
        paidNow >= order.grand_total - 1e-9 ? "paid" : "partial",
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
  }

  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
    action: input.saveAsQuote ? "quote.created" : "order.created",
    entity_type: "order",
    entity_id: order.id,
    detail: order.order_number,
  });
  revalidateAll();
  return { ok: true, orderId: order.id, orderNumber: order.order_number };
}

export async function saveDemoCustomer(input: CustomerUpsertInput) {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const name = input.name.trim();
  if (!name) return { ok: false as const, message: "Name is required." };
  const phone = input.phone?.trim() || null;
  if (phone && !phoneDigits(phone)) {
    return {
      ok: false as const,
      message: "Enter a valid mobile number (8–15 digits).",
    };
  }
  const bucket = await readDemoMutableBucket(code);
  if (phone && findCustomerByPhone(mergeDemoCustomers(pack.customers, bucket), phone)) {
    return {
      ok: false as const,
      message: "A customer with this mobile already exists.",
    };
  }
  if (bucket.customers.length >= DEMO_LIMITS.customers) {
    return {
      ok: false as const,
      message: limitMessage("The customer list is full"),
    };
  }
  const customer: Customer = {
    id: newOpsId("demo-customer"),
    brand_id: pack.brand.id,
    name,
    email: input.email?.trim() || null,
    phone,
    notes: input.notes?.trim() || null,
    price_tier: input.price_tier ?? null,
    created_at: new Date().toISOString(),
  };
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    customers: [customer, ...b.customers],
  }));
  revalidateAll();
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
  const name = input.name.trim();
  if (!name) return { ok: false as const, message: "Name is required." };
  const offerCode = input.code.trim();
  if (!offerCode) {
    return { ok: false as const, message: "Offer code is required." };
  }
  if (
    !Number.isFinite(input.discount_value) ||
    input.discount_value <= 0 ||
    (input.discount_type === "percent" && input.discount_value > 100)
  ) {
    return { ok: false as const, message: "Enter a valid discount value." };
  }
  const bucket = await readDemoMutableBucket(code);
  if (bucket.offers.length >= DEMO_LIMITS.offers) {
    return {
      ok: false as const,
      message: limitMessage("The offer list is full"),
    };
  }
  const offer: Offer = {
    id: newOpsId("demo-offer"),
    brand_id: pack.brand.id,
    name,
    code: offerCode,
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
  revalidateAll();
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
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false as const, message: "Enter a valid amount." };
  }
  const method = sanitizePaymentMethod(input.method);
  if (!method) {
    return { ok: false as const, message: "Invalid payment method." };
  }
  const orders = await mergedDemoOrders(code);
  const order = orders.find((o) => o.id === input.orderId);
  if (!order) return { ok: false as const, message: "Order not found." };
  const alreadyPaid = order.amount_paid ?? 0;
  const balance = roundMoney(order.grand_total - alreadyPaid);
  if (amount > balance + 1e-9) {
    return {
      ok: false as const,
      message: `Amount exceeds the outstanding balance (₹${balance}).`,
    };
  }
  const payment: Payment = {
    id: newOpsId("demo-pay"),
    brand_id: pack.brand.id,
    order_id: order.id,
    amount: roundMoney(amount),
    method,
    status: "paid",
    created_at: new Date().toISOString(),
    split_label: input.splitLabel?.trim().slice(0, 60) || null,
    notes: input.notes?.trim().slice(0, 300) || null,
  };
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    payments: [payment, ...b.payments].slice(0, DEMO_LIMITS.payments),
  }));
  const newPaid = roundMoney(alreadyPaid + amount);
  const patch: Partial<Order> = {
    amount_paid: newPaid,
    payment_status: newPaid >= order.grand_total - 1e-9 ? "paid" : "partial",
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
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
    action: "payment.recorded",
    entity_type: "order",
    entity_id: order.id,
    detail: `${order.order_number} · ${payment.amount} ${method}`,
  });
  revalidateAll();
  return { ok: true as const, paymentId: payment.id };
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

  // Demo completion is a status edit only: the ledger is read-only, so no
  // payment row is appended and no paid amount is implied.
  const patch: Partial<Order> = { status: "completed" };
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
  const orders = await mergedDemoOrders(code);
  const source = orders.find((o) => o.id === sourceOrderId);
  if (!source) return { ok: false as const, message: "Order not found." };
  if (source.parent_order_id) {
    return {
      ok: false as const,
      message: "This document is already a credit note.",
    };
  }
  if (!canVoidOrCreditNote(source)) {
    return {
      ok: false as const,
      message: "Only confirmed or completed bills can be credited.",
    };
  }
  const stored = await readDemoOrderStore(code);
  const sourceItems = [
    ...pack.orderItems,
    ...stored.orderItems,
  ].filter((item) => item.order_id === source.id);

  const credit: Order = {
    id: newOpsId("demo-order"),
    brand_id: pack.brand.id,
    order_number: await nextDocumentNumber(code),
    status: "completed",
    payment_status: "paid",
    customer_id: source.customer_id,
    customer_name_snapshot: source.customer_name_snapshot,
    subtotal: -source.subtotal,
    discount_total: -source.discount_total,
    tax_total: -source.tax_total,
    fees_total: -(source.fees_total ?? 0),
    grand_total: -source.grand_total,
    notes: `Credit note for ${source.order_number}`,
    created_at: new Date().toISOString(),
    table_tag: null,
    delivery_notes: null,
    order_type: source.order_type,
    service_date: source.service_date,
    guests: null,
    delivery_address: null,
    payment_method: null,
    payment_reference: null,
    deposit_percent: null,
    amount_paid: 0,
    offer_code_snapshot: null,
    public_token: null,
    parent_order_id: source.id,
    order_kind: "credit_note",
  };
  const items: OrderItem[] = sourceItems.map((item, index) => ({
    id: `${credit.id}-line-${index + 1}`,
    order_id: credit.id,
    product_id: item.product_id,
    product_name_snapshot: item.product_name_snapshot,
    quantity: item.quantity,
    unit_price: -item.unit_price,
    line_discount: -(item.line_discount ?? 0),
    line_total: -item.line_total,
    product_image_url_snapshot: item.product_image_url_snapshot,
    modifier_labels: item.modifier_labels,
  }));
  await appendDemoOrderRecord(code, credit, items);
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
    action: "credit_note.created",
    entity_type: "order",
    entity_id: credit.id,
    detail: `${credit.order_number} → ${source.order_number}`,
  });
  revalidateAll();
  return { ok: true as const, orderNumber: credit.order_number };
}

export async function recordDemoRefund(input: RecordRefundInput) {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false as const, message: "Enter a valid amount." };
  }
  const orders = await mergedDemoOrders(code);
  const order = orders.find((o) => o.id === input.orderId);
  if (!order) return { ok: false as const, message: "Order not found." };
  const paid = order.amount_paid ?? 0;
  if (paid <= 0) {
    return {
      ok: false as const,
      message: "Nothing has been paid on this order yet.",
    };
  }
  if (amount > paid + 1e-9) {
    return {
      ok: false as const,
      message: `Refund exceeds the paid amount (₹${roundMoney(paid)}).`,
    };
  }
  const refund: Refund = {
    id: newOpsId("demo-refund"),
    brand_id: pack.brand.id,
    order_id: order.id,
    payment_id: input.paymentId ?? null,
    amount: roundMoney(amount),
    reason: input.reason.trim().slice(0, 300) || null,
    created_at: new Date().toISOString(),
  };
  const bucket = await readDemoMutableBucket(code);
  const refunds = [refund, ...bucket.refunds].slice(0, DEMO_LIMITS.refunds);
  await updateDemoMutableBucket(code, (b) => ({ ...b, refunds }));
  const refundedTotal = roundMoney(
    refunds
      .filter((r) => r.order_id === order.id)
      .reduce((sum, r) => sum + r.amount, 0),
  );
  const patch: Partial<Order> = {
    amount_paid: roundMoney(Math.max(0, paid - amount)),
    payment_status:
      refundedTotal >= paid - 1e-9 ? "refunded" : order.payment_status,
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
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
    action: "refund.recorded",
    entity_type: "order",
    entity_id: order.id,
    detail: `${order.order_number} · ${refund.amount}`,
  });
  revalidateAll();
  return { ok: true as const };
}

export async function recordDemoStockAdjustment(
  input: StockAdjustmentInput,
) {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const delta = Number(input.deltaQty);
  if (!Number.isInteger(delta) || delta === 0) {
    return { ok: false as const, message: "Enter a non-zero quantity change." };
  }
  const reason = input.reason.trim().slice(0, 200);
  if (!reason) return { ok: false as const, message: "A reason is required." };
  const bucket = await readDemoMutableBucket(code);
  const product = mergeDemoProducts(pack.products, bucket).find(
    (p) => p.id === input.productId,
  );
  if (!product) return { ok: false as const, message: "Product not found." };
  const newQty =
    product.stock_qty == null ? null : Math.max(0, product.stock_qty + delta);
  const adjustment: StockAdjustment = {
    id: newOpsId("demo-adj"),
    brand_id: pack.brand.id,
    product_id: product.id,
    delta_qty: delta,
    reason,
    created_at: new Date().toISOString(),
  };
  const inPack = pack.products.some((p) => p.id === product.id);
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    ...(inPack
      ? {
          productOverrides: {
            ...b.productOverrides,
            [product.id]: {
              ...b.productOverrides[product.id],
              stock_qty: newQty,
            },
          },
        }
      : {
          products: b.products.map((p) =>
            p.id === product.id ? { ...p, stock_qty: newQty } : p,
          ),
        }),
    stockAdjustments: [adjustment, ...b.stockAdjustments].slice(
      0,
      DEMO_LIMITS.stockAdjustments,
    ),
  }));
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
    action: "product.stock_adjusted",
    entity_type: "product",
    entity_id: product.id,
    detail: `${delta > 0 ? "+" : ""}${delta} · ${reason}`,
  });
  revalidateAll();
  return { ok: true as const };
}

export async function acceptDemoQuote(publicToken: string) {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const stored = await readDemoOrderStore(code);
  const orders = [...pack.orders, ...stored.orders];
  const order = orders.find((o) => o.public_token === publicToken);
  if (!order) return { ok: false as const, message: "Quote not found." };
  // A seeded pack order never changes, so its real status is the patch on top
  // of it — that is also what stops a second "Accept" draining the shelf again.
  const bucket = await readDemoMutableBucket(code);
  const statusBefore = bucket.orderPatches[order.id]?.status ?? order.status;
  const patch = {
    status: "confirmed" as OrderStatus,
    payment_status: "pending" as PaymentStatus,
  };
  await patchDemoOrderInStore(code, order.id, patch);
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    orderPatches: { ...b.orderPatches, [order.id]: { ...b.orderPatches[order.id], ...patch } },
  }));
  // Acceptance is the moment the order becomes a commitment, so it is the
  // moment its ingredients leave the shelf — nothing was written at quote time.
  if (statusBefore === "draft") {
    await recordOrderConsumption(
      code,
      pack,
      { ...order, ...patch },
      [...pack.orderItems, ...stored.orderItems].filter(
        (line) => line.order_id === order.id,
      ),
    );
  }
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

const INVENTORY_KINDS: InventoryAdjustmentKind[] = [
  "purchase",
  "waste",
  "stock_count",
  "issue",
];

/** Rows one product's ingredient list may hold — generous, but bounded. */
const MAX_RECIPE_ROWS = 20;

function inventoryFromInput(
  pack: ReturnType<typeof getDemoBrandPack>,
  id: string,
  input: InventoryItemUpsertInput,
): InventoryItem {
  return {
    id,
    brand_id: pack.brand.id,
    name: input.name.trim(),
    category: input.category?.trim() || null,
    unit: input.unit.trim(),
    units_per_pack: Number(input.units_per_pack),
    cost_per_pack: Number(input.cost_per_pack),
    stock_packs: Number(input.stock_packs),
    low_stock_packs: numOrNull(input.low_stock_packs) ?? 0,
    storage: input.storage ?? null,
    note: input.note?.trim() || null,
  };
}

function validateInventoryInput(input: InventoryItemUpsertInput): string | null {
  if (!input.name.trim()) return "Name is required.";
  if (!input.unit.trim()) return "Name the unit you count in — slice, ml, sq ft.";
  const perPack = Number(input.units_per_pack);
  if (!Number.isFinite(perPack) || perPack <= 0) {
    return "A pack must contain more than 0 units.";
  }
  const cost = Number(input.cost_per_pack);
  if (!Number.isFinite(cost) || cost < 0) return "Cost per pack must be 0 or more.";
  const packs = Number(input.stock_packs);
  if (!Number.isFinite(packs) || packs < 0) return "Packs on hand must be 0 or more.";
  const low = numOrNull(input.low_stock_packs);
  if (low !== null && low < 0) return "The reorder level cannot be negative.";
  return null;
}

/**
 * Create or edit a stock item. Pack items keep their identity and land in
 * `inventoryOverrides`; anything the merchant adds lives in full in the bucket,
 * mirroring how products are handled.
 */
export async function saveDemoInventoryItem(
  itemId: string | null,
  input: InventoryItemUpsertInput,
): Promise<{ ok: true; item: InventoryItem } | { ok: false; error: string }> {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const invalid = validateInventoryInput(input);
  if (invalid) return { ok: false, error: invalid };

  const bucket = await readDemoMutableBucket(code);
  const base = pack.inventory.find((item) => item.id === itemId);
  const existing = base ?? bucket.inventory.find((item) => item.id === itemId);

  if (itemId && existing) {
    const item = inventoryFromInput(pack, itemId, input);
    if (base) {
      const fields: Partial<InventoryItem> = { ...item };
      delete fields.id;
      delete fields.brand_id;
      await updateDemoMutableBucket(code, (b) => ({
        ...b,
        inventoryOverrides: {
          ...b.inventoryOverrides,
          [itemId]: { ...b.inventoryOverrides[itemId], ...fields },
        },
      }));
    } else {
      await updateDemoMutableBucket(code, (b) => ({
        ...b,
        inventory: b.inventory.map((row) => (row.id === itemId ? item : row)),
      }));
    }
    await appendDemoAudit(code, {
      brand_id: pack.brand.id,
      actor_email: null,
      action: "inventory.updated",
      entity_type: "inventory",
      entity_id: itemId,
      detail: item.name,
    });
    revalidateAll();
    revalidatePath("/products");
    return { ok: true, item };
  }

  if (bucket.inventory.length >= DEMO_LIMITS.inventory) {
    return { ok: false, error: limitMessage("The inventory list is full") };
  }
  const id = newOpsId("demo-inv-item");
  const item = inventoryFromInput(pack, id, input);
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    inventory: [item, ...b.inventory],
  }));
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
    action: "inventory.created",
    entity_type: "inventory",
    entity_id: id,
    detail: item.name,
  });
  revalidateAll();
  revalidatePath("/products");
  return { ok: true, item };
}

const KIND_SIGN_ERROR: Record<InventoryAdjustmentKind, string> = {
  purchase: "A purchase adds packs, so enter a number above 0.",
  waste: "Wastage removes packs, so enter a number below 0.",
  issue: "Issuing material removes packs, so enter a number below 0.",
  stock_count: "Enter the difference against your count, above or below 0.",
};

/**
 * Goods in, goods out. This is the only way the shelf number moves by hand —
 * order consumption writes the same kind of row automatically.
 */
export async function recordDemoInventoryMovement(
  input: InventoryAdjustmentInput,
): Promise<{ ok: true; movement: InventoryAdjustment } | { ok: false; error: string }> {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const delta = Number(input.deltaPacks);
  if (!INVENTORY_KINDS.includes(input.kind)) {
    return { ok: false, error: "Choose what this movement is." };
  }
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: "Enter how many packs moved, other than 0." };
  }
  if (input.kind === "purchase" && delta <= 0) {
    return { ok: false, error: KIND_SIGN_ERROR.purchase };
  }
  if ((input.kind === "waste" || input.kind === "issue") && delta >= 0) {
    return { ok: false, error: KIND_SIGN_ERROR[input.kind] };
  }
  const bucket = await readDemoMutableBucket(code);
  const item = mergeDemoInventory(pack.inventory, bucket).find(
    (row) => row.id === input.itemId,
  );
  if (!item) return { ok: false, error: "Stock item not found." };
  const cost = numOrNull(input.cost);
  if (cost !== null && cost < 0) {
    return { ok: false, error: "The amount paid cannot be negative." };
  }
  const movement: InventoryAdjustment = {
    id: newOpsId("demo-inv-move"),
    brand_id: pack.brand.id,
    item_id: item.id,
    delta_packs: Math.round(delta * 1000) / 1000,
    kind: input.kind,
    cost: input.kind === "purchase" ? cost : null,
    note: input.note?.trim().slice(0, 200) || null,
    created_at: new Date().toISOString(),
  };
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    inventoryLedger: [movement, ...b.inventoryLedger].slice(
      0,
      DEMO_LIMITS.inventoryLedger,
    ),
  }));
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
    action: `inventory.${movement.kind}`,
    entity_type: "inventory",
    entity_id: item.id,
    detail: `${movement.delta_packs > 0 ? "+" : ""}${movement.delta_packs} packs · ${item.name}`,
  });
  revalidateAll();
  revalidatePath("/products");
  return { ok: true, movement };
}

/**
 * Replace one product's ingredient list. Rows are keyed by stock item — a
 * repeated item keeps the last line — and every item must exist, so a typo
 * cannot create usage that never deducts.
 */
export async function saveDemoProductIngredients(
  productId: string,
  rows: ProductIngredientInput[],
): Promise<{ ok: true; ingredients: ProductIngredient[] } | { ok: false; error: string }> {
  const code = await activeDemoBrandCode();
  const pack = getDemoBrandPack(code);
  const bucket = await readDemoMutableBucket(code);
  const product = mergeDemoProducts(pack.products, bucket).find(
    (p) => p.id === productId,
  );
  if (!product) return { ok: false, error: "Product not found." };
  const items = new Map(
    mergeDemoInventory(pack.inventory, bucket).map((item) => [item.id, item]),
  );
  if (!items.size) {
    return { ok: false, error: "Add stock items first, then list ingredients." };
  }
  const byItem = new Map<string, ProductIngredient>();
  for (const row of rows) {
    const item = items.get(row.itemId);
    if (!item) return { ok: false, error: "Every ingredient must be a stock item." };
    const qty = Number(row.qtyPerSale);
    if (!Number.isFinite(qty) || qty <= 0) {
      return {
        ok: false,
        error: `Enter how much of ${item.name} one sale uses, above 0.`,
      };
    }
    byItem.set(item.id, {
      id: newOpsId("demo-recipe"),
      brand_id: pack.brand.id,
      product_id: productId,
      item_id: item.id,
      qty_per_sale: Math.round(qty * 1000) / 1000,
      note: row.note?.trim().slice(0, 160) || null,
    });
  }
  if (byItem.size > MAX_RECIPE_ROWS) {
    return { ok: false, error: `Keep an ingredient list under ${MAX_RECIPE_ROWS} lines.` };
  }
  const ingredients = Array.from(byItem.values());
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    recipeOverrides: { ...b.recipeOverrides, [productId]: ingredients },
  }));
  await appendDemoAudit(code, {
    brand_id: pack.brand.id,
    actor_email: null,
    action: ingredients.length ? "product.recipe_updated" : "product.recipe_cleared",
    entity_type: "product",
    entity_id: productId,
    detail: `${ingredients.length} ingredient${ingredients.length === 1 ? "" : "s"} · ${product.name}`,
  });
  revalidateAll();
  revalidatePath("/products");
  return { ok: true, ingredients };
}

/**
 * Sales eat stock. Called right after an order lands, so the shelf number and
 * the bill agree without anyone counting. A brand whose pack has no recipes
 * (the furniture one) writes nothing at all.
 *
 * Only commitments count: a quotation sits on the shelf until the customer
 * accepts it, at which point `acceptDemoQuote` calls this with the same lines.
 * Cancelling a bill does *not* put the bread back — the plates were made — so a
 * merchant who physically got material back records a stock count.
 */
async function recordOrderConsumption(
  code: DemoBrandCode,
  pack: ReturnType<typeof getDemoBrandPack>,
  order: Order,
  items: OrderItem[],
): Promise<void> {
  if (!isConsumingOrder(order)) return;
  const bucket = await readDemoMutableBucket(code);
  const inventory = mergeDemoInventory(pack.inventory, bucket);
  const ingredients = mergeDemoIngredients(pack.ingredients, bucket);
  if (!inventory.length || !ingredients.length) return;
  const movements = consumptionMovements(
    aggregateOrderUsage(items, ingredients, inventory),
    {
      brandId: pack.brand.id,
      orderNumber: order.order_number,
      createdAt: order.created_at,
      newId: () => newOpsId("demo-inv-move"),
    },
  );
  if (!movements.length) return;
  await updateDemoMutableBucket(code, (b) => ({
    ...b,
    inventoryLedger: [...movements, ...b.inventoryLedger].slice(
      0,
      DEMO_LIMITS.inventoryLedger,
    ),
  }));
}
