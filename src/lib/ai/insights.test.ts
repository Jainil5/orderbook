process.env.TZ = "Asia/Kolkata";

import { describe, expect, it } from "vitest";
import {
  AI_INSIGHT_KINDS,
  AI_INSIGHT_PROMPTS,
  aiSummaryHint,
  generateInsight,
  isAiInsightKind,
  routeQuestion,
  type AiInsightData,
} from "./insights";
import { inventoryPosition } from "@/lib/inventory/stock";
import type { CustomerReview } from "@/types/crm";
import type {
  Customer,
  InventoryItem,
  Order,
  OrderItem,
  Payment,
  Product,
} from "@/types/database";

/**
 * Every assertion below is anchored on a fixed calendar day, and the timestamps
 * carry an explicit +05:30 offset. A brief that read UTC dates would place an
 * 01:30 IST bill on the previous day, and these tests would notice.
 */
const TODAY = "2026-11-16";

const orderBase = {
  id: "o1",
  brand_id: "b1",
  order_number: "BC-1",
  status: "completed" as const,
  payment_status: "paid" as const,
  customer_id: null,
  customer_name_snapshot: "Walk-in Guest",
  subtotal: 500,
  discount_total: 0,
  tax_total: 50,
  fees_total: 0,
  grand_total: 550,
  notes: null,
  created_at: "2026-11-16T10:00:00.000+05:30",
};

function order(over: Partial<Order> & { id: string }): Order {
  return { ...orderBase, ...over };
}

function item(over: Partial<OrderItem> & { id: string; order_id: string }): OrderItem {
  return {
    product_id: "p1",
    product_name_snapshot: "Flat White",
    quantity: 1,
    unit_price: 500,
    line_discount: 0,
    line_total: 500,
    ...over,
  };
}

function product(over: Partial<Product> & { id: string }): Product {
  return {
    brand_id: "b1",
    name: "Flat White",
    description: null,
    sku: null,
    category: "Coffee",
    price: 500,
    unit: null,
    is_active: true,
    ...over,
  };
}

function customer(over: Partial<Customer> & { id: string }): Customer {
  return { brand_id: "b1", name: "Ananya", email: null, phone: null, ...over };
}

function payment(over: Partial<Payment> & { id: string; order_id: string }): Payment {
  return {
    brand_id: "b1",
    amount: 550,
    method: "upi",
    status: "paid",
    created_at: "2026-11-16T10:05:00.000+05:30",
    ...over,
  };
}

const stockItemBase: InventoryItem = {
  id: "i1",
  brand_id: "b1",
  name: "Milk",
  category: "Dairy",
  unit: "ml",
  units_per_pack: 1000,
  cost_per_pack: 60,
  stock_packs: 4,
  low_stock_packs: 2,
  note: null,
};

function review(over: Partial<CustomerReview> = {}): CustomerReview {
  return {
    id: "r1",
    brand_id: "b1",
    customer_id: null,
    source: "Google Business Profile",
    rating: 5,
    text: "Lovely place, best filter coffee in the neighbourhood.",
    reviewed_at: "2026-11-10T10:00:00.000+05:30",
    response_text: null,
    responded_at: null,
    sentiment: "positive",
    tags: [],
    staff_mentioned: null,
    internal_notes: null,
    status: "new",
    complaint_id: null,
    ...over,
  };
}

function data(over: Partial<AiInsightData> = {}): AiInsightData {
  return {
    brandName: "Brewery Cafe",
    currencyCode: "INR",
    today: TODAY,
    orders: [order({ id: "o1" })],
    items: [item({ id: "li1", order_id: "o1" })],
    products: [product({ id: "p1" })],
    payments: [payment({ id: "pay1", order_id: "o1" })],
    customers: [],
    reviews: [],
    positions: [],
    usage: [],
    usageWindowDays: 7,
    ...over,
  };
}

