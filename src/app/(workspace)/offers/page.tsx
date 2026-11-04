import { PageShell } from "@/components/workspace/page-shell";
import { listDemoOffers } from "@/lib/demo/data";
import { listOffers } from "@/services/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { redirect } from "next/navigation";

export default async function OffersPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode === "demo") {
    const offers = listDemoOffers();
    return (
      <PageShell title="Offers">
        <div className="space-y-3">
          {offers.map((o) => (
            <div key={o.id} className="ob-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">{o.name}</p>
                  <p className="text-sm text-[var(--ob-text-muted)]">
                    Code {o.code} · {o.discount_value}
                    {o.discount_type === "percent" ? "%" : " fixed"}
                  </p>
                </div>
                <Badge tone="success">Active</Badge>
              </div>
            </div>
          ))}
        </div>
      </PageShell>
    );
  }

  const { data, error } = await listOffers();

  return (
    <PageShell title="Offers">
      {error ? (
        <p className="mb-4 text-sm text-[var(--ob-danger)]">{error}</p>
      ) : null}
      {data.length === 0 ? (
        <EmptyState title="No offers" />
      ) : (
        <ul className="space-y-3">
          {data.map((o) => (
            <li key={o.id} className="ob-card p-4">
              <p className="font-semibold">{o.name}</p>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
