"use client";

import { useEffect, useRef } from "react";
import { useNotifications } from "./notifications-context";

const MENU_ITEMS = [
  "Flat White",
  "Peri Peri Fries",
  "Cold Brew Tonic",
  "Truffle Toast",
  "Kombucha Flight",
  "Croissant Basket",
];

const TENDERS = ["UPI", "Card", "Cash"];

// Isolated demo flavour: simulates walk-in orders arriving on the demo
// workspace. Delete this component (and its mount) to remove the feed.
export function DemoIncomingOrders({ brandCode }: { brandCode: string }) {
  const { notify } = useNotifications();
  const fired = useRef(0);

  useEffect(() => {
    if (fired.current >= 5) return;
    const tick = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (fired.current >= 5) {
        clearInterval(tick);
        return;
      }
      fired.current += 1;
      const item = MENU_ITEMS[Math.floor(Math.random() * MENU_ITEMS.length)];
      const qty = 1 + Math.floor(Math.random() * 3);
      const total = 120 + Math.floor(Math.random() * 40) * qty;
      const orderNumber = `${brandCode}-9${String(
        100 + Math.floor(Math.random() * 899),
      )}`;
      notify({
        kind: "order",
        title: `New order ${orderNumber}`,
        message: `${qty} × ${item} · ₹${total} · ${
          TENDERS[Math.floor(Math.random() * TENDERS.length)]
        }`,
        href: "/orders",
      });
    }, 40000);
    return () => clearInterval(tick);
  }, [notify, brandCode]);

  return null;
}