describe("briefs against an empty day", () => {
  it("says so instead of inventing a report", () => {
    const result = generateInsight(
      "today_report",
      data({ orders: [order({ id: "old", created_at: "2026-11-04T10:00:00.000+05:30" })] }),
    );
    expect(result.headline).toContain("Nothing has been booked");
    expect(result.caveat).toBeTruthy();
    expect(result.metrics).toHaveLength(0);
  });

  it("keeps every brief honest with no rows at all", () => {
    for (const kind of AI_INSIGHT_KINDS) {
      const result = generateInsight(kind, data({ orders: [], items: [], products: [], payments: [] }));
      expect(result.kind).toBe(kind);
      expect(result.headline.length).toBeGreaterThan(0);
      expect(result.findings.length + result.actions.length).toBeGreaterThan(0);
    }
  });
});

describe("today's report", () => {
  it("separates closed sales from tickets still open", () => {
    const result = generateInsight(
      "today_report",
      data({
        orders: [
          order({ id: "o1", status: "completed", grand_total: 550 }),
          order({ id: "o2", status: "pending", grand_total: 200 }),
        ],
        items: [
          item({ id: "li1", order_id: "o1", quantity: 2 }),
          item({ id: "li2", order_id: "o2", quantity: 1 }),
        ],
      }),
    );
    expect(result.headline).toContain("₹550");
    expect(result.metrics.find((m) => m.label === "Open tickets")?.value).toBe("1");
    expect(result.actions.join(" ")).toContain("open ticket");
  });

  it("counts an 01:30 IST bill on the IST day, not the UTC one", () => {
    const result = generateInsight(
      "today_report",
      data({
        orders: [order({ id: "late", created_at: "2026-11-16T01:30:00.000+05:30" })],
      }),
    );
    expect(result.headline).toContain("₹550");
  });

  it("ignores credit notes when summing the day", () => {
    const result = generateInsight(
      "today_report",
      data({
        orders: [
          order({ id: "o1" }),
          order({ id: "cn1", order_kind: "credit_note", grand_total: 999 }),
        ],
      }),
    );
    expect(result.metrics.find((m) => m.label === "Bills")?.value).toBe("1");
  });
});

describe("most sold items", () => {
  it("ranks by units, not by revenue", () => {
    const result = generateInsight(
      "top_sellers",
      data({
        items: [
          item({ id: "a", order_id: "o1", product_id: "pa", product_name_snapshot: "Cheese Toast", quantity: 6, line_total: 300 }),
          item({ id: "b", order_id: "o1", product_id: "pb", product_name_snapshot: "Single Origin", quantity: 1, line_total: 900 }),
        ],
      }),
    );
    expect(result.headline).toContain("Cheese Toast");
    expect(result.findings.some((line) => line.includes("Single Origin earns the most"))).toBe(true);
  });

  it("reports a window with no sold lines instead of dividing by zero", () => {
    const result = generateInsight(
      "top_sellers",
      data({ orders: [order({ id: "old", created_at: "2020-01-01T10:00:00.000+05:30" })] }),
    );
    expect(result.caveat).toContain("Quotations and cancelled bills");
    expect(result.findings).toHaveLength(1);
  });
});

describe("slow movers", () => {
  it("names the active line that sold nothing", () => {
    const result = generateInsight(
      "slow_movers",
      data({
        products: [
          product({ id: "p1", name: "Flat White" }),
          product({ id: "p2", name: "Kombucha", stock_qty: 12, price: 320 }),
        ],
      }),
    );
    expect(result.headline).toContain("1 of 2 active lines");
    expect(result.findings.join(" ")).toContain("Kombucha");
  });
});

describe("week vs week", () => {
  it("compares this window against the seven days before it", () => {
    const result = generateInsight(
      "week_change",
      data({
        orders: [
          order({ id: "now", grand_total: 1000, created_at: "2026-11-15T10:00:00.000+05:30" }),
          order({ id: "then", grand_total: 500, created_at: "2026-11-05T10:00:00.000+05:30" }),
        ],
        items: [
          item({ id: "a", order_id: "now", line_total: 1000 }),
          item({ id: "b", order_id: "then", line_total: 500 }),
        ],
      }),
    );
    expect(result.headline).toContain("up 100.0%");
    expect(result.metrics.find((m) => m.label === "Bills")?.value).toBe("1 vs 1");
  });
});

