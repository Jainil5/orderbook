import { describe, expect, it } from "vitest";
import type {
  CampaignChannel,
  CampaignStatus,
  CampaignType,
  CustomerComplaint,
  CustomerInteraction,
  CustomerReview,
  InteractionType,
  MarketingCampaign,
} from "@/types/crm";
import type { Order, OrderItem, Product } from "@/types/database";
import { generateScript, REEL_DURATIONS } from "./script";
import {
  briefForMover,
  briefForTopic,
  buildGrowthSignals,
  EXAMPLE_LIMIT,
  SLOW_MOVERS_LIMIT,
  TOP_MOVERS_LIMIT,
  TOPIC_LIST_LIMIT,
  type ContentBrief,
  type MoverRow,
  type QuestionTopic,
  type SignalInput,
} from "./signals";

/** mulberry32 — same helper script.test.ts uses: fixed seed, fixed script. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t >>> 14;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * now = 2026-11-20 11:00 IST. Subtracting whole DAYs keeps every fixture
 * inside the same business calendar day, so window maths is checkable by
 * day offset alone.
 */
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 20, 5, 30);
const at = (daysAgo: number): string => new Date(NOW - daysAgo * DAY).toISOString();
/** Business calendar day (IST) `daysAgo` back — valid at 11:00 IST. */
const serviceDay = (daysAgo: number): string => at(daysAgo).slice(0, 10);

function product(id: string, name: string, over: Partial<Product> = {}): Product {
  return {
    id,
    brand_id: "br",
    name,
    description: null,
    sku: null,
    category: null,
    price: 100,
    unit: "pc",
    is_active: true,
    ...over,
  };
}

function order(id: string, daysAgo: number, over: Partial<Order> = {}): Order {
  return {
    id,
    brand_id: "br",
    order_number: id,
    status: "completed",
    payment_status: "paid",
    customer_id: null,
    customer_name_snapshot: "Walk-in",
    subtotal: 100,
    discount_total: 0,
    tax_total: 0,
    fees_total: 0,
    grand_total: 100,
    notes: null,
    created_at: at(daysAgo),
    ...over,
  };
}

function item(
  orderId: string,
  productId: string | null,
  name: string,
  quantity: number,
  lineTotal: number,
  over: Partial<OrderItem> = {},
): OrderItem {
  return {
    id: `${orderId}-${name}-line`,
    order_id: orderId,
    product_id: productId,
    product_name_snapshot: name,
    quantity,
    unit_price: lineTotal,
    line_discount: 0,
    line_total: lineTotal,
    ...over,
  };
}

function interaction(
  id: string,
  daysAgo: number,
  type: InteractionType,
  summary: string,
  over: Partial<CustomerInteraction> = {},
): CustomerInteraction {
  return {
    id,
    brand_id: "br",
    customer_id: "c1",
    lead_id: null,
    type,
    summary,
    detail: null,
    occurred_at: at(daysAgo),
    staff_id: null,
    outcome: null,
    next_follow_up_at: null,
    task_id: null,
    attachment_url: null,
    ...over,
  };
}

function review(id: string, daysAgo: number, text: string, over: Partial<CustomerReview> = {}): CustomerReview {
  return {
    id,
    brand_id: "br",
    customer_id: "c1",
    source: "Google Business Profile",
    rating: 4,
    text,
    reviewed_at: at(daysAgo),
    response_text: "thanks",
    responded_at: at(daysAgo),
    sentiment: "positive",
    tags: [],
    staff_mentioned: null,
    internal_notes: null,
    status: "acknowledged",
    complaint_id: null,
    ...over,
  };
}

function complaint(id: string, daysAgo: number, subject: string, over: Partial<CustomerComplaint> = {}): CustomerComplaint {
  return {
    id,
    brand_id: "br",
    customer_id: "c1",
    review_id: null,
    interaction_id: null,
    subject,
    detail: null,
    severity: "medium",
    status: "open",
    owner_staff_id: null,
    raised_at: at(daysAgo),
    resolved_at: null,
    ...over,
  };
}

