import { describe, expect, it } from "vitest";
import {
  buildEventBody,
  isValidCalendarId,
  mapCalendarEvent,
  toExternalEvent,
} from "./adapters/google-calendar";
import {
  COMPOSE_SCOPE,
  READONLY_SCOPE,
  buildDraft,
  buildQuery,
  mapMessage,
} from "./adapters/gmail";
import {
  buildTemplateParams,
  buildTextMessage,
  normalizeMsisdn,
  safeMessageId,
} from "./adapters/whatsapp";

/**
 * Adapters are the last place a bad value can be stopped, so they are tested on
 * rejection rather than on happy paths: a payload that reaches Google or Meta
 * must be one this code built itself.
 */

const ctx = {
  brandId: "brand-1",
  accountLabel: "o***@cafe.example",
  syncedAt: "2026-11-16T09:00:00.000Z",
};

describe("Google Calendar adapter input handling", () => {
  it("accepts real calendar id shapes and rejects anything path-like", () => {
    expect(isValidCalendarId("primary")).toBe(true);
    expect(isValidCalendarId("en.indian#holiday@group.v.calendar.google.com")).toBe(true);
    expect(isValidCalendarId("a1b2c3@group.calendar.google.com")).toBe(true);
    expect(isValidCalendarId("../etc/passwd")).toBe(false);
    expect(isValidCalendarId("cal?alt=media")).toBe(false);
    expect(isValidCalendarId("")).toBe(false);
    expect(isValidCalendarId("x".repeat(251))).toBe(false);
    expect(isValidCalendarId(null)).toBe(false);
  });

  it("builds a create payload only from a complete, ordered draft", () => {
    const good = buildEventBody({
      summary: "Table for 4 — Meera",
      startsAt: "2026-11-17T19:00:00+05:30",
      endsAt: "2026-11-17T20:00:00+05:30",
      location: "Shop floor",
      customerName: "Meera",
    });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.body.start).toEqual({ dateTime: "2026-11-17T19:00:00+05:30" });
      expect(good.body.attendees).toEqual([{ displayName: "Meera" }]);
    }

    expect(
      buildEventBody({
        summary: "No end time",
        startsAt: "2026-11-17T19:00:00+05:30",
        endsAt: "tomorrow",
      }).ok,
    ).toBe(false);
    expect(
      buildEventBody({
        summary: "Backwards",
        startsAt: "2026-11-17T20:00:00+05:30",
        endsAt: "2026-11-17T19:00:00+05:30",
      }).ok,
    ).toBe(false);
    expect(
      buildEventBody({
        summary: "   ",
        startsAt: "2026-11-17T19:00:00+05:30",
        endsAt: "2026-11-17T20:00:00+05:30",
      }).ok,
    ).toBe(false);
  });

  it("normalises timed and all-day events, and drops unusable rows", () => {
    const timed = mapCalendarEvent(
      {
        id: "evt_123",
        summary: "Site visit",
        start: { dateTime: "2026-11-17T11:00:00+05:30" },
        end: { dateTime: "2026-11-17T12:00:00+05:30" },
        location: "Juhu flat",
        attendees: [{ email: "a@b.example" }],
      },
      ctx,
    );
    expect(timed).not.toBeNull();
    expect(timed?.id).toBe("gcal-evt_123");
    expect(timed?.attendeeCount).toBe(1);
    expect(timed?.needsFollowUp).toBe(false);

    // Google marks an all-day event as [start.date, end.date) — end is exclusive.
    const allDay = mapCalendarEvent(
      { id: "evt_124", summary: "Closed", start: { date: "2026-11-18" }, end: { date: "2026-11-19" } },
      ctx,
    );
    expect(allDay?.startsAt).toBe("2026-11-18T00:00:00");
    expect(allDay?.endsAt).toBe("2026-11-18T23:59:00");

    expect(mapCalendarEvent({ id: "", summary: "no id" }, ctx)).toBeNull();
    expect(mapCalendarEvent(null, ctx)).toBeNull();
    expect(mapCalendarEvent({ id: "ok", summary: "no times" }, ctx)).toBeNull();
  });

  it("collapses whitespace and caps field length instead of trusting Google", () => {
    const row = mapCalendarEvent(
      {
        id: "evt_125",
        summary: `  Long ${"x".repeat(900)}  `,
        start: { dateTime: "2026-11-17T11:00:00+05:30" },
        end: { dateTime: "2026-11-17T12:00:00+05:30" },
      },
      ctx,
    );
    expect(row?.title.length).toBeLessThanOrEqual(500);
    expect(row?.title).not.toMatch(/\s\s/);
  });

  it("keeps a fetched row identical to its agenda row", () => {
    const event = {
      id: "evt_200",
      summary: "Consultation",
      description: null,
      location: null,
      startsAt: "2026-11-17T10:00:00+05:30",
      endsAt: "2026-11-17T10:30:00+05:30",
      attendeeCount: null,
      htmlLink: null,
    };
    const row = toExternalEvent(event, ctx);
    expect(row.externalId).toBe("evt_200");
    expect(row.startsAt).toBe(event.startsAt);
    expect(row.snippet).toBeNull();
  });
});

