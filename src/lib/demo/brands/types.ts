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

export type DemoAnalytics = {
  grossSales: number;
  netSales: number;
  orderCount: number;
  averageOrderValue: number;
  itemsSold: number;
  discountTotal: number;
  paidAmount: number;
  pendingAmount: number;
  salesByCategory: { category: string; total: number }[];
  salesOverTime: { date: string; total: number; orders: number }[];
  topProducts: { name: string; qty: number }[];
  paymentMethods: { method: string; total: number }[];
};

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
  analytics: DemoAnalytics;
  /** Prefix for demo order numbers, e.g. BC or CF */
  orderNumberPrefix: string;
};
