import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { PageShell } from "@/components/workspace/page-shell";
import { CrmSubnav } from "@/components/crm/crm-subnav";
import { loadCrmWorkspace } from "@/lib/crm/data";
import { buildCustomerProfiles, crmOverview } from "@/lib/crm/metrics";
import { dueFollowUps } from "@/lib/crm/interactions";
import { isCampaignLive } from "@/lib/crm/campaigns";
import { loyaltySummary } from "@/lib/crm/loyalty";
import { OPEN_LEAD_STAGES } from "@/lib/manager/leads";
import { formatMoney, pluralize } from "@/lib/format";
import { CRM_MODULES } from "@/lib/workspace/crm-modules";
import { toDemoBrandCode } from "@/lib/demo/data";
import { loadWorkspaceSession } from "@/lib/workspace/session";

function AttentionRow({
  href,
  label,
  count,
  hint,
  tone,
}: {
  href: string;
  label: string;
  count: number;
  hint: string;
  tone?: "warning" | "danger";
}) {
  if (count === 0) return null;
  return (
    <li>
      <Link
        href={href}
        className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--ob-radius-md)] border border-[var(--ob-line)] px-3 py-2 text-sm hover:border-[var(--ob-line-hover)] hover:bg-[var(--ob-tint-wash)]"
      >
        <span>
          <span className="font-medium">{label}</span>
          <span className="block text-xs text-[var(--ob-text-muted)]">{hint}</span>
        </span>
        <Badge tone={tone ?? "neutral"}>{count}</Badge>
      </Link>
    </li>
  );
}

