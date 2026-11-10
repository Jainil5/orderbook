import { describe, expect, it } from "vitest";
import { formatOdometer } from "./format";

describe("formatOdometer", () => {
  it("formats plain numbers with grouping", () => {
    expect(formatOdometer(25724, { kind: "number" })).toBe("25,724");
    expect(formatOdometer(1234.5, { kind: "number" }, 1)).toBe("1,234.5");
  });

  it("formats currency without stray decimals", () => {
    expect(formatOdometer(651, { kind: "currency", currency: "INR" })).toBe(
      "₹651",
    );
    expect(
      formatOdometer(651.45, { kind: "currency", currency: "INR" }, 2),
    ).toBe("₹651.45");
  });

  it("formats percent values", () => {
    expect(formatOdometer(0.125, { kind: "percent" })).toBe("12.5%");
    expect(formatOdometer(0.5, { kind: "percent" })).toBe("50%");
  });

  it("guards against non-finite values mid-animation", () => {
    expect(formatOdometer(NaN, { kind: "number" })).toBe("–");
    expect(
      formatOdometer(Infinity, { kind: "currency", currency: "INR" }),
    ).toBe("–");
  });
});
