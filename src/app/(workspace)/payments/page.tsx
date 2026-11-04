import { PageShell } from "@/components/workspace/page-shell";
import { listDemoPayments } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { formatDate, formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { redirect } from "next/navigation";

export default async function PaymentsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode === "demo") {
    const payments = listDemoPayments();
    return (
      <PageShell title="Payments">
        <div className="overflow-x-auto ob-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--ob-border)] text-xs uppercase text-[var(--ob-text-muted)]">
              <tr>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-[var(--ob-border)]">
                  <td className="px-4 py-3">{p.method}</td>
                  <td className="px-4 py-3">
                    {formatMoney(p.amount, ws.settings.currency_code)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="success">{p.status}</Badge>
                  </td>
                  <td className="px-4 py-3">{formatDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Payments">
      <EmptyState
        title="Payments list pending schema"
        description="Connect the payments table under RLS to list settlement records here."
      />
    </PageShell>
  );
}
