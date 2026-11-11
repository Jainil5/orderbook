import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { rowsToCsv } from "@/lib/export/csv";
import { BREWERY_CAFE_DEMO } from "./brewery-cafe";
import { CUBIG_FURNITURE_DEMO } from "./cubig-furniture";
import type { DemoBrandPack } from "./types";

const DUMP = process.env.DUMP_DEMO_CSV === "1";
const ROOT = resolve(import.meta.dirname, "../../../..");

type Table = {
  file: string;
  headers: string[];
  rows: (p: DemoBrandPack) => (string | number | null | undefined)[][];
};

const s = (v: string | null | undefined) => v ?? "";
const n = (v: number | null | undefined) => v ?? "";
const b = (v: boolean | null | undefined) => (v == null ? "" : String(v));
const j = (v: unknown) => (v == null ? "" : JSON.stringify(v));

const TABLES: Table[] = [
  {
    file: "brand.csv",
    headers: ["id", "code", "name", "order_number_prefix"],
    rows: (p) => [[p.brand.id, p.brand.code, p.brand.name, p.orderNumberPrefix]],
  },
  {
    file: "brand_settings.csv",
    headers: ["brand_id", "currency_code", "tax_rate_percent", "receipt_header", "receipt_footer", "contact_email", "contact_phone", "quotation_builder_enabled", "brand_website_url", "block_oversell"],
    rows: (p) => {
      const x = p.settings;
      return [[x.brand_id, x.currency_code, n(x.tax_rate_percent), s(x.receipt_header), s(x.receipt_footer), s(x.contact_email), s(x.contact_phone), b(x.quotation_builder_enabled), s(x.brand_website_url), b(x.block_oversell)]];
    },
  },
  {
    file: "products.csv",
    headers: ["id", "brand_id", "name", "description", "sku", "category", "price", "cost_price", "unit", "is_active", "default_discount_percent", "image_url", "stock_qty", "low_stock_threshold", "wholesale_price", "modifiers_json", "unavailable"],
    rows: (p) => p.products.map((x) => [x.id, x.brand_id, x.name, s(x.description), s(x.sku), s(x.category), x.price, n(x.cost_price), s(x.unit), b(x.is_active), n(x.default_discount_percent), s(x.image_url), n(x.stock_qty), n(x.low_stock_threshold), n(x.wholesale_price), j(x.modifiers_json), b(x.unavailable)]),
  },
  {
    file: "customers.csv",
    headers: ["id", "brand_id", "name", "email", "phone", "notes", "price_tier"],
    rows: (p) => p.customers.map((x) => [x.id, x.brand_id, x.name, s(x.email), s(x.phone), s(x.notes), s(x.price_tier)]),
  },
  {
    file: "orders.csv",
    headers: ["id", "brand_id", "order_number", "status", "payment_status", "customer_id", "customer_name_snapshot", "subtotal", "discount_total", "tax_total", "fees_total", "grand_total", "notes", "created_at", "table_tag", "delivery_notes", "order_type", "service_date", "guests", "delivery_address", "payment_method", "payment_reference", "deposit_percent", "amount_paid", "offer_code_snapshot", "public_token", "parent_order_id", "order_kind"],
    rows: (p) => p.orders.map((x) => [x.id, x.brand_id, x.order_number, x.status, x.payment_status, s(x.customer_id), s(x.customer_name_snapshot), x.subtotal, x.discount_total, x.tax_total, x.fees_total, x.grand_total, s(x.notes), x.created_at, s(x.table_tag), s(x.delivery_notes), s(x.order_type), s(x.service_date), n(x.guests), s(x.delivery_address), s(x.payment_method), s(x.payment_reference), n(x.deposit_percent), n(x.amount_paid), s(x.offer_code_snapshot), s(x.public_token), s(x.parent_order_id), s(x.order_kind)]),
  },
  {
    file: "order_items.csv",
    headers: ["id", "order_id", "product_id", "product_name_snapshot", "quantity", "unit_price", "line_discount", "line_total", "product_image_url_snapshot", "modifier_labels"],
    rows: (p) => p.orderItems.map((x) => [x.id, x.order_id, s(x.product_id), x.product_name_snapshot, x.quantity, x.unit_price, x.line_discount, x.line_total, s(x.product_image_url_snapshot), s(x.modifier_labels)]),
  },
  {
    file: "payments.csv",
    headers: ["id", "brand_id", "order_id", "amount", "method", "status", "created_at", "split_label", "notes"],
    rows: (p) => p.payments.map((x) => [x.id, x.brand_id, x.order_id, x.amount, x.method, x.status, x.created_at, s(x.split_label), s(x.notes)]),
  },
  {
    file: "offers.csv",
    headers: ["id", "brand_id", "name", "code", "discount_type", "discount_value", "scope", "scope_value", "min_order_amount", "max_discount", "starts_at", "ends_at", "is_active", "redemption_count", "usage_limit"],
    rows: (p) => p.offers.map((x) => [x.id, x.brand_id, x.name, s(x.code), x.discount_type, x.discount_value, x.scope, s(x.scope_value), n(x.min_order_amount), n(x.max_discount), s(x.starts_at), s(x.ends_at), b(x.is_active), x.redemption_count, n(x.usage_limit)]),
  },
  {
    file: "staff.csv",
    headers: ["id", "brand_id", "name", "role", "phone", "email", "status", "availability", "created_at"],
    rows: (p) => p.staff.map((x) => [x.id, x.brand_id, x.name, x.role, s(x.phone), s(x.email), x.status, x.availability, x.created_at]),
  },
  {
    file: "services.csv",
    headers: ["id", "brand_id", "name", "description", "durationMinutes", "price", "isActive"],
    rows: (p) => p.services.map((x) => [x.id, x.brand_id, x.name, x.description, x.durationMinutes, x.price, b(x.isActive)]),
  },
  {
    file: "service_jobs.csv",
    headers: ["id", "brand_id", "serviceId", "customerId", "staff_ids", "status", "scheduledAt", "notes"],
    rows: (p) => p.serviceJobs.map((x) => [x.id, x.brand_id, x.serviceId, x.customerId, j(x.staffIds), x.status, s(x.scheduledAt), x.notes]),
  },
  {
    file: "appointments.csv",
    headers: ["id", "brand_id", "title", "customerId", "staff_ids", "startsAt", "endsAt", "location", "serviceId", "status", "notes"],
    rows: (p) => p.appointments.map((x) => [x.id, x.brand_id, x.title, s(x.customerId), j(x.staffIds), x.startsAt, x.endsAt, x.location, s(x.serviceId), x.status, x.notes]),
  },
  {
    file: "field_visits.csv",
    headers: ["id", "brand_id", "customerId", "staffId", "purpose", "status", "checkInAt", "checkOutAt", "report"],
    rows: (p) => p.visits.map((x) => [x.id, x.brand_id, x.customerId, x.staffId, x.purpose, x.status, s(x.checkInAt), s(x.checkOutAt), s(x.report)]),
  },
  {
    file: "shifts.csv",
    headers: ["id", "brand_id", "staffId", "date", "start", "end", "note"],
    rows: (p) => p.shifts.map((x) => [x.id, x.brand_id, x.staffId, x.date, x.start, x.end, x.note]),
  },
  {
    file: "tasks.csv",
    headers: ["id", "brand_id", "title", "description", "assigneeStaffId", "customerId", "priority", "dueAt", "status"],
    rows: (p) => p.tasks.map((x) => [x.id, x.brand_id, x.title, x.description, s(x.assigneeStaffId), s(x.customerId), x.priority, s(x.dueAt), x.status]),
  },
];

const PACKS: Record<string, DemoBrandPack> = {
  "BR-1": BREWERY_CAFE_DEMO,
  "BR-2": CUBIG_FURNITURE_DEMO,
};

describe("demo CSV dataset", () => {
  for (const [code, pack] of Object.entries(PACKS)) {
    const dir = resolve(ROOT, "data/demo", code);
    if (DUMP) {
      it(`dumps ${code}`, () => {
        mkdirSync(dir, { recursive: true });
        for (const t of TABLES) {
          writeFileSync(resolve(dir, t.file), rowsToCsv(t.headers, t.rows(pack)) + "\n");
        }
        expect(TABLES.length).toBe(15);
      });
    } else {
      it(`${code} CSVs exist and match the pack row counts`, () => {
        for (const t of TABLES) {
          const path = resolve(dir, t.file);
          expect(existsSync(path), `${path} missing — run DUMP_DEMO_CSV=1`).toBe(true);
          const lines = readFileSync(path, "utf8").trim().split("\n");
          expect(lines.length - 1).toBe(t.rows(pack).length);
        }
      });
    }
  }
});