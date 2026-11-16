import { describe, expect, it } from "vitest";
import {
  expensesByCategory,
  expensesByMonth,
  expensesVsRevenue,
  filterExpenses,
  isCashExpense,
  recurringRunRate,
  totalExpenses,
} from "./expenses";
import type { Expense } from "@/types/business";

function expense(overrides: Partial<Expense> & Pick<Expense, "id">): Expense {
  return {
    brand_id: "b1",
    title: "Expense",
    category: "other",
    amount: 100,
    method: "UPI",
    incurredOn: "2026-03-10",
    recurring: "none",
    supplierId: null,
    notes: "",
    created_at: "2026-03-10T09:00:00.000Z",
    ...overrides,
  };
}

const FIXTURES: Expense[] = [
  expense({ id: "e1", title: "Coffee beans", category: "raw_materials", amount: 8000, method: "Cash", incurredOn: "2026-03-02" }),
  expense({ id: "e2", title: "Rent", category: "rent", amount: 45000, incurredOn: "2026-02-28", recurring: "monthly" }),
  expense({ id: "e3", title: "Rent", category: "rent", amount: 45000, incurredOn: "2026-01-31", recurring: "monthly" }),
  expense({ id: "e4", title: "Produce run", category: "raw_materials", amount: 2200, incurredOn: "2026-03-05", recurring: "weekly" }),
  expense({ id: "e5", title: "POS subscription", category: "software", amount: 2500, incurredOn: "2026-01-15" }),
];

describe("filterExpenses", () => {
  it("narrows by category", () => {
    expect(filterExpenses(FIXTURES, { category: "rent" }).map((e) => e.id)).toEqual(["e2", "e3"]);
  });
  it("narrows by an inclusive calendar range", () => {
    const ids = filterExpenses(FIXTURES, { from: "2026-02-01", to: "2026-03-04" }).map((e) => e.id);
    expect(ids).toEqual(["e1", "e2"]);
  });
  it("narrows by recurring period and search text", () => {
    expect(filterExpenses(FIXTURES, { recurring: "monthly" }).map((e) => e.id)).toEqual(["e2", "e3"]);
    expect(filterExpenses(FIXTURES, { search: "pos" }).map((e) => e.id)).toEqual(["e5"]);
  });
  it("returns newest first", () => {
    expect(filterExpenses(FIXTURES, {}).map((e) => e.incurredOn)).toEqual([
      "2026-03-05",
      "2026-03-02",
      "2026-02-28",
      "2026-01-31",
      "2026-01-15",
    ]);
  });
});

describe("expensesByCategory", () => {
  it("totals and sorts categories by spend", () => {
    const buckets = expensesByCategory(FIXTURES);
    expect(buckets[0]).toMatchObject({ category: "rent", label: "Rent", total: 90000, count: 2 });
    expect(buckets.map((b) => b.category)).toEqual(["rent", "raw_materials", "software"]);
    expect(totalExpenses(FIXTURES)).toBe(102700);
    expect(expensesByCategory(FIXTURES)[0].percent).toBeCloseTo(87.63, 2);
  });
  it("handles an empty list", () => {
    expect(expensesByCategory([])).toEqual([]);
    expect(totalExpenses([])).toBe(0);
  });
});

describe("expensesByMonth", () => {
  it("fills months with no expenses so the trend keeps its spacing", () => {
    const months = expensesByMonth(FIXTURES);
    expect(months.map((m) => m.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(months.find((m) => m.month === "2026-02")).toMatchObject({ total: 45000, count: 1 });
    expect(months.find((m) => m.month === "2026-03")).toMatchObject({ total: 10200, count: 2 });
  });
  it("is empty when nothing is recorded", () => {
    expect(expensesByMonth([])).toEqual([]);
  });
});

describe("recurringRunRate", () => {
  it("projects weekly costs onto a month", () => {
    const rate = recurringRunRate(FIXTURES);
    expect(rate.monthlyCount).toBe(1);
    expect(rate.weeklyCount).toBe(1);
    expect(rate.monthly).toBe(45000);
    expect(rate.weeklyAsMonthly).toBeCloseTo(2200 * (52 / 12), 1);
    expect(rate.runRate).toBeCloseTo(45000 + 2200 * (52 / 12), 1);
  });
  it("counts each recurring title once, from its latest amount", () => {
    const rate = recurringRunRate([
      ...FIXTURES,
      expense({ id: "e6", title: "Rent", category: "rent", amount: 48000, incurredOn: "2026-03-01", recurring: "monthly" }),
    ]);
    expect(rate.monthly).toBe(48000);
  });
  it("is zero with no recurring costs", () => {
    expect(recurringRunRate([expense({ id: "e7" })]).runRate).toBe(0);
  });
});

describe("expensesVsRevenue", () => {
  it("compares spend against revenue per month", () => {
    const rows = expensesVsRevenue(FIXTURES, [
      { month: "2026-01", revenue: 100000 },
      { month: "2026-03", revenue: 12200 },
    ]);
    expect(rows.map((r) => r.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(rows[0]).toMatchObject({ expenses: 47500, revenue: 100000, net: 52500 });
    expect(rows[1]).toMatchObject({ expenses: 45000, revenue: 0, net: -45000, ratio: 0 });
    expect(rows[2].ratio).toBeCloseTo(83.61, 2);
  });
});

describe("isCashExpense", () => {
  it("matches the cash rail case-insensitively", () => {
    expect(isCashExpense(expense({ id: "e8", method: "cash" }))).toBe(true);
    expect(isCashExpense(expense({ id: "e9", method: "UPI" }))).toBe(false);
  });
});