export default async function CrmOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const { q } = await searchParams;
  // The old page searched from here. The directory owns search now, so a
  // bookmarked or linked `?q=` keeps working instead of silently ignored.
  if (q?.trim()) redirect(`/customers/directory?q=${encodeURIComponent(q.trim())}`);

  const code = toDemoBrandCode(ws.brand.code);
  const workspace = await loadCrmWorkspace(code);
  const profiles = buildCustomerProfiles(workspace);
  const now = new Date();
  const due = dueFollowUps(workspace.interactions, now);

  const overview = crmOverview({
    profiles,
    orders: workspace.orders,
    leads: workspace.leads,
    complaints: workspace.complaints,
    reviews: workspace.reviews,
    followUpsDue: due.length,
    openLeadStages: OPEN_LEAD_STAGES,
    now,
  });

  const loyalty = loyaltySummary({
    rules: workspace.loyaltyRules,
    entries: workspace.loyaltyLedger,
    lifetimeValueByCustomer: new Map(profiles.map((p) => [p.customer.id, p.lifetimeValue])),
    now,
  });

  const liveCampaigns = workspace.campaigns.filter((c) => isCampaignLive(c, now)).length;
  const openLeads = overview.openLeads;
  const currency = workspace.currencyCode;

  const counts: Record<string, { value: string; href: string }> = {
    directory: { value: `${overview.totalCustomers} on file`, href: "/customers/directory" },
    leads: { value: `${openLeads} open`, href: "/customers/leads" },
    interactions: { value: `${due.length} due`, href: "/customers/interactions" },
    reviews: {
      value: `${overview.reviewsAwaitingReply} awaiting a reply`,
      href: "/customers/reviews",
    },
    segments: { value: `${workspace.segments.length} saved`, href: "/customers/segments" },
    campaigns: { value: `${liveCampaigns} running`, href: "/customers/campaigns" },
    loyalty: {
      value: `${loyalty.members} ${pluralize(loyalty.members, "member")}`,
      href: "/customers/loyalty",
    },
  };

  return (
    <PageShell title="CRM Overview">
      <CrmSubnav activeHref="/customers" />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Customers"
            value={String(overview.totalCustomers)}
            hint={`${overview.activeCustomers} active · ${overview.newCustomers30d} joined in 30 days`}
          />
          <StatCard
            label="Revenue, last 30 days"
            value={formatMoney(overview.revenue30d, currency)}
            hint={`${overview.bills30d} completed ${pluralize(overview.bills30d, "bill")}`}
            tone="up"
          />
          <StatCard
            label="Outstanding dues"
            value={formatMoney(overview.totalDues, currency)}
            hint={`${overview.customersWithDues} ${pluralize(overview.customersWithDues, "customer")}`}
            tone={overview.totalDues > 0 ? "down" : "neutral"}
          />
          <StatCard
            label="Open pipeline"
            value={formatMoney(overview.pipelineValue, currency)}
            hint={`${openLeads} enquiries not yet won or lost`}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="p-4">
            <h2 className="font-semibold">Needs attention</h2>
            <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
              Counted from the rows on file the moment this page rendered — each one opens the
              list already filtered.
            </p>
            <ul className="mt-3 space-y-2">
              <AttentionRow
                href="/customers/interactions"
                label="Follow-ups overdue"
                count={overview.followUpsDue}
                hint="Logged touches whose next step has passed its date"
                tone="danger"
              />
              <AttentionRow
                href="/customers/reviews"
                label="Reviews awaiting a reply"
                count={overview.reviewsAwaitingReply}
                hint="Nothing answered yet, low ratings first"
                tone="warning"
              />
              <AttentionRow
                href="/customers/reviews"
                label="Open complaints"
                count={overview.openComplaints}
                hint={`${overview.highSeverityComplaints} of them high severity`}
                tone={overview.highSeverityComplaints > 0 ? "danger" : "warning"}
              />
              <AttentionRow
                href="/customers/directory?health=dues"
                label="Customers with dues"
                count={overview.customersWithDues}
                hint={`${formatMoney(overview.totalDues, currency)} still to collect`}
              />
              <AttentionRow
                href="/customers/directory?health=at_risk"
                label="Slipping away"
                count={overview.atRiskCustomers}
                hint="Bought before, quiet for 45 days or more"
                tone="warning"
              />
              <AttentionRow
                href="/customers/directory?health=dormant"
                label="Dormant"
                count={overview.dormantCustomers}
                hint="No purchase for 120 days or more"
              />
              <AttentionRow
                href="/customers/directory?health=birthdays"
                label="Birthdays this month"
                count={overview.birthdayCustomers}
                hint="Worth a message before the day"
              />
              {overview.followUpsDue === 0 &&
              overview.reviewsAwaitingReply === 0 &&
              overview.openComplaints === 0 &&
              overview.customersWithDues === 0 &&
              overview.atRiskCustomers === 0 &&
              overview.dormantCustomers === 0 &&
              overview.birthdayCustomers === 0 ? (
                <li className="text-sm text-[var(--ob-text-muted)]">
                  Nothing is waiting on you right now.
                </li>
              ) : null}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold">Modules</h2>
            <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
              Each one is a separate screen with its own filters and its own actions; none of
              them keeps a second copy of a customer.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {CRM_MODULES.map((module) => (
                <li key={module.key}>
                  <Link
                    href={module.href}
                    className="block h-full rounded-[var(--ob-radius-md)] border border-[var(--ob-line)] px-3 py-2 hover:border-[var(--ob-line-hover)] hover:bg-[var(--ob-tint-wash)]"
                  >
                    <p className="text-sm font-medium">
                      {module.label}
                      <span className="ob-num ml-2 text-xs text-[var(--ob-text-muted)]">
                        {counts[module.key]?.value}
                      </span>
                    </p>
                    <p className="text-xs text-[var(--ob-text-muted)]">{module.description}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">Top five by lifetime spend</h2>
              <Link
                href="/customers/directory?sort=lifetime&dir=desc"
                className="text-xs text-[var(--ob-primary)] hover:underline"
              >
                Whole book
              </Link>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {overview.topSpenders.map((profile) => (
                <li key={profile.customer.id} className="flex flex-wrap justify-between gap-2">
                  <Link
                    href={`/customers/${profile.customer.id}`}
                    className="text-[var(--ob-primary)] hover:underline"
                  >
                    {profile.customer.name}
                  </Link>
                  <span className="ob-num text-[var(--ob-text-muted)]">
                    {formatMoney(profile.lifetimeValue, currency)} · {profile.orders} {pluralize(profile.orders, "bill")} ·{" "}
                    {profile.loyaltyPoints} pts
                  </span>
                </li>
              ))}
              {overview.topSpenders.length === 0 ? (
                <li className="text-[var(--ob-text-muted)]">Nobody has a completed bill yet.</li>
              ) : null}
            </ul>
          </Card>

          <Card className="p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">Worth a call this week</h2>
              <Link
                href="/customers/directory?health=at_risk"
                className="text-xs text-[var(--ob-primary)] hover:underline"
              >
                All at risk
              </Link>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {overview.atRiskList.slice(0, 5).map((profile) => (
                <li key={profile.customer.id} className="flex flex-wrap justify-between gap-2">
                  <Link
                    href={`/customers/${profile.customer.id}`}
                    className="text-[var(--ob-primary)] hover:underline"
                  >
                    {profile.customer.name}
                  </Link>
                  <span className="ob-num text-[var(--ob-text-muted)]">
                    {profile.daysSinceLastOrder ?? 0} days quiet
                    {profile.dues > 0
                      ? ` · ${formatMoney(profile.dues, currency)} owed`
                      : ""}
                  </span>
                </li>
              ))}
              {overview.atRiskList.length === 0 ? (
                <li className="text-[var(--ob-text-muted)]">
                  Nobody has gone quiet — every buyer has been seen recently.
                </li>
              ) : null}
            </ul>
          </Card>
        </div>

        <Card className="p-4 text-sm text-[var(--ob-text-muted)]">
          Every figure above is a count or a sum taken straight from the rows on this brand —
          bills, payments, leads, ledger entries. Nothing on this page is estimated by a model,
          so the same data always gives the same number.
        </Card>
      </div>
    </PageShell>
  );
}