describe("win-back list", () => {
  const orders = [
    order({ id: "recent", customer_id: "c1", created_at: "2026-11-14T10:00:00.000+05:30" }),
    order({ id: "quiet", customer_id: "c2", grand_total: 4000, created_at: "2026-09-01T10:00:00.000+05:30" }),
  ];
  const customers = [
    customer({ id: "c1", name: "Regular Rita" }),
    customer({ id: "c2", name: "Silent Sam", phone: "999", email: null }),
  ];

  it("flags the 45-day-plus name and keeps the reachable one actionable", () => {
    const result = generateInsight(
      "win_back",
      data({
        orders,
        customers,
        items: [
          item({ id: "a", order_id: "recent" }),
          item({ id: "b", order_id: "quiet", quantity: 4 }),
        ],
      }),
    );
    expect(result.headline).toContain("1 customer gone quiet");
    expect(result.findings.join(" ")).toContain("Silent Sam");
    expect(result.findings.join(" ")).toContain("usually for Flat White");
    expect(result.metrics.find((m) => m.label === "Reachable")?.value).toBe("1");
  });

  it("says nobody is quiet when the gaps are short", () => {
    const result = generateInsight(
      "win_back",
      data({ orders: [order({ id: "recent", customer_id: "c1" })], customers }),
    );
    expect(result.headline).toContain("Nobody has been quiet");
  });

  it("cannot win back a walk-in", () => {
    const result = generateInsight("win_back", data());
    expect(result.caveat).toContain("Walk-in bills");
  });
});

describe("margin leaks", () => {
  it("finds the line sold below cost", () => {
    const result = generateInsight(
      "margin_watch",
      data({
        products: [product({ id: "p1", name: "Flat White", cost_price: 700 })],
        items: [item({ id: "a", order_id: "o1", product_id: "p1", line_total: 500 })],
      }),
    );
    expect(result.headline).toContain("sold at or below cost");
    expect(result.metrics.find((m) => m.label === "Below cost")?.value).toBe("1");
  });

  it("refuses to guess a missing cost price", () => {
    const result = generateInsight("margin_watch", data());
    expect(result.findings.join(" ")).toContain("so margin cannot be computed");
    expect(result.actions.join(" ")).toContain("missing cost prices");
  });
});

describe("stock-out risk", () => {
  const positions = [inventoryPosition(stockItemBase, [])];
  const withUsage = data({
    positions,
    usage: [{ itemId: "i1", itemName: "Milk", unit: "ml", units: 3500, packs: 3.5, cost: 210 }],
  });

  it("turns usage into days of cover", () => {
    const result = generateInsight("stock_risk", withUsage);
    // 4 packs of 1000 ml against 500 ml a day is 8 days.
    expect(result.headline).toContain("about 8 days of cover");
    expect(result.metrics.find((m) => m.label === "At/below line")?.value).toBe("0");
  });

  it("scales the runway to the usage window it was handed", () => {
    const result = generateInsight("stock_risk", { ...withUsage, usageWindowDays: 30 });
    expect(result.headline).toContain("below the reorder line, none inside a 10-day runway");
  });

  it("says so for a brand with no stock items", () => {
    const result = generateInsight("stock_risk", data());
    expect(result.caveat).toContain("workshop that buys nothing");
  });
});

describe("bundle ideas", () => {
  it("only proposes a pair that repeats", () => {
    const result = generateInsight(
      "bundle_ideas",
      data({
        orders: [
          order({ id: "o1" }),
          order({ id: "o2", created_at: "2026-11-10T10:00:00.000+05:30" }),
        ],
        items: [
          item({ id: "a", order_id: "o1", product_name_snapshot: "Coffee" }),
          item({ id: "b", order_id: "o1", product_name_snapshot: "Croissant" }),
          item({ id: "c", order_id: "o2", product_name_snapshot: "Coffee" }),
          item({ id: "d", order_id: "o2", product_name_snapshot: "Croissant" }),
        ],
      }),
    );
    expect(result.headline).toContain("Coffee and Croissant keep selling together");
    expect(result.findings.join(" ")).toContain("shared 2 bills");
    expect(result.findings.join(" ")).toContain("1 distinct pair;");
  });

  it("declines when nothing repeats", () => {
    const result = generateInsight("bundle_ideas", data());
    expect(result.caveat).toContain("at least 2 shared bills");
  });
});

