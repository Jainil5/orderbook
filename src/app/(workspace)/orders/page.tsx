import Link from "next/link";
import { LivePageShell } from "@/components/workspace/live-page-shell";
import { listOrders } from "@/services/data";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { formatDate, formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";

export default async function OrdersPage() {
  const ws = await loadLiveWorkspace();
  const { data, error } = await listOrders({ page: 1, pageSize: 20 });

  return (
    <LivePageShell title="Orders">
      {error ? (
        <p className="mb-4 text-sm text-[var(--ob-danger)]">{error}</p>
      ) : null}
      {data.length === 0 ? (
        <EmptyState
          title="No orders yet"
          description="Orders appear here once your Supabase schema and RLS are configured."
        />
      ) : (
        <div className="overflow-x-auto ob-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--ob-border)] text-xs uppercase text-[var(--ob-text-muted)]">
              <tr>
                <th className="px-4 py-3">Bill #</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.map((o) => (
                <tr key={o.id} className="border-b border-[var(--ob-border)]">
                  <td className="px-4 py-3">
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-medium text-[var(--ob-primary)]"
                    >
                      {o.order_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {o.customer_name_snapshot ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {formatMoney(o.grand_total, ws?.settings.currency_code)}
                  </td>
                  <td className="px-4 py-3">{formatDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </LivePageShell>
  );
}
