import type { ObNotification, ObNotificationKind } from "@/components/notifications/reducer";

type DemoRow = {
  id: string;
  kind: ObNotificationKind;
  title: string;
  message?: string;
  href?: string;
  minutesAgo: number;
  read?: boolean;
};

// Repo-only demo feed: the notification bell gets rich content in demo
// workspaces without any backend table. Delete this file (and its mount)
// to remove the seed.
//
// No rows here claim an order number: those come from `NewOrderAlerts`, which
// reads the real store, so the bell never points at an order that does not exist.
const DEMO_ROWS: DemoRow[] = [
  {
    id: "demo-2",
    kind: "warning",
    title: "Payment overdue",
    message: "Invoice #INV-2077 · ₹12,400 is 3 days past due.",
    href: "/manager/payments",
    minutesAgo: 18,
  },
  {
    id: "demo-3",
    kind: "success",
    title: "Evening rush cleared",
    message: "14 orders served in the last hour · avg ticket ₹540.",
    href: "/kitchen",
    minutesAgo: 52,
  },
  {
    id: "demo-5",
    kind: "info",
    title: "Low stock alert",
    message: "Cold Brew Concentrate — 3 units left at counter.",
    href: "/products",
    minutesAgo: 305,
  },
  {
    id: "demo-6",
    kind: "success",
    title: "Quote Q-118 accepted",
    message: "Cubig Furniture · ₹86,500 · convert to order when ready.",
    href: "/quotation",
    minutesAgo: 480,
  },
  {
    id: "demo-7",
    kind: "info",
    title: "Weekly report ready",
    message: "Revenue up 12% vs the previous week. Tap to review.",
    href: "/analytics",
    minutesAgo: 1500,
    read: true,
  },
  {
    id: "demo-8",
    kind: "warning",
    title: "Staffing gap",
    message: "2 staff off duty during the 6–9 PM peak yesterday.",
    href: "/manager",
    minutesAgo: 1620,
    read: true,
  },
];

export function buildDemoNotifications(now: number): ObNotification[] {
  return DEMO_ROWS.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    message: row.message,
    href: row.href,
    createdAt: now - row.minutesAgo * 60_000,
    read: row.read ?? false,
  }));
}
