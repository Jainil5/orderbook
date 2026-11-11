import type {
  Brand,
  BrandSettings,
  Customer,
  Offer,
  Order,
  OrderItem,
  Payment,
  Product,
  ProductModifier,
} from "@/types/database";
import type { StaffMember } from "@/types/manager";
import type {
  Appointment,
  FieldVisit,
  Lead,
  LeadStage,
  Service,
  ServiceJob,
  Shift,
  Task,
} from "@/types/operations";
import { LEAD_STAGES } from "@/types/operations";
import { bool, json, num, reqNum, reqStr, str, type CsvRow } from "./parse-csv";

export function mapBrand(
  r: CsvRow,
  source: string,
): { brand: Brand; orderNumberPrefix: string } {
  return {
    brand: {
      id: reqStr(r.id, "id", source),
      code: reqStr(r.code, "code", source),
      name: reqStr(r.name, "name", source),
    },
    orderNumberPrefix: reqStr(r.order_number_prefix, "order_number_prefix", source),
  };
}

export function mapBrandSettings(r: CsvRow, source: string): BrandSettings {
  return {
    brand_id: reqStr(r.brand_id, "brand_id", source),
    currency_code: reqStr(r.currency_code, "currency_code", source),
    tax_rate_percent: num(r.tax_rate_percent, "tax_rate_percent", source) ?? undefined,
    receipt_header: str(r.receipt_header),
    receipt_footer: str(r.receipt_footer),
    contact_email: str(r.contact_email),
    contact_phone: str(r.contact_phone),
    quotation_builder_enabled:
      r.quotation_builder_enabled === "" ? undefined : bool(r.quotation_builder_enabled),
    brand_website_url: str(r.brand_website_url),
    block_oversell: r.block_oversell === "" ? undefined : bool(r.block_oversell),
  };
}

export function mapProduct(r: CsvRow, source: string): Product {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    name: reqStr(r.name, "name", source),
    description: str(r.description),
    sku: str(r.sku),
    category: str(r.category),
    price: reqNum(r.price, "price", source),
    cost_price: num(r.cost_price, "cost_price", source),
    unit: str(r.unit),
    is_active: bool(r.is_active),
    default_discount_percent: num(r.default_discount_percent, "default_discount_percent", source),
    image_url: str(r.image_url),
    stock_qty: num(r.stock_qty, "stock_qty", source),
    low_stock_threshold: num(r.low_stock_threshold, "low_stock_threshold", source),
    wholesale_price: num(r.wholesale_price, "wholesale_price", source),
    modifiers_json: json<ProductModifier[]>(r.modifiers_json),
    unavailable: r.unavailable === "" ? undefined : bool(r.unavailable),
  };
}

export function mapCustomer(r: CsvRow, source: string): Customer {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    name: reqStr(r.name, "name", source),
    email: str(r.email),
    phone: str(r.phone),
    notes: str(r.notes),
    price_tier: r.price_tier === "" ? null : (r.price_tier as Customer["price_tier"]),
  };
}

export function mapOrder(r: CsvRow, source: string): Order {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    order_number: reqStr(r.order_number, "order_number", source),
    status: reqStr(r.status, "status", source) as Order["status"],
    payment_status: reqStr(r.payment_status, "payment_status", source) as Order["payment_status"],
    customer_id: str(r.customer_id),
    customer_name_snapshot: str(r.customer_name_snapshot),
    subtotal: reqNum(r.subtotal, "subtotal", source),
    discount_total: reqNum(r.discount_total, "discount_total", source),
    tax_total: reqNum(r.tax_total, "tax_total", source),
    fees_total: reqNum(r.fees_total, "fees_total", source),
    grand_total: reqNum(r.grand_total, "grand_total", source),
    notes: str(r.notes),
    created_at: reqStr(r.created_at, "created_at", source),
    table_tag: str(r.table_tag),
    delivery_notes: str(r.delivery_notes),
    order_type: r.order_type === "" ? null : (r.order_type as Order["order_type"]),
    service_date: str(r.service_date),
    guests: num(r.guests, "guests", source),
    delivery_address: str(r.delivery_address),
    payment_method: str(r.payment_method),
    payment_reference: str(r.payment_reference),
    deposit_percent: num(r.deposit_percent, "deposit_percent", source),
    amount_paid: num(r.amount_paid, "amount_paid", source),
    offer_code_snapshot: str(r.offer_code_snapshot),
    public_token: str(r.public_token),
    parent_order_id: str(r.parent_order_id),
    order_kind: r.order_kind === "" ? null : (r.order_kind as Order["order_kind"]),
  };
}

export function mapOrderItem(r: CsvRow, source: string): OrderItem {
  return {
    id: reqStr(r.id, "id", source),
    order_id: reqStr(r.order_id, "order_id", source),
    product_id: str(r.product_id),
    product_name_snapshot: reqStr(r.product_name_snapshot, "product_name_snapshot", source),
    quantity: reqNum(r.quantity, "quantity", source),
    unit_price: reqNum(r.unit_price, "unit_price", source),
    line_discount: reqNum(r.line_discount, "line_discount", source),
    line_total: reqNum(r.line_total, "line_total", source),
    product_image_url_snapshot: str(r.product_image_url_snapshot),
    modifier_labels: str(r.modifier_labels),
  };
}

