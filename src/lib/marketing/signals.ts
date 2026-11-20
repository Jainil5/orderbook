import type { Order, OrderItem, Product } from "@/types/database";
import type {
  CampaignChannel,
  CustomerComplaint,
  CustomerInteraction,
  CustomerReview,
  MarketingCampaign,
} from "@/types/crm";
import { isRevenueOrder } from "@/lib/orders/order-rules";
import { isUnanswered } from "@/lib/crm/reviews";
import {
  addCalendarDays,
  calendarDateInZone,
  zoneDayStartUtc,
  zoneDayEndUtc,
} from "@/lib/analytics/date-range";
import { REEL_DURATIONS, type ContentKind, type ContentObjective } from "./script";

/**
 * ===========================================================================
 * Demand signals — the maths behind the Growth Signals screen.
 *
 * The screen answers three questions from rows the demo already holds, and
 * nothing else:
 *  1. what is actually moving (movers, with a trend against the window before),
 *  2. what people keep asking or complaining about (topic groups from the
 *     interaction, review and complaint logs),
 *  3. which campaigns drove real orders rather than vanity reach (bills that
 *     carry the campaign's offer code).
 *
 * Every finding is handed back a second time as a `ContentBrief` — an
 * objective/kind/seconds/notes combination that `generateScript` in
 * `marketing/script.ts` accepts unchanged, so the UI can prefill the content
 * form and press Generate without guessing. No numbers are invented anywhere:
 * the only money figures produced here are sums of stored line totals and the
 * merchant's own hand-logged campaign counters.
 *
 * Pure and deterministic: the clock arrives as `input.now` (epoch ms), there
 * is no `Date.now()` inside, and the same rows always produce the same answer.
 * ===========================================================================
 */

export type SignalWindow = {
  days: number;
  /** Inclusive lower bound, epoch ms — start of the first business day. */
  since: number;
  /** Exclusive upper bound, epoch ms — end of the last business day. */
  until: number;
  /** Header caption, e.g. "Last 30 days". */
  label: string;
};

export type MoverRow = {
  /** Null when the sale cannot be tied to a live product (renamed/deleted). */
  productId: string | null;
  name: string;
  units: number;
  revenue: number;
  /** Per-unit realised margin; null unless the product carries a cost. */
  margin: number | null;
  /** % vs the previous equal window; null when that window sold nothing. */
  trend: number | null;
};

export type QuestionTopic = {
  topic: string;
  count: number;
  /** Up to EXAMPLE_LIMIT plain-text, truncated quotes from the log. */
  examples: string[];
  /** Set when a logged sentence actually named this product. */
  productId: string | null;
};

export type CampaignEvidence = {
  campaignId: string;
  name: string;
  channel: CampaignChannel;
  /** Echo of the merchant's hand-logged redemption counter. */
  redeemed: number;
  /** Echo of the merchant's hand-logged attribution claim. */
  revenueAttributed: number;
  /** Demand bills in the window whose offer code matches the campaign. */
  ordersFromOfferCode: number;
  revenueFromOfferCode: number;
  verdict: "worked" | "quiet" | "no_offer_tracked";
};

export type GrowthSignals = {
  window: SignalWindow;
  topMovers: MoverRow[];
  slowMovers: MoverRow[];
  questions: QuestionTopic[];
  objections: QuestionTopic[];
  unansweredReviews: number;
  openComplaints: number;
  campaignEvidence: CampaignEvidence[];
};

export type SignalInput = {
  now: number;
  windowDays?: number;
  products: readonly Product[];
  orders: readonly Order[];
  orderItems: readonly OrderItem[];
  interactions: readonly CustomerInteraction[];
  reviews: readonly CustomerReview[];
  complaints: readonly CustomerComplaint[];
  campaigns: readonly MarketingCampaign[];
};

export type ContentBrief = {
  productId: string | null;
  productName: string;
  objective: ContentObjective;
  kind: ContentKind;
  /** Always one of REEL_DURATIONS so a reel validates; ignored by an image. */
  seconds: number;
  notes: string;
};

