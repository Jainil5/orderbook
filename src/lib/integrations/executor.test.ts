import { describe, expect, it } from "vitest";
import { describeProposal, sanitizePayload } from "./executor";

/**
 * The outbound policy, as data. Everything the confirmation queue can show, and
 * everything it must never show, is decided by these two pure functions — so
 * the refusals are worth as many tests as the approvals.
 */

const eventPayload = {
  summary: "Table for 4 — Meera",
  startsAt: "2026-11-17T19:00:00+05:30",
  endsAt: "2026-11-17T20:00:00+05:30",
};

describe("what may be proposed", () => {
  it("describes a calendar create", () => {
    const described = describeProposal("create_calendar_event", eventPayload);
    expect(described).toContain("Table for 4 — Meera");
    expect(described).toContain("2026-11-17T19:00:00+05:30");
  });

  it("describes a gmail draft but never an email send", () => {
    expect(
      describeProposal("create_gmail_draft", {
        to: "meera@example.com",
        subject: "Your quote",
        body: "Attaching the estimate.",
      }),
    ).toContain("Draft an email to meera@example.com");
    expect(
      describeProposal("send_gmail_message", {
        to: "meera@example.com",
        subject: "Your quote",
        body: "Paid now.",
      }),
    ).toBeNull();
  });

  it("refuses to rewrite somebody else's calendar entry in this phase", () => {
    expect(describeProposal("update_calendar_event", eventPayload)).toBeNull();
  });

  it("refuses external actions that stay inside OrderBook", () => {
    expect(describeProposal("create_task", { title: "Call the printer" })).toBeNull();
  });

  it("requires a complete payload rather than guessing", () => {
    expect(describeProposal("create_calendar_event", { ...eventPayload, endsAt: "19:00" })).toBeNull();
    expect(describeProposal("create_calendar_event", { summary: "no times" })).toBeNull();
    expect(describeProposal("create_gmail_draft", { to: "meera@example.com", subject: "x" })).toBeNull();
    expect(describeProposal("send_whatsapp_message", { body: "Order ready" })).toBeNull();
    expect(
      describeProposal("send_whatsapp_message", { to: "919820012345", body: "Order ready" }),
    ).toContain("919820012345");
  });

  it("rejects an oversized summary instead of truncating silently", () => {
    expect(
      describeProposal("create_calendar_event", { ...eventPayload, summary: "x".repeat(501) }),
    ).toBeNull();
  });
});

describe("payload sanitising", () => {
  it("keeps only the keys the adapter reads", () => {
    const clean = sanitizePayload("create_calendar_event", {
      ...eventPayload,
      location: "Shop floor",
      attendees: [{ email: "someone@example.com" }],
      source: "ai",
      htmlLink: "https://calendar.google.com/event?eid=x",
    });
    expect(Object.keys(clean).sort()).toEqual([
      "endsAt",
      "location",
      "startsAt",
      "summary",
    ]);
    expect(JSON.stringify(clean)).not.toContain("htmlLink");
  });

  it("drops over-long and non-text fields rather than forwarding them", () => {
    const clean = sanitizePayload("create_gmail_draft", {
      to: "meera@example.com",
      subject: "Your quote for the teak table",
      body: "Attached is the estimate.",
      inReplyTo: 42,
    });
    expect(clean.subject).toBe("Your quote for the teak table");
    expect(clean.inReplyTo).toBeUndefined();
    expect(clean.body).toBe("Attached is the estimate.");

    const oversized = sanitizePayload("create_gmail_draft", {
      to: "meera@example.com",
      subject: "y".repeat(900),
      body: "Attached is the estimate.",
    });
    // Rejected outright: the adapter must not act on a truncated request.
    expect(oversized.subject).toBeUndefined();
  });

  it("caps WhatsApp variables at three short values", () => {
    const clean = sanitizePayload("send_whatsapp_message", {
      to: "919820012345",
      name: "order_ready",
      languageCode: "en",
      bodyValues: ["Meera", "CF-1042", "Thursday", "extra", "z".repeat(120)],
    });
    expect(clean.bodyValues).toEqual(["Meera", "CF-1042", "Thursday"]);
    expect(clean.languageCode).toBe("en");
  });

  it("sanitises nothing for actions the policy already refused", () => {
    expect(sanitizePayload("send_gmail_message", { to: "a@b.example", body: "hi" })).toEqual({});
    expect(sanitizePayload("create_task", { title: "x" })).toEqual({});
  });

  it("drops blank and non-string fields", () => {
    const clean = sanitizePayload("create_calendar_event", {
      ...eventPayload,
      description: "   ",
      customerName: null,
      location: 7,
    });
    expect(clean.description).toBeUndefined();
    expect(clean.customerName).toBeUndefined();
    expect(clean.location).toBeUndefined();
  });
});
