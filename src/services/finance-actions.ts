"use server";

import {
  auditBusinessOps,
  guardBusinessOps,
  revalidateBusiness,
} from "@/lib/business/actions-kit";
import {
  cashMovementsCollection,
  cashSessionsCollection,
  expensesCollection,
  suppliersCollection,
} from "@/lib/business/registry";
import { day, knownRefs, money, oneOf, refId, text } from "@/lib/business/validate";
import {
  businessDayOf,
  isOpenCashSession,
  receivableRows,
  summarizeCashDay,
} from "@/lib/business/cash";
import { EXPENSE_METHODS } from "@/lib/business/expenses";
import { listDemoOrders, listDemoPayments, toDemoBrandCode } from "@/lib/demo/data";
import { rowsToCsv } from "@/lib/export/csv";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { listOrders, listPayments } from "@/services/data";
import {
  EXPENSE_CATEGORIES,
  type CashMovement,
  type CashSession,
  type Expense,
  type ExpenseRecurring,
} from "@/types/business";
import type { DemoBrandCode } from "@/lib/workspace/constants";

/**
 * Server actions for the Finance Manager's own records: expenses and the cash
 * drawer. Payments, receivables and refunds are read from the order and
 * payment records, so they are written where they belong — Billing, the order
 * page and `services/order-operations.ts` — never from here.
 *
 * Every action runs through `guardBusinessOps()`: demo workspaces write to the
 * business collections, live workspaces get a plain "not connected yet" answer
 * because `expenses` and the cash tables have no Supabase schema
 * (docs/DATABASE_CONTRACT.md).
 */

const FINANCE_PATH = "/manager/finance";

export type ExpenseInput = {
  title: string;
  category: string;
  amount: string | number;
  method: string;
  incurredOn: string;
  recurring: string;
  supplierId?: string;
  notes?: string;
};

export type CashMovementInput = {
  direction: string;
  amount: string | number;
  reason: string;
  date: string;
};

export type CashSessionStartInput = {
  date: string;
  openingBalance: string | number;
  staffId?: string;
  note?: string;
};

export type CashSessionCloseInput = {
  countedBalance: string | number;
  note?: string;
};

type ActionResult = { ok: true } | { ok: false; message: string };

async function parseExpense(input: ExpenseInput, code: DemoBrandCode) {
  const title = text(input.title, "Title", 120);
  if (!title.ok) return title;
  const category = oneOf(input.category, EXPENSE_CATEGORIES, "Category");
  if (!category.ok) return category;
  const amount = money(input.amount, "Amount");
  if (!amount.ok) return amount;
  const method = oneOf(input.method, EXPENSE_METHODS, "Payment method");
  if (!method.ok) return method;
  const incurredOn = day(input.incurredOn, "Date");
  if (!incurredOn.ok) return incurredOn;
  const recurring = oneOf<ExpenseRecurring>(
    input.recurring,
    ["none", "weekly", "monthly"],
    "Recurring period",
  );
  if (!recurring.ok) return recurring;
  const supplierIds = (await suppliersCollection.load(code)).map((s) => s.id);
  const supplierId = refId(input.supplierId, supplierIds, "Supplier");
  if (!supplierId.ok) return supplierId;
  const notes = text(input.notes, "Notes", 500, false);
  if (!notes.ok) return notes;

  return {
    ok: true as const,
    value: {
      title: title.value,
      category: category.value,
      amount: amount.value,
      method: method.value,
      incurredOn: incurredOn.value,
      recurring: recurring.value,
      supplierId: supplierId.value,
      notes: notes.value,
    },
  };
}

export async function saveExpenseAction(
  id: string | null,
  input: ExpenseInput,
): Promise<ActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;
  const parsed = await parseExpense(input, guard.code);
  if (!parsed.ok) return parsed;

  if (id) {
    await expensesCollection.patch(guard.code, id, parsed.value);
    await auditBusinessOps(guard, "expense.updated", "expense", id, parsed.value.title);
  } else {
    const expense: Expense = {
      id: expensesCollection.nextId(),
      brand_id: guard.brandId,
      ...parsed.value,
      created_at: new Date().toISOString(),
    };
    await expensesCollection.append(guard.code, expense);
    await auditBusinessOps(guard, "expense.created", "expense", expense.id, expense.title);
  }

  revalidateBusiness(FINANCE_PATH, `${FINANCE_PATH}/expenses`);
  return { ok: true };
}

export async function deleteExpenseAction(id: string): Promise<ActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;
  const existing = (await expensesCollection.load(guard.code)).find((e) => e.id === id);
  if (!existing) return { ok: false, message: "Expense not found." };
  await expensesCollection.remove(guard.code, id);
  await auditBusinessOps(guard, "expense.deleted", "expense", id, existing.title);
  revalidateBusiness(FINANCE_PATH, `${FINANCE_PATH}/expenses`);
  return { ok: true };
}

async function parseCashMovement(input: CashMovementInput) {
  const direction = oneOf(input.direction, ["in", "out"], "Direction");
  if (!direction.ok) return direction;
  const amount = money(input.amount, "Amount");
  if (!amount.ok) return amount;
  const reason = text(input.reason, "Reason", 120);
  if (!reason.ok) return reason;
  const date = day(input.date, "Date");
  if (!date.ok) return date;

  return {
    ok: true as const,
    value: {
      direction: direction.value,
      amount: amount.value,
      reason: reason.value,
      date: date.value,
    },
  };
}