function campaign(id: string, over: Partial<MarketingCampaign> = {}): MarketingCampaign {
  const base: MarketingCampaign = {
    id,
    brand_id: "br",
    name: id,
    description: "",
    type: "offer" as CampaignType,
    channel: "whatsapp" as CampaignChannel,
    segment_id: null,
    offer_id: null,
    starts_at: at(10),
    ends_at: at(-2),
    status: "active" as CampaignStatus,
    consent_required: true,
    messages_sent: 5,
    delivered: 0,
    responded: 0,
    redeemed: 0,
    revenue_attributed: 0,
    delivery: "manual_log",
    created_at: at(12),
    updated_at: at(10),
  };
  return { ...base, ...over };
}

function input(over: Partial<SignalInput> = {}): SignalInput {
  return {
    now: NOW,
    products: [],
    orders: [],
    orderItems: [],
    interactions: [],
    reviews: [],
    complaints: [],
    campaigns: [],
    ...over,
  };
}

const findMover = (rows: MoverRow[], name: string): MoverRow => {
  const row = rows.find((r) => r.name === name);
  if (!row) throw new Error(`no mover named ${name}`);
  return row;
};

describe("window", () => {
  it("defaults to 30 days and spans exactly 30 business days", () => {
    const signals = buildGrowthSignals(input());
    expect(signals.window.days).toBe(30);
    expect(signals.window.label).toBe("Last 30 days");
    expect(signals.window.until - signals.window.since).toBe(30 * DAY);
  });

  it("honours windowDays and labels it", () => {
    const signals = buildGrowthSignals(input({ windowDays: 7 }));
    expect(signals.window.days).toBe(7);
    expect(signals.window.label).toBe("Last 7 days");
    expect(signals.window.until - signals.window.since).toBe(7 * DAY);
  });

  it("slices at the day boundary: 29 ago is in, 30 ago falls to the previous window", () => {
    const signals = buildGrowthSignals(
      input({
        products: [product("p1", "Cake")],
        orders: [order("o-new", 29), order("o-old", 30)],
        orderItems: [item("o-new", "p1", "Cake", 1, 100), item("o-old", "p1", "Cake", 3, 300)],
      }),
    );
    // 1 of 3 at half pace or worse — this decliner reads as a slow mover.
    const cake = findMover(signals.slowMovers, "Cake");
    expect(cake.units).toBe(1);
    expect(cake.revenue).toBe(100);
    expect(cake.trend).toBe(-67); // 1 vs 3 in the equal window before
    expect(signals.topMovers).toHaveLength(0);
  });

  it("files orders under service_date when present, not created_at", () => {
    const signals = buildGrowthSignals(
      input({
        products: [product("p1", "Table")],
        orders: [order("o1", 40, { service_date: serviceDay(2) })],
        orderItems: [item("o1", "p1", "Table", 2, 4000)],
      }),
    );
    const table = findMover(signals.topMovers, "Table");
    expect(table.units).toBe(2);
    expect(table.trend).toBeNull();
  });
});

describe("demand rule", () => {
  it("excludes credit notes, cancelled, refunded, pending and draft orders", () => {
    const signals = buildGrowthSignals(
      input({
        products: [product("p1", "Coffee")],
        orders: [
          order("o-sale", 1),
          order("o-credit", 1, { order_kind: "credit_note", parent_order_id: "o-sale", grand_total: -100 }),
          order("o-cancel", 1, { status: "cancelled" }),
          order("o-refund", 1, { status: "refunded" }),
          order("o-pend", 1, { status: "pending" }),
          order("o-draft", 1, { status: "draft" }),
        ],
        orderItems: [
          item("o-sale", "p1", "Coffee", 2, 200),
          item("o-credit", "p1", "Coffee", -2, -200),
          item("o-cancel", "p1", "Coffee", 5, 500),
          item("o-refund", "p1", "Coffee", 5, 500),
          item("o-pend", "p1", "Coffee", 5, 500),
          item("o-draft", "p1", "Coffee", 5, 500),
        ],
      }),
    );
    const coffee = findMover(signals.topMovers, "Coffee");
    expect(coffee.units).toBe(2);
    expect(coffee.revenue).toBe(200);
  });

  it("prices margin from the recorded cost only, and says null without one", () => {
    const signals = buildGrowthSignals(
      input({
        products: [product("p1", "Costed", { cost_price: 40 }), product("p2", "Blind")],
        orders: [order("o1", 1), order("o2", 1)],
        orderItems: [item("o1", "p1", "Costed", 2, 200), item("o2", "p2", "Blind", 1, 100)],
      }),
    );
    expect(findMover(signals.topMovers, "Costed").margin).toBe(60);
    expect(findMover(signals.topMovers, "Blind").margin).toBeNull();
  });

  it("leaves margin null for a slow mover that sold nothing in the window", () => {
    const signals = buildGrowthSignals(
      input({
        products: [product("p1", "Quiet", { cost_price: 10 })],
        orders: [order("o-old", 35)],
        orderItems: [item("o-old", "p1", "Quiet", 4, 200)],
      }),
    );
    const row = findMover(signals.slowMovers, "Quiet");
    expect(row.units).toBe(0);
    expect(row.margin).toBeNull();
    expect(row.trend).toBe(-100);
  });
});

