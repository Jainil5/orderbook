"use client";

import { DemoPageShell } from "@/components/workspace/demo-page-shell";
import { listDemoProducts } from "@/lib/demo/data";
import { formatMoney } from "@/lib/format";
import { useDemoWorkspace } from "@/components/workspace/demo-workspace-provider";
import { Badge } from "@/components/ui/badge";

export default function DemoProductsPage() {
  const { settings } = useDemoWorkspace();
  const products = listDemoProducts({ activeOnly: false });

  return (
    <DemoPageShell title="Products">
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
                  {formatMoney(p.price, settings.currency_code)}
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
    </DemoPageShell>
  );
}
