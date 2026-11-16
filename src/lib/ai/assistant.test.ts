/**
 * The assistant is a lookup over this workspace's own records.
 *
 * These tests hold the honesty line in three places: a suggested question must
 * be answerable by the very keywords that define it, an unmatched question must
 * be met with "I could not match that" rather than plausible-sounding text, and
 * every figure in an answer must be the figure the shared context computed.
 */

import { afterEach, describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/format";
import {
  ASSISTANT_INTENTS,
  ASSISTANT_PROMPTS,
  QUESTION_LIMIT,
  answerQuestion,
  detectIntent,
} from "./assistant";
import { AI_ENV_NAMES, SUPPORTS_TEXT_GENERATION, getAiProvider } from "./provider";
import {
  TODAY,
  addDays,
  appointment,
  baseInput,
  expense,
  fixtureContext,
  order,
  orderItem,
  product,
  shift,
  staff,
  task,
} from "./fixtures";
import { buildBusinessContext, type BusinessContext } from "./context";
import type { AssistantAnswer } from "./types";

const ENGINE_LABEL = "Local insight engine — no model configured";

function ask(ctx: BusinessContext, question: string): AssistantAnswer {
  return answerQuestion(ctx, question, { engineLabel: ENGINE_LABEL });
}

function dayAgo(days: number): string {
  return `${addDays(TODAY, -days)}T09:00:00.000Z`;
}

function first<T>(rows: T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`The fixture has no ${what}.`);
  return row;
}

/** One record for every intent, so each answer has something real to quote. */
function populated(): BusinessContext {
  return fixtureContext({
    products: [
      product({ id: "p1", name: "Flat White", stock_qty: 40, low_stock_threshold: 10 }),
      product({
        id: "p2",
        name: "Decaf 250g",
        sku: "SKU-2",
        price: 320,
        cost_price: 40,
        stock_qty: 3,
        low_stock_threshold: 12,
      }),
    ],
    orders: [
      order({ id: "o1", order_number: "BC-1001", created_at: dayAgo(2) }),
      order({
        id: "o2",
        order_number: "BC-9002",
        payment_status: "pending",
        amount_paid: 0,
        subtotal: 9000,
        grand_total: 9000,
        created_at: dayAgo(10),
      }),
      order({
        id: "q1",
        order_number: "BC-Q1",
        status: "draft",
        payment_status: "pending",
        amount_paid: 0,
        subtotal: 3500,
        grand_total: 3500,
        created_at: dayAgo(9),
      }),
    ],
    orderItems: [
      orderItem({ id: "i1", order_id: "o1", product_id: "p1", quantity: 2 }),
      orderItem({
        id: "i2",
        order_id: "o1",
        product_id: "p2",
        product_name_snapshot: "Decaf 250g",
        quantity: 1,
        unit_price: 320,
        line_total: 320,
      }),
    ],
    tasks: [task({ id: "t1", title: "Call the printer", dueAt: dayAgo(-1) })],
    appointments: [appointment({ id: "a1", title: "Table for four" })],
    shifts: [shift({ id: "sh1", staffId: "s1" })],
    staff: [staff({ id: "s1", name: "Ravi Menon" })],
    expenses: [expense({ id: "e1", title: "Rent", amount: 2000 })],
  });
}

