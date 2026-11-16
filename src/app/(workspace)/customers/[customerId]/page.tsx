import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import {
  CrmChip,
  CrmKeyValue,
  CrmPanel,
  CrmRating,
  CrmSectionHeader,
  CrmStatRow,
  CrmSubnav,
  type CrmStat,
} from "@/components/crm/crm-ui";
import { CustomerProfileForm } from "@/components/crm/directory/customer-profile-form";
import { CustomerQuickActions } from "@/components/crm/directory/customer-quick-actions";
import { CustomerOrdersTable } from "@/components/customers/customer-orders-table";
import { CustomerOperationsTimeline } from "@/components/customers/customer-operations-timeline";
import {
  customerTimeline,
  DEFAULT_LEAD_SOURCES,
  loadCrmWorkspace,
  ordersForCustomer,
  segmentMemberIds,
  statById,
  type CrmWorkspace,
} from "@/lib/crm/loader";
import {
  loyaltyConfigFor,
  redemptionValue,
  tierForLifetimePoints,
} from "@/lib/crm/metrics";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { customerOperationsTimeline } from "@/lib/manager/ops-selectors";
import { toDemoBrandCode } from "@/lib/demo/data";
import { formatDate, formatMoney } from "@/lib/format";

/**
 * 360° customer profile: the single record this customer has, plus everything
 * the CRM knows about them — orders, interactions, reviews, complaints,
 * campaign appearances, loyalty and memberships, in one timeline.
 *
 * Demo and live workspaces arrive here the same way: `loadCrmWorkspace()`
 * reads whichever store is connected, and every write goes through the CRM
 * actions, which go through the app's existing customer write path.
 */
