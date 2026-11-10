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
// workspaces without any Supabase table. Delete this file (and its mount)
// to remove the seed.
const DEMO_ROWS: DemoRow[] = [
  {
    id: "demo-1",
    kind: "order",
    title: "New order BR-1-241",
    message: "3 × Flat White, 1 × Croissant Basket · ₹860 · UPI",
    href: "/orders",
    minutesAgo: 4,
  },
  {
    id: "demo-2",
    kind: "warning",
    title: "Payment overdue",
    message: "Invoice #INV-2077 · ₹12,400 is 3 days past due.",
    href: "/payments",
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
    id: "demo-4",
    kind: "order",
    title: "Kitchen ticket #92",
    message: "2 items marked unavailable and refunded at billing.",
    href: "/kitchen",
    minutesAgo: 126,
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
  {
    id: "demo-9",
    kind: "order",
    title: "Bulk order received",
    message: "12 × Croissant Basket scheduled for Saturday pickup.",
    href: "/orders",
    minutesAgo: 2900,
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
