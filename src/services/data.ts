/**
 * The transactional data service — storage resolution lives here.
 *
 * Resolution rule (the platform's storage policy, stated once):
 * - **products / orders / order_items** — Supabase when it is configured and
 *   the workspace is live; otherwise the same pages read `data/*.csv`, so a
 *   Railway deployment without Supabase keys still shows products and orders.
 * - **every other table** — `data/*.csv` only. The Supabase queries that
 *   used to own customers, payments, offers and stock adjustments are
 *   disabled at this layer (see git history before 2026-xx for the code);
 *   the CSV is the source of truth for them in both modes.
 *
 * CSV rows key on `brand_id`: the demo workspace brand ids resolved from the
 * session (`csvBrandContext`) — for a live brand that is its uuid, so a CSV
 * table can also serve live brands the moment rows carry that id.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseEnabled } from "@/lib/env";
import { normalizePublicQuoteToken } from "@/lib/security/public-token";
import type {
  CreateOrderInput,
  CreateOrderResult,
  Customer,
  CustomerUpsertInput,
  Offer,
  OfferUpsertInput,
  Order,
  OrderStatus,
  Product,
  ProductUpsertInput,
  Payment,
  OrderItem,
  RecordPaymentInput,
  StockAdjustment,
} from "@/types/database";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { toDemoBrandCode } from "@/lib/demo/data";
import { csvBrandId } from "@/lib/csv/source";
import {
  findRow,
  patchRow,
  readAllRows,
  readBrandRows,
  upsertRow,
} from "@/lib/csv/store";
import { getRawDemoBrandPack } from "@/lib/demo/brands/packs";
import { validateProductInput, canManageProducts } from "@/lib/security/validate-product";
import { PRODUCT_COLUMNS } from "@/lib/products/columns";
import { validateManualOrderDiscountForRole } from "@/lib/security/discount-policy";
import { canRecordPayments, canManageOrderOperations } from "@/lib/security/authorization";
import { allowedStatusTransitions } from "@/lib/orders/order-rules";
import {
  clampPage,
  clampPageSize,
  escapeIlikePattern,
  normalizeCustomerPhone,
  sanitizeOrderStatus,
  sanitizePaymentStatus,
  sanitizePaymentMethod,
} from "@/lib/security/input";
import { validateCreateOrderInput } from "@/lib/security/validate-order";
import { buildOrderRecord } from "@/lib/orders/build-order-record";
import {
  crmFieldsFromInput,
  mergeCustomerCrmFields,
  withConsentStamped,
} from "@/lib/crm/customer-fields";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase is currently switched OFF deployment-wide (CSV-only era): the
 * branches below stay in the codebase but dormant until someone sets
 * OB_USE_SUPABASE="true" with valid keys. See supabaseEnabled() in lib/env.
 */
export function supabaseAvailable(): boolean {
  return supabaseEnabled();
}

async function requireBrandId() {
  const ws = await loadLiveWorkspace();
  if (!ws) throw new Error("Unauthorized");
  return ws.brand.id;
}

async function requireProductManagerBrandId() {
  const ws = await loadLiveWorkspace();
  if (!ws) throw new Error("Unauthorized");
  if (!canManageProducts(ws.member.role)) throw new Error("Forbidden");
  return ws.brand.id;
}

/**
 * Brand context for CSV reads/writes: works in demo mode (no Supabase at
 * all) and in live mode (rows keyed by the live brand's uuid).
 * Exported for the CRM repository, which stores its tables the same way.
 */
export async function csvBrandContext(): Promise<{
  brandId: string;
  brandCode: string;
  taxRatePercent: number;
} | null> {
  const ws = await loadWorkspaceSession();
  if (!ws) return null;
  if (ws.mode === "demo") {
    const code = toDemoBrandCode(ws.brand.code);
    return {
      brandId: csvBrandId(code),
      brandCode: code,
      taxRatePercent: Number(ws.settings.tax_rate_percent ?? 0),
    };
  }
  return {
    brandId: ws.brand.id,
    brandCode: ws.brand.code,
    taxRatePercent: Number(ws.settings.tax_rate_percent ?? 0),
  };
}

function mutationError(detail?: string): string {
  if (process.env.NODE_ENV === "development" && detail) return detail;
  return "Could not save product.";
}