/**
 * List caps. Eight movers is what one screen column holds without a "show
 * more", six slow movers is enough to act on, and a topic list longer than
 * six stops being a signal. Three examples per topic: enough to show the
 * group is real, short enough to read.
 */
export const TOP_MOVERS_LIMIT = 8;
export const SLOW_MOVERS_LIMIT = 6;
export const TOPIC_LIST_LIMIT = 6;
export const EXAMPLE_LIMIT = 3;
const EXAMPLE_LENGTH = 110;
const DEFAULT_WINDOW_DAYS = 30;

/**
 * Fixed keyword lexicon — the whole classifier. One compiled regex per topic,
 * whole words with explicit inflections (no stemming, no model, no substring
 * accidents like "flat" reading as "late").
 *
 * Classification rule (the seam a real classifier replaces later): each log
 * row's text is assigned to the FIRST topic in this declared order whose
 * regex matches. Rows matching no topic are DROPPED, never given a made-up
 * topic; a topic with zero rows never appears. Declared order is therefore
 * the priority when one sentence touches two topics — safety (allergen) and
 * the concrete service failures come before the money words, so "refund and
 * the bill" reads as a return, not a price query.
 *
 * The ten base topics are the brief's list; `payment` and `schedule` are the
 * two the shipped CSVs clearly need (split-bill / card-machine / invoice rows
 * in Brewery Cafe, quoted-timeline and replacement-delay rows in Cubig).
 */
const WORDS = (forms: string[]): RegExp =>
  new RegExp(`\\b(?:${forms.join("|")})\\b`, "i");

const LEXICON: { topic: string; pattern: RegExp }[] = [
  { topic: "allergen", pattern: WORDS(["allergen", "allergy", "allergic", "peanut", "cashew", "nuts", "gluten", "lactose"]) },
  { topic: "delivery", pattern: WORDS(["delivery", "deliver", "delivered", "rider", "courier", "dispatch", "shipment", "shipped"]) },
  { topic: "return", pattern: WORDS(["refund", "refunds", "refunded", "return", "returns", "returned", "replacement", "replacements", "exchange", "exchanges", "credit note", "credit notes"]) },
  { topic: "quality", pattern: WORDS(["quality", "chipped", "chip", "chips", "scratch", "scratches", "scratched", "broken", "damage", "damaged", "defective", "yellowing", "wobble", "wobbly"]) },
  { topic: "wait time", pattern: WORDS(["wait", "waits", "waiting", "waited", "queue", "queues"]) },
  { topic: "schedule", pattern: WORDS(["timeline", "schedule", "scheduled", "scheduling", "delay", "delays", "delayed", "late", "overdue", "slot", "slots"]) },
  { topic: "payment", pattern: WORDS(["payment", "payments", "paid", "paying", "bill", "bills", "billing", "invoice", "invoices", "cheque", "cheques", "deposit", "deposits", "card machine"]) },
  { topic: "price", pattern: WORDS(["price", "prices", "priced", "pricing", "quote", "quotes", "quoted", "quotation", "rate", "rates", "cost", "costs", "expensive", "cheap", "cheaper", "budget", "lakh", "lakhs"]) },
  { topic: "portion", pattern: WORDS(["portion", "portions", "serving", "servings", "helping", "quantity", "quantities"]) },
  { topic: "staff", pattern: WORDS(["staff", "barista", "baristas", "fitter", "fitters", "installer", "installers", "waiter", "waiters", "server", "servers", "crew"]) },
  { topic: "hours", pattern: WORDS(["hour", "hours", "opening", "closing", "closes", "opens"]) },
  { topic: "parking", pattern: WORDS(["parking", "valet"]) },
];

