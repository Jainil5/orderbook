import { describe, expect, it } from "vitest";
import {
  addCalendarMonths,
  createdAtRangeQuery,
  MAX_CALENDAR_DATE,
  MIN_CALENDAR_DATE,
  orderInCalendarRange,
  rangeFromPreset,
  resolveRange,
  zoneDayStartUtc,
} from "@/lib/analytics/date-range";

/**
 * 02:00 IST on Fri 6 Nov 2026 == 20:30 UTC on Thu 5 Nov. Every assertion
 * here would flip if the helpers used UTC calendar days, which is the point:
 * an Indian business's "today" starts 5.5 hours before UTC's does.
 */
const NOW = new Date("2026-11-06T02:00:00+05:30");

describe("business-timezone day boundaries", () => {
  it("maps an IST calendar day onto the UTC instants that bracket it", () => {
    expect(zoneDayStartUtc("2026-11-06")).toBe(
      new Date("2026-11-05T18:30:00.000Z").getTime(),
    );
    expect(createdAtRangeQuery("2026-11-06", "2026-11-06")).toEqual({
      dateFrom: "2026-11-05T18:30:00.000Z",
      dateTo: "2026-11-06T18:30:00.000Z",
    });
  });

  it("keeps an order placed at 00:30 IST inside the same IST day", () => {
    const createdAt = "2026-11-05T19:00:00.000Z"; // 00:30 IST on 6 Nov
    expect(
      orderInCalendarRange(createdAt, "2026-11-06", "2026-11-06"),
    ).toBe(true);
    expect(
      orderInCalendarRange(createdAt, "2026-11-05", "2026-11-05"),
    ).toBe(false);
  });

  it("treats the range end day as inclusive up to its last IST minute", () => {
    const lastInstant = "2026-11-06T18:29:59.999Z"; // 23:59:59.999 IST
    const firstExcluded = "2026-11-06T18:30:00.000Z"; // 00:00 IST on 7 Nov
    expect(
      orderInCalendarRange(lastInstant, "2026-11-06", "2026-11-06"),
    ).toBe(true);
    expect(
      orderInCalendarRange(firstExcluded, "2026-11-06", "2026-11-06"),
    ).toBe(false);
  });

  it("rejects an unparseable timestamp instead of matching it", () => {
    expect(orderInCalendarRange("not-a-date", "2026-11-06", "2026-11-06")).toBe(
      false,
    );
  });
});

describe("rangeFromPreset", () => {
  it("Today collapses to the single IST day", () => {
    expect(rangeFromPreset("today", NOW)).toEqual({
      from: "2026-11-06",
      to: "2026-11-06",
    });
  });

  it("This week is Monday-based", () => {
    expect(rangeFromPreset("week", NOW)).toEqual({
      from: "2026-11-02",
      to: "2026-11-06",
    });
  });

  it("This month and This year start on the first of the period", () => {
    expect(rangeFromPreset("month", NOW)).toEqual({
      from: "2026-11-01",
      to: "2026-11-06",
    });
    expect(rangeFromPreset("year", NOW)).toEqual({
      from: "2026-01-01",
      to: "2026-11-06",
    });
  });

  it("rolling presets include today as the last day", () => {
    expect(rangeFromPreset("7d", NOW).from).toBe("2026-10-31");
    expect(rangeFromPreset("30d", NOW).from).toBe("2026-10-08");
    expect(rangeFromPreset("90d", NOW).from).toBe("2026-08-09");
    expect(rangeFromPreset("30d", NOW).to).toBe("2026-11-06");
  });

  it("All time spans everything without dropping future rows", () => {
    expect(rangeFromPreset("all", NOW)).toEqual({
      from: MIN_CALENDAR_DATE,
      to: MAX_CALENDAR_DATE,
    });
  });

  it("resolves the year-9999 sentinel to an ISO bound instead of throwing", () => {
    // A day-boundary helper that re-parsed "9999-12-31" + 1 day would try to
    // build the calendar string "10000-01-01" and fail validation.
    const query = createdAtRangeQuery(MIN_CALENDAR_DATE, MAX_CALENDAR_DATE);
    expect(query.dateFrom).toBe("1969-12-31T18:30:00.000Z");
    expect(query.dateTo).toMatch(/^9999-12-31T18:30:00\.000Z$/);
    expect(
      orderInCalendarRange("2026-11-06T04:00:00.000Z", MIN_CALENDAR_DATE, MAX_CALENDAR_DATE),
    ).toBe(true);
  });
});

describe("addCalendarMonths", () => {
  it("clamps to the shorter month's last day", () => {
    expect(addCalendarMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addCalendarMonths("2026-05-31", -1)).toBe("2026-04-30");
  });

  it("honours leap years", () => {
    expect(addCalendarMonths("2028-03-31", -1)).toBe("2028-02-29");
    expect(addCalendarMonths("2028-02-29", -12)).toBe("2027-02-28");
  });

  it("crosses the year boundary in both directions", () => {
    expect(addCalendarMonths("2026-01-15", -3)).toBe("2025-10-15");
    expect(addCalendarMonths("2026-11-30", 3)).toBe("2027-02-28");
  });
});

describe("resolveRange", () => {
  it("prefers an explicit from/to pair and reports no preset", () => {
    const resolved = resolveRange(
      { range: "today", from: "2026-01-01", to: "2026-01-31" },
      "30d",
      NOW,
    );
    expect(resolved.preset).toBeNull();
    expect(resolved.from).toBe("2026-01-01");
    expect(resolved.to).toBe("2026-01-31");
    expect(resolved.label).toBe("2026-01-01 to 2026-01-31");
  });

  it("normalises a reversed from/to pair instead of returning nothing", () => {
    const resolved = resolveRange(
      { from: "2026-02-10", to: "2026-02-01" },
      "30d",
      NOW,
    );
    expect(resolved.from).toBe("2026-02-01");
    expect(resolved.to).toBe("2026-02-10");
  });

  it("falls back to the default preset for unknown or malformed params", () => {
    expect(resolveRange({ range: "nonsense" }, "30d", NOW).preset).toBe("30d");
    expect(resolveRange({ from: "26-1-1", to: "2026-02-01" }, "month", NOW).preset).toBe(
      "month",
    );
    expect(resolveRange({}, "month", NOW).preset).toBe("month");
  });

  it("labels presets for the page header", () => {
    expect(resolveRange({ range: "3m" }, "30d", NOW).label).toBe(
      "Last 3 months",
    );
  });
});