describe("peak hours", () => {
  it("reads the business-timezone hour, not the stored one", () => {
    const result = generateInsight(
      "peak_hours",
      data({
        orders: [order({ id: "night", created_at: "2026-11-16T01:30:00.000+05:30" })],
      }),
    );
    // 01:30 IST is 20:30 UTC the previous day — the brief must say 1am.
    expect(result.metrics.find((m) => m.label === "Peak hour")?.value).toContain("1am");
  });
});

describe("last month summary", () => {
  it("reads the previous calendar month, not the last 30 days", () => {
    const result = generateInsight(
      "month_summary",
      data({
        orders: [
          order({ id: "oct", grand_total: 1200, created_at: "2026-10-20T10:00:00.000+05:30" }),
          order({ id: "nov", grand_total: 500, created_at: "2026-11-05T10:00:00.000+05:30" }),
        ],
        items: [
          item({ id: "a", order_id: "oct", line_total: 1200 }),
          item({ id: "b", order_id: "nov", line_total: 500 }),
        ],
      }),
    );
    // 2026-11-05 sits inside a rolling 30-day window but outside October.
    expect(result.window).toBe("October 2026");
    expect(result.headline).toContain("₹1,200");
    expect(result.metrics.find((m) => m.label === "Bills")?.value).toBe("1");
    expect(result.findings.join(" ")).toContain("September 2026");
  });

  it("places an 01:30 IST bill in November even though UTC says October", () => {
    const result = generateInsight(
      "month_summary",
      data({
        orders: [order({ id: "edge", grand_total: 300, created_at: "2026-11-01T00:30:00.000+05:30" })],
      }),
    );
    expect(result.headline).toContain("Nothing closed");
    expect(result.headline).toContain("October 2026");
  });

  it("steps back across the year boundary", () => {
    const result = generateInsight("month_summary", data({ today: "2026-01-07" }));
    expect(result.window).toBe("December 2025");
    expect(result.findings.join(" ")).toContain("November 2025");
  });

  it("counts the month's first-time buyers and its unanswered reviews", () => {
    const result = generateInsight(
      "month_summary",
      data({
        orders: [
          order({ id: "oct", customer_id: "c1", created_at: "2026-10-20T10:00:00.000+05:30" }),
          order({ id: "sep", customer_id: "c2", created_at: "2026-09-15T10:00:00.000+05:30" }),
        ],
        customers: [customer({ id: "c1", name: "New Nina" }), customer({ id: "c2", name: "Early Ema" })],
        reviews: [
          review({
            id: "r1",
            reviewed_at: "2026-10-22T10:00:00.000+05:30",
            rating: 2,
            sentiment: "negative",
            text: "Cold coffee and a long wait.",
          }),
        ],
      }),
    );
    expect(result.metrics.find((m) => m.label === "New customers")?.value).toBe("1");
    expect(result.findings.join(" ")).toContain("1 review landed in the month at 2 out of 5");
    expect(result.findings.join(" ")).toContain("1 of them has no reply yet");
    expect(result.actions.join(" ")).toContain("unanswered");
  });
});

describe("last 1 week summary", () => {
  it("sums the rolling seven days against the seven before", () => {
    const result = generateInsight(
      "week_summary",
      data({
        orders: [
          order({ id: "in", grand_total: 900, created_at: "2026-11-12T10:00:00.000+05:30" }),
          order({ id: "out", grand_total: 400, created_at: "2026-11-02T10:00:00.000+05:30" }),
        ],
        items: [item({ id: "a", order_id: "in", quantity: 2, line_total: 900 })],
      }),
    );
    expect(result.window).toBe("2026-11-10 to 2026-11-16");
    expect(result.headline).toContain("₹900");
    expect(result.metrics.find((m) => m.label === "Units sold")?.value).toBe("2");
    expect(result.findings.join(" ")).toContain("Thu was the heaviest");
  });

  it("keeps an open ticket out of sales but inside the report", () => {
    const result = generateInsight(
      "week_summary",
      data({
        orders: [order({ id: "open", status: "pending", grand_total: 300 })],
        items: [item({ id: "a", order_id: "open" })],
      }),
    );
    expect(result.headline).toContain("Nothing closed yet");
    expect(result.metrics.find((m) => m.label === "Closed sales")?.value).toBe("₹0.00");
    expect(result.findings.join(" ")).toContain("1 bill is still open");
    expect(result.actions.join(" ")).toContain("written but not banked");
  });

  it("says the week booked nothing at all", () => {
    const result = generateInsight(
      "week_summary",
      data({ orders: [order({ id: "old", created_at: "2026-08-02T10:00:00.000+05:30" })] }),
    );
    expect(result.headline).toContain("booked nothing at all");
    expect(result.caveat).toContain("seven days ending today");
  });
});

