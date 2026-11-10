import { describe, expect, it } from "vitest";
import {
  allowedStatusTransitions,
  isPendingOrder,
  isRevenueOrder,
  revenueOrders,
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
  it("revenueOrders keeps only completed rows", () => {
    const orders = [
      { id: "a", status: "completed" as const },
      { id: "b", status: "pending" as const },
      { id: "c", status: "draft" as const },
      { id: "d", status: "cancelled" as const },
      { id: "e", status: "completed" as const },
    ];
    expect(revenueOrders(orders).map((o) => o.id)).toEqual(["a", "e"]);
  });
});