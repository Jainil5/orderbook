import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getRawDemoBrandPack } from "@/lib/demo/brands/packs";

/**
 * The operations layer after the move to CSV: `loadDemoOperations` is a
 * projection of the pack, and the pack's arrays are `data/*.csv` rows. These
 * tests use a temp `OB_DATA_DIR`, so writes go to a scratch copy of the tables
 * and never into the checked-in `data/`.
 */

let tmpDir: string | null = null;
const previousDataDir = process.env.OB_DATA_DIR;

beforeEach(() => {
  vi.resetModules();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ob-operations-test-"));
  process.env.OB_DATA_DIR = tmpDir;
});

afterEach(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = null;
  if (previousDataDir === undefined) delete process.env.OB_DATA_DIR;
  else process.env.OB_DATA_DIR = previousDataDir;
});

describe("operationsFromPack", () => {
  it("projects every operations table, seeded from the fixtures", async () => {
    const { operationsFromPack } = await import("./operations-data");
    const pack = getRawDemoBrandPack("BR-1");
    const ops = operationsFromPack(pack);
    expect(ops.services.length).toBeGreaterThan(0);
    expect(ops.appointments.length).toBeGreaterThan(0);
    expect(ops.tasks.length).toBeGreaterThan(0);
    expect(ops.shifts.length).toBeGreaterThan(0);
    expect(ops.visits.length).toBeGreaterThan(0);
    expect(ops.serviceJobs.length).toBeGreaterThan(0);
  });
});

describe("loadDemoOperations", () => {
  it("reads the brand's own rows from the CSV", async () => {
    const { loadDemoOperations } = await import("./operations-data");
    for (const code of ["BR-1", "BR-2"] as const) {
      const raw = getRawDemoBrandPack(code);
      const ops = await loadDemoOperations(code);
      expect(ops.tasks.map((t) => t.id).sort()).toEqual(
        raw.tasks.map((t) => t.id).sort(),
      );
      expect(ops.tasks.every((t) => t.brand_id === raw.brand.id)).toBe(true);
    }
  });

  it("sees a row written to tasks.csv, an edit and a real delete", async () => {
    const { loadDemoOperations } = await import("./operations-data");
    const { dropBrand, saveBrand, updateBrand } = await import(
      "@/lib/csv/records"
    );
    const raw = getRawDemoBrandPack("BR-1");
    const brandId = raw.brand.id;

    // An add: the file is the only layer, so saving is enough to be read back.
    saveBrand("tasks", brandId, {
      id: "ops-test-task",
      brand_id: brandId,
      title: "Written to CSV",
      description: "",
      assigneeStaffId: null,
      customerId: null,
      priority: "medium" as const,
      dueAt: null,
      status: "open" as const,
    });
    expect(
      (await loadDemoOperations("BR-1")).tasks.find((t) => t.id === "ops-test-task")?.title,
    ).toBe("Written to CSV");

    // An edit patches the row in place — the old bucket kept a separate map.
    expect(updateBrand("tasks", brandId, "ops-test-task", { status: "done" })).toBe(true);
    expect(
      (await loadDemoOperations("BR-1")).tasks.find((t) => t.id === "ops-test-task")?.status,
    ).toBe("done");

    // A delete removes the row: no tombstone override left behind to merge.
    expect(dropBrand("tasks", brandId, "ops-test-task")).toBe(true);
    expect(
      (await loadDemoOperations("BR-1")).tasks.some((t) => t.id === "ops-test-task"),
    ).toBe(false);
    expect(fs.readFileSync(path.join(tmpDir!, "tasks.csv"), "utf8")).not.toContain(
      "ops-test-task",
    );
  });

  it("refuses another brand's row instead of editing it", async () => {
    const { dropBrand, updateBrand } = await import("@/lib/csv/records");
    const other = getRawDemoBrandPack("BR-2");
    const mine = getRawDemoBrandPack("BR-1");
    expect(updateBrand("tasks", mine.brand.id, other.tasks[0].id, { status: "done" })).toBe(
      false,
    );
    expect(dropBrand("tasks", mine.brand.id, other.tasks[0].id)).toBe(false);
  });

  it("fixture cross-links resolve for both brands", async () => {
    const { loadDemoOperations } = await import("./operations-data");
    for (const code of ["BR-1", "BR-2"] as const) {
      const pack = getRawDemoBrandPack(code);
      const ops = await loadDemoOperations(code);
      const customerIds = new Set(pack.customers.map((c) => c.id));
      const staffIds = new Set(pack.staff.map((s) => s.id));
      const serviceIds = new Set(pack.services.map((s) => s.id));
      for (const j of ops.serviceJobs) {
        expect(serviceIds.has(j.serviceId)).toBe(true);
        expect(customerIds.has(j.customerId)).toBe(true);
        for (const id of j.staffIds) expect(staffIds.has(id)).toBe(true);
      }
      for (const a of ops.appointments) {
        if (a.customerId) expect(customerIds.has(a.customerId)).toBe(true);
        for (const id of a.staffIds) expect(staffIds.has(id)).toBe(true);
      }
      for (const v of ops.visits) {
        expect(customerIds.has(v.customerId)).toBe(true);
        expect(staffIds.has(v.staffId)).toBe(true);
      }
      for (const s of ops.shifts) expect(staffIds.has(s.staffId)).toBe(true);
      for (const t of ops.tasks) {
        if (t.assigneeStaffId) expect(staffIds.has(t.assigneeStaffId)).toBe(true);
        if (t.customerId) expect(customerIds.has(t.customerId)).toBe(true);
      }
    }
  });
});