describe("Gmail adapter input handling", () => {
  it("only asks for read and compose scopes", () => {
    expect(READONLY_SCOPE).toBe("https://www.googleapis.com/auth/gmail.readonly");
    expect(COMPOSE_SCOPE).toBe("https://www.googleapis.com/auth/gmail.compose");
    expect(READONLY_SCOPE).not.toContain("modify");
  });

  it("accepts Gmail operators and rejects URLs or stray characters", () => {
    expect(buildQuery("is:unread newer_than:7d")).toEqual({
      raw: "is:unread newer_than:7d",
      maxResults: 25,
    });
    expect(buildQuery("to:customer@example.com subject:quote")).not.toBeNull();
    expect(buildQuery("https://evil.example/?q=all")).toBeNull();
    expect(buildQuery("label:work;rm -rf")).toBeNull();
    expect(buildQuery("   ")).toBeNull();
    expect(buildQuery(42)).toBeNull();
  });

  it("builds a draft only with a real recipient, subject and body", () => {
    const built = buildDraft({
      to: "meera@example.com",
      subject: "Your quote",
      body: "Hello Meera,\n\nAttached is the estimate.",
    });
    expect(built.ok).toBe(true);
    if (built.ok) {
      // base64url: no padding, no `+` or `/`.
      expect(built.raw).toMatch(/^[A-Za-z0-9_-]+$/);
      const decoded = Buffer.from(built.raw, "base64url").toString("utf8");
      expect(decoded).toContain("To: meera@example.com");
      expect(decoded).toContain("Content-Type: text/plain; charset=UTF-8");
    }

    expect(buildDraft({ to: "meera, admin", subject: "x", body: "y" }).ok).toBe(false);
    expect(buildDraft({ to: "meera@example.com", subject: "  ", body: "y" }).ok).toBe(false);
    expect(buildDraft({ to: "meera@example.com", subject: "x", body: "" }).ok).toBe(false);
  });

  it("keeps reply-threading headers out unless they look like message ids", () => {
    const withRef = buildDraft({
      to: "meera@example.com",
      subject: "Re: quote",
      body: "ok",
      inReplyTo: "<abc123@mail.gmail.com>",
    });
    expect(withRef.ok).toBe(true);
    if (withRef.ok) {
      const decoded = Buffer.from(withRef.raw, "base64url").toString("utf8");
      expect(decoded).toContain("In-Reply-To: <abc123@mail.gmail.com>");
    }
    const junk = buildDraft({
      to: "meera@example.com",
      subject: "quote",
      body: "ok",
      inReplyTo: "<script>alert(1)</script>",
    });
    expect(junk.ok).toBe(true);
    if (junk.ok) {
      const decoded = Buffer.from(junk.raw, "base64url").toString("utf8");
      expect(decoded).not.toContain("In-Reply-To");
    }
  });

  it("marks unread mail as needing a reply and refuses malformed rows", () => {
    const row = mapMessage(
      {
        id: "18f0a1b2c3d4e5f6",
        labelIds: ["UNREAD", "INBOX"],
        snippet: "Can we move Thursday?",
        internalDate: "1763452800000",
        payload: {
          headers: [
            { name: "Subject", value: "Thursday booking" },
            { name: "From", value: "Meera <meera@example.com>" },
          ],
        },
      },
      ctx,
    );
    expect(row?.title).toBe("Thursday booking");
    expect(row?.needsFollowUp).toBe(true);
    expect(row?.startsAt).toBe(new Date(1763452800000).toISOString());
    expect(mapMessage({ id: "not valid!" }, ctx)).toBeNull();
  });
});

describe("WhatsApp adapter input handling", () => {
  it("normalises numbers to digits only", () => {
    expect(normalizeMsisdn("+91 98200 12345")).toBe("919820012345");
    expect(normalizeMsisdn("00919820012345")).toBe("919820012345");
    expect(normalizeMsisdn("919820012345")).toBe("919820012345");
    expect(normalizeMsisdn("12345")).toBeNull();
    expect(normalizeMsisdn("abc")).toBeNull();
    expect(normalizeMsisdn(null)).toBeNull();
    expect(normalizeMsisdn("9".repeat(20))).toBeNull();
  });

  it("refuses links and empty text in automated messages", () => {
    expect(buildTextMessage("Your order is ready for pickup.").ok).toBe(true);
    expect(buildTextMessage("Pay here https://pay.example/x").ok).toBe(false);
    expect(buildTextMessage("Ping wa.me/919820012345").ok).toBe(false);
    expect(buildTextMessage("   ").ok).toBe(false);
    expect(buildTextMessage("x".repeat(1025)).ok).toBe(false);
    expect(buildTextMessage(undefined).ok).toBe(false);
  });

  it("caps template variables at three and rejects link-like values", () => {
    expect(buildTemplateParams(["Meera", "CF-1042", "Thursday"])).toEqual([
      "Meera",
      "CF-1042",
      "Thursday",
    ]);
    expect(buildTemplateParams(["a", "b", "c", "d"])).toBeNull();
    expect(buildTemplateParams([])).toBeNull();
    expect(buildTemplateParams(["https://x.example"])).toBeNull();
    expect(buildTemplateParams([null])).toBeNull();
    expect(buildTemplateParams(["  spaced   text  "])).toEqual(["spaced text"]);
  });

  it("keeps only a well-formed provider message id", () => {
    expect(safeMessageId("wamid.HBgLOTE5ODIwMDEyMzQ1")).toBeTruthy();
    expect(safeMessageId("")).toBeNull();
    expect(safeMessageId(12345)).toBeNull();
    expect(safeMessageId("x".repeat(200))).toBeNull();
  });
});