describe("product matching", () => {
  it("shows a renamed product under its current name via product_id", () => {
    const signals = buildGrowthSignals(
      input({
        products: [product("p1", "New Name")],
        orders: [order("o1", 1)],
        orderItems: [item("o1", "p1", "Old Name From The Receipt", 1, 100)],
      }),
    );
    expect(signals.topMovers.map((r) => r.name)).toEqual(["New Name"]);
    expect(signals.topMovers[0].productId).toBe("p1");
  });

  it("falls back to the snapshot when the product id no longer exists", () => {
    const signals = buildGrowthSignals(
      input({
        products: [],
        orders: [order("o1", 1)],
        orderItems: [item("o1", "p-deleted", "Deleted Delight", 3, 300)],
      }),
    );
    const row = findMover(signals.topMovers, "Deleted Delight");
    expect(row.productId).toBeNull();
    expect(row.units).toBe(3);
  });

  it("joins a snapshot-only line to the live product whose name it matches", () => {
    const signals = buildGrowthSignals(
      input({
        products: [product("p1", "Flat White", { cost_price: 60 })],
        orders: [order("o1", 1, { grand_total: 240 }), order("o2", 2)],
        orderItems: [
          item("o1", null, "flat white ", 1, 240),
          item("o2", "p1", "Flat White", 2, 440),
        ],
      }),
    );
    expect(signals.topMovers).toHaveLength(1);
    const row = findMover(signals.topMovers, "Flat White");
    expect(row.productId).toBe("p1");
    expect(row.units).toBe(3);
    expect(row.margin).toBeCloseTo(166.67, 2); // (240+440)/3 - 60
  });
});

