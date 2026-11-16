import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { Card } from "@/components/ui/card";
import {
  CrmChip,
  CrmKeyValue,
  CrmPanel,
  CrmSectionHeader,
  CrmStatRow,
  CrmSubnav,
  type CrmStat,
} from "@/components/crm/crm-ui";
import { InteractionForm } from "@/components/crm/interactions/interaction-form";
import {
  InteractionList,
  type InteractionView,
} from "@/components/crm/interactions/interaction-list";
import { FollowUpTaskButton } from "@/components/crm/interactions/follow-up-task-button";
import {
  customerById,
  leadById,
  loadCrmWorkspace,
  staffName,
  type CrmWorkspace,
} from "@/lib/crm/loader";
import { formatDate } from "@/lib/format";
import {
  INTERACTION_TYPES,
  INTERACTION_TYPE_LABELS,
  type Interaction,
  type InteractionType,
} from "@/types/crm";

type Search = {
  type?: string;
  staff?: string;
  customer?: string;
  due?: string;
  id?: string;
};

/**
 * Interaction log (CRM).
 *
 * Every call, meeting, visit and note a person records against a customer or a
 * lead. Filters live in `searchParams`, so a follow-up link from the overview
 * (`?id=`) or a "who owes a callback" view (`?due=1`) is a shareable URL rather
 * than client state.
 *
 * The numbers above the list are tallies of the interaction rows this brand
 * owns; the due list is the same set the CRM overview counts, taken from
 * `crm.overview.followUpsDue` rather than re-derived here.
 */
export default async function CrmInteractionsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const crm = await loadCrmWorkspace();
  if (!crm) redirect("/login");
  const sp = await searchParams;

  const typeFilter: InteractionType | "all" = INTERACTION_TYPES.includes(
    sp.type as InteractionType,
  )
    ? (sp.type as InteractionType)
    : "all";
  const staffFilter = crm.staff.some((person) => person.id === sp.staff)
    ? (sp.staff as string)
    : "";
  const customerFilter = crm.customers.some((c) => c.id === sp.customer)
    ? (sp.customer as string)
    : "";
  const dueView = sp.due === "1";

  const asOfDay = crm.asOf.slice(0, 10);
  const dueIds = new Set(
    crm.overview.followUpsDue.interactions.map((interaction) => interaction.id),
  );
  const overdueCount = crm.interactions.filter(
    (interaction) =>
      interaction.next_follow_up_at !== null &&
      interaction.next_follow_up_at.slice(0, 10) < asOfDay,
  ).length;

  const typeCounts = new Map<InteractionType, number>();
  const staffCounts = new Map<string, number>();
  for (const interaction of crm.interactions) {
    typeCounts.set(
      interaction.type,
      (typeCounts.get(interaction.type) ?? 0) + 1,
    );
    if (interaction.staff_id) {
      staffCounts.set(
        interaction.staff_id,
        (staffCounts.get(interaction.staff_id) ?? 0) + 1,
      );
    }
  }
  const withTaskCount = crm.interactions.filter((i) => i.task_id !== null).length;
  const activeCustomerIds = new Set(
    crm.interactions
      .map((interaction) => interaction.customer_id)
      .filter((id): id is string => Boolean(id)),
  );

  const visible = crm.interactions
    .filter((interaction) =>
      typeFilter === "all" ? true : interaction.type === typeFilter,
    )
    .filter((interaction) =>
      staffFilter ? interaction.staff_id === staffFilter : true,
    )
    .filter((interaction) =>
      customerFilter ? interaction.customer_id === customerFilter : true,
    )
    .filter((interaction) => (dueView ? dueIds.has(interaction.id) : true))
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

  const views: InteractionView[] = visible.map((interaction) => ({
    interaction,
    customerName: customerById(crm, interaction.customer_id)?.name ?? null,
    leadName: leadById(crm, interaction.lead_id)?.name ?? null,
    staffName: staffName(crm, interaction.staff_id),
    overdue:
      interaction.next_follow_up_at !== null &&
      interaction.next_follow_up_at.slice(0, 10) < asOfDay,
    due: dueIds.has(interaction.id),
  }));

  const focus = sp.id
    ? crm.interactions.find((interaction) => interaction.id === sp.id)
    : undefined;
  const shownIds = new Set(visible.map((interaction) => interaction.id));

  const buildHref = (changes: Partial<Search>) => {
    const next: Search = {
      type: typeFilter === "all" ? "" : typeFilter,
      staff: staffFilter,
      customer: customerFilter,
      due: dueView ? "1" : "",
      ...changes,
    };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== "all") params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `/customers/interactions?${qs}` : "/customers/interactions";
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
      label: "Logged",
      value: String(crm.interactions.length),
      hint: "Rows this brand has recorded",
    },
    {
      label: "Due for follow-up",
      value: String(dueIds.size),
      hint: overdueCount ? `${overdueCount} past their date` : "Nothing past its date",
      href: buildHref({ due: dueView ? "" : "1" }),
    },
    {
      label: "Turned into tasks",
      value: String(withTaskCount),
      hint: "One Productivity task per follow-up, at most",
    },
    {
      label: "Customers with activity",
      value: String(activeCustomerIds.size),
      hint: `of ${crm.customers.length} customers`,
    },
  ];

  const filtersOn =
    typeFilter !== "all" || Boolean(staffFilter) || Boolean(customerFilter) || dueView;

  return (
    <PageShell title="Interactions">
      <CrmSubnav />
      <CrmSectionHeader
        title="Interaction log"
        description="What happened with a customer or a lead — calls, WhatsApp, emails, meetings, visits and internal notes, each recorded by the person who handled it. Nothing here sends anything."
      />

      <CrmStatRow stats={stats} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          {crm.canLog ? (
            <InteractionForm
              customers={crm.customers.map((customer) => ({
                id: customer.id,
                name: customer.name,
              }))}
              leads={crm.leads.map((lead) => ({ id: lead.id, name: lead.name }))}
              staff={crm.staff}
            />
          ) : (
            <Card className="p-4">
              <h2 className="font-semibold">Read-only</h2>
              <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                Your role can read the interaction log but not record activity.
                Ask an owner, admin or manager to log a call.
              </p>
            </Card>
          )}
        </div>

        <div className="space-y-2 lg:col-span-2">
          {chipGroup(
            "Type",
            [
              { value: "all", label: "Any type" },
              ...INTERACTION_TYPES.filter((type) => (typeCounts.get(type) ?? 0) > 0).map(
                (type) => ({
                  value: type,
                  label: `${INTERACTION_TYPE_LABELS[type]} (${typeCounts.get(type)})`,
                }),
              ),
            ],
            typeFilter,
            "type",
            (value) => ({ type: value }),
          )}
          {crm.staff.length > 0
            ? chipGroup(
                "Staff",
                [
                  { value: "", label: "Anyone" },
                  ...crm.staff
                    .filter((person) => (staffCounts.get(person.id) ?? 0) > 0)
                    .map((person) => ({
                      value: person.id,
                      label: `${person.name} (${staffCounts.get(person.id)})`,
                    })),
                ],
                staffFilter,
                "staff",
                (value) => ({ staff: value }),
              )
            : null}
          {chipGroup(
            "Follow-up",
            [
              { value: "", label: "All rows" },
              { value: "1", label: `Due for follow-up (${dueIds.size})` },
            ],
            dueView ? "1" : "",
            "due",
            (value) => ({ due: value }),
          )}
          {crm.customers.length > 0 ? (
            <form
              method="GET"
              action="/customers/interactions"
              className="flex flex-wrap items-end gap-2"
            >
              <label className="block text-xs">
                <span className="text-[var(--ob-text-muted)]">Customer</span>
                <div className="mt-1">
                  <select
                    className="ob-input"
                    name="customer"
                    defaultValue={customerFilter}
                    aria-label="Filter by customer"
                  >
                    <option value="">Any customer</option>
                    {crm.customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              {/* Filters that are already on survive the submit. */}
              {typeFilter !== "all" ? (
                <input type="hidden" name="type" value={typeFilter} />
              ) : null}
              {staffFilter ? (
                <input type="hidden" name="staff" value={staffFilter} />
              ) : null}
              {dueView ? <input type="hidden" name="due" value="1" /> : null}
              <button
                type="submit"
                className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 py-1.5 text-xs font-medium text-[var(--ob-text-secondary)] hover:bg-[var(--ob-surface-muted)]"
              >
                Apply
              </button>
            </form>
          ) : null}
          {filtersOn ? (
            <Link
              href="/customers/interactions"
              className="ob-touch-target inline-block text-xs text-[var(--ob-primary)]"
            >
              Clear all filters
            </Link>
          ) : null}
        </div>
      </div>

      {focus && !shownIds.has(focus.id) ? (
        <CrmPanel
          title="Selected interaction"
          meta="Outside the current filters"
          className="mt-4"
        >
          <InteractionDetail interaction={focus} crm={crm} canLog={crm.canLog} />
        </CrmPanel>
      ) : null}

      <div className="mt-4">
        <InteractionList
          views={views}
          canLog={crm.canLog}
          emptyTitle={
            crm.interactions.length ? "Nothing matches these filters" : "No interactions logged yet"
          }
          emptyDescription={
            crm.interactions.length
              ? "Clear a filter above, or log a new interaction on the left."
              : "Record the first call, meeting or visit and it appears here with its follow-up date."
          }
        />
      </div>
    </PageShell>
  );
}

