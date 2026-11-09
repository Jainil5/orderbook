// Pins the contract the whole manager relies on: day/time derivation follows
// the reader's zone (the demo is ₹/IST), never UTC.
process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import { dueAtMs, localDayKey, localTimeKey, toLocalInputValue } from "./time";

describe("localDayKey / localTimeKey", () => {
  it("keys the pre-05:30 IST window onto the local day", () => {
    // 2026-11-07T19:30:00Z is 01:00 IST on 8 Nov.
    const d = new Date("2026-11-07T19:30:00.000Z");
    expect(localDayKey(d)).toBe("2026-11-08");
    expect(localTimeKey(d)).toBe("01:00");
  });
  it("keys the late-evening IST window onto the local day", () => {
    // 2026-11-08T19:00:00Z is 00:30 IST on 9 Nov.
    const d = new Date("2026-11-08T19:00:00.000Z");
    expect(localDayKey(d)).toBe("2026-11-09");
    expect(localTimeKey(d)).toBe("00:30");
  });
});

describe("toLocalInputValue", () => {
  it("renders the datetime-local value in the reader's zone", () => {
    expect(toLocalInputValue("2026-11-07T19:30:00.000Z")).toBe("2026-11-08T01:00");
  });
});

describe("dueAtMs", () => {
  it("reads a bare date as the end of the local day", () => {
    expect(dueAtMs("2026-11-08")).toBe(new Date("2026-11-08T23:59:59.999+05:30").getTime());
  });
  it("keeps the instant of a full timestamp", () => {
    expect(dueAtMs("2026-11-08T12:00:00.000Z")).toBe(Date.parse("2026-11-08T12:00:00.000Z"));
  });
});
