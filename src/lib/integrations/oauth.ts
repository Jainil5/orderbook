import { cookies } from "next/headers";
import { getGoogleOAuthConfig } from "./config";
import { assertSafeScopes, googleConsentScopes } from "./registry";
import {
  OAUTH_COOKIE,
  beginAuthorization,
  consumeAuthorization,
} from "./oauth-state";
import { saveConnection } from "./vault";
import type { IntegrationId } from "@/types/integrations";

/**
 * Google OAuth (authorization code + PKCE) entirely server-side.
 *
 * What the browser ever sees: the URL of the consent screen, and afterwards a
 * status message plus a masked account label. The client secret, the code, the
 * verifier, the state record and both tokens stay on the server.
 */

const GOOGLE_INTEGRATIONS: IntegrationId[] = ["google_calendar", "gmail"];

export function googleIntegrationIds(): IntegrationId[] {
  return GOOGLE_INTEGRATIONS;
}

export type StartResult =
  | { ok: true; url: string; cookieValue: string }
  | { ok: false; message: string };

/**
 * `integration` is the row the user clicked; consent is requested for the
 * Google rows so one approval covers calendar and mail. A deployment that
 * wants them separate can pass a single-element list here later.
 */
export async function startGoogleAuthorization(input: {
  brandCode: string;
  brandId: string;
  integration: IntegrationId;
}): Promise<StartResult> {
  const config = getGoogleOAuthConfig();
  if (!config) {
    return {
      ok: false,
      message:
        "Google sign-in is not configured on this server. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and NEXT_PUBLIC_APP_URL.",
    };
  }
  const scopes = googleConsentScopes(GOOGLE_INTEGRATIONS);
  assertSafeScopes(scopes);

  const start = beginAuthorization({
    brandCode: input.brandCode,
    brandId: input.brandId,
    integration: input.integration,
  });

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state: start.state,
    code_challenge: start.challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });

  return {
    ok: true,
    url: `${config.authUrl}?${params}`,
    cookieValue: start.cookieValue,
  };
}

/** The signed state cookie is cleared whatever happens to the callback. */
export async function clearOAuthCookie(): Promise<void> {
  const store = await cookies();
  store.delete(OAUTH_COOKIE);
}

export type CallbackInput = {
  brandCode: string;
  code: string | null;
  state: string | null;
  error: string | null;
  cookieValue: string | null | undefined;
};

export type CallbackResult =
  | { ok: true; message: string; accountLabel: string | null }
  | { ok: false; message: string };

/** "someone@corp.example" → "s***e@corp.example" — display only, never stored. */
export function maskEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = value.indexOf("@");
  if (at <= 0) return null;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return `${local.slice(0, 1)}***${local.slice(-1)}@${domain}`.slice(0, 80);
}

async function exchangeCode(
  code: string,
  verifier: string,
): Promise<{ ok: true; json: GoogleTokenResponse } | { ok: false; message: string }> {
  const config = getGoogleOAuthConfig();
  if (!config) return { ok: false, message: "Google is not configured on this server." };
  if (!code || code.length > 2048) return { ok: false, message: "Missing authorisation code." };

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  });

  try {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return {
        ok: false,
        message: "Google did not accept the authorisation code. Start the connection again.",
      };
    }
    const json = (await response.json()) as GoogleTokenResponse;
    if (typeof json.access_token !== "string" || json.access_token.length === 0) {
      return { ok: false, message: "Google did not return an access token." };
    }
    return { ok: true, json };
  } catch {
    return { ok: false, message: "Could not reach Google to complete the connection." };
  }
}

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
};

/**
 * Reads the email claim out of the ID token for a display label only. We
 * verify nothing about it (no signature check) because it is not used for any
 * authorisation decision — the account label is cosmetic and is masked.
 */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { email?: unknown };
    return typeof decoded.email === "string" ? decoded.email : null;
  } catch {
    return null;
  }
}

export async function completeGoogleAuthorization(
  input: CallbackInput,
): Promise<CallbackResult> {
  if (input.error) {
    return {
      ok: false,
      message:
        input.error === "access_denied"
          ? "Google sign-in was cancelled, so nothing was connected."
          : "Google reported an error while connecting.",
    };
  }

  const consumed = consumeAuthorization(input.state, input.brandCode, input.cookieValue);
  if (!consumed.ok) return { ok: false, message: consumed.reason };
  if (!input.code) {
    return { ok: false, message: "Google did not send an authorisation code." };
  }

  const exchanged = await exchangeCode(input.code, consumed.verifier);
  if (!exchanged.ok) return exchanged;

  const account = maskEmail(emailFromIdToken(exchanged.json.id_token));
  const granted = (exchanged.json.scope ?? "")
    .split(" ")
    .filter(Boolean);
  assertSafeScopes(granted);

  const expiresAt =
    Date.now() + Math.max((exchanged.json.expires_in ?? 3600) - 60, 60) * 1000;
  const refresh = exchanged.json.refresh_token ?? null;

  // One consent covers the Google rows, so both get a connection record; the
  // calendar row starts with no selected calendar until the user picks one.
  const written: IntegrationId[] = [];
  for (const id of GOOGLE_INTEGRATIONS) {
    const result = await saveConnection(input.brandCode, id, {
      accessToken: exchanged.json.access_token!,
      refreshToken: refresh,
      scope: granted.join(" "),
      expiresAt,
      account,
      calendarId: null,
    });
    if (result.ok) written.push(id);
  }

  if (written.length === 0) {
    return {
      ok: false,
      message:
        "Google approved the request, but the connection could not be stored. Check INTEGRATION_ENCRYPTION_KEY.",
    };
  }

  return {
    ok: true,
    message: `Connected${account ? ` as ${account}` : ""}.`,
    accountLabel: account,
  };
}
