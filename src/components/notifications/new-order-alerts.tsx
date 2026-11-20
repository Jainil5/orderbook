"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ORDER_TYPE_LABELS } from "@/lib/orders/order-labels";
import { formatMoney } from "@/lib/format";
import { recentDemoOrders, type RecentOrderPing } from "@/services/order-feed-actions";
import { useNotifications } from "./notifications-context";

/** How often the workspace asks the till whether anything new came through. */
const POLL_MS = 12000;

/**
 * An order older than this is not "just arrived" — it is history the workspace
 * never looked at, so it moves the baseline instead of firing a toast.
 */
const ARRIVAL_WINDOW_MS = 5 * 60 * 1000;

/** The order is written on the server's clock and read on this one. */
const CLOCK_SLACK_MS = 60_000;

const TYPE_LABELS: Record<string, string> = ORDER_TYPE_LABELS as Record<string, string>;

function describe(order: RecentOrderPing, currencyCode: string): string {
  const bits = [
    order.customerName?.trim() || "Walk-in",
    formatMoney(order.grandTotal, currencyCode),
  ];
  if (order.orderType && TYPE_LABELS[order.orderType]) {
    bits.push(TYPE_LABELS[order.orderType]);
  }
  return bits.join(" · ");
}

/**
 * Real new-order alerts. A customer ordering on the brand site writes into the
 * same store the counter reads, so this asks for the newest orders on a timer —
 * and again the moment the tab is focused — and announces the ones it has not
 * seen. Orders rung in at the counter are skipped: whoever rang it already knows.
 *
 * The time of the last check is kept per brand in localStorage, so a page reload
 * or a second tab does not re-announce the same order as new.
 */
export function NewOrderAlerts({
  brandCode,
  currencyCode,
}: {
  brandCode: string;
  currencyCode: string;
}) {
  const { notify } = useNotifications();
  const router = useRouter();

  useEffect(() => {
    const storageKey = `ob-order-seen:${brandCode}`;
    let cancelled = false;

    /**
     * The baseline is this device's own clock at the last check, never an order's
     * timestamp: the seeded history includes orders scheduled for later today,
     * and a future one would otherwise sit ahead of every real arrival.
     */
    let lastSeen = Math.min(Number(localStorage.getItem(storageKey) ?? "") || 0, Date.now());

    async function check() {
      let orders: RecentOrderPing[];
      try {
        orders = await recentDemoOrders();
      } catch {
        return; // a dropped poll is retried on the next tick
      }
      if (cancelled) return;

      const at = Date.now();
      const arrivals = orders
        .filter((order) => order.fromWebsite)
        .filter((order) => {
          const created = Date.parse(order.createdAt);
          return (
            created > lastSeen &&
            created <= at + CLOCK_SLACK_MS &&
            at - created < ARRIVAL_WINDOW_MS
          );
        })
        .reverse();
      lastSeen = at;
      localStorage.setItem(storageKey, String(at));

      if (arrivals.length === 0) return;
      if (arrivals.length === 0) return;
      for (const order of arrivals) {
        notify({
          kind: "order",
          id: `order-${order.id}`,
          title: `New order ${order.orderNumber}`,
          message: `${describe(order, currencyCode)} · from the website`,
          href: `/orders/${order.id}`,
        });
      }
      router.refresh();
    }

    const run = () => {
      if (document.visibilityState === "visible") void check();
    };

    void check();
    const tick = setInterval(run, POLL_MS);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", run);
    return () => {
      cancelled = true;
      clearInterval(tick);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", run);
    };
  }, [brandCode, currencyCode, notify, router]);

  return null;
}
