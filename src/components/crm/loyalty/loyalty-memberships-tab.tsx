import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { CrmChip, CrmPanel } from "@/components/crm/crm-ui";
import {
  MembershipCreateForm,
  MembershipRowActions,
} from "@/components/crm/loyalty/membership-forms";
import { formatMoney } from "@/lib/format";
import type { Membership, MembershipStatus } from "@/types/crm";

export type MembershipRow = {
  membership: Membership;
  customerName: string;
};

const STATUS_TONE: Record<MembershipStatus, "positive" | "warning" | "neutral" | "danger"> = {
  active: "positive",
  paused: "warning",
  expired: "neutral",
  cancelled: "danger",
};

/** Both stored shapes — `YYYY-MM-DD` and a full ISO instant — read as a day. */
const day = (value: string | null) => (value ? value.slice(0, 10) : "");

/**
 * Memberships this brand runs for itself. The plan name, the benefits and the
 * price come from the row, so the screen shows whichever clubs or schemes the
 * business decided to sell — nothing here is a plan list the code knows about,
 * and no payment is taken or attempted.
 */
export function LoyaltyMembershipsTab({
  rows,
  currencyCode,
  asOf,
  customers,
  canManage,
  defaultCustomerId,
}: {
  rows: MembershipRow[];
  currencyCode: string;
  asOf: string;
  customers: { id: string; name: string }[];
  canManage: boolean;
  defaultCustomerId: string | null;
}) {
  const money = (value: number) => formatMoney(value, currencyCode);
  const plans = Array.from(new Set(rows.map((row) => row.membership.plan))).sort();

  if (canManage) {
    return (
      <div className="space-y-4">
        <CrmPanel title="Start a membership" meta="Plan, price and benefits are yours to name">
          <MembershipCreateForm
            customers={customers}
            defaultCustomerId={defaultCustomerId}
          />
        </CrmPanel>
        <MembershipList
          rows={rows}
          plans={plans}
          money={money}
          asOf={asOf}
          canManage
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MembershipList rows={rows} plans={plans} money={money} asOf={asOf} canManage={false} />
      <p className="rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-3 py-2 text-sm text-[var(--ob-text-muted)]">
        Your role can read memberships. Starting, renewing, pausing or cancelling
        one is a manager decision, so those controls are hidden here.
      </p>
    </div>
  );
}

function MembershipList({
  rows,
  plans,
  money,
  asOf,
  canManage,
}: {
  rows: MembershipRow[];
  plans: string[];
  money: (value: number) => string;
  asOf: string;
  canManage: boolean;
}) {
  const asOfMs = Date.parse(asOf);
  const ordered = [...rows].sort(
    (a, b) =>
      a.membership.status.localeCompare(b.membership.status) ||
      a.membership.plan.localeCompare(b.membership.plan) ||
      a.customerName.localeCompare(b.customerName),
  );

  return (
    <CrmPanel
      title="Memberships"
      meta={`${rows.length} recorded · ${plans.length} plan${plans.length === 1 ? "" : "s"}`}
    >
      {rows.length === 0 ? (
        <EmptyState
          title="No memberships recorded"
          description="A membership is any plan this business agrees with a customer. Start one and it appears here and on that customer's 360° page."
        />
      ) : (
        <ul className="ob-stagger space-y-3">
          {ordered.map(({ membership, customerName }) => {
            const benefits = membership.benefits ?? [];
            const lapsed =
              membership.ends_at !== null && Date.parse(membership.ends_at) < asOfMs;
            return (
              <li
                key={membership.id}
                className="rounded-md border border-[var(--ob-border)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{membership.plan}</p>
                    <Link
                      href={`/customers/${membership.customer_id}`}
                      className="text-sm text-[var(--ob-primary)] hover:underline"
                    >
                      {customerName}
                    </Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CrmChip tone={STATUS_TONE[membership.status]}>
                      {membership.status}
                    </CrmChip>
                    {membership.auto_renew ? <CrmChip tone="ink">auto-renew</CrmChip> : null}
                    {lapsed ? (
                      <CrmChip tone="warning">past {day(membership.ends_at)}</CrmChip>
                    ) : null}
                  </div>
                </div>

                <dl className="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-[var(--ob-text-muted)]">Started</dt>
                    <dd className="tabular-nums">{day(membership.started_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--ob-text-muted)]">Ends</dt>
                    <dd className="tabular-nums">
                      {membership.ends_at ? day(membership.ends_at) : "No end date"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--ob-text-muted)]">Price</dt>
                    <dd className="font-medium tabular-nums">{money(membership.price)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--ob-text-muted)]">Updated</dt>
                    <dd className="tabular-nums">{day(membership.updated_at)}</dd>
                  </div>
                </dl>

                {benefits.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {benefits.map((benefit) => (
                      <li key={benefit}>
                        <CrmChip>{benefit}</CrmChip>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
                    No benefits written down for this plan.
                  </p>
                )}

                {canManage ? (
                  <div className="mt-3 border-t border-[var(--ob-border)] pt-3">
                    <MembershipRowActions
                      id={membership.id}
                      plan={membership.plan}
                      status={membership.status}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </CrmPanel>
  );
}
