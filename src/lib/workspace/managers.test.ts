import { describe, expect, it } from "vitest";
import {
  ALL_MANAGER_SECTIONS,
  INDUSTRY_PRESETS,
  MANAGERS,
  getManager,
  isIndustryId,
  managerForHref,
  visibleManagers,
  visibleSections,
} from "@/lib/workspace/managers";
import { MANAGER_SECTION_KEYS } from "@/lib/workspace/manager-modules";

describe("manager registry", () => {
  it("registers exactly four managers in dashboard order", () => {
    expect(MANAGERS.map((m) => m.key)).toEqual([
      "productivity",
      "staff",
      "products",
      "finance",
    ]);
    expect(MANAGERS.map((m) => m.href)).toEqual([
      "/manager/productivity",
      "/manager/staff",
      "/manager/products",
      "/manager/finance",
    ]);
  });

  it("keeps section hrefs nested inside their manager and unique overall", () => {
    for (const manager of MANAGERS) {
      for (const section of manager.sections) {
        expect(section.href.startsWith(`${manager.href}/`)).toBe(true);
      }
    }
    const keys = ALL_MANAGER_SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const hrefs = ALL_MANAGER_SECTIONS.map((s) => s.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("stays in step with the visibility keys stored in prefs", () => {
    expect([...ALL_MANAGER_SECTIONS.map((s) => s.key)].sort()).toEqual(
      [...MANAGER_SECTION_KEYS].sort(),
    );
  });

  it("separates work from people", () => {
    const productivity = getManager("productivity").sections.map((s) => s.key);
    const staff = getManager("staff").sections.map((s) => s.key);
    expect(productivity).toContain("tasks");
    expect(productivity).toContain("calendar");
    expect(staff).toContain("schedules");
    expect(staff).toContain("attendance");
    expect(productivity.some((k) => staff.includes(k))).toBe(false);
  });

  it("resolves a manager from a nested pathname", () => {
    expect(managerForHref("/manager/finance/expenses")?.key).toBe("finance");
    expect(managerForHref("/manager")?.key).toBeUndefined();
    expect(managerForHref("/billing")?.key).toBeUndefined();
  });

  it("drops hidden sections and fully hidden managers", () => {
    expect(visibleSections("finance", ["refunds"]).map((s) => s.key)).not.toContain(
      "refunds",
    );
    const hidden = ["tasks", "notes", "calendar", "appointments", "visits", "integrations"];
    expect(
      visibleManagers(hidden).map((m) => m.key),
    ).toEqual(["staff", "products", "finance"]);
  });

  it("only hides real sections through industry presets", () => {
    for (const preset of INDUSTRY_PRESETS) {
      for (const key of preset.hiddenSections) {
        expect(ALL_MANAGER_SECTIONS.some((s) => s.key === key)).toBe(true);
      }
    }
    expect(isIndustryId("salon_spa")).toBe(true);
    expect(isIndustryId("warehouse")).toBe(false);
  });
});
