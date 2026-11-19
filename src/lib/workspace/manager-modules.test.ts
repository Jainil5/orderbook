import { describe, expect, it } from "vitest";
import {
  MANAGER_MODULES,
  isManagerModuleKey,
  parseHiddenManagerModules,
  visibleManagerModules,
} from "@/lib/workspace/manager-modules";

describe("manager modules", () => {
  it("registers the sub-modules in nav order", () => {
    expect(MANAGER_MODULES.map((m) => m.key)).toEqual([
      "staff",
      "meetings",
      "tasks",
      "purchasing",
      "payments",
    ]);
    expect(MANAGER_MODULES.every((m) => m.href.startsWith("/manager/"))).toBe(true);
  });

  it("hides only listed modules and keeps order", () => {
    const visible = visibleManagerModules(["meetings", "purchasing"]);
    expect(visible.map((m) => m.key)).toEqual(["staff", "tasks", "payments"]);
  });

  it("holds the pipeline in the CRM, not the Manager", () => {
    expect(MANAGER_MODULES.map((m) => m.href)).not.toContain("/manager/leads");
    expect(MANAGER_MODULES.map((m) => m.key)).not.toContain("services");
    expect(MANAGER_MODULES.map((m) => m.key)).not.toContain("schedules");
  });

  it("gives staff the rota and meetings the field visits", () => {
    expect(MANAGER_MODULES.find((m) => m.key === "staff")?.label).toBe(
      "Staff & Schedules",
    );
    expect(MANAGER_MODULES.find((m) => m.key === "meetings")?.label).toBe(
      "Meetings & Visits",
    );
  });

  it("exposes payments as a Manager sub-module for every business", () => {
    const payments = MANAGER_MODULES.find((m) => m.key === "payments");
    expect(payments?.href).toBe("/manager/payments");
    expect(visibleManagerModules([]).map((m) => m.key)).toContain("payments");
  });

  it("ignores unknown keys in the hidden list", () => {
    expect(visibleManagerModules(["bogus"])).toHaveLength(MANAGER_MODULES.length);
  });

  it("validates module keys", () => {
    expect(isManagerModuleKey("staff")).toBe(true);
    expect(isManagerModuleKey("inventory")).toBe(false);
    // Keys a browser may still have stored from an older build.
    expect(isManagerModuleKey("visits")).toBe(false);
    expect(isManagerModuleKey("schedules")).toBe(false);
  });

  it("parses stored prefs defensively", () => {
    expect(parseHiddenManagerModules(["meetings", "bogus", 3, null])).toEqual([
      "meetings",
    ]);
    expect(parseHiddenManagerModules(undefined)).toEqual([]);
    expect(parseHiddenManagerModules("meetings")).toEqual([]);
  });
});
