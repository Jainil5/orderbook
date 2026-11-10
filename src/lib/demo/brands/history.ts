import type {
  Customer,
  Offer,
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  Payment,
  Product,
} from "@/types/database";
import {
  computeCartTotals,
  lineNetTotal,
  productLineDiscountAmount,
} from "@/lib/pricing/discounts";
import { computeOfferDiscountAmount } from "@/lib/pricing/offers";
import { localDayKey } from "@/lib/manager/time";

export type HistoryMonth = {
  year: number;
  /** 0-indexed month (JS convention): 4 = May, 9 = October. */
  month: number;
  /** Order-count target for the full month. */
  target: number;
};

export type HistoryConfig = {
  brandId: string;
  /** Order-number + id prefix, e.g. BC / CF. */
  prefix: string;
  products: Product[];
  offers: Offer[];
  taxRatePercent: number;
  rngSeed: number;
  /** Complete months, oldest first. The partial current month is derived. */
  months: HistoryMonth[];
  customerCount: number;
  /** How many dated-today pending bills to emit for the Ongoing board. */
  pendingCount: number;
};

export type HistoryOutput = {
  customers: Customer[];
  orders: Order[];
  orderItems: OrderItem[];
  payments: Payment[];
};

const FIRST_NAMES = [
  "Aarav", "Ananya", "Vihaan", "Diya", "Aditya", "Ishita", "Kabir", "Saanvi",
  "Rohan", "Meera", "Arjun", "Priya", "Devan", "Nisha", "Karan", "Tara",
  "Nikhil", "Riya", "Sameer", "Pooja", "Yash", "Anika", "Farhan", "Sneha",
  "Imran", "Kavya", "Rahul", "Divya", "Siddharth", "Neha", "Vikram", "Ira",
  "Manav", "Reema", "Zoya", "Harsh", "Leela", "Naveen", "Tanvi", "Gaurav",
];

const LAST_NAMES = [
  "Mehta", "Sharma", "Iyer", "Nair", "Kapoor", "Menon", "Patel", "Reddy",
  "Gupta", "Joshi", "Bhatt", "Rao", "Chopra", "Desai", "Pillai", "Sethi",
  "Verma", "Malhotra", "Bose", "Kulkarni",
];

// Weekend rhythm: cafés and showrooms both peak on Sat/Sun, lift on Fri.
const DAY_WEEKEND_FACTOR = [1.1, 1.0, 1.0, 1.0, 1.05, 1.25, 1.6]; // Sun..Sat

// Category appetite for the cafe mix; drinks sell hardest, then food.
const CATEGORY_WEIGHT: Record<string, number> = {
  Coffee: 4,
  Beverages: 3,
  Food: 3,
  "Sides & Dips": 2,
  Desserts: 2,
};

const PAYMENT_CYCLE = [
  "UPI", "UPI", "UPI", "UPI", "UPI",
  "Cash", "Cash", "Cash",
  "Card", "Card",
];

// Month-shape tuning (spec §6): +13%/mo May→Oct via cfg targets, a ~20%
// November daily-rate dip that recovers to the October rate in the last 7 days.
const NOV_DIP_FACTOR = 0.45;
const NOV_REBOUND_FACTOR = 1.0;
const CODE_EVERY_N = 9;
const CANCEL_EVERY_N = 20;

