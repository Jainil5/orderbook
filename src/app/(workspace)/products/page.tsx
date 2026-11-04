import { PageShell } from "@/components/workspace/page-shell";
import { listDemoProducts } from "@/lib/demo/data";
import { listProducts } from "@/services/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { redirect } from "next/navigation";

export default async function ProductsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode === "demo") {
    const products = listDemoProducts({ activeOnly: false });
    return (
      <PageShell title="Products">
        <div className="overflow-x-auto ob-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--ob-border)] text-xs uppercase text-[var(--ob-text-muted)]">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-[var(--ob-border)]">
                  <td className="px-4 py-3">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-[var(--ob-text-muted)]">
                      {p.description}
                    </p>
                  </td>
                  <td className="px-4 py-3">{p.sku ?? "—"}</td>
                  <td className="px-4 py-3">{p.category ?? "Uncategorized"}</td>
                  <td className="px-4 py-3">
                    {formatMoney(p.price, ws.settings.currency_code)}
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
      </PageShell>
    );
  }

  const { data, error } = await listProducts({ activeOnly: false });

  return (
    <PageShell title="Products">
      {error ? (
        <p className="mb-4 text-sm text-[var(--ob-danger)]">{error}</p>
      ) : null}
      {data.length === 0 ? (
        <EmptyState title="No products" />
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
                    {formatMoney(p.price, ws.settings.currency_code)}
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
    </PageShell>
  );
}
