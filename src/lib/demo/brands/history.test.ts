import { describe, expect, it } from "vitest";
import { buildOrderHistory, type HistoryConfig } from "./history";
import { BREWERY_CAFE_DEMO } from "./brewery-cafe";
import { localDayKey } from "@/lib/manager/time";
import { roundMoney } from "@/lib/pricing/discounts";
import type { Order } from "@/types/database";

// A fixed clock keeps the month-shape assertions stable regardless of the day
// the suite runs. Nov 10 mirrors the program's real "today".
const NOW = new Date(2026, 10, 10, 21, 30, 0);

const MONTHS = [
  { year: 2026, month: 4, target: 30 }, // May
  { year: 2026, month: 5, target: 34 }, // Jun
  { year: 2026, month: 6, target: 39 }, // Jul
  { year: 2026, month: 7, target: 44 }, // Aug
  { year: 2026, month: 8, target: 50 }, // Sep
  { year: 2026, month: 9, target: 56 }, // Oct
];

const BR1_CFG: HistoryConfig = {
  brandId: "demo-brewery-cafe",
  prefix: "BC",
  products: BREWERY_CAFE_DEMO.products,
  offers: BREWERY_CAFE_DEMO.offers,
  taxRatePercent: 5,
  rngSeed: 20261109,
  months: MONTHS,
  customerCount: 40,
  pendingCount: 3,
};

function isRevenue(order: Order): boolean {
  return order.status === "completed";
}

/** Revenue (sum of grand_total for completed orders) keyed by `yyyy-mm` local. */
function revenueByMonth(orders: Order[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const order of orders) {
    if (!isRevenue(order)) continue;
    const key = localDayKey(new Date(order.created_at)).slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + order.grand_total);
  }
  return map;
}

