import { LivePageShell } from "@/components/workspace/live-page-shell";
import { Card } from "@/components/ui/card";
import { loadLiveWorkspace } from "@/lib/auth/actions";

export default async function DashboardPage() {
  const ws = await loadLiveWorkspace();

  return (
    <LivePageShell title="Dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {["Net sales", "Orders", "Avg. order value", "Pending payments"].map(
          (label) => (
            <Card key={label}>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
                {label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ob-text-muted)]">
                —
              </p>
            </Card>
          ),
        )}
      </div>
      <Card className="mt-6">
        <p className="text-sm text-[var(--ob-text-secondary)]">
          Connected as <strong>{ws?.brand.name}</strong> ({ws?.brand.code}).
          Analytics RPCs or secured views are required before KPIs populate. See{" "}
          <code className="text-xs">docs/DATABASE_CONTRACT.md</code>.
        </p>
      </Card>
    </LivePageShell>
  );
}
