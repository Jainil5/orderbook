import { LivePageShell } from "@/components/workspace/live-page-shell";
import { EmptyState } from "@/components/ui/empty-state";

export default function PaymentsPage() {
  return (
    <LivePageShell title="Payments">
      <EmptyState
        title="Payments list pending schema"
        description="Connect the payments table under RLS to list settlement records here."
      />
    </LivePageShell>
  );
}
