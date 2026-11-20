// The pure half of the self-serve page: what a customer may see about their
// own bill, and what the counter may honestly promise about answering it.
// Everything here is exercised without Next, without cookies and without the
// demo loaders — the same reason the module can stay pure.
import { describe, expect, it } from "vitest";
import {
  ISSUE_KINDS,
  ISSUE_KIND_LABELS,
  POLICY_LINES,
  answerLine,
  lookupReference,
  projectOrder,
  supportReply,
} from "./self-serve";
import type { OpenState } from "@/lib/hours/working-hours";
import type { Order, OrderItem, OrderStatus } from "@/types/database";

function order(overrides?: Partial<Order>): Order {
  return {
    id: "o-BC-1057",
    brand_id: "demo-brewery-cafe",
    order_number: "BC-1057",
    status: "completed",
    payment_status: "paid",
    customer_id: "c4",
    customer_name_snapshot: "Aarav Sharma",
    subtotal: 828,
    discount_total: 0,
    tax_total: 41.4,
    fees_total: 0,
    grand_total: 869.4,
    notes: null,
    created_at: "2026-11-11T10:15:00.000Z",
    ...overrides,
  };
}

function item(overrides?: Partial<OrderItem>): OrderItem {
  return {
    id: "oi-1",
    order_id: "o-BC-1057",
    product_id: "p-flat-white",
    product_name_snapshot: "Flat white",
    quantity: 2,
    unit_price: 260,
    line_discount: 0,
    line_total: 520,
    ...overrides,
  };
}

/** The four answers `openStateAt` can hand back, shaped exactly like its own. */
const OPEN: OpenState = {
  status: "open",
  pill: "Open now",
  label: "Open until 16:00",
  opensAt: new Date(2026, 10, 18, 7, 0, 0, 0),
  closesAt: new Date(2026, 10, 18, 16, 0, 0, 0),
};

const CLOSING: OpenState = {
  status: "closing_soon",
  pill: "Closing soon",
  label: "Closing soon · until 16:00",
  opensAt: new Date(2026, 10, 18, 7, 0, 0, 0),
  closesAt: new Date(2026, 10, 18, 16, 0, 0, 0),
};

const CLOSED: OpenState = {
  status: "closed",
  pill: "Closed",
  label: "Closed · opens 7:00 Mon",
  opensAt: new Date(2026, 10, 23, 7, 0, 0, 0),
  closesAt: null,
};

/** What `openStateAt(hours, now, { paused: true })` returns. */
const PAUSED: OpenState = {
  status: "closed",
  pill: "Closed",
  label: "Not taking orders right now",
  opensAt: null,
  closesAt: null,
};

/** A closed week has no instant to point at either, but it is not paused. */
const CLOSED_NO_WINDOW: OpenState = {
  status: "closed",
  pill: "Closed",
  label: "Closed",
  opensAt: null,
  closesAt: null,
};

describe("projectOrder", () => {
  it("renders the status with the customer-facing label, not the raw token", () => {
    const cases: [OrderStatus, string][] = [
      ["draft", "Quotation"],
      ["pending", "Pending"],
      ["confirmed", "Confirmed"],
      ["completed", "Completed"],
      ["cancelled", "Cancelled"],
      ["refunded", "Refunded"],
    ];
    for (const [status, label] of cases) {
      expect(projectOrder(order({ status }), [], "Aarav", "INR").status).toBe(label);
    }
  });

  it("counts and names only this order's lines", () => {
    const items = [
      item(),
      item({ id: "oi-2", product_id: "p-beans", product_name_snapshot: "House beans", quantity: 1 }),
      // Another bill's line: the caller passes the whole merged list.
      item({ id: "oi-9", order_id: "o-BC-1056", product_name_snapshot: "Cold brew", quantity: 3 }),
    ];
    const view = projectOrder(order(), items, "Aarav Sharma", "INR");
    expect(view.itemCount).toBe(2);
    expect(view.itemCount).toBe(view.lines.length);
    expect(view.lines).toEqual([
      { name: "Flat white", quantity: 2 },
      { name: "House beans", quantity: 1 },
    ]);
  });

  it("carries the bill number, date, money and the matched name through", () => {
    const view = projectOrder(order(), [item()], "Aarav Sharma", "INR");
    expect(view).toMatchObject({
      orderNumber: "BC-1057",
      placedAt: "2026-11-11T10:15:00.000Z",
      total: 869.4,
      currencyCode: "INR",
      customerName: "Aarav Sharma",
    });
  });

  it("leaks no internal id, and an order with no lines has no lines", () => {
    const view = projectOrder(order(), [item()], "Aarav Sharma", "INR");
    const shown = JSON.stringify(view);
    for (const secret of [
      "o-BC-1057",
      "demo-brewery-cafe",
      "c4",
      "oi-1",
      "p-flat-white",
    ]) {
      expect(shown).not.toContain(secret);
    }
    expect(JSON.stringify(projectOrder(order(), [], "Nobody", "INR"))).not.toContain("o-BC-1057");
    expect(projectOrder(order(), [], "Nobody", "INR").lines).toEqual([]);
  });
});

describe("lookupReference", () => {
  it("is a stable SUP-<bill>-<last four> string", () => {
    expect(lookupReference("BC-1057", "+91 98274 89892")).toBe("SUP-BC1057-9892");
    expect(lookupReference("bc-1057", "9827489892")).toBe("SUP-BC1057-9892");
    expect(lookupReference(" BC-1057 ", "98274 89892")).toBe("SUP-BC1057-9892");
  });

  it("stays identical when called twice, so a reference can be repeated", () => {
    const first = lookupReference("BC-1057", "919827489892");
    expect(lookupReference("BC-1057", "919827489892")).toBe(first);
  });

  it("never repeats a number it has no digits for", () => {
    expect(lookupReference("BC-1057", "not a number")).toBe("SUP-BC1057-0000");
    expect(lookupReference("", "+91 98274 89892")).toBe("SUP-ORDER-9892");
  });
});

describe("supportReply", () => {
  it("says someone is at the till while the counter is open", () => {
    const reply = supportReply("Missing item", OPEN);
    expect(reply.headline).toBe("Logged — the counter is open now");
    expect(reply.detail).toContain("Open until 16:00");
    expect(reply.detail).toContain("a person is at the till");
  });

  it("frames the last hour as a race, not a promise", () => {
    const reply = supportReply("Quality problem", CLOSING);
    expect(reply.headline).toBe("Logged — the counter is closing soon");
    expect(reply.detail).toContain("Closing soon · until 16:00");
    expect(reply.detail).toContain("waits for the next shift");
  });

  it("names the next opening time when the counter is closed", () => {
    const reply = supportReply("Refund", CLOSED);
    expect(reply.headline).toBe("Logged — we will read it when we open");
    expect(reply.detail).toContain("Closed · opens 7:00 Mon");
    expect(reply.detail).toContain("first time a person will read this");
  });

  it("refuses a time when the owner has stopped taking orders", () => {
    const reply = supportReply("Return", PAUSED);
    expect(reply.headline).toContain("not taking orders right now");
    expect(reply.detail).toContain("Not taking orders right now");
    expect(reply.detail).toContain("we cannot give you a time");
  });

  it("gives four different answers, always quoting the open label", () => {
    const headlines = [OPEN, CLOSING, CLOSED, PAUSED].map(
      (open) => supportReply("Missing item", open).headline,
    );
    expect(new Set(headlines).size).toBe(4);
    for (const [i, open] of [OPEN, CLOSING, CLOSED, PAUSED].entries()) {
      expect(supportReply("Missing item", open).detail).toContain(open.label);
      expect(supportReply("Missing item", open).detail).toContain(answerLine(open));
      expect(headlines[i]).toBeTruthy();
    }
  });

  it("does not invent a time for a fully closed week", () => {
    const reply = supportReply("Something else", CLOSED_NO_WINDOW);
    expect(reply.headline).toBe("Logged — we will read it when we open");
    expect(reply.detail).toContain("no opening time on the schedule");
  });
});

describe("the catalogue", () => {
  it("labels every issue kind, and none of them is left out", () => {
    for (const kind of ISSUE_KINDS) {
      expect(ISSUE_KIND_LABELS[kind]).toBeTruthy();
    }
    expect(ISSUE_KINDS).toHaveLength(6);
    expect(ISSUE_KINDS).toContain("return");
  });

  it("keeps the policy honest about what this page cannot do", () => {
    expect(POLICY_LINES.length).toBeGreaterThan(3);
    const text = POLICY_LINES.join(" ");
    expect(text).toContain("seven days");
    expect(text).toContain("no SMS, no email, no WhatsApp");
    expect(text).not.toMatch(/we will (text|email|message) you/i);
  });
});
