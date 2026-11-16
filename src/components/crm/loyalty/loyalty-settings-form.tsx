"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmPanel } from "@/components/crm/crm-ui";
import { LoyaltyField } from "@/components/crm/loyalty/loyalty-field";
import { pointsForOrder, redemptionValue } from "@/lib/crm/metrics";
import { formatMoney } from "@/lib/format";
import { saveLoyaltySettingsAction } from "@/services/crm-loyalty-actions";
import type { LoyaltyConfig, LoyaltyTier } from "@/types/crm";

type TierRow = { name: string; min: string; discount: string };

/**
 * Edits this brand's own `LoyaltyConfig`. The form is seeded from the stored
 * row, so a brand that earns 0.01 points per rupee sees 0.01 — never an
 * example taken from the code.
 *
 * The preview block runs the same `pointsForOrder` / `redemptionValue` the
 * server uses, over the values as typed, so what an owner sees is what saving
 * will do. The sample amount is a preview input only; it is never stored.
 */
export function LoyaltySettingsForm({
  config,
  currencyCode,
  sampleAmount,
}: {
  config: LoyaltyConfig;
  currencyCode: string;
  sampleAmount: number;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(config.enabled);
  const [earn, setEarn] = useState(String(config.earn_points_per_unit));
  const [redeem, setRedeem] = useState(String(config.redeem_value_per_point));
  const [expiry, setExpiry] = useState(
    config.expiry_days === null ? "" : String(config.expiry_days),
  );
  const [tiers, setTiers] = useState<TierRow[]>(
    config.tiers.map((tier) => ({
      name: tier.name,
      min: String(tier.min_lifetime_points),
      discount: tier.discount_percent === null ? "" : String(tier.discount_percent),
    })),
  );
  const [sample, setSample] = useState(
    sampleAmount > 0 ? String(Math.round(sampleAmount)) : "",
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error"; message: string }>({
    kind: "idle",
    message: "",
  });

  const money = (value: number) => formatMoney(value, currencyCode);
  const num = (value: string) => {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const previewTiers: LoyaltyTier[] = tiers
    .filter((row) => row.name.trim() !== "")
    .map((row) => ({
      name: row.name.trim(),
      min_lifetime_points: num(row.min),
      discount_percent: row.discount.trim() === "" ? null : num(row.discount),
    }));

  const draft: LoyaltyConfig = {
    enabled,
    earn_points_per_unit: num(earn),
    redeem_value_per_point: num(redeem),
    points: "floor",
    expiry_days: expiry.trim() === "" ? null : num(expiry),
    tiers: previewTiers,
  };

  const samplePoints = pointsForOrder(num(sample), draft);
  const sampleValue = redemptionValue(samplePoints, draft);
  const perPoint = draft.earn_points_per_unit > 0 ? 1 / draft.earn_points_per_unit : null;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await saveLoyaltySettingsAction({
      enabled,
      earn_points_per_unit: earn,
      redeem_value_per_point: redeem,
      expiry_days: expiry,
      tiers: tiers.map((row) => ({
        name: row.name,
        min_lifetime_points: row.min,
        discount_percent: row.discount,
      })),
    });
    setBusy(false);
    if (result.ok) {
      setStatus({ kind: "ok", message: result.message ?? "Saved." });
      router.refresh();
    } else {
      setStatus({ kind: "error", message: result.message });
    }
  }

  return (
    <CrmPanel
      title="Loyalty configuration"
      meta={enabled ? "Saved as: switched on" : "Saved as: switched off"}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="ob-touch-target flex items-start gap-3 rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--crm-lab-strong)]"
            aria-label="Loyalty programme switched on"
          />
          <span>
            <span className="font-medium">Loyalty programme switched on</span>
            <span className="mt-0.5 block text-xs text-[var(--ob-text-muted)]">
              While this is off, orders earn no points and points carry no
              redemption value — the numbers below are kept but not applied.
            </span>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <LoyaltyField
            label="Points earned per unit of order value"
            hint="How many points one unit of order value earns. Fractions are rounded down — the preview works out what that means in money."
          >
            <Input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={earn}
              onChange={(event) => setEarn(event.target.value)}
              required
            />
          </LoyaltyField>
          <LoyaltyField
            label="Currency value of one point"
            hint="What one point is worth when a customer redeems it."
          >
            <Input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={redeem}
              onChange={(event) => setRedeem(event.target.value)}
              required
            />
          </LoyaltyField>
          <LoyaltyField
            label="Days until earned points expire"
            hint="Blank means points never expire."
          >
            <Input
              type="number"
              min="1"
              max="3650"
              step="1"
              inputMode="numeric"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              placeholder="Never expires"
            />
          </LoyaltyField>
          <LoyaltyField
            label="Sample order amount for the preview"
            hint="Preview only — nothing here is saved."
          >
            <Input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={sample}
              onChange={(event) => setSample(event.target.value)}
              placeholder={money(0)}
            />
          </LoyaltyField>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
              Tier ladder
            </h4>
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              onClick={() =>
                setTiers((prev) => [...prev, { name: "", min: "", discount: "" }])
              }
            >
              Add tier
            </Button>
          </div>
          <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
            A tier is a name and the lifetime points needed to reach it. The
            discount is recorded for counter staff; nothing applies it
            automatically.
          </p>
          {tiers.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
              No tiers — accounts will show no rank.
            </p>
          ) : null}
          <ul className="mt-2 space-y-2">
            {tiers.map((row, index) => (
              <li
                key={`${row.name}-${index}`}
                className="grid items-end gap-2 rounded-md border border-[var(--ob-border)] p-2 sm:grid-cols-[1fr_9rem_7rem_auto]"
              >
                <LoyaltyField label="Tier name">
                  <Input
                    value={row.name}
                    onChange={(event) =>
                      setTiers((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, name: event.target.value } : r,
                        ),
                      )
                    }
                    required
                  />
                </LoyaltyField>
                <LoyaltyField label="From lifetime points">
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={row.min}
                    onChange={(event) =>
                      setTiers((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, min: event.target.value } : r,
                        ),
                      )
                    }
                    placeholder="0"
                  />
                </LoyaltyField>
                <LoyaltyField label="Discount %">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    inputMode="decimal"
                    value={row.discount}
                    onChange={(event) =>
                      setTiers((prev) =>
                        prev.map((r, i) =>
                          i === index ? { ...r, discount: event.target.value } : r,
                        ),
                      )
                    }
                    placeholder="none"
                  />
                </LoyaltyField>
                <Button
                  type="button"
                  variant="ghost"
                  className="px-3 py-2 text-xs text-[var(--crm-rust)]"
                  onClick={() =>
                    setTiers((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md border border-dashed border-[var(--crm-wash-line)] bg-[var(--crm-wash)] p-3 text-sm">
          <p className="font-medium text-[var(--crm-ink)]">Preview</p>
          <ul className="mt-1 space-y-1 text-[var(--ob-text-muted)]">
            <li>
              {perPoint === null
                ? "An earn rate of 0 earns no points."
                : `One point per ${money(perPoint)} spent, rounded down.`}
            </li>
            <li>
              {draft.redeem_value_per_point <= 0
                ? "No redemption value is set."
                : `A point redeems for ${money(redemptionValue(1, draft))}.`}
            </li>
            <li>
              {draft.expiry_days === null
                ? "Points never expire."
                : `Points expire ${draft.expiry_days} days after they are earned.`}
            </li>
            <li>
              {previewTiers.length === 0
                ? "No tiers."
                : `Tiers: ${previewTiers
                    .map((tier) => `${tier.name} (${tier.min_lifetime_points})`)
                    .join(" · ")}`}
            </li>
            <li>
              {num(sample) > 0 ? (
                <>
                  An order of <strong>{money(num(sample))}</strong> earns{" "}
                  <strong className="tabular-nums">{samplePoints}</strong> points,{" "}
                  <strong className="tabular-nums">{money(sampleValue)}</strong> on
                  redemption.
                </>
              ) : (
                "Type a sample order amount to see the points and value it earns."
              )}
            </li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy}>
            Save configuration
          </Button>
          {status.kind !== "idle" ? (
            <p
              role={status.kind === "error" ? "alert" : "status"}
              className={
                status.kind === "error"
                  ? "text-sm text-[var(--ob-danger)]"
                  : "text-sm text-[var(--crm-lab-strong)]"
              }
            >
              {status.message}
            </p>
          ) : null}
        </div>
      </form>
    </CrmPanel>
  );
}

