import { describe, expect, it } from "vitest";
import { isTaskOverdue, validateTaskInput } from "./tasks";
import type { Task } from "@/types/operations";

const known = { staffIds: ["st1"], customerIds: ["c1"] };

describe("validateTaskInput", () => {
  it("accepts a minimal task", () => {
    const r = validateTaskInput({ title: "Call supplier", priority: "high" }, known);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ title: "Call supplier", priority: "high", assigneeStaffId: null, customerId: null, dueAt: null });
  });
  it("rejects empty title and bad priority", () => {
    expect(validateTaskInput({ title: " ", priority: "high" }, known).ok).toBe(false);
    expect(validateTaskInput({ title: "A", priority: "urgent" }, known).ok).toBe(false);
  });
  it("rejects unknown assignee or customer", () => {
    expect(validateTaskInput({ title: "A", priority: "low", assigneeStaffId: "no" }, known).ok).toBe(false);
    expect(validateTaskInput({ title: "A", priority: "low", customerId: "no" }, known).ok).toBe(false);
  });
});

describe("isTaskOverdue", () => {
  const now = new Date("2026-11-08T12:00:00.000Z");
  const task: Task = { id: "t", brand_id: "b", title: "T", description: "", assigneeStaffId: null, customerId: null, priority: "medium", dueAt: "2026-11-07T12:00:00.000Z", status: "open" };
  it("flags past-due open tasks", () => expect(isTaskOverdue(task, now)).toBe(true));
  it("ignores done tasks", () => expect(isTaskOverdue({ ...task, status: "done" }, now)).toBe(false));
  it("ignores tasks without due date", () => expect(isTaskOverdue({ ...task, dueAt: null }, now)).toBe(false));
  it("ignores future due dates", () => expect(isTaskOverdue({ ...task, dueAt: "2026-11-09T12:00:00.000Z" }, now)).toBe(false));
});
