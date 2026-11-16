import type { WorkspaceProfile } from "@/lib/workspace/constants";
import { crmNavChildren } from "@/lib/workspace/crm-nav";
import { visibleManagers } from "@/lib/workspace/managers";
import type { ManagerModuleKey } from "@/lib/workspace/manager-modules";

export type WorkspaceNavChild = { href: string; label: string };

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
    | "Manager"
    | "Analytics"
    | "Customers"
    | "Payments"
    | "AI"
    | "Settings";
  children?: WorkspaceNavChild[];
};

export function buildWorkspaceNavItems(
  quotationBuilderEnabled: boolean,
  profile: WorkspaceProfile,
  hiddenManagerModules: readonly ManagerModuleKey[] = [],
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
    {
      href: "/manager",
      label: "Manager",
      iconKey: "Manager",
      children: visibleManagers(hiddenManagerModules).map((m) => ({
        href: m.href,
        label: m.shortLabel,
      })),
    },
    {
      href: "/customers",
      label: "Customers",
      iconKey: "Customers",
      // The CRM lives here: overview plus one route per section.
      children: crmNavChildren(),
    },
    { href: "/analytics", label: "Analytics", iconKey: "Analytics" },
    { href: "/ai", label: "OrderBook AI", iconKey: "AI" },
    { href: "/settings", label: "Settings", iconKey: "Settings" },
  );

  return items;
}
