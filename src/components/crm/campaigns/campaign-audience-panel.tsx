import Link from "next/link";
import {
  CrmChip,
  CrmPanel,
  CrmStatRow,
  type CrmStat,
} from "@/components/crm/crm-ui";
import {
  AudienceRebuildButton,
  CampaignAudienceExportButton,
} from "@/components/crm/campaigns/campaign-audience-controls";
import {
  RECIPIENT_STATUS_LABELS,
  RECIPIENT_STATUS_TONES,
} from "@/components/crm/campaigns/campaign-options";
import { RecipientOutcomeControls } from "@/components/crm/campaigns/recipient-outcome-controls";
import { formatDate, formatMoney } from "@/lib/format";
import type { RecipientStatus } from "@/types/crm";

/**
 * The audience half of the campaign screen.
 *
 * Every number here is a tally of recipient rows, and every row says when a
 * person recorded it. Nothing in this panel was sent by the app, and nobody
 * without granted marketing consent appears as a recipient.
 */

export type CampaignRecipientRow = {
  id: string;
  customerId: string | null;
  name: string;
  contact: string | null;
  status: RecipientStatus;
  markedSentAt: string | null;
  respondedAt: string | null;
  redeemedAt: string | null;
  orderLabel: string | null;
  orderAmount: number | null;
  note: string | null;
  /** The consent gate, re-checked live for this read. */
  contactable: boolean;
  exclusionReason: string | null;
  orders: { id: string; label: string }[];
};

export type CampaignTallies = {
  targeted_count: number;
  marked_sent_count: number;
  response_count: number;
  redemption_count: number;
  revenue_attributed: number;
};

function when(value: string | null): string {
  return value ? formatDate(value) : "—";
}

