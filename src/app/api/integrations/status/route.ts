import { NextResponse } from "next/server";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadIntegrationsView } from "@/lib/integrations/service";

/**
 * GET /api/integrations/status
 *
 * Read-only, session-scoped probe of what is wired up. The response is built
 * from the same non-secret view model the page renders — statuses, granted
 * scope names, masked account labels, run log — and never includes a token,
 * a cipher payload or a client secret. Anything server-to-server that needs
 * more than this belongs behind a dedicated service credential, which this
 * phase does not have.
 */

export async function GET() {
  const ws = await loadWorkspaceSession();
  if (!ws) {
    return NextResponse.json(
      { ok: false, message: "Not signed in." },
      { status: 401 },
    );
  }

  const view = await loadIntegrationsView({
    code: toDemoBrandCode(ws.brand.code),
    role: ws.role,
    live: ws.mode === "live",
  });

  return NextResponse.json(
    {
      ok: true,
      workspaceMode: ws.mode,
      configured: view.configuration,
      vault: { backend: view.vault.backend, canStore: view.vault.canStore },
      connections: view.connections.map((connection) => ({
        id: connection.id,
        status: connection.status,
        accountLabel: connection.accountLabel,
        capabilities: connection.capabilities,
        scopes: connection.scopes,
      })),
      pendingActions: view.pendingActions.length,
      recentRuns: view.runs?.length ?? 0,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
