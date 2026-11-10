import type { Order } from "@/types/database";
import { localDayKey } from "@/lib/manager/time";

/**
 * Orders still being worked (pending or confirmed), oldest first so the longest
 * wait sits at the top. Completed today is a separate list for the board.
 */
export function groupBoardOrders(
  orders: Order[],
  now: Date,
): { ongoing: Order[]; completedToday: Order[] } {
  const today = localDayKey(now);
  const ongoing = orders
    .filter((o) => o.status === "pending" || o.status === "confirmed")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const completedToday = orders
    .filter(
      (o) => o.status === "completed" && localDayKey(new Date(o.created_at)) === today,
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { ongoing, completedToday };
}
