export type StaffRole =
  | "manager"
  | "cashier"
  | "kitchen"
  | "technician"
  | "sales"
  | "other";

export type StaffAvailability = "available" | "busy" | "off";

export type StaffMember = {
  id: string;
  brand_id: string;
  name: string;
  role: StaffRole;
  phone: string | null;
  email: string | null;
  status: "active" | "inactive";
  availability: StaffAvailability;
  created_at: string;
};