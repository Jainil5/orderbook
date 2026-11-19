"use client";

import { useEffect, useRef } from "react";
import type { webOrderNotifications } from "@/lib/notifications/web-orders";
import { useNotifications } from "./notifications-context";

type Notification = ReturnType<typeof webOrderNotifications>[number];

/**
 * Puts the brand websites' online orders into the workspace bell. The list is
 * computed on the server from the demo bucket, so an order placed on
 * `/site/BR-1` shows up here — "Ananya · 3 items · ₹440 · Brewery Cafe
 * website" — and lands the merchant on the order detail.
 */
export function WebOrdersSeed({ items }: { items: Notification[] }) {
  const { seed } = useNotifications();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !items.length) return;
    done.current = true;
    seed(items);
  }, [seed, items]);

  return null;
}
