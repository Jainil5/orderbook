import { describe, expect, it } from "vitest";
import type { Order, Payment, Offer } from "@/types/database";
import type { StaffMember } from "@/types/manager";
import type { Appointment, FieldVisit, Lead, ServiceJob, Shift, Task } from "@/types/operations";
import { computeOffsetDays, rebasePackDates, shiftDayKey, shiftIso, type DatedPack } from "./rebase";

const NOW = new Date(2026, 10, 11, 15, 0, 0);

function order(over: Partial<Order> & Pick<Order, "id" | "created_at">): Order {
  return {
    brand_id: "b", order_number: "X-1", status: "completed", payment_status: "paid",
    customer_id: null, customer_name_snapshot: null, subtotal: 0, discount_total: 0,
    tax_total: 0, fees_total: 0, grand_total: 0, notes: null, ...over,
  };
}
function payment(over: Partial<Payment> & Pick<Payment, "id" | "created_at">): Payment {
  return { brand_id: "b", order_id: "o1", amount: 0, method: "UPI", status: "paid", ...over };
}
function offer(over: Partial<Offer> & Pick<Offer, "id">): Offer {
  return {
    brand_id: "b", name: "F", code: null, discount_type: "percent", discount_value: 0,
    scope: "order", scope_value: null, min_order_amount: null, max_discount: null,
    starts_at: null, ends_at: null, is_active: true, redemption_count: 0, usage_limit: null, ...over,
  };
}
function staff(over: Partial<StaffMember> & Pick<StaffMember, "id" | "created_at">): StaffMember {
  return { brand_id: "b", name: "S", role: "cashier", phone: null, email: null, status: "active", availability: "available", ...over };
}
function job(over: Partial<ServiceJob> & Pick<ServiceJob, "id">): ServiceJob {
  return { brand_id: "b", serviceId: "svc", customerId: "c", staffIds: [], status: "scheduled", scheduledAt: null, notes: "", ...over };
}
function appointment(over: Partial<Appointment> & Pick<Appointment, "id" | "startsAt" | "endsAt">): Appointment {
  return { brand_id: "b", title: "A", customerId: null, staffIds: [], location: "", serviceId: null, status: "scheduled", notes: "", ...over };
}
function visit(over: Partial<FieldVisit> & Pick<FieldVisit, "id">): FieldVisit {
  return { brand_id: "b", customerId: "c", staffId: "s", purpose: "", status: "planned", checkInAt: null, checkOutAt: null, report: null, ...over };
}
function task(over: Partial<Task> & Pick<Task, "id">): Task {
  return { brand_id: "b", title: "T", description: "", assigneeStaffId: null, customerId: null, priority: "low", dueAt: null, status: "open", ...over };
}
function shift(over: Partial<Shift> & Pick<Shift, "id" | "date">): Shift {
  return { brand_id: "b", staffId: "s", start: "08:00", end: "16:00", note: "", ...over };
}
function lead(over: Partial<Lead> & Pick<Lead, "id" | "created_at">): Lead {
  return {
    brand_id: "b", contact_name: "L", phone: null, email: null, source: null,
    requirement: "", site_address: null, stage: "new", estimated_value: 0,
    owner_staff_id: null, next_action_at: null, quotation_number: null, ...over,
  };
}

describe("shift helpers", () => {
  it("shiftIso adds whole days preserving time", () => {
    expect(shiftIso("2026-11-01T09:30:00.000Z", 3)).toBe("2026-11-04T09:30:00.000Z");
  });
  it("shiftDayKey shifts YYYY-MM-DD", () => {
    expect(shiftDayKey("2026-11-01", 10)).toBe("2026-11-11");
  });
  it("computeOffsetDays: newest order today → 0", () => {
    expect(computeOffsetDays(new Date(2026, 10, 11, 9, 0).toISOString(), NOW)).toBe(0);
  });
  it("computeOffsetDays: newest order 10 days ago → 10", () => {
    expect(computeOffsetDays(new Date(2026, 10, 1, 9, 0).toISOString(), NOW)).toBe(10);
  });
});

