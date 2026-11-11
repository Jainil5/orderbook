export type Service = {
  id: string;
  brand_id: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  isActive: boolean;
};

export type ServiceJobStatus = "requested" | "scheduled" | "in_progress" | "completed";

export type ServiceJob = {
  id: string;
  brand_id: string;
  serviceId: string;
  customerId: string;
  staffIds: string[];
  status: ServiceJobStatus;
  scheduledAt: string | null;
  notes: string;
};

export type AppointmentStatus = "scheduled" | "completed" | "cancelled";

export type Appointment = {
  id: string;
  brand_id: string;
  title: string;
  customerId: string | null;
  staffIds: string[];
  startsAt: string;
  endsAt: string;
  location: string;
  serviceId: string | null;
  status: AppointmentStatus;
  notes: string;
};

export type FieldVisitStatus = "planned" | "checked_in" | "completed";

export type FieldVisit = {
  id: string;
  brand_id: string;
  customerId: string;
  staffId: string;
  purpose: string;
  status: FieldVisitStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  report: string | null;
};

export type Shift = {
  id: string;
  brand_id: string;
  staffId: string;
  date: string;
  start: string;
  end: string;
  note: string;
};

export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "open" | "in_progress" | "done";

export type Task = {
  id: string;
  brand_id: string;
  title: string;
  description: string;
  assigneeStaffId: string | null;
  customerId: string | null;
  priority: TaskPriority;
  dueAt: string | null;
  status: TaskStatus;
};

/**
 * Sales pipeline stages for project businesses (furniture, fit-outs): an enquiry
 * arrives, a site visit measures it, a quotation goes out, terms are negotiated,
 * and the lead either becomes an order or is written off.
 */
export const LEAD_STAGES = [
  "new",
  "site_visit",
  "quote_sent",
  "negotiating",
  "won",
  "lost",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

export type Lead = {
  id: string;
  brand_id: string;
  contact_name: string;
  phone: string | null;
  email: string | null;
  /** Where the enquiry came from — walk-in, referral, Instagram, IndiaMART… */
  source: string | null;
  requirement: string;
  site_address: string | null;
  stage: LeadStage;
  /** Rough deal size in whole currency units, used to weight the pipeline. */
  estimated_value: number;
  owner_staff_id: string | null;
  next_action_at: string | null;
  /** Quotation number once a quotation has been built from this lead. */
  quotation_number: string | null;
  created_at: string;
};
