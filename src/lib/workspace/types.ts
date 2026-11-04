import type { Brand, BrandMember, BrandRole, BrandSettings } from "@/types/database";

export type WorkspaceMode = "live" | "demo";

export type WorkspaceContextValue = {
  mode: WorkspaceMode;
  brand: Brand;
  settings: BrandSettings;
  role: BrandRole | "demo";
  readOnly: boolean;
  userEmail?: string | null;
};

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", demoHref: "/demo/dashboard" },
  { href: "/billing", label: "Billing", demoHref: "/demo/billing" },
  { href: "/orders", label: "Orders", demoHref: "/demo/orders" },
  { href: "/products", label: "Products", demoHref: "/demo/products" },
  { href: "/analytics", label: "Analytics", demoHref: "/demo/analytics" },
  { href: "/offers", label: "Offers", demoHref: "/demo/offers" },
  { href: "/customers", label: "Customers", demoHref: "/demo/customers" },
  { href: "/payments", label: "Payments", demoHref: "/demo/payments" },
  { href: "/settings", label: "Settings", demoHref: "/demo/settings" },
] as const;

export function navHref(
  item: (typeof NAV_ITEMS)[number],
  mode: WorkspaceMode,
): string {
  return mode === "demo" ? item.demoHref : item.href;
}