describe("rebasePackDates", () => {
  const base: DatedPack = {
    orders: [
      order({ id: "o1", created_at: new Date(2026, 10, 1, 9, 0).toISOString(), service_date: "2026-11-01" }),
      order({ id: "o2", created_at: new Date(2026, 10, 11, 8, 0).toISOString(), service_date: null }),
    ],
    payments: [payment({ id: "p1", created_at: new Date(2026, 10, 1, 9, 5).toISOString() })],
    offers: [offer({ id: "f1" })],
    staff: [staff({ id: "s1", created_at: "2026-10-01T09:00:00.000Z" })],
    serviceJobs: [job({ id: "j1", scheduledAt: new Date(2026, 10, 13, 10, 0).toISOString() })],
    appointments: [appointment({ id: "a1", startsAt: new Date(2026, 10, 11, 16, 0).toISOString(), endsAt: new Date(2026, 10, 11, 17, 0).toISOString() })],
    visits: [visit({ id: "v1" })],
    tasks: [task({ id: "t1", dueAt: new Date(2026, 10, 12, 10, 0).toISOString() })],
    shifts: [shift({ id: "sh1", date: "2026-11-11" })],
    leads: [
      lead({
        id: "l1",
        created_at: new Date(2026, 10, 1, 9, 0).toISOString(),
        next_action_at: new Date(2026, 10, 2, 11, 0).toISOString(),
      }),
    ],
  };

  it("offset 0 returns equal data", () => {
    const out = rebasePackDates(base, NOW);
    expect(out.orders[0].created_at).toBe(base.orders[0].created_at);
    expect(out.shifts[0].date).toBe("2026-11-11");
  });

  it("shifts every dated field by the offset and keeps nulls", () => {
    const stale: DatedPack = {
      ...base,
      orders: [base.orders[0]],
      payments: [],
      appointments: [],
      serviceJobs: [],
      tasks: [],
      shifts: [shift({ id: "sh1", date: "2026-11-01" })],
    };
    const out = rebasePackDates(stale, NOW);
    expect(out.orders[0].created_at).toBe(new Date(2026, 10, 11, 9, 0).toISOString());
    expect(out.orders[0].service_date).toBe("2026-11-11");
    expect(out.shifts[0].date).toBe("2026-11-11");
    expect(out.staff[0].created_at).toBe("2026-10-11T09:00:00.000Z");
    expect(out.visits[0].checkInAt).toBeNull();
    expect(out.offers[0].starts_at).toBeNull();
    expect(out.leads[0].created_at).toBe(new Date(2026, 10, 11, 9, 0).toISOString());
    expect(out.leads[0].next_action_at).toBe(new Date(2026, 10, 12, 11, 0).toISOString());
  });

  it("keeps a lead with no follow-up date free of one", () => {
    const stale: DatedPack = {
      ...base,
      orders: [base.orders[0]],
      leads: [lead({ id: "l2", created_at: new Date(2026, 10, 1, 9, 0).toISOString() })],
    };
    const out = rebasePackDates(stale, NOW);
    expect(out.leads[0].next_action_at).toBeNull();
  });

  it("shifts appointments, jobs, tasks and payments when stale", () => {
    const stale: DatedPack = {
      ...base,
      orders: [base.orders[0]],
      appointments: [appointment({ id: "a1", startsAt: new Date(2026, 10, 1, 16, 0).toISOString(), endsAt: new Date(2026, 10, 1, 17, 0).toISOString() })],
      serviceJobs: [job({ id: "j1", scheduledAt: new Date(2026, 10, 3, 10, 0).toISOString() })],
      tasks: [task({ id: "t1", dueAt: new Date(2026, 10, 2, 10, 0).toISOString() })],
    };
    const out = rebasePackDates(stale, NOW);
    expect(out.appointments[0].startsAt).toBe(new Date(2026, 10, 11, 16, 0).toISOString());
    expect(out.serviceJobs[0].scheduledAt).toBe(new Date(2026, 10, 13, 10, 0).toISOString());
    expect(out.tasks[0].dueAt).toBe(new Date(2026, 10, 12, 10, 0).toISOString());
    expect(out.payments[0].created_at).toBe(new Date(2026, 10, 11, 9, 5).toISOString());
  });

  it("does not mutate the input", () => {
    const stale: DatedPack = { ...base, orders: [{ ...base.orders[0] }] };
    const before = stale.orders[0].created_at;
    rebasePackDates(stale, NOW);
    expect(stale.orders[0].created_at).toBe(before);
  });

  it("empty orders → unchanged pack", () => {
    const empty: DatedPack = { ...base, orders: [] };
    expect(rebasePackDates(empty, NOW)).toBe(empty);
  });
});