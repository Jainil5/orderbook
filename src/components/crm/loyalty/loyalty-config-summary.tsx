import { CrmChip, CrmKeyValue, CrmPanel } from "@/components/crm/crm-ui";
import { pointsForOrder, redemptionValue } from "@/lib/crm/metrics";
import { formatMoney } from "@/lib/format";
import type { LoyaltyConfig } from "@/types/crm";

/**
 * Says, in words, what this brand's stored configuration actually does.
 *
 * Every figure here is derived from the `LoyaltyConfig` row — the earn rate is
 * inverted into "one point per X", the value of a point comes from
 * `redemptionValue`, and the sample line runs through `pointsForOrder`. There
 * is no constant in this file that represents a loyalty model.
 */

export function earnRateLine(config: LoyaltyConfig, money: (value: number) => string): string {
  if (config.earn_points_per_unit <= 0) {
    return "No points are earned: the earn rate is 0.";
  }
  return `Earns ${config.earn_points_per_unit} points per ${money(1)} of order value — one point per ${money(
    1 / config.earn_points_per_unit,
  )} spent, fractions rounded down.`;
}

export function pointValueLine(
  config: LoyaltyConfig,
  money: (value: number) => string,
): string {
  if (config.redeem_value_per_point <= 0) {
    return "A point carries no currency value until a redemption value is set.";
  }
  return `One point is worth ${money(redemptionValue(1, config))} when redeemed.`;
}

export function expiryLine(config: LoyaltyConfig): string {
  return config.expiry_days && config.expiry_days > 0
    ? `Points lapse ${config.expiry_days} days after they are earned.`
    : "Points never expire.";
}

export function LoyaltyConfigSummary({
  config,
  currencyCode,
  sampleAmount,
  meta,
}: {
  config: LoyaltyConfig;
  currencyCode: string;
  /** A real amount from the brand's own data, used only for the worked example. */
  sampleAmount: number;
  meta?: string;
}) {
  const money = (value: number) => formatMoney(value, currencyCode);
  const samplePoints = pointsForOrder(sampleAmount, config);
  const sampleValue = redemptionValue(samplePoints, config);

  return (
    <CrmPanel
      title="This brand's loyalty model"
      meta={meta ?? (config.enabled ? "Switched on" : "Switched off")}
    >
      <CrmKeyValue
        items={[
          {
            label: "Programme",
            value: (
              <CrmChip tone={config.enabled ? "positive" : "neutral"}>
                {config.enabled ? "on" : "off"}
              </CrmChip>
            ),
          },
          { label: "Earn rate", value: config.earn_points_per_unit },
          { label: "Value of one point", value: money(config.redeem_value_per_point) },
          {
            label: "Expiry",
            value:
              config.expiry_days && config.expiry_days > 0
                ? `${config.expiry_days} days`
                : "Never",
          },
        ]}
      />

      <ul className="mt-3 space-y-1 text-sm text-[var(--ob-text-muted)]">
        <li>{earnRateLine(config, money)}</li>
        <li>{pointValueLine(config, money)}</li>
        <li>{expiryLine(config)}</li>
      </ul>

      <div className="mt-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
          Tier ladder
        </h4>
        {config.tiers.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
            No tiers are configured, so accounts carry no tier. Add them in
            Settings if this brand wants ranks.
          </p>
        ) : (
          <ol className="mt-2 space-y-1.5">
            {config.tiers.map((tier) => (
              <li
                key={tier.name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-3 py-2 text-sm"
              >
                <span className="font-medium text-[var(--crm-ink)]">{tier.name}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--ob-text-muted)]">
                  <span>from {tier.min_lifetime_points} lifetime points</span>
                  {tier.discount_percent !== null ? (
                    <CrmChip tone="ink">{tier.discount_percent}% off</CrmChip>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {sampleAmount > 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-[var(--crm-wash-line)] px-3 py-2 text-sm">
          Worked example: an order of {money(sampleAmount)} earns{" "}
          <strong className="tabular-nums">{samplePoints}</strong> points, worth{" "}
          <strong className="tabular-nums">{money(sampleValue)}</strong> when
          redeemed.
        </p>
      ) : (
        <p className="mt-4 text-xs text-[var(--ob-text-muted)]">
          No order value to illustrate with yet — this brand has no posted
          orders to average.
        </p>
      )}
    </CrmPanel>
  );
}
