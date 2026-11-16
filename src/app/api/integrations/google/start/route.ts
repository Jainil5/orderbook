import { NextResponse, type NextRequest } from "next/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { startGoogleAuthorization } from "@/lib/integrations/oauth";
import { OAUTH_COOKIE } from "@/lib/integrations/oauth-state";
import { isIntegrationId } from "@/lib/integrations/registry";
import type { IntegrationId } from "@/types/integrations";

/**
 * GET /api/integrations/google/start?integration=google_calendar
 *
 * Starts the server-side OAuth handshake and 302s to Google. The client never
 * sees the client secret, the verifier or the state record — it only gets the
 * signed `ob_oauth_txn` cookie that the callback compares Google's `state`
 * against.
 */

export async function GET(request: NextRequest) {
  const ws = await loadWorkspaceSession();
  if (!ws) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", "/manager/productivity/integrations");
    return NextResponse.redirect(url);
  }

  if (!["owner", "admin", "manager"].includes(ws.role)) {
    return NextResponse.json(
      { ok: false, message: "Only owners, admins and managers can connect accounts." },
      { status: 403 },
    );
  }

  const requested = request.nextUrl.searchParams.get("integration");
  const integration: IntegrationId = isIntegrationId(requested)
    ? requested
    : "google_calendar";
  if (integration === "whatsapp" || integration === "outlook") {
    return NextResponse.json(
      { ok: false, message: "That channel does not use Google sign-in." },
      { status: 400 },
    );
  }

  const limit = consumeRateLimit(`integrations:start:${ws.brand.code}`, 5, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        ok: false,
        message: `Too many connection attempts. Try again in ${limit.retryAfterSec} seconds.`,
      },
      { status: 429 },
    );
  }

  const start = await startGoogleAuthorization({
    brandCode: ws.brand.code,
    brandId: ws.brand.id,
    integration,
  });
  if (!start.ok) {
    const url = request.nextUrl.clone();
    url.pathname = "/manager/productivity/integrations";
    url.search = "";
    url.searchParams.set("notice", "not_configured");
    const response = NextResponse.redirect(url);
    response.cookies.delete(OAUTH_COOKIE);
    return response;
  }

  const response = NextResponse.redirect(start.url);
  response.cookies.set(OAUTH_COOKIE, start.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: request.nextUrl.protocol === "https:",
    maxAge: 600,
  });
  // The state record is bound to this brand code, which the callback re-reads
  // from the workspace session rather than from a query parameter.
  return response;
}
