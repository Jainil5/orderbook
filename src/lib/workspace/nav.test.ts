import { describe, expect, it } from "vitest";
import { buildWorkspaceNavItems } from "@/lib/workspace/nav";
import { getWorkspaceProfile } from "@/lib/workspace/constants";
import type { ManagerModuleKey } from "@/lib/workspace/manager-modules";

const profile = getWorkspaceProfile("BR-1");

describe("buildWorkspaceNavItems", () => {
  it("uses the final primary navigation order", () => {
    const items = buildWorkspaceNavItems(false, profile);
    expect(items.map((i) => i.href)).toEqual([
      "/dashboard",
      "/billing",
      "/orders",
      "/manager",
      "/customers",
      "/analytics",
      "/ai",
      "/settings",
    ]);
    expect(items.map((i) => i.label)).toEqual([
      "Dashboard",
      "Billing",
      "Orders",
      "Manager",
      "Customers",
      "Analytics",
      "OrderBook AI",
      "Settings",
    ]);
  });

  it("keeps split quotation/bill items when enabled", () => {
    const items = buildWorkspaceNavItems(true, getWorkspaceProfile("BR-2"));
    expect(items.map((i) => i.href).slice(0, 4)).toEqual([
      "/dashboard",
      "/quotation",
      "/billing",
      "/orders",
    ]);
    expect(items.find((i) => i.href === "/orders")?.label).toBe("Quotes & bills");
  });

  it("moves Products and Payments out of the primary nav", () => {
    const hrefs = buildWorkspaceNavItems(true, getWorkspaceProfile("BR-2")).map(
      (i) => i.href,
    );
    expect(hrefs).not.toContain("/products");
    expect(hrefs).not.toContain("/payments");
  });

  it("lists the four managers as Manager children", () => {
    const manager = buildWorkspaceNavItems(false, profile).find(
      (i) => i.href === "/manager",
    );
    expect(manager?.iconKey).toBe("Manager");
    expect(manager?.children?.map((c) => c.href)).toEqual([
      "/manager/productivity",
      "/manager/staff",
      "/manager/products",
      "/manager/finance",
    ]);
    expect(manager?.children?.map((c) => c.label)).toEqual([
      "Productivity",
      "Staff",
      "Products",
      "Finance",
    ]);
  });

  it("hides a manager once every one of its sections is hidden", () => {
    const hidden: ManagerModuleKey[] = [
      "catalogue",
      "services",
      "inventory",
      "procurement",
      "intelligence",
    ];
    const manager = buildWorkspaceNavItems(false, profile, hidden).find(
      (i) => i.href === "/manager",
    );
    expect(manager?.children?.some((c) => c.href === "/manager/products")).toBe(
      false,
    );
    expect(manager?.children).toHaveLength(3);
  });

  it("keeps a manager visible when only some sections are hidden", () => {
    const manager = buildWorkspaceNavItems(false, profile, ["visits"]).find(
      (i) => i.href === "/manager",
    );
    expect(manager?.children?.map((c) => c.href)).toContain(
      "/manager/productivity",
    );
    expect(manager?.children).toHaveLength(4);
  });

  it("flat items have no children", () => {
    const items = buildWorkspaceNavItems(false, profile);
    expect(
      items.filter((i) => i.href !== "/manager").every((i) => !i.children),
    ).toBe(true);
  });
});
