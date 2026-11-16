"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  cashSessionsSorted,
  isOpenCashSession,
  summarizeCashDay,
  totalCashMovements,
  unreconciledCashRecords,
  type CashRecords,
} from "@/lib/business/cash";
import { formatDate, formatMoney } from "@/lib/format";
import {
  closeCashSessionAction,
  deleteCashMovementAction,
  saveCashMovementAction,
  startCashSessionAction,
} from "@/services/finance-actions";
import type { CashSession } from "@/types/business";

type Option = { id: string; name: string };

function varianceTone(variance: number | null): "neutral" | "success" | "danger" {
  if (variance == null) return "neutral";
  return variance === 0 ? "success" : "danger";
}

/**
 * The cash drawer for one business day: what the till started with, every cash
 * movement the app can see for that day, and what the count came to.
 *
 * Inflows are cash payments taken at the counter plus manual cash-ins; outflows
 * are expenses paid in cash plus manual cash-outs. A movement generated from a
 * bill or an expense is never counted twice — the source record is the single
 * entry. Closing a session stores the counted balance, so variance is always
 * count minus expected, never an estimate.
 */
export function CashRegister({
  records,
  sessions,
  staff,
  currencyCode,
  today,
}: {
  records: CashRecords;
  sessions: CashSession[];
  staff: Option[];
  currencyCode: string;
  today: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(today);

  const [sessionDate, setSessionDate] = useState(today);
  const [openingBalance, setOpeningBalance] = useState("");
  const [staffId, setStaffId] = useState("");
  const [sessionNote, setSessionNote] = useState("");

  const [counted, setCounted] = useState("");
  const [closeNote, setCloseNote] = useState("");

  const [direction, setDirection] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [movementDate, setMovementDate] = useState(today);

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

  const money = (value: number) => formatMoney(value, currencyCode);
  const summary = summarizeCashDay(records, day, sessions);
  const session = summary.session;
  const open = session ? isOpenCashSession(session) : null;
  const manualToday = records.movements.filter(
    (m) => m.source === "manual" && m.date === day,
  );
  const reconciliation = unreconciledCashRecords(records, sessions);
  const staffName = (id: string | null) =>
    id ? staff.find((s) => s.id === id)?.name ?? "Unknown" : "Not assigned";
  const inflows = totalCashMovements(records.movements, "in");
  const outflows = totalCashMovements(records.movements, "out");

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Card className="p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Register day</span>
              <input
                className="ob-input mt-1"
                type="date"
                value={day}
                max={today}
                onChange={(e) => setDay(e.target.value || today)}
              />
            </label>
            <div className="flex items-center gap-2">
              {day !== today ? (
                <button
                  type="button"
                  className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                  onClick={() => setDay(today)}
                >
                  Back to today
                </button>
              ) : null}
              {session ? (
                <Badge tone={open ? "warning" : "success"}>
                  {open ? "session open" : "session closed"}
                </Badge>
              ) : (
                <Badge tone="neutral">no session</Badge>
              )}
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
                Opening float
              </dt>
              <dd className="mt-1 text-lg font-semibold">
                {money(summary.openingBalance)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
                Cash in
              </dt>
              <dd className="mt-1 text-lg font-semibold text-[var(--ob-success)]">
                {money(summary.inflows)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
                Cash out
              </dt>
              <dd className="mt-1 text-lg font-semibold text-[var(--ob-danger)]">
                {money(summary.outflows)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
                Expected in drawer
              </dt>
              <dd className="mt-1 text-lg font-semibold">{money(summary.expected)}</dd>
            </div>
          </dl>

          <div className="mt-4 grid gap-3 border-t border-[var(--ob-border)] pt-4 sm:grid-cols-3">
            <p className="text-sm">
              <span className="block text-xs uppercase tracking-wide text-[var(--ob-text-muted)]">
                Counted
              </span>
              {summary.countedBalance == null ? "Not counted yet" : money(summary.countedBalance)}
            </p>
            <p className="text-sm">
              <span className="block text-xs uppercase tracking-wide text-[var(--ob-text-muted)]">
                Variance
              </span>
              <Badge tone={varianceTone(summary.variance)}>
                {summary.variance == null
                  ? "open"
                  : `${summary.variance > 0 ? "+" : ""}${money(summary.variance)}`}
              </Badge>
            </p>
            <p className="text-sm text-[var(--ob-text-muted)]">
              <span className="block text-xs uppercase tracking-wide">Session</span>
              {session
                ? `${staffName(session.staffId)}${session.closedAt ? ` · closed ${formatDate(session.closedAt)}` : " · awaiting count"}`
                : "No session started for this day"}
            </p>
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-[var(--ob-danger)]">
              {error}
            </p>
          ) : null}
        </Card>

        <div>
          <h2 className="mb-2 text-sm font-semibold">
            Drawer movement on {day}
          </h2>
          {summary.flows.length === 0 ? (
            <Card className="p-4 text-sm text-[var(--ob-text-muted)]">
              No cash payment, cash expense or manual entry is recorded for this
              day.
            </Card>
          ) : (
            <ul className="space-y-2">
              {summary.flows.map((flow) => (
                <li
                  key={flow.id}
                  className="ob-card flex items-center justify-between gap-3 p-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {flow.label}
                    </span>
                    <span className="text-xs text-[var(--ob-text-muted)]">
                      {flow.origin === "payment"
                        ? "Cash payment on a bill"
                        : flow.origin === "expense"
                          ? "Expense paid in cash"
                          : "Manual drawer entry"}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 font-semibold ${
                      flow.direction === "in"
                        ? "text-[var(--ob-success)]"
                        : "text-[var(--ob-danger)]"
                    }`}
                  >
                    {flow.direction === "in" ? "+" : "−"}
                    {money(flow.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {reconciliation.length > 0 && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Not yet reflected in a session</h2>
            <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
              Cash records whose day has no register session and no matching
              drawer entry. Work through these when the till and the records
              disagree.
            </p>
            <ul className="mt-3 space-y-1.5">
              {reconciliation.slice(0, 10).map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {item.label}
                    <span className="text-[var(--ob-text-muted)]"> · {item.date}</span>
                  </span>
                  <span className="shrink-0 font-medium">
                    {item.direction === "in" ? "+" : "−"}
                    {money(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
            {reconciliation.length > 10 ? (
              <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
                {reconciliation.length - 10} more not shown
              </p>
            ) : null}
          </Card>
        )}
      </div>

      <div className="space-y-4 lg:col-span-1">
        {session && open ? (
          <Card className="p-4">
            <h2 className="font-semibold">Count and close</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              Expected in the drawer: {money(summary.expected)}
            </p>
            <form
              className="mt-3 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run(() =>
                  closeCashSessionAction(session.id, {
                    countedBalance: counted,
                    note: closeNote || undefined,
                  }),
                );
                if (ok) {
                  setCounted("");
                  setCloseNote("");
                }
              }}
            >
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Counted balance</span>
                <input
                  className="ob-input mt-1 w-full"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={counted}
                  onChange={(e) => setCounted(e.target.value)}
                  required
                  disabled={pending}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Closing note (optional)</span>
                <input
                  className="ob-input mt-1 w-full"
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  maxLength={200}
                  disabled={pending}
                />
              </label>
              <button
                type="submit"
                className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
                disabled={pending}
              >
                {pending ? "Closing…" : "Close session"}
              </button>
            </form>
          </Card>
        ) : (
          <Card className="p-4">
            <h2 className="font-semibold">Start a session</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              One session per day. It holds the opening float until the drawer is
              counted.
            </p>
            <form
              className="mt-3 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = await run(() =>
                  startCashSessionAction({
                    date: sessionDate,
                    openingBalance,
                    staffId: staffId || undefined,
                    note: sessionNote || undefined,
                  }),
                );
                if (ok) {
                  setOpeningBalance("");
                  setSessionNote("");
                  setDay(sessionDate);
                }
              }}
            >
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Date</span>
                <input
                  className="ob-input mt-1 w-full"
                  type="date"
                  value={sessionDate}
                  max={today}
                  onChange={(e) => setSessionDate(e.target.value || today)}
                  required
                  disabled={pending}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Opening float</span>
                <input
                  className="ob-input mt-1 w-full"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                  required
                  disabled={pending}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Opened by (optional)</span>
                <select
                  className="ob-input mt-1 w-full"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  disabled={pending}
                >
                  <option value="">Not assigned</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Note (optional)</span>
                <input
                  className="ob-input mt-1 w-full"
                  value={sessionNote}
                  onChange={(e) => setSessionNote(e.target.value)}
                  maxLength={200}
                  disabled={pending}
                />
              </label>
              <button
                type="submit"
                className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
                disabled={pending}
              >
                {pending ? "Starting…" : "Start session"}
              </button>
            </form>
          </Card>
        )}

        <Card className="p-4">
          <h2 className="font-semibold">Manual drawer entry</h2>
          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
            For cash that moved without a bill or an expense: a change float
            top-up, a bank pickup, petty cash spent.
          </p>
          <form
            className="mt-3 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() =>
                saveCashMovementAction({
                  direction,
                  amount,
                  reason,
                  date: movementDate,
                }),
              );
              if (ok) {
                setAmount("");
                setReason("");
              }
            }}
          >
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="text-[var(--ob-text-muted)]">Direction</span>
                <select
                  className="ob-input mt-1 w-full"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as "in" | "out")}
                  disabled={pending}
                >
                  <option value="in">Cash in</option>
                  <option value="out">Cash out</option>
                </select>
              </label>
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
            </div>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Reason</span>
              <input
                className="ob-input mt-1 w-full"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={120}
                disabled={pending}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Date</span>
              <input
                className="ob-input mt-1 w-full"
                type="date"
                value={movementDate}
                max={today}
                onChange={(e) => setMovementDate(e.target.value || today)}
                required
                disabled={pending}
              />
            </label>
            <button
              type="submit"
              className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-white disabled:opacity-50"
              disabled={pending}
            >
              {pending ? "Saving…" : "Add entry"}
            </button>
          </form>

          {manualToday.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t border-[var(--ob-border)] pt-3">
              {manualToday.map((movement) => (
                <li key={movement.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {movement.reason}
                    <span
                      className={`ml-2 font-medium ${
                        movement.direction === "in"
                          ? "text-[var(--ob-success)]"
                          : "text-[var(--ob-danger)]"
                      }`}
                    >
                      {movement.direction === "in" ? "+" : "−"}
                      {money(movement.amount)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="ob-touch-target shrink-0 rounded-md border border-[var(--ob-border)] px-2 text-xs"
                    disabled={pending}
                    onClick={() => run(() => deleteCashMovementAction(movement.id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-[var(--ob-text-muted)]">
            All manual entries so far: {money(inflows)} in, {money(outflows)} out.
          </p>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold">Session history</h2>
          {sessions.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
              No cash session has been opened yet.
            </p>
          ) : (
            <div className="ob-scroll-x mt-3">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">
                  Opening float, counted balance and variance per cash session
                </caption>
                <thead className="text-xs uppercase text-[var(--ob-text-muted)]">
                  <tr>
                    <th className="py-1 pr-3">Day</th>
                    <th className="py-1 pr-3 text-right">Opening</th>
                    <th className="py-1 pr-3 text-right">Expected</th>
                    <th className="py-1 pr-3 text-right">Counted</th>
                    <th className="py-1 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  {cashSessionsSorted(sessions).map((item) => {
                    const row = summarizeCashDay(records, item.date, sessions);
                    return (
                      <tr key={item.id} className="border-t border-[var(--ob-border)]">
                        <td className="py-1.5 pr-3">
                          <button
                            type="button"
                            className="text-[var(--ob-primary)] hover:underline"
                            onClick={() => setDay(item.date)}
                          >
                            {item.date}
                          </button>
                        </td>
                        <td className="py-1.5 pr-3 text-right">{money(item.openingBalance)}</td>
                        <td className="py-1.5 pr-3 text-right text-[var(--ob-text-muted)]">
                          {money(row.expected)}
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          {item.countedBalance == null ? "—" : money(item.countedBalance)}
                        </td>
                        <td className="py-1.5 text-right">
                          {row.variance == null ? (
                            <Badge tone="warning">open</Badge>
                          ) : (
                            <Badge tone={varianceTone(row.variance)}>
                              {row.variance > 0 ? "+" : ""}
                              {money(row.variance)}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
