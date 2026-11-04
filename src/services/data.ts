import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CreateOrderInput,
  CreateOrderResult,
  Customer,
  Offer,
  Order,
  Product,
} from "@/types/database";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import {
  clampPage,
  clampPageSize,
  escapeIlikePattern,
  sanitizeOrderStatus,
  sanitizePaymentStatus,
} from "@/lib/security/input";
import { validateCreateOrderInput } from "@/lib/security/validate-order";

async function requireBrandId() {
  const ws = await loadLiveWorkspace();
  if (!ws) throw new Error("Unauthorized");
  return ws.brand.id;
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
      .select(
        "id, brand_id, name, description, sku, category, price, cost_price, unit, is_active",
      )
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

export async function listOrders(params: {
  search?: string;
  status?: string;
  paymentStatus?: string;
  page?: number;
  pageSize?: number;
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
        "id, brand_id, order_number, status, payment_status, customer_id, customer_name_snapshot, subtotal, discount_total, tax_total, fees_total, grand_total, notes, created_at",
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

export async function submitOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const validation = validateCreateOrderInput(input);
  if (!validation.ok) {
    return { ok: false, code: "VALIDATION", message: validation.message };
  }

  try {
    await requireBrandId();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_order", {
      p_customer_id: input.customerId,
      p_walk_in_name: input.walkInName ?? null,
      p_notes: input.notes ?? null,
      p_lines: input.lines,
      p_offer_code: input.offerCode ?? null,
      p_payment_method: input.paymentMethod,
      p_payment_status: input.paymentStatus,
    });

    if (error) {
      if (error.code === "PGRST202" || error.message.includes("create_order")) {
        return {
          ok: false,
          code: "NOT_CONFIGURED",
          message:
            "Order submission is not configured yet. Add the create_order RPC in Supabase.",
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