describe("top and slow movers", () => {
  it("ranks top movers by units and caps at the stated limit", () => {
    const products: Product[] = [];
    const orders: Order[] = [];
    const orderItems: OrderItem[] = [];
    for (let i = 0; i < TOP_MOVERS_LIMIT + 2; i++) {
      products.push(product(`p${i}`, `P${String(i).padStart(2, "0")}`));
      orders.push(order(`o${i}`, 1));
      orderItems.push(item(`o${i}`, `p${i}`, `P${String(i).padStart(2, "0")}`, i + 1, (i + 1) * 100));
    }
    const signals = buildGrowthSignals(input({ products, orders, orderItems }));
    expect(signals.topMovers).toHaveLength(TOP_MOVERS_LIMIT);
    expect(signals.topMovers[0].name).toBe(`P${String(TOP_MOVERS_LIMIT + 1).padStart(2, "0")}`);
  });

  it("calls a product slow only with history and a halting pace", () => {
    const signals = buildGrowthSignals(
      input({
        products: [product("p1", "Stopped"), product("p2", "Halved"), product("p3", "Slipped"), product("p4", "BrandNew")],
        orders: [
          order("a-cur", 1), order("a-prev", 40),
          order("b-cur", 1), order("b-prev", 40),
          order("c-cur", 1), order("c-prev", 40),
          order("d-cur", 1),
        ],
        orderItems: [
          item("a-cur", "p1", "Stopped", 0, 0), item("a-prev", "p1", "Stopped", 6, 600),
          item("b-cur", "p2", "Halved", 3, 300), item("b-prev", "p2", "Halved", 6, 600),
          item("c-cur", "p3", "Slipped", 4, 400), item("c-prev", "p3", "Slipped", 6, 600),
          item("d-cur", "p4", "BrandNew", 1, 100),
        ],
      }),
    );
    const names = signals.slowMovers.map((r) => r.name);
    expect(names).toContain("Stopped");
    expect(names).toContain("Halved"); // 3 is exactly half of 6
    expect(names).not.toContain("Slipped"); // 4 of 6 is a slide, not a halt
    expect(names).not.toContain("BrandNew"); // no history at all
  });

  it("orders slow movers oldest-sold first and caps the list", () => {
    const products: Product[] = [];
    const orders: Order[] = [];
    const orderItems: OrderItem[] = [];
    const count = SLOW_MOVERS_LIMIT + 3;
    for (let i = 0; i < count; i++) {
      // i = 0 sold longest ago (day 55), i = count-1 most recently (day 41)
      products.push(product(`p${i}`, `S${String(i).padStart(2, "0")}`));
      orders.push(order(`po${i}`, 55 - i));
      orderItems.push(item(`po${i}`, `p${i}`, `S${String(i).padStart(2, "0")}`, 2, 200));
    }
    const signals = buildGrowthSignals(input({ products, orders, orderItems }));
    expect(signals.slowMovers).toHaveLength(SLOW_MOVERS_LIMIT);
    expect(signals.slowMovers.map((r) => r.name)).toEqual(
      Array.from({ length: SLOW_MOVERS_LIMIT }, (_, i) => `S${String(i).padStart(2, "0")}`),
    );
  });

  it("shows a decliner once: a half-pace seller is a slow mover, not a top mover", () => {
    const signals = buildGrowthSignals(
      input({
        products: [product("p1", "Boom"), product("p2", "Big")],
        orders: [order("a-prev", 40), order("a-cur", 1), order("b-cur", 1)],
        orderItems: [
          item("a-prev", "p1", "Boom", 40, 4000),
          item("a-cur", "p1", "Boom", 4, 400),
          item("b-cur", "p2", "Big", 30, 3000),
        ],
      }),
    );
    expect(signals.topMovers.map((r) => r.name)).toEqual(["Big"]);
    expect(signals.slowMovers.map((r) => r.name)).toEqual(["Boom"]);
    expect(signals.slowMovers[0].trend).toBe(-90);
  });

  it("reports trend null with no history and real percentages otherwise", () => {
    const signals = buildGrowthSignals(
      input({
        products: [product("p1", "Fresh"), product("p2", "Up")],
        orders: [order("f", 1), order("u-cur", 1), order("u-prev", 40)],
        orderItems: [item("f", "p1", "Fresh", 5, 500), item("u-cur", "p2", "Up", 6, 600), item("u-prev", "p2", "Up", 4, 400)],
      }),
    );
    expect(findMover(signals.topMovers, "Fresh").trend).toBeNull();
    expect(findMover(signals.topMovers, "Up").trend).toBe(50);
  });
});

