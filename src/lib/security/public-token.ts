import { randomBytes } from "node:crypto";

/** Unguessable token for public quote links (≥128 bits entropy). */
export function createPublicQuoteToken(): string {
  return `qt_${randomBytes(24).toString("base64url")}`;
}

export function normalizePublicQuoteToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 16 || trimmed.length > 128) return null;
  if (!/^qt_[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}
