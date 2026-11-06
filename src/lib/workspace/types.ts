export type WorkspaceMode = "live" | "demo";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/billing", label: "Billing" },
  { href: "/orders", label: "Orders" },
  { href: "/analytics", label: "Analytics" },
  { href: "/customers", label: "Customers" },
  { href: "/payments", label: "Payments" },
  { href: "/settings", label: "Settings" },
] as const;

export function navHref(item: (typeof NAV_ITEMS)[number]): string {
  return item.href;
}
