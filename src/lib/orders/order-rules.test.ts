import { describe, expect, it } from "vitest";
import {
  allowedStatusTransitions,
  isPendingOrder,
  isRevenueOrder,
} from "./order-rules";

describe("lifecycle rules", () => {
  it("allows pending orders to complete or cancel", () => {
    expect(allowedStatusTransitions("pending")).toEqual([
      "completed",
      "cancelled",
    ]);
  });
  it("treats completed as the only revenue status", () => {
    expect(isRevenueOrder({ status: "completed" })).toBe(true);
    expect(isRevenueOrder({ status: "pending" })).toBe(false);
    expect(isRevenueOrder({ status: "confirmed" })).toBe(false);
    expect(isRevenueOrder({ status: "cancelled" })).toBe(false);
    expect(isRevenueOrder({ status: "draft" })).toBe(false);
    expect(isRevenueOrder({ status: "refunded" })).toBe(false);
  });
  it("flags pending orders", () => {
    expect(isPendingOrder({ status: "pending" })).toBe(true);
    expect(isPendingOrder({ status: "confirmed" })).toBe(false);
    expect(isPendingOrder({ status: "completed" })).toBe(false);
  });
});