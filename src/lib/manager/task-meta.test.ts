import { describe, expect, it } from "vitest";
import {
  followUpTasks,
  openTasksByCategory,
  recurringTasks,
  reminderDueTasks,
  taskCategory,
  taskMeta,
  taskRecurrence,
} from "./task-meta";
import type { Task } from "@/types/operations";

const task = (overrides: Partial<Task> = {}): Task => ({
  id: "t1",
  brand_id: "b",
  title: "Water the plants",
  description: "",
  assigneeStaffId: "st1",
  customerId: null,
  priority: "medium",
  dueAt: "2026-11-16T12:00:00.000Z",
  status: "open",
  ...overrides,
});

const now = new Date("2026-11-16T12:00:00.000Z");

describe("taskCategory", () => {
  it("reads the category from the words in the task", () => {
    expect(taskCategory(task({ title: "Follow up with the roaster" }))).toBe("follow_up");
    expect(taskCategory(task({ title: "Restock oat milk" }))).toBe("restock");
    expect(taskCategory(task({ title: "Deep clean espresso machine" }))).toBe("maintenance");
    expect(taskCategory(task({ title: "Deliver Oslo dining table" }))).toBe("delivery");
    expect(taskCategory(task({ description: "File the quarterly GST return" }))).toBe("admin");
    expect(taskCategory(task())).toBe("general");
  });

  it("puts follow-ups ahead of the other keywords", () => {
    expect(taskCategory(task({ title: "Confirm the stock delivery" }))).toBe("follow_up");
  });
});

describe("taskRecurrence", () => {
  it("spots a cadence in the wording", () => {
    expect(taskRecurrence(task({ title: "Weekly rota check" }))).toBe("weekly");
    expect(taskRecurrence(task({ title: "Count the fridge", description: "every morning" }))).toBe("daily");
    expect(taskRecurrence(task({ title: "Water the plants" }))).toBe("none");
  });

  it("only lists open repeating tasks", () => {
    const tasks = [
      task({ id: "r1", title: "Weekly rota check" }),
      task({ id: "r2", title: "Weekly stock count", status: "done" }),
    ];
    expect(recurringTasks(tasks).map((t) => t.id)).toEqual(["r1"]);
  });
});

describe("taskMeta reminders", () => {
  it("fires the reminder earlier for higher priority work", () => {
    expect(taskMeta(task({ priority: "high" })).reminderAt).toBe("2026-11-16T11:00:00.000Z");
    expect(taskMeta(task({ priority: "medium" })).reminderAt).toBe("2026-11-16T08:00:00.000Z");
    expect(taskMeta(task({ priority: "low" })).reminderAt).toBe("2026-11-15T12:00:00.000Z");
  });

  it("has no reminder without a due date or once the task is done", () => {
    expect(taskMeta(task({ dueAt: null })).reminderAt).toBeNull();
    expect(taskMeta(task({ status: "done" })).reminderAt).toBeNull();
  });

  it("lists tasks whose reminder time has passed", () => {
    const soon = task({ id: "t2", dueAt: "2026-11-17T04:00:00.000Z" });
    expect(reminderDueTasks([task(), soon], now).map((t) => t.id)).toEqual(["t1"]);
  });
});

describe("followUpTasks", () => {
  it("keeps open follow-ups and overdue work, and drops finished tasks", () => {
    const tasks = [
      task({ id: "f1", title: "Follow up with the roaster", dueAt: null }),
      task({ id: "f2", title: "Restock oat milk", dueAt: "2026-11-15T09:00:00.000Z" }),
      task({ id: "f3", title: "Water the plants", dueAt: "2026-11-20T09:00:00.000Z" }),
      task({ id: "f4", title: "Chase the card settlement", status: "done" }),
    ];
    expect(followUpTasks(tasks, now).map((t) => t.id)).toEqual(["f2", "f1"]);
  });

  it("orders by due date with undated tasks last", () => {
    const tasks = [
      task({ id: "u1", title: "Follow up — call back", dueAt: null }),
      task({ id: "d2", title: "Follow up — delivery slot", dueAt: "2026-11-18T09:00:00.000Z" }),
      task({ id: "d1", title: "Follow up — lift booking", dueAt: "2026-11-17T09:00:00.000Z" }),
    ];
    expect(followUpTasks(tasks, now).map((t) => t.id)).toEqual(["d1", "d2", "u1"]);
  });
});

describe("openTasksByCategory", () => {
  it("groups open tasks and skips empty categories", () => {
    const groups = openTasksByCategory([
      task({ id: "a", title: "Restock oat milk" }),
      task({ id: "b", title: "Follow up with the roaster" }),
      task({ id: "c", title: "Deep clean espresso machine", status: "done" }),
    ]);
    expect(groups.map((g) => [g.category, g.tasks.length])).toEqual([
      ["follow_up", 1],
      ["restock", 1],
    ]);
  });
});
