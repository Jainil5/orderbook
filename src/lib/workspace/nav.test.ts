import { describe, expect, it } from "vitest";
import { CRM_MODULES } from "@/lib/workspace/crm-modules";
import { buildWorkspaceNavItems } from "@/lib/workspace/nav";
import { getWorkspaceProfile } from "@/lib/workspace/constants";

const profile = getWorkspaceProfile("BR-1");

describe("buildWorkspaceNavItems", () => {
  it("keeps existing flat items in order for retail mode", () => {
    const items = buildWorkspaceNavItems(false, profile);
    expect(items.map((i) => i.href)).toEqual([
      "/dashboard",
      "/billing",
      "/orders",
      "/products",
      "/manager",
      "/analytics",
      "/customers",
      "/settings",
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

  it("adds Manager with all seven children by default", () => {
    const manager = buildWorkspaceNavItems(false, profile).find(
      (i) => i.href === "/manager",
    );
    expect(manager?.iconKey).toBe("Manager");
    expect(manager?.children?.map((c) => c.href)).toEqual([
      "/manager/staff",
      "/manager/services",
      "/manager/appointments",
      "/manager/visits",
      "/manager/schedules",
      "/manager/tasks",
      "/manager/payments",
    ]);
  });

  it("nests Payments under Manager instead of the top level", () => {
    const items = buildWorkspaceNavItems(false, profile);
    expect(items.map((i) => i.href)).not.toContain("/payments");
    const payments = items
      .find((i) => i.href === "/manager")
      ?.children?.find((c) => c.href === "/manager/payments");
    expect(payments?.label).toBe("Payments");
  });

  it("adds the leads board for project businesses", () => {
    const manager = buildWorkspaceNavItems(true, getWorkspaceProfile("BR-2")).find(
      (i) => i.href === "/manager",
    );
    expect(manager?.children?.map((c) => c.href)).toContain("/manager/leads");
    expect(manager?.children).toHaveLength(8);
  });

  it("drops hidden modules from Manager children", () => {
    const manager = buildWorkspaceNavItems(false, profile, ["visits"]).find(
      (i) => i.href === "/manager",
    );
    expect(manager?.children?.some((c) => c.href === "/manager/visits")).toBe(false);
    expect(manager?.children).toHaveLength(6);
  });

  it("can hide the payments sub-module", () => {
    const manager = buildWorkspaceNavItems(false, profile, ["payments"]).find(
      (i) => i.href === "/manager",
    );
    expect(manager?.children?.some((c) => c.href === "/manager/payments")).toBe(
      false,
    );
  });

  it("gives Customers the CRM modules as children", () => {
    const customers = buildWorkspaceNavItems(false, profile).find(
      (i) => i.href === "/customers",
    );
    expect(customers?.iconKey).toBe("Customers");
    expect(customers?.children?.map((c) => c.href)).toEqual([
      "/customers/directory",
      "/customers/leads",
      "/customers/interactions",
      "/customers/reviews",
      "/customers/segments",
      "/customers/campaigns",
      "/customers/loyalty",
    ]);
  });

  it("lists only module routes under Customers, never a record", () => {
    const customers = buildWorkspaceNavItems(false, profile).find(
      (i) => i.href === "/customers",
    );
    for (const child of customers?.children ?? []) {
      expect(child.href).not.toContain("[");
      expect(CRM_MODULES.some((m) => m.href === child.href)).toBe(true);
    }
  });

  it("flat items have no children", () => {
    const items = buildWorkspaceNavItems(false, profile);
    const grouped = new Set(["/manager", "/customers"]);
    expect(items.filter((i) => !grouped.has(i.href)).every((i) => !i.children)).toBe(true);
  });
});
