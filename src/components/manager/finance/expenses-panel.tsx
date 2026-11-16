"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  ALL_EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_METHODS,
  EXPENSE_RECURRING_LABELS,
  EXPENSE_RECURRING_OPTIONS,
  expensesByCategory,
  expensesByMonth,
  expensesVsRevenue,
  filterExpenses,
  isCashExpense,
  recurringRunRate,
  totalExpenses,
  type RevenueMonth,
} from "@/lib/business/expenses";
import { deleteExpenseAction, saveExpenseAction } from "@/services/finance-actions";
import { formatDate, formatMoney } from "@/lib/format";
import type { Expense, ExpenseCategory, ExpenseRecurring } from "@/types/business";

type Option = { id: string; name: string };
type RecurringFilter = ExpenseRecurring | "all";

function recurringOptions(): { id: RecurringFilter; label: string }[] {
  return [
    { id: "all", label: "All" },
    ...EXPENSE_RECURRING_OPTIONS.map((value) => ({
      id: value as RecurringFilter,
      label: EXPENSE_RECURRING_LABELS[value],
    })),
  ];
}

/**
 * Expense book for the business: money that went out outside the counter.
 *
 * Records are editable here because expenses have no other screen — payments
 * and refunds belong to orders and are changed there. The aggregates below come
 * from `lib/business/expenses.ts`, the same selectors the overview uses, so a
 * category total means the same thing on every Finance screen. There is no
 * ledger behind this: an expense is one recorded outflow, not a journal entry.
 */
