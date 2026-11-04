import Link from "next/link";
import { LivePageShell } from "@/components/workspace/live-page-shell";
import { listCustomers } from "@/services/data";
import { EmptyState } from "@/components/ui/empty-state";

export default async function CustomersPage() {
  const { data, error } = await listCustomers();

  return (
    <LivePageShell title="Customers">
      {error ? (
        <p className="mb-4 text-sm text-[var(--ob-danger)]">{error}</p>
      ) : null}
      {data.length === 0 ? (
        <EmptyState title="No customers" />
      ) : (
        <div className="overflow-x-auto ob-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--ob-border)] text-xs uppercase text-[var(--ob-text-muted)]">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Contact</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id} className="border-b border-[var(--ob-border)]">
                  <td className="px-4 py-3">
                    <Link
                      href={`/customers/${c.id}`}
                      className="font-medium text-[var(--ob-primary)]"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </LivePageShell>
  );
}