export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const crm = await loadCrmWorkspace();
  if (!crm) redirect("/login");

  const customer = crm.customers.find((c) => c.id === customerId);
  if (!customer) notFound();

  const stat = statById(crm).get(customer.id);
  const orders = ordersForCustomer(crm, customer.id);
  const timeline = customerTimeline(crm, customer.id);
  const money = (value: number) => formatMoney(value, crm.currencyCode);

  const segments = crm.segments.filter((segment) =>
    segmentMemberIds(crm, segment).includes(customer.id),
  );
  const account = crm.loyaltyAccounts.find((a) => a.customer_id === customer.id);
  const config = loyaltyConfigFor(crm.settings);
  const tier = account ? tierForLifetimePoints(account.lifetime_points, config) : null;
  const transactions = crm.loyaltyTransactions
    .filter((t) => t.customer_id === customer.id)
    .slice(0, 8);
  const memberships = crm.memberships.filter((m) => m.customer_id === customer.id);
  const campaignRows = crm.recipients.filter((r) => r.customer_id === customer.id);

  const stats: CrmStat[] = [
    { label: "Orders", value: String(stat?.totalOrders ?? 0), hint: `${orders.length} on record` },
    { label: "Lifetime spend", value: money(stat?.totalSpend ?? 0), hint: `Average ${money(stat?.avgOrderValue ?? 0)}` },
    {
      label: "Outstanding",
      value: money(stat?.outstandingDues ?? 0),
      hint: stat && stat.outstandingDues > 0 ? "Follow up on payment" : "Nothing owed",
    },
    {
      label: "Last purchase",
      value: stat?.lastPurchaseAt ? stat.lastPurchaseAt.slice(0, 10) : "—",
      hint: stat?.firstPurchaseAt ? `First ${stat.firstPurchaseAt.slice(0, 10)}` : "No purchases yet",
    },
  ];

  return (
    <PageShell
      title={customer.name}
      headerActions={
        <Link
          href="/customers/directory"
          className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 py-1.5 text-sm text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]"
        >
          Directory
        </Link>
      }
    >
      <CrmSubnav />
      <CrmSectionHeader
        title={customer.name}
        description={[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details recorded"}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <CrmChip tone={stat?.status === "active" ? "positive" : "neutral"}>
              {stat?.status ?? "no purchases"}
            </CrmChip>
            {customer.price_tier === "wholesale" ? <CrmChip tone="ink">wholesale</CrmChip> : null}
            {customer.status === "archived" ? <CrmChip tone="danger">archived</CrmChip> : null}
            {tier ? <CrmChip tone="positive">{tier}</CrmChip> : null}
          </div>
        }
      />

      <CrmStatRow stats={stats} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <CustomerProfileForm
            customer={customer}
            leadSources={sourceOptions(crm)}
          />

          <CrmPanel title="Orders" meta={`${orders.length} total`}>
            <CustomerOrdersTable
              orders={orders}
              currencyCode={crm.currencyCode}
              orderNumberColumn={crm.orderNumberColumn}
            />
          </CrmPanel>

          <CrmPanel
            title="Everything the CRM knows"
            meta={timeline.length ? `${timeline.length} entries` : "Nothing logged yet"}
          >
            {timeline.length === 0 ? (
              <p className="text-sm text-[var(--ob-text-muted)]">
                No interactions, reviews, complaints, leads, loyalty movements or
                memberships recorded against this customer yet.
              </p>
            ) : (
              <ol className="relative space-y-3 border-l border-[var(--crm-wash-line)] pl-4">
                {timeline.slice(0, 40).map((entry) => (
                  <li key={`${entry.kind}-${entry.id}`} className="text-sm">
                    <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-[var(--crm-wash-line)] bg-[var(--crm-wash)]" />
                    <Link href={entry.href} className="block hover:underline">
                      <span className="font-medium">{entry.title}</span>
                      <span className="ml-2 text-xs text-[var(--ob-text-muted)]">
                        {formatDate(entry.when)}
                      </span>
                    </Link>
                    {entry.detail ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--ob-text-muted)]">
                        {entry.detail}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CrmPanel>

          {crm.mode === "demo" ? (
            <OperationsPanel customerId={customer.id} brandCode={crm.brandCode} />
          ) : null}
        </div>

        <div className="space-y-4">
          <CustomerQuickActions
            customerId={customer.id}
            name={customer.name}
            consent={customer.marketing_consent ?? null}
            optedOutAt={customer.opted_out_at ?? null}
            tags={customer.tags ?? []}
            status={customer.status ?? null}
            canManage={crm.canManage}
          />

          <CrmPanel title="Loyalty" meta={config.enabled ? "On for this brand" : "Not configured"}>
            {account ? (
              <>
                <CrmKeyValue
                  items={[
                    { label: "Balance", value: String(account.points_balance) },
                    { label: "Lifetime", value: String(account.lifetime_points) },
                    { label: "Tier", value: tier ?? "—" },
                    {
                      label: "Worth on redemption",
                      value: money(redemptionValue(account.points_balance, config)),
                    },
                  ]}
                />
                {transactions.length ? (
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {transactions.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[var(--ob-text-muted)]">
                          {t.reason || t.kind}
                        </span>
                        <span
                          className={
                            t.points >= 0
                              ? "shrink-0 font-medium tabular-nums text-[var(--crm-lab-strong)]"
                              : "shrink-0 font-medium tabular-nums text-[var(--crm-amber)]"
                          }
                        >
                          {t.points >= 0 ? "+" : ""}
                          {t.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-[var(--ob-text-muted)]">
                No loyalty account yet. Accounts are created when points are
                awarded, and the earn rate comes from this brand&rsquo;s loyalty
                settings.
              </p>
            )}
          </CrmPanel>

          <CrmPanel title="Segments" meta={`${segments.length} matching`}>
            {segments.length === 0 ? (
              <p className="text-sm text-[var(--ob-text-muted)]">
                Not in any saved segment right now. Segments are recomputed from
                live data every visit.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {segments.map((segment) => (
                  <li key={segment.id}>
                    <Link href={`/customers/segments?id=${segment.id}`}>
                      <CrmChip tone={segment.kind === "manual" ? "ink" : "positive"}>
                        {segment.name}
                      </CrmChip>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CrmPanel>

          <CrmPanel
            title="Campaigns"
            meta={campaignRows.length ? `${campaignRows.length} selected` : "Never targeted"}
          >
            {campaignRows.length === 0 ? (
              <p className="text-sm text-[var(--ob-text-muted)]">
                No campaign has included this customer.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {campaignRows.map((row) => {
                  const campaign = crm.campaigns.find((c) => c.id === row.campaign_id);
                  return (
                    <li key={row.id} className="flex items-center justify-between gap-2">
                      <Link
                        href={`/customers/campaigns?id=${row.campaign_id}`}
                        className="min-w-0 truncate text-[var(--ob-primary)] hover:underline"
                      >
                        {campaign?.name ?? "Campaign"}
                      </Link>
                      <CrmChip
                        tone={
                          row.status === "redeemed"
                            ? "positive"
                            : row.status === "responded"
                              ? "positive"
                              : row.status === "opted_out"
                                ? "danger"
                                : "neutral"
                        }
                      >
                        {row.status}
                      </CrmChip>
                    </li>
                  );
                })}
              </ul>
            )}
          </CrmPanel>

          <CrmPanel title="Memberships" meta={`${memberships.length} on record`}>
            {memberships.length === 0 ? (
              <p className="text-sm text-[var(--ob-text-muted)]">No membership held.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {memberships.map((membership) => (
                  <li key={membership.id} className="flex items-center justify-between gap-2">
                    <span>{membership.plan}</span>
                    <span className="flex items-center gap-2">
                      <CrmChip tone={membership.status === "active" ? "positive" : "neutral"}>
                        {membership.status}
                      </CrmChip>
                      {membership.ends_at ? (
                        <span className="text-xs text-[var(--ob-text-muted)]">
                          {membership.ends_at.slice(0, 10)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CrmPanel>

          <CrmPanel title="Reviews">
            <ReviewSummary crm={crm} customerId={customer.id} />
          </CrmPanel>
        </div>
      </div>
    </PageShell>
  );
}

function ReviewSummary({
  crm,
  customerId,
}: {
  crm: CrmWorkspace;
  customerId: string;
}) {
  const reviews = crm.reviews.filter((r) => r.customer_id === customerId);
  if (!reviews.length) {
    return (
      <p className="text-sm text-[var(--ob-text-muted)]">
        No review is linked to this customer. Reviews can arrive anonymously, so
        most will not be.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {reviews.map((review) => (
        <li key={review.id} className="text-sm">
          <div className="flex items-center gap-2">
            <CrmRating rating={review.rating} />
            <span className="text-xs text-[var(--ob-text-muted)]">
              {review.review_date.slice(0, 10)}
            </span>
            <CrmChip
              tone={review.sentiment === "negative" ? "danger" : review.sentiment === "positive" ? "positive" : "warning"}
            >
              {review.sentiment ?? "unclassified"}
            </CrmChip>
          </div>
          {review.text ? <p className="mt-1 text-[var(--ob-text-muted)]">{review.text}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Operational history (appointments, visits, jobs, tasks) still comes from the
 * Productivity Manager, so the CRM reads it rather than copying it. Only the
 * demo workspace has an operations pack to read.
 */
async function OperationsPanel({
  customerId,
  brandCode,
}: {
  customerId: string;
  brandCode: string;
}) {
  const code = toDemoBrandCode(brandCode);
  const ops = await loadDemoOperations(code);
  const rows = customerOperationsTimeline(
    customerId,
    {
      appointments: ops.appointments,
      visits: ops.visits,
      jobs: ops.serviceJobs,
      tasks: ops.tasks,
    },
    Object.fromEntries(ops.services.map((service) => [service.id, service.name])),
  );
  return (
    <>
      <h2 className="mb-3 mt-6 text-sm font-semibold">Operations</h2>
      <CustomerOperationsTimeline rows={rows} />
    </>
  );
}

/** Source pick-list: the brand's configured list plus anything already stored. */
function sourceOptions(crm: CrmWorkspace): string[] {
  const seen = new Set<string>([
    ...crm.settings.lead_sources,
    ...DEFAULT_LEAD_SOURCES,
  ]);
  for (const customer of crm.customers) {
    if (customer.source) seen.add(customer.source);
  }
  return Array.from(seen).sort();
}
