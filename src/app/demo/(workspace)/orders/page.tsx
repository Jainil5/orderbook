"use client";

import Link from "next/link";
import { DemoPageShell } from "@/components/workspace/demo-page-shell";
import { listDemoOrders } from "@/lib/demo/data";
import { formatDate, formatMoney } from "@/lib/format";
import { useDemoWorkspace } from "@/components/workspace/demo-workspace-provider";
import { Badge } from "@/components/ui/badge";

export default function DemoOrdersPage() {
  const { settings } = useDemoWorkspace();
  const orders = listDemoOrders();

  return (
    <DemoPageShell title="Orders">
      <div className="overflow-x-auto ob-card">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--ob-border)] text-xs uppercase text-[var(--ob-text-muted)]">
            <tr>
              <th className="px-4 py-3">Bill #</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-[var(--ob-border)]">
                <td className="px-4 py-3">
                  <Link
                    className="font-medium text-[var(--ob-primary)] hover:underline"
                    href={`/demo/orders/${o.id}`}
                  >
                    {o.order_number}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {o.customer_name_snapshot ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {formatMoney(o.grand_total, settings.currency_code)}
                </td>
                <td className="px-4 py-3">
                  <Badge tone="success">{o.payment_status}</Badge>
                </td>
                <td className="px-4 py-3">{formatDate(o.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoPageShell>
  );
}
