import { describe, expect, it } from "vitest";
import { getDemoBrandPack } from "@/lib/demo/brands";
import {
  DEFAULT_WORKING_HOURS,
  WEEKDAY_ORDER,
  hoursRows,
  nextOpenWindow,
  openStateAt,
  parseWorkingHours,
  validateWorkingHours,
  workingHoursToJson,
  type WorkingHours,
} from "./working-hours";
import { seedWorkingHours } from "./resolve";

/** Week of Mon 16 – Sun 22 Nov 2026, so every fixture names its own weekday. */
const DAY_OF_MONTH = { mon: 16, tue: 17, wed: 18, thu: 19, fri: 20, sat: 21, sun: 22 } as const;

function at(day: keyof typeof DAY_OF_MONTH, hours: number, minutes = 0): Date {
  return new Date(2026, 10, DAY_OF_MONTH[day], hours, minutes, 0, 0);
}

function week(overrides: Partial<WorkingHours>): WorkingHours {
  return { ...DEFAULT_WORKING_HOURS, ...overrides };
}

const ALL_CLOSED: WorkingHours = Object.fromEntries(
  WEEKDAY_ORDER.map((day) => [day, null]),
) as WorkingHours;

/** The week the shipped BR-2 pack carries: a workshop open Mon–Sat, shut Sundays. */
const WORKSHOP: WorkingHours = {
  mon: { open: "10:00", close: "19:00" },
  tue: { open: "10:00", close: "19:00" },
  wed: { open: "10:00", close: "19:00" },
  thu: { open: "10:00", close: "19:00" },
  fri: { open: "10:00", close: "19:00" },
  sat: { open: "10:00", close: "19:00" },
  sun: null,
};

describe("WEEKDAY_ORDER", () => {
  it("is a Monday-first seven-day week", () => {
    expect(WEEKDAY_ORDER).toHaveLength(7);
    expect([...WEEKDAY_ORDER]).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  });
});

describe("workingHoursToJson / parseWorkingHours", () => {
  it("round-trips the default week through the JSON text a CSV cell holds", () => {
    const text = workingHoursToJson(DEFAULT_WORKING_HOURS);
    expect(parseWorkingHours(text)).toEqual(DEFAULT_WORKING_HOURS);
    expect(text.startsWith('{"mon"')).toBe(true);
  });

  it("reads a plain object and normalizes unpadded hours", () => {
    const parsed = parseWorkingHours(week({ mon: { open: "7:00", close: "16:00" } }));
    expect(parsed?.mon).toEqual({ open: "07:00", close: "16:00" });
  });

  it("keeps a closed day as null and allows a whole closed week", () => {
    expect(parseWorkingHours(week({ sun: null }))?.sun).toBeNull();
    expect(parseWorkingHours(ALL_CLOSED)).toEqual(ALL_CLOSED);
  });

  it("returns null for anything unusable", () => {
    for (const raw of [null, undefined, 42, "not json", "", [], {}, { mon: null }]) {
      expect(parseWorkingHours(raw), String(raw)).toBeNull();
    }
  });
});

