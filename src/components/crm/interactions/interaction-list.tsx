import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { CrmChip, CrmPanel } from "@/components/crm/crm-ui";
import { FollowUpTaskButton } from "@/components/crm/interactions/follow-up-task-button";
import { formatDate } from "@/lib/format";
import { INTERACTION_TYPE_LABELS, type Interaction } from "@/types/crm";

/** One logged interaction with the names its ids resolve to. */
export type InteractionView = {
  interaction: Interaction;
  customerName: string | null;
  leadName: string | null;
  staffName: string | null;
  /** Follow-up date already passed. */
  overdue: boolean;
  /** In the follow-ups-due window the CRM overview uses. */
  due: boolean;
};

/**
 * The activity log: cards on mobile, one scrollable table on larger screens.
 *
 * A row is a record of something a person already did — the wording says
 * "logged", never "sent". The follow-up column is the only forward-looking
 * thing here, and it is a date someone set.
 */
export function InteractionList({
  views,
  canLog,
  emptyTitle,
  emptyDescription,
}: {
  views: InteractionView[];
  canLog: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (!views.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      <ul className="ob-stagger space-y-3 md:hidden">
        {views.map((view) => (
          <li
            key={view.interaction.id}
            id={`interaction-${view.interaction.id}`}
            className="crm-surface ob-card rounded-[var(--ob-radius-md)] p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/customers/interactions?id=${view.interaction.id}`}
                className="min-w-0 truncate text-sm font-semibold text-[var(--ob-primary)]"
              >
                {view.interaction.subject ?? INTERACTION_TYPE_LABELS[view.interaction.type]}
              </Link>
              <CrmChip>{INTERACTION_TYPE_LABELS[view.interaction.type]}</CrmChip>
            </div>
            <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
              {formatDate(view.interaction.occurred_at)}
              {view.staffName ? ` · ${view.staffName}` : ""}
            </p>
            <WhoLine view={view} />
            <p className="mt-2 line-clamp-3 text-sm text-[var(--ob-text-secondary)]">
              {view.interaction.description}
            </p>
            {view.interaction.outcome ? (
              <p className="mt-2 text-xs">
                <span className="text-[var(--ob-text-muted)]">Outcome: </span>
                {view.interaction.outcome}
              </p>
            ) : null}
            <FollowUpLine view={view} canLog={canLog} className="mt-3" />
          </li>
        ))}
      </ul>

      <CrmPanel title="Activity log" meta={`${views.length} shown`} className="hidden md:block">
        <div className="ob-scroll-x -mx-4 -my-4">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-[var(--ob-text-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">Subject and notes</th>
                <th className="px-3 py-2 font-medium">Outcome</th>
                <th className="px-3 py-2 font-medium">Next follow-up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ob-border)]">
              {views.map((view) => {
                const interaction = view.interaction;
                return (
                  <tr
                    key={interaction.id}
                    data-interaction-id={interaction.id}
                    className="hover:bg-[var(--ob-surface-muted)]"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--ob-text-muted)]">
                      {formatDate(interaction.occurred_at)}
                    </td>
                    <td className="px-3 py-2">
                      <CrmChip>{INTERACTION_TYPE_LABELS[interaction.type]}</CrmChip>
                    </td>
                    <td className="px-3 py-2">
                      <WhoLine view={view} inline />
                      {view.staffName ? (
                        <p className="mt-0.5 text-xs text-[var(--ob-text-muted)]">
                          {view.staffName}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/customers/interactions?id=${interaction.id}`}
                        className="font-medium text-[var(--ob-primary)] hover:underline"
                      >
                        {interaction.subject ?? "Untitled log"}
                      </Link>
                      <p className="mt-0.5 max-w-prose text-xs text-[var(--ob-text-secondary)]">
                        {interaction.description}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {interaction.outcome ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <FollowUpLine view={view} canLog={canLog} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CrmPanel>
    </>
  );
}

function WhoLine({ view, inline = false }: { view: InteractionView; inline?: boolean }) {
  const { interaction, customerName, leadName } = view;
  const parts: React.ReactNode[] = [];
  if (interaction.customer_id) {
    parts.push(
      <Link
        key="customer"
        href={`/customers/${interaction.customer_id}`}
        className="text-[var(--ob-primary)] hover:underline"
      >
        {customerName ?? "Customer"}
      </Link>,
    );
  }
  if (interaction.lead_id) {
    parts.push(
      <Link
        key="lead"
        href={`/customers/leads?id=${interaction.lead_id}`}
        className="text-[var(--ob-primary)] hover:underline"
      >
        {leadName ?? "Lead"}
      </Link>,
    );
  }
  if (!parts.length) {
    return <p className="mt-1 text-xs text-[var(--ob-text-muted)]">Not linked</p>;
  }
  return (
    <p className={inline ? "text-sm" : "mt-1 flex flex-wrap gap-2 text-xs"}>
      {parts}
    </p>
  );
}

function FollowUpLine({
  view,
  canLog,
  className,
}: {
  view: InteractionView;
  canLog: boolean;
  className?: string;
}) {
  const interaction = view.interaction;
  return (
    <div className={className ? `flex flex-wrap items-center gap-2 ${className}` : "flex flex-wrap items-center gap-2"}>
      {interaction.next_follow_up_at ? (
        <CrmChip tone={view.overdue ? "danger" : view.due ? "warning" : "neutral"}>
          {view.overdue ? "Overdue" : view.due ? "Due" : "Follow-up"}{" "}
          {interaction.next_follow_up_at.slice(0, 10)}
        </CrmChip>
      ) : (
        <span className="text-xs text-[var(--ob-text-muted)]">No follow-up set</span>
      )}
      <FollowUpTaskButton
        interactionId={interaction.id}
        taskId={interaction.task_id}
        dueDate={interaction.next_follow_up_at}
        canLog={canLog}
      />
    </div>
  );
}
