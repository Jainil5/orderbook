import {
  DEMO_ANALYTICS,
  DEMO_BRAND,
  DEMO_CUSTOMERS,
  DEMO_OFFERS,
  DEMO_ORDER_ITEMS,
  DEMO_ORDERS,
  DEMO_PAYMENTS,
  DEMO_PRODUCTS,
  DEMO_SETTINGS,
} from "@/lib/demo/fixtures";
import type {
  CreateOrderInput,
  CreateOrderResult,
  Customer,
  Offer,
  Order,
  OrderItem,
  Payment,
  Product,
} from "@/types/database";

export function listDemoProducts(filters?: {
  search?: string;
  category?: string;
  activeOnly?: boolean;
}): Product[] {
  let rows = [...DEMO_PRODUCTS];
  if (filters?.activeOnly !== false) {
    rows = rows.filter((p) => p.is_active);
  }
  if (filters?.category && filters.category !== "all") {
    rows = rows.filter(
      (p) => (p.category ?? "Uncategorized") === filters.category,
    );
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku?.toLowerCase().includes(q) ?? false),
    );
  }
  return rows;
}

export function demoProductCategories(): string[] {
  const set = new Set<string>();
  DEMO_PRODUCTS.filter((p) => p.is_active).forEach((p) =>
    set.add(p.category ?? "Uncategorized"),
  );
  return ["All", ...Array.from(set).sort()];
}

export function listDemoOrders(filters?: {
  search?: string;
  status?: string;
  paymentStatus?: string;
}): Order[] {
  let rows = [...DEMO_ORDERS];
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(
      (o) =>
        o.order_number.toLowerCase().includes(q) ||
        (o.customer_name_snapshot?.toLowerCase().includes(q) ?? false),
    );
  }
  if (filters?.status && filters.status !== "all") {
    rows = rows.filter((o) => o.status === filters.status);
  }
  if (filters?.paymentStatus && filters.paymentStatus !== "all") {
    rows = rows.filter((o) => o.payment_status === filters.paymentStatus);
  }
  return rows.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

export function getDemoOrder(id: string): Order | undefined {
  return DEMO_ORDERS.find((o) => o.id === id);
}

export function getDemoOrderItems(orderId: string): OrderItem[] {
  return DEMO_ORDER_ITEMS.filter((i) => i.order_id === orderId);
}

export function listDemoCustomers(search?: string): Customer[] {
  let rows = [...DEMO_CUSTOMERS];
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.phone?.includes(q) ?? false),
    );
  }
  return rows;
}

export function getDemoCustomer(id: string): Customer | undefined {
  return DEMO_CUSTOMERS.find((c) => c.id === id);
}

export function listDemoOffers(): Offer[] {
  return DEMO_OFFERS;
}

export function listDemoPayments(): Payment[] {
  return DEMO_PAYMENTS;
}

export function getDemoAnalytics() {
  return DEMO_ANALYTICS;
}

export function demoWorkspaceMeta() {
  return {
    brand: DEMO_BRAND,
    settings: DEMO_SETTINGS,
  };
}

export async function submitDemoOrder(
  _input: CreateOrderInput,
): Promise<CreateOrderResult> {
  return {
    ok: false,
    code: "NOT_CONFIGURED",
    message: "Demo mode is read-only. Sign in to place live orders.",
  };
}
