import { formatDate } from "@/lib/format";
import { LoyaltyConfigSummary } from "@/components/crm/loyalty/loyalty-config-summary";
import { LoyaltySettingsForm } from "@/components/crm/loyalty/loyalty-settings-form";
import type { LoyaltyConfig } from "@/types/crm";

/**
 * Configuration, side by side with what it currently does.
 *
 * The summary is rendered from the stored row, so the page reflects whatever
 * this brand typed — a different earn rate reads differently here, and no
 * example sentence is written as a constant anywhere in this screen.
 */
export function LoyaltySettingsTab({
  config,
  currencyCode,
  sampleAmount,
  updatedAt,
  canManage,
}: {
  config: LoyaltyConfig;
  currencyCode: string;
  sampleAmount: number;
  updatedAt: string;
  canManage: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <LoyaltyConfigSummary
        config={config}
        currencyCode={currencyCode}
        sampleAmount={sampleAmount}
        meta={`Saved ${formatDate(updatedAt)}`}
      />
      {canManage ? (
        <LoyaltySettingsForm
          config={config}
          currencyCode={currencyCode}
          sampleAmount={sampleAmount}
        />
      ) : (
        <div className="rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] p-4 text-sm text-[var(--ob-text-muted)]">
          <p className="font-medium text-[var(--crm-ink)]">
            Loyalty rules are read-only for your role
          </p>
          <p className="mt-1">
            The configuration above is live for this brand. Changing the earn
            rate, the value of a point, the expiry or the tier ladder is a
            manager decision, so the form is hidden — owners, admins and
            managers see it under the same tab.
          </p>
        </div>
      )}
    </div>
  );
}
