import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { CsvExportButton } from "@/components/export/csv-export-button";
import { CustomerSearchBar } from "@/components/customers/customer-search-bar";
import {
  CrmChip,
  CrmNotice,
  CrmPanel,
  CrmSectionHeader,
  CrmStageChip,
  CrmStatRow,
  CrmSubnav,
  type CrmStat,
} from "@/components/crm/crm-ui";
import { LeadCard } from "@/components/crm/leads/lead-card";
import { LeadForm } from "@/components/crm/leads/lead-form";
import {
  customerById,
  leadById,
  loadCrmWorkspace,
  staffName,
} from "@/lib/crm/loader";
import { exportLeadsCsvAction } from "@/services/crm-lead-actions";
import { formatMoney } from "@/lib/format";
import { LEAD_STAGES, LEAD_STAGE_LABELS, type Lead, type LeadStage } from "@/types/crm";

const CLOSED_STAGES: LeadStage[] = ["won", "lost"];

type Search = {
  stage?: string;
  owner?: string;
  source?: string;
  q?: string;
  id?: string;
  new?: string;
  notice?: string;
  error?: string;
};

/**
 * The lead pipeline.
 *
 * Grouped by `LeadStage`, filtered entirely from `searchParams` so any view is
 * a shareable link and the back button behaves. Counts are tallied from the
 * lead rows this brand owns — no stage is ever shown with a number the board
 * does not actually contain.
 */