describe("intent detection", () => {
  it("knows the ten topics and nothing else", () => {
    expect(ASSISTANT_INTENTS.map((intent) => intent.id)).toEqual([
      "bestSellers",
      "appointmentsToday",
      "staffOnShift",
      "lowStock",
      "receivables",
      "quotes",
      "expensesThisMonth",
      "margin",
      "tasksDue",
      "sales",
    ]);
  });

  it("answers every question it suggests", () => {
    expect(ASSISTANT_PROMPTS).toEqual(ASSISTANT_INTENTS.map((intent) => intent.prompt));
    for (const intent of ASSISTANT_INTENTS) {
      // If this fails, a chip in the UI is offering a question the engine would
      // refuse — the exact kind of false promise this area must not ship.
      expect(detectIntent(intent.prompt)?.id).toBe(intent.id);
    }
  });

  it("matches plain-language synonyms", () => {
    const cases: [string, string][] = [
      ["how much did I sell this month?", "sales"],
      ["what was my turnover?", "sales"],
      ["average order value lately", "sales"],
      ["what is my top selling product", "bestSellers"],
      ["what is popular", "bestSellers"],
      ["who is coming in today", "appointmentsToday"],
      ["any bookings", "appointmentsToday"],
      ["who is booked in", "appointmentsToday"],
      ["who is working right now", "staffOnShift"],
      ["what does the roster look like", "staffOnShift"],
      ["is anyone on duty", "staffOnShift"],
      ["we are running out of beans", "lowStock"],
      ["anything sold out", "lowStock"],
      ["check the inventory", "lowStock"],
      ["when do I need to reorder", "lowStock"],
      ["who hasn't paid me", "receivables"],
      ["what is still outstanding", "receivables"],
      ["money owed to me", "receivables"],
      ["which quotes are waiting", "quotes"],
      ["any open estimates", "quotes"],
      ["what have I spent", "expensesThisMonth"],
      ["my outgoings", "expensesThisMonth"],
      ["am I making a profit", "margin"],
      ["what is the gross margin", "margin"],
      ["what is my cogs", "margin"],
      ["what is overdue on my to-do list", "tasksDue"],
      ["anything pending work", "tasksDue"],
    ];
    for (const [question, id] of cases) {
      expect(detectIntent(question)?.id).toBe(id);
    }
  });

  it("is case and punctuation insensitive, and does not match on noise", () => {
    expect(detectIntent("   SALES??  ")?.id).toBe("sales");
    expect(detectIntent("Margin — please.")?.id).toBe("margin");
    expect(detectIntent("WHAT IS MY MARGIN?")).toEqual(detectIntent("what is my margin?"));
    expect(detectIntent("tell me about the weather tomorrow")).toBe(null);
    expect(detectIntent("")).toBe(null);
    expect(detectIntent("   ")).toBe(null);
  });
});

describe("answerQuestion — unmatched questions", () => {
  const ctx = populated();
  const answer = ask(ctx, "Write me a poem about the harbour");

  it("says it could not match, and does not answer anyway", () => {
    expect(answer.intent).toBe(null);
    expect(answer.text).toContain("I could not match");
    expect(answer.text).toContain("Write me a poem about the harbour");
    expect(answer.text).toContain("I will not guess");
    expect(answer.grounding).toEqual([]);
    expect(answer.source).toBe("engine");
  });

  it("replies with the topics it can actually cover", () => {
    for (const intent of ASSISTANT_INTENTS) {
      expect(answer.text.toLowerCase()).toContain(intent.label.toLowerCase());
    }
  });

  it("still names the engine it came from", () => {
    expect(answer.engineLabel).toBe(ENGINE_LABEL);
  });

  it("degrades gracefully on blank and oversized input", () => {
    const blank = ask(ctx, "   ");
    expect(blank.intent).toBe(null);
    expect(blank.text.length).toBeGreaterThan(0);

    const long = ask(ctx, "margin " + "x".repeat(5_000));
    expect(long.question).toHaveLength(QUESTION_LIMIT);
    expect(long.intent).toBe("margin");
  });
});

