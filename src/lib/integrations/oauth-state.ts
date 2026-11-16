import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

/**
 * CSRF + PKCE state for the OAuth authorization-code flow.
 *
 * The code exchange happens server-side, so pending transactions live in
 * process memory with a short TTL and are consumed exactly once. A HMAC-signed
 * cookie pins the flow to the browser that started it, so a callback is
 * rejected even if somebody guesses the `state` value.
 *
 * Multi-instance deployments should move `store` to the database or Redis;
 * the `beginAuthorization` / `consumeAuthorization` interface stays the same.
 */

const TTL_MS = 10 * 60 * 1000;
export const OAUTH_COOKIE = "ob_oauth_txn";

type Pending = {
  brandCode: string;
  brandId: string;
  integration: string;
  verifier: string;
  createdAt: number;
};

const store = new Map<string, Pending>();

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/** RFC 7636 code_verifier / code_challenge (S256). */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(
    Buffer.from(createHash("sha256").update(verifier).digest()),
  );
  return { verifier, challenge };
}

function signingSecret(): string {
  return process.env.INTEGRATION_ENCRYPTION_KEY ?? "orderbook-dev-state-secret";
}

/** Binds a state value to a brand without storing anything the client needs. */
export function signState(brandCode: string, state: string): string {
  return base64url(
    Buffer.from(
      createHmac("sha256", signingSecret())
        .update(`${brandCode.toUpperCase()}|${state}`)
        .digest(),
    ),
  );
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function prune(now: number): void {
  for (const [key, value] of store) {
    if (now - value.createdAt > TTL_MS) store.delete(key);
  }
}

export type AuthorizationStart = {
  state: string;
  verifier: string;
  challenge: string;
  /** Value to write to the signed `ob_oauth_txn` cookie. */
  cookieValue: string;
};

export type ConsumedAuthorization = {
  brandCode: string;
  brandId: string;
  integration: string;
  verifier: string;
};

export type ConsumeResult =
  | { ok: true; pending: Omit<ConsumedAuthorization, "verifier">; verifier: string }
  | { ok: false; reason: string };

export function beginAuthorization(input: {
  brandCode: string;
  brandId: string;
  integration: string;
}): AuthorizationStart {
  prune(Date.now());
  const state = randomUUID();
  const { verifier, challenge } = createPkcePair();
  store.set(state, {
    brandCode: input.brandCode.toUpperCase(),
    brandId: input.brandId,
    integration: input.integration,
    verifier,
    createdAt: Date.now(),
  });
  return {
    state,
    verifier,
    challenge,
    cookieValue: `${state}.${signState(input.brandCode, state)}`,
  };
}

/** Single-use: the entry is dropped whether or not validation succeeds. */
export function consumeAuthorization(
  state: string | null,
  brandCode: string,
  cookieValue: string | null | undefined,
): ConsumeResult {
  if (!state || state.length > 64) {
    return { ok: false, reason: "Missing sign-in link. Start again." };
  }
  const pending = store.get(state);
  store.delete(state);
  if (!pending) {
    return { ok: false, reason: "This sign-in link expired. Start again." };
  }
  if (!cookieValue) {
    return { ok: false, reason: "Missing sign-in session marker. Start again." };
  }
  const separator = cookieValue.indexOf(".");
  if (separator < 0) {
    return { ok: false, reason: "Malformed sign-in session marker." };
  }
  const cookieState = cookieValue.slice(0, separator);
  const signature = cookieValue.slice(separator + 1);
  if (!cookieState || !signature || !constantTimeEqual(cookieState, state)) {
    return { ok: false, reason: "Sign-in session mismatch. Start again." };
  }
  if (!constantTimeEqual(signature, signState(brandCode, state))) {
    return { ok: false, reason: "Sign-in signature mismatch. Start again." };
  }
  if (pending.brandCode !== brandCode.toUpperCase()) {
    return { ok: false, reason: "Sign-in started for a different business." };
  }
  const { verifier, createdAt, ...rest } = pending;
  void createdAt;
  return { ok: true, pending: rest, verifier };
}

/** Test helper — drops any in-flight authorizations. */
export function resetAuthorizationStore(): void {
  store.clear();
}

export function pendingAuthorizationCount(): number {
  return store.size;
}