function publicDataError(detail?: string): string {
  if (process.env.NODE_ENV === "development" && detail) return detail;
  return "Unable to load data.";
}

function contains(haystack: string | null | undefined, needle: string): boolean {
  return (haystack ?? "").toLowerCase().includes(needle);
}

/* ------------------------------------------------------------------ */
/* products — Supabase when configured, CSV otherwise                  */
/* ------------------------------------------------------------------ */

function csvListProducts(
  brandId: string,
  filters?: { search?: string; category?: string; activeOnly?: boolean },
): Product[] {
  let rows = readBrandRows("products", brandId) as unknown as Product[];
  if (filters?.activeOnly !== false) rows = rows.filter((p) => p.is_active);
  if (filters?.category && filters.category !== "all") {
    const category = filters.category.trim();
    rows = rows.filter((p) => (p.category ?? "Uncategorized") === category);
  }
  if (filters?.search) {
    const term = filters.search.toLowerCase();
    rows = rows.filter(
      (p) => contains(p.name, term) || contains(p.sku, term),
    );
  }
  return [...rows].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listProducts(filters?: {
  search?: string;
  category?: string;
  activeOnly?: boolean;
}): Promise<{ data: Product[]; error?: string }> {
  if (!supabaseAvailable()) {
    const ctx = await csvBrandContext();
    if (!ctx) return { data: [], error: publicDataError("Not signed in.") };
    return { data: csvListProducts(ctx.brandId, filters) };
  }

  try {
    const brandId = await requireBrandId();
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("brand_id", brandId)
      .order("name");

    if (filters?.activeOnly !== false) query = query.eq("is_active", true);
    if (filters?.category && filters.category !== "all") {
      const category = filters.category.trim().slice(0, 80);
      query = query.eq("category", category);
    }
    if (filters?.search) {
      const term = escapeIlikePattern(filters.search);
      if (term) {
        query = query.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      }
    }

    const { data, error } = await query;
    if (error) return { data: [], error: publicDataError(error.message) };
    return { data: (data ?? []) as Product[] };
  } catch (e) {
    return {
      data: [],
      error: publicDataError(e instanceof Error ? e.message : undefined),
    };
  }
}

export async function createProduct(
  input: ProductUpsertInput,
): Promise<{ ok: true; product: Product } | { ok: false; error: string }> {
  const validation = validateProductInput(input);
  if (!validation.ok) return { ok: false, error: validation.message };

  if (!supabaseAvailable()) {
    const ctx = await csvBrandContext();
    if (!ctx) return { ok: false, error: publicDataError("Not signed in.") };
    const product = {
      id: crypto.randomUUID(),
      brand_id: ctx.brandId,
      ...validation.data,
      is_active: validation.data.is_active !== false,
    } as Product;
    upsertRow("products", product as unknown as Record<string, unknown>);
    return { ok: true, product };
  }

  try {
    const brandId = await requireProductManagerBrandId();
    const supabase = await createSupabaseServerClient();
    const row = validation.data;
    const { data, error } = await supabase
      .from("products")
      .insert({
        brand_id: brandId,
        name: row.name,
        description: row.description,
        sku: row.sku,
        category: row.category,
        price: row.price,
        cost_price: row.cost_price,
        unit: row.unit,
        is_active: row.is_active !== false,
        default_discount_percent: row.default_discount_percent,
        image_url: row.image_url,
        stock_qty: row.stock_qty ?? null,
        low_stock_threshold: row.low_stock_threshold ?? null,
        wholesale_price: row.wholesale_price ?? null,
        modifiers_json: row.modifiers_json ?? null,
      })
      .select(PRODUCT_COLUMNS)
      .single();

    if (error) return { ok: false, error: mutationError(error.message) };
    return { ok: true, product: data as Product };
  } catch (e) {
    return {
      ok: false,
      error: mutationError(e instanceof Error ? e.message : undefined),
    };
  }
}

export async function updateProduct(
  productId: string,
  input: ProductUpsertInput,
): Promise<{ ok: true; product: Product } | { ok: false; error: string }> {
  const validation = validateProductInput(input);
  if (!validation.ok) return { ok: false, error: validation.message };

  if (!supabaseAvailable()) {
    const ctx = await csvBrandContext();
    if (!ctx) return { ok: false, error: publicDataError("Not signed in.") };
    const existing = findRow("products", productId);
    if (!existing || existing.brand_id !== ctx.brandId) {
      return { ok: false, error: mutationError("Product not found.") };
    }
    const product = {
      ...existing,
      ...validation.data,
      id: productId,
      brand_id: ctx.brandId,
      is_active: validation.data.is_active !== false,
    } as unknown as Product;
    patchRow("products", productId, product as unknown as Record<string, unknown>);
    return { ok: true, product };
  }

  try {
    const brandId = await requireProductManagerBrandId();
    const supabase = await createSupabaseServerClient();
    const row = validation.data;
    const { data, error } = await supabase
      .from("products")
      .update({
        name: row.name,
        description: row.description,
        sku: row.sku,
        category: row.category,
        price: row.price,
        cost_price: row.cost_price,
        unit: row.unit,
        is_active: row.is_active !== false,
        default_discount_percent: row.default_discount_percent,
        image_url: row.image_url,
        stock_qty: row.stock_qty ?? null,
        low_stock_threshold: row.low_stock_threshold ?? null,
        wholesale_price: row.wholesale_price ?? null,
        modifiers_json: row.modifiers_json ?? null,
      })
      .eq("id", productId)
      .eq("brand_id", brandId)
      .select(PRODUCT_COLUMNS)
      .single();

    if (error) return { ok: false, error: mutationError(error.message) };
    return { ok: true, product: data as Product };
  } catch (e) {
    return {
      ok: false,
      error: mutationError(e instanceof Error ? e.message : undefined),
    };
  }
}

export async function setProductActive(
  productId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabaseAvailable()) {
    const ctx = await csvBrandContext();
    if (!ctx) return { ok: false, error: publicDataError("Not signed in.") };
    const existing = findRow("products", productId);
    if (!existing || existing.brand_id !== ctx.brandId) {
      return { ok: false, error: mutationError("Product not found.") };
    }
    patchRow("products", productId, { is_active: isActive });
    return { ok: true };
  }

  try {
    const brandId = await requireProductManagerBrandId();
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("products")
      .update({ is_active: isActive })
      .eq("id", productId)
      .eq("brand_id", brandId);

    if (error) return { ok: false, error: mutationError(error.message) };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: mutationError(e instanceof Error ? e.message : undefined),
    };
  }
}

