/**
 * Server-only view of the credentials the integration layer needs.
 *
 * Nothing here is read at module scope: every getter is called per request so
 * `next build` never bakes a value into a prerendered page, and a deployment
 * without credentials simply reports `not_configured` instead of failing.
 *
 * Variable names (never values) are safe to show an operator; `envContract()`
 * is the only function the UI may use for that.
 */

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API_BASE = "https://www.googleapis.com";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function placeholder(value: string | undefined): boolean {
  if (!value) return true;
  return /your[-_]|changeme|placeholder|xxx/i.test(value);
}

export function appOrigin(): string | null {
  const raw =
    readEnv("NEXT_PUBLIC_APP_URL") ??
    readEnv("APP_URL") ??
    readEnv("VERCEL_PROJECT_PRODUCTION_URL");
  if (!raw) return null;
  const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    // Only the origin may end up in an OAuth redirect target.
    return url.origin;
  } catch {
    return null;
  }
}

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  /** Derived from the app origin so the value always matches a registered one. */
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  apiBase: string;
};

export function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = readEnv("GOOGLE_CLIENT_ID");
  const clientSecret = readEnv("GOOGLE_CLIENT_SECRET");
  if (placeholder(clientId) || placeholder(clientSecret)) return null;
  const origin = appOrigin();
  if (!origin) return null;
  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    redirectUri: `${origin}/api/integrations/google/callback`,
    authUrl: GOOGLE_AUTH_BASE,
    tokenUrl: GOOGLE_TOKEN_URL,
    apiBase: GOOGLE_API_BASE,
  };
}

/** 32-byte key (64 hex chars) used for the token vault; absent = vault disabled. */
export function getVaultKey(): Buffer | null {
  const raw = readEnv("INTEGRATION_ENCRYPTION_KEY");
  if (!raw || placeholder(raw)) return null;
  const hex = raw.replace(/^hex:/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return Buffer.from(hex, "hex");
}

export function getWhatsAppConfig(): {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
} | null {
  const accessToken = readEnv("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = readEnv("WHATSAPP_PHONE_NUMBER_ID");
  if (placeholder(accessToken) || placeholder(phoneNumberId)) return null;
  return {
    accessToken: accessToken!,
    phoneNumberId: phoneNumberId!,
    apiVersion: readEnv("WHATSAPP_API_VERSION") ?? "v21.0",
  };
}

export type IntegrationConfiguration = {
  google: boolean;
  vault: boolean;
  whatsapp: boolean;
};

export function readIntegrationConfiguration(): IntegrationConfiguration {
  return {
    google: getGoogleOAuthConfig() !== null,
    vault: getVaultKey() !== null,
    whatsapp: getWhatsAppConfig() !== null,
  };
}

/** Names only — what an operator must set. Rendered on the integrations page. */
export function envContract(): { name: string; purpose: string; required: boolean }[] {
  return [
    {
      name: "GOOGLE_CLIENT_ID",
      purpose: "OAuth client from Google Cloud Console",
      required: true,
    },
    {
      name: "GOOGLE_CLIENT_SECRET",
      purpose: "OAuth client secret (server-only)",
      required: true,
    },
    {
      name: "NEXT_PUBLIC_APP_URL",
      purpose: "Origin used to build the OAuth redirect URI",
      required: true,
    },
    {
      name: "INTEGRATION_ENCRYPTION_KEY",
      purpose: "64 hex chars — AES-256-GCM key for the token vault",
      required: true,
    },
    {
      name: "WHATSAPP_ACCESS_TOKEN",
      purpose: "Meta Cloud API token for WhatsApp messaging",
      required: false,
    },
    {
      name: "WHATSAPP_PHONE_NUMBER_ID",
      purpose: "Meta phone number that sends the messages",
      required: false,
    },
  ];
}