/** The `?id=` deep link target: the whole row, not a truncated table cell. */
function InteractionDetail({
  interaction,
  crm,
  canLog,
}: {
  interaction: Interaction;
  crm: CrmWorkspace;
  canLog: boolean;
}) {
  const customer = customerById(crm, interaction.customer_id);
  const lead = leadById(crm, interaction.lead_id);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CrmChip>{INTERACTION_TYPE_LABELS[interaction.type]}</CrmChip>
        <span className="text-sm font-medium">
          {interaction.subject ?? "Untitled log"}
        </span>
      </div>
      <p className="text-sm text-[var(--ob-text-secondary)]">
        {interaction.description}
      </p>
      <CrmKeyValue
        items={[
          { label: "Happened", value: formatDate(interaction.occurred_at) },
          { label: "Recorded", value: formatDate(interaction.created_at) },
          { label: "By", value: staffName(crm, interaction.staff_id) ?? "Not recorded" },
          {
            label: "Customer",
            value: customer ? (
              <Link
                href={`/customers/${customer.id}`}
                className="text-[var(--ob-primary)] hover:underline"
              >
                {customer.name}
              </Link>
            ) : (
              "—"
            ),
          },
          {
            label: "Lead",
            value: lead ? (
              <Link
                href={`/customers/leads?id=${lead.id}`}
                className="text-[var(--ob-primary)] hover:underline"
              >
                {lead.name}
              </Link>
            ) : (
              "—"
            ),
          },
          { label: "Outcome", value: interaction.outcome ?? "—" },
          {
            label: "Next follow-up",
            value: interaction.next_follow_up_at
              ? interaction.next_follow_up_at.slice(0, 10)
              : "None set",
          },
        ]}
      />
      <FollowUpTaskButton
        interactionId={interaction.id}
        taskId={interaction.task_id}
        dueDate={interaction.next_follow_up_at}
        canLog={canLog}
      />
    </div>
  );
}
