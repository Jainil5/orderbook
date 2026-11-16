import type { DemoBrandCode } from "@/lib/workspace/constants";
import type { CashMovement, CashSession, Expense } from "@/types/business";

/**
 * Seeded finance records per demo brand (Finance Manager).
 * Owned by the Finance Manager feature area — replace these starter rows with
 * full, realistic per-brand history rather than adding another data source.
 */

const CAFE: { expenses: Expense[]; cashMovements: CashMovement[]; cashSessions: CashSession[] } = {
  expenses: [],
  cashMovements: [],
  cashSessions: [],
};

const FURNITURE: { expenses: Expense[]; cashMovements: CashMovement[]; cashSessions: CashSession[] } = {
  expenses: [],
  cashMovements: [],
  cashSessions: [],
};

const PACKS: Record<
  DemoBrandCode,
  { expenses: Expense[]; cashMovements: CashMovement[]; cashSessions: CashSession[] }
> = {
  "BR-1": CAFE,
  "BR-2": FURNITURE,
};

export function demoExpenses(brandCode: DemoBrandCode): Expense[] {
  return PACKS[brandCode]?.expenses ?? [];
}

export function demoCashMovements(brandCode: DemoBrandCode): CashMovement[] {
  return PACKS[brandCode]?.cashMovements ?? [];
}

export function demoCashSessions(brandCode: DemoBrandCode): CashSession[] {
  return PACKS[brandCode]?.cashSessions ?? [];
}