export function ExpensesPanel({
  expenses,
  suppliers,
  revenue,
  currencyCode,
  canEdit,
}: {
  expenses: Expense[];
  suppliers: Option[];
  revenue: RevenueMonth[];
  currencyCode: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("raw_materials");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>(EXPENSE_METHODS[0]);
  const [incurredOn, setIncurredOn] = useState("");
  const [recurring, setRecurring] = useState<ExpenseRecurring>("none");
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");

  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | "all">("all");
  const [filterRecurring, setFilterRecurring] = useState<RecurringFilter>("all");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        return true;
      }
      setError(result.message ?? "Could not save.");
      return false;
    } catch {
      setError("Could not save. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }

  function startEdit(expense: Expense | null) {
    setEditing(expense);
    setTitle(expense?.title ?? "");
    setCategory(expense?.category ?? "raw_materials");
    setAmount(expense ? String(expense.amount) : "");
    setMethod(expense?.method ?? EXPENSE_METHODS[0]);
    setIncurredOn(expense?.incurredOn ?? "");
    setRecurring(expense?.recurring ?? "none");
    setSupplierId(expense?.supplierId ?? "");
    setNotes(expense?.notes ?? "");
    setError(null);
  }

  const money = (value: number) => formatMoney(value, currencyCode);
  const visible = filterExpenses(expenses, {
    category: filterCategory,
    recurring: filterRecurring,
    from: from || undefined,
    to: to || undefined,
    search,
  });
  const categories = expensesByCategory(visible);
  const months = expensesByMonth(expenses);
  const runRate = recurringRunRate(expenses);
  const comparison = expensesVsRevenue(expenses, revenue).slice(-6);
  const supplierName = (id: string | null) =>
    id ? suppliers.find((s) => s.id === id)?.name ?? "Unknown supplier" : null;
  const totalVisible = totalExpenses(visible);
  const cashVisible = totalExpenses(visible.filter(isCashExpense));
  const monthPeak = Math.max(1, ...months.map((m) => m.total));

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-1">
        {canEdit ? (
          <Card className="p-4">
            <h2 className="font-semibold">{editing ? "Edit expense" : "New expense"}</h2>
            <form
              className="mt-3 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run(() =>
                  saveExpenseAction(editing?.id ?? null, {
                    title,
                    category,
                    amount,
                    method,
                    incurredOn,
                    recurring,
                    supplierId: supplierId || undefined,
                    notes: notes || undefined,
                  }),
                );
                if (ok) startEdit(null);
              }}
            >
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Title</span>
                <input
                  className="ob-input mt-1 w-full"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  maxLength={120}
                  disabled={pending}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  <span className="text-[var(--ob-text-muted)]">Category</span>
                  <select
                    className="ob-input mt-1 w-full"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                    disabled={pending}
                  >
                    {ALL_EXPENSE_CATEGORIES.map((value) => (
                      <option key={value} value={value}>
                        {EXPENSE_CATEGORY_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-[var(--ob-text-muted)]">Repeats</span>
                  <select
                    className="ob-input mt-1 w-full"
                    value={recurring}
                    onChange={(e) => setRecurring(e.target.value as ExpenseRecurring)}
                    disabled={pending}
                  >
                    {EXPENSE_RECURRING_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {EXPENSE_RECURRING_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  <span className="text-[var(--ob-text-muted)]">Amount</span>
                  <input
                    className="ob-input mt-1 w-full"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    disabled={pending}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-[var(--ob-text-muted)]">Date incurred</span>
                  <input
                    className="ob-input mt-1 w-full"
                    type="date"
                    value={incurredOn}
                    onChange={(e) => setIncurredOn(e.target.value)}
                    required
                    disabled={pending}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">
                  <span className="text-[var(--ob-text-muted)]">Paid by</span>
                  <select
                    className="ob-input mt-1 w-full"
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    disabled={pending}
                  >
                    {EXPENSE_METHODS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-[var(--ob-text-muted)]">Supplier (optional)</span>
                  <select
                    className="ob-input mt-1 w-full"
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    disabled={pending}
                  >
                    <option value="">None</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Notes (optional)</span>
                <input
                  className="ob-input mt-1 w-full"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  disabled={pending}
                />
              </label>
              <p className="text-xs text-[var(--ob-text-muted)]">
                Expenses paid in cash also show up in the day&apos;s cash register.
              </p>
              {error ? (
                <p role="alert" className="text-sm text-[var(--ob-danger)]">
                  {error}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
                  disabled={pending}
                >
                  {pending ? "Saving…" : editing ? "Save changes" : "Add expense"}
                </button>
                {editing ? (
                  <button
                    type="button"
                    className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm"
                    onClick={() => startEdit(null)}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </Card>
        ) : (
          <Card className="p-4 text-sm text-[var(--ob-text-muted)]">
            Expenses are an app-level record and can only be written in demo
            workspaces today — the live database has no expenses table yet.
          </Card>
        )}

        <Card className="p-4">
          <h2 className="text-sm font-semibold">Recurring commitments</h2>
          <p className="mt-2 text-2xl font-semibold">{money(runRate.runRate)}</p>
          <p className="text-xs text-[var(--ob-text-muted)]">
            projected per month · {money(runRate.monthly)} monthly +{" "}
            {money(runRate.weeklyAsMonthly)} from {runRate.weeklyCount} weekly
          </p>
          {runRate.entries.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--ob-text-muted)]">
              No expense is marked as repeating.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {runRate.entries.slice(0, 6).map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {entry.title}
                    <span className="text-[var(--ob-text-muted)]">
                      {" · "}
                      {EXPENSE_RECURRING_LABELS[entry.recurring]}
                    </span>
                  </span>
                  <span className="shrink-0 font-medium">{money(entry.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {months.length > 0 ? (
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Monthly spend</h2>
            <ul className="mt-3 space-y-2">
              {months.slice(-6).map((bucket) => (
                <li key={bucket.month}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{bucket.label}</span>
                    <span className="font-medium">{money(bucket.total)}</span>
                  </div>
                  <div
                    className="mt-1 h-2 rounded-full bg-[var(--ob-surface-muted)]"
                    aria-hidden
                  >
                    <div
                      className="h-2 rounded-full bg-[var(--ob-primary)]"
                      style={{ width: `${Math.round((bucket.total / monthPeak) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {comparison.length > 0 ? (
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Expenses against revenue</h2>
            <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
              Revenue is billed value on posted orders. This is an operations
              comparison, not a profit and loss statement.
            </p>
            <div className="ob-scroll-x mt-3">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Expenses, revenue and expense share of revenue per month
                </caption>
                <thead className="text-xs uppercase text-[var(--ob-text-muted)]">
                  <tr>
                    <th className="py-1 pr-3">Month</th>
                    <th className="py-1 pr-3 text-right">Expenses</th>
                    <th className="py-1 pr-3 text-right">Revenue</th>
                    <th className="py-1 text-right">Expenses / revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => (
                    <tr key={row.month} className="border-t border-[var(--ob-border)]">
                      <td className="py-1.5 pr-3">{row.label}</td>
                      <td className="py-1.5 pr-3 text-right">{money(row.expenses)}</td>
                      <td className="py-1.5 pr-3 text-right">{money(row.revenue)}</td>
                      <td className="py-1.5 text-right">{row.ratio.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : null}
      </div>

      <div className="space-y-4 lg:col-span-2">
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Search</span>
              <input
                className="ob-input mt-1 w-full min-w-[12rem]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title or notes"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Category</span>
              <select
                className="ob-input mt-1 w-full"
                value={filterCategory}
                onChange={(e) =>
                  setFilterCategory(e.target.value as ExpenseCategory | "all")
                }
              >
                <option value="all">All categories</option>
                {ALL_EXPENSE_CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {EXPENSE_CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">From</span>
              <input
                className="ob-input mt-1 w-full"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">To</span>
              <input
                className="ob-input mt-1 w-full"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            {(from || to) && (
              <button
                type="button"
                className="ob-touch-target self-end rounded-md border border-[var(--ob-border)] px-3 text-sm"
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
              >
                Clear dates
              </button>
            )}
          </div>
          <SegmentedControl
            label="Recurring filter"
            value={filterRecurring}
            onChange={setFilterRecurring}
            options={recurringOptions()}
          />
          <p className="text-xs text-[var(--ob-text-muted)]">
            {visible.length} expense{visible.length === 1 ? "" : "s"} ·{" "}
            {money(totalVisible)} total
            {cashVisible > 0 ? ` · ${money(cashVisible)} paid in cash` : ""}
          </p>
        </Card>

        {categories.length > 0 && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Spend by category</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {categories.map((bucket) => (
                <li key={bucket.category}>
                  <button
                    type="button"
                    onClick={() =>
                      setFilterCategory(
                        filterCategory === bucket.category ? "all" : bucket.category,
                      )
                    }
                    className="ob-touch-target w-full rounded-[var(--ob-radius-md)] bg-[var(--ob-surface-muted)] px-3 py-2 text-left"
                  >
                    <span className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{bucket.label}</span>
                      <span>{money(bucket.total)}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1.5 flex-1 rounded-full bg-[var(--ob-surface)]">
                        <span
                          className="block h-1.5 rounded-full bg-[var(--ob-primary)]"
                          style={{ width: `${bucket.percent}%` }}
                        />
                      </span>
                      <span className="text-xs text-[var(--ob-text-muted)]">
                        {bucket.percent.toFixed(0)}% · {bucket.count}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {visible.length === 0 ? (
          <EmptyState
            title={expenses.length ? "No expenses match these filters" : "No expenses recorded"}
            description={
              expenses.length
                ? "Widen the date range or clear the category filter."
                : "Add the money that leaves the business — rent, supplies, wages, software — to see where it goes."
            }
          />
        ) : (
          <ul className="space-y-2">
            {visible.map((expense) => (
              <li key={expense.id} className="ob-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {expense.title}
                      <span className="ml-2 rounded bg-[var(--ob-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--ob-text-muted)]">
                        {EXPENSE_CATEGORY_LABELS[expense.category]}
                      </span>
                      {expense.recurring !== "none" ? (
                        <span className="ml-2 rounded bg-[var(--ob-surface-muted)] px-1.5 py-0.5 text-xs text-[var(--ob-text-muted)]">
                          {EXPENSE_RECURRING_LABELS[expense.recurring]}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-[var(--ob-text-muted)]">
                      {expense.incurredOn} · {expense.method}
                      {supplierName(expense.supplierId)
                        ? ` · ${supplierName(expense.supplierId)}`
                        : ""}
                    </p>
                    {expense.notes ? (
                      <p className="text-sm text-[var(--ob-text-muted)]">{expense.notes}</p>
                    ) : null}
                    <p className="text-xs text-[var(--ob-text-muted)]">
                      Recorded {formatDate(expense.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-semibold">{money(expense.amount)}</p>
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                          onClick={() => startEdit(expense)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                          disabled={pending}
                          onClick={() => run(() => deleteExpenseAction(expense.id))}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