describe("reviews summary", () => {
  it("rolls themes, the reply gap and the rating into one read", () => {
    const result = generateInsight(
      "reviews_summary",
      data({
        reviews: [
          review({ id: "good", rating: 5, sentiment: "positive" }),
          review({
            id: "bad",
            reviewed_at: "2026-10-20T10:00:00.000+05:30",
            rating: 1,
            sentiment: "negative",
            tags: ["slow-service"],
            text: "Waited forty minutes for one coffee and nobody even apologised, which is not how a regular is treated here.",
          }),
        ],
      }),
    );
    expect(result.window).toBe("Last 90 days");
    expect(result.metrics.find((m) => m.label === "Reviews")?.value).toBe("2");
    expect(result.metrics.find((m) => m.label === "Unanswered")?.value).toBe("2");
    expect(result.headline).toContain("1-star");
    expect(result.headline).toContain("waited 27 days");
    expect(result.findings.join(" ")).toContain("Complaints cluster on slow service (1)");
    // The oldest complaint is quoted, clipped to a sentence rather than dumped.
    expect(result.findings.join(" ")).toContain("…”");
    expect(result.actions.join(" ")).toContain("Reply to the 1-star slow service review first");
  });

  it("separates a quiet window from no reviews at all", () => {
    expect(generateInsight("reviews_summary", data()).headline).toContain(
      "No review has been recorded",
    );
    const old = generateInsight(
      "reviews_summary",
      data({ reviews: [review({ id: "r1", reviewed_at: "2025-06-10T10:00:00.000+05:30" })] }),
    );
    expect(old.headline).toContain("Nothing was reviewed in the last 90 days");
    expect(old.metrics.find((m) => m.label === "Reviews on file")?.value).toBe("1");
  });

  it("says so when every complaint has been answered", () => {
    const result = generateInsight(
      "reviews_summary",
      data({
        reviews: [
          review({
            id: "r1",
            rating: 4,
            sentiment: "positive",
            response_text: "Thank you — see you next week.",
            responded_at: "2026-11-11T10:00:00.000+05:30",
          }),
        ],
      }),
    );
    expect(result.headline).toContain("every complaint in the window has been answered");
    expect(result.findings.join(" ")).toContain("Every review in the window has a reply on it.");
  });
});

describe("key points", () => {
  const rich = data({
    orders: [
      order({ id: "o1" }),
      order({ id: "old", customer_id: "c2", grand_total: 4000, created_at: "2026-09-01T10:00:00.000+05:30" }),
    ],
    items: [item({ id: "li1", order_id: "o1" })],
    customers: [customer({ id: "c2", name: "Silent Sam" })],
    reviews: [review({ id: "r1" })],
  });

  it("writes one line per area the rows can support", () => {
    const result = generateInsight("key_points", rich);
    expect(result.findings.map((line) => line.split(" — ")[0])).toEqual([
      "Money",
      "Menu",
      "Margin",
      "People",
      "Shelf",
      "Reputation",
    ]);
    expect(result.headline).toContain("6 points from the last 30 days");
    expect(result.findings.join(" ")).toContain("People — 1 good customer has gone quiet");
    expect(result.actions.join(" ")).toContain("Call Silent Sam");
  });

  it("drops the Menu point rather than inventing an earner", () => {
    const result = generateInsight("key_points", data({ items: [] }));
    expect(result.findings.some((line) => line.startsWith("Menu"))).toBe(false);
    expect(result.headline).toContain("5 points");
    expect(result.findings.join(" ")).toContain("Shelf — this brand keeps no stock items");
  });
});

