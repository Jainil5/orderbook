import { getDemoBrandPack, resolveDemoBrandCode } from "@/lib/demo/brands";
import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import {
  applyOrderPatches,
  mergeDemoCustomers,
  mergeDemoOffers,
  mergeDemoPayments,
  mergeDemoProducts,
  listDemoAudit,
} from "@/lib/demo/merge-entities";
import { readDemoOrderStore } from "@/lib/demo/order-store";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import type {
  Customer,
  Offer,
  Order,
  OrderItem,
  Payment,
  Product,
  StockAdjustment,
} from "@/types/database";

function packFor(code: DemoBrandCode) {
  return getDemoBrandPack(code);
}

function resolveCode(brandCode?: DemoBrandCode): DemoBrandCode {
  return brandCode ?? "BR-1";
}

async function mergedOrderData(brandCode?: DemoBrandCode) {
  const code = resolveCode(brandCode);
  const pack = packFor(code);
  const bucket = await readDemoMutableBucket(code);
  const stored = await readDemoOrderStore(code);
  const orderById = new Map<string, Order>();
  for (const order of pack.orders) orderById.set(order.id, order);
  for (const order of stored.orders) orderById.set(order.id, order);
  let orders = Array.from(orderById.values());
  orders = applyOrderPatches(orders, bucket);
  orders.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const itemById = new Map<string, OrderItem>();
  for (const item of pack.orderItems) itemById.set(item.id, item);
  for (const item of stored.orderItems) itemById.set(item.id, item);
  const orderItems = Array.from(itemById.values());
  return { code, orders, orderItems, bucket };
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

export async function listDemoProductsMerged(
  filters?: {
    search?: string;
    category?: string;
    activeOnly?: boolean;
  },
  brandCode?: DemoBrandCode,
): Promise<Product[]> {
  const code = resolveCode(brandCode);
  const pack = packFor(code);
  const bucket = await readDemoMutableBucket(code);
  let rows = mergeDemoProducts(pack.products, bucket);
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
  const { orders } = await mergedOrderData(brandCode);
  let rows = [...orders];
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

export async function getDemoOrder(
  id: string,
  brandCode?: DemoBrandCode,
): Promise<Order | undefined> {
  const { orders } = await mergedOrderData(brandCode);
  return orders.find((o) => o.id === id);
}

export async function getDemoOrderItems(
  orderId: string,
  brandCode?: DemoBrandCode,
): Promise<OrderItem[]> {
  const { orderItems } = await mergedOrderData(brandCode);
  return orderItems.filter((i) => i.order_id === orderId);
}

export async function listDemoOrdersForCustomer(
  customerId: string,
  brandCode?: DemoBrandCode,
): Promise<Order[]> {
  const { orders } = await mergedOrderData(brandCode);
  return orders
    .filter((o) => o.customer_id === customerId)
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
}

export async function listDemoCustomers(
  search?: string,
  brandCode?: DemoBrandCode,
): Promise<Customer[]> {
  const code = resolveCode(brandCode);
  const pack = packFor(code);
  const bucket = await readDemoMutableBucket(code);
  let rows = mergeDemoCustomers(pack.customers, bucket);
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
  const { orderItems } = await mergedOrderData(brandCode);
  return orderItems;
}

export async function listDemoOffers(
  brandCode?: DemoBrandCode,
): Promise<Offer[]> {
  const code = resolveCode(brandCode);
  const pack = packFor(code);
  const bucket = await readDemoMutableBucket(code);
  return mergeDemoOffers(pack.offers, bucket);
}

export async function listDemoPayments(
  brandCode?: DemoBrandCode,
): Promise<Payment[]> {
  const code = resolveCode(brandCode);
  const pack = packFor(code);
  const bucket = await readDemoMutableBucket(code);
  return mergeDemoPayments(pack.payments, bucket);
}

export async function listDemoAuditLog(brandCode?: DemoBrandCode) {
  const code = resolveCode(brandCode);
  const bucket = await readDemoMutableBucket(code);
  return listDemoAudit(bucket);
}

export function getDemoAnalytics(brandCode?: DemoBrandCode) {
  return packFor(brandCode ?? "BR-1").analytics;
}

export async function listDemoStockAdjustments(
  brandCode?: DemoBrandCode,
): Promise<StockAdjustment[]> {
  const code = resolveCode(brandCode);
  const bucket = await readDemoMutableBucket(code);
  return bucket.stockAdjustments;
}

export function toDemoBrandCode(brandCode: string): DemoBrandCode {
  return resolveDemoBrandCode(brandCode);
}
