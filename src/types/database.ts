/** Core entity types for the CSV-backed demo dataset (data/demo/<brand>/*.csv). */

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
  /** When true, Billing shows quotation builder (save quote + quotation PDF). */
  quotation_builder_enabled?: boolean;
  /** Public catalog or brand site (https) — shown as a header link across the workspace. */
  brand_website_url?: string | null;
  /** When true, POS blocks adding products with stock_qty <= 0 */
  block_oversell?: boolean;
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
  /** Optional default percent off list price (0–100), applied in Billing. */
  default_discount_percent?: number | null;
  /** HTTPS URL to a product photo shown in POS and product list. */
  image_url?: string | null;
  /** Optional inventory (app-level). */
  stock_qty?: number | null;
  low_stock_threshold?: number | null;
  wholesale_price?: number | null;
  modifiers_json?: ProductModifier[] | null;
  /** Catalog flag: cashier cannot add it to a bill (Billing shows NA). */
  unavailable?: boolean;
};

export type ProductModifier = {
  id: string;
  name: string;
  price: number;
};

export type ProductUpsertInput = {
  name: string;
  description?: string | null;
  sku?: string | null;
  category?: string | null;
  price: number;
  cost_price?: number | null | string;
  unit?: string | null;
  is_active?: boolean;
  default_discount_percent?: number | null | string;
  image_url?: string | null;
  stock_qty?: number | null | string;
  low_stock_threshold?: number | null | string;
  wholesale_price?: number | null | string;
  modifiers_json?: ProductModifier[] | null;
};

export type CustomerUpsertInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  price_tier?: "retail" | "wholesale" | null;
};

export type Customer = {
  id: string;
  brand_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes?: string | null;
  price_tier?: "retail" | "wholesale" | null;
};

export type OrderStatus =
  | "draft"
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "refunded";

export type OrderType = "dine_in" | "takeaway" | "delivery" | "online";

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
  table_tag?: string | null;
  delivery_notes?: string | null;
  order_type?: OrderType | null;
  /** Local calendar day YYYY-MM-DD chosen at billing; defaults to today. */
  service_date?: string | null;
  guests?: number | null;
  delivery_address?: string | null;
  /** Method chosen at billing; null means payment still pending. */
  payment_method?: string | null;
  payment_reference?: string | null;
  deposit_percent?: number | null;
  amount_paid?: number | null;
  offer_code_snapshot?: string | null;
  /** Token for public quotation accept link */
  public_token?: string | null;
  parent_order_id?: string | null;
  order_kind?: "sale" | "credit_note" | null;
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
  /** Snapshot at order time; used on quotation PDFs when present */
  product_image_url_snapshot?: string | null;
  modifier_labels?: string | null;
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
  split_label?: string | null;
  notes?: string | null;
};

export type Refund = {
  id: string;
  brand_id: string;
  order_id: string;
  payment_id: string | null;
  amount: number;
  reason: string | null;
  created_at: string;
};

export type StockAdjustment = {
  id: string;
  brand_id: string;
  product_id: string;
  delta_qty: number;
  reason: string;
  created_at: string;
};

export type CreateOrderLineInput = {
  productId: string;
  quantity: number;
  /** Total discount amount for this line (product default + adjustments). */
  lineDiscount?: number;
  modifierIds?: string[];
};

export type OrderDiscountInput = {
  type: "percent" | "fixed";
  value: number;
};

export type CreateOrderInput = {
  customerId: string | null;
  customerPhone?: string | null;
  walkInName?: string;
  notes?: string;
  lines: CreateOrderLineInput[];
  offerCode?: string;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  /** Quotation document mode only — bills always save as pending orders. */
  saveAsQuote?: boolean;
  /** Optional extra discount on the order subtotal (after line/product discounts). */
  orderDiscount?: OrderDiscountInput | null;
  tableTag?: string;
  deliveryNotes?: string;
  depositPercent?: number | null;
  priceTier?: "retail" | "wholesale";
  orderType?: OrderType;
  serviceDate?: string;
  guests?: number | null;
  deliveryAddress?: string;
  paymentReference?: string;
};

export type OfferUpsertInput = {
  name: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  scope: "order" | "product" | "category";
  scope_value?: string | null;
  min_order_amount?: number | null;
  max_discount?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_active?: boolean;
  usage_limit?: number | null;
};

export type RecordPaymentInput = {
  orderId: string;
  amount: number;
  method: string;
  splitLabel?: string;
  notes?: string;
};

export type RecordRefundInput = {
  orderId: string;
  amount: number;
  reason: string;
  paymentId?: string | null;
};

export type StockAdjustmentInput = {
  productId: string;
  deltaQty: number;
  reason: string;
};

export type AuditLogEntry = {
  id: string;
  brand_id: string;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  detail: string | null;
  created_at: string;
};

export type CreateOrderResult =
  | { ok: true; orderId: string; orderNumber: string }
  | { ok: false; code: "NOT_CONFIGURED" | "VALIDATION" | "UNKNOWN"; message: string };
