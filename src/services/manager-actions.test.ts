// Staff overrides are keyed by id in the demo cookie bucket, so an id that no
// longer resolves must not be answered with a silent success.
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    map,
    get(name: string) {
      const value = map.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string) {
      map.set(name, value);
    },
    delete(name: string) {
      map.delete(name);
    },
  };
});

vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { readDemoMutableBucket } from "@/lib/demo/mutable-store";
import {
  setStaffAvailabilityAction,
  setStaffStatusAction,
  updateStaffAction,
} from "./manager-actions";

const input = { name: "Ravi Kumar", role: "cashier", phone: "9876500000", email: "" };

describe("existence guards on staff actions", () => {
  beforeEach(() => {
    jar.map.clear();
  });

  const cases: { desc: string; run: (id: string) => Promise<{ ok: boolean; message?: string }> }[] = [
    { desc: "update a staff record", run: (id) => updateStaffAction(id, input) },
    { desc: "change availability", run: (id) => setStaffAvailabilityAction(id, "busy") },
    { desc: "change status", run: (id) => setStaffStatusAction(id, "inactive") },
  ];

  for (const { desc, run } of cases) {
    it(`rejects an unknown id asked to ${desc}`, async () => {
      expect(await run("ghost-id")).toEqual({ ok: false, message: "Staff member not found." });
      expect(await readDemoMutableBucket("BR-1")).toMatchObject({ staffOverrides: {} });
    });

    it(`still allows ${desc} for a fixture staff member`, async () => {
      expect(await run("bc-staff-1")).toEqual({ ok: true });
      expect(Object.keys((await readDemoMutableBucket("BR-1")).staffOverrides)).toEqual([
        "bc-staff-1",
      ]);
    });
  }
});
