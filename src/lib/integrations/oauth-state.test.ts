import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  OAUTH_COOKIE,
  beginAuthorization,
  consumeAuthorization,
  createPkcePair,
  pendingAuthorizationCount,
  resetAuthorizationStore,
  signState,
} from "./oauth-state";

/**
 * The authorization-code flow has to survive three attacks: a forged callback,
 * a replayed callback, and a callback pinched from another business's flow.
 */

function base64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

afterEach(() => resetAuthorizationStore());

describe("PKCE", () => {
  it("derives the S256 challenge from the verifier", () => {
    const { verifier, challenge } = createPkcePair();
    const expected = base64url(createHash("sha256").update(verifier).digest());
    expect(challenge).toBe(expected);
    expect(verifier).not.toBe(challenge);
    // RFC 7636 requires 43..128 characters for a 32-byte verifier.
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never reuses a verifier across flows", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      const { verifier, challenge } = createPkcePair();
      expect(seen.has(verifier)).toBe(false);
      expect(seen.has(challenge)).toBe(false);
      seen.add(verifier);
      seen.add(challenge);
    }
  });
});

describe("authorization state", () => {
  const cookieName = OAUTH_COOKIE;

  it("names the transaction cookie rather than storing a credential in it", () => {
    expect(cookieName).toBe("ob_oauth_txn");
    const started = beginAuthorization({
      brandCode: "br-1",
      brandId: "brand-1",
      integration: "google_calendar",
    });
    // `state.signature` — no verifier, no token.
    expect(started.cookieValue.split(".")).toHaveLength(2);
    expect(started.cookieValue).not.toContain(started.verifier);
  });

  it("consumes a matching flow and hands back the verifier", () => {
    const started = beginAuthorization({
      brandCode: "BR-1",
      brandId: "brand-1",
      integration: "gmail",
    });
    const consumed = consumeAuthorization(started.state, "br-1", started.cookieValue);
    expect(consumed.ok).toBe(true);
    if (consumed.ok) {
      expect(consumed.verifier).toBe(started.verifier);
      expect(consumed.pending.brandId).toBe("brand-1");
      expect(consumed.pending.integration).toBe("gmail");
    }
  });

  it("is single-use: a replayed callback is rejected", () => {
    const started = beginAuthorization({
      brandCode: "BR-1",
      brandId: "brand-1",
      integration: "gmail",
    });
    expect(consumeAuthorization(started.state, "BR-1", started.cookieValue).ok).toBe(true);
    const replay = consumeAuthorization(started.state, "BR-1", started.cookieValue);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toMatch(/expired/i);
  });

  it("rejects a callback without the transaction cookie", () => {
    const started = beginAuthorization({
      brandCode: "BR-1",
      brandId: "brand-1",
      integration: "gmail",
    });
    const result = consumeAuthorization(started.state, "BR-1", null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/session/i);
  });

  it("rejects a cookie signed for another state value", () => {
    const started = beginAuthorization({
      brandCode: "BR-1",
      brandId: "brand-1",
      integration: "gmail",
    });
    const forged = `${started.state}.${signState("BR-1", "some-other-state")}`;
    expect(consumeAuthorization(started.state, "BR-1", forged).ok).toBe(false);
  });

  it("rejects a callback replayed onto a different business", () => {
    const started = beginAuthorization({
      brandCode: "BR-1",
      brandId: "brand-1",
      integration: "gmail",
    });
    const result = consumeAuthorization(started.state, "BR-2", started.cookieValue);
    expect(result.ok).toBe(false);
    // The HMAC covers `brandCode|state`, so a cross-brand replay fails at the
    // signature check before the stored brand is ever compared.
    if (!result.ok) expect(result.reason).toMatch(/mismatch/i);
  });

  it("rejects malformed and oversized state values without touching the store", () => {
    beginAuthorization({ brandCode: "BR-1", brandId: "brand-1", integration: "gmail" });
    const before = pendingAuthorizationCount();
    expect(consumeAuthorization(null, "BR-1", "a.b").ok).toBe(false);
    expect(consumeAuthorization("x".repeat(200), "BR-1", "a.b").ok).toBe(false);
    expect(consumeAuthorization("no-separator", "BR-1", "noseparator").ok).toBe(false);
    // Oversized values never even reach the store lookup.
    expect(pendingAuthorizationCount()).toBe(before);
  });

  it("drops an expired transaction on the next begin", () => {
    const started = beginAuthorization({
      brandCode: "BR-1",
      brandId: "brand-1",
      integration: "gmail",
    });
    expect(pendingAuthorizationCount()).toBe(1);
    // Age the entry past the 10-minute TTL by starting a new flow: `begin` prunes.
    const realNow = Date.now;
    Date.now = () => realNow() + 11 * 60 * 1000;
    try {
      beginAuthorization({ brandCode: "BR-2", brandId: "brand-2", integration: "gmail" });
    } finally {
      Date.now = realNow;
    }
    expect(pendingAuthorizationCount()).toBe(1);
    expect(consumeAuthorization(started.state, "BR-1", started.cookieValue).ok).toBe(false);
  });
});
