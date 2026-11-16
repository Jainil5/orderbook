import { getDemoBrandPack, resolveDemoBrandCode } from "@/lib/demo/brands";
import { csvBrandId, csvStockAdjustmentRows } from "@/lib/csv/source";
import { listAudit, listBrand } from "@/lib/csv/records";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type {
  Customer,
  Offer,
  Order,
  OrderItem,
  Payment,
  Product,
  Refund,
  StockAdjustment,
} from "@/types/database";

/**
 * The demo read side, and after the CSV move it is a thin one.
 *
 * `getDemoBrandPack` already returns the record arrays of `data/*.csv`, so
 * every collection here is the file content plus the filters the screen asked
 * for. There is deliberately no second layer: in-app edits are written back to
 * these same tables by `src/lib/demo/server.ts`, which is what makes an edit
 * visible in another browser, survive a restart, and be reviewable as text.
 */

function packFor(code: DemoBrandCode) {
  return getDemoBrandPack(code);
}

function resolveCode(brandCode?: DemoBrandCode): DemoBrandCode {
  return brandCode ?? "BR-1";
}

function byNewest(a: { created_at: string | null }, b: { created_at: string | null }) {
  return (
    new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
}

function mergedOrderData(brandCode?: DemoBrandCode) {
  const pack = packFor(resolveCode(brandCode));
  return {
    orders: [...pack.orders].sort(byNewest),
    orderItems: pack.orderItems,
  };
}

export function listDemoProducts(
  filters?: {
    search?: string;
    category?: string;
    activeOnly?: boolean;
  },
  brandCode?: DemoBrandCode,
): Product[] {
  const pack = packFor(brandCode ?? "BR-1");
  let rows = [...pack.products];
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

/**
 * Same rows as `listDemoProducts` — the name is historical, from when this was
 * the only function that layered in-app product edits over the fixtures.
 */
export async function listDemoProductsMerged(
  filters?: {
    search?: string;
    category?: string;
    activeOnly?: boolean;
  },
  brandCode?: DemoBrandCode,
): Promise<Product[]> {
  return listDemoProducts(filters, brandCode);
}

export function demoProductCategories(brandCode?: DemoBrandCode): string[] {
  const pack = packFor(brandCode ?? "BR-1");
  const set = new Set<string>();
  pack.products.filter((p) => p.is_active).forEach((p) =>
    set.add(p.category ?? "Uncategorized"),
  );
  return ["All", ...Array.from(set).sort()];
}

export async function listDemoOrders(
  filters?: {
    search?: string;
    status?: string;
    paymentStatus?: string;
  },
  brandCode?: DemoBrandCode,
): Promise<Order[]> {
  const { orders } = mergedOrderData(brandCode);
  let rows = orders;
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
  return rows;
}

export async function getDemoOrder(
  id: string,
  brandCode?: DemoBrandCode,
): Promise<Order | undefined> {
  return mergedOrderData(brandCode).orders.find((o) => o.id === id);
}

export async function getDemoOrderItems(
  orderId: string,
  brandCode?: DemoBrandCode,
): Promise<OrderItem[]> {
  return mergedOrderData(brandCode).orderItems.filter((i) => i.order_id === orderId);
}

export async function listDemoOrdersForCustomer(
  customerId: string,
  brandCode?: DemoBrandCode,
): Promise<Order[]> {
  return mergedOrderData(brandCode).orders.filter((o) => o.customer_id === customerId);
}

export async function listDemoCustomers(
  search?: string,
  brandCode?: DemoBrandCode,
): Promise<Customer[]> {
  const pack = packFor(resolveCode(brandCode));
  let rows = [...pack.customers].sort((a, b) => a.name.localeCompare(b.name));
  if (search) {
    const q = search.toLowerCase();
    const digits = search.replace(/\D/g, "");
    rows = rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email?.toLowerCase().includes(q) ?? false) ||
        (c.phone?.includes(q) ?? false) ||
        (digits.length >= 4 &&
          (c.phone?.replace(/\D/g, "").includes(digits) ?? false)),
    );
  }
  return rows;
}

export async function getDemoCustomer(
  id: string,
  brandCode?: DemoBrandCode,
): Promise<Customer | undefined> {
  const rows = await listDemoCustomers(undefined, brandCode);
  return rows.find((c) => c.id === id);
}

export async function listDemoOrderItemsForOrders(
  brandCode?: DemoBrandCode,
): Promise<OrderItem[]> {
  return mergedOrderData(brandCode).orderItems;
}

export async function listDemoOffers(
  brandCode?: DemoBrandCode,
): Promise<Offer[]> {
  const pack = packFor(resolveCode(brandCode));
  return [...pack.offers].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listDemoPayments(
  brandCode?: DemoBrandCode,
): Promise<Payment[]> {
  const pack = packFor(resolveCode(brandCode));
  return [...pack.payments].sort(byNewest);
}

/**
 * Refunds the brand has recorded. `recordDemoRefund` in `src/lib/demo/server.ts`
 * writes these rows, so the refunds screen, the finance overview and analytics
 * all read back exactly what was saved.
 */
export async function listDemoRefunds(
  brandCode?: DemoBrandCode,
): Promise<Refund[]> {
  return listBrand<Refund>("refunds", csvBrandId(resolveCode(brandCode))).sort(byNewest);
}

export async function listDemoAuditLog(brandCode?: DemoBrandCode) {
  return listAudit(csvBrandId(resolveCode(brandCode)));
}

export function getDemoAnalytics(brandCode?: DemoBrandCode) {
  return packFor(brandCode ?? "BR-1").analytics;
}

export async function listDemoStockAdjustments(
  brandCode?: DemoBrandCode,
): Promise<StockAdjustment[]> {
  return csvStockAdjustmentRows<StockAdjustment>(csvBrandId(resolveCode(brandCode)));
}

export function toDemoBrandCode(brandCode: string): DemoBrandCode {
  return resolveDemoBrandCode(brandCode);
}