describe("answerQuestion — grounding", () => {
  const ctx = populated();

  it("quotes the exact figures the context computed, per intent", () => {
    const money = (amount: number) => formatMoney(amount, ctx.brand.currencyCode);

    const sales = ask(ctx, "how are sales doing");
    expect(sales.text).toContain(money(ctx.sales.revenue));
    expect(sales.text).toContain(`${ctx.sales.orders} order`);

    const best = first(ctx.products.bestSellers, "a sold product");
    expect(ask(ctx, "what are my best sellers").text).toContain(best.name);
    expect(ask(ctx, "what are my best sellers").text).toContain(`${best.qty} sold`);

    expect(ask(ctx, "what is my margin").text).toContain(
      `${ctx.margin.marginPercent.toFixed(1)}%`,
    );

    const debt = first(ctx.receivables.rows, "an unpaid invoice");
    const receivables = ask(ctx, "who owes me money");
    expect(receivables.text).toContain(debt.label);
    expect(receivables.text).toContain(`${debt.days} days`);
    expect(receivables.text).toContain(money(ctx.receivables.total));
    expect(receivables.grounding.map((row) => row.href)).toContain(debt.href);

    const quote = first(ctx.quotes.rows, "an open quotation");
    const quotes = ask(ctx, "which quotations are waiting");
    expect(quotes.text).toContain(quote.label);
    expect(quotes.text).toContain(money(ctx.quotes.openValue));

    const low = first(ctx.inventory.lowStock, "a low-stock product");
    const stock = ask(ctx, "what is running low on stock");
    expect(stock.text).toContain(low.name);
    expect(stock.text).toContain(`(${low.stock} left)`);
    expect(stock.grounding[0]?.value).toContain(`threshold ${low.threshold}`);

    const openTask = first(ctx.tasks.rows, "an open task");
    expect(ask(ctx, "what is overdue on my task list").text).toContain(openTask.title);

    const booking = first(ctx.appointments.today, "today's booking");
    const appointments = ask(ctx, "who is booked in today");
    expect(appointments.text).toContain(booking.title);
    expect(appointments.text).toContain(booking.startsAt.slice(11, 16));
    expect(appointments.text).toContain(booking.customerName ?? "");

    expect(ask(ctx, "who is on shift right now").text).toContain(
      first(ctx.staff.onShiftNow, "a staff member on shift").name,
    );

    expect(ask(ctx, "what have I spent this month").text).toContain(
      first(ctx.expenses.top, "an expense").title,
    );
  });

  it("links every grounding row into the module that holds the record", () => {
    for (const prompt of ASSISTANT_PROMPTS) {
      for (const row of ask(ctx, prompt).grounding) {
        expect(row.href.startsWith("/")).toBe(true);
        expect(row.label.length).toBeGreaterThan(0);
        expect(row.value.length).toBeGreaterThan(0);
      }
    }
  });

  it("suggests only questions it can answer, never the one just asked", () => {
    for (const intent of ASSISTANT_INTENTS) {
      const answer = ask(ctx, intent.prompt);
      expect(answer.suggestions).not.toContain(intent.prompt);
      expect(answer.suggestions.length).toBeLessThanOrEqual(4);
      for (const suggestion of answer.suggestions) {
        expect(ASSISTANT_PROMPTS).toContain(suggestion);
        expect(detectIntent(suggestion)?.id).toBe(
          ASSISTANT_INTENTS.find((candidate) => candidate.prompt === suggestion)?.id,
        );
      }
    }
  });

  it("never claims that a message was sent or a record was made", () => {
    for (const prompt of ASSISTANT_PROMPTS) {
      const text = ask(ctx, prompt).text;
      expect(text).not.toMatch(/\bI (have )?(sent|emailed|messaged|texted|called|created|booked|placed)\b/i);
      expect(text).not.toMatch(/whatsapp|gmail/i);
    }
  });
});