describe("the summary cards themselves", () => {
  it("keeps exactly four cards in the 2×2 grid", () => {
    const summaries = AI_INSIGHT_PROMPTS.filter((prompt) => prompt.group === "summary");
    expect(summaries.map((prompt) => prompt.kind)).toEqual([
      "month_summary",
      "week_summary",
      "reviews_summary",
      "key_points",
    ]);
    expect(AI_INSIGHT_PROMPTS.filter((prompt) => prompt.group === "brief")).toHaveLength(9);
  });

  it("states on each card which window it will read", () => {
    const withReviews = data({ reviews: [review({ id: "r1" })] });
    expect(aiSummaryHint("month_summary", withReviews)).toBe("October 2026");
    expect(aiSummaryHint("week_summary", withReviews)).toBe("2026-11-10 → 2026-11-16");
    expect(aiSummaryHint("reviews_summary", withReviews)).toBe(
      "1 review in 90 days · 1 review on file",
    );
    expect(aiSummaryHint("key_points", withReviews)).toBe("Last 30 days at a glance");
    expect(aiSummaryHint("reviews_summary", data())).toBe("No review on file yet");
    // A narrow brief falls back to its blurb, so no card ever shows an empty line.
    expect(aiSummaryHint("stock_risk", withReviews)).toBe(
      AI_INSIGHT_PROMPTS.find((prompt) => prompt.kind === "stock_risk")?.blurb,
    );
  });
});

describe("routing the free-text box", () => {
  it("places a question on an existing brief", () => {
    expect(routeQuestion("What are the most sold items?")).toBe("top_sellers");
    expect(routeQuestion("what will we run out of this week?")).toBe("stock_risk");
    expect(routeQuestion("which customers have stopped coming?")).toBe("win_back");
    expect(routeQuestion("where am I losing margin?")).toBe("margin_watch");
    expect(routeQuestion("how is today going?")).toBe("today_report");
    expect(routeQuestion("how was last month?")).toBe("month_summary");
    expect(routeQuestion("what is the reputation looking like?")).toBe("reviews_summary");
    expect(routeQuestion("give me the highlights")).toBe("key_points");
  });

  it("sends every example phrasing back to the brief it came from", () => {
    for (const prompt of AI_INSIGHT_PROMPTS) {
      expect(routeQuestion(prompt.example), prompt.example).toBe(prompt.kind);
    }
  });

  it("returns nothing it cannot answer", () => {
    expect(routeQuestion("what is the weather tomorrow")).toBeNull();
    expect(routeQuestion("")).toBeNull();
  });

  it("guards the kind list", () => {
    expect(isAiInsightKind("today_report")).toBe(true);
    expect(isAiInsightKind("drop_the_table")).toBe(false);
    expect(isAiInsightKind("constructor")).toBe(false);
  });
});

describe("determinism", () => {
  const rich = data({
    orders: [order({ id: "o1" }), order({ id: "o2", status: "pending" })],
    items: [item({ id: "a", order_id: "o1", quantity: 3 })],
    products: [product({ id: "p1", cost_price: 120 })],
    customers: [customer({ id: "c1" })],
    reviews: [review({ id: "r1" })],
  });

  it("writes the same brief twice from the same rows", () => {
    for (const kind of AI_INSIGHT_KINDS) {
      expect(generateInsight(kind, rich)).toEqual(generateInsight(kind, rich));
    }
  });

  it("keeps every figure inside the sentences finite", () => {
    const empty = data({ orders: [], items: [], products: [], payments: [] });
    for (const kind of AI_INSIGHT_KINDS) {
      for (const rows of [data(), empty, rich]) {
        const result = generateInsight(kind, rows);
        const prose = [
          result.headline,
          ...result.metrics.map((metric) => `${metric.label}: ${metric.value}`),
          ...result.findings,
          ...result.actions,
          result.caveat ?? "",
        ].join("\n");
        // `[object` and `[Function` are what an un-called helper interpolates to.
        expect(prose, `${kind} on ${rows.orders.length} orders`).not.toMatch(
          /NaN|Infinity|undefined|null|\[object|\[Function/,
        );
      }
    }
  });
});