/* ------------------------------------------------------------------ */
/* orders — Supabase when configured, CSV otherwise                    */
/* ------------------------------------------------------------------ */

function csvOrdersFor(brandId: string): Order[] {
  return (readBrandRows("orders", brandId) as unknown as Order[]).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export async function listOrders(params: {
  search?: string;
  status?: string;
  paymentStatus?: string;
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ data: Order[]; count: number; error?: string }> {
  if (!supabaseAvailable()) {
    const ctx = await csvBrandContext();
    if (!ctx) return { data: [], count: 0, error: publicDataError("Not signed in.") };
    let rows = csvOrdersFor(ctx.brandId);
    const status = sanitizeOrderStatus(params.status);
    if (status && status !== "all") rows = rows.filter((o) => o.status === status);
    const paymentStatus = sanitizePaymentStatus(params.paymentStatus);
    if (paymentStatus && paymentStatus !== "all") {
      rows = rows.filter((o) => o.payment_status === paymentStatus);
    }
    if (params.search) {
      const term = params.search.toLowerCase();
      rows = rows.filter(
        (o) =>
          contains(o.order_number, term) ||
          contains(o.customer_name_snapshot, term),
      );
    }
    if (params.dateFrom) rows = rows.filter((o) => o.created_at >= params.dateFrom!);
    if (params.dateTo) rows = rows.filter((o) => o.created_at < params.dateTo!);
    const count = rows.length;
    const page = clampPage(params.page);
    const pageSize = clampPageSize(params.pageSize);
    return { data: rows.slice((page - 1) * pageSize, page * pageSize), count };
  }

  try {
    const brandId = await requireBrandId();
    const supabase = await createSupabaseServerClient();
    const page = clampPage(params.page);
    const pageSize = clampPageSize(params.pageSize);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("orders")
      .select(
        "id, brand_id, order_number, status, payment_status, customer_id, customer_name_snapshot, subtotal, discount_total, tax_total, fees_total, grand_total, notes, created_at, amount_paid, public_token, parent_order_id, order_kind",
        { count: "exact" },
      )
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .range(from, to);

    const status = sanitizeOrderStatus(params.status);
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    const paymentStatus = sanitizePaymentStatus(params.paymentStatus);
    if (paymentStatus && paymentStatus !== "all") {
      query = query.eq("payment_status", paymentStatus);
    }
    if (params.search) {
      const term = escapeIlikePattern(params.search);
      if (term) {
        query = query.or(
          `order_number.ilike.%${term}%,customer_name_snapshot.ilike.%${term}%`,
        );
      }
    }
    if (params.dateFrom) {
      query = query.gte("created_at", params.dateFrom);
    }
    if (params.dateTo) {
      query = query.lt("created_at", params.dateTo);
    }

    const { data, error, count } = await query;
    if (error) return { data: [], count: 0, error: publicDataError(error.message) };
    return { data: (data ?? []) as Order[], count: count ?? 0 };
  } catch (e) {
    return {
      data: [],
      count: 0,
      error: publicDataError(e instanceof Error ? e.message : undefined),
    };
  }
}

export async function listOrderItemsForOrders(
  orderIds: string[],
): Promise<{ data: OrderItem[]; error?: string }> {
  if (!orderIds.length) {
    return { data: [] };
  }
  if (!supabaseAvailable()) {
    const ctx = await csvBrandContext();
    if (!ctx) return { data: [], error: publicDataError("Not signed in.") };
    const wanted = new Set(orderIds);
    const rows = (readAllRows("order_items") as unknown as OrderItem[]).filter(
      (item) => wanted.has(item.order_id),
    );
    return { data: rows };
  }
  try {
    await requireBrandId();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("order_items")
      .select(
        "id, order_id, product_id, product_name_snapshot, quantity, unit_price, line_discount, line_total",
      )
      .in("order_id", orderIds);

    if (error) return { data: [], error: publicDataError(error.message) };
    return { data: (data ?? []) as OrderItem[] };
  } catch (e) {
    return {
      data: [],
      error: publicDataError(e instanceof Error ? e.message : undefined),
    };
  }
}

async function submitOrderViaCsv(
  ctx: { brandId: string; brandCode: string; taxRatePercent: number },
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const products = readBrandRows("products", ctx.brandId) as unknown as Product[];
  const customers = readBrandRows("customers", ctx.brandId) as unknown as Customer[];
  const offers = readBrandRows("offers", ctx.brandId) as unknown as Offer[];
  const customer = input.customerId
    ? customers.filter((c) => c.id === input.customerId)
    : [];

  const orderId = crypto.randomUUID();
  const orderNumber = `${ctx.brandCode.toUpperCase()}-${Date.now().toString().slice(-8)}`;
  const built = buildOrderRecord({
    brandId: ctx.brandId,
    orderId,
    orderNumber,
    products,
    customers: customer,
    taxRatePercent: ctx.taxRatePercent,
    input,
    offers,
  });
  if (!built.ok) {
    return { ok: false, code: "VALIDATION", message: "Order could not be built." };
  }

  upsertRow("orders", built.record.order as unknown as Record<string, unknown>);
  // buildOrderRecord's item rows don't carry the order link — the items CSV is
  // keyed by order_id, so stamp it here before writing.
  for (const item of built.record.items) {
    upsertRow("order_items", {
      ...item,
      order_id: orderId,
    } as unknown as Record<string, unknown>);
  }
  return { ok: true, orderId, orderNumber };
}

export async function submitOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const validation = validateCreateOrderInput(input);
  if (!validation.ok) {
    return { ok: false, code: "VALIDATION", message: validation.message };
  }

  if (!supabaseAvailable()) {
    const ctx = await csvBrandContext();
    if (!ctx) return { ok: false, code: "UNKNOWN", message: "Not signed in." };
    return submitOrderViaCsv(ctx, input);
  }

  try {
    const live = await loadLiveWorkspace();
    if (!live) {
      return { ok: false, code: "UNKNOWN", message: "Not signed in." };
    }
    const roleCheck = validateManualOrderDiscountForRole(
      live.member.role,
      input.orderDiscount ?? null,
    );
    if (!roleCheck.ok) {
      return { ok: false, code: "VALIDATION", message: roleCheck.message };
    }
    const brandId = live.brand.id;
    const supabase = await createSupabaseServerClient();
    const customerPhone = input.customerPhone
      ? normalizeCustomerPhone(input.customerPhone)
      : null;
    const { data, error } = await supabase.rpc("create_order", {
      p_customer_id: input.customerId,
      p_customer_phone: customerPhone,
      p_walk_in_name: input.walkInName ?? null,
      p_notes: input.notes ?? null,
      p_lines: input.lines,
      p_offer_code: input.offerCode ?? null,
      p_payment_method: input.paymentMethod,
      p_payment_status: input.paymentStatus,
      p_order_discount: input.orderDiscount ?? null,
    });

    if (error) {
      const rpcMissing =
        error.code === "PGRST202" || error.message.includes("create_order");
        if (rpcMissing) {
          const fallback = await submitOrderViaTables(
            supabase,
            brandId,
            live.brand.code,
            live.settings.tax_rate_percent ?? 0,
            input,
          );
          if (fallback.ok) return fallback.result;
          return {
            ok: false,
            code: "VALIDATION",
            message:
              fallback.message ??
              "Order could not be saved. Add the create_order RPC or orders table access in Supabase.",
          };
        }
      return {
        ok: false,
        code: "UNKNOWN",
        message:
          process.env.NODE_ENV === "development"
            ? error.message
            : "Order could not be saved.",
      };
    }

    const row = data as { order_id: string; order_number: string };
    return {
      ok: true,
      orderId: row.order_id,
      orderNumber: row.order_number,
    };
  } catch (e) {
    return {
      ok: false,
      code: "UNKNOWN",
      message:
        process.env.NODE_ENV === "development" && e instanceof Error
          ? e.message
          : "Order could not be saved.",
    };
  }
}

async function submitOrderViaTables(
  supabase: SupabaseClient,
  brandId: string,
  brandCode: string,
  taxRatePercent: number,
  input: CreateOrderInput,
): Promise<
  { ok: true; result: CreateOrderResult } | { ok: false; message?: string }
> {
  const productIds = input.lines.map((line) => line.productId);
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select(
      "id, brand_id, name, description, sku, category, price, cost_price, unit, is_active, default_discount_percent, image_url",
    )
    .eq("brand_id", brandId)
    .in("id", productIds);

  if (productsError || !products?.length) {
    return { ok: false };
  }

  let customers: Customer[] = [];
  if (input.customerId) {
    const { data: customer } = await supabase
      .from("customers")
      .select("id, brand_id, name, email, phone, notes")
      .eq("brand_id", brandId)
      .eq("id", input.customerId)
      .maybeSingle();
    if (customer) customers = [customer as Customer];
  }

  const { data: offersData } = await supabase
    .from("offers")
    .select(
      "id, brand_id, name, code, discount_type, discount_value, scope, scope_value, min_order_amount, max_discount, starts_at, ends_at, is_active, redemption_count, usage_limit",
    )
    .eq("brand_id", brandId);
  const offers = (offersData ?? []) as Offer[];

  const orderId = crypto.randomUUID();
  const orderNumber = `${brandCode}-${Date.now().toString().slice(-8)}`;
  const built = buildOrderRecord({
    brandId,
    orderId,
    orderNumber,
    products: products as Product[],
    customers,
    taxRatePercent,
    input,
    offers,
  });
  if (!built.ok) return { ok: false };

  const { data: inserted, error: orderError } = await supabase
    .from("orders")
    .insert({
      id: built.record.order.id,
      brand_id: brandId,
      order_number: built.record.order.order_number,
      status: built.record.order.status,
      payment_status: built.record.order.payment_status,
      customer_id: built.record.order.customer_id,
      customer_name_snapshot: built.record.order.customer_name_snapshot,
      subtotal: built.record.order.subtotal,
      discount_total: built.record.order.discount_total,
      tax_total: built.record.order.tax_total,
      fees_total: built.record.order.fees_total,
      grand_total: built.record.order.grand_total,
      notes: built.record.order.notes,
      created_at: built.record.order.created_at,
    })
    .select("id, order_number")
    .single();

  if (orderError || !inserted) {
    return { ok: false };
  }

  const itemsPayload = built.record.items.map((item) => ({
    ...item,
    order_id: inserted.id,
  }));

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(itemsPayload);

  if (itemsError) {
    await supabase.from("orders").delete().eq("id", inserted.id);
    return { ok: false };
  }

  return {
    ok: true,
    result: {
      ok: true,
      orderId: inserted.id,
      orderNumber: inserted.order_number,
    },
  };
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabaseAvailable()) {
    const ctx = await csvBrandContext();
    if (!ctx) return { ok: false, message: "Not signed in." };
    const existing = findRow("orders", orderId);
    if (!existing || existing.brand_id !== ctx.brandId) {
      return { ok: false, message: "Order not found." };
    }
    const from = existing.status as OrderStatus;
    if (!allowedStatusTransitions(from).includes(status)) {
      return { ok: false, message: "Status change not allowed." };
    }
    patchRow("orders", orderId, { status });
    return { ok: true };
  }

  try {
    const live = await loadLiveWorkspace();
    if (!live) return { ok: false, message: "Not signed in." };
    if (!canManageOrderOperations(live.member.role)) {
      return { ok: false, message: "Not allowed." };
    }
    const brandId = live.brand.id;
    const supabase = await createSupabaseServerClient();
    const { data: existing } = await supabase
      .from("orders")
      .select("status")
      .eq("id", orderId)
      .eq("brand_id", brandId)
      .maybeSingle();
    if (!existing) return { ok: false, message: "Order not found." };
    const from = existing.status as OrderStatus;
    const allowed = allowedStatusTransitions(from);
    if (!allowed.includes(status)) {
      return { ok: false, message: "Status change not allowed." };
    }
    const { error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", orderId)
      .eq("brand_id", brandId);
    if (error) return { ok: false, message: mutationError(error.message) };
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not update order." };
  }
}

/* ------------------------------------------------------------------ */
/* CSV-only tables — the Supabase reads below are intentionally gone   */
/* ------------------------------------------------------------------ */

export async function listCustomers(search?: string): Promise<{
  data: Customer[];
  error?: string;
}> {
  // Storage policy: customers live in data/customers.csv only.
  const ctx = await csvBrandContext();
  if (!ctx) return { data: [], error: publicDataError("Not signed in.") };
  let rows = (readBrandRows("customers", ctx.brandId) as unknown as Customer[]).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  if (search) {
    const term = search.toLowerCase();
    rows = rows.filter(
      (c) =>
        contains(c.name, term) || contains(c.email, term) || contains(c.phone, term),
    );
  }
  return { data: rows };
}

export async function listPayments(): Promise<{
  data: Payment[];
  error?: string;
}> {
  // Storage policy: payments live in data/payments.csv only.
  const ctx = await csvBrandContext();
  if (!ctx) return { data: [], error: publicDataError("Not signed in.") };
  const rows = (readBrandRows("payments", ctx.brandId) as unknown as Payment[]).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return { data: rows };
}

export async function listOrdersByCustomerId(
  customerId: string,
): Promise<{ data: Order[]; error?: string }> {
  // Orders prefer Supabase; CSV otherwise (same rule as listOrders).
  if (!supabaseAvailable()) {
    const ctx = await csvBrandContext();
    if (!ctx) return { data: [], error: publicDataError("Not signed in.") };
    return {
      data: csvOrdersFor(ctx.brandId).filter((o) => o.customer_id === customerId),
    };
  }
  try {
    const brandId = await requireBrandId();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, brand_id, order_number, status, payment_status, customer_id, customer_name_snapshot, subtotal, discount_total, tax_total, fees_total, grand_total, notes, created_at",
      )
      .eq("brand_id", brandId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (error) return { data: [], error: publicDataError(error.message) };
    return { data: (data ?? []) as Order[] };
  } catch (e) {
    return {
      data: [],
      error: publicDataError(e instanceof Error ? e.message : undefined),
    };
  }
}

export async function listOffers(): Promise<{ data: Offer[]; error?: string }> {
  // Storage policy: offers live in data/offers.csv only.
  const ctx = await csvBrandContext();
  if (!ctx) return { data: [], error: publicDataError("Not signed in.") };
  const rows = (readBrandRows("offers", ctx.brandId) as unknown as Offer[]).sort(
    (a, b) => a.name.localeCompare(b.name),
  );
  return { data: rows };
}

function normalizeCustomerInput(
  input: CustomerUpsertInput,
):
  | {
      ok: true;
      data: {
        name: string;
        email: string | null | undefined;
        phone: string | null | undefined;
        notes: string | null | undefined;
        price_tier: "retail" | "wholesale" | null | undefined;
      };
    }
  | { ok: false; message: string } {
  const name = input.name?.trim() ?? "";
  if (!name || name.length > 120) {
    return { ok: false, message: "Customer name is required." };
  }
  // `undefined` is preserved on purpose: an update that does not send a field
  // means "leave it alone", while `null`/"" means "clear it".
  return {
    ok: true,
    data: {
      name,
      email: input.email === undefined ? undefined : input.email?.trim() || null,
      phone: input.phone === undefined ? undefined : input.phone?.trim() || null,
      notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
      price_tier:
        input.price_tier === undefined
          ? undefined
          : input.price_tier === "wholesale"
            ? "wholesale"
            : "retail",
    },
  };
}

export async function createCustomer(
  input: CustomerUpsertInput,
): Promise<
  { ok: true; customer: Customer } | { ok: false; message: string }
> {
  // Storage policy: customers are written to data/customers.csv only.
  const parsed = normalizeCustomerInput(input);
  if (!parsed.ok) return parsed;
  const ctx = await csvBrandContext();
  if (!ctx) return { ok: false, message: "Not signed in." };
  const now = new Date().toISOString();
  const customer: Customer = {
    id: crypto.randomUUID(),
    brand_id: ctx.brandId,
    name: parsed.data.name,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    notes: parsed.data.notes,
    price_tier: parsed.data.price_tier ?? "retail",
    created_at: now,
    // A brand-new row has nothing to preserve, so the CRM columns are just
    // whatever the caller sent.
    ...withConsentStamped(crmFieldsFromInput(input), now),
  };
  upsertRow("customers", customer as unknown as Record<string, unknown>);
  return { ok: true, customer };
}

export async function updateCustomer(
  customerId: string,
  input: CustomerUpsertInput,
): Promise<
  { ok: true; customer: Customer } | { ok: false; message: string }
> {
  // Storage policy: customers are written to data/customers.csv only.
  const parsed = normalizeCustomerInput(input);
  if (!parsed.ok) return parsed;
  const ctx = await csvBrandContext();
  if (!ctx) return { ok: false, message: "Not signed in." };
  const existing = findRow("customers", customerId);
  if (!existing || existing.brand_id !== ctx.brandId) {
    return { ok: false, message: "Customer not found." };
  }
  const stored = existing as unknown as Customer;
  // Fields the caller did not send stay exactly as they are — the customers
  // page edits contact details only, so it must never clear CRM columns, and a
  // CRM action that changes one column must never clear the others.
  const next: Customer = mergeCustomerCrmFields(stored, {
    ...withConsentStamped(crmFieldsFromInput(input), new Date().toISOString()),
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone,
    notes: parsed.data.notes,
    price_tier: parsed.data.price_tier,
  });
  patchRow("customers", customerId, next as unknown as Record<string, unknown>);
  return { ok: true, customer: next };
}

export async function createOffer(
  input: OfferUpsertInput,
): Promise<{ ok: true; offer: Offer } | { ok: false; message: string }> {
  // Storage policy: offers are written to data/offers.csv only.
  const ctx = await csvBrandContext();
  if (!ctx) return { ok: false, message: "Not signed in." };
  const offer: Offer = {
    id: crypto.randomUUID(),
    brand_id: ctx.brandId,
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
  upsertRow("offers", offer as unknown as Record<string, unknown>);
  return { ok: true, offer };
}

export async function recordPayment(
  input: RecordPaymentInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, message: "Enter a valid amount." };
  }

  if (!supabaseAvailable()) {
    const ctx = await csvBrandContext();
    if (!ctx) return { ok: false, message: "Not signed in." };
    const order = findRow("orders", input.orderId);
    if (!order || order.brand_id !== ctx.brandId) {
      return { ok: false, message: "Order not found." };
    }
    const method = sanitizePaymentMethod(input.method);
    if (!method) return { ok: false, message: "Invalid payment method." };
    const now = new Date().toISOString();
    upsertRow("payments", {
      id: crypto.randomUUID(),
      brand_id: ctx.brandId,
      order_id: input.orderId,
      amount: input.amount,
      method,
      status: "paid",
      created_at: now,
      split_label: input.splitLabel?.trim().slice(0, 80) || null,
      notes: input.notes?.trim().slice(0, 500) || null,
    });
    const paid = (readBrandRows("payments", ctx.brandId) as unknown as Payment[])
      .filter((p) => p.order_id === input.orderId)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const payment_status =
      paid >= Number(order.grand_total)
        ? "paid"
        : paid > 0
          ? "partial"
          : "pending";
    patchRow("orders", input.orderId, { payment_status, amount_paid: paid });
    return { ok: true };
  }

  try {
    const live = await loadLiveWorkspace();
    if (!live) return { ok: false, message: "Not signed in." };
    if (!canRecordPayments(live.member.role)) {
      return { ok: false, message: "Not allowed." };
    }
    const method = sanitizePaymentMethod(input.method);
    if (!method) return { ok: false, message: "Invalid payment method." };
    const brandId = live.brand.id;
    const supabase = await createSupabaseServerClient();
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, grand_total, payment_status")
      .eq("id", input.orderId)
      .eq("brand_id", brandId)
      .maybeSingle();
    if (orderError || !order) {
      return { ok: false, message: "Order not found." };
    }

    const { error: payError } = await supabase.from("payments").insert({
      brand_id: brandId,
      order_id: input.orderId,
      amount: input.amount,
      method,
      status: "paid",
      split_label: input.splitLabel?.trim().slice(0, 80) || null,
      notes: input.notes?.trim().slice(0, 500) || null,
    });
    if (payError) return { ok: false, message: mutationError(payError.message) };

    const { data: payments } = await supabase
      .from("payments")
      .select("amount")
      .eq("order_id", input.orderId)
      .eq("brand_id", brandId);
    const paid = (payments ?? []).reduce(
      (sum, row) => sum + Number(row.amount),
      0,
    );
    const payment_status =
      paid >= Number(order.grand_total)
        ? "paid"
        : paid > 0
          ? "partial"
          : "pending";

    await supabase
      .from("orders")
      .update({ payment_status, amount_paid: paid })
      .eq("id", input.orderId)
      .eq("brand_id", brandId);

    return { ok: true };
  } catch {
    return { ok: false, message: "Could not record payment." };
  }
}

