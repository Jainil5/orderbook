import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import {
  CrmChip,
  CrmPanel,
  CrmSectionHeader,
  CrmStatRow,
  CrmSubnav,
  type CrmStat,
} from "@/components/crm/crm-ui";
import { CustomerSearchBar } from "@/components/customers/customer-search-bar";
import {
  LoyaltyAdjustForms,
  type LoyaltyCustomerOption,
  type LoyaltyOrderOption,
} from "@/components/crm/loyalty/loyalty-adjust-form";
import {
  LoyaltyAccountsTable,
  LoyaltyLedger,
  type LoyaltyAccountRow,
} from "@/components/crm/loyalty/loyalty-accounts-table";
import { LoyaltyConfigSummary, expiryLine } from "@/components/crm/loyalty/loyalty-config-summary";
import { LoyaltyMembershipsTab, type MembershipRow } from "@/components/crm/loyalty/loyalty-memberships-tab";
import { LoyaltySettingsTab } from "@/components/crm/loyalty/loyalty-settings-tab";
import { LoyaltyTabs, loyaltyTabFor } from "@/components/crm/loyalty/loyalty-tabs";
import {
  customerById,
  loadCrmWorkspace,
  type CrmWorkspace,
} from "@/lib/crm/loader";
import {
  expiringPointsReport,
  loyaltyConfigFor,
  pointsForOrder,
  redemptionValue,
  tierForLifetimePoints,
} from "@/lib/crm/metrics";
import { formatDate, formatMoney } from "@/lib/format";
import type { Order } from "@/types/database";
import type { LoyaltyConfig } from "@/types/crm";

/**
 * Loyalty, points and memberships for one brand.
 *
 * Nothing on this screen knows what a loyalty programme is supposed to look
 * like. The earn rate, the value of a point, whether points expire and which
 * tiers exist are read from this brand's `crm_settings` row through
 * `loyaltyConfigFor`, and every figure shown is derived from the stored rows by
 * `metrics.ts`. A brand that earns a point per ₹100 and a brand that earns
 * four points per ₹1 see different numbers from the same code.
 *
 * Tabs (`?tab=`), search (`?q=`) and the focused customer (`?customer=`, the
 * deep link the 360° page uses) all live in the URL.
 */
export default async function CrmLoyaltyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; customer?: string }>;
}) {
  const crm = await loadCrmWorkspace();
  if (!crm) redirect("/login");
  const sp = await searchParams;

  const config = loyaltyConfigFor(crm.settings);
  const money = (value: number) => formatMoney(value, crm.currencyCode);
  const query = sp.q?.trim() ?? "";
  const requested = sp.customer?.trim() ?? "";
  const focusId = crm.customers.some((customer) => customer.id === requested)
    ? requested
    : null;
  // A deep link from a customer page lands on their accounts unless a tab is named.
  const tab = loyaltyTabFor(sp.tab) ?? (focusId ? "accounts" : "overview");
  const sampleAmount = crm.overview.totals.averageCustomerSpend;

  const heading = headings(tab, config, crm);

  return (
    <PageShell title="Loyalty">
      <CrmSubnav />
      <CrmSectionHeader
        title={heading.title}
        description={heading.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {focusId ? (
              <Link
                href={`/customers/${focusId}`}
                className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 py-1.5 text-sm text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]"
              >
                Customer 360°
              </Link>
            ) : null}
            <Link
              href="/customers/loyalty?tab=settings"
              className="ob-touch-target rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-3 py-1.5 text-sm font-medium text-[var(--crm-leaf)]"
            >
              Loyalty settings
            </Link>
          </div>
        }
      />

      <LoyaltyTabs tab={tab} customerId={focusId} />

      {requested && !focusId ? (
        <p className="mb-3 text-sm text-[var(--ob-text-muted)]">
          The customer this link pointed at is no longer in the directory, so the
          full list is shown instead.
        </p>
      ) : null}

      {tab === "overview" ? (
        <OverviewTab crm={crm} config={config} money={money} sampleAmount={sampleAmount} />
      ) : null}
      {tab === "accounts" ? (
        <AccountsTab
          crm={crm}
          config={config}
          money={money}
          query={query}
          focusId={focusId}
        />
      ) : null}
      {tab === "memberships" ? (
        <LoyaltyMembershipsTab
          rows={membershipRows(crm)}
          currencyCode={crm.currencyCode}
          asOf={crm.asOf}
          customers={crm.customers
            .map((customer) => ({ id: customer.id, name: customer.name }))
            .sort((a, b) => a.name.localeCompare(b.name))}
          canManage={crm.canManage}
          defaultCustomerId={focusId}
        />
      ) : null}
      {tab === "settings" ? (
        <LoyaltySettingsTab
          config={config}
          currencyCode={crm.currencyCode}
          sampleAmount={sampleAmount}
          updatedAt={crm.settings.updated_at}
          canManage={crm.canManage}
        />
      ) : null}
    </PageShell>
  );
}

