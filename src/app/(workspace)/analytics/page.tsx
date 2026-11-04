import { LivePageShell } from "@/components/workspace/live-page-shell";
import { EmptyState } from "@/components/ui/empty-state";

export default function AnalyticsPage() {
  return (
    <LivePageShell title="Analytics">
      <EmptyState
        title="Analytics not configured"
        description="Provision secured Postgres views or RPCs (see docs/DATABASE_CONTRACT.md) so aggregates run server-side under RLS."
      />
    </LivePageShell>
  );
}
