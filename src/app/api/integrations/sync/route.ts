import { NextResponse, type NextRequest } from "next/server";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { toDemoBrandCode } from "@/lib/demo/data";
import { syncIntegration } from "@/lib/integrations/sync";
import { isIntegrationId } from "@/lib/integrations/registry";

/**
 * POST /api/integrations/sync  { integration: "google_calendar" | "gmail" }
 *
 * Same import the in-app "Sync now" button runs, exposed for scheduled jobs.
 * It is still session-guarded and rate-limited: this phase has no service
 * credential, so an unauthenticated sync endpoint does not exist.
 */

export async function POST(request: NextRequest) {
  const ws = await loadWorkspaceSession();
  if (!ws) {
    return NextResponse.json({ ok: false, message: "Not signed in." }, { status: 401 });
  }
  if (!["owner", "admin", "manager"].includes(ws.role)) {
    return NextResponse.json(
      { ok: false, message: "Not allowed to sync external calendars." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as { integration?: unknown } | null;
  const integration = body?.integration;
  if (!isIntegrationId(integration)) {
    return NextResponse.json(
      { ok: false, message: "Set integration to google_calendar or gmail." },
      { status: 400 },
    );
  }

  const limit = consumeRateLimit(`integrations:sync:${ws.brand.code}`, 6, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, message: `Try again in ${limit.retryAfterSec} seconds.` },
      { status: 429 },
    );
  }

  const code = toDemoBrandCode(ws.brand.code);
  // The calendar to read from is chosen on the integrations screen and stored
  // in prefs, so a scheduled job cannot point this brand at an arbitrary one.
  const outcome = await syncIntegration(code, ws.brand.id, integration, new Date());

  return NextResponse.json(
    {
      ok: outcome.ok,
      integration: outcome.integration,
      imported: outcome.imported,
      refreshed: outcome.refreshed,
      skipped: outcome.skipped,
      notConfigured: outcome.notConfigured,
      message: outcome.message,
    },
    { status: outcome.ok ? 200 : outcome.notConfigured ? 503 : 502 },
  );
}
