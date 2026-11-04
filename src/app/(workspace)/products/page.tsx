import { LivePageShell } from "@/components/workspace/live-page-shell";
import { listProducts } from "@/services/data";
import { loadLiveWorkspace } from "@/lib/auth/actions";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export default async function ProductsPage() {
  const ws = await loadLiveWorkspace();
  const { data, error } = await listProducts({ activeOnly: false });

  return (
    <LivePageShell title="Products">
      {error ? (
        <p className="mb-4 text-sm text-[var(--ob-danger)]">{error}</p>
      ) : null}
      {data.length === 0 ? (
        <EmptyState
          title="No products"
          description="Add products in Supabase or use the product form once write policies are enabled."
        />
      ) : (
        <div className="overflow-x-auto ob-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--ob-border)] text-xs uppercase text-[var(--ob-text-muted)]">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-b border-[var(--ob-border)]">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">{p.category ?? "Uncategorized"}</td>
                  <td className="px-4 py-3">
                    {formatMoney(p.price, ws?.settings.currency_code)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={p.is_active ? "success" : "neutral"}>
                      {p.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-4 text-sm text-[var(--ob-text-muted)]">
        Product create/edit forms will bind to Supabase mutations when schema and
        RLS are confirmed.
      </p>
    </LivePageShell>
  );
}
