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
} from "@/lib/demo/merge-entities";
import { getDemoBrandPack, resolveDemoBrandCode } from "@/lib/demo/brands";
import {
  patchDemoOrderInStore,
  readDemoOrderStore,
} from "@/lib/demo/order-store";
import { allowedStatusTransitions } from "@/lib/orders/order-rules";
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
import {
  DEMO_READ_ONLY_MESSAGE,
  readOnlyError,
  readOnlyMessage,
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

  return readOnlyError();
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
  void input;
  return { ok: false, code: "VALIDATION", message: DEMO_READ_ONLY_MESSAGE };
}

export async function saveDemoCustomer(input: CustomerUpsertInput) {
  void input;
  return readOnlyMessage();
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
  void input;
  return readOnlyMessage();
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
  void input;
  return readOnlyMessage();
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
  void sourceOrderId;
  return readOnlyMessage();
}

export async function recordDemoRefund(input: RecordRefundInput) {
  void input;
  return readOnlyMessage();
}

export async function recordDemoStockAdjustment(input: StockAdjustmentInput) {
  void input;
  return readOnlyMessage();
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
