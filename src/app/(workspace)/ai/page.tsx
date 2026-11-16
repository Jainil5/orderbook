import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/workspace/page-shell";
import { AiWorkspace } from "@/components/ai/ai-workspace";
import { loadAiWorkspaceView } from "@/lib/ai/loader";
import { loadWorkspaceSession } from "@/lib/workspace/session";

/**
 * OrderBook AI.
 *
 * Demo workspaces get the full insight engine. Live workspaces get the honest
 * answer instead of a pretending screen: the Manager collections have no
 * Supabase readers yet, so there is nothing grounded to reason over, and the
 * same `guardBusinessOps()` that refuses writes here refuses them in the
 * actions. No LLM credentials exist in this build, so nothing here can call a
 * model even if a request came in.
 */
export default async function OrderBookAiPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode !== "demo") {
    return (
      <PageShell title="OrderBook AI">
        <EmptyState
          title="OrderBook AI runs on demo workspaces for now"
          description="Every insight, recommendation and proposal is computed from this workspace's own records. The live Supabase tables behind the Manager collections are not wired up yet, so a live workspace has nothing grounded to read — and there is no model configured to fill the gap with invented text. Open a demo workspace to see it work."
        />
      </PageShell>
    );
  }

  const view = await loadAiWorkspaceView(ws.brand.code);

  return (
    <PageShell
      title="OrderBook AI"
      headerActions={
        <Badge tone={view.provider.status === "configured" ? "success" : "demo"}>
          {view.provider.status === "configured"
            ? "Model configured, not used"
            : "No model configured"}
        </Badge>
      }
    >
      <AiWorkspace view={view} />
    </PageShell>
  );
}
