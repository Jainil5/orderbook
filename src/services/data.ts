import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
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
import type { SupabaseClient } from "@supabase/supabase-js";

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

function mutationError(detail?: string): string {
  if (process.env.NODE_ENV === "development" && detail) return detail;
  return "Could not save product.";
}

function publicDataError(detail?: string): string {
  if (process.env.NODE_ENV === "development" && detail) return detail;
  return "Unable to load data.";
}

export async function listProducts(filters?: {
  search?: string;
  category?: string;
  activeOnly?: boolean;
}): Promise<{ data: Product[]; error?: string }> {
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

export async function listOrders(params: {
  search?: string;
  status?: string;
  paymentStatus?: string;
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<{ data: Order[]; count: number; error?: string }> {
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

export async function listCustomers(search?: string): Promise<{
  data: Customer[];
  error?: string;
}> {
  try {
    const brandId = await requireBrandId();
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("customers")
      .select("id, brand_id, name, email, phone, notes")
      .eq("brand_id", brandId)
      .order("name");

    if (search) {
      const term = escapeIlikePattern(search);
      if (term) {
        query = query.or(
          `name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
        );
      }
    }

    const { data, error } = await query;
    if (error) return { data: [], error: publicDataError(error.message) };
    return { data: (data ?? []) as Customer[] };
  } catch (e) {
    return {
      data: [],
      error: publicDataError(e instanceof Error ? e.message : undefined),
    };
  }
}

export async function listPayments(): Promise<{
  data: Payment[];
  error?: string;
}> {
  try {
    const brandId = await requireBrandId();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("payments")
      .select("id, brand_id, order_id, amount, method, status, created_at")
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false });

    if (error) return { data: [], error: publicDataError(error.message) };
    return { data: (data ?? []) as Payment[] };
  } catch (e) {
    return {
      data: [],
      error: publicDataError(e instanceof Error ? e.message : undefined),
    };
  }
}

export async function listOrdersByCustomerId(
  customerId: string,
): Promise<{ data: Order[]; error?: string }> {
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
  try {
    const brandId = await requireBrandId();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("offers")
      .select(
        "id, brand_id, name, code, discount_type, discount_value, scope, scope_value, min_order_amount, max_discount, starts_at, ends_at, is_active, redemption_count, usage_limit",
      )
      .eq("brand_id", brandId)
      .order("name");
    if (error) return { data: [], error: publicDataError(error.message) };
    return { data: (data ?? []) as Offer[] };
  } catch (e) {
    return {
      data: [],
      error: publicDataError(e instanceof Error ? e.message : undefined),
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

export async function submitOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const validation = validateCreateOrderInput(input);
  if (!validation.ok) {
    return { ok: false, code: "VALIDATION", message: validation.message };
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

function normalizeCustomerInput(
  input: CustomerUpsertInput,
): { ok: true; data: CustomerUpsertInput } | { ok: false; message: string } {
  const name = input.name?.trim() ?? "";
  if (!name || name.length > 120) {
    return { ok: false, message: "Customer name is required." };
  }
  return {
    ok: true,
    data: {
      name,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
      price_tier:
        input.price_tier === "wholesale" ? "wholesale" : ("retail" as const),
    },
  };
}

export async function createCustomer(
  input: CustomerUpsertInput,
): Promise<
  { ok: true; customer: Customer } | { ok: false; message: string }
> {
  const parsed = normalizeCustomerInput(input);
  if (!parsed.ok) return parsed;
  try {
    const brandId = await requireBrandId();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customers")
      .insert({
        brand_id: brandId,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        notes: parsed.data.notes,
        price_tier: parsed.data.price_tier ?? "retail",
      })
      .select("id, brand_id, name, email, phone, notes, price_tier")
      .single();
    if (error) return { ok: false, message: mutationError(error.message) };
    return { ok: true, customer: data as Customer };
  } catch {
    return { ok: false, message: "Could not save customer." };
  }
}

export async function updateCustomer(
  customerId: string,
  input: CustomerUpsertInput,
): Promise<
  { ok: true; customer: Customer } | { ok: false; message: string }
> {
  const parsed = normalizeCustomerInput(input);
  if (!parsed.ok) return parsed;
  try {
    const brandId = await requireBrandId();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("customers")
      .update({
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        notes: parsed.data.notes,
      })
      .eq("id", customerId)
      .eq("brand_id", brandId)
      .select("id, brand_id, name, email, phone, notes")
      .single();
    if (error) return { ok: false, message: mutationError(error.message) };
    return { ok: true, customer: data as Customer };
  } catch {
    return { ok: false, message: "Could not update customer." };
  }
}

export async function createOffer(
  input: OfferUpsertInput,
): Promise<{ ok: true; offer: Offer } | { ok: false; message: string }> {
  try {
    const brandId = await requireProductManagerBrandId();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("offers")
      .insert({
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
        usage_limit: input.usage_limit ?? null,
        redemption_count: 0,
      })
      .select(
        "id, brand_id, name, code, discount_type, discount_value, scope, scope_value, min_order_amount, max_discount, starts_at, ends_at, is_active, redemption_count, usage_limit",
      )
      .single();
    if (error) return { ok: false, message: mutationError(error.message) };
    return { ok: true, offer: data as Offer };
  } catch {
    return { ok: false, message: "Could not save offer." };
  }
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
): Promise<{ ok: true } | { ok: false; message: string }> {
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

export async function recordPayment(
  input: RecordPaymentInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, message: "Enter a valid amount." };
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
  try {
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
  try {
    const brandId = await requireBrandId();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("stock_adjustments")
      .select(
        "id, brand_id, product_id, delta_qty, reason, created_at",
      )
      .eq("brand_id", brandId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return { data: [], error: publicDataError(error.message) };
    }
    return { data: (data ?? []) as StockAdjustment[] };
  } catch (e) {
    return {
      data: [],
      error: publicDataError(e instanceof Error ? e.message : undefined),
    };
  }
}
