import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { PageShell } from "@/components/workspace/page-shell";
import { CustomerEditor } from "@/components/customers/customer-editor";
import { CustomerOrdersTable } from "@/components/customers/customer-orders-table";
import { CustomerOperationsTimeline } from "@/components/customers/customer-operations-timeline";
import { CustomerCrmEditor } from "@/components/crm/customer-crm-editor";
import { TimelineFilters } from "@/components/crm/timeline-filters";
import { TimelineStream } from "@/components/crm/timeline-stream";
import { loadCrmWorkspace } from "@/lib/crm/data";
import { buildCustomerProfiles } from "@/lib/crm/metrics";
import {
  buildTimeline,
  countByKind,
  filterByKind,
  groupByDay,
  TIMELINE_EVENT_KINDS,
  type TimelineEventKind,
} from "@/lib/crm/timeline";
import { tierById } from "@/lib/crm/loyalty";
import { formatDate, formatMoney, pluralize } from "@/lib/format";
import { loadDemoOperations } from "@/lib/demo/operations-data";
import { customerOperationsTimeline } from "@/lib/manager/ops-selectors";
import { getDemoCustomer, listDemoOrdersForCustomer, toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import { notFound, redirect } from "next/navigation";

function readKinds(value: string | string[] | undefined): TimelineEventKind[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return TIMELINE_EVENT_KINDS.filter((kind) => list.includes(kind));
}

export default async function CustomerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ kind?: string | string[] }>;
}) {
  const { customerId } = await params;
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const code = toDemoBrandCode(ws.brand.code);
  const customer = await getDemoCustomer(customerId, code);
  if (!customer) notFound();

  const [orders, workspace, rawParams] = await Promise.all([
    listDemoOrdersForCustomer(customerId, code),
    loadCrmWorkspace(code),
    searchParams,
  ]);

  const profiles = buildCustomerProfiles(workspace);
  const profile = profiles.find((p) => p.customer.id === customerId) ?? null;

  const events = buildTimeline({
    customer,
    orders: workspace.orders,
    payments: workspace.payments,
    interactions: workspace.interactions,
    reviews: workspace.reviews,
    complaints: workspace.complaints,
    loyaltyLedger: workspace.loyaltyLedger,
    memberships: workspace.memberships,
    leads: workspace.leads,
    staffById: new Map(workspace.staff.map((s) => [s.id, s.name])),
  });
  const activeKinds = readKinds(rawParams.kind);
  const days = groupByDay(filterByKind(events, activeKinds));

  const ops = await loadDemoOperations(code);
  const operationsRows = customerOperationsTimeline(customerId, {
    appointments: ops.appointments,
    visits: ops.visits,
    jobs: ops.serviceJobs,
    tasks: ops.tasks,
  }, Object.fromEntries(ops.services.map((s) => [s.id, s.name])));

  const rules = workspace.loyaltyRules;
  const tier = rules ? tierById(rules, profile?.loyaltyTierId ?? null) : null;
  const currency = workspace.currencyCode;

  return (
    <PageShell
      title={customer.name}
      headerActions={
        <Link href="/customers/directory" className="text-sm text-[var(--ob-primary)]">
          Back to the book
        </Link>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Lifetime value"
            value={formatMoney(profile?.lifetimeValue ?? 0, currency)}
            hint={`${profile?.orders ?? 0} completed bills`}
            tone="up"
          />
          <StatCard
            label="Average bill"
            value={formatMoney(profile?.avgOrderValue ?? 0, currency)}
            hint={
              profile?.lastOrderAt
                ? `last seen ${formatDate(profile.lastOrderAt)}`
                : "no bill yet"
            }
          />
          <StatCard
            label="Outstanding dues"
            value={formatMoney(profile?.dues ?? 0, currency)}
            hint={
              profile && profile.billsWithDues
                ? `${profile.billsWithDues} bill${profile.billsWithDues === 1 ? "" : "s"} unpaid`
                : "everything settled"
            }
            tone={profile && profile.dues > 0 ? "down" : "neutral"}
          />
          <StatCard
            label="Points"
            value={String(profile?.loyaltyPoints ?? 0)}
            hint={tier ? `${tier.name} · ${tier.discount_percent}% off` : "no tier reached"}
          />
        </div>

        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-semibold">
                {customer.name}
                <Badge
                  tone={customer.status === "archived" ? "neutral" : "success"}
                  className="ml-2"
                >
                  {customer.status ?? "active"}
                </Badge>
                {customer.opted_out ? (
                  <Badge tone="danger" className="ml-2">
                    Opted out
                  </Badge>
                ) : customer.marketing_consent ? (
                  <Badge tone="demo" className="ml-2">
                    Marketing consent
                  </Badge>
                ) : (
                  <Badge tone="warning" className="ml-2">
                    No consent on file
                  </Badge>
                )}
                {profile?.membershipTierId && rules ? (
                  <Badge tone="success" className="ml-2">
                    Member ·{" "}
                    {tierById(rules, profile.membershipTierId)?.name ?? profile.membershipTierId}
                  </Badge>
                ) : null}
              </h2>
              <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                {[
                  customer.phone,
                  customer.email,
                  customer.source ? `from ${customer.source}` : null,
                  customer.price_tier === "wholesale" ? "wholesale prices" : null,
                  profile
                    ? `on file ${profile.daysSinceJoin} ${pluralize(profile.daysSinceJoin, "day")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {customer.tags?.length ? (
                <p className="mt-2 flex flex-wrap gap-1">
                  {customer.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/customers/directory?tags=${encodeURIComponent(tag)}`}
                      className="ob-tag ob-tag-leaf"
                    >
                      {tag}
                    </Link>
                  ))}
                </p>
              ) : null}
              {customer.address ? (
                <p className="mt-1 text-xs text-[var(--ob-text-muted)]">{customer.address}</p>
              ) : null}
              {customer.notes ? (
                <p className="mt-2 text-sm">{customer.notes}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/customers/interactions?customer=${encodeURIComponent(customer.id)}`}
                className="ob-press ob-btn-primary ob-touch-target rounded-full px-3 py-1.5 text-sm font-semibold"
              >
                Log an interaction
              </Link>
              <Link
                href="/customers/reviews"
                className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold"
              >
                Reviews desk
              </Link>
              <Link
                href="/customers/loyalty"
                className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5 text-sm font-semibold"
              >
                Points ledger
              </Link>
            </div>
          </div>

          <p className="mt-3 text-xs text-[var(--ob-text-muted)]">
            {profile?.openComplaints
              ? `${profile.openComplaints} complaint${profile.openComplaints === 1 ? "" : "s"} still open against this customer. `
              : "No complaints open against this name. "}
            {profile && profile.reviewCount
              ? `${profile.reviewCount} review${profile.reviewCount === 1 ? "" : "s"} averaging ${profile.avgRating} stars.`
              : "Nothing has been reviewed by them yet."}
          </p>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-4 lg:col-span-1">
            <h2 className="text-sm font-semibold">Billing details</h2>
            <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
              Name, phone and email are the same fields Billing writes — this is the customer
              record, not a copy of it.
            </p>
            <div className="mt-3">
              <CustomerEditor customer={customer} />
            </div>
          </Card>
          <Card className="p-4 lg:col-span-2">
            <h2 className="text-sm font-semibold">CRM fields</h2>
            <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
              Lifecycle status, price list, source, birthday, tags, consent and this
              brand&apos;s own custom fields. Consent decides who a campaign may list at all.
            </p>
            <div className="mt-3">
              <CustomerCrmEditor customer={customer} />
            </div>
          </Card>
        </div>

        <section aria-label="Customer timeline" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Everything on record</h2>
            <TimelineFilters
              counts={countByKind(events)}
              active={activeKinds}
              basePath={`/customers/${customer.id}`}
            />
          </div>
          <TimelineStream days={days} currencyCode={currency} total={events.length} />
        </section>

        <section aria-label="Bills" className="space-y-3">
          <h2 className="text-sm font-semibold">Bills</h2>
          <CustomerOrdersTable
            orders={orders}
            currencyCode={ws.settings.currency_code}
            orderNumberColumn={ws.profile.ordersNumberColumn}
          />
        </section>

        <section aria-label="Operations" className="space-y-3">
          <h2 className="text-sm font-semibold">Visits, jobs and appointments</h2>
          <CustomerOperationsTimeline rows={operationsRows} />
        </section>
      </div>
    </PageShell>
  );
}
