import { loadLiveWorkspace } from "@/lib/auth/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getGoogleOAuthConfig, getVaultKey } from "./config";
import {
  decryptSecret,
  decryptToken,
  encryptSecret,
  encryptToken,
  type StoredToken,
  type VaultBackend,
} from "./crypto";
import type { IntegrationId } from "@/types/integrations";

/**
 * Where a connection's encrypted token actually lives. See `crypto.ts` for the
 * format; this module only decides the backend and never returns plaintext to
 * a caller that is about to render something.
 *
 * `brand_integrations` (documented in docs/DATABASE_CONTRACT.md):
 *   brand_id uuid references brands(id) on delete cascade
 *   integration text            -- google_calendar | gmail | whatsapp | outlook
 *   account_label text          -- display only, never a credential
 *   scopes text[]               -- granted scopes, for display/audit
 *   token_cipher text           -- `v1.<iv>.<tag>.<ciphertext>` (us)
 *   refresh_cipher text         -- same format
 *   expires_at timestamptz
 *   calendar_id text
 *   status text
 *   updated_at timestamptz
 * RLS: owner/manager membership only, and the cipher columns are not
 * selected by any client query — only these server helpers read them.
 */

const memory = new Map<string, { tokenCipher: string; refreshCipher: string }>();

export type VaultStatus = {
  backend: VaultBackend;
  /** Encryption key present — without it, connecting is refused outright. */
  canStore: boolean;
  note: string;
};

function keyRequired(): Buffer | null {
  return getVaultKey();
}

export function describeVault(live: boolean): VaultStatus {
  const key = keyRequired();
  if (!key) {
    return {
      backend: "unavailable",
      canStore: false,
      note: "Set INTEGRATION_ENCRYPTION_KEY (64 hex chars) before connecting an account.",
    };
  }
  if (live) {
    return {
      backend: "supabase",
      canStore: true,
      note: "Tokens are encrypted at rest in brand_integrations.",
    };
  }
  return {
    backend: "process_memory",
    canStore: true,
    note: "Demo mode keeps tokens in this server process only — they are never stored in a cookie and are lost when the server restarts.",
  };
}

async function resolveBackend(): Promise<{
  status: VaultStatus;
  brandId: string | null;
}> {
  const live = await loadLiveWorkspace();
  const status = describeVault(Boolean(live));
  return { status, brandId: live?.brand.id ?? null };
}

function memoryKey(brandCode: string, integration: IntegrationId): string {
  return `${brandCode.toUpperCase()}|${integration}`;
}

export type WriteResult = { ok: true } | { ok: false; message: string };

export async function saveConnection(
  brandCode: string,
  integration: IntegrationId,
  token: StoredToken,
): Promise<WriteResult> {
  const key = keyRequired();
  if (!key) {
    return {
      ok: false,
      message:
        "Connection refused: no encryption key is configured, so credentials cannot be stored safely.",
    };
  }
  const { status, brandId } = await resolveBackend();
  if (!status.canStore) return { ok: false, message: status.note };

  const tokenCipher = encryptToken(token, key);
  const refreshCipher = token.refreshToken
    ? encryptSecret(token.refreshToken, key)
    : null;
  const scopes = token.scope ? token.scope.split(" ").filter(Boolean) : [];

  if (status.backend === "supabase" && brandId) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("brand_integrations").upsert(
      {
        brand_id: brandId,
        integration,
        account_label: token.account,
        scopes,
        token_cipher: tokenCipher,
        refresh_cipher: refreshCipher,
        expires_at: new Date(token.expiresAt).toISOString(),
        calendar_id: token.calendarId,
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "brand_id,integration" },
    );
    if (error) {
      return {
        ok: false,
        message: "Could not store the connection. Check the brand_integrations migration.",
      };
    }
    return { ok: true };
  }

  memory.set(memoryKey(brandCode, integration), {
    tokenCipher,
    refreshCipher: refreshCipher ?? "",
  });
  return { ok: true };
}

type LoadedRow = {
  token_cipher: string | null;
  refresh_cipher: string | null;
};

async function loadRow(
  brandCode: string,
  integration: IntegrationId,
): Promise<LoadedRow | null> {
  const { status, brandId } = await resolveBackend();
  if (status.backend === "supabase" && brandId) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("brand_integrations")
      .select("token_cipher,refresh_cipher")
      .eq("brand_id", brandId)
      .eq("integration", integration)
      .maybeSingle();
    if (error || !data) return null;
    return data as LoadedRow;
  }
  const row = memory.get(memoryKey(brandCode, integration));
  return row ? { token_cipher: row.tokenCipher, refresh_cipher: row.refreshCipher } : null;
}

/** Server-only. Never call this from anything that renders. */
export async function loadStoredToken(
  brandCode: string,
  integration: IntegrationId,
): Promise<StoredToken | null> {
  const key = keyRequired();
  if (!key) return null;
  const row = await loadRow(brandCode, integration);
  if (!row?.token_cipher) return null;
  const token = decryptToken(row.token_cipher, key);
  if (!token) return null;
  if (row.refresh_cipher) {
    // The refresh token is a bare secret (`encryptSecret`), not a token object.
    const refresh = decryptSecret(row.refresh_cipher, key);
    if (refresh) token.refreshToken = refresh;
  }
  return token;
}

/** True when a stored connection exists — safe to surface in the UI. */
export async function hasStoredConnection(
  brandCode: string,
  integration: IntegrationId,
): Promise<{ connected: boolean; account: string | null; scopes: string[] }> {
  const token = await loadStoredToken(brandCode, integration);
  if (!token) return { connected: false, account: null, scopes: [] };
  return {
    connected: true,
    account: token.account,
    scopes: token.scope ? token.scope.split(" ").filter(Boolean) : [],
  };
}

export async function forgetConnection(
  brandCode: string,
  integration: IntegrationId,
): Promise<WriteResult> {
  const { status, brandId } = await resolveBackend();
  if (status.backend === "supabase" && brandId) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from("brand_integrations")
      .delete()
      .eq("brand_id", brandId)
      .eq("integration", integration);
    if (error) return { ok: false, message: "Could not disconnect the account." };
    return { ok: true };
  }
  memory.delete(memoryKey(brandCode, integration));
  return { ok: true };
}

/** Store the calendar the brand picked for sync (non-secret column). */
export async function setSelectedCalendar(
  brandCode: string,
  integration: IntegrationId,
  calendarId: string | null,
): Promise<WriteResult> {
  const token = await loadStoredToken(brandCode, integration);
  if (!token) {
    return { ok: false, message: "Not connected." };
  }
  return saveConnection(brandCode, integration, { ...token, calendarId });
}

export type AccessTokenResult =
  | { ok: true; token: string; account: string | null; scopes: string[]; calendarId: string | null }
  | { ok: false; reason: "not_connected" | "no_credentials" | "refresh_failed"; message: string };

/**
 * Returns a usable access token, refreshing through the official token
 * endpoint when the cached one has expired. Refreshes are server-side only;
 * the caller gets a short-lived string it must not persist or render.
 */
export async function getAccessToken(
  brandCode: string,
  integration: IntegrationId,
): Promise<AccessTokenResult> {
  const config = getGoogleOAuthConfig();
  if (!config) {
    return {
      ok: false,
      reason: "no_credentials",
      message: "Google OAuth credentials are not configured on this server.",
    };
  }
  const stored = await loadStoredToken(brandCode, integration);
  if (!stored) {
    return {
      ok: false,
      reason: "not_connected",
      message: "This business has not connected that account yet.",
    };
  }

  const soon = Date.now() + 60_000;
  if (stored.expiresAt > soon) {
    return {
      ok: true,
      token: stored.accessToken,
      account: stored.account,
      scopes: stored.scope ? stored.scope.split(" ").filter(Boolean) : [],
      calendarId: stored.calendarId,
    };
  }

  if (!stored.refreshToken) {
    return {
      ok: false,
      reason: "refresh_failed",
      message: "The saved session expired. Reconnect the account.",
    };
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: stored.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  try {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      return {
        ok: false,
        reason: "refresh_failed",
        message: "Google rejected the saved session. Reconnect the account.",
      };
    }
    const json = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      scope?: string;
      refresh_token?: string;
    };
    if (!json.access_token) {
      return { ok: false, reason: "refresh_failed", message: "No token returned." };
    }
    const next: StoredToken = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? stored.refreshToken,
      scope: json.scope ?? stored.scope,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
      account: stored.account,
      calendarId: stored.calendarId,
    };
    await saveConnection(brandCode, integration, next);
    return {
      ok: true,
      token: next.accessToken,
      account: next.account,
      scopes: next.scope ? next.scope.split(" ").filter(Boolean) : [],
      calendarId: next.calendarId,
    };
  } catch {
    return {
      ok: false,
      reason: "refresh_failed",
      message: "Could not reach Google to refresh the session.",
    };
  }
}

/** Test helper — clears in-process demo connections. */
export function resetVaultMemory(): void {
  memory.clear();
}
