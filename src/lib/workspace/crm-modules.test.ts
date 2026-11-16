import { describe, expect, it } from "vitest";
import {
  CRM_MODULES,
  CRM_NAV_TABS,
  crmModuleByKey,
  isCrmModuleKey,
} from "@/lib/workspace/crm-modules";

describe("CRM module registry", () => {
  it("gives every module a unique key and route under /customers", () => {
    const keys = CRM_MODULES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    const hrefs = CRM_MODULES.map((m) => m.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) {
      expect(href.startsWith("/customers/")).toBe(true);
      // One static segment — no nested routes, no dynamic slots.
      expect(href.split("/")).toHaveLength(3);
    }
  });

  it("accepts only its own keys", () => {
    expect(isCrmModuleKey("campaigns")).toBe(true);
    expect(isCrmModuleKey("billing")).toBe(false);
    expect(crmModuleByKey("loyalty").href).toBe("/customers/loyalty");
  });

  it("leads the subnav with the overview and then every module", () => {
    expect(CRM_NAV_TABS[0]).toEqual({ href: "/customers", label: "Overview" });
    expect(CRM_NAV_TABS.slice(1).map((t) => t.href)).toEqual(
      CRM_MODULES.map((m) => m.href),
    );
  });

  it("describes each module in one sentence", () => {
    for (const entry of CRM_MODULES) {
      expect(entry.description.length).toBeGreaterThan(12);
      expect(entry.description).not.toMatch(/\n/);
    }
  });
});
