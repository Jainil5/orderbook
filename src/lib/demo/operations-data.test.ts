import { describe, expect, it } from "vitest";
import { getDemoBrandPack } from "./brands";
import { mergeOperations } from "./operations-data";
import type { DemoMutableBucket } from "./mutable-store";

describe("mergeOperations", () => {
  it("tolerates an old cookie bucket with no ops keys", () => {
    const pack = getDemoBrandPack("BR-1");
    const oldBucket = { customers: [], offers: [], payments: [], orderPatches: {}, productOverrides: {}, auditLog: [], stockAdjustments: [], refunds: [], staff: [], staffOverrides: {} } as unknown as DemoMutableBucket;
    const ops = mergeOperations(pack, oldBucket);
    expect(ops.services.length).toBeGreaterThan(0);
    expect(ops.appointments.length).toBeGreaterThan(0);
    expect(ops.tasks.length).toBeGreaterThan(0);
  });

  it("fixture cross-links resolve for both brands", () => {
    for (const code of ["BR-1", "BR-2"] as const) {
      const pack = getDemoBrandPack(code);
      const customerIds = new Set(pack.customers.map((c) => c.id));
      const staffIds = new Set(pack.staff.map((s) => s.id));
      const serviceIds = new Set(pack.services.map((s) => s.id));
      for (const j of pack.serviceJobs) {
        expect(serviceIds.has(j.serviceId)).toBe(true);
        expect(customerIds.has(j.customerId)).toBe(true);
        for (const id of j.staffIds) expect(staffIds.has(id)).toBe(true);
      }
      for (const a of pack.appointments) {
        if (a.customerId) expect(customerIds.has(a.customerId)).toBe(true);
        for (const id of a.staffIds) expect(staffIds.has(id)).toBe(true);
      }
      for (const v of pack.visits) {
        expect(customerIds.has(v.customerId)).toBe(true);
        expect(staffIds.has(v.staffId)).toBe(true);
      }
      for (const s of pack.shifts) expect(staffIds.has(s.staffId)).toBe(true);
      for (const t of pack.tasks) {
        if (t.assigneeStaffId) expect(staffIds.has(t.assigneeStaffId)).toBe(true);
        if (t.customerId) expect(customerIds.has(t.customerId)).toBe(true);
      }
    }
  });

  it("applies tombstones from overrides", () => {
    const pack = getDemoBrandPack("BR-1");
    const bucket = { taskOverrides: { "bc-task-1": { deleted: true } } } as unknown as DemoMutableBucket;
    expect(mergeOperations(pack, bucket).tasks.some((t) => t.id === "bc-task-1")).toBe(false);
  });
});