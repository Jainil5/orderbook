import {
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type ExpenseRecurring,
} from "@/types/business";
import { addCalendarMonths } from "@/lib/analytics/date-range";

/**
 * Expense selectors for the Finance Manager.
 *
 * Expenses are an app-level record of money that left the business outside
 * the counter (rent, supplies, wages). This module only reads and aggregates
 * them — categories, month buckets, the recurring run-rate and the
 * expenses-vs-revenue comparison — so the screens and the CSV export agree on
 * one definition of each number. This is financial operations, not a ledger:
 * there is no double entry, no tax treatment and no accrual here.
 */

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  raw_materials: "Raw materials",
  rent: "Rent",
  utilities: "Utilities",
  salaries: "Salaries",
  marketing: "Marketing",
  maintenance: "Maintenance",
  delivery: "Delivery",
  packaging: "Packaging",
  software: "Software",
  other: "Other",
};

/** Payment rails an expense can be paid through. `Cash` feeds the cash register. */
export const EXPENSE_METHODS = ["Cash", "UPI", "Card", "Bank transfer"] as const;
export type ExpenseMethod = (typeof EXPENSE_METHODS)[number];

export const EXPENSE_RECURRING_OPTIONS: ExpenseRecurring[] = [
  "none",
  "weekly",
  "monthly",
];

export const EXPENSE_RECURRING_LABELS: Record<ExpenseRecurring, string> = {
  none: "One-time",
  weekly: "Weekly",
  monthly: "Monthly",
};

export const CASH_METHOD = "Cash";

/** `YYYY-MM-DD` → `YYYY-MM`. */
export function monthKey(day: string): string {
  return day.slice(0, 7);
}

export function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  if (!year || !m) return month;
  return new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export type ExpenseFilter = {
  category?: ExpenseCategory | "all";
  recurring?: ExpenseRecurring | "all";
  from?: string;
  to?: string;
  search?: string;
};

export function filterExpenses(
  expenses: readonly Expense[],
  filter: ExpenseFilter,
): Expense[] {
  const term = filter.search?.trim().toLowerCase() ?? "";
  return expenses
    .filter((e) => (filter.category && filter.category !== "all" ? e.category === filter.category : true))
    .filter((e) => (filter.recurring && filter.recurring !== "all" ? e.recurring === filter.recurring : true))
    .filter((e) => (filter.from ? e.incurredOn >= filter.from : true))
    .filter((e) => (filter.to ? e.incurredOn <= filter.to : true))
    .filter((e) =>
      term
        ? e.title.toLowerCase().includes(term) ||
          (e.notes ?? "").toLowerCase().includes(term)
        : true,
    )
    .sort((a, b) => (a.incurredOn < b.incurredOn ? 1 : a.incurredOn > b.incurredOn ? -1 : 0));
}

export function totalExpenses(expenses: readonly Expense[]): number {
  return round(expenses.reduce((total, e) => total + e.amount, 0));
}

export function isCashExpense(expense: Expense): boolean {
  return expense.method.trim().toLowerCase() === CASH_METHOD.toLowerCase();
}

export type CategoryBucket = {
  category: ExpenseCategory;
  label: string;
  total: number;
  count: number;
  /** Share of the filtered total, 0–100. */
  percent: number;
};

export function expensesByCategory(expenses: readonly Expense[]): CategoryBucket[] {
  const total = totalExpenses(expenses);
  const buckets = new Map<ExpenseCategory, { total: number; count: number }>();
  for (const expense of expenses) {
    const current = buckets.get(expense.category) ?? { total: 0, count: 0 };
    buckets.set(expense.category, {
      total: current.total + expense.amount,
      count: current.count + 1,
    });
  }
  return Array.from(buckets, ([category, value]) => ({
    category,
    label: EXPENSE_CATEGORY_LABELS[category],
    total: round(value.total),
    count: value.count,
    percent: total ? round((value.total / total) * 100) : 0,
  })).sort((a, b) => b.total - a.total);
}

/** Category order for filter dropdowns — every known category, in registry order. */
export const ALL_EXPENSE_CATEGORIES: ExpenseCategory[] = [...EXPENSE_CATEGORIES];

export type MonthBucket = {
  month: string;
  label: string;
  total: number;
  count: number;
};

