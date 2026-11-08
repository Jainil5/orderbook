import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { OpsTimelineRow } from "@/lib/manager/ops-selectors";

const KIND_LABELS: Record<OpsTimelineRow["kind"], string> = {
  appointment: "Appointment",
  visit: "Visit",
  job: "Service job",
  task: "Task",
};

export function CustomerOperationsTimeline({ rows }: { rows: OpsTimelineRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-4 text-sm text-[var(--ob-text-muted)]">
        No operational records for this customer yet.
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <Link key={`${row.kind}-${row.id}`} href={row.href} className="ob-touch-target block">
          <Card className="p-4 transition-shadow hover:shadow-[var(--ob-shadow-sm)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{row.title}</p>
              <p className="text-sm text-[var(--ob-text-muted)]">
                {KIND_LABELS[row.kind]} · {row.status.replace(/_/g, " ")}
                {row.when ? ` · ${new Date(row.when).toLocaleString()}` : ""}
              </p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