/** Completed-order count per local day key, for daily-rate math. */
function completedCountByDay(orders: Order[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const order of orders) {
    if (!isRevenue(order)) continue;
    const key = localDayKey(new Date(order.created_at));
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/** Completed-order count per `yyyy-mm` local month key. */
function completedByMonth(orders: Order[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const order of orders) {
    if (!isRevenue(order)) continue;
    const key = localDayKey(new Date(order.created_at)).slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

describe("buildOrderHistory — BR-1 deterministic 6-month shape", () => {
  const out = buildOrderHistory(BR1_CFG, NOW);
  const byMonth = revenueByMonth(out.orders);

  it("excludes non-revenue orders from month totals (completed only)", () => {
    const cancelled = out.orders.filter((o) => o.status === "cancelled");
    const pending = out.orders.filter((o) => o.status === "pending");
    expect(cancelled.length).toBeGreaterThan(0);
    expect(pending.length).toBeGreaterThanOrEqual(3);

    // Recompute a single month by hand and confirm cancelled/pending rows are
    // not reflected in it.
    const mayOrders = out.orders.filter(
      (o) => localDayKey(new Date(o.created_at)).startsWith("2026-05"),
    );
    const expected = mayOrders
      .filter(isRevenue)
      .reduce((sum, o) => sum + o.grand_total, 0);
    expect(roundMoney(byMonth.get("2026-05") ?? 0)).toBe(roundMoney(expected));
    for (const o of [...cancelled, ...pending]) {
      // Nothing outside completed may inflate its month.
      expect(isRevenue(o)).toBe(false);
    }
  });

  it("grows ~12–15%/mo May→Oct (completed volume) with a visible revenue trend", () => {
    const counts = completedByMonth(out.orders);
    const mayCount = counts.get("2026-05") ?? 0;
    const octCount = counts.get("2026-10") ?? 0;
    expect(mayCount).toBeGreaterThan(0);
    // +12–15% per month compounding over five steps ⇒ total May→Oct ≈ 1.12^5..1.15^5.
    const countRatio = octCount / mayCount;
    expect(countRatio).toBeGreaterThanOrEqual(1.76);
    expect(countRatio).toBeLessThanOrEqual(2.01);

    // Revenue also trends up clearly across the window (AOV drift keeps the
    // money ratio a little under the volume ratio, but growth is unmistakable).
    const may = byMonth.get("2026-05") ?? 0;
    const oct = byMonth.get("2026-10") ?? 0;
    expect(may).toBeGreaterThan(0);
    const revenueRatio = oct / may;
    expect(revenueRatio).toBeGreaterThanOrEqual(1.3);
    expect(revenueRatio).toBeLessThanOrEqual(2.01);
  });

  it("dips ~20% in November daily-rate and rebounds in the last 7 days toward October", () => {
    const byDay = completedCountByDay(out.orders);
    const octDays = new Date(2026, 10, 0).getDate(); // 31
    const octCount = [...byDay.entries()]
      .filter(([day]) => day.startsWith("2026-10"))
      .reduce((sum, [, n]) => sum + n, 0);
    const octDaily = octCount / octDays;
    expect(octDaily).toBeGreaterThan(0);

    const novDaysElapsed = NOW.getDate(); // 10
    const novCount = [...byDay.entries()]
      .filter(([day]) => day.startsWith("2026-11"))
      .reduce((sum, [, n]) => sum + n, 0);
    const novDaily = novCount / novDaysElapsed;

    // Whole-month November rate sits ~20% under October.
    expect(novDaily / octDaily).toBeGreaterThanOrEqual(0.72);
    expect(novDaily / octDaily).toBeLessThanOrEqual(0.88);

    // The trailing 7 days (Nov 4–10) recover to at least 90% of the October rate.
    const reboundDays = [4, 5, 6, 7, 8, 9, 10].map(
      (d) => `2026-11-${String(d).padStart(2, "0")}`,
    );
    const reboundCount = reboundDays.reduce((sum, d) => sum + (byDay.get(d) ?? 0), 0);
    const reboundDaily = reboundCount / 7;
    expect(reboundDaily).toBeGreaterThanOrEqual(0.9 * octDaily);
  });

  it("every completed order satisfies roundMoney(subtotal + tax_total) = grand_total", () => {
    const completed = out.orders.filter(isRevenue);
    expect(completed.length).toBeGreaterThan(200);
    for (const o of completed) {
      expect(roundMoney(o.subtotal + o.tax_total)).toBe(o.grand_total);
      expect(o.discount_total).toBeGreaterThanOrEqual(0);
    }
  });

  it("no order is in the future and service_date matches the created_at local day", () => {
    for (const o of out.orders) {
      expect(new Date(o.created_at).getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(o.service_date).toBe(localDayKey(new Date(o.created_at)));
    }
  });

  it("≈5% cancelled, ≥8% offer-coded, all three payment methods present, ≥4 customers with 3+ orders", () => {
    const total = out.orders.length;
    const cancelled = out.orders.filter((o) => o.status === "cancelled").length;
    const cancelRate = cancelled / total;
    expect(cancelRate).toBeGreaterThanOrEqual(0.035);
    expect(cancelRate).toBeLessThanOrEqual(0.065);

    const coded = out.orders.filter((o) => !!o.offer_code_snapshot).length;
    expect(coded / total).toBeGreaterThanOrEqual(0.08);

    const methods = new Set(
      out.payments.map((p) => p.method),
    );
    expect(methods.has("UPI")).toBe(true);
    expect(methods.has("Cash")).toBe(true);
    expect(methods.has("Card")).toBe(true);

    const perCustomer = new Map<string, number>();
    for (const o of out.orders) {
      if (!o.customer_id) continue;
      perCustomer.set(o.customer_id, (perCustomer.get(o.customer_id) ?? 0) + 1);
    }
    const heavy = [...perCustomer.values()].filter((n) => n >= 3).length;
    expect(heavy).toBeGreaterThanOrEqual(4);
  });

  it("deterministic: two calls produce an identical id list", () => {
    const again = buildOrderHistory(BR1_CFG, NOW);
    expect(again.orders.map((o) => o.id)).toEqual(out.orders.map((o) => o.id));
    expect(again.orderItems.map((i) => i.id)).toEqual(out.orderItems.map((i) => i.id));
    expect(again.customers.map((c) => c.id)).toEqual(out.customers.map((c) => c.id));
  });

  it("emits 3 today-pending BR-1 orders dated now", () => {
    const today = localDayKey(NOW);
    const pending = out.orders.filter((o) => o.status === "pending");
    expect(pending).toHaveLength(3);
    for (const o of pending) {
      expect(localDayKey(new Date(o.created_at))).toBe(today);
      expect(new Date(o.created_at).getTime()).toBeLessThanOrEqual(NOW.getTime());
    }
  });

  it("customers carry realistic phones and are referenced by their own orders", () => {
    for (const c of out.customers) {
      expect(c.name).toBeTruthy();
      expect(c.phone ?? "").toMatch(/^98\d{8}$/);
    }
    const customerIds = new Set(out.customers.map((c) => c.id));
    for (const o of out.orders) {
      if (o.customer_id) expect(customerIds.has(o.customer_id)).toBe(true);
    }
  });
});