describe("validateWorkingHours", () => {
  it("accepts the seed JSON text the packs ship", () => {
    const result = validateWorkingHours(getDemoBrandPack("BR-1").settings.working_hours_json);
    expect(result.ok).toBe(true);
  });

  it("rejects a clock outside 00:00–23:59", () => {
    for (const bad of ["24:00", "07:60", "7", "7:5", "half past six", "0700"]) {
      const result = validateWorkingHours(week({ fri: { open: bad, close: "17:00" } }));
      expect(result.ok, bad).toBe(false);
      if (!result.ok) expect(result.message).toContain("Friday");
    }
  });

  it("rejects a window that closes at or before it opens, naming the day", () => {
    const before = validateWorkingHours(week({ wed: { open: "07:00", close: "06:30" } }));
    expect(before.ok).toBe(false);
    if (!before.ok) expect(before.message).toContain("Wednesday");

    const same = validateWorkingHours(week({ sun: { open: "08:00", close: "08:00" } }));
    expect(same.ok).toBe(false);
    if (!same.ok) expect(same.message).toContain("Sunday");
  });

  it("rejects input that is not a seven-day object", () => {
    for (const raw of [null, [], "coffee", 42, { mon: { open: "07:00", close: "16:00" } }]) {
      expect(validateWorkingHours(raw).ok).toBe(false);
    }
    const missing = validateWorkingHours({
      ...ALL_CLOSED,
      sat: undefined,
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.message).toContain("Saturday");
  });

  it("returns the normalized week when it is usable", () => {
    const result = validateWorkingHours(week({ tue: { open: "9:30", close: "17:00" } }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tue).toEqual({ open: "09:30", close: "17:00" });
  });
});

describe("openStateAt", () => {
  it("says closed before the doors open, with the instant they open", () => {
    const state = openStateAt(DEFAULT_WORKING_HOURS, at("mon", 6, 30));
    expect(state.status).toBe("closed");
    expect(state.pill).toBe("Closed");
    expect(state.label).toBe("Closed · opens 7:00 Mon");
    expect(state.opensAt).toEqual(at("mon", 7));
    expect(state.closesAt).toBeNull();
  });

  it("is open in the middle of the window", () => {
    const state = openStateAt(DEFAULT_WORKING_HOURS, at("mon", 9, 30));
    expect(state.status).toBe("open");
    expect(state.pill).toBe("Open now");
    expect(state.label).toBe("Open until 16:00");
    expect(state.opensAt).toEqual(at("mon", 7));
    expect(state.closesAt).toEqual(at("mon", 16));
  });

  it("flips to closing soon inside the last hour", () => {
    const state = openStateAt(DEFAULT_WORKING_HOURS, at("mon", 15, 30));
    expect(state.status).toBe("closing_soon");
    expect(state.pill).toBe("Closing soon");
    expect(state.label).toContain("16:00");
    expect(state.closesAt).toEqual(at("mon", 16));
  });

  it("honours a custom closing-soon window", () => {
    expect(openStateAt(DEFAULT_WORKING_HOURS, at("mon", 14), { closingSoonMinutes: 120 }).status)
      .toBe("closing_soon");
    expect(openStateAt(DEFAULT_WORKING_HOURS, at("mon", 15, 30), { closingSoonMinutes: 0 }).status)
      .toBe("open");
  });

  it("is closed at the closing minute itself, pointing at the next day", () => {
    const state = openStateAt(DEFAULT_WORKING_HOURS, at("mon", 16));
    expect(state.status).toBe("closed");
    expect(state.label).toBe("Closed · opens 7:00 Tue");
    expect(state.opensAt).toEqual(at("tue", 7));
  });

  it("reads a closed day as the next open day", () => {
    const state = openStateAt(WORKSHOP, at("sun", 12));
    expect(state.status).toBe("closed");
    expect(state.label).toBe("Closed · opens 10:00 Mon");
    expect(state.opensAt).toEqual(new Date(2026, 10, 23, 10, 0, 0, 0));
  });

  it("has nothing to promise for a fully closed week", () => {
    const state = openStateAt(ALL_CLOSED, at("wed", 12));
    expect(state.status).toBe("closed");
    expect(state.pill).toBe("Closed");
    expect(state.label).toBe("Closed");
    expect(state.opensAt).toBeNull();
    expect(state.closesAt).toBeNull();
  });

  it("keeps a paused counter separate from an empty schedule", () => {
    const paused = openStateAt(DEFAULT_WORKING_HOURS, at("mon", 9), { paused: true });
    expect(paused.status).toBe("closed");
    expect(paused.pill).toBe("Closed");
    expect(paused.label).toBe("Not taking orders right now");
    expect(paused.opensAt).toBeNull();
    expect(paused.closesAt).toBeNull();

    const outsideHours = openStateAt(DEFAULT_WORKING_HOURS, at("mon", 5), { paused: true });
    expect(outsideHours.label).toBe("Not taking orders right now");
  });
});

describe("hoursRows", () => {
  it("groups the default week exactly like the printed cafe hours", () => {
    expect(hoursRows(DEFAULT_WORKING_HOURS)).toEqual([
      { days: "Mon–Thu", time: "7:00 – 16:00" },
      { days: "Friday", time: "7:00 – 17:00" },
      { days: "Sat–Sun", time: "8:00 – 17:00" },
    ]);
  });

  it("prints a lone closed day on its own line", () => {
    expect(hoursRows(WORKSHOP)).toEqual([
      { days: "Mon–Sat", time: "10:00 – 19:00" },
      { days: "Sunday", time: "Closed" },
    ]);
    expect(hoursRows(week({ wed: null }))).toEqual([
      { days: "Mon–Tue", time: "7:00 – 16:00" },
      { days: "Wednesday", time: "Closed" },
      { days: "Thursday", time: "7:00 – 16:00" },
      { days: "Friday", time: "7:00 – 17:00" },
      { days: "Sat–Sun", time: "8:00 – 17:00" },
    ]);
  });

  it("collapses a week that never opens into one closed line", () => {
    expect(hoursRows(ALL_CLOSED)).toEqual([{ days: "Mon–Sun", time: "Closed" }]);
  });
});

describe("nextOpenWindow", () => {
  it("finds a window still to open today", () => {
    const next = nextOpenWindow(DEFAULT_WORKING_HOURS, at("mon", 6, 59));
    expect(next).not.toBeNull();
    expect(next?.day).toBe("mon");
    expect(next?.open).toBe("07:00");
    expect(next?.date).toEqual(at("mon", 7));
  });

  it("skips ahead while a window is open", () => {
    expect(nextOpenWindow(DEFAULT_WORKING_HOURS, at("mon", 9))?.day).toBe("tue");
  });

  it("rolls into next week after the last day of the week", () => {
    const next = nextOpenWindow(DEFAULT_WORKING_HOURS, at("sun", 18));
    expect(next?.day).toBe("mon");
    expect(next?.date).toEqual(new Date(2026, 10, 23, 7, 0, 0, 0));
  });

  it("comes back a week later for a single-day business", () => {
    const mondaysOnly: WorkingHours = { ...ALL_CLOSED, mon: { open: "09:00", close: "12:00" } };
    const next = nextOpenWindow(mondaysOnly, at("mon", 13));
    expect(next?.day).toBe("mon");
    expect(next?.date).toEqual(new Date(2026, 10, 23, 9, 0, 0, 0));
  });

  it("is null when nothing ever opens", () => {
    expect(nextOpenWindow(ALL_CLOSED, at("tue", 9))).toBeNull();
  });
});

describe("seeded packs", () => {
  it("ships Brewery Cafe hours in the CSV, equal to the default week", () => {
    const csv = getDemoBrandPack("BR-1").settings.working_hours_json;
    expect(csv).toBe(workingHoursToJson(DEFAULT_WORKING_HOURS));
    expect(parseWorkingHours(csv)).toEqual(DEFAULT_WORKING_HOURS);
    expect(seedWorkingHours("BR-1")).toEqual(DEFAULT_WORKING_HOURS);
  });

  it("ships a workshop week for Cubig, beating the built-in default", () => {
    expect(getDemoBrandPack("BR-2").settings.working_hours_json).toBeDefined();
    expect(seedWorkingHours("BR-2")).toEqual(WORKSHOP);
    expect(seedWorkingHours("BR-2")).not.toEqual(DEFAULT_WORKING_HOURS);
    expect(seedWorkingHours("BR-2").sun).toBeNull();
  });

  it("falls back to the default week for a brand the demo does not have", () => {
    expect(seedWorkingHours("BR-9")).toEqual(DEFAULT_WORKING_HOURS);
  });
});
