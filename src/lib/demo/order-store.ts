import { cookies } from "next/headers";
import type { Order, OrderItem } from "@/types/database";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import { DEMO_LIMITS } from "@/lib/demo/read-only";
import { readChunkedCookie, writeChunkedCookie } from "./chunked-cookie";

export const DEMO_ORDERS_COOKIE = "ob_demo_orders_v1";
const MAX_STORED_ORDERS_PER_BRAND = DEMO_LIMITS.orders;

/** Browser-created documents carry this id prefix, so cap eviction can
 *  recycle the oldest of them instead of a seeded showcase order. */
const CREATED_ORDER_PREFIX = "demo-order-";

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
  const store = parseStore(readChunkedCookie(cookieStore, DEMO_ORDERS_COOKIE));
  return store[brandCode] ?? { orders: [], orderItems: [] };
}

export async function appendDemoOrderRecord(
  brandCode: DemoBrandCode,
  order: Order,
  items: OrderItem[],
): Promise<void> {
  const cookieStore = await cookies();
  const store = parseStore(readChunkedCookie(cookieStore, DEMO_ORDERS_COOKIE));
  const bucket = store[brandCode] ?? { orders: [], orderItems: [] };
  // Newest first. When the combined cap is hit, recycle the oldest
  // browser-created document; never a seeded one.
  const orders = [order, ...bucket.orders];
  if (orders.length > MAX_STORED_ORDERS_PER_BRAND) {
    let dropIdx = orders.length - 1;
    for (let i = orders.length - 1; i >= 0; i -= 1) {
      if (orders[i].id.startsWith(CREATED_ORDER_PREFIX)) {
        dropIdx = i;
        break;
      }
    }
    const droppedId = orders[dropIdx].id;
    orders.splice(dropIdx, 1);
    bucket.orderItems = bucket.orderItems.filter((i) => i.order_id !== droppedId);
  }
  const keptIds = new Set(orders.map((o) => o.id));
  const orderItems = [
    ...items,
    ...bucket.orderItems.filter((i) => keptIds.has(i.order_id)),
  ].filter((i) => keptIds.has(i.order_id));

  store[brandCode] = { orders, orderItems };
  writeChunkedCookie(cookieStore, DEMO_ORDERS_COOKIE, JSON.stringify(store), {
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
  const store = parseStore(readChunkedCookie(cookieStore, DEMO_ORDERS_COOKIE));
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
  writeChunkedCookie(cookieStore, DEMO_ORDERS_COOKIE, JSON.stringify(store), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return true;
}