export function CampaignAudiencePanel({
  campaignId,
  campaignName,
  segmentId,
  segmentName,
  currencyCode,
  canManage,
  tallies,
  lastRecorded,
  recipients,
  excluded,
  audience,
  shownLimit,
}: {
  campaignId: string;
  campaignName: string;
  segmentId: string | null;
  segmentName: string | null;
  currencyCode: string;
  canManage: boolean;
  /** Recounted from recipient rows on this read. */
  tallies: CampaignTallies;
  lastRecorded: {
    selected: string | null;
    sent: string | null;
    responded: string | null;
    redeemed: string | null;
  };
  recipients: CampaignRecipientRow[];
  /** Segment members the consent gate keeps out. */
  excluded: { id: string; name: string; reason: string | null }[];
  audience: { matched: number; contactable: number };
  /** Set when the list was too long to render in full. */
  shownLimit: number | null;
}) {
  const money = (value: number) => formatMoney(value, currencyCode);
  const contactableRows = recipients.filter((row) => row.contactable);
  const staleRows = recipients.filter((row) => !row.contactable);

  const stats: CrmStat[] = [
    {
      label: "Targeted",
      value: String(tallies.targeted_count),
      hint: lastRecorded.selected
        ? `Rows added ${when(lastRecorded.selected)}`
        : "No recipient rows yet",
    },
    {
      label: "Marked sent",
      value: String(tallies.marked_sent_count),
      hint: lastRecorded.sent
        ? `Last recorded ${when(lastRecorded.sent)}`
        : "Nobody recorded as contacted",
    },
    {
      label: "Responded",
      value: String(tallies.response_count),
      hint: lastRecorded.responded
        ? `Last recorded ${when(lastRecorded.responded)}`
        : "No responses recorded",
    },
    {
      label: "Redeemed",
      value: String(tallies.redemption_count),
      hint: lastRecorded.redeemed
        ? `Last recorded ${when(lastRecorded.redeemed)}`
        : "No redemptions recorded",
    },
  ];

  return (
    <div className="space-y-4">
      <CrmStatRow stats={stats} />

      <CrmPanel
        title="Audience"
        meta={`recounted from ${tallies.targeted_count} recipient rows`}
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <AudienceRebuildButton campaignId={campaignId} />
              <CampaignAudienceExportButton campaignId={campaignId} />
            </div>
          ) : null
        }
      >
        <p className="text-sm">
          Revenue attributed:{" "}
          <span className="text-base font-semibold">{money(tallies.revenue_attributed)}</span>
          <span className="ml-2 text-xs text-[var(--ob-text-muted)]">
            only from redemptions that carry a real order
          </span>
        </p>

        <p className="mt-3 rounded-[var(--ob-radius-md)] border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] p-3 text-sm">
          <strong className="font-semibold">
            OrderBook does not send this campaign to anybody.
          </strong>{" "}
          A person exports or reads out the contact list, contacts people
          themselves, and comes back to record what happened. Every count above
          is a tally of those recorded moments — there are no open rates, no
          delivery states and no estimates.
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ob-text-muted)]">
          <span>
            {segmentName && segmentId ? (
              <>
                Segment “
                <Link
                  href={`/customers/segments?id=${segmentId}`}
                  className="underline"
                >
                  {segmentName}
                </Link>
                ”
              </>
            ) : (
              "No segment — the audience is every consented, non-archived customer."
            )}
          </span>
          {audience.contactable !== tallies.targeted_count ? (
            <span role="status" className="text-[var(--ob-warning)]">
              Today the rule matches {audience.matched} and allows{" "}
              {audience.contactable}; the recorded list holds{" "}
              {tallies.targeted_count}. Rebuild to line them up.
            </span>
          ) : (
            <span>The recorded list matches today&apos;s consented audience.</span>
          )}
        </div>
      </CrmPanel>

      {excluded.length ? (
        <CrmPanel
          title="In the segment, but never contacted"
          meta={`${excluded.length} excluded by consent`}
        >
          <p className="mb-2 text-sm text-[var(--ob-text-muted)]">
            These people match the segment. They are excluded because their
            record does not grant marketing consent, so they cannot appear as
            recipients, in the export or in any count.
          </p>
          <ul className="ob-stagger space-y-1.5 text-sm">
            {excluded.slice(0, 30).map((person) => (
              <li key={person.id} className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/customers/${person.id}`}
                  className="font-medium text-[var(--ob-primary)] hover:underline"
                >
                  {person.name}
                </Link>
                <CrmChip tone="danger">{person.reason ?? "no consent"}</CrmChip>
              </li>
            ))}
          </ul>
          {excluded.length > 30 ? (
            <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
              +{excluded.length - 30} more
            </p>
          ) : null}
        </CrmPanel>
      ) : null}

      <CrmPanel
        title="Recipients and recorded outcomes"
        meta={`${contactableRows.length} in the audience`}
      >
        {contactableRows.length === 0 ? (
          <p className="text-sm text-[var(--ob-text-muted)]">
            No recipients yet. Set the audience on this campaign (or rebuild it)
            and OrderBook creates one row per contactable person — nothing is
            sent, and nobody outside the consent gate is added.
          </p>
        ) : (
          <div className="ob-scroll-x -mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[820px] text-left text-sm">
              <caption className="sr-only">
                Recipients of campaign “{campaignName}” with the timestamps a
                person recorded against each one
              </caption>
              <thead>
                <tr className="text-xs uppercase tracking-wide text-[var(--ob-text-muted)]">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Customer
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    State
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Marked sent
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Responded
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Redeemed
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Order
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Record
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ob-border)]">
                {contactableRows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="py-2 pr-3">
                      {row.customerId ? (
                        <Link
                          href={`/customers/${row.customerId}`}
                          className="font-medium text-[var(--ob-primary)] hover:underline"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{row.name}</span>
                      )}
                      <p className="text-xs text-[var(--ob-text-muted)]">
                        {row.contact ?? "No contact recorded"}
                      </p>
                      {row.note ? (
                        <p className="mt-1 text-xs italic text-[var(--ob-text-muted)]">
                          {row.note}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      <CrmChip tone={RECIPIENT_STATUS_TONES[row.status]}>
                        {RECIPIENT_STATUS_LABELS[row.status]}
                      </CrmChip>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-xs">
                      {when(row.markedSentAt)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-xs">
                      {when(row.respondedAt)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-xs">
                      {when(row.redeemedAt)}
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {row.orderLabel ? (
                        <>
                          {row.orderLabel}
                          {row.orderAmount !== null ? (
                            <span className="block tabular-nums">
                              {money(row.orderAmount)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2">
                      {canManage ? (
                        <RecipientOutcomeControls
                          recipientId={row.id}
                          contactable={row.contactable}
                          markedSentAt={row.markedSentAt}
                          respondedAt={row.respondedAt}
                          redeemedAt={row.redeemedAt}
                          orders={row.orders}
                        />
                      ) : (
                        <span className="text-xs text-[var(--ob-text-muted)]">
                          Read-only for your role
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shownLimit ? (
              <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
                Showing the first {shownLimit} recipients — export the contact
                list to work through the rest offline.
              </p>
            ) : null}
          </div>
        )}
      </CrmPanel>

      {staleRows.length ? (
        <CrmPanel
          title="Recorded rows outside today's audience"
          meta={`${staleRows.length} rows`}
        >
          <p className="mb-2 text-sm text-[var(--ob-text-muted)]">
            These rows exist but the consent gate no longer allows them, so they
            are not counted as an audience and never appear in the export. They
            are removed the next time the audience is saved or rebuilt — the
            history stays in the audit log.
          </p>
          <ul className="ob-stagger space-y-1.5 text-sm">
            {staleRows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{row.name}</span>
                <CrmChip tone="danger">{row.exclusionReason ?? "excluded"}</CrmChip>
                <span className="text-xs text-[var(--ob-text-muted)]">
                  {RECIPIENT_STATUS_LABELS[row.status]}
                  {row.markedSentAt ? ` · sent ${when(row.markedSentAt)}` : ""}
                  {row.redeemedAt ? ` · redeemed ${when(row.redeemedAt)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </CrmPanel>
      ) : null}
    </div>
  );
}
