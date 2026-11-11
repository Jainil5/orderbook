import type {
  Brand,
  BrandSettings,
  Customer,
  Offer,
  Order,
  OrderItem,
  Payment,
  Product,
} from "@/types/database";
import type { StaffMember } from "@/types/manager";
import type {
  Appointment,
  FieldVisit,
  Lead,
  Service,
  ServiceJob,
  Shift,
  Task,
} from "@/types/operations";

export type DemoBrandPack = {
  brand: Brand;
  settings: BrandSettings;
  products: Product[];
  customers: Customer[];
  orders: Order[];
  orderItems: OrderItem[];
  offers: Offer[];
  payments: Payment[];
  staff: StaffMember[];
  services: Service[];
  serviceJobs: ServiceJob[];
  appointments: Appointment[];
  visits: FieldVisit[];
  shifts: Shift[];
  tasks: Task[];
  /** Sales pipeline for project businesses; empty for counter-service brands. */
  leads: Lead[];
  /** Prefix for demo order numbers, e.g. BC or CF */
  orderNumberPrefix: string;
};
