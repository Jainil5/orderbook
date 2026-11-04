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

async function requireBrandId() {
  const ws = await loadLiveWorkspace();
  if (!ws) throw new Error("Unauthorized");
  return ws.brand.id;
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
      query = query.eq("category", filters.category);
    }
    if (filters?.search) {
      query = query.or(
        `name.ilike.%${filters.search}%,sku.ilike.%${filters.search}%`,
      );
    }

    const { data, error } = await query;
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as Product[] };
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Failed to load products",
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
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
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

    if (params.status && params.status !== "all") {
      query = query.eq("status", params.status);
    }
    if (params.paymentStatus && params.paymentStatus !== "all") {
      query = query.eq("payment_status", params.paymentStatus);
    }
    if (params.search) {
      query = query.or(
        `order_number.ilike.%${params.search}%,customer_name_snapshot.ilike.%${params.search}%`,
      );
    }

    const { data, error, count } = await query;
    if (error) return { data: [], count: 0, error: error.message };
    return { data: (data ?? []) as Order[], count: count ?? 0 };
  } catch (e) {
    return {
      data: [],
      count: 0,
      error: e instanceof Error ? e.message : "Failed to load orders",
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
      query = query.or(
        `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`,
      );
    }

    const { data, error } = await query;
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as Customer[] };
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Failed to load customers",
    };
  }
}

export async function listOffers(): Promise<{ data: Offer[]; error?: string }> {
  try {
    const brandId = await requireBrandId();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("offers")
      .select("*")
      .eq("brand_id", brandId)
      .order("name");
    if (error) return { data: [], error: error.message };
    return { data: (data ?? []) as Offer[] };
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Failed to load offers",
    };
  }
}

export async function submitOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
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
      return { ok: false, code: "UNKNOWN", message: error.message };
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
      message: e instanceof Error ? e.message : "Order failed",
    };
  }
}
