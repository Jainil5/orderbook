import type { Payment } from "@/types/database";
import { formatDate, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

function paymentStatusTone(status: string) {
  if (status === "paid") return "success" as const;
  if (status === "pending") return "warning" as const;
  if (status === "failed") return "danger" as const;
  return "neutral" as const;
}

export function AnalyticsPaymentsTable({
  payments,
  currencyCode,
  emptyDescription,
}: {
  payments: Payment[];
  currencyCode: string;
  emptyDescription?: string;
}) {
  if (payments.length === 0) {
    return (
      <EmptyState
        title="No payment records"
        description={
          emptyDescription ??
          "Payment rows appear here when orders are marked paid and payments are recorded."
        }
      />
    );
  }

  return (
    <>
      <ul className="space-y-3 md:hidden">
        {payments.map((p) => (
          <li key={p.id} className="ob-card p-4">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{p.method}</span>
              <span className="font-semibold">
                {formatMoney(p.amount, currencyCode)}
              </span>
            </div>
            <div className="mt-2 flex justify-between gap-2 text-xs">
              <Badge tone={paymentStatusTone(p.status)}>{p.status}</Badge>
              <span className="text-[var(--ob-text-muted)]">
                {formatDate(p.created_at)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="ob-scroll-x ob-card hidden md:block">
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
                {formatMoney(p.amount, currencyCode)}
              </td>
              <td className="px-4 py-3">
                <Badge tone={paymentStatusTone(p.status)}>{p.status}</Badge>
              </td>
              <td className="px-4 py-3">{formatDate(p.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