export function mapPayment(r: CsvRow, source: string): Payment {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    order_id: reqStr(r.order_id, "order_id", source),
    amount: reqNum(r.amount, "amount", source),
    method: reqStr(r.method, "method", source),
    status: reqStr(r.status, "status", source) as Payment["status"],
    created_at: reqStr(r.created_at, "created_at", source),
    split_label: str(r.split_label),
    notes: str(r.notes),
  };
}

export function mapOffer(r: CsvRow, source: string): Offer {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    name: reqStr(r.name, "name", source),
    code: str(r.code),
    discount_type: reqStr(r.discount_type, "discount_type", source) as Offer["discount_type"],
    discount_value: reqNum(r.discount_value, "discount_value", source),
    scope: reqStr(r.scope, "scope", source) as Offer["scope"],
    scope_value: str(r.scope_value),
    min_order_amount: num(r.min_order_amount, "min_order_amount", source),
    max_discount: num(r.max_discount, "max_discount", source),
    starts_at: str(r.starts_at),
    ends_at: str(r.ends_at),
    is_active: bool(r.is_active),
    redemption_count: reqNum(r.redemption_count, "redemption_count", source),
    usage_limit: num(r.usage_limit, "usage_limit", source),
  };
}

export function mapStaff(r: CsvRow, source: string): StaffMember {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    name: reqStr(r.name, "name", source),
    role: reqStr(r.role, "role", source) as StaffMember["role"],
    phone: str(r.phone),
    email: str(r.email),
    status: reqStr(r.status, "status", source) as StaffMember["status"],
    availability: reqStr(r.availability, "availability", source) as StaffMember["availability"],
    created_at: reqStr(r.created_at, "created_at", source),
  };
}

export function mapService(r: CsvRow, source: string): Service {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    name: reqStr(r.name, "name", source),
    description: r.description,
    durationMinutes: reqNum(r.durationMinutes, "durationMinutes", source),
    price: reqNum(r.price, "price", source),
    isActive: bool(r.isActive),
  };
}

export function mapServiceJob(r: CsvRow, source: string): ServiceJob {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    serviceId: reqStr(r.serviceId, "serviceId", source),
    customerId: reqStr(r.customerId, "customerId", source),
    staffIds: json<string[]>(r.staff_ids) ?? [],
    status: reqStr(r.status, "status", source) as ServiceJob["status"],
    scheduledAt: str(r.scheduledAt),
    notes: r.notes,
  };
}

export function mapAppointment(r: CsvRow, source: string): Appointment {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    title: reqStr(r.title, "title", source),
    customerId: str(r.customerId),
    staffIds: json<string[]>(r.staff_ids) ?? [],
    startsAt: reqStr(r.startsAt, "startsAt", source),
    endsAt: reqStr(r.endsAt, "endsAt", source),
    location: r.location,
    serviceId: str(r.serviceId),
    status: reqStr(r.status, "status", source) as Appointment["status"],
    notes: r.notes,
  };
}

export function mapFieldVisit(r: CsvRow, source: string): FieldVisit {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    customerId: reqStr(r.customerId, "customerId", source),
    staffId: reqStr(r.staffId, "staffId", source),
    purpose: r.purpose,
    status: reqStr(r.status, "status", source) as FieldVisit["status"],
    checkInAt: str(r.checkInAt),
    checkOutAt: str(r.checkOutAt),
    report: str(r.report),
  };
}

export function mapShift(r: CsvRow, source: string): Shift {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    staffId: reqStr(r.staffId, "staffId", source),
    date: reqStr(r.date, "date", source),
    start: reqStr(r.start, "start", source),
    end: reqStr(r.end, "end", source),
    note: r.note,
  };
}

export function mapTask(r: CsvRow, source: string): Task {
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    title: reqStr(r.title, "title", source),
    description: r.description,
    assigneeStaffId: str(r.assigneeStaffId),
    customerId: str(r.customerId),
    priority: reqStr(r.priority, "priority", source) as Task["priority"],
    dueAt: str(r.dueAt),
    status: reqStr(r.status, "status", source) as Task["status"],
  };
}

export function mapLead(r: CsvRow, source: string): Lead {
  const stage = reqStr(r.stage, "stage", source);
  if (!(LEAD_STAGES as readonly string[]).includes(stage)) {
    throw new Error(`Invalid lead stage "${stage}" in ${source}`);
  }
  return {
    id: reqStr(r.id, "id", source),
    brand_id: reqStr(r.brand_id, "brand_id", source),
    contact_name: reqStr(r.contact_name, "contact_name", source),
    phone: str(r.phone),
    email: str(r.email),
    source: str(r.source),
    requirement: r.requirement ?? "",
    site_address: str(r.site_address),
    stage: stage as LeadStage,
    estimated_value: num(r.estimated_value, "estimated_value", source) ?? 0,
    owner_staff_id: str(r.owner_staff_id),
    next_action_at: str(r.next_action_at),
    quotation_number: str(r.quotation_number),
    created_at: reqStr(r.created_at, "created_at", source),
  };
}