"use client";

import { DemoPageShell } from "@/components/workspace/demo-page-shell";
import { listDemoOffers } from "@/lib/demo/data";
import { Badge } from "@/components/ui/badge";

export default function DemoOffersPage() {
  const offers = listDemoOffers();

  return (
    <DemoPageShell title="Offers">
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
    </DemoPageShell>
  );
}
