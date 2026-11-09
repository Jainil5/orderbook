import type { Appointment, AppointmentStatus } from "@/types/operations";
import { localDayKey } from "./time";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type AppointmentInput = {
  title: string;
  customerId?: string;
  staffIds: string[];
  startsAt: string;
  endsAt: string;
  location?: string;
  serviceId?: string;
  notes?: string;
};

export function validateAppointmentInput(
  input: AppointmentInput,
  known: { customerIds: string[]; staffIds: string[]; serviceIds: string[] },
):
  | { ok: true; value: { title: string; customerId: string | null; staffIds: string[]; startsAt: string; endsAt: string; location: string; serviceId: string | null; notes: string } }
  | { ok: false; message: string } {
  const title = input.title.trim().slice(0, 120);
  if (!title) return { ok: false, message: "Title is required." };
  const start = new Date(input.startsAt);
  const end = new Date(input.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, message: "Enter valid start and end times." };
  }
  if (end.getTime() <= start.getTime()) return { ok: false, message: "End must be after start." };
  const customerId = input.customerId?.trim() || null;
  if (customerId && !known.customerIds.includes(customerId)) {
    return { ok: false, message: "Pick a valid customer." };
  }
  if (input.staffIds.some((id) => !known.staffIds.includes(id))) {
    return { ok: false, message: "Pick valid staff members." };
  }
  const serviceId = input.serviceId?.trim() || null;
  if (serviceId && !known.serviceIds.includes(serviceId)) {
    return { ok: false, message: "Pick a valid service." };
  }
  return {
    ok: true,
    value: {
      title,
      customerId,
      staffIds: input.staffIds,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      location: (input.location ?? "").trim().slice(0, 160),
      serviceId,
      notes: (input.notes ?? "").trim().slice(0, 300),
    },
  };
}

export function appointmentsForDay(list: Appointment[], day: string): Appointment[] {
  // `day` is a local day key (see `localDayKey`); stored starts are UTC ISO.
  return list
    .filter((a) => localDayKey(new Date(a.startsAt)) === day)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export function groupAppointments(
  list: Appointment[],
  now: Date,
): { today: Appointment[]; upcoming: Appointment[]; past: Appointment[] } {
  const today = localDayKey(now);
  const sorted = [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return {
    today: sorted.filter((a) => localDayKey(new Date(a.startsAt)) === today),
    upcoming: sorted.filter((a) => localDayKey(new Date(a.startsAt)) > today),
    past: sorted.filter((a) => localDayKey(new Date(a.startsAt)) < today),
  };
}
