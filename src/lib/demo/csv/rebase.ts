import type { DemoBrandPack } from "@/lib/demo/brands/types";

const DAY_MS = 86400000;

export type DatedPack = Pick<
  DemoBrandPack,
  | "orders"
  | "payments"
  | "offers"
  | "staff"
  | "serviceJobs"
  | "appointments"
  | "visits"
  | "tasks"
  | "shifts"
  | "leads"
  | "customers"
  | "interactions"
  | "reviews"
  | "complaints"
  | "segments"
  | "campaigns"
  | "loyaltyLedger"
  | "memberships"
  | "purchaseOrders"
>;

function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function shiftIso(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const shifted = new Date(y, m - 1, d + days);
  const mm = String(shifted.getMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getDate()).padStart(2, "0");
  return `${shifted.getFullYear()}-${mm}-${dd}`;
}

export function computeOffsetDays(maxIso: string, now: Date): number {
  return Math.round((startOfDayMs(now) - startOfDayMs(new Date(maxIso))) / DAY_MS);
}

function shiftNullableIso(v: string | null | undefined, days: number): string | null {
  return v == null ? null : shiftIso(v, days);
}

/**
 * Frozen CSV dates stay fresh: shift every timestamp so the newest order
 * lands on the current local day. Pure — returns a new pack, never mutates.
 */
export function rebasePackDates<T extends DatedPack>(pack: T, now: Date = new Date()): T {
  if (pack.orders.length === 0) return pack;
  const maxIso = pack.orders.reduce(
    (max, o) => (o.created_at > max ? o.created_at : max),
    pack.orders[0].created_at,
  );
  const days = computeOffsetDays(maxIso, now);
  if (days === 0) return pack;
  return {
    ...pack,
    orders: pack.orders.map((o) => ({
      ...o,
      created_at: shiftIso(o.created_at, days),
      service_date: o.service_date ? shiftDayKey(o.service_date, days) : o.service_date,
    })),
    payments: pack.payments.map((p) => ({ ...p, created_at: shiftIso(p.created_at, days) })),
    offers: pack.offers.map((f) => ({
      ...f,
      starts_at: shiftNullableIso(f.starts_at, days),
      ends_at: shiftNullableIso(f.ends_at, days),
    })),
    staff: pack.staff.map((s) => ({ ...s, created_at: shiftIso(s.created_at, days) })),
    serviceJobs: pack.serviceJobs.map((j) => ({
      ...j,
      scheduledAt: shiftNullableIso(j.scheduledAt, days),
    })),
    appointments: pack.appointments.map((a) => ({
      ...a,
      startsAt: shiftIso(a.startsAt, days),
      endsAt: shiftIso(a.endsAt, days),
    })),
    visits: pack.visits.map((v) => ({
      ...v,
      checkInAt: shiftNullableIso(v.checkInAt, days),
      checkOutAt: shiftNullableIso(v.checkOutAt, days),
    })),
    tasks: pack.tasks.map((t) => ({ ...t, dueAt: shiftNullableIso(t.dueAt, days) })),
    shifts: pack.shifts.map((s) => ({ ...s, date: shiftDayKey(s.date, days) })),
    leads: pack.leads.map((l) => ({
      ...l,
      created_at: shiftIso(l.created_at, days),
      next_action_at: shiftNullableIso(l.next_action_at, days),
      converted_at: shiftNullableIso(l.converted_at, days),
    })),
    // `date_of_birth` is deliberately left alone: it is month/day data, and
    // shifting it would sweep every birthday off the calendar each run.
    customers: pack.customers.map((c) => ({
      ...c,
      created_at: shiftNullableIso(c.created_at, days),
    })),
    interactions: pack.interactions.map((i) => ({
      ...i,
      occurred_at: shiftIso(i.occurred_at, days),
      next_follow_up_at: shiftNullableIso(i.next_follow_up_at, days),
    })),
    reviews: pack.reviews.map((r) => ({
      ...r,
      reviewed_at: shiftIso(r.reviewed_at, days),
      responded_at: shiftNullableIso(r.responded_at, days),
    })),
    complaints: pack.complaints.map((c) => ({
      ...c,
      raised_at: shiftIso(c.raised_at, days),
      resolved_at: shiftNullableIso(c.resolved_at, days),
    })),
    segments: pack.segments.map((s) => ({
      ...s,
      created_at: shiftIso(s.created_at, days),
    })),
    campaigns: pack.campaigns.map((c) => ({
      ...c,
      starts_at: shiftNullableIso(c.starts_at, days),
      ends_at: shiftNullableIso(c.ends_at, days),
      created_at: shiftIso(c.created_at, days),
      updated_at: shiftIso(c.updated_at, days),
    })),
    loyaltyLedger: pack.loyaltyLedger.map((e) => ({
      ...e,
      created_at: shiftIso(e.created_at, days),
      expires_at: shiftNullableIso(e.expires_at, days),
    })),
    memberships: pack.memberships.map((m) => ({
      ...m,
      started_at: shiftIso(m.started_at, days),
      expires_at: shiftNullableIso(m.expires_at, days),
    })),
    // A purchase order keeps its story: how long ago it was sent, and whether
    // the vendor's promised date has already gone by.
    purchaseOrders: pack.purchaseOrders.map((po) => ({
      ...po,
      created_at: shiftIso(po.created_at, days),
      sent_at: shiftNullableIso(po.sent_at, days),
      expected_at: shiftNullableIso(po.expected_at, days),
      closed_at: shiftNullableIso(po.closed_at, days),
    })),
  };
}