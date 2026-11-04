import { LivePageShell } from "@/components/workspace/live-page-shell";
import { listOffers } from "@/services/data";
import { EmptyState } from "@/components/ui/empty-state";

export default async function OffersPage() {
  const { data, error } = await listOffers();

  return (
    <LivePageShell title="Offers">
      {error ? (
        <p className="mb-4 text-sm text-[var(--ob-danger)]">{error}</p>
      ) : null}
      {data.length === 0 ? (
        <EmptyState
          title="No offers"
          description="Offers appear when the offers table is provisioned for your brand."
        />
      ) : (
        <ul className="space-y-3">
          {data.map((o) => (
            <li key={o.id} className="ob-card p-4">
              <p className="font-semibold">{o.name}</p>
            </li>
          ))}
        </ul>
      )}
    </LivePageShell>
  );
}