/**
 * Demand rule, as used by movers and by the campaign offer-code proof:
 *  - `isRevenueOrder` from `lib/orders/order-rules` — the repo's revenue rule,
 *    reused rather than rewritten: only `completed` bills earn, so drafts,
 *    pending quotes, confirmed work, cancelled and refunded orders are all
 *    out already.
 *  - plus the codebase's credit-note exclusion by `order_kind`: a credit note
 *    is also a `completed` row (with negative lines), `order-rules.ts`
 *    deliberately holds no credit-note predicate, so this mirrors exactly how
 *    `services/data-export-actions.ts` (`earnsRevenue`) excludes them.
 */
function isDemandOrder(order: Order): boolean {
  return order.order_kind !== "credit_note" && isRevenueOrder(order);
}

/**
 * The instant an order is filed under: its `service_date` day start when the
 * bill carries one (the same convention the monthly CSV export uses, resolved
 * with the analytics `zoneDayStartUtc` helper rather than a hand-rolled
 * offset), otherwise the `created_at` instant. Unparseable → null → skipped.
 */
function orderInstant(order: Order): number | null {
  const serviceDate = order.service_date?.trim();
  if (serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
    try {
      return zoneDayStartUtc(serviceDate);
    } catch {
      /* malformed day: fall through to created_at rather than guess */
    }
  }
  const ms = new Date(order.created_at).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function instantOf(iso: string): number | null {
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

type Bounds = { since: number; until: number };

function buildWindow(now: number, days: number): { window: SignalWindow; previous: Bounds } {
  const today = calendarDateInZone(new Date(now));
  const from = addCalendarDays(today, -(days - 1));
  const since = zoneDayStartUtc(from);
  const until = zoneDayEndUtc(today);
  return {
    window: {
      days,
      since,
      until,
      label: days === 1 ? "Last day" : `Last ${days} days`,
    },
    // The previous equal window ends exactly where this one starts.
    previous: { since: zoneDayStartUtc(addCalendarDays(from, -days)), until: since },
  };
}

const inBounds = (ms: number, bounds: Bounds): boolean => ms >= bounds.since && ms < bounds.until;

const norm = (text: string): string => text.toLowerCase().trim();

const round2 = (value: number): number => Math.round(value * 100) / 100;

type ProductGroup = {
  productId: string | null;
  name: string;
  units: number;
  revenue: number;
  prevUnits: number;
  /** Most recent demand sale anywhere in the history (ms), for slow ordering. */
  lastSoldMs: number;
  costPrice: number | null;
};

const newGroup = (): ProductGroup => ({
  productId: null,
  name: "",
  units: 0,
  revenue: 0,
  prevUnits: 0,
  lastSoldMs: 0,
  costPrice: null,
});

/** Internal mover shape: the exported row plus the ranking-only fields. */
type ScoredMover = MoverRow & { prevUnits: number; lastSoldMs: number };

/**
 * Project demand order lines onto products for the window and the window
 * before it. Group key = `product_id` when the line carries a known one,
 * else the normalised `product_name_snapshot`, so renamed or deleted products
 * keep showing instead of vanishing: a resolvable id always folds into the
 * product's own group under its *current* name, while an unknown id or a
 * snapshot that matches a live product name (case- and whitespace-wise) is
 * joined to that product; only truly unmatched lines become their own
 * productId-null row.
 */
function aggregateMovers(
  products: readonly Product[],
  orders: readonly Order[],
  orderItems: readonly OrderItem[],
  current: Bounds,
  previous: Bounds,
): { currentGroups: Map<string, ProductGroup>; previousGroups: Map<string, ProductGroup> } {
  const productById = new Map(products.map((p) => [p.id, p]));
  const productIdByName = new Map<string, string>();
  for (const p of products) {
    const key = norm(p.name);
    if (key && !productIdByName.has(key)) productIdByName.set(key, p.id);
  }
  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of orderItems) {
    const list = itemsByOrder.get(item.order_id);
    if (list) list.push(item);
    else itemsByOrder.set(item.order_id, [item]);
  }

  const currentGroups = new Map<string, ProductGroup>();
  const previousGroups = new Map<string, ProductGroup>();
  const ensure = (groups: Map<string, ProductGroup>, key: string): ProductGroup => {
    const existing = groups.get(key);
    if (existing) return existing;
    const created = newGroup();
    groups.set(key, created);
    return created;
  };

  const sorted = [...orders]
    .filter(isDemandOrder)
    .sort((a, b) => (orderInstant(a) ?? 0) - (orderInstant(b) ?? 0) || a.id.localeCompare(b.id));

  for (const order of sorted) {
    const ms = orderInstant(order);
    if (ms === null || ms >= current.until) continue; // undated or in the future
    const isCurrent = inBounds(ms, current);
    const isPrevious = inBounds(ms, previous);
    for (const item of itemsByOrder.get(order.id) ?? []) {
      const snapshot = item.product_name_snapshot?.trim() || "(unnamed item)";
      const known = item.product_id ? productById.get(item.product_id) : undefined;
      const byName = known ? undefined : productIdByName.get(norm(snapshot));
      const productId = known?.id ?? byName ?? null;
      const product = known ?? (byName ? productById.get(byName) : undefined);
      // A resolvable id (or a name-matched snapshot) keeps one product group;
      // an unknown id or a null id with an unknown name shows under its
      // snapshot, which is the last thing the till actually printed.
      const key = productId ? `p:${productId}` : `n:${norm(snapshot)}`;
      // History rows (older than the previous window) only feed lastSoldMs,
      // so they land in the previous map with no counted units.
      const group = ensure(isCurrent ? currentGroups : previousGroups, key);
      if (productId) {
        group.productId = productId;
        group.name = product ? product.name : snapshot;
        group.costPrice =
          product && product.cost_price != null && Number.isFinite(product.cost_price)
            ? product.cost_price
            : null;
      } else {
        group.name = snapshot;
      }
      if (ms > group.lastSoldMs) group.lastSoldMs = ms;
      const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
      const lineTotal = Number.isFinite(item.line_total) ? item.line_total : 0;
      if (isCurrent) {
        group.units += quantity;
        group.revenue += lineTotal;
      }
      if (isPrevious) group.prevUnits += quantity;
    }
  }

  return { currentGroups, previousGroups };
}

/**
 * Merge the two maps into exported rows. Margin is realised window revenue per
 * unit minus a *recorded* cost — null unless the product carries `cost_price`
 * and something actually sold, so it is never a guessed cost. Trend is on
 * units (the thing that "moves") and null when the previous window sold
 * nothing — there is nothing to compare against.
 */
function toMoverRows(
  current: Map<string, ProductGroup>,
  previous: Map<string, ProductGroup>,
): ScoredMover[] {
  const rows = new Map<string, ScoredMover>();
  for (const [key, group] of previous) {
    rows.set(key, {
      productId: group.productId,
      name: group.name,
      units: 0,
      revenue: 0,
      margin: null,
      trend: null,
      prevUnits: group.prevUnits,
      lastSoldMs: group.lastSoldMs,
    });
  }
  for (const [key, group] of current) {
    const row = rows.get(key) ?? {
      productId: null,
      name: "",
      units: 0,
      revenue: 0,
      margin: null,
      trend: null,
      prevUnits: 0,
      lastSoldMs: 0,
    };
    row.productId = group.productId;
    row.name = group.name || row.name;
    row.units += group.units;
    row.revenue += group.revenue;
    row.prevUnits += group.prevUnits;
    row.lastSoldMs = Math.max(row.lastSoldMs, group.lastSoldMs);
    row.margin =
      group.costPrice != null && group.units > 0
        ? round2(group.revenue / group.units - group.costPrice)
        : null;
    rows.set(key, row);
  }
  for (const row of rows.values()) {
    row.revenue = round2(row.revenue);
    row.trend = row.prevUnits > 0 ? Math.round(((row.units - row.prevUnits) / row.prevUnits) * 100) : null;
  }
  return [...rows.values()];
}

const publicRow = (row: ScoredMover): MoverRow => ({
  productId: row.productId,
  name: row.name,
  units: row.units,
  revenue: row.revenue,
  margin: row.margin,
  trend: row.trend,
});

const moverKey = (row: ScoredMover): string => row.productId ?? `name:${row.name}`;

/**
 * A logged sentence "names a product" when it contains a product's current
 * name or a sold-line snapshot of it, case- and whitespace-insensitively.
 * Longest name is tested first so "Oslo Dining Table" beats a product simply
 * called "Table"; nothing is matched by fuzzy similarity.
 */
function productNameIndex(input: SignalInput): { name: string; productId: string | null }[] {
  const entries = new Map<string, string | null>();
  for (const p of input.products) {
    const key = norm(p.name);
    if (key && !entries.has(key)) entries.set(key, p.id);
  }
  for (const item of input.orderItems) {
    const key = norm(item.product_name_snapshot);
    if (key && !entries.has(key)) entries.set(key, item.product_id);
  }
  return [...entries]
    .map(([name, productId]) => ({ name, productId }))
    .sort((a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name));
}

function classify(text: string): string | null {
  for (const entry of LEXICON) {
    if (entry.pattern.test(text)) return entry.topic;
  }
  return null;
}

/** Collapse whitespace, drop quote-shaped characters (the screen adds its
 * own typographic quotes), and cut on a word boundary. */
function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").replace(/["'`<>“”‘’]/g, " ").trim();
  if (flat.length <= EXAMPLE_LENGTH) return flat;
  const head = flat.slice(0, EXAMPLE_LENGTH);
  const space = head.lastIndexOf(" ");
  return (space > 40 ? head.slice(0, space) : head).replace(/[,;:.]+$/, "");
}

