import { describe, expect, it } from "vitest";
import type { Customer, Order, Payment, Offer } from "@/types/database";
import type { StaffMember } from "@/types/manager";
import type { PurchaseOrder } from "@/types/procurement";
import type { Appointment, FieldVisit, Lead, ServiceJob, Shift, Task } from "@/types/operations";
import type {
  CustomerComplaint,
  CustomerInteraction,
  CustomerReview,
  CustomerSegment,
  LoyaltyEntry,
  MarketingCampaign,
  Membership,
} from "@/types/crm";
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
function customer(over: Partial<Customer> & Pick<Customer, "id">): Customer {
  return { brand_id: "b", name: "C", email: null, phone: null, ...over };
}
function interaction(
  over: Partial<CustomerInteraction> & Pick<CustomerInteraction, "id" | "occurred_at">,
): CustomerInteraction {
  return {
    brand_id: "b", customer_id: "c", lead_id: null, type: "call", summary: "S",
    detail: null, staff_id: null, outcome: null, next_follow_up_at: null,
    task_id: null, attachment_url: null, ...over,
  };
}
function review(over: Partial<CustomerReview> & Pick<CustomerReview, "id" | "reviewed_at">): CustomerReview {
  return {
    brand_id: "b", customer_id: "c", source: "Google Business Profile", rating: 5,
    text: "T", response_text: null, responded_at: null, sentiment: "positive",
    tags: [], staff_mentioned: null, internal_notes: null, status: "new",
    complaint_id: null, ...over,
  };
}
function complaint(over: Partial<CustomerComplaint> & Pick<CustomerComplaint, "id" | "raised_at">): CustomerComplaint {
  return {
    brand_id: "b", customer_id: "c", review_id: null, interaction_id: null,
    subject: "S", detail: null, severity: "low", status: "open",
    owner_staff_id: null, resolved_at: null, ...over,
  };
}
function segment(over: Partial<CustomerSegment> & Pick<CustomerSegment, "id" | "created_at">): CustomerSegment {
  return {
    brand_id: "b", name: "S", description: "", kind: "manual",
    rules: null, member_ids: [], ...over,
  };
}
function campaign(over: Partial<MarketingCampaign> & Pick<MarketingCampaign, "id" | "created_at" | "updated_at">): MarketingCampaign {
  return {
    brand_id: "b", name: "C", description: "", type: "offer", channel: "in_store",
    segment_id: null, offer_id: null, starts_at: null, ends_at: null,
    status: "draft", consent_required: true, messages_sent: 0, delivered: 0,
    responded: 0, redeemed: 0, revenue_attributed: 0, delivery: "not_connected", ...over,
  };
}
function loyaltyEntry(over: Partial<LoyaltyEntry> & Pick<LoyaltyEntry, "id" | "created_at">): LoyaltyEntry {
  return {
    brand_id: "b", customer_id: "c", kind: "earn", points: 10, reason: "",
    order_id: null, expires_at: null, ...over,
  };
}
function membership(over: Partial<Membership> & Pick<Membership, "id" | "started_at">): Membership {
  return {
    brand_id: "b", customer_id: "c", tier_id: "t", expires_at: null,
    status: "active", notes: null, ...over,
  };
}
function purchaseOrder(
  over: Partial<PurchaseOrder> & Pick<PurchaseOrder, "id" | "created_at">,
): PurchaseOrder {
  return {
    brand_id: "b", number: "PO-1001", vendor_id: "v1", status: "sent",
    sent_at: null, expected_at: null, closed_at: null, note: null, ...over,
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
    customers: [
      customer({
        id: "c1",
        created_at: new Date(2026, 10, 1, 9, 0).toISOString(),
        date_of_birth: "1990-11-02",
      }),
    ],
    interactions: [
      interaction({
        id: "i1",
        occurred_at: new Date(2026, 10, 1, 9, 0).toISOString(),
        next_follow_up_at: new Date(2026, 10, 4, 9, 0).toISOString(),
      }),
      interaction({ id: "i2", occurred_at: new Date(2026, 10, 2, 9, 0).toISOString() }),
    ],
    reviews: [review({ id: "r1", reviewed_at: new Date(2026, 10, 1, 9, 0).toISOString() })],
    complaints: [complaint({ id: "cmp1", raised_at: new Date(2026, 10, 1, 9, 0).toISOString() })],
    segments: [segment({ id: "sg1", created_at: new Date(2026, 10, 1, 9, 0).toISOString() })],
    campaigns: [
      campaign({
        id: "cp1",
        created_at: new Date(2026, 10, 1, 9, 0).toISOString(),
        updated_at: new Date(2026, 10, 2, 9, 0).toISOString(),
        starts_at: new Date(2026, 10, 5, 9, 0).toISOString(),
      }),
    ],
    loyaltyLedger: [
      loyaltyEntry({
        id: "ly1",
        created_at: new Date(2026, 10, 1, 9, 0).toISOString(),
        expires_at: new Date(2027, 10, 1, 9, 0).toISOString(),
      }),
    ],
    memberships: [
      membership({
        id: "mb1",
        started_at: new Date(2026, 10, 1, 9, 0).toISOString(),
        expires_at: new Date(2027, 10, 1, 9, 0).toISOString(),
      }),
    ],
    purchaseOrders: [
      purchaseOrder({
        id: "po1",
        created_at: new Date(2026, 10, 1, 9, 0).toISOString(),
        sent_at: new Date(2026, 10, 1, 9, 30).toISOString(),
        expected_at: new Date(2026, 10, 8, 12, 0).toISOString(),
      }),
      purchaseOrder({
        id: "po2",
        status: "draft",
        created_at: new Date(2026, 10, 10, 9, 0).toISOString(),
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
    expect(out.customers[0].created_at).toBe(new Date(2026, 10, 11, 9, 0).toISOString());
    expect(out.interactions[0].occurred_at).toBe(new Date(2026, 10, 11, 9, 0).toISOString());
    expect(out.interactions[0].next_follow_up_at).toBe(new Date(2026, 10, 14, 9, 0).toISOString());
    expect(out.interactions[1].next_follow_up_at).toBeNull();
    expect(out.reviews[0].reviewed_at).toBe(new Date(2026, 10, 11, 9, 0).toISOString());
    expect(out.complaints[0].raised_at).toBe(new Date(2026, 10, 11, 9, 0).toISOString());
    expect(out.segments[0].created_at).toBe(new Date(2026, 10, 11, 9, 0).toISOString());
    expect(out.campaigns[0].starts_at).toBe(new Date(2026, 10, 15, 9, 0).toISOString());
    expect(out.campaigns[0].ends_at).toBeNull();
    expect(out.loyaltyLedger[0].expires_at).toBe(new Date(2027, 10, 11, 9, 0).toISOString());
    expect(out.memberships[0].started_at).toBe(new Date(2026, 10, 11, 9, 0).toISOString());
    expect(out.purchaseOrders[0].sent_at).toBe(new Date(2026, 10, 11, 9, 30).toISOString());
    // A vendor date in the past stays in the past: +10 days keeps it overdue.
    expect(out.purchaseOrders[0].expected_at).toBe(new Date(2026, 10, 18, 12, 0).toISOString());
    expect(out.purchaseOrders[1].expected_at).toBeNull();
  });

  it("leaves date_of_birth alone so birthdays keep landing in season", () => {
    const stale: DatedPack = { ...base, orders: [base.orders[0]] };
    const out = rebasePackDates(stale, NOW);
    expect(out.customers[0].date_of_birth).toBe("1990-11-02");
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