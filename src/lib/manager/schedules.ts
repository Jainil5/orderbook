import type { Shift } from "@/types/operations";
import { localDayKey, localTimeKey } from "./time";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ShiftInput = {
  staffId: string;
  date: string;
  start: string;
  end: string;
  note?: string;
};

export function validateShiftInput(
  input: ShiftInput,
  staffIds: string[],
):
  | { ok: true; value: { staffId: string; date: string; start: string; end: string; note: string } }
  | { ok: false; message: string } {
  if (!staffIds.includes(input.staffId)) return { ok: false, message: "Pick a valid staff member." };
  if (!DATE_RE.test(input.date) || Number.isNaN(Date.parse(input.date))) {
    return { ok: false, message: "Enter a valid date." };
  }
  if (!TIME_RE.test(input.start) || !TIME_RE.test(input.end)) {
    return { ok: false, message: "Enter valid times (HH:mm)." };
  }
  if (input.end <= input.start) return { ok: false, message: "End must be after start." };
  return {
    ok: true,
    value: {
      staffId: input.staffId,
      date: input.date,
      start: input.start,
      end: input.end,
      note: (input.note ?? "").trim().slice(0, 120),
    },
  };
}

export function isOnShift(shift: Shift, now: Date): boolean {
  // Shift windows are wall-clock times in the manager's zone, so the day and
  // the HH:mm comparison both have to come from local getters.
  if (shift.date !== localDayKey(now)) return false;
  const hm = localTimeKey(now);
  return shift.start <= hm && hm < shift.end;
}

export function weekDays(anchor: Date): string[] {
  const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return localDayKey(day);
  });
}
