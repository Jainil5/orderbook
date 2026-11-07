import type { StaffAvailability, StaffMember, StaffRole } from "@/types/manager";

export const STAFF_ROLES: StaffRole[] = [
  "manager",
  "cashier",
  "kitchen",
  "technician",
  "sales",
  "other",
];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  manager: "Manager",
  cashier: "Cashier",
  kitchen: "Kitchen",
  technician: "Technician",
  sales: "Sales",
  other: "Other",
};

export const STAFF_AVAILABILITY_LABELS: Record<StaffAvailability, string> = {
  available: "Available",
  busy: "Busy",
  off: "Off duty",
};

export type StaffInput = {
  name: string;
  role: string;
  phone?: string;
  email?: string;
};

export function validateStaffInput(
  input: StaffInput,
):
  | { ok: true; value: { name: string; role: StaffRole; phone: string | null; email: string | null } }
  | { ok: false; message: string } {
  const name = input.name.trim().slice(0, 120);
  if (!name) return { ok: false, message: "Name is required." };
  if (!STAFF_ROLES.includes(input.role as StaffRole)) {
    return { ok: false, message: "Pick a valid role." };
  }
  return {
    ok: true,
    value: {
      name,
      role: input.role as StaffRole,
      phone: input.phone?.trim().slice(0, 40) || null,
      email: input.email?.trim().slice(0, 120) || null,
    },
  };
}

export function mergeStaff(
  base: StaffMember[],
  additions: StaffMember[],
  overrides: Record<string, Partial<StaffMember>>,
): StaffMember[] {
  const byId = new Map<string, StaffMember>();
  for (const m of [...base, ...additions]) {
    byId.set(m.id, { ...m, ...overrides[m.id] });
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function staffAvailabilitySummary(staff: StaffMember[]) {
  const active = staff.filter((m) => m.status === "active");
  return {
    active: active.length,
    available: active.filter((m) => m.availability === "available").length,
    busy: active.filter((m) => m.availability === "busy").length,
    off: active.filter((m) => m.availability === "off").length,
  };
}