describe("topic lexicon", () => {
  it("groups window interactions as questions and complaints as objections", () => {
    const signals = buildGrowthSignals(
      input({
        interactions: [
          interaction("i1", 3, "whatsapp", "Do you have gluten free options?", { detail: "Customer is coeliac." }),
          interaction("i2", 5, "complaint", "The rider never showed"),
          interaction("i3", 300, "email", "Can you deliver to the office address?"),
          interaction("i4", 2, "note", "Restock the gluten flour shelf"),
        ],
        complaints: [
          complaint("c1", 4, "Delivery left at the wrong gate", { detail: "Rider used the old address." }),
          complaint("c2", 2, "Refunded twice and the invoice still looks wrong"),
        ],
      }),
    );
    expect(signals.questions.map((t) => t.topic)).toEqual(["allergen"]);
    expect(signals.questions[0].count).toBe(1);
    expect(signals.objections.map((t) => t.topic)).toEqual(["delivery", "return"]);
    expect(signals.objections[0].count).toBe(2); // i2 and c1 grouped together
    // i3 is outside the 30-day window; i4 is an internal note — both dropped.
  });

  it("splits reviews by their stored sentiment, and drops unclassified text", () => {
    const signals = buildGrowthSignals(
      input({
        reviews: [
          review("r1", 2, "The music was far too loud for a work lunch", { sentiment: "negative" }),
          review("r2", 3, "We waited fifteen minutes for a table", { sentiment: "neutral", rating: 3 }),
          review("r3", 4, "Best flat white, though the portion was small", { sentiment: "positive" }),
        ],
      }),
    );
    expect(signals.objections).toHaveLength(0); // r1 matches no lexicon topic at all
    expect(signals.questions.map((t) => t.topic)).toEqual(["portion", "wait time"]); // count tie, A→Z
  });

  it("breaks ties by declared lexicon order: return before payment", () => {
    const signals = buildGrowthSignals(
      input({ complaints: [complaint("c1", 1, "Refunded the bill twice and the invoice still looks wrong")] }),
    );
    expect(signals.objections.map((t) => t.topic)).toEqual(["return"]);
  });

  it("caps examples at three and truncates long text at a word boundary", () => {
    const long =
      "delivery was late again and the note on the counter said that the courier left it by the back gate which is " +
      "locked after nine so the whole sentence keeps going past the truncation limit XTRAWORD";
    const signals = buildGrowthSignals(
      input({
        complaints: [
          complaint("c1", 1, "Delivery missed", { detail: long }),
          complaint("c2", 2, "Delivery missed"),
          complaint("c3", 3, "Delivery missed"),
          complaint("c4", 4, "Delivery missed"),
          complaint("c5", 5, 'Delivery "stolen" from the porch'),
        ],
      }),
    );
    const topic = signals.objections.find((t) => t.topic === "delivery")!;
    expect(topic.count).toBe(5);
    expect(topic.examples).toHaveLength(EXAMPLE_LIMIT);
    for (const example of topic.examples) expect(example.length).toBeLessThanOrEqual(110);
    expect(topic.examples[0]).not.toContain("XTRAWORD");
    expect(topic.examples.some((e) => e.includes('"'))).toBe(false);
  });

  it("links a topic to the product its sentences name, else null", () => {
    const signals = buildGrowthSignals(
      input({
        products: [product("p1", "Oslo Dining Table"), product("p2", "Table Lamp")],
        orderItems: [item("o-x", "p1", "Oslo Dining Table", 1, 1)],
        orders: [order("o-x", 1)],
        interactions: [interaction("i1", 1, "call", "Is the Oslo Dining Table chip-resistant?")],
      }),
    );
    expect(signals.questions.find((t) => t.topic === "quality")!.productId).toBe("p1");
  });

  it("caps each topic list at TOPIC_LIST_LIMIT, most-mentioned first", () => {
    const rows: CustomerInteraction[] = [
      interaction("i1", 1, "whatsapp", "any slots on friday?"),
      interaction("i2", 1, "whatsapp", "allergy in the soup?"),
      interaction("i3", 1, "whatsapp", "allergy in the salad?"),
      interaction("i4", 1, "whatsapp", "is parking free?"),
      interaction("i5", 1, "whatsapp", "what are your hours?"),
      interaction("i6", 1, "whatsapp", "how much, the price?"),
      interaction("i7", 1, "whatsapp", "can I return this?"),
      interaction("i8", 1, "whatsapp", "delivery time?"),
    ];
    const signals = buildGrowthSignals(input({ interactions: rows }));
    expect(signals.questions).toHaveLength(TOPIC_LIST_LIMIT);
    expect(signals.questions[0]).toMatchObject({ topic: "allergen", count: 2 });
    const topics = signals.questions.map((t) => t.topic);
    // Seven topics: allergen(2) leads, then the count-1 topics A→Z; the
    // seventh in that order — schedule — is the one cut.
    expect(topics).toEqual(["allergen", "delivery", "hours", "parking", "price", "return"]);
  });
});

