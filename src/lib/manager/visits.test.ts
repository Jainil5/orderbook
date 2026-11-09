import { describe, expect, it } from "vitest";
import { validateVisitInput, visitTransitionError } from "./visits";
import type { FieldVisit } from "@/types/operations";

describe("validateVisitInput", () => {
  const known = { customerIds: ["c1"], staffIds: ["st1"] };
  it("accepts known customer and staff", () => {
    expect(validateVisitInput({ customerId: "c1", staffId: "st1", purpose: "Site survey" }, known).ok).toBe(true);
  });
  it("rejects empty purpose and unknown ids", () => {
    expect(validateVisitInput({ customerId: "c1", staffId: "st1", purpose: " " }, known).ok).toBe(false);
    expect(validateVisitInput({ customerId: "no", staffId: "st1", purpose: "X" }, known).ok).toBe(false);
    expect(validateVisitInput({ customerId: "c1", staffId: "no", purpose: "X" }, known).ok).toBe(false);
  });
});

describe("visitTransitionError", () => {
  const visit: FieldVisit = { id: "v", brand_id: "b", customerId: "c1", staffId: "st1", purpose: "Survey", status: "planned", checkInAt: null, checkOutAt: null, report: null };
  it("allows check-in only from planned", () => {
    expect(visitTransitionError(visit, "check_in")).toBeNull();
    expect(visitTransitionError({ ...visit, status: "checked_in" }, "check_in")).not.toBeNull();
  });
  it("requires checked_in status and a report for check-out", () => {
    expect(visitTransitionError(visit, "check_out", "done")).not.toBeNull();
    expect(visitTransitionError({ ...visit, status: "checked_in" }, "check_out", " ")).not.toBeNull();
    expect(visitTransitionError({ ...visit, status: "checked_in" }, "check_out", "Delivered unit")).toBeNull();
  });
});