function joinText(parts: (string | null)[]): string {
  return parts.filter((p): p is string => !!p && p.trim() !== "").join(" — ");
}

type EvidenceRow = {
  ms: number;
  id: string;
  topic: string;
  text: string;
  bucket: "question" | "objection";
};

/**
 * Group the window's log rows into topics. Which bucket a row lands in is a
 * property of the record, not of an opinion: complaints and
 * `type === "complaint"` interactions are objections by definition, and a
 * review whose stored `sentiment` (the shipped deterministic lexicon score in
 * `lib/crm/reviews`, not a model) is negative is an objection. Everything
 * else that a customer or staff member logged is a question. Internal notes
 * (`type === "note"`) are staff-authored and stay out of what "people keep
 * asking". Unclassified text is dropped by `classify`'s rule.
 */
function groupTopics(
  input: SignalInput,
  window: SignalWindow,
): { questions: QuestionTopic[]; objections: QuestionTopic[] } {
  const names = productNameIndex(input);
  const evidence: EvidenceRow[] = [];

  const push = (bucket: EvidenceRow["bucket"], ms: number | null, id: string, rawText: string): void => {
    if (ms === null || !inBounds(ms, window)) return;
    const topic = classify(rawText);
    if (!topic) return; // unclassified rows are dropped, never given a topic
    evidence.push({ ms, id, topic, text: rawText, bucket });
  };

  for (const i of input.interactions) {
    if (i.type === "note") continue;
    const text = joinText([i.summary, i.detail, i.outcome]);
    if (!text) continue;
    push(i.type === "complaint" ? "objection" : "question", instantOf(i.occurred_at), i.id, text);
  }
  for (const r of input.reviews) {
    if (!r.text.trim()) continue;
    push(r.sentiment === "negative" ? "objection" : "question", instantOf(r.reviewed_at), r.id, r.text);
  }
  for (const c of input.complaints) {
    const text = joinText([c.subject, c.detail]);
    if (!text) continue;
    push("objection", instantOf(c.raised_at), c.id, text);
  }

  const build = (bucket: EvidenceRow["bucket"]): QuestionTopic[] => {
    const byTopic = new Map<string, EvidenceRow[]>();
    for (const row of evidence) {
      if (row.bucket !== bucket) continue;
      const list = byTopic.get(row.topic);
      if (list) list.push(row);
      else byTopic.set(row.topic, [row]);
    }
    const topics: QuestionTopic[] = [];
    for (const [topic, rows] of byTopic) {
      rows.sort((a, b) => b.ms - a.ms || a.id.localeCompare(b.id));
      let productId: string | null = null;
      for (const row of rows) {
        const lower = row.text.toLowerCase();
        const hit = names.find((n) => lower.includes(n.name));
        if (hit) {
          productId = hit.productId;
          break;
        }
      }
      const examples: string[] = [];
      for (const row of rows) {
        const text = snippet(row.text);
        if (!text || examples.includes(text)) continue;
        examples.push(text);
        if (examples.length === EXAMPLE_LIMIT) break;
      }
      topics.push({ topic, count: rows.length, examples, productId });
    }
    return topics
      .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
      .slice(0, TOPIC_LIST_LIMIT);
  };

  return { questions: build("question"), objections: build("objection") };
}

