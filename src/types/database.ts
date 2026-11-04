/** Logical types aligned with docs/DATABASE_CONTRACT.md — adjust when Supabase types are generated. */

export type BrandRole = "owner" | "admin" | "manager" | "staff";

export type Brand = {
  id: string;
  code: string;
  name: string;
  created_at?: string;
};

export type BrandMember = {
  id: string;
  brand_id: string;
  user_id: string;
  role: BrandRole;
  is_active?: boolean;
};

export type BrandSettings = {
  brand_id: string;
  currency_code: string;
  tax_rate_percent?: number;
  receipt_header?: string | null;
  receipt_footer?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
};

export type Product = {
  id: string;
  brand_id: string;
  name: string;
  description: string | null;
  sku: string | null;
  category: string | null;
  price: number;
  cost_price?: number | null;
  unit: string | null;
  is_active: boolean;
};

export type Customer = {
  id: string;
  brand_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes?: string | null;
};

export type OrderStatus =
  | "draft"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "refunded";

export type PaymentStatus =
  | "pending"
  | "partial"
  | "paid"
  | "failed"
  | "refunded";

export type Order = {
  id: string;
  brand_id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  customer_id: string | null;
  customer_name_snapshot: string | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  fees_total: number;
  grand_total: number;
  notes: string | null;
  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  quantity: number;
  unit_price: number;
  line_discount: number;
  line_total: number;
};

export type Offer = {
  id: string;
  brand_id: string;
  name: string;
  code: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  scope: "order" | "product" | "category";
  scope_value: string | null;
  min_order_amount: number | null;
  max_discount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  redemption_count: number;
  usage_limit: number | null;
};

export type Payment = {
  id: string;
  brand_id: string;
  order_id: string;
  amount: number;
  method: string;
  status: PaymentStatus;
  created_at: string;
};

export type CreateOrderLineInput = {
  productId: string;
  quantity: number;
};

export type CreateOrderInput = {
  customerId: string | null;
  walkInName?: string;
  notes?: string;
  lines: CreateOrderLineInput[];
  offerCode?: string;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
};

export type CreateOrderResult =
  | { ok: true; orderId: string; orderNumber: string }
  | { ok: false; code: "NOT_CONFIGURED" | "VALIDATION" | "UNKNOWN"; message: string };
