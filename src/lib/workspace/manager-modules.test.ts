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
      "leads",
      "services",
      "appointments",
      "visits",
      "schedules",
      "tasks",
    ]);
    expect(MANAGER_MODULES.every((m) => m.href.startsWith("/manager/"))).toBe(true);
  });

  it("hides only listed modules and keeps order", () => {
    const visible = visibleManagerModules(["visits", "services"]);
    expect(visible.map((m) => m.key)).toEqual([
      "staff",
      "appointments",
      "schedules",
      "tasks",
    ]);
  });

  it("shows the pipeline only to project businesses", () => {
    expect(
      visibleManagerModules([], "project").map((m) => m.key),
    ).toContain("leads");
    expect(visibleManagerModules([], "counter").map((m) => m.key)).not.toContain(
      "leads",
    );
    expect(
      visibleManagerModules(["leads"], "project").map((m) => m.key),
    ).not.toContain("leads");
  });

  it("ignores unknown keys in the hidden list", () => {
    expect(visibleManagerModules(["bogus"])).toHaveLength(
      MANAGER_MODULES.filter((m) => !m.projectOnly).length,
    );
  });

  it("validates module keys", () => {
    expect(isManagerModuleKey("staff")).toBe(true);
    expect(isManagerModuleKey("inventory")).toBe(false);
  });

  it("parses stored prefs defensively", () => {
    expect(parseHiddenManagerModules(["visits", "bogus", 3, null])).toEqual(["visits"]);
    expect(parseHiddenManagerModules(undefined)).toEqual([]);
    expect(parseHiddenManagerModules("visits")).toEqual([]);
  });
});
