import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDemoBrandPack } from "./index";
import { DEMO_LIMITS } from "../read-only";
import { REVIEW_SOURCES } from "@/types/crm";

const ROOT = resolve(import.meta.dirname, "../../../..");

describe("CSV demo packs", () => {
  for (const code of ["BR-1", "BR-2"] as const) {
    const pack = getDemoBrandPack(code);
    it(`${code}: referential integrity`, () => {
      const orderIds = new Set(pack.orders.map((o) => o.id));
      const productIds = new Set(pack.products.map((p) => p.id));
      const customerIds = new Set(pack.customers.map((c) => c.id));
      for (const item of pack.orderItems) {
        expect(orderIds.has(item.order_id)).toBe(true);
        if (item.product_id) expect(productIds.has(item.product_id)).toBe(true);
      }
      for (const pay of pack.payments) expect(orderIds.has(pay.order_id)).toBe(true);
      for (const o of pack.orders) {
        if (o.customer_id) expect(customerIds.has(o.customer_id)).toBe(true);
      }
    });
    it(`${code}: unique SKUs and existing image files`, () => {
      const skus = pack.products.map((p) => p.sku).filter(Boolean);
      expect(new Set(skus).size).toBe(skus.length);
      for (const p of pack.products) {
        if (!p.image_url) continue;
        expect(p.image_url.startsWith(`/demo/products/${code}/`)).toBe(true);
        expect(existsSync(resolve(ROOT, "public", p.image_url.slice(1))), p.image_url).toBe(true);
      }
    });
    it(`${code}: history is rebased so the newest order is today`, () => {
      const max = Math.max(...pack.orders.map((o) => new Date(o.created_at).getTime()));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      expect(max).toBeGreaterThanOrEqual(today.getTime());
      expect(max).toBeLessThan(today.getTime() + 86400000);
    });
    it(`${code}: stays inside the caps with a floor of rows per table`, () => {
      expect(pack.orders).toHaveLength(20);
      expect(pack.products.length).toBeLessThanOrEqual(DEMO_LIMITS.products);
      expect(pack.customers.length).toBeLessThanOrEqual(DEMO_LIMITS.customers);
      expect(pack.payments.length).toBeLessThanOrEqual(DEMO_LIMITS.payments);
      const tables = [
        pack.offers,
        pack.staff,
        pack.services,
        pack.serviceJobs,
        pack.appointments,
        pack.visits,
        pack.shifts,
        pack.tasks,
      ];
      for (const rows of tables) expect(rows.length).toBeGreaterThanOrEqual(2);
    });
    it(`${code}: CRM referential integrity`, () => {
      const customerIds = new Set(pack.customers.map((c) => c.id));
      const staffIds = new Set(pack.staff.map((s) => s.id));
      const leadIds = new Set(pack.leads.map((l) => l.id));
      const orderIds = new Set(pack.orders.map((o) => o.id));
      const taskIds = new Set(pack.tasks.map((t) => t.id));
      const offerIds = new Set(pack.offers.map((o) => o.id));
      const segmentIds = new Set(pack.segments.map((s) => s.id));
      const reviewIds = new Set(pack.reviews.map((r) => r.id));
      const interactionIds = new Set(pack.interactions.map((i) => i.id));
      const complaintIds = new Set(pack.complaints.map((c) => c.id));
      const tierIds = new Set(pack.loyaltyRules[0].tiers.map((t) => t.id));

      for (const i of pack.interactions) {
        expect(i.customer_id === null || i.lead_id === null, i.id).toBe(true);
        if (i.customer_id) expect(customerIds.has(i.customer_id), i.id).toBe(true);
        if (i.lead_id) expect(leadIds.has(i.lead_id), i.id).toBe(true);
        if (i.staff_id) expect(staffIds.has(i.staff_id), i.id).toBe(true);
        if (i.task_id) expect(taskIds.has(i.task_id), i.id).toBe(true);
      }
      for (const r of pack.reviews) {
        if (r.customer_id) expect(customerIds.has(r.customer_id), r.id).toBe(true);
        if (r.complaint_id) expect(complaintIds.has(r.complaint_id), r.id).toBe(true);
        expect(REVIEW_SOURCES, r.id).toContain(r.source);
      }
      for (const c of pack.complaints) {
        if (c.customer_id) expect(customerIds.has(c.customer_id), c.id).toBe(true);
        if (c.review_id) expect(reviewIds.has(c.review_id), c.id).toBe(true);
        if (c.interaction_id) expect(interactionIds.has(c.interaction_id), c.id).toBe(true);
        if (c.owner_staff_id) expect(staffIds.has(c.owner_staff_id), c.id).toBe(true);
      }
      for (const c of pack.campaigns) {
        if (c.segment_id) expect(segmentIds.has(c.segment_id), c.id).toBe(true);
        if (c.offer_id) expect(offerIds.has(c.offer_id), c.id).toBe(true);
        expect(c.delivered, c.id).toBeLessThanOrEqual(c.messages_sent);
        expect(c.responded, c.id).toBeLessThanOrEqual(c.messages_sent);
        expect(c.redeemed, c.id).toBeLessThanOrEqual(c.messages_sent);
        // Nothing claims a send this build cannot perform.
        if (c.delivery === "not_connected") {
          expect(c.messages_sent, c.id).toBe(0);
          expect(c.delivered, c.id).toBe(0);
        }
      }
      for (const e of pack.loyaltyLedger) {
        expect(customerIds.has(e.customer_id), e.id).toBe(true);
        if (e.order_id) expect(orderIds.has(e.order_id), e.id).toBe(true);
        expect(e.points, e.id).not.toBe(0);
        if (e.kind === "earn" || e.kind === "bonus") {
          expect(e.points, e.id).toBeGreaterThan(0);
        }
        if (e.kind === "redeem" || e.kind === "expire") {
          expect(e.points, e.id).toBeLessThan(0);
        }
        // `adjust` is a correction, so it may run either direction.
      }
      for (const m of pack.memberships) {
        expect(customerIds.has(m.customer_id), m.id).toBe(true);
        expect(tierIds.has(m.tier_id), m.id).toBe(true);
      }
      for (const s of pack.segments) {
        if (s.kind === "manual") {
          for (const id of s.member_ids) expect(customerIds.has(id), s.id).toBe(true);
        } else {
          expect(s.rules, s.id).not.toBeNull();
          expect(s.member_ids, s.id).toHaveLength(0);
        }
      }
    });
    it(`${code}: CRM tables stay inside their caps with a floor of rows`, () => {
      expect(pack.interactions.length).toBeLessThanOrEqual(DEMO_LIMITS.interactions);
      expect(pack.reviews.length).toBeLessThanOrEqual(DEMO_LIMITS.reviews);
      expect(pack.complaints.length).toBeLessThanOrEqual(DEMO_LIMITS.complaints);
      expect(pack.segments.length).toBeLessThanOrEqual(DEMO_LIMITS.segments);
      expect(pack.campaigns.length).toBeLessThanOrEqual(DEMO_LIMITS.campaigns);
      expect(pack.loyaltyLedger.length).toBeLessThanOrEqual(DEMO_LIMITS.loyaltyLedger);
      expect(pack.memberships.length).toBeLessThanOrEqual(DEMO_LIMITS.memberships);
      expect(pack.loyaltyRules).toHaveLength(1);
      for (const rows of [
        pack.interactions,
        pack.reviews,
        pack.complaints,
        pack.segments,
        pack.campaigns,
        pack.loyaltyLedger,
        pack.memberships,
      ]) {
        expect(rows.length).toBeGreaterThanOrEqual(2);
      }
    });
    it(`${code}: CRM ids are unique`, () => {
      for (const key of [
        "interactions",
        "reviews",
        "complaints",
        "segments",
        "campaigns",
        "loyaltyLedger",
        "memberships",
      ] as const) {
        const ids = pack[key].map((row) => row.id);
        expect(new Set(ids).size, key).toBe(ids.length);
      }
    });
    it(`${code}: every customer carries a CRM status and consent signal`, () => {
      for (const c of pack.customers) {
        expect(c.status, c.id).toBeTruthy();
        expect(typeof c.marketing_consent, c.id).toBe("boolean");
        expect(typeof c.opted_out, c.id).toBe("boolean");
        if (c.date_of_birth) expect(c.date_of_birth).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      // Consent has to be a real signal, not a column of identical defaults.
      expect(pack.customers.some((c) => c.marketing_consent)).toBe(true);
      expect(pack.customers.some((c) => !c.marketing_consent)).toBe(true);
    });
  }
  it("BR-1 menu realism (ported from brewery-cafe.test.ts)", () => {
    const pack = getDemoBrandPack("BR-1");
    expect(pack.products.some((p) => p.name === "House IPA")).toBe(false);
    expect(pack.orderItems.some((i) => i.product_name_snapshot === "House IPA")).toBe(false);
    const order = pack.orders.find((o) => o.order_number === "BC-1041");
    expect(order).toBeDefined();
    const lines = pack.orderItems.filter((i) => i.order_id === order!.id);
    expect(lines.map((l) => l.product_name_snapshot).sort()).toEqual([
      "Mango Smoothie",
      "Peri Peri Fries",
    ]);
    expect(lines.reduce((s, l) => s + l.line_total, 0)).toBe(order!.subtotal);
    expect(pack.products.filter((p) => p.category === "Sides & Dips")).toHaveLength(2);
    expect(pack.products.filter((p) => p.category === "Desserts")).toHaveLength(2);
    const pastry = pack.products.find((p) => p.name === "Seasonal Pastry");
    expect(pastry?.default_discount_percent).toBe(50);
  });
});