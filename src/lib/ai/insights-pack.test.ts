process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import {
  AI_INSIGHT_KINDS,
  generateInsight,
  type AiInsightData,
  type InsightResult,
} from "./insights";
import { getDemoBrandPack } from "@/lib/demo/brands";
import type { DemoBrandCode } from "@/lib/workspace/constants";
import { calendarDateInZone, zoneDayStartUtc } from "@/lib/analytics/date-range";
import {
  aggregateOrderUsage,
  inventoryPositions,
  isConsumingOrder,
} from "@/lib/inventory/stock";

/**
 * The briefs run against the two shipped demo packs, not hand-made rows, so
 * this is also the guard that a showcase dataset can still answer every button.
 * It asserts shape and hygiene rather than exact sentences: the wording is the
 * part a model is meant to take over, the arithmetic and the grammar are not.
 */
function packData(code: DemoBrandCode): AiInsightData {
  const pack = getDemoBrandPack(code);
  const today = calendarDateInZone(new Date());
  const weekStart = zoneDayStartUtc(calendarDateInZone(new Date(Date.now() - 6 * 86_400_000)));
  const consuming = new Set(
    pack.orders
      .filter((order) => isConsumingOrder(order) && new Date(order.created_at).getTime() >= weekStart)
      .map((order) => order.id),
  );
  return {
    brandName: pack.brand.name,
    currencyCode: pack.settings.currency_code,
    today,
    orders: pack.orders,
    items: pack.orderItems,
    products: pack.products,
    payments: pack.payments,
    customers: pack.customers,
    reviews: pack.reviews,
    positions: inventoryPositions(pack.inventory, []),
    usage: aggregateOrderUsage(
      pack.orderItems.filter((line) => consuming.has(line.order_id)),
      pack.ingredients,
      pack.inventory,
    ),
    usageWindowDays: 7,
  };
}

/** A count and its noun disagreeing is the failure this panel ships most easily. */
const UNROMANISED = [
  /\b1 (bills|lines|items|customers|tickets|pairs|days|units|hours)\b/,
  /\bhas holding\b/,
  /\bis are\b/,
  /\bare is\b/,
];

describe("AI briefs against the shipped demo packs", () => {
  for (const code of ["BR-1", "BR-2"] as DemoBrandCode[]) {
    const data = packData(code);

    it(`${code}: every brief renders sentences a merchant can read`, () => {
      const briefs: InsightResult[] = AI_INSIGHT_KINDS.map((kind) =>
        generateInsight(kind, data),
      );
      for (const brief of briefs) {
        expect(brief.headline.trim().length).toBeGreaterThan(12);
        expect(brief.window.length).toBeGreaterThan(0);
        expect(brief.actions.length).toBeGreaterThan(0);
        for (const metric of brief.metrics) {
          expect(metric.value.trim().length).toBeGreaterThan(0);
          expect(metric.value).not.toBe("—");
        }
        const prose = [brief.headline, ...brief.findings, ...brief.actions].join("\n");
        for (const pattern of UNROMANISED) {
          expect(prose, `pattern ${pattern} in ${brief.kind}`).not.toMatch(pattern);
        }
        expect(prose).not.toMatch(/NaN|Infinity|undefined|null/);
        expect(prose).not.toMatch(/\s{2,}/);
      }
    });

    it(`${code}: briefs count real rows, not placeholders`, () => {
      const top = generateInsight("top_sellers", data);
      const soldUnits = data.items
        .filter((line) => data.orders.some((o) => o.id === line.order_id && o.status === "completed"))
        .reduce((sum, line) => sum + line.quantity, 0);
      expect(soldUnits).toBeGreaterThan(0);
      expect(top.metrics.find((m) => m.label === "Units sold")?.value).toBeTruthy();
      expect(top.findings.length).toBeGreaterThanOrEqual(4);

      const slow = generateInsight("slow_movers", data);
      const active = data.products.filter((product) => product.is_active).length;
      expect(slow.headline).toContain(`of ${active} active lines`);
    });
  }
});