function headings(
  tab: string,
  config: LoyaltyConfig,
  crm: CrmWorkspace,
): { title: string; description: string } {
  const asOf = formatDate(crm.asOf);
  switch (tab) {
    case "accounts":
      return {
        title: "Point accounts",
        description: `Balances, lifetime points and the ledger behind them, as of ${asOf}. ${expiryLine(config)}`,
      };
    case "memberships":
      return {
        title: "Memberships",
        description:
          "Plans this business named, priced and agreed with a customer. No scheme is assumed and no payment is taken here — the price on a row records what was agreed.",
      };
    case "settings":
      return {
        title: "Loyalty settings",
        description: `This brand's own model, saved in its CRM settings row and last written ${formatDate(crm.settings.updated_at)}. Every other tab reads these numbers back.`,
      };
    default:
      return {
        title: "Loyalty overview",
        description: `Tier membership, outstanding points and what they are worth, recounted from the ledger on every visit as of ${asOf}.`,
      };
  }
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function OverviewTab({
  crm,
  config,
  money,
  sampleAmount,
}: {
  crm: CrmWorkspace;
  config: LoyaltyConfig;
  money: (value: number) => string;
  sampleAmount: number;
}) {
  const accounts = crm.loyaltyAccounts;
  const totalOutstanding = accounts.reduce((sum, a) => sum + a.points_balance, 0);
  const totalLifetime = accounts.reduce((sum, a) => sum + a.lifetime_points, 0);
  const activeMemberships = crm.memberships.filter((m) => m.status === "active").length;
  const plans = Array.from(new Set(crm.memberships.map((m) => m.plan)));

  const stats: CrmStat[] = [
    {
      label: "Point accounts",
      value: String(accounts.length),
      hint: `${totalLifetime} lifetime points earned`,
      href: "/customers/loyalty?tab=accounts",
    },
    {
      label: "Points outstanding",
      value: String(totalOutstanding),
      hint: `${config.tiers.length} tier${config.tiers.length === 1 ? "" : "s"} configured`,
    },
    {
      label: "Worth on redemption",
      value: money(redemptionValue(totalOutstanding, config)),
      hint:
        config.redeem_value_per_point > 0
          ? `${money(redemptionValue(1, config))} per point, as configured`
          : "No redemption value configured yet",
    },
    {
      label: "Active memberships",
      value: String(activeMemberships),
      hint: `${crm.memberships.length} on record · ${plans.length} plan${plans.length === 1 ? "" : "s"}`,
      href: "/customers/loyalty?tab=memberships",
    },
  ];

  return (
    <>
      <CrmStatRow stats={stats} />
      <div className="grid gap-4 lg:grid-cols-3">
        <TierPanel crm={crm} config={config} />
        <ExpiringPointsPanel crm={crm} config={config} />
        <LoyaltyConfigSummary
          config={config}
          currencyCode={crm.currencyCode}
          sampleAmount={sampleAmount}
        />
      </div>
      <p className="mt-4 text-sm text-[var(--ob-text-muted)]">
        {config.enabled ? (
          <>
            The programme is switched on, so these figures mean something:{" "}
            <Link
              href="/customers/loyalty?tab=settings"
              className="text-[var(--ob-primary)] hover:underline"
            >
              change the rules
            </Link>{" "}
            and every number on this page follows.
          </>
        ) : (
          <>
            The programme is switched off for {crm.brandCode}, so nothing earns
            or redeems until{" "}
            <Link
              href="/customers/loyalty?tab=settings"
              className="text-[var(--ob-primary)] hover:underline"
            >
              the settings are saved as on
            </Link>
            .
          </>
        )}
      </p>
    </>
  );
}

function TierPanel({
  crm,
  config,
}: {
  crm: CrmWorkspace;
  config: LoyaltyConfig;
}) {
  const counts = config.tiers.map((tier) => ({
    name: tier.name,
    threshold: tier.min_lifetime_points,
    discount: tier.discount_percent,
    members: crm.loyaltyAccounts.filter(
      (account) =>
        tierForLifetimePoints(account.lifetime_points, config) === tier.name,
    ).length,
  }));
  const untiered = crm.loyaltyAccounts.filter(
    (account) => tierForLifetimePoints(account.lifetime_points, config) === null,
  ).length;

  return (
    <CrmPanel
      title="Members per tier"
      meta={`${crm.loyaltyAccounts.length} account${crm.loyaltyAccounts.length === 1 ? "" : "s"}`}
    >
      {config.tiers.length === 0 ? (
        <p className="text-sm text-[var(--ob-text-muted)]">
          No tiers are configured for this brand.{" "}
          <Link
            href="/customers/loyalty?tab=settings"
            className="text-[var(--ob-primary)] hover:underline"
          >
            Add a ladder
          </Link>{" "}
          and accounts pick up a rank from their lifetime points.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {counts.map((row) => (
            <li key={row.name}>
              <Link
                href="/customers/loyalty?tab=accounts"
                className="ob-touch-target flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-[var(--ob-surface-muted)]"
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{row.name}</span>
                  <span className="text-xs text-[var(--ob-text-muted)]">
                    from {row.threshold}
                  </span>
                  {row.discount !== null ? (
                    <CrmChip tone="ink">{row.discount}% off</CrmChip>
                  ) : null}
                </span>
                <span className="text-sm font-semibold tabular-nums">{row.members}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {untiered > 0 ? (
        <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
          {untiered} account{untiered === 1 ? "" : "s"} below the first threshold.
        </p>
      ) : null}
    </CrmPanel>
  );
}

/** Points about to lapse, straight from `expiringPointsReport`. */
function ExpiringPointsPanel({
  crm,
  config,
}: {
  crm: CrmWorkspace;
  config: LoyaltyConfig;
}) {
  const rows = expiringPointsReport(crm.loyaltyTransactions, crm.asOf);
  const total = rows.reduce((sum, row) => sum + row.points, 0);

  return (
    <CrmPanel
      title="Expiring points"
      meta={rows.length ? `${total} points in 30 days` : "Nothing lapsing"}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--ob-text-muted)]">
          {expiryLine(config)} No earn or bonus row carries an expiry date in the
          next thirty days.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--ob-border)]">
          {rows.slice(0, 8).map((row) => (
            <li key={`${row.customerId}-${row.expiresAt}`}>
              <Link
                href={`/customers/loyalty?tab=accounts&customer=${row.customerId}`}
                className="ob-touch-target flex items-center justify-between gap-3 py-2 text-sm hover:underline"
              >
                <span className="min-w-0 truncate">
                  {customerById(crm, row.customerId)?.name ?? "Removed customer"}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-[var(--ob-text-muted)]">
                    {formatDate(row.expiresAt).slice(0, 6)}
                  </span>
                  <CrmChip tone="warning">{row.points} pts</CrmChip>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {rows.length > 8 ? (
        <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
          {rows.length - 8} more expiry groups behind these.
        </p>
      ) : null}
    </CrmPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Accounts                                                            */
/* ------------------------------------------------------------------ */

function AccountsTab({
  crm,
  config,
  money,
  query,
  focusId,
}: {
  crm: CrmWorkspace;
  config: LoyaltyConfig;
  money: (value: number) => string;
  query: string;
  focusId: string | null;
}) {
  const needle = query.toLowerCase();
  const rows: LoyaltyAccountRow[] = crm.loyaltyAccounts
    .map((account) => {
      const customer = customerById(crm, account.customer_id);
      return {
        account,
        customerId: account.customer_id,
        customerName: customer?.name ?? "Removed customer",
        tier: tierForLifetimePoints(account.lifetime_points, config),
        worth: redemptionValue(account.points_balance, config),
      };
    })
    .filter((row) => {
      if (focusId) return row.customerId === focusId;
      if (!needle) return true;
      const customer = customerById(crm, row.customerId);
      return (
        row.customerName.toLowerCase().includes(needle) ||
        (customer?.phone ?? "").toLowerCase().includes(needle) ||
        (customer?.email ?? "").toLowerCase().includes(needle)
      );
    })
    .sort(
      (a, b) =>
        b.account.points_balance - a.account.points_balance ||
        a.customerName.localeCompare(b.customerName),
    );

  const outstanding = rows.reduce((sum, row) => sum + row.account.points_balance, 0);
  const shownStats: CrmStat[] = [
    { label: "Accounts shown", value: String(rows.length) },
    { label: "Points shown", value: String(outstanding) },
    {
      label: "Worth shown",
      value: money(redemptionValue(outstanding, config)),
      hint: focusId
        ? "This customer only"
        : config.enabled
          ? "At this brand's redemption value"
          : "Programme switched off",
    },
  ];

  const customers: LoyaltyCustomerOption[] = crm.customers
    .map((customer) => ({
      id: customer.id,
      name: customer.name,
      balance:
        crm.loyaltyAccounts.find((account) => account.customer_id === customer.id)
          ?.points_balance ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const orders: LoyaltyOrderOption[] = unawardedOrders(crm, config)
    .slice(0, 40)
    .map((order) => ({
      id: order.id,
      label: `${order.order_number} · ${money(order.grand_total)}`,
      customerId: order.customer_id as string,
      customerName: customerById(crm, order.customer_id)?.name ?? "Removed customer",
      points: pointsForOrder(order.grand_total, config),
    }))
    .filter((order) => order.points > 0);

  const focused = focusId ? customerById(crm, focusId) : null;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Suspense
          fallback={
            <div className="h-10 max-w-md animate-pulse rounded-md bg-[var(--ob-surface-muted)]" />
          }
        >
          <CustomerSearchBar initialQuery={query} basePath="/customers/loyalty" />
        </Suspense>
        {focusId ? (
          <Link
            href="/customers/loyalty?tab=accounts"
            className="ob-touch-target text-sm text-[var(--ob-primary)] hover:underline"
          >
            Clear {focused?.name ?? "customer"} filter
          </Link>
        ) : null}
      </div>

      <CrmStatRow stats={shownStats} />
      <LoyaltyAccountsTable
        rows={rows}
        currencyCode={crm.currencyCode}
        showWorth={config.enabled}
      />

      {focusId && focused ? (
        <div className="mt-4">
          <LoyaltyLedger
            transactions={crm.loyaltyTransactions.filter(
              (txn) => txn.customer_id === focusId,
            )}
            customerName={focused.name}
            onClear="/customers/loyalty?tab=accounts"
          />
        </div>
      ) : null}

      <div className="mt-4">
        {crm.canManage ? (
          <LoyaltyAdjustForms
            customers={customers}
            orders={orders}
            config={config}
            currencyCode={crm.currencyCode}
            defaultCustomerId={focusId}
          />
        ) : (
          <p className="rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-3 py-2 text-sm text-[var(--ob-text-muted)]">
            Your role can read point balances. Awarding, redeeming and adjusting
            points changes what this brand owes a customer, so it is limited to
            owners, admins and managers.
          </p>
        )}
      </div>
    </>
  );
}

/**
 * Posted orders that have not been paid out in points yet. The ledger is the
 * check: a row already carrying this order id means the award happened.
 */
function unawardedOrders(crm: CrmWorkspace, config: LoyaltyConfig): Order[] {
  const awarded = new Set(
    crm.loyaltyTransactions
      .filter((txn) => txn.order_id && txn.points > 0)
      .map((txn) => txn.order_id as string),
  );
  return crm.orders
    .filter(
      (order) =>
        (order.status === "confirmed" || order.status === "completed") &&
        Boolean(order.customer_id) &&
        !awarded.has(order.id),
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 80)
    .filter((order) => pointsForOrder(order.grand_total, config) > 0);
}

/* ------------------------------------------------------------------ */
/* Memberships                                                         */
/* ------------------------------------------------------------------ */

function membershipRows(crm: CrmWorkspace): MembershipRow[] {
  return crm.memberships.map((membership) => ({
    membership,
    customerName:
      customerById(crm, membership.customer_id)?.name ?? "Removed customer",
  }));
}
