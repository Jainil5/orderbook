import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { CrmChip, CrmPanel } from "@/components/crm/crm-ui";
import { formatDate, formatMoney } from "@/lib/format";
import type { LoyaltyAccount, LoyaltyTransaction, LoyaltyTxKind } from "@/types/crm";

/** One row of the accounts table: the stored account plus config-derived numbers. */
export type LoyaltyAccountRow = {
  account: LoyaltyAccount;
  customerId: string;
  customerName: string;
  /** From `tierForLifetimePoints` — the config decides, not the account row. */
  tier: string | null;
  /** From `redemptionValue(balance, config)`. */
  worth: number;
};

const TX_TONE: Record<LoyaltyTxKind, "positive" | "warning" | "neutral" | "ink"> = {
  earn: "positive",
  bonus: "positive",
  redeem: "warning",
  expire: "neutral",
  adjust: "ink",
};

export function LoyaltyAccountsTable({
  rows,
  currencyCode,
  showWorth,
}: {
  rows: LoyaltyAccountRow[];
  currencyCode: string;
  showWorth: boolean;
}) {
  const money = (value: number) => formatMoney(value, currencyCode);
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No loyalty accounts yet"
        description="An account appears the first time points are awarded to a customer — nobody has to be enrolled first."
      />
    );
  }

  return (
    <>
      {/* Mobile-first: the two numbers a counter actually needs. */}
      <ul className="ob-stagger space-y-3 md:hidden">
        {rows.map(({ account, customerId, customerName, tier, worth }) => (
          <li key={account.id} className="ob-card p-4">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/customers/${customerId}`}
                className="min-w-0 truncate text-base font-semibold text-[var(--ob-primary)]"
              >
                {customerName}
              </Link>
              {tier ? <CrmChip tone="positive">{tier}</CrmChip> : null}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-[var(--ob-text-muted)]">Balance</dt>
                <dd className="font-medium tabular-nums">{account.points_balance}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--ob-text-muted)]">Lifetime</dt>
                <dd className="font-medium tabular-nums">{account.lifetime_points}</dd>
              </div>
              {showWorth ? (
                <div className="col-span-2">
                  <dt className="text-xs text-[var(--ob-text-muted)]">
                    Worth on redemption
                  </dt>
                  <dd className="font-medium tabular-nums">{money(worth)}</dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
              {account.last_activity_at
                ? `Last activity ${formatDate(account.last_activity_at)}`
                : "No activity recorded"}
            </p>
            <Link
              href={`/customers/loyalty?tab=accounts&customer=${customerId}`}
              className="ob-touch-target mt-2 inline-block text-sm text-[var(--ob-primary)]"
            >
              Ledger →
            </Link>
          </li>
        ))}
      </ul>

      <CrmPanel title="Accounts" meta={`${rows.length} shown`} className="hidden md:block">
        <div className="ob-scroll-x -mx-4 -my-4">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--ob-text-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2 text-right font-medium">Lifetime</th>
                <th className="px-3 py-2 font-medium">Tier</th>
                {showWorth ? (
                  <th className="px-3 py-2 text-right font-medium">Worth</th>
                ) : null}
                <th className="px-3 py-2 font-medium">Last activity</th>
                <th className="px-3 py-2 font-medium">Ledger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ob-border)]">
              {rows.map(({ account, customerId, customerName, tier, worth }) => (
                <tr key={account.id} className="hover:bg-[var(--ob-surface-muted)]">
                  <td className="px-3 py-2">
                    <Link
                      href={`/customers/${customerId}`}
                      className="font-medium text-[var(--ob-primary)] hover:underline"
                    >
                      {customerName}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {account.points_balance}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--ob-text-muted)]">
                    {account.lifetime_points}
                  </td>
                  <td className="px-3 py-2">
                    {tier ? (
                      <CrmChip tone="positive">{tier}</CrmChip>
                    ) : (
                      <span className="text-[var(--ob-text-muted)]">—</span>
                    )}
                  </td>
                  {showWorth ? (
                    <td className="px-3 py-2 text-right tabular-nums">{money(worth)}</td>
                  ) : null}
                  <td className="px-3 py-2 text-xs text-[var(--ob-text-muted)]">
                    {account.last_activity_at
                      ? formatDate(account.last_activity_at)
                      : "No activity"}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/customers/loyalty?tab=accounts&customer=${customerId}`}
                      className="ob-touch-target text-sm text-[var(--ob-primary)] hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CrmPanel>
    </>
  );
}

/**
 * The ledger for one customer. `balance_after` is stored on the row, so the
 * running total can be read without replaying the history.
 */
export function LoyaltyLedger({
  transactions,
  customerName,
  onClear,
}: {
  transactions: LoyaltyTransaction[];
  customerName: string;
  onClear: string;
}) {
  const ordered = [...transactions].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  return (
    <CrmPanel
      title={`Points ledger — ${customerName}`}
      meta={ordered.length ? `${ordered.length} entries` : "Nothing yet"}
      actions={
        <Link
          href={onClear}
          className="ob-touch-target text-xs text-[var(--crm-wash)] underline opacity-80 hover:opacity-100"
        >
          Show all accounts
        </Link>
      }
    >
      {ordered.length === 0 ? (
        <p className="text-sm text-[var(--ob-text-muted)]">
          No points have moved on this account yet.
        </p>
      ) : (
        <ol className="space-y-2">
          {ordered.map((txn) => (
            <li
              key={txn.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--ob-border)] pb-2 text-sm last:border-0 last:pb-0"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <CrmChip tone={TX_TONE[txn.kind]}>{txn.kind}</CrmChip>
                <span className="min-w-0 truncate text-[var(--ob-text-muted)]">
                  {txn.reason ?? "—"}
                </span>
              </span>
              <span className="flex items-baseline gap-3">
                <span
                  className={
                    txn.points >= 0
                      ? "font-semibold tabular-nums text-[var(--crm-lab-strong)]"
                      : "font-semibold tabular-nums text-[var(--crm-amber)]"
                  }
                >
                  {txn.points > 0 ? `+${txn.points}` : txn.points}
                </span>
                <span className="tabular-nums text-[var(--ob-text-muted)]">
                  → {txn.balance_after}
                </span>
                <span className="text-xs text-[var(--ob-text-muted)]">
                  {formatDate(txn.created_at)}
                </span>
              </span>
              {txn.expires_at ? (
                <span className="w-full text-xs text-[var(--ob-text-muted)] sm:w-auto">
                  expires {formatDate(txn.expires_at)}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </CrmPanel>
  );
}
