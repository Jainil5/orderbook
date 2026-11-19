// The demo cookie jar is the only store these server actions touch, so the
// guards can be exercised exactly as the browser hits them.
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
  deleteAppointmentAction,
  deleteShiftAction,
  deleteTaskAction,
  deleteVisitAction,
  setTaskStatusAction,
} from "./manager-ops-actions";

// Fixture rows shipped in the BR-1 brand pack.
const cases: {
  label: string;
  id: string;
  message: string;
  overridesKey:
    | "appointmentOverrides"
    | "taskOverrides"
    | "shiftOverrides"
    | "visitOverrides";
  remove: (id: string) => Promise<{ ok: boolean; message?: string }>;
}[] = [
  { label: "appointment", id: "bc-apt-1", message: "Appointment not found.", overridesKey: "appointmentOverrides", remove: deleteAppointmentAction },
  { label: "task", id: "bc-task-1", message: "Task not found.", overridesKey: "taskOverrides", remove: deleteTaskAction },
  { label: "shift", id: "bc-shift-1", message: "Shift not found.", overridesKey: "shiftOverrides", remove: deleteShiftAction },
  { label: "visit", id: "bc-visit-1", message: "Visit not found.", overridesKey: "visitOverrides", remove: deleteVisitAction },
];

describe("existence guards on destructive ops actions", () => {
  beforeEach(() => {
    jar.map.clear();
  });

  for (const { label, id, message, overridesKey, remove } of cases) {
    it(`refuses to tombstone an unknown ${label}`, async () => {
      expect(await remove("ghost-id")).toEqual({ ok: false, message });
      // No ghost `{ deleted: true }` entry is left behind in the bucket.
      expect(await readDemoMutableBucket("BR-1")).toMatchObject({ [overridesKey]: {} });
    });

    it(`reports a stale ${label} row as gone on the second delete`, async () => {
      expect(await remove(id)).toEqual({ ok: true });
      expect(await remove(id)).toEqual({ ok: false, message });
    });
  }

  it("refuses to move a task that does not exist through the board", async () => {
    expect(await setTaskStatusAction("ghost-id", "done")).toEqual({
      ok: false,
      message: "Task not found.",
    });
    expect(await readDemoMutableBucket("BR-1")).toMatchObject({ taskOverrides: {} });
  });
});
