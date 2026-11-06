"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Offer } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { saveOfferAction } from "@/services/operations-actions";
import { canEditWorkspaceFeatures } from "@/lib/workspace/settings-access";
import { useWorkspace } from "@/components/workspace/workspace-provider";

export function OffersManager({
  initialOffers,
  loadError,
}: {
  initialOffers: Offer[];
  loadError?: string;
}) {
  const ws = useWorkspace();
  const router = useRouter();
  const canEdit = ws.mode === "demo" || canEditWorkspaceFeatures(ws);
  const [offers] = useState(initialOffers);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [value, setValue] = useState("10");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...offers].sort((a, b) => a.name.localeCompare(b.name)),
    [offers],
  );

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setFeedback(null);
    const num = Number(value);
    const result = await saveOfferAction({
      name,
      code,
      discount_type: "percent",
      discount_value: num,
      scope: "order",
      is_active: true,
    });
    setBusy(false);
    if (result.ok) {
      setName("");
      setCode("");
      router.refresh();
    } else {
      setFeedback("message" in result ? result.message : "Could not save.");
    }
  }

  return (
    <div className="space-y-6">
      {loadError ? (
        <p className="text-sm text-[var(--ob-danger)]">{loadError}</p>
      ) : null}
      {canEdit ? (
        <form
          onSubmit={onCreate}
          className="ob-card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Input
            placeholder="Offer name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            placeholder="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <Input
            placeholder="Percent off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
          <Button type="submit" loading={busy}>
            Add offer
          </Button>
          {feedback ? (
            <p className="sm:col-span-2 text-sm text-[var(--ob-danger)]">
              {feedback}
            </p>
          ) : null}
        </form>
      ) : null}
      <div className="space-y-3">
        {sorted.map((o) => (
          <div key={o.id} className="ob-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{o.name}</p>
                <p className="text-sm text-[var(--ob-text-muted)]">
                  Code {o.code} · {o.discount_value}
                  {o.discount_type === "percent" ? "%" : " fixed"} ·{" "}
                  {o.scope}
                  {o.scope_value ? ` (${o.scope_value})` : ""}
                </p>
                <p className="text-xs text-[var(--ob-text-muted)]">
                  Redeemed {o.redemption_count}
                  {o.usage_limit != null ? ` / ${o.usage_limit}` : ""}
                </p>
              </div>
              <Badge tone={o.is_active ? "success" : "neutral"}>
                {o.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
