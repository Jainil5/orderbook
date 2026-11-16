import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_SCOPES,
  INTEGRATION_DEFINITIONS,
  INTEGRATION_IDS,
  assertSafeScopes,
  buildConnectionView,
  connectionStatus,
  getIntegrationDefinition,
  googleConsentScopes,
  isIntegrationId,
  scopesForGoogle,
} from "./registry";

/**
 * Scope policy. If one of these fails, the product is asking a customer for
 * permission it has not earned — which is the one mistake an integration layer
 * cannot walk back.
 */

const ALL_SCOPES = INTEGRATION_IDS.flatMap((id) => INTEGRATION_DEFINITIONS[id].scopes);

describe("scope policy", () => {
  it("requests no forbidden scope anywhere", () => {
    for (const scope of ALL_SCOPES) {
      expect(FORBIDDEN_SCOPES as readonly string[]).not.toContain(scope);
    }
    expect(() => assertSafeScopes(ALL_SCOPES)).not.toThrow();
  });

  it("never asks for full mailbox or full calendar access", () => {
    expect(FORBIDDEN_SCOPES).toContain("https://www.googleapis.com/auth/gmail.send");
    expect(FORBIDDEN_SCOPES).toContain("https://www.googleapis.com/auth/gmail.modify");
    expect(FORBIDDEN_SCOPES).toContain("https://www.googleapis.com/auth/calendar");
    expect(FORBIDDEN_SCOPES).toContain("https://mail.google.com/");
    expect(() => assertSafeScopes([...FORBIDDEN_SCOPES])).toThrow(/not allowed/i);
    expect(() => assertSafeScopes([])).not.toThrow();
  });

  it("declares email sending as a capability it will not request", () => {
    const gmail = INTEGRATION_DEFINITIONS.gmail;
    expect(gmail.notRequested).toContain("send_email");
    expect(gmail.capabilities).not.toContain("send_email");
    expect(gmail.scopes).toContain("https://www.googleapis.com/auth/gmail.readonly");
    expect(gmail.scopes).toContain("https://www.googleapis.com/auth/gmail.compose");
  });

  it("keeps every channel confirmation-gated", () => {
    for (const id of INTEGRATION_IDS) {
      expect(INTEGRATION_DEFINITIONS[id].confirmationRequired).toBe(true);
    }
  });

  it("only sends through WhatsApp, and sends nothing through Gmail", () => {
    expect(INTEGRATION_DEFINITIONS.whatsapp.capabilities).toEqual(["send_whatsapp_message"]);
    expect(INTEGRATION_DEFINITIONS.whatsapp.scopes).toEqual([]);
    expect(INTEGRATION_DEFINITIONS.gmail.capabilities).toEqual(["read_email", "draft_email"]);
  });

  it("asks for one consent covering both Google channels", () => {
    const combined = googleConsentScopes(["google_calendar", "gmail"]);
    expect(combined).toHaveLength(4);
    expect(new Set(combined).size).toBe(4);
    expect(scopesForGoogle("whatsapp")).toEqual([]);
    expect(scopesForGoogle("google_calendar")).toEqual(
      INTEGRATION_DEFINITIONS.google_calendar.scopes,
    );
  });

  it("documents env names, never env values", () => {
    for (const id of INTEGRATION_IDS) {
      for (const name of INTEGRATION_DEFINITIONS[id].requiredEnv) {
        expect(name).toMatch(/^[A-Z0-9_]+$/);
      }
    }
  });

  it("recognises only known integration ids", () => {
    expect(isIntegrationId("gmail")).toBe(true);
    expect(isIntegrationId("GMAIL")).toBe(false);
    expect(isIntegrationId("slack")).toBe(false);
    expect(isIntegrationId(null)).toBe(false);
    expect(isIntegrationId(undefined)).toBe(false);
    expect(getIntegrationDefinition("slack" as never)).toBeUndefined();
  });
});

describe("connection status", () => {
  it("prioritises configuration, then the connection, then the error", () => {
    expect(connectionStatus("gmail", false, true, "boom")).toBe("not_configured");
    expect(connectionStatus("gmail", true, false, "boom")).toBe("disconnected");
    expect(connectionStatus("gmail", true, true, null)).toBe("connected");
    expect(connectionStatus("gmail", true, true, "boom")).toBe("error");
  });

  it("shows the scopes we would ask for when nothing is granted yet", () => {
    const view = buildConnectionView("gmail", {
      configured: true,
      connected: false,
      lastError: null,
      accountLabel: null,
      scopes: [],
    });
    expect(view.scopes).toEqual(INTEGRATION_DEFINITIONS.gmail.scopes);
    expect(view.status).toBe("disconnected");
    expect(view.accountLabel).toBeNull();
  });

  it("exposes no field that could carry a credential", () => {
    const view = buildConnectionView("google_calendar", {
      configured: true,
      connected: true,
      lastError: null,
      accountLabel: "o***@cafe.example",
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      lastSyncAt: "2026-11-16T09:00:00.000Z",
      calendarId: "work@group.calendar.google.com",
    });
    const keys = Object.keys(view).sort();
    expect(keys).toEqual(
      [
        "accountLabel",
        "calendarId",
        "capabilities",
        "confirmationRequired",
        "id",
        "label",
        "lastError",
        "lastSyncAt",
        "notRequested",
        "purpose",
        "requiredEnv",
        "scopes",
        "shortLabel",
        "status",
      ].sort(),
    );
    const serialised = JSON.stringify(view);
    // No credential material, and none of the field names the vault uses.
    expect(serialised).not.toContain("ya29.");
    expect(serialised).not.toMatch(/"(tokenCipher|refreshCipher|accessToken|clientSecret)"/);
    expect(view.status).toBe("connected");
  });
});