describe("backlog counters", () => {
  it("counts every unanswered review and every open complaint, outside the window too", () => {
    const signals = buildGrowthSignals(
      input({
        reviews: [
          review("r1", 200, "cold coffee", { response_text: null, responded_at: null }),
          review("r2", 1, "lovely", { response_text: "   " }),
          review("r3", 1, "lovely too", { response_text: "thank you" }),
        ],
        complaints: [
          complaint("c1", 120, "still open"),
          complaint("c2", 1, "working it", { status: "in_progress" }),
          complaint("c3", 1, "done", { status: "resolved" }),
        ],
      }),
    );
    expect(signals.unansweredReviews).toBe(2);
    expect(signals.openComplaints).toBe(2);
  });
});

describe("campaign evidence", () => {
  const coded = (id: string, over: Partial<MarketingCampaign> = {}) =>
    campaign(id, { offer_id: "PANEL15", ...over });

  it("worked needs logged redemptions and tracked bills carrying the code", () => {
    const signals = buildGrowthSignals(
      input({
        orders: [
          order("o1", 3, { offer_code_snapshot: "PANEL15", grand_total: 500 }),
          order("o2", 5, { offer_code_snapshot: "panel15", grand_total: 300 }),
          order("o3", 40, { offer_code_snapshot: "PANEL15", grand_total: 900 }), // outside window
          order("o4", 2, { offer_code_snapshot: "OTHER" }),
        ],
        campaigns: [coded("cm-1", { redeemed: 4, revenue_attributed: 1200 })],
      }),
    );
    const evidence = signals.campaignEvidence[0];
    expect(evidence.verdict).toBe("worked");
    expect(evidence.ordersFromOfferCode).toBe(2);
    expect(evidence.revenueFromOfferCode).toBe(800);
    expect(evidence.redeemed).toBe(4);
    expect(evidence.revenueAttributed).toBe(1200);
  });

  it("quiet covers a ran campaign with no bills, and bills with nothing logged", () => {
    const signals = buildGrowthSignals(
      input({
        orders: [order("o1", 3, { offer_code_snapshot: "PANEL15", grand_total: 500 })],
        campaigns: [
          coded("cm-no-orders", { offer_id: "NEVERUSED", redeemed: 2 }),
          coded("cm-no-log", { redeemed: 0 }),
          coded("cm-cancelled", { status: "cancelled", redeemed: 9 }),
        ],
      }),
    );
    expect(signals.campaignEvidence.map((c) => [c.campaignId, c.verdict])).toEqual([
      ["cm-no-log", "quiet"],
      ["cm-no-orders", "quiet"],
    ]); // cancelled excluded; tracked-revenue sorts first
    const noLog = signals.campaignEvidence.find((c) => c.campaignId === "cm-no-log")!;
    expect(noLog.ordersFromOfferCode).toBe(1);
    expect(noLog.verdict).toBe("quiet");
  });

  it("no_offer_tracked when the campaign carries no offer", () => {
    const signals = buildGrowthSignals(
      input({ campaigns: [campaign("cm-plain", { redeemed: 3, revenue_attributed: 900 })] }),
    );
    expect(signals.campaignEvidence[0]).toMatchObject({
      campaignId: "cm-plain",
      verdict: "no_offer_tracked",
      ordersFromOfferCode: 0,
      revenueFromOfferCode: 0,
      redeemed: 3, // the hand-logged counters are echoed, not laundered
      revenueAttributed: 900,
    });
  });

  it("excludes credit notes and draft bills from the proof, and out-of-window campaigns from the board", () => {
    const signals = buildGrowthSignals(
      input({
        orders: [
          order("o1", 2, { offer_code_snapshot: "PANEL15", grand_total: 400 }),
          order("o-cn", 2, { offer_code_snapshot: "PANEL15", grand_total: -400, order_kind: "credit_note" }),
          order("o-draft", 2, { offer_code_snapshot: "PANEL15", status: "draft" }),
        ],
        campaigns: [
          coded("cm-1", { redeemed: 1 }),
          campaign("cm-draft", { offer_id: "PANEL15", status: "draft", redeemed: 5 }),
          campaign("cm-old", { offer_id: "PANEL15", starts_at: at(90), ends_at: at(61) }),
        ],
      }),
    );
    expect(signals.campaignEvidence).toHaveLength(1);
    expect(signals.campaignEvidence[0].ordersFromOfferCode).toBe(1);
    expect(signals.campaignEvidence[0].revenueFromOfferCode).toBe(400);
  });

  it("keeps open-ended campaigns (no dates at all) on the board", () => {
    const signals = buildGrowthSignals(
      input({ campaigns: [campaign("cm-open", { starts_at: null, ends_at: null })] }),
    );
    expect(signals.campaignEvidence.map((c) => c.campaignId)).toEqual(["cm-open"]);
  });
});

