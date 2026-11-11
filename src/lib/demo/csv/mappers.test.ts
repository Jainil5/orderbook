import { describe, expect, it } from "vitest";
import { mapProduct, mapOrder, mapOrderItem, mapPayment, mapStaff, mapShift, mapServiceJob, mapBrand } from "./mappers";

const src = "test.csv";

describe("mappers", () => {
  it("mapBrand reads prefix", () => {
    expect(mapBrand({ id: "b", code: "BR-1", name: "Cafe", order_number_prefix: "BC" }, src))
      .toEqual({ brand: { id: "b", code: "BR-1", name: "Cafe" }, orderNumberPrefix: "BC" });
  });
  it("mapProduct coerces numbers, booleans, nulls, JSON", () => {
    const p = mapProduct({
      id: "p1", brand_id: "b", name: "Flat White", description: "", sku: "BV-CF-001",
      category: "Coffee", price: "220", cost_price: "55", unit: "cup", is_active: "true",
      default_discount_percent: "", image_url: "/demo/products/BR-1/BV-CF-001.jpg",
      stock_qty: "", low_stock_threshold: "", wholesale_price: "",
      modifiers_json: '[{"id":"m1","name":"Oat milk","price":40}]', unavailable: "",
    }, src);
    expect(p.price).toBe(220);
    expect(p.description).toBeNull();
    expect(p.is_active).toBe(true);
    expect(p.default_discount_percent).toBeNull();
    expect(p.modifiers_json).toEqual([{ id: "m1", name: "Oat milk", price: 40 }]);
    expect(p.unavailable).toBeUndefined();
  });
  it("mapOrder keeps lifecycle fields and nulls", () => {
    const o = mapOrder({
      id: "o1", brand_id: "b", order_number: "BC-1", status: "completed", payment_status: "paid",
      customer_id: "", customer_name_snapshot: "Walk-in", subtotal: "100", discount_total: "0",
      tax_total: "5", fees_total: "0", grand_total: "105", notes: "", created_at: "2026-11-01T09:00:00.000Z",
      table_tag: "", delivery_notes: "", order_type: "dine_in", service_date: "2026-11-01",
      guests: "2", delivery_address: "", payment_method: "UPI", payment_reference: "",
      deposit_percent: "", amount_paid: "105", offer_code_snapshot: "", public_token: "",
      parent_order_id: "", order_kind: "sale",
    }, src);
    expect(o.customer_id).toBeNull();
    expect(o.guests).toBe(2);
    expect(o.order_type).toBe("dine_in");
    expect(o.grand_total).toBe(105);
  });
  it("mapOrderItem, mapPayment, mapStaff, mapShift, mapServiceJob basics", () => {
    expect(mapOrderItem({ id: "oi1", order_id: "o1", product_id: "p1", product_name_snapshot: "X", quantity: "2", unit_price: "10", line_discount: "0", line_total: "20", product_image_url_snapshot: "", modifier_labels: "" }, src).quantity).toBe(2);
    expect(mapPayment({ id: "pay1", brand_id: "b", order_id: "o1", amount: "105", method: "UPI", status: "paid", created_at: "2026-11-01T09:00:00.000Z", split_label: "", notes: "" }, src).amount).toBe(105);
    expect(mapStaff({ id: "s1", brand_id: "b", name: "Asha", role: "manager", phone: "", email: "", status: "active", availability: "available", created_at: "2026-10-01T09:00:00.000Z" }, src).phone).toBeNull();
    expect(mapShift({ id: "sh1", brand_id: "b", staffId: "s1", date: "2026-11-11", start: "08:00", end: "16:00", note: "Bar" }, src).date).toBe("2026-11-11");
    expect(mapServiceJob({ id: "j1", brand_id: "b", serviceId: "svc1", customerId: "c1", staff_ids: '["s1","s2"]', status: "scheduled", scheduledAt: "", notes: "" }, src).staffIds).toEqual(["s1", "s2"]);
  });
});