import { describe, expect, it } from "vitest";
import {
  parseWebOrderPayload,
  WEB_ORDER_LIMITS,
  type WebOrderPayloadVerdict,
} from "./order-request";

function ok(input: unknown) {
  const verdict = input as WebOrderPayloadVerdict;
  if (!verdict.ok) throw new Error(`expected a valid order, got: ${verdict.message}`);
  return verdict.input;
}

function rejected(input: unknown): string {
  const verdict = input as WebOrderPayloadVerdict;
  if (verdict.ok) throw new Error("expected this order to be refused");
  return verdict.message;
}

const base = {
  customerName: "Kabir Rao",
  fulfilment: "takeaway",
  lines: [{ productId: "p1", quantity: 2, modifierIds: ["md", "oat"] }],
};

describe("parseWebOrderPayload", () => {
  it("accepts a normal cart from the storefront", () => {
    const input = ok(parseWebOrderPayload(base));
    expect(input.customerName).toBe("Kabir Rao");
    expect(input.fulfilment).toBe("takeaway");
    expect(input.lines).toEqual([
      { productId: "p1", quantity: 2, modifierIds: ["md", "oat"] },
    ]);
  });

  it("refuses a body that is not an object at all", () => {
    for (const junk of [null, undefined, "[]", 42, [], {}]) {
      expect(rejected(parseWebOrderPayload(junk)).length).toBeGreaterThan(0);
    }
  });

  it("needs a name and a way to hand the ticket over", () => {
    expect(rejected(parseWebOrderPayload({ ...base, customerName: "   " }))).toBe(
      "Tell us who the order is for.",
    );
    expect(rejected(parseWebOrderPayload({ ...base, fulfilment: "teleport" }))).toBe(
      "Choose pickup at the counter or delivery.",
    );
    expect(rejected(parseWebOrderPayload({ ...base, fulfilment: "delivery", address: "" }))).toBe(
      "Add a delivery address.",
    );
    expect(rejected(parseWebOrderPayload({ ...base, lines: [] }))).toBe(
      "Pick at least one item first.",
    );
  });

  it("passes a phone the counter cannot dial back to the customer", () => {
    expect(rejected(parseWebOrderPayload({ ...base, phone: "12345" }))).toBe(
      "Enter a valid mobile number (8–15 digits).",
    );
    expect(ok(parseWebOrderPayload({ ...base, phone: "+91 98765 43210" })).phone).toBe(
      "+91 98765 43210",
    );
  });

  it("clamps what a determined tapper can stack up", () => {
    const input = ok(
      parseWebOrderPayload({
        ...base,
        customerName: "A".repeat(200),
        notes: "n".repeat(900),
        address: "a".repeat(900),
        offerCode: "O".repeat(200),
        fulfilment: "delivery",
        lines: Array.from({ length: 12 }, (_unused, index) => ({
          productId: `p${index}`,
          quantity: 500,
          modifierIds: Array.from({ length: 20 }, (_m, m) => `m${m}`),
        })),
      }),
    );
    expect(input.customerName).toHaveLength(WEB_ORDER_LIMITS.customerName);
    expect(input.notes).toHaveLength(WEB_ORDER_LIMITS.notes);
    expect(input.address).toHaveLength(WEB_ORDER_LIMITS.address);
    expect(input.offerCode).toHaveLength(WEB_ORDER_LIMITS.offerCode);
    expect(input.lines).toHaveLength(12);
    for (const line of input.lines) {
      expect(line.quantity).toBe(WEB_ORDER_LIMITS.quantity);
      expect(line.modifierIds).toHaveLength(WEB_ORDER_LIMITS.modifiers);
    }
  });

  it("refuses a list it would have to shorten, rather than lose items", () => {
    const tooMany = Array.from({ length: 21 }, (_unused, index) => ({
      productId: `p${index}`,
      quantity: 1,
      modifierIds: [],
    }));
    expect(rejected(parseWebOrderPayload({ ...base, lines: tooMany }))).toBe(
      "That list is longer than 20 items — split it into two orders.",
    );
  });

  it("keeps an unreadable line from becoming a ticket", () => {
    expect(rejected(parseWebOrderPayload({ ...base, lines: ["p1"] }))).toBe(
      "One of the items in your list is unreadable.",
    );
    expect(rejected(parseWebOrderPayload({ ...base, lines: [{ quantity: 1 }] }))).toBe(
      "One of the items in your list is unreadable.",
    );
    expect(rejected(parseWebOrderPayload({ ...base, lines: "p1" }))).toBe(
      "Pick at least one item first.",
    );
  });

  it("coerces the fields the ticket prints, whatever type they arrive as", () => {
    const input = ok(
      parseWebOrderPayload({
        customerName: "  Deepa Nair  ",
        fulfilment: "DELIVERY",
        address: "12 MG Road",
        phone: 9876543210,
        notes: { nested: true },
        lines: [{ productId: 17, quantity: "3", modifierIds: "not-an-array" }],
      }),
    );
    expect(input.customerName).toBe("Deepa Nair");
    expect(input.fulfilment).toBe("delivery");
    expect(input.phone).toBe("9876543210");
    expect(input.notes).toBeUndefined();
    expect(input.lines).toEqual([
      { productId: "17", quantity: 3, modifierIds: [] },
    ]);
  });
});