describe("content briefs", () => {
  const mover = (over: Partial<MoverRow> = {}): MoverRow => ({
    productId: "p1",
    name: "Flat White",
    units: 12,
    revenue: 2640,
    margin: 60,
    trend: 20,
    ...over,
  });
  const topic = (over: Partial<QuestionTopic> = {}): QuestionTopic => ({
    topic: "delivery",
    count: 4,
    examples: ['the rider used a "stale address"'],
    productId: null,
    ...over,
  });

  const scriptFor = (brief: ContentBrief, seed: number) =>
    generateScript(
      {
        brandName: "Brewery Cafe",
        productName: brief.productName,
        objective: brief.objective,
        kind: brief.kind,
        seconds: brief.seconds,
        notes: brief.notes,
      },
      mulberry32(seed),
    );

  it("top mover with history is a content reel and generates", () => {
    const brief = briefForMover(mover(), "top");
    expect(brief).toMatchObject({ productId: "p1", objective: "content", kind: "reel" });
    expect(REEL_DURATIONS).toContain(brief.seconds);
    expect(scriptFor(brief, 1).kind).toBe("reel");
  });

  it("top mover without history is framed as a new launch", () => {
    const brief = briefForMover(mover({ trend: null }), "top");
    expect(brief.objective).toBe("new_launch");
    expect(scriptFor(brief, 2).objective).toBe("new_launch");
  });

  it("slow mover becomes a discount reel and generates", () => {
    const brief = briefForMover(mover({ units: 0, margin: null, trend: -100 }), "slow");
    expect(brief.objective).toBe("discount");
    const script = scriptFor(brief, 3);
    expect(script.objective).toBe("discount");
    // The notes name no figure, so the script cannot invent an offer amount.
    expect(script.caption).not.toMatch(/\d+\s*%|\boff\b/);
  });

  it("topic brief is a content photo post and generates, with or without a product", () => {
    const brief = briefForTopic(topic());
    expect(brief).toMatchObject({ objective: "content", kind: "image", productId: null });
    expect(scriptFor(brief, 4).seconds).toBe(0);
    const linked = briefForTopic(topic({ productId: "p9" }));
    expect(scriptFor(linked, 5).kind).toBe("image");
    expect(linked.productId).toBe("p9");
  });

  it("notes carry no invented money language", () => {
    for (const brief of [
      briefForMover(mover(), "top"),
      briefForMover(mover({ trend: null }), "slow"),
      briefForTopic(topic()),
    ]) {
      expect(brief.notes).not.toMatch(/%|₹|\boff\b|\bdiscount\b|\bprice\b/i);
    }
  });

  it("survives every generator path the screen offers, seeded", () => {
    const briefs = [
      briefForMover(mover(), "top"),
      briefForMover(mover({ trend: 0 }), "top"),
      briefForMover(mover({ trend: -50 }), "slow"),
      briefForTopic(topic({ topic: "wait time" })),
    ];
    for (const [index, brief] of briefs.entries()) {
      const script = scriptFor(brief, 10 + index);
      expect(script.shots.length).toBeGreaterThan(0);
      expect(script.title).not.toContain("undefined");
    }
  });

  it("is deterministic: the same rows produce the same signals twice", () => {
    const rows = input({
      products: [product("p1", "Cake", { cost_price: 20 })],
      orders: [order("o1", 1), order("o2", 35)],
      orderItems: [item("o1", "p1", "Cake", 2, 200), item("o2", "p1", "Cake", 2, 200)],
      interactions: [interaction("i1", 1, "call", "any allergy in the cream?")],
    });
    expect(buildGrowthSignals(rows)).toEqual(buildGrowthSignals(rows));
  });
});
