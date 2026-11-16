import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate, formatMoney } from "@/lib/format";
import type { TimelineDay, TimelineEvent, TimelineEventKind } from "@/lib/crm/timeline";

const KIND_LABELS: Record<TimelineEventKind, string> = {
  bill: "Bill",
  payment: "Payment",
  interaction: "Interaction",
  review: "Review",
  complaint: "Complaint",
  loyalty: "Points",
  membership: "Membership",
  lead: "Enquiry",
  account: "Account",
};

const KIND_TONE: Record<TimelineEventKind, "neutral" | "success" | "warning" | "danger"> = {
  bill: "success",
  payment: "success",
  interaction: "neutral",
  review: "neutral",
  complaint: "danger",
  loyalty: "warning",
  membership: "neutral",
  lead: "neutral",
  account: "neutral",
};

function dayHeading(dayKey: string): string {
  // Noon local, so a `YYYY-MM-DD` key never rolls into the day before it the
  // way UTC midnight would on the far side of the world.
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(
    new Date(year, month - 1, day, 12),
  );
}

function EventRow({
  event,
  currencyCode,
}: {
  event: TimelineEvent;
  currencyCode: string;
}) {
  const body = (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          <Badge tone={KIND_TONE[event.kind]} className="mr-2">
            {KIND_LABELS[event.kind]}
          </Badge>
          {event.title}
        </p>
        {event.detail ? (
          <p className="mt-0.5 text-xs text-[var(--ob-text-muted)]">{event.detail}</p>
        ) : null}
      </div>
      <p className="text-right text-xs text-[var(--ob-text-muted)]">
        {event.amount !== null ? (
          <span
            className={
              event.amount < 0
                ? "ob-num font-semibold text-[var(--ob-danger)]"
                : "ob-num font-semibold text-[var(--ob-success)]"
            }
          >
            {event.kind === "loyalty"
              ? `${event.amount > 0 ? "+" : ""}${event.amount} pts`
              : formatMoney(event.amount, currencyCode)}
          </span>
        ) : null}
        <span className="block">{formatDate(event.at)}</span>
      </p>
    </div>
  );

  if (!event.href) return <Card className="p-3">{body}</Card>;
  return (
    <Link href={event.href} className="block hover:opacity-90">
      <Card className="p-3">{body}</Card>
    </Link>
  );
}

/**
 * One stream, many sources: bills and payments from Billing, touches from the
 * CRM log, points from the ledger. Nothing here is stored — it is a projection
 * of records that already exist, so the 360 cannot invent activity.
 */
export function TimelineStream({
  days,
  currencyCode,
  total,
}: {
  days: TimelineDay[];
  currencyCode: string;
  total: number;
}) {
  if (days.length === 0) {
    return (
      <Card className="p-4 text-sm text-[var(--ob-text-muted)]">
        Nothing on this record yet — no bills, no touches, no ledger entries.
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--ob-text-muted)]">
        Showing {days.reduce((sum, day) => sum + day.events.length, 0)} of {total} events
      </p>
      {days.map((day) => (
        <section key={day.dayKey} aria-label={dayHeading(day.dayKey)}>
          <h3 className="ob-label-quiet mb-1">{dayHeading(day.dayKey)}</h3>
          <ul className="space-y-2">
            {day.events.map((event) => (
              <li key={event.key}>
                <EventRow event={event} currencyCode={currencyCode} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
