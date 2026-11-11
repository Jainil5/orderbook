import { describe, expect, it } from "vitest";
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
      "/payments",
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

  it("adds Manager with all six children by default", () => {
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
    ]);
  });

  it("adds the leads board for project businesses", () => {
    const manager = buildWorkspaceNavItems(true, getWorkspaceProfile("BR-2")).find(
      (i) => i.href === "/manager",
    );
    expect(manager?.children?.map((c) => c.href)).toContain("/manager/leads");
    expect(manager?.children).toHaveLength(7);
  });

  it("drops hidden modules from Manager children", () => {
    const manager = buildWorkspaceNavItems(false, profile, ["visits"]).find(
      (i) => i.href === "/manager",
    );
    expect(manager?.children?.some((c) => c.href === "/manager/visits")).toBe(false);
    expect(manager?.children).toHaveLength(5);
  });

  it("flat items have no children", () => {
    const items = buildWorkspaceNavItems(false, profile);
    expect(items.filter((i) => i.href !== "/manager").every((i) => !i.children)).toBe(true);
  });
});
