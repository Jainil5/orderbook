import { describe, expect, it } from "vitest";
import {
  mergeStaff,
  staffAvailabilitySummary,
  validateStaffInput,
} from "@/lib/manager/staff";
import type { StaffMember } from "@/types/manager";

const member = (over: Partial<StaffMember> = {}): StaffMember => ({
  id: "s1",
  brand_id: "demo-brewery-cafe",
  name: "Asha",
  role: "cashier",
  phone: null,
  email: null,
  status: "active",
  availability: "available",
  created_at: "2026-11-01T00:00:00.000Z",
  ...over,
});

describe("validateStaffInput", () => {
  it("trims and normalizes a valid input", () => {
    const result = validateStaffInput({
      name: "  Asha  ",
      role: "cashier",
      phone: " 9876543210 ",
      email: "",
    });
    expect(result).toEqual({
      ok: true,
      value: { name: "Asha", role: "cashier", phone: "9876543210", email: null },
    });
  });

  it("rejects empty names and unknown roles", () => {
    expect(validateStaffInput({ name: " ", role: "cashier" }).ok).toBe(false);
    expect(validateStaffInput({ name: "Asha", role: "astronaut" }).ok).toBe(false);
  });

  it("caps name length", () => {
    const result = validateStaffInput({ name: "x".repeat(300), role: "other" });
    expect(result.ok && result.value.name.length).toBe(120);
  });
});

describe("mergeStaff", () => {
  it("appends additions, applies overrides, sorts by name", () => {
    const merged = mergeStaff(
      [member()],
      [member({ id: "s2", name: "Balu" })],
      { s1: { availability: "busy" } },
    );
    expect(merged.map((m) => m.name)).toEqual(["Asha", "Balu"]);
    expect(merged[0].availability).toBe("busy");
  });

  it("ignores overrides for unknown ids", () => {
    expect(mergeStaff([member()], [], { ghost: { name: "No" } })).toHaveLength(1);
  });
});

describe("staffAvailabilitySummary", () => {
  it("counts only active staff", () => {
    const summary = staffAvailabilitySummary([
      member(),
      member({ id: "s2", availability: "busy" }),
      member({ id: "s3", availability: "off" }),
      member({ id: "s4", status: "inactive" }),
    ]);
    expect(summary).toEqual({ active: 3, available: 1, busy: 1, off: 1 });
  });
});
