import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Server-side token vault.
 *
 * Provider tokens are encrypted with AES-256-GCM before they are stored and
 * they never leave this module: pages receive `IntegrationConnection` objects
 * only, so an access token cannot end up in HTML, JSON, a cookie, the audit
 * trail or a client component.
 *
 * Storage backends:
 * - `supabase` — the `brand_integrations` table (RLS by brand membership); the
 *   ciphertext columns are ours, so a database dump is not a credential dump.
 * - `process_memory` — no database credentials configured (local demo mode).
 *   Records die with the server process and are not written to any cookie.
 * - `unavailable` — `INTEGRATION_ENCRYPTION_KEY` missing: connecting is refused
 *   rather than storing a token in the clear.
 */

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

export type VaultBackend = "supabase" | "process_memory" | "unavailable";

export type StoredToken = {
  accessToken: string;
  refreshToken: string | null;
  scope: string | null;
  /** Epoch millis. */
  expiresAt: number;
  account: string | null;
  /** Selected Google calendar id, when the user picked one. */
  calendarId: string | null;
};

/** Wire format written to an encrypted column: `v1.<iv>.<tag>.<ciphertext>`. */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload: string, key: Buffer): string | null {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  const [, ivPart, tagPart, dataPart] = parts;
  try {
    const iv = Buffer.from(ivPart!, "base64");
    const tag = Buffer.from(tagPart!, "base64");
    const data = Buffer.from(dataPart!, "base64");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    // Auth tag mismatch means the row was tampered with or the key rotated.
    return null;
  }
}

export function encryptToken(token: StoredToken, key: Buffer): string {
  return encryptSecret(JSON.stringify(token), key);
}

export function decryptToken(payload: string, key: Buffer): StoredToken | null {
  const json = decryptSecret(payload, key);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<StoredToken>;
    if (typeof parsed.accessToken !== "string" || !parsed.accessToken) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken:
        typeof parsed.refreshToken === "string" ? parsed.refreshToken : null,
      scope: typeof parsed.scope === "string" ? parsed.scope : null,
      expiresAt:
        typeof parsed.expiresAt === "number" ? parsed.expiresAt : Date.now(),
      account: typeof parsed.account === "string" ? parsed.account : null,
      calendarId:
        typeof parsed.calendarId === "string" ? parsed.calendarId : null,
    };
  } catch {
    return null;
  }
}

/** Re-exported for callers that must compare secrets without leaking them. */
export function secretsEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
