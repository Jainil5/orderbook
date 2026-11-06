import type { WorkspaceProfile } from "@/lib/workspace/constants";

export type WorkspaceNavItem = {
  href: string;
  label: string;
  iconKey:
    | "Dashboard"
    | "Billing"
    | "Quotation"
    | "Bill"
    | "Orders"
    | "Products"
    | "Analytics"
    | "Customers"
    | "Payments"
    | "Settings";
};

export function buildWorkspaceNavItems(
  quotationBuilderEnabled: boolean,
  profile: WorkspaceProfile,
): WorkspaceNavItem[] {
  const label = (key: WorkspaceNavItem["iconKey"], fallback: string) =>
    profile.navLabelOverrides[fallback as keyof typeof profile.navLabelOverrides] ??
    fallback;

  const items: WorkspaceNavItem[] = [
    { href: "/dashboard", label: "Dashboard", iconKey: "Dashboard" },
  ];

  if (quotationBuilderEnabled) {
    items.push(
      {
        href: "/quotation",
        label:
          profile.billingPos.quotationCartTitle ??
          label("Quotation", "Quotation"),
        iconKey: "Quotation",
      },
      {
        href: "/billing",
        label: profile.billingPos.billCartTitle ?? profile.billingPageTitle,
        iconKey: "Bill",
      },
    );
  } else {
    items.push({
      href: "/billing",
      label: profile.billingPageTitle,
      iconKey: "Billing",
    });
  }

  items.push(
    {
      href: "/orders",
      label: profile.ordersPageTitle,
      iconKey: "Orders",
    },
    { href: "/products", label: "Products", iconKey: "Products" },
    { href: "/analytics", label: "Analytics", iconKey: "Analytics" },
    { href: "/customers", label: "Customers", iconKey: "Customers" },
    { href: "/payments", label: "Payments", iconKey: "Payments" },
    { href: "/settings", label: "Settings", iconKey: "Settings" },
  );

  return items;
}
