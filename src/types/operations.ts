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