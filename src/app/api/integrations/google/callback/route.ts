import { NextResponse, type NextRequest } from "next/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { completeGoogleAuthorization } from "@/lib/integrations/oauth";
import { OAUTH_COOKIE } from "@/lib/integrations/oauth-state";

/**
 * GET /api/integrations/google/callback?code=...&state=...
 *
 * Validates `state` against the signed transaction cookie, exchanges the code
 * on the official Google token endpoint, and stores the resulting tokens in
 * the server-side encrypted vault. Everything the browser gets back is a
 * same-origin redirect with a short status message — never a token, a code,
 * or a raw provider error body.
 */

const INTEGRATIONS_PATH = "/manager/productivity/integrations";

/** `notice` is a fixed code; `detail` is display text we wrote ourselves. */
function back(
  request: NextRequest,
  notice: string,
  detail?: string,
): NextResponse {
  const url = new URL(INTEGRATIONS_PATH, request.nextUrl.origin);
  url.searchParams.set("notice", notice);
  if (detail) url.searchParams.set("detail", detail.slice(0, 180));
  const response = NextResponse.redirect(url);
  response.cookies.delete(OAUTH_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const ws = await loadWorkspaceSession();
  if (!ws) {
    const url = new URL("/login", request.nextUrl.origin);
    url.searchParams.set("next", INTEGRATIONS_PATH);
    return NextResponse.redirect(url);
  }

  if (!["owner", "admin", "manager"].includes(ws.role)) {
    return back(request, "not_allowed");
  }

  const limit = consumeRateLimit(
    `integrations:callback:${ws.brand.code}`,
    10,
    60_000,
  );
  if (!limit.allowed) {
    return back(request, "too_many_attempts");
  }

  const result = await completeGoogleAuthorization({
    brandCode: ws.brand.code,
    code: request.nextUrl.searchParams.get("code"),
    state: request.nextUrl.searchParams.get("state"),
    error: request.nextUrl.searchParams.get("error"),
    cookieValue: request.cookies.get(OAUTH_COOKIE)?.value,
  });

  if (!result.ok) return back(request, "failed", result.message);
  return back(request, "connected", result.accountLabel ?? undefined);
}