export async function saveCashMovementAction(
  input: CashMovementInput,
): Promise<ActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;
  const parsed = await parseCashMovement(input);
  if (!parsed.ok) return parsed;

  const movement: CashMovement = {
    id: cashMovementsCollection.nextId(),
    brand_id: guard.brandId,
    ...parsed.value,
    // A manual drawer entry is cash by definition; `source` says where it came from.
    method: "Cash",
    source: "manual",
    refId: null,
  };
  await cashMovementsCollection.append(guard.code, movement);
  await auditBusinessOps(
    guard,
    "cash_movement.created",
    "cash_movement",
    movement.id,
    `${movement.direction} ${movement.amount} — ${movement.reason}`,
  );
  revalidateBusiness(FINANCE_PATH, `${FINANCE_PATH}/cash`);
  return { ok: true };
}

export async function deleteCashMovementAction(id: string): Promise<ActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;
  const existing = (await cashMovementsCollection.load(guard.code)).find((m) => m.id === id);
  if (!existing) return { ok: false, message: "Movement not found." };
  if (existing.source !== "manual") {
    return { ok: false, message: "Only manually added movements can be removed here." };
  }
  await cashMovementsCollection.remove(guard.code, id);
  await auditBusinessOps(guard, "cash_movement.deleted", "cash_movement", id, existing.reason);
  revalidateBusiness(FINANCE_PATH, `${FINANCE_PATH}/cash`);
  return { ok: true };
}

export async function startCashSessionAction(
  input: CashSessionStartInput,
): Promise<ActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;

  const date = day(input.date, "Session date");
  if (!date.ok) return date;
  const openingBalance = money(input.openingBalance, "Opening balance");
  if (!openingBalance.ok) return openingBalance;
  const staffId = refId(input.staffId, (await knownRefs(guard.code)).staffIds, "Staff");
  if (!staffId.ok) return staffId;
  const note = text(input.note, "Note", 200, false);
  if (!note.ok) return note;

  if (date.value > businessDayOf(new Date().toISOString())) {
    return { ok: false, message: "A session cannot start on a future date." };
  }
  const sessions = await cashSessionsCollection.load(guard.code);
  if (sessions.some((s) => s.date === date.value)) {
    return { ok: false, message: "That date already has a cash session." };
  }

  const session: CashSession = {
    id: cashSessionsCollection.nextId(),
    brand_id: guard.brandId,
    date: date.value,
    openingBalance: openingBalance.value,
    countedBalance: null,
    closedAt: null,
    staffId: staffId.value,
    note: note.value,
  };
  await cashSessionsCollection.append(guard.code, session);
  await auditBusinessOps(
    guard,
    "cash_session.started",
    "cash_session",
    session.id,
    `${session.date} opening ${session.openingBalance}`,
  );
  revalidateBusiness(FINANCE_PATH, `${FINANCE_PATH}/cash`);
  return { ok: true };
}

export async function closeCashSessionAction(
  id: string,
  input: CashSessionCloseInput,
): Promise<ActionResult> {
  const guard = await guardBusinessOps();
  if (!guard.ok) return guard;

  const countedBalance = money(input.countedBalance, "Counted balance");
  if (!countedBalance.ok) return countedBalance;
  const note = text(input.note, "Note", 200, false);
  if (!note.ok) return note;

  const sessions = await cashSessionsCollection.load(guard.code);
  const session = sessions.find((s) => s.id === id);
  if (!session) return { ok: false, message: "Cash session not found." };
  if (!isOpenCashSession(session)) {
    return { ok: false, message: "This session is already closed." };
  }

  const movements = await cashMovementsCollection.load(guard.code);
  const expenses = await expensesCollection.load(guard.code);
  const payments = await listDemoPayments(guard.code);
  const summary = summarizeCashDay(
    { payments, expenses, movements },
    session.date,
    sessions,
  );

  await cashSessionsCollection.patch(guard.code, id, {
    countedBalance: countedBalance.value,
    closedAt: new Date().toISOString(),
    note: note.value,
  });
  await auditBusinessOps(
    guard,
    "cash_session.closed",
    "cash_session",
    id,
    `${session.date} counted ${countedBalance.value}, expected ${summary.expected}, variance ${Math.round((countedBalance.value - summary.expected) * 100) / 100}`,
  );
  revalidateBusiness(FINANCE_PATH, `${FINANCE_PATH}/cash`);
  return { ok: true };
}

function receivablesCsv(rows: ReturnType<typeof receivableRows>): string {
  return rowsToCsv(
    ["Bill", "Customer", "Issued", "Total", "Collected", "Due", "Age (days)", "Bucket", "Overdue"],
    rows.map((r) => [
      r.orderNumber,
      r.customerName,
      r.issuedAt.slice(0, 10),
      r.grandTotal,
      r.collected,
      r.due,
      r.ageDays,
      r.bucketLabel,
      r.overdue ? "yes" : "no",
    ]),
  );
}

/**
 * Export of the current receivables list. Reads the same records as the
 * screen, so the file matches what is on screen: demo workspaces export the
 * demo orders and payments, live workspaces export Supabase.
 */
export async function exportReceivablesCsvAction(): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; message: string }
> {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false, message: "Not signed in." };

  if (ws.mode === "demo") {
    const code = toDemoBrandCode(ws.brand.code);
    const [orders, payments] = await Promise.all([
      listDemoOrders(undefined, code),
      listDemoPayments(code),
    ]);
    return {
      ok: true as const,
      csv: receivablesCsv(receivableRows(orders, payments)),
      filename: "receivables.csv",
    };
  }

  const [ordersRes, paymentsRes] = await Promise.all([
    listOrders({ page: 1, pageSize: 100 }),
    listPayments(),
  ]);
  if (ordersRes.error) return { ok: false, message: ordersRes.error };
  return {
    ok: true as const,
    csv: receivablesCsv(receivableRows(ordersRes.data, paymentsRes.data)),
    filename: "receivables.csv",
  };
}