function makeRng(seed: number): () => number {
  let s = seed % 2147483648;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function pickOrderType(r: number): OrderType {
  if (r < 0.6) return "dine_in";
  if (r < 0.8) return "takeaway";
  if (r < 0.95) return "delivery";
  return "online";
}

const DELIVERY_AREAS = [
  "Indiranagar, 100 Ft Road",
  "Bandra West, Linking Road",
  "Koramangala, 5th Block",
  "Andheri East, Sahar Road",
  "Salt Lake, Sector V",
];

function weightedProductPool(products: Product[]): Product[] {
  const pool: Product[] = [];
  for (const product of products) {
    const weight = CATEGORY_WEIGHT[product.category ?? ""] ?? 1;
    for (let i = 0; i < weight; i += 1) pool.push(product);
  }
  return pool;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function buildCustomers(
  cfg: HistoryConfig,
  rnd: () => number,
): Customer[] {
  const list: Customer[] = [];
  for (let i = 0; i < cfg.customerCount; i += 1) {
    const first = FIRST_NAMES[Math.floor(rnd() * FIRST_NAMES.length)];
    const last = LAST_NAMES[Math.floor(rnd() * LAST_NAMES.length)];
    const digits = Math.floor(10000000 + rnd() * 89999999);
    list.push({
      id: `h-cust-${i + 1}`,
      brand_id: cfg.brandId,
      name: `${first} ${last}`,
      email: null,
      phone: `98${digits}`,
    });
  }
  return list;
}

type BuiltOrder = {
  order: Order;
  items: OrderItem[];
  payment: Payment | null;
};

function createOrder(params: {
  cfg: HistoryConfig;
  pool: Product[];
  customers: Customer[];
  rnd: () => number;
  created: Date;
  seq: number;
  cancelled: boolean;
  coded: boolean;
  nullMethod: boolean;
  pending?: boolean;
  walkIn: boolean;
  method: string;
}): BuiltOrder {
  const { cfg, pool, customers, rnd, created, seq } = params;

  const lineCount = 1 + Math.floor(rnd() * 4); // 1–4 lines
  const lines: { product: Product; quantity: number }[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    const product = pool[Math.floor(rnd() * pool.length)];
    const quantity = 1 + Math.floor(rnd() * 3); // 1–3 units
    lines.push({ product, quantity });
  }

  const baseTotals = computeCartTotals({
    lines,
    taxRatePercent: cfg.taxRatePercent,
    orderDiscount: null,
  });

  let offerCode: string | null = null;
  let offerDiscountAmount = 0;
  if (params.coded) {
    const orderScope = cfg.offers.find(
      (o) => o.scope === "order" && o.is_active && o.code,
    );
    const categoryScope = cfg.offers.find(
      (o) => o.scope === "category" && o.is_active && o.code,
    );
    for (const offer of [orderScope, categoryScope]) {
      if (!offer) continue;
      const amount = computeOfferDiscountAmount(offer, {
        lines,
        subtotalAfterProductDiscounts: baseTotals.subtotalAfterProductDiscounts,
      });
      if (amount > 0) {
        offerCode = offer.code ?? null;
        offerDiscountAmount = amount;
        break;
      }
    }
  }

  const totals = computeCartTotals({
    lines,
    taxRatePercent: cfg.taxRatePercent,
    orderDiscount: null,
    offerDiscountAmount,
  });

  const orderType = pickOrderType(rnd());
  const customer = params.walkIn
    ? null
    : customers[Math.floor(rnd() * customers.length)] ?? null;

  const items: OrderItem[] = lines.map((line, index) => ({
    id: `hist-${cfg.prefix}-${seq}-line-${index + 1}`,
    order_id: `hist-${cfg.prefix}-${seq}`,
    product_id: line.product.id,
    product_name_snapshot: line.product.name,
    quantity: line.quantity,
    unit_price: line.product.price,
    line_discount: productLineDiscountAmount(line.product, line.quantity),
    line_total: lineNetTotal(line.product, line.quantity),
    product_image_url_snapshot: line.product.image_url ?? null,
    modifier_labels: null,
  }));

  const method =
    params.pending || params.nullMethod || params.cancelled ? null : params.method;
  const paid = !params.cancelled && !params.pending && method != null;

  const status: OrderStatus = params.pending
    ? "pending"
    : params.cancelled
      ? "cancelled"
      : "completed";

  const order: Order = {
    id: `hist-${cfg.prefix}-${seq}`,
    brand_id: cfg.brandId,
    order_number: `${cfg.prefix}-H${seq}`,
    status,
    payment_status: params.cancelled
      ? "refunded"
      : paid
        ? "paid"
        : "pending",
    customer_id: customer?.id ?? null,
    customer_name_snapshot: params.walkIn
      ? "Walk-in Guest"
      : customer?.name ?? "Walk-in Guest",
    subtotal: totals.taxableSubtotal,
    discount_total: totals.discountTotal,
    tax_total: totals.taxTotal,
    fees_total: 0,
    grand_total: totals.grandTotal,
    notes: null,
    created_at: created.toISOString(),
    order_type: orderType,
    service_date: localDayKey(created),
    guests: orderType === "dine_in" ? 1 + Math.floor(rnd() * 4) : null,
    delivery_address:
      orderType === "delivery"
        ? `${1 + Math.floor(rnd() * 90)} ${DELIVERY_AREAS[Math.floor(rnd() * DELIVERY_AREAS.length)]}`
        : null,
    payment_method: method,
    payment_reference:
      orderType === "online"
        ? `Zomato-${1000 + Math.floor(rnd() * 9000)}`
        : null,
    amount_paid: paid ? totals.grandTotal : 0,
    offer_code_snapshot: offerCode,
    order_kind: "sale",
  };

  const payment: Payment | null =
    paid && method
      ? {
          id: `hist-pay-${cfg.prefix}-${seq}`,
          brand_id: cfg.brandId,
          order_id: order.id,
          amount: totals.grandTotal,
          method,
          status: "paid",
          created_at: created.toISOString(),
        }
      : null;

  return { order, items, payment };
}

function dayWeightsForMonth(
  year: number,
  month: number,
  count: number,
  rnd: () => number,
): number[] {
  const dim = daysInMonth(year, month);
  // Mild within-month upward drift on top of the weekend rhythm.
  const weights: number[] = [];
  for (let day = 1; day <= dim; day += 1) {
    const dow = new Date(year, month, day).getDay();
    const drift = 1 + 0.25 * ((day - 1) / Math.max(1, dim - 1));
    weights.push(DAY_WEEKEND_FACTOR[dow] * drift * (0.85 + rnd() * 0.3));
  }
  // Normalise so expected total ≈ count (we still emit exactly `count`).
  void count;
  return weights;
}

function sampleDay(weights: number[], rnd: () => number): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let target = rnd() * total;
  for (let i = 0; i < weights.length; i += 1) {
    target -= weights[i];
    if (target <= 0) return i + 1;
  }
  return weights.length;
}

function stampForDay(year: number, month: number, day: number, rnd: () => number, capMs: number): Date {
  const hour = 8 + Math.floor(rnd() * 13); // 8–20
  const minute = Math.floor(rnd() * 60);
  const ms = Math.min(new Date(year, month, day, hour, minute, 0).getTime(), capMs - 1000);
  return new Date(ms);
}

export function buildOrderHistory(
  cfg: HistoryConfig,
  now: Date = new Date(),
): HistoryOutput {
  const rnd = makeRng(cfg.rngSeed);
  const pool = weightedProductPool(cfg.products);
  const customers = buildCustomers(cfg, rnd);
  const nowMs = now.getTime();

  const orders: Order[] = [];
  const orderItems: OrderItem[] = [];
  const payments: Payment[] = [];
  let seq = 0;
  let counter = 0;

  const emit = (
    created: Date,
    opts: { nullMethod?: boolean; pending?: boolean } = {},
  ) => {
    seq += 1;
    counter += 1;
    const built = createOrder({
      cfg,
      pool,
      customers,
      rnd,
      created,
      seq,
      cancelled: !opts.pending && counter % CANCEL_EVERY_N === 0,
      coded: !opts.pending && counter % CODE_EVERY_N === 0,
      nullMethod: opts.nullMethod ?? false,
      pending: opts.pending ?? false,
      walkIn: rnd() < 0.3,
      method: PAYMENT_CYCLE[counter % PAYMENT_CYCLE.length],
    });
    orders.push(built.order);
    orderItems.push(...built.items);
    if (built.payment) payments.push(built.payment);
  };

  // Full months, oldest first.
  for (const entry of cfg.months) {
    const weights = dayWeightsForMonth(entry.year, entry.month, entry.target, rnd);
    for (let i = 0; i < entry.target; i += 1) {
      const day = sampleDay(weights, rnd);
      emit(stampForDay(entry.year, entry.month, day, rnd, nowMs), {});
    }
  }

  // Partial current month: a dip in the early days, a rebound in the last 7.
  const lastFull = cfg.months[cfg.months.length - 1];
  const octDaily =
    lastFull.target / daysInMonth(lastFull.year, lastFull.month);
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const todayDate = now.getDate();
  const reboundDays = Math.min(7, todayDate);
  const dipDays = todayDate - reboundDays;
  const dipCount = Math.round(dipDays * octDaily * NOV_DIP_FACTOR);
  const reboundCount = Math.round(reboundDays * octDaily * NOV_REBOUND_FACTOR);

  // Null-method (record-payment) budget lands on completed November orders.
  let nullMethodBudget = 3;

  for (let i = 0; i < dipCount; i += 1) {
    const day = 1 + Math.floor(rnd() * Math.max(1, dipDays));
    emit(
      stampForDay(curYear, curMonth, day, rnd, nowMs),
      { nullMethod: nullMethodBudget-- > 0 },
    );
  }
  for (let i = 0; i < reboundCount; i += 1) {
    const day = todayDate - reboundDays + 1 + Math.floor(rnd() * reboundDays);
    emit(
      stampForDay(curYear, curMonth, Math.min(day, todayDate), rnd, nowMs),
      { nullMethod: nullMethodBudget-- > 0 },
    );
  }

  // A handful of today-pending bills so the Ongoing board is never empty.
  for (let i = 0; i < cfg.pendingCount; i += 1) {
    const created = new Date(nowMs - (i + 1) * 40 * 60 * 1000);
    emit(created, { pending: true });
  }

  return { customers, orders, orderItems, payments };
}
