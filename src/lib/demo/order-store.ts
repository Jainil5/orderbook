import { cookies } from "next/headers";
import type { Order, OrderItem } from "@/types/database";
import type { DemoBrandCode } from "@/lib/workspace/constants";

export const DEMO_ORDERS_COOKIE = "ob_demo_orders_v1";
const MAX_STORED_ORDERS_PER_BRAND = 40;

type BrandBucket = { orders: Order[]; orderItems: OrderItem[] };
type DemoOrderStore = Partial<Record<DemoBrandCode, BrandBucket>>;

function parseStore(raw: string | undefined): DemoOrderStore {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as DemoOrderStore;
  } catch {
    return {};
  }
}

export async function readDemoOrderStore(
  brandCode: DemoBrandCode,
): Promise<BrandBucket> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(DEMO_ORDERS_COOKIE)?.value);
  return store[brandCode] ?? { orders: [], orderItems: [] };
}

export async function appendDemoOrderRecord(
  brandCode: DemoBrandCode,
  order: Order,
  items: OrderItem[],
): Promise<void> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(DEMO_ORDERS_COOKIE)?.value);
  const bucket = store[brandCode] ?? { orders: [], orderItems: [] };
  const orders = [order, ...bucket.orders].slice(0, MAX_STORED_ORDERS_PER_BRAND);
  const keptIds = new Set(orders.map((o) => o.id));
  const orderItems = [
    ...items,
    ...bucket.orderItems.filter((i) => keptIds.has(i.order_id)),
  ].filter((i) => keptIds.has(i.order_id));

  store[brandCode] = { orders, orderItems };
  cookieStore.set(DEMO_ORDERS_COOKIE, JSON.stringify(store), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function patchDemoOrderInStore(
  brandCode: DemoBrandCode,
  orderId: string,
  patch: Partial<Order>,
): Promise<boolean> {
  const cookieStore = await cookies();
  const store = parseStore(cookieStore.get(DEMO_ORDERS_COOKIE)?.value);
  const bucket = store[brandCode];
  if (!bucket) return false;
  let found = false;
  const orders = bucket.orders.map((order) => {
    if (order.id !== orderId) return order;
    found = true;
    return { ...order, ...patch };
  });
  if (!found) return false;
  store[brandCode] = { ...bucket, orders };
  cookieStore.set(DEMO_ORDERS_COOKIE, JSON.stringify(store), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}
