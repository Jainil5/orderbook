import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  CrmChip,
  CrmKeyValue,
  CrmPanel,
} from "@/components/crm/crm-ui";
import { SegmentDeleteButton } from "@/components/crm/segments/segment-delete-button";
import { formatDate, formatMoney } from "@/lib/format";
import type { Customer } from "@/types/database";
import type { CustomerSegment, CustomerStat, SegmentRules } from "@/types/crm";

/** One matched member, with the numbers that made them match. */
export type SegmentMemberRow = {
  customer: Customer;
  stat: CustomerStat | undefined;
  contactable: boolean;
  reason: string | null;
  /** Only shown when the segment actually filters on them. */
  loyaltyTier: string | null;
  activeMembershipPlans: string[];
};

/**
 * Why somebody in a segment is not in an audience. Consent is recorded on the
 * customer row, so the reason is always a fact from that record.
 */
export function audienceExclusionReason(
  customer: Customer,
  stat: CustomerStat | undefined,
): string | null {
  if (stat?.status === "archived" || customer.status === "archived")
    return "Archived — removed from every audience and list";
  if (customer.opted_out_at)
    return `Opted out of marketing on ${customer.opted_out_at.slice(0, 10)}`;
  if (customer.marketing_consent === "declined")
    return "Marketing consent declined";
  if (!customer.marketing_consent) return "Marketing consent never recorded";
  return null;
}

/**
 * The live members of one segment, with the rule said back in words and the
 * values that satisfied it. Membership is recomputed on every read — the row
 * never holds a member list for a dynamic segment.
 */
