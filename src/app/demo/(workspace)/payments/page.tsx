"use client";

import { DemoPageShell } from "@/components/workspace/demo-page-shell";
import { listDemoPayments } from "@/lib/demo/data";
import { formatDate, formatMoney } from "@/lib/format";
import { useDemoWorkspace } from "@/components/workspace/demo-workspace-provider";
import { Badge } from "@/components/ui/badge";

export default function DemoPaymentsPage() {
  const { settings } = useDemoWorkspace();
  const payments = listDemoPayments();

  return (
    <DemoPageShell title="Payments">
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
                  {formatMoney(p.amount, settings.currency_code)}
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
    </DemoPageShell>
  );
}
