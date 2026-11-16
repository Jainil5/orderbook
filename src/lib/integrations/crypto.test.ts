import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  decryptToken,
  encryptSecret,
  encryptToken,
  secretsEqual,
  type StoredToken,
} from "./crypto";

/**
 * The vault's only job is that a stored value cannot be read without the key
 * and cannot be quietly edited. These tests hold it to that.
 */

const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 9);

function token(overrides: Partial<StoredToken> = {}): StoredToken {
  return {
    accessToken: "ya29.example-access-token",
    refreshToken: "1//example-refresh-token",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    expiresAt: Date.parse("2026-11-16T12:00:00.000Z"),
    account: "owner@cafe.example",
    calendarId: null,
    ...overrides,
  };
}

describe("token vault crypto", () => {
  it("round-trips a secret", () => {
    const cipher = encryptSecret("hELLO.123/token", KEY);
    expect(decryptSecret(cipher, KEY)).toBe("hELLO.123/token");
  });

  it("never writes the plaintext into the cipher", () => {
    const secret = "super-secret-refresh-value";
    const cipher = encryptSecret(secret, KEY);
    expect(cipher).not.toContain(secret);
    expect(cipher.startsWith("v1.")).toBe(true);
  });

  it("produces a different cipher each time (random IV)", () => {
    const a = encryptSecret("same", KEY);
    const b = encryptSecret("same", KEY);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, KEY)).toBe(decryptSecret(b, KEY));
  });

  it("returns null for the wrong key", () => {
    const cipher = encryptSecret("value", KEY);
    expect(decryptSecret(cipher, OTHER_KEY)).toBeNull();
  });

  it("returns null when the payload is tampered with", () => {
    const cipher = encryptSecret("value", KEY);
    const parts = cipher.split(".");
    // Flip one byte of the ciphertext, keeping the format intact.
    const bytes = Buffer.from(parts[3], "base64");
    bytes[0] = bytes[0] ^ 0xff;
    parts[3] = bytes.toString("base64");
    expect(decryptSecret(parts.join("."), KEY)).toBeNull();
  });

  it("rejects a payload with a missing segment", () => {
    expect(decryptSecret("v1.abc.def", KEY)).toBeNull();
    expect(decryptSecret("", KEY)).toBeNull();
    expect(decryptToken("nonsense", KEY)).toBeNull();
  });

  it("round-trips a token object and tolerates an absent refresh token", () => {
    const original = token({ calendarId: "primary" });
    const restored = decryptToken(encryptToken(original, KEY), KEY);
    expect(restored).toEqual(original);

    const bare = token({ refreshToken: null, calendarId: null });
    const back = decryptToken(encryptToken(bare, KEY), KEY);
    expect(back?.refreshToken).toBeNull();
    expect(back?.calendarId).toBeNull();
    expect(back?.accessToken).toBe(bare.accessToken);
  });

  it("refuses a token payload without an access token", () => {
    const cipher = encryptSecret(JSON.stringify({ expiresAt: 1 }), KEY);
    expect(decryptToken(cipher, KEY)).toBeNull();
  });

  it("compares secrets without leaking through length timing", () => {
    expect(secretsEqual("aaa", "aaa")).toBe(true);
    expect(secretsEqual("aaa", "aab")).toBe(false);
    expect(secretsEqual("aaa", "aaaa")).toBe(false);
  });
});