/** `YYYY-MM` stepped by calendar months. */
function nextMonth(month: string): string {
  return addCalendarMonths(`${month}-01`, 1).slice(0, 7);
}

/**
 * Expense totals per calendar month, oldest first. Every month between the
 * first and last recorded expense is present, so a month with no expense
 * still shows up in the trend instead of silently shifting the bars.
 */
export function expensesByMonth(expenses: readonly Expense[]): MonthBucket[] {
  const buckets = new Map<string, { total: number; count: number }>();
  for (const expense of expenses) {
    const month = monthKey(expense.incurredOn);
    const current = buckets.get(month) ?? { total: 0, count: 0 };
    buckets.set(month, {
      total: current.total + expense.amount,
      count: current.count + 1,
    });
  }
  const keys = Array.from(buckets.keys()).sort();
  if (keys.length) {
    let month = keys[0];
    while (month < keys[keys.length - 1]) {
      month = nextMonth(month);
      if (!buckets.has(month)) buckets.set(month, { total: 0, count: 0 });
    }
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([month, value]) => ({
      month,
      label: monthLabel(month),
      total: round(value.total),
      count: value.count,
    }));
}

export type RecurringRunRate = {
  /** Fixed cost repeated every calendar month. */
  monthly: number;
  /** Weekly costs converted to a monthly figure (× 52 / 12). */
  weeklyAsMonthly: number;
  /** Projected monthly spend from everything marked recurring. */
  runRate: number;
  weeklyCount: number;
  monthlyCount: number;
  /** Most recent recorded amount per recurring title, for context. */
  entries: Expense[];
};

/**
 * A recurring expense is a standing cost described by its period; the run-rate
 * projects it onto one calendar month so it can be compared with actual
 * monthly spend.
 */
export function recurringRunRate(expenses: readonly Expense[]): RecurringRunRate {
  const recurring = expenses.filter((e) => e.recurring !== "none");
  const latestByTitle = new Map<string, Expense>();
  for (const expense of [...recurring].sort((a, b) => (a.incurredOn < b.incurredOn ? 1 : -1))) {
    const key = `${expense.recurring}:${expense.title.toLowerCase()}`;
    if (!latestByTitle.has(key)) latestByTitle.set(key, expense);
  }
  const entries = Array.from(latestByTitle.values());
  const weekly = entries.filter((e) => e.recurring === "weekly");
  const monthly = entries.filter((e) => e.recurring === "monthly");
  const weeklyTotal = weekly.reduce((total, e) => total + e.amount, 0) * (52 / 12);
  const monthlyTotal = monthly.reduce((total, e) => total + e.amount, 0);
  return {
    monthly: round(monthlyTotal),
    weeklyAsMonthly: round(weeklyTotal),
    runRate: round(monthlyTotal + weeklyTotal),
    weeklyCount: weekly.length,
    monthlyCount: monthly.length,
    entries: entries.sort((a, b) => b.amount - a.amount),
  };
}

export type RevenueMonth = { month: string; revenue: number };

export type ExpenseVsRevenueRow = {
  month: string;
  label: string;
  expenses: number;
  revenue: number;
  net: number;
  /** Expenses as a percentage of revenue in that month, 0–100. */
  ratio: number;
};

/**
 * Month-by-month comparison of recorded expenses against revenue. Revenue is
 * supplied by the caller (it comes from orders, not from expenses), so this
 * stays a comparison view rather than a profit statement.
 */
export function expensesVsRevenue(
  expenses: readonly Expense[],
  revenue: readonly RevenueMonth[],
): ExpenseVsRevenueRow[] {
  const months = new Set<string>();
  for (const expense of expenses) months.add(monthKey(expense.incurredOn));
  for (const row of revenue) months.add(row.month);
  const revenueByMonth = new Map(revenue.map((row) => [row.month, row.revenue]));
  return Array.from(months)
    .sort()
    .map((month) => {
      const monthExpenses = round(
        expenses
          .filter((e) => monthKey(e.incurredOn) === month)
          .reduce((total, e) => total + e.amount, 0),
      );
      const monthRevenue = round(revenueByMonth.get(month) ?? 0);
      return {
        month,
        label: monthLabel(month),
        expenses: monthExpenses,
        revenue: monthRevenue,
        net: round(monthRevenue - monthExpenses),
        ratio: monthRevenue ? round((monthExpenses / monthRevenue) * 100) : 0,
      };
    });
}
