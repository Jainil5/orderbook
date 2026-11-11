import { describe, expect, it } from "vitest";
import {
  getBrandSummaries,
  getDemoShowcaseStats,
} from "@/lib/demo/showcase-stats";

describe("getDemoShowcaseStats", () => {
  it("caps the trend window and trims the donut slices", () => {
    const stats = getDemoShowcaseStats("BR-1");
    expect(stats.trend.length).toBeGreaterThan(1);
    expect(stats.trend.length).toBeLessThanOrEqual(30);
    expect(stats.categories.length).toBeLessThanOrEqual(5);
    expect(stats.tenders.length).toBeLessThanOrEqual(5);
    expect(stats.periodRevenue).toBeGreaterThan(0);
    expect(stats.periodBills).toBeGreaterThan(0);
  });

  it("names the brand whose pack it read", () => {
    const stats = getDemoShowcaseStats("BR-2");
    expect(stats.brandName).toBe("Cubig Furniture");
    expect(stats.currency).toBe("INR");
  });
});

describe("getBrandSummaries", () => {
  it("reports the seeded row counts behind each demo brand", () => {
    const [cafe, furniture] = getBrandSummaries();
    expect(getBrandSummaries().map((summary) => summary.code)).toEqual([
      "BR-1",
      "BR-2",
    ]);
    expect(cafe.brandName).toBe("Brewery Cafe");
    expect(furniture.brandName).toBe("Cubig Furniture");
    for (const summary of [cafe, furniture]) {
      expect(summary.bills).toBeGreaterThan(0);
      expect(summary.products).toBeGreaterThan(0);
      expect(summary.customers).toBeGreaterThan(0);
      expect(summary.staff).toBeGreaterThan(0);
      expect(summary.historyMonths).toBe(6);
    }
  });
});
