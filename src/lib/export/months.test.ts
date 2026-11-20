import { describe, expect, it } from "vitest";
import {
  filterByMonths,
  isMonthKey,
  monthKey,
  monthLabel,
  orderDateValue,
  summarizeMonths,
  type MonthBucket,
} from "./months";

// Dates built from local components (or timestamp strings with no zone) keep
// these assertions true in every host zone — same reasoning as
// `src/lib/manager/time.ts`. Anything with an explicit `Z` would only land in
// one month for some readers, so it is not asserted here.

type Row = { at: string | Date | null; total: number };

const rows: Row[] = [
  { at: "2026-11-15T10:00:00", total: 100 },
  { at: "2026-11-02T18:30:00", total: 250.5 },
  { at: "2026-10-28T09:00:00", total: 50 },
  { at: "2026-09-05T12:00:00", total: 10 },
];

describe("monthKey", () => {
  it("buckets an ISO timestamp by its local month", () => {
    expect(monthKey("2026-11-15T10:00:00")).toBe("2026-11");
    expect(monthKey(new Date(2026, 10, 15, 10, 0, 0))).toBe("2026-11");
    expect(monthKey("2026-09-30T23:59:00")).toBe("2026-09");
  });

  it("reads a YYYY-MM-DD day key without re-parsing it", () => {
    expect(monthKey("2026-11-05")).toBe("2026-11");
    expect(monthKey("2026-01-01")).toBe("2026-01");
    // A bare month key is already the answer, so it round-trips.
    expect(monthKey("2026-11")).toBe("2026-11");
  });

  it("returns null for invalid, empty and missing values", () => {
    expect(monthKey(null)).toBeNull();
    expect(monthKey(undefined)).toBeNull();
    expect(monthKey("")).toBeNull();
    expect(monthKey("   ")).toBeNull();
    expect(monthKey("not a date")).toBeNull();
    expect(monthKey("2026-13-01")).toBeNull();
    expect(monthKey(new Date(NaN))).toBeNull();
  });
});

describe("monthLabel", () => {
  it("renders a picker label", () => {
    expect(monthLabel("2026-11")).toBe("Nov 2026");
    expect(monthLabel("2026-01")).toBe("Jan 2026");
    expect(monthLabel("2026-12")).toBe("Dec 2026");
  });

  it("passes a malformed key through rather than guessing", () => {
    expect(monthLabel("2026-13")).toBe("2026-13");
  });
});

describe("isMonthKey", () => {
  it("accepts real months only", () => {
    expect(isMonthKey("2026-11")).toBe(true);
    expect(isMonthKey("2026-01")).toBe(true);
    expect(isMonthKey("2026-12")).toBe(true);
  });

  it("rejects out-of-range and malformed keys", () => {
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-00")).toBe(false);
    expect(isMonthKey("2026-1")).toBe(false);
    expect(isMonthKey("26-11")).toBe(false);
    expect(isMonthKey("2026-11-05")).toBe(false);
    expect(isMonthKey("")).toBe(false);
  });
});

describe("summarizeMonths", () => {
  it("counts and totals per month, newest first", () => {
    const buckets = summarizeMonths(rows, {
      dateOf: (row) => row.at,
      amountOf: (row) => row.total,
    });
    expect(buckets).toEqual<MonthBucket[]>([
      { key: "2026-11", label: "Nov 2026", count: 2, amount: 350.5 },
      { key: "2026-10", label: "Oct 2026", count: 1, amount: 50 },
      { key: "2026-09", label: "Sep 2026", count: 1, amount: 10 },
    ]);
  });

  it("skips undated rows and defaults the amount to zero", () => {
    const buckets = summarizeMonths(
      [
        ...rows,
        { at: null, total: 999 },
        { at: "", total: 999 },
        { at: "nonsense", total: 999 },
      ],
      { dateOf: (row) => row.at },
    );
    expect(buckets.map((b) => [b.key, b.count, b.amount])).toEqual([
      ["2026-11", 2, 0],
      ["2026-10", 1, 0],
      ["2026-09", 1, 0],
    ]);
  });

  it("keeps only the newest `limit` months", () => {
    const many: Row[] = [
      ...Array.from({ length: 6 }, (_, index) => ({
        // 2026-01 .. 2026-06, one row each.
        at: `2026-0${index + 1}-10T09:00:00`,
        total: index + 1,
      })),
      { at: "2026-06-20T09:00:00", total: 100 },
    ];
    const capped = summarizeMonths(many, {
      dateOf: (row) => row.at,
      amountOf: (row) => row.total,
      limit: 2,
    });
    expect(capped).toEqual<MonthBucket[]>([
      { key: "2026-06", label: "Jun 2026", count: 2, amount: 106 },
      { key: "2026-05", label: "May 2026", count: 1, amount: 5 },
    ]);
  });

  it("defaults to the last 24 months", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({
      // 2024-01 .. 2026-06, 30 distinct months.
      at: `${2024 + Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-10`,
      total: 1,
    }));
    const buckets = summarizeMonths(many, { dateOf: (row) => row.at });
    expect(buckets).toHaveLength(24);
    expect(buckets[0]?.key).toBe("2026-06");
    expect(buckets[23]?.key).toBe("2024-07");
  });

  it("returns nothing for an empty or fully undated set", () => {
    expect(summarizeMonths([], { dateOf: (row: Row) => row.at })).toEqual([]);
  });
});

describe("filterByMonths", () => {
  it("keeps rows from every selected month", () => {
    expect(
      filterByMonths(rows, (row) => row.at, ["2026-11", "2026-09"]).map(
        (row) => row.total,
      ),
    ).toEqual([100, 250.5, 10]);
  });

  it("returns nothing when no month is selected", () => {
    expect(filterByMonths(rows, (row) => row.at, [])).toEqual([]);
  });

  it("drops undated rows and unselected months", () => {
    const mixed: Row[] = [...rows, { at: null, total: 7 }, { at: "oops", total: 7 }];
    const kept = filterByMonths(mixed, (row) => row.at, ["2026-10", "2026-13"]);
    expect(kept).toEqual([{ at: "2026-10-28T09:00:00", total: 50 }]);
  });

  it("matches a service day key against the same month as a timestamp", () => {
    const bills = [
      { at: "2026-11-30", total: 1 },
      { at: "2026-12-01T08:00:00", total: 2 },
    ];
    expect(
      filterByMonths(bills, (row) => row.at, ["2026-11"]).map((row) => row.total),
    ).toEqual([1]);
  });
});

describe("orderDateValue", () => {
  it("prefers the service day over the created timestamp", () => {
    expect(
      orderDateValue({ service_date: "2026-11-01", created_at: "2026-12-20T09:00:00" }),
    ).toBe("2026-11-01");
  });

  it("falls back to created_at when there is no service day", () => {
    expect(orderDateValue({ created_at: "2026-11-12T09:40:00" })).toBe(
      "2026-11-12T09:40:00",
    );
    expect(
      orderDateValue({ service_date: null, created_at: "2026-11-12T09:40:00" }),
    ).toBe("2026-11-12T09:40:00");
    // Demo CSV blanks arrive as empty strings, not null.
    expect(
      orderDateValue({ service_date: "", created_at: "2026-11-12T09:40:00" }),
    ).toBe("2026-11-12T09:40:00");
  });
});
