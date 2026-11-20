"use server";

import { listDemoOrders, toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

/** What the workspace needs to spot an order it has not announced yet. */
export type RecentOrderPing = {
  id: string;
  orderNumber: string;
  grandTotal: number;
  customerName: string | null;
  orderType: string | null;
  createdAt: string;
  /** Set by `placeSiteOrder`, so the bell can tell a remote order from one rung in. */
  fromWebsite: boolean;
};

const RECENT_WINDOW = 12;

/**
 * The newest orders in the brand the signed-in workspace is looking at.
 * Returns nothing without a session, so a logged-out poll cannot read a till.
 */
export async function recentDemoOrders(): Promise<RecentOrderPing[]> {
  const ws = await loadWorkspaceSession();
  if (!ws) return [];

  const orders = await listDemoOrders(undefined, toDemoBrandCode(ws.brand.code));

  return orders.slice(0, RECENT_WINDOW).map((order) => ({
    id: order.id,
    orderNumber: order.order_number,
    grandTotal: order.grand_total,
    customerName: order.customer_name_snapshot,
    orderType: order.order_type ?? null,
    createdAt: order.created_at,
    fromWebsite: order.notes?.trim().startsWith("Website order") ?? false,
  }));
}