/**
 * Campaigns whose own date span touches the window. Draft campaigns have not
 * gone anywhere and cancelled ones were never sent, so neither is evidence of
 * anything; everything else (scheduled → completed, `not_connected` or
 * `manual_log`) is shown, because the offer-code counts come from bills, not
 * from anyone's reach claims. A null start or end reads as open-ended.
 *
 * Offer matching joins `order.offer_code_snapshot` to the campaign's offer
 * identifier — the trimmed `offer_id`, case-insensitively. The signal input
 * deliberately carries no `Offer` rows, so the code behind an `offer_id`
 * cannot be resolved here; when an offers table is wired in, this is the one
 * comparison to change (demo packs store codes like "FOOD50" while campaign
 * rows carry "of2", which will simply track nothing until that join exists —
 * and the board then honestly says so).
 */
function campaignEvidence(input: SignalInput, window: SignalWindow): CampaignEvidence[] {
  const tracked = input.orders.filter((order) => {
    if (!isDemandOrder(order)) return false;
    const ms = orderInstant(order);
    return ms !== null && inBounds(ms, window);
  });
  const evidence: CampaignEvidence[] = [];
  for (const campaign of input.campaigns) {
    if (campaign.status === "draft" || campaign.status === "cancelled") continue;
    const start = instantOf(campaign.starts_at ?? "");
    const end = instantOf(campaign.ends_at ?? "");
    const from = start ?? Number.NEGATIVE_INFINITY;
    const to = end ?? Number.POSITIVE_INFINITY;
    if (!(from < window.until && to > window.since)) continue;

    const code = campaign.offer_id?.trim() ?? "";
    let orders = 0;
    let revenue = 0;
    if (code) {
      const want = code.toLowerCase();
      for (const order of tracked) {
        const snapshot = order.offer_code_snapshot?.trim();
        if (!snapshot || snapshot.toLowerCase() !== want) continue;
        orders += 1;
        revenue += Number.isFinite(order.grand_total) ? order.grand_total : 0;
      }
    }
    evidence.push({
      campaignId: campaign.id,
      name: campaign.name,
      channel: campaign.channel,
      redeemed: campaign.redeemed,
      revenueAttributed: campaign.revenue_attributed,
      ordersFromOfferCode: orders,
      revenueFromOfferCode: round2(revenue),
      // The anti-vanity rule: the hand-logged counters only count when bills
      // carrying the code agree. A campaign that ran without a single tracked
      // bill (or with a bill but nothing logged against it) is "quiet"; one
      // that carries no offer at all can never be tracked, and says so.
      verdict: code ? (campaign.redeemed > 0 && orders > 0 ? "worked" : "quiet") : "no_offer_tracked",
    });
  }
  return evidence.sort(
    (a, b) =>
      b.revenueFromOfferCode - a.revenueFromOfferCode ||
      b.ordersFromOfferCode - a.ordersFromOfferCode ||
      a.name.localeCompare(b.name),
  );
}

