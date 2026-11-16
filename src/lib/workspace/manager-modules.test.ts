import { describe, expect, it } from "vitest";
import {
  MANAGER_SECTION_KEYS,
  asSectionKey,
  isManagerModuleKey,
  parseHiddenManagerModules,
  visibleManagerSections,
} from "@/lib/workspace/manager-modules";

describe("manager section visibility keys", () => {
  it("covers every section in the Manager registry, with no duplicates", () => {
    expect(new Set(MANAGER_SECTION_KEYS).size).toBe(MANAGER_SECTION_KEYS.length);
    expect([...MANAGER_SECTION_KEYS].sort()).toEqual(
      visibleManagerSections([])
        .map((s) => s.key)
        .sort(),
    );
  });

  it("keeps the keys that older saved prefs already use", () => {
    for (const legacy of ["staff", "services", "appointments", "visits", "schedules", "tasks"]) {
      expect(isManagerModuleKey(legacy)).toBe(true);
    }
  });

  it("accepts the new platform sections", () => {
    for (const key of ["notes", "calendar", "attendance", "inventory", "expenses", "cash"]) {
      expect(isManagerModuleKey(key)).toBe(true);
    }
  });

  it("hides only listed sections and keeps registry order", () => {
    const visible = visibleManagerSections(["visits", "services"]);
    expect(visible.map((s) => s.key)).not.toContain("visits");
    expect(visible.map((s) => s.key)).not.toContain("services");
    expect(visible).toHaveLength(MANAGER_SECTION_KEYS.length - 2);
  });

  it("ignores unknown keys in the hidden list", () => {
    expect(visibleManagerSections(["bogus"])).toHaveLength(
      MANAGER_SECTION_KEYS.length,
    );
  });

  it("narrows registry keys for the settings toggles", () => {
    expect(asSectionKey("expenses")).toBe("expenses");
    expect(asSectionKey("not-a-section")).toBeNull();
  });

  it("parses stored prefs defensively", () => {
    expect(parseHiddenManagerModules(["visits", "bogus", 3, null])).toEqual([
      "visits",
    ]);
    expect(parseHiddenManagerModules(undefined)).toEqual([]);
    expect(parseHiddenManagerModules("visits")).toEqual([]);
  });
});