export function SegmentDetail({
  asOf,
  segment,
  ruleLines,
  members,
  currencyCode,
  canManage,
  campaignsUsing,
}: {
  /** The read's single instant, so every number on the page agrees. */
  asOf: string;
  segment: CustomerSegment;
  ruleLines: string[];
  members: SegmentMemberRow[];
  currencyCode: string;
  canManage: boolean;
  campaignsUsing: { id: string; name: string }[];
}) {
  const money = (value: number) => formatMoney(value, currencyCode);
  const contactable = members.filter((row) => row.contactable);
  const blocked = members.filter((row) => !row.contactable);

  return (
    <div className="space-y-4">
      <CrmPanel
        title={`“${segment.name}” — ${segment.kind === "dynamic" ? "dynamic" : "manual"}`}
        meta={`as of ${formatDate(asOf)}`}
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/customers/segments?id=${segment.id}&edit=${segment.id}`}
                className="ob-touch-target rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-2.5 py-1 text-xs font-medium text-[var(--crm-ink)]"
              >
                Edit
              </Link>
              <SegmentDeleteButton segmentId={segment.id} segmentName={segment.name} />
            </div>
          ) : null
        }
      >
        <CrmKeyValue
          items={[
            {
              label: "Live members",
              value: <span className="font-semibold">{members.length}</span>,
            },
            {
              label: "You may contact",
              value: (
                <span className="font-semibold text-[var(--crm-lab-strong)]">
                  {contactable.length}
                </span>
              ),
            },
            {
              label: "Matched but excluded",
              value: <span className="font-semibold">{blocked.length}</span>,
            },
            {
              label: "Used by campaigns",
              value: campaignsUsing.length
                ? campaignsUsing
                    .map((campaign) => campaign.name)
                    .join(", ")
                : "Not used yet",
            },
          ]}
        />

        <div className="mt-3 rounded-[var(--ob-radius-md)] border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] p-3">
          <h4 className="text-sm font-semibold">
            {segment.kind === "dynamic" ? "The rule, in words" : "Hand-picked list"}
          </h4>
          {segment.kind === "dynamic" ? (
            ruleLines.length ? (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm text-[var(--ob-text-secondary)]">
                {ruleLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                No rules are saved on this segment, so it matches nobody.
              </p>
            )
          ) : (
            <p className="mt-1 text-sm text-[var(--ob-text-secondary)]">
              {segment.manual_customer_ids?.length ?? 0} customer id
              {segment.manual_customer_ids?.length === 1 ? "" : "s"} saved by hand;{" "}
              {members.length} still live in the directory. Archived rows drop out
              on their own.
            </p>
          )}
          {segment.description ? (
            <p className="mt-2 text-xs italic text-[var(--ob-text-muted)]">
              {segment.description}
            </p>
          ) : null}
          {segment.kind === "dynamic" ? (
            <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
              Every person above satisfies every line. Nothing is stored: the list
              is rebuilt from live orders, reviews, dues, loyalty and membership
              rows each time you open it.
            </p>
          ) : null}
        </div>
      </CrmPanel>

      {blocked.length ? (
        <CrmPanel title="Matched, but you may not contact them" meta={`${blocked.length} people`}>
          <p className="mb-3 text-sm text-[var(--ob-text-muted)]">
            They stay in the segment count because they really do match the rule.
            They never enter a campaign audience until consent says otherwise.
          </p>
          <ul className="ob-stagger space-y-2">
            {blocked.map((row) => (
              <li key={row.customer.id} className="flex flex-wrap items-center gap-2 text-sm">
                <Link
                  href={`/customers/${row.customer.id}`}
                  className="font-medium text-[var(--ob-primary)] hover:underline"
                >
                  {row.customer.name}
                </Link>
                <CrmChip tone="danger">{row.reason ?? "excluded"}</CrmChip>
              </li>
            ))}
          </ul>
        </CrmPanel>
      ) : null}

      <CrmPanel
        title="Members"
        meta={`${members.length} live · ${contactable.length} contactable`}
      >
        {members.length === 0 ? (
          <p className="text-sm text-[var(--ob-text-muted)]">
            Nobody matches right now. That is not an error — a tight rule matches
            few people, and a manual segment stays empty until you add rows.
          </p>
        ) : (
          <div className="ob-scroll-x -mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">
                Live members of segment “{segment.name}” with the values that
                matched the rule
              </caption>
              <thead>
                <tr className="text-xs uppercase tracking-wide text-[var(--ob-text-muted)]">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Customer
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Orders
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Spend
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Last purchase
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Why they match
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Contact
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ob-border)]">
                {members.map((row) => (
                  <tr key={row.customer.id} className="align-top">
                    <td className="py-2 pr-3">
                      <Link
                        href={`/customers/${row.customer.id}`}
                        className="font-medium text-[var(--ob-primary)] hover:underline"
                      >
                        {row.customer.name}
                      </Link>
                      <p className="text-xs text-[var(--ob-text-muted)]">
                        {row.customer.phone ?? row.customer.email ?? "No contact recorded"}
                      </p>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{row.stat?.totalOrders ?? 0}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {money(row.stat?.totalSpend ?? 0)}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {row.stat?.lastPurchaseAt
                        ? formatDate(row.stat.lastPurchaseAt).slice(0, 6)
                        : "Never"}
                    </td>
                    <td className="py-2 pr-3">
                      <ul className="space-y-0.5 text-xs text-[var(--ob-text-secondary)]">
                        {whyTheyMatch(segment.rules, row).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="py-2">
                      {row.contactable ? (
                        <CrmChip tone="positive">may contact</CrmChip>
                      ) : (
                        <CrmChip tone="danger">{row.reason ?? "excluded"}</CrmChip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CrmPanel>
    </div>
  );
}

/**
 * The values behind each saved rule for one member. Only rules that exist are
 * shown, so the screen explains the match instead of dumping the whole stat.
 */
function whyTheyMatch(
  rules: SegmentRules,
  row: SegmentMemberRow,
): string[] {
  const lines: string[] = [];
  const stat = row.stat;
  const customer = row.customer;
  if (rules.minOrders != null || rules.maxOrders != null) {
    lines.push(`${stat?.totalOrders ?? 0} qualifying orders`);
  }
  if (rules.minTotalSpend != null || rules.maxTotalSpend != null) {
    lines.push(`total spend ${stat?.totalSpend ?? 0}`);
  }
  if (rules.lastPurchaseWithinDays != null || rules.lastPurchaseOverDays != null) {
    lines.push(
      stat?.lastPurchaseAt
        ? `last purchase ${formatDate(stat.lastPurchaseAt).slice(0, 6)}`
        : "no purchase on record",
    );
  }
  if (rules.tagsAny?.length) {
    const hits = rules.tagsAny.filter((tag) => (customer.tags ?? []).includes(tag));
    lines.push(`tags: ${hits.join(", ") || "—"}`);
  }
  if (rules.sourcesAny?.length) lines.push(`source: ${customer.source ?? "—"}`);
  if (rules.priceTiersAny?.length)
    lines.push(`price list: ${customer.price_tier ?? "—"}`);
  if (rules.hasOutstandingDues) lines.push(`outstanding dues: ${stat?.outstandingDues ?? 0}`);
  if (rules.hasUnresolvedComplaints)
    lines.push(`open complaints: ${stat?.unresolvedComplaints ?? 0}`);
  if (rules.minAverageReviewRating != null)
    lines.push(
      `average review: ${
        stat && stat.averageReviewRating !== null
          ? stat.averageReviewRating
          : "no reviews"
      }`,
    );
  if (rules.loyaltyTiersAny?.length)
    lines.push(`loyalty tier: ${row.loyaltyTier ?? "no account or tier"}`);
  if (rules.membershipPlansAny?.length)
    lines.push(
      `active membership plans: ${row.activeMembershipPlans.join(", ") || "none"}`,
    );
  return lines;
}

/** Small card used by the segment list so the numbers read at a glance. */
export function SegmentCountCell({
  matched,
  contactable,
}: {
  matched: number;
  contactable: number;
}) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="tabular-nums">
        <span className="text-[var(--ob-text-muted)]">match </span>
        <span className="font-semibold">{matched}</span>
      </span>
      <span className="tabular-nums">
        <span className="text-[var(--ob-text-muted)]">contactable </span>
        <span className="font-semibold text-[var(--crm-lab-strong)]">{contactable}</span>
      </span>
    </div>
  );
}

/** Used by the list grid on the page. */
export function SegmentListCard({
  segment,
  ruleLines,
  matched,
  contactable,
  campaigns,
}: {
  segment: CustomerSegment;
  ruleLines: string[];
  matched: number;
  contactable: number;
  campaigns: { id: string; name: string }[];
}) {
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/customers/segments?id=${segment.id}`}
          className="min-w-0 truncate text-sm font-semibold text-[var(--ob-primary)] hover:underline"
        >
          {segment.name}
        </Link>
        <CrmChip tone={segment.kind === "dynamic" ? "ink" : "neutral"}>
          {segment.kind}
        </CrmChip>
      </div>
      {segment.description ? (
        <p className="mt-1 line-clamp-2 text-xs text-[var(--ob-text-muted)]">
          {segment.description}
        </p>
      ) : null}
      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-[var(--ob-text-secondary)]">
        {(segment.kind === "manual"
          ? [
              `Hand-picked: ${segment.manual_customer_ids?.length ?? 0} ids saved`,
              `${matched} still live`,
            ]
          : ruleLines.length
            ? ruleLines.slice(0, 3)
            : ["No rules saved — matches nobody"]
        ).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {ruleLines.length > 3 && segment.kind === "dynamic" ? (
        <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
          +{ruleLines.length - 3} more condition
          {ruleLines.length - 3 === 1 ? "" : "s"}
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--ob-border)] pt-2">
        <SegmentCountCell matched={matched} contactable={contactable} />
        {campaigns.length ? (
          <span className="text-xs text-[var(--ob-text-muted)]">
            {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