describe("answerQuestion on an empty workspace", () => {
  const ctx = fixtureContext();

  it("answers all ten topics without inventing a number", () => {
    for (const intent of ASSISTANT_INTENTS) {
      const answer = ask(ctx, intent.prompt);
      expect(answer.intent).toBe(intent.id);
      expect(answer.source).toBe("engine");
      expect(answer.engineLabel).toBe(ENGINE_LABEL);
      expect(answer.text.length).toBeGreaterThan(20);
      expect(answer.text).not.toMatch(/NaN|undefined|Infinity|null/);
      expect(answer.grounding.every((row) => row.href.startsWith("/"))).toBe(true);
    }
  });

  it("says what is missing instead of dressing up a zero", () => {
    expect(ask(ctx, "how are sales doing").text).toContain("Nothing to compare against");
    expect(ask(ctx, "what are my best sellers").text).toContain("no best sellers to rank");
    expect(ask(ctx, "what is my margin").text).toContain("I have no margin to report");
    expect(ask(ctx, "who owes me money").text).toContain("Nothing is unpaid");
    expect(ask(ctx, "which quotations are waiting").text).toContain(
      "No quotation is waiting",
    );
    expect(ask(ctx, "what is running low on stock").text).toContain(
      "nothing to run low",
    );
    expect(ask(ctx, "what is overdue on my task list").text).toContain(
      "task list is clear",
    );
    expect(ask(ctx, "who is booked in today").text).toContain("Nothing is booked");
    expect(ask(ctx, "who is on shift right now").text).toContain(
      "No staff have been added",
    );
    expect(ask(ctx, "what have I spent this month").text).toContain(
      "No expenses have been recorded",
    );
  });

  it("survives a workspace whose records are all cancelled or closed", () => {
    const ctx2 = buildBusinessContext(
      baseInput({
        orders: [
          order({ id: "o1", status: "cancelled", payment_status: "refunded", amount_paid: 0 }),
        ],
        orderItems: [orderItem({ order_id: "o1" })],
        tasks: [task({ status: "done" })],
        appointments: [appointment({ status: "cancelled" })],
      }),
      new Date("2026-04-01T06:00:00.000Z"),
    );
    for (const prompt of ASSISTANT_PROMPTS) {
      expect(ask(ctx2, prompt).text).not.toMatch(/NaN|undefined|Infinity/);
    }
    expect(ctx2.sales.orders).toBe(0);
    expect(ctx2.tasks.open).toBe(0);
    expect(ctx2.appointments.today).toEqual([]);
  });
});

describe("provider status reported to the assistant", () => {
  const saved = { ...process.env };

  afterEach(() => {
    for (const name of AI_ENV_NAMES) delete process.env[name];
    Object.assign(process.env, saved);
  });

  it("reports not_configured with no key, and never a model answer", () => {
    for (const name of AI_ENV_NAMES) delete process.env[name];
    const provider = getAiProvider();
    expect(provider.status).toBe("not_configured");
    expect(provider.label).toBe(ENGINE_LABEL);
    expect(provider.model).toBeNull();
    expect(provider.supportsTextGeneration).toBe(false);
    expect(SUPPORTS_TEXT_GENERATION).toBe(false);
    expect(provider.missing).toEqual(["ORDERBOOK_AI_API_KEY", "ORDERBOOK_AI_BASE_URL"]);
    expect(provider.envNames).toEqual(AI_ENV_NAMES);

    const answer = ask(populated(), "how are sales doing");
    expect(answer.source).toBe("engine");
    expect(answer.engineLabel).toBe(provider.label);
  });

  it("treats a placeholder key as no key at all", () => {
    process.env.ORDERBOOK_AI_API_KEY = "sk-xxx-placeholder";
    process.env.ORDERBOOK_AI_BASE_URL = "https://example.internal/v1";
    const provider = getAiProvider();
    expect(provider.status).toBe("not_configured");
    expect(provider.missing).toContain("ORDERBOOK_AI_API_KEY");
  });

  it("still answers from the engine when credentials exist", () => {
    process.env.ORDERBOOK_AI_API_KEY = "secret-value-do-not-echo";
    process.env.ORDERBOOK_AI_BASE_URL = "https://intranet.example.internal/v1";
    process.env.ORDERBOOK_AI_MODEL = "some-model-id";
    const provider = getAiProvider();
    expect(provider.status).toBe("configured");
    expect(provider.model).toBe("some-model-id");
    // Configured is not the same as used: there is no request client here.
    expect(provider.supportsTextGeneration).toBe(false);
    expect(provider.label).toContain("answers still come from the local insight engine");
    expect(JSON.stringify(provider)).not.toContain("secret-value-do-not-echo");
    expect(JSON.stringify(provider)).not.toContain("intranet.example.internal");

    const answer = answerQuestion(populated(), "how are sales doing", {
      engineLabel: provider.label,
    });
    expect(answer.source).toBe("engine");
    expect(answer.text).toBe(ask(populated(), "how are sales doing").text);
  });

  it("refuses to read the environment from a browser context", () => {
    const global = globalThis as { window?: unknown };
    global.window = {};
    try {
      expect(() => getAiProvider()).toThrow(/server-only/);
    } finally {
      delete global.window;
    }
  });
});