export default async function CrmLeadsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const crm = await loadCrmWorkspace();
  if (!crm) redirect("/login");
  const sp = await searchParams;

  const stageFilter: LeadStage | "all" = LEAD_STAGES.includes(sp.stage as LeadStage)
    ? (sp.stage as LeadStage)
    : "all";
  // A filter id that is not this brand's staff/source resolves to "no filter",
  // the same way the repository treats a foreign row as invisible.
  const ownerFilter = crm.staff.some((person) => person.id === sp.owner)
    ? (sp.owner as string)
    : "";
  const leadSources = Array.from(
    new Set(
      crm.leads
        .map((lead) => lead.source)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort();
  const sourceFilter = leadSources.includes(sp.source ?? "")
    ? (sp.source as string)
    : "";
  const query = sp.q?.trim().toLowerCase() ?? "";
  const focusLead = sp.id ? leadById(crm, sp.id) : undefined;
  const showNewForm = sp.new === "1";

  // The board's own tally: `leadsByStage` counts the same lead rows this page
  // lists, so a column header can never show a number the columns disagree with.
  const countFor = (stage: LeadStage) => crm.overview.leadsByStage[stage] ?? 0;

  const openLeads = crm.leads.filter(
    (lead) => !CLOSED_STAGES.includes(lead.stage),
  );
  const openPipelineValue = openLeads.reduce(
    (sum, lead) => sum + (Number.isFinite(lead.estimated_value) ? lead.estimated_value : 0),
    0,
  );
  const conversion =
    crm.overview.totals.leadConversionRate === null
      ? "—"
      : `${Math.round(crm.overview.totals.leadConversionRate)}%`;

  const ownerCounts = new Map<string, number>();
  for (const lead of crm.leads) {
    if (!lead.assigned_staff_id) continue;
    ownerCounts.set(
      lead.assigned_staff_id,
      (ownerCounts.get(lead.assigned_staff_id) ?? 0) + 1,
    );
  }
  const sourceCounts = new Map<string, number>();
  for (const lead of crm.leads) {
    if (!lead.source) continue;
    sourceCounts.set(lead.source, (sourceCounts.get(lead.source) ?? 0) + 1);
  }

  const matchesQuery = (lead: Lead) =>
    !query ||
    lead.name.toLowerCase().includes(query) ||
    (lead.company ?? "").toLowerCase().includes(query) ||
    (lead.phone ?? "").toLowerCase().includes(query) ||
    (lead.email ?? "").toLowerCase().includes(query);

  const rows = crm.leads
    .filter((lead) => (ownerFilter ? lead.assigned_staff_id === ownerFilter : true))
    .filter((lead) => (sourceFilter ? lead.source === sourceFilter : true))
    .filter(matchesQuery)
    .sort((a, b) => {
      const left = a.next_follow_up_at ?? "9999";
      const right = b.next_follow_up_at ?? "9999";
      return (
        left.localeCompare(right) ||
        b.estimated_value - a.estimated_value ||
        a.name.localeCompare(b.name)
      );
    });

  const visibleIds = new Set(rows.map((lead) => lead.id));
  const stagesToShow = stageFilter === "all" ? LEAD_STAGES : [stageFilter];

  const formSources = Array.from(
    new Set([
      ...(crm.settings.lead_sources ?? []),
      ...leadSources,
    ]),
  ).sort();

  const buildHref = (changes: Partial<Search>) => {
    const next: Search = {
      stage: stageFilter === "all" ? "" : stageFilter,
      owner: ownerFilter,
      source: sourceFilter,
      q: query,
      new: showNewForm ? "1" : "",
      ...changes,
    };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== "all") params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `/customers/leads?${qs}` : "/customers/leads";
  };

  const chipGroup = (
    label: string,
    options: { value: string; label: string }[],
    active: string,
    keyPrefix: string,
    apply: (value: string) => Partial<Search>,
  ) => (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="text-[var(--ob-text-muted)]">{label}</span>
      {options.map((option) => {
        const selected = option.value === active;
        return (
          <Link
            key={`${keyPrefix}-${option.value || "all"}`}
            href={buildHref(apply(option.value))}
            aria-pressed={selected}
            className={
              selected
                ? "rounded-full border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-2 py-0.5 font-medium text-[var(--crm-lab-strong)]"
                : "rounded-full border border-[var(--ob-border)] px-2 py-0.5 text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]"
            }
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );

  const stats: CrmStat[] = [
    {
      label: "Open leads",
      value: String(openLeads.length),
      hint: `${crm.leads.length} leads in total`,
    },
    {
      label: "Open value",
      value: formatMoney(openPipelineValue, crm.currencyCode),
      hint: "Sum of estimated values, open stages only",
    },
    {
      label: "Won",
      value: String(countFor("won")),
      hint: `${conversion} of closed leads won`,
      href: buildHref({ stage: "won", owner: "", source: "" }),
    },
    {
      label: "Lost",
      value: String(countFor("lost")),
      hint: "Every lost lead keeps its reason",
      href: buildHref({ stage: "lost", owner: "", source: "" }),
    },
  ];

  const cardProps = (lead: Lead) => ({
    lead,
    staff: crm.staff,
    sources: formSources,
    currencyCode: crm.currencyCode,
    asOf: crm.asOf,
    ownerName: staffName(crm, lead.assigned_staff_id),
    convertedCustomer: (() => {
      const customer = customerById(crm, lead.customer_id);
      return customer ? { id: customer.id, name: customer.name } : null;
    })(),
    canLog: crm.canLog,
    canManage: crm.canManage,
  });

  return (
    <PageShell
      title="Leads"
      headerActions={
        <CsvExportButton label="Export leads" onExport={exportLeadsCsvAction} />
      }
    >
      <CrmSubnav />
      <CrmNotice notice={sp.notice} error={sp.error} />
      <CrmSectionHeader
        title="Lead pipeline"
        description="Enquiries grouped by stage. Moving a card records the stage change; a lost lead has to say why, and a won lead converts into the app's one customer record."
        actions={
          crm.canLog ? (
            <Link
              href={buildHref({ new: "1" })}
              className="ob-touch-target rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-3 py-1.5 text-sm font-medium text-[var(--crm-leaf)]"
            >
              Add a lead
            </Link>
          ) : null
        }
      />

      <CrmStatRow stats={stats} />

      <div className="mb-4 space-y-2">
        <Suspense
          fallback={
            <div className="h-10 max-w-md animate-pulse rounded-md bg-[var(--ob-surface-muted)]" />
          }
        >
          <CustomerSearchBar initialQuery={query} basePath="/customers/leads" />
        </Suspense>
        {chipGroup(
          "Stage",
          [
            { value: "all", label: "All stages" },
            ...LEAD_STAGES.map((stage) => ({
              value: stage,
              label: `${LEAD_STAGE_LABELS[stage]} (${countFor(stage)})`,
            })),
          ],
          stageFilter,
          "stage",
          (value) => ({ stage: value }),
        )}
        {crm.staff.length > 0
          ? chipGroup(
              "Owner",
              [
                { value: "", label: `Anyone (${crm.leads.length})` },
                ...crm.staff
                  .filter((person) => (ownerCounts.get(person.id) ?? 0) > 0)
                  .map((person) => ({
                    value: person.id,
                    label: `${person.name} (${ownerCounts.get(person.id)})`,
                  })),
              ],
              ownerFilter,
              "owner",
              (value) => ({ owner: value }),
            )
          : null}
        {leadSources.length > 0
          ? chipGroup(
              "Source",
              [
                { value: "", label: "Any source" },
                ...leadSources.map((value) => ({
                  value,
                  label: `${value} (${sourceCounts.get(value) ?? 0})`,
                })),
              ],
              sourceFilter,
              "source",
              (value) => ({ source: value }),
            )
          : null}
        {(stageFilter !== "all" || ownerFilter || sourceFilter || query) &&
        !showNewForm ? (
          <Link
            href="/customers/leads"
            className="ob-touch-target inline-block text-xs text-[var(--ob-primary)]"
          >
            Clear all filters
          </Link>
        ) : null}
      </div>

      {showNewForm ? (
        <div className="mb-4">
          <LeadForm
            lead={null}
            staff={crm.staff}
            sources={formSources}
            currencyCode={crm.currencyCode}
            autoFocus
          />
        </div>
      ) : null}

      {focusLead && !visibleIds.has(focusLead.id) ? (
        <CrmPanel
          title="Focused lead"
          meta="Outside the current filters"
          className="mb-4"
        >
          <p className="mb-3 text-xs text-[var(--ob-text-muted)]">
            Opened from a deep link. This lead is not in the filtered board
            above, so it is shown here instead of in a column.
          </p>
          <ul className="space-y-3">
            <LeadCard key={focusLead.id} {...cardProps(focusLead)} focused />
          </ul>
        </CrmPanel>
      ) : null}

      {crm.leads.length === 0 ? (
        <EmptyState
          title="No leads yet"
          description="Add the first enquiry and it lands in New. Every stage afterwards is a choice you make here."
        />
      ) : (
        <div className="ob-stagger grid gap-4 xl:grid-cols-2">
          {stagesToShow.map((stage) => {
            const inStage = rows.filter((lead) => lead.stage === stage);
            return (
              <CrmPanel
                key={stage}
                title={LEAD_STAGE_LABELS[stage]}
                meta={
                  stageFilter === "all"
                    ? `${inStage.length} of ${countFor(stage)}`
                    : `${inStage.length} shown`
                }
              >
                {inStage.length === 0 ? (
                  <p className="text-sm text-[var(--ob-text-muted)]">
                    {countFor(stage) === 0
                      ? "No leads at this stage."
                      : "Nothing at this stage matches the filters above."}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {inStage.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        {...cardProps(lead)}
                        focused={focusLead?.id === lead.id}
                      />
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <CrmStageChip stage={stage} label={LEAD_STAGE_LABELS[stage]} />
                  <CrmChip>{countFor(stage)} in total</CrmChip>
                  {stageFilter === stage ? null : (
                    <Link
                      href={buildHref({ stage, owner: "", source: "" })}
                      className="ob-touch-target ml-auto text-xs text-[var(--ob-primary)]"
                    >
                      Only this stage →
                    </Link>
                  )}
                </div>
              </CrmPanel>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
