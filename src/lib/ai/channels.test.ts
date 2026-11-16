import { describe, expect, it, vi } from "vitest";

/**
 * Channel status, as data. `channels.ts` is the one place the AI area reads the
 * integrations area, and the rule it must never break is honesty in both
 * directions: a channel that does not exist is never described as connected,
 * and a channel that *is* connected is never described as absent — nor ever as
 * something this area can send through. These tests pin all three states.
 */

const harness = vi.hoisted(() => ({
  configuration: { google: false, vault: false, whatsapp: false },
  prefs: {} as Record<string, { lastError?: string; lastSyncAt?: string }>,
  connected: new Set<string>(),
  vaultProbes: [] as string[],
}));

vi.mock("@/lib/integrations/config", () => ({
  readIntegrationConfiguration: () => harness.configuration,
}));

vi.mock("@/lib/integrations/state", () => ({
  readIntegrationPrefs: async () => ({ status: harness.prefs }),
}));

vi.mock("@/lib/integrations/vault", () => ({
  hasStoredConnection: async (_code: string, id: string) => {
    harness.vaultProbes.push(id);
    return {
      connected: harness.connected.has(id),
      account: harness.connected.has(id) ? "owner@cafe.example" : null,
      scopes: [],
    };
  },
}));

import { buildChannelStatuses } from "./channels";

async function statuses() {
  const channels = await buildChannelStatuses("BRW");
  return Object.fromEntries(channels.map((c) => [c.id, c])) as Record<
    (typeof channels)[number]["id"],
    (typeof channels)[number]
  >;
}

function reset() {
  harness.configuration = { google: false, vault: false, whatsapp: false };
  harness.prefs = {};
  harness.connected = new Set();
  harness.vaultProbes = [];
}

describe("an unconfigured server", () => {
  it("reports every channel as not configured", async () => {
    reset();
    const map = await statuses();
    expect(map.whatsapp.status).toBe("not_configured");
    expect(map.gmail.status).toBe("not_configured");
    expect(map.google_calendar.status).toBe("not_configured");
  });

  it("never touches the vault when nothing is configured", async () => {
    reset();
    await statuses();
    expect(harness.vaultProbes).toEqual([]);
  });

  it("says so plainly in the summary", async () => {
    reset();
    const map = await statuses();
    expect(map.gmail.summary).toContain("no Gmail credentials");
  });
});

describe("a configured server", () => {
  it("reports Google channels as disconnected without a stored connection", async () => {
    reset();
    harness.configuration = { google: true, vault: true, whatsapp: false };
    const map = await statuses();
    expect(map.gmail.status).toBe("disconnected");
    expect(map.google_calendar.status).toBe("disconnected");
    expect(harness.vaultProbes).toEqual(
      expect.arrayContaining(["gmail", "google_calendar"]),
    );
  });

  it("needs the vault key too — Google OAuth alone is not enough", async () => {
    reset();
    harness.configuration = { google: true, vault: false, whatsapp: false };
    const map = await statuses();
    expect(map.gmail.status).toBe("not_configured");
    expect(map.google_calendar.status).toBe("not_configured");
  });

  it("treats a configured WhatsApp token as connected without probing", async () => {
    reset();
    harness.configuration = { google: false, vault: false, whatsapp: true };
    const map = await statuses();
    expect(map.whatsapp.status).toBe("connected");
    expect(harness.vaultProbes).not.toContain("whatsapp");
  });
});

describe("a connected account", () => {
  it("reports the stored connection honestly as connected", async () => {
    reset();
    harness.configuration = { google: true, vault: true, whatsapp: false };
    harness.connected = new Set(["google_calendar"]);
    const map = await statuses();
    expect(map.google_calendar.status).toBe("connected");
    expect(map.gmail.status).toBe("disconnected");
    expect(map.google_calendar.summary).toContain("connected");
  });

  it("flips to error when the last call failed", async () => {
    reset();
    harness.configuration = { google: true, vault: true, whatsapp: false };
    harness.connected = new Set(["gmail"]);
    harness.prefs = { gmail: { lastError: "Google rejected the saved session." } };
    const map = await statuses();
    expect(map.gmail.status).toBe("error");
    expect(map.gmail.summary).toContain("failed");
  });

  it("never renders a credential or account value, only status copy", async () => {
    reset();
    harness.configuration = { google: true, vault: true, whatsapp: true };
    harness.connected = new Set(["gmail", "google_calendar"]);
    const channels = await buildChannelStatuses("BRW");
    const rendered = JSON.stringify(channels);
    expect(rendered).not.toContain("owner@cafe.example");
    expect(rendered).not.toContain("accessToken");
  });

  it("still promises nothing it cannot do — no channel copy claims OrderBook AI sends", async () => {
    reset();
    harness.configuration = { google: true, vault: true, whatsapp: true };
    harness.connected = new Set(["gmail", "google_calendar"]);
    const channels = await buildChannelStatuses("BRW");
    for (const channel of channels) {
      expect(channel.summary).not.toMatch(/will send|sends it for you/i);
      if (channel.status === "connected") {
        expect(channel.summary).toMatch(/never|only ever/i);
      }
    }
  });
});