export async function getOrderByPublicToken(
  token: string,
): Promise<{ order: Order; brandName: string } | null> {
  const normalized = normalizePublicQuoteToken(token);
  if (!normalized) return null;

  if (!supabaseAvailable()) {
    const row = readAllRows("orders").find(
      (order) => order.public_token === normalized,
    ) as unknown as Order | undefined;
    if (!row) return null;
    const brandPack = getRawDemoBrandPack(
      // brand_id on CSV orders is the demo pack id; find the matching pack.
      (() => {
        for (const code of ["BR-1", "BR-2"] as const) {
          if (csvBrandId(code) === row.brand_id) return code;
        }
        return "BR-1";
      })(),
    );
    return {
      order: row,
      brandName: brandPack.brand.name,
    };
  }

  try {
    const { createSupabaseServiceClient } = await import(
      "@/lib/supabase/service"
    );
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
      .from("orders")
      .select(
        "id, brand_id, order_number, status, payment_status, customer_name_snapshot, subtotal, discount_total, tax_total, fees_total, grand_total, created_at",
      )
      .eq("public_token", normalized)
      .maybeSingle();
    if (!data) return null;
    const { data: brand } = await supabase
      .from("brands")
      .select("name")
      .eq("id", data.brand_id)
      .maybeSingle();
    return {
      order: data as Order,
      brandName: (brand?.name as string) ?? "OrderBook",
    };
  } catch {
    return null;
  }
}

export async function listStockAdjustments(): Promise<{
  data: StockAdjustment[];
  error?: string;
}> {
  // Storage policy: stock adjustments read data/stock_adjustments.csv only.
  const ctx = await csvBrandContext();
  if (!ctx) return { data: [], error: publicDataError("Not signed in.") };
  const rows = (
    readBrandRows("stock_adjustments", ctx.brandId) as unknown as StockAdjustment[]
  ).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return { data: rows.slice(0, 200) };
}