export function buildGrowthSignals(input: SignalInput): GrowthSignals {
  const rawDays = input.windowDays ?? DEFAULT_WINDOW_DAYS;
  const days = Math.max(1, Math.round(Number.isFinite(rawDays) ? rawDays : DEFAULT_WINDOW_DAYS));
  const { window, previous } = buildWindow(input.now, days);
  const agg = aggregateMovers(input.products, input.orders, input.orderItems, window, previous);
  const rows = toMoverRows(agg.currentGroups, agg.previousGroups);

  // Slow = real history (the window before it sold) and now quiet: zero
  // sales, or no more than half the previous window's units. A product shown
  // as slow is not shown again as a top mover — the lists partition the
  // story — while a decliner that misses the slow slice still gets its
  // mover slot by units.
  const slowEligible = rows.filter((r) => r.prevUnits > 0 && (r.units === 0 || r.units * 2 <= r.prevUnits));
  const slow = [...slowEligible]
    // Oldest-sold first: the quietest on the shelf is the most urgent.
    .sort((a, b) => a.lastSoldMs - b.lastSoldMs || a.units - b.units || a.name.localeCompare(b.name))
    .slice(0, SLOW_MOVERS_LIMIT);
  const slowKeys = new Set(slow.map(moverKey));
  const top = [...rows]
    .filter((r) => r.units > 0 && !slowKeys.has(moverKey(r)))
    .sort(
      (a, b) =>
        b.units - a.units ||
        b.revenue - a.revenue ||
        a.name.localeCompare(b.name) ||
        moverKey(a).localeCompare(moverKey(b)),
    )
    .slice(0, TOP_MOVERS_LIMIT);

  const { questions, objections } = groupTopics(input, window);

  // Backlog counters, deliberately window-free the way crmOverview counts
  // them: an unanswered review from last quarter still needs an answer today.
  const unansweredReviews = input.reviews.filter(isUnanswered).length;
  const openComplaints = input.complaints.filter(
    (c) => c.status === "open" || c.status === "in_progress",
  ).length;

  return {
    window,
    topMovers: top.map(publicRow),
    slowMovers: slow.map(publicRow),
    questions,
    objections,
    unansweredReviews,
    openComplaints,
    campaignEvidence: campaignEvidence(input, window),
  };
}

/**
 * Briefs. `seconds` is always on REEL_DURATIONS (the only lengths the script
 * writer validates), and `notes` never names a price, a percentage or the
 * word "off" — a discount brief therefore says "a reduced price" through the
 * template rather than inventing an offer the merchant did not make. Units
 * sold are the only figures quoted, because they are data the window holds.
 */
export function briefForMover(row: MoverRow, kind: "top" | "slow"): ContentBrief {
  if (kind === "slow") {
    return {
      productId: row.productId,
      productName: row.name.trim() || "a familiar favourite",
      objective: "discount",
      kind: "reel",
      seconds: REEL_DURATIONS[1],
      notes: "It sold steadily before this window and has gone quiet since — remind people it is still on the shelf.",
    };
  }
  // A mover with no previous-window history is new to the shelf, so the brief
  // hands the script a first-look framing; anything established gets the
  // story of why it moves. The trend reads as words, never a percentage —
  // the only percentages a script may quote are offers the merchant typed.
  const isNew = row.trend === null;
  const direction =
    row.trend === null
      ? ""
      : row.trend > 0
        ? " It is selling faster than before."
        : row.trend < 0
          ? " It is selling slower than before."
          : " It is holding its pace.";
  return {
    productId: row.productId,
    productName: row.name.trim() || "our best seller",
    objective: isNew ? "new_launch" : "content",
    kind: "reel",
    seconds: REEL_DURATIONS[1],
    notes: `${row.units} sold in this window.${direction}`,
  };
}

export function briefForTopic(topic: QuestionTopic): ContentBrief {
  // The topic string itself names what the post answers; when the topic tied
  // to a product, `productId` rides along so the content screen can swap the
  // catalogue name into the form.
  return {
    productId: topic.productId,
    productName: topic.topic,
    objective: "content",
    kind: "image",
    seconds: REEL_DURATIONS[0],
    notes: `Answered ${topic.count} times in the window — people keep raising ${topic.topic}.`,
  };
}
