import { cn } from "@/lib/cn";
import { Odometer } from "@/components/ui/odometer";
import { Sparkline } from "@/components/analytics/charts";
import type { OdometerFormat } from "@/lib/format";

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  numericValue,
  format = { kind: "number" },
  spark,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down" | "neutral";
  /** When set, the value renders as a rolling odometer instead of static
   *  text; `value` stays the final-formatted string for SSR/a11y parity. */
  numericValue?: number;
  format?: OdometerFormat;
  /** Optional mini trend line drawn under the value. */
  spark?: number[];
}) {
  return (
    <div className="ob-card group relative overflow-hidden p-4">
      <span
        className="absolute inset-y-0 left-0 w-1 bg-[var(--ob-primary)] transition-all duration-300 group-hover:w-1.5 group-hover:bg-[var(--ob-accent)]"
        aria-hidden
      />
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">
        {numericValue === undefined ? (
          value
        ) : (
          <Odometer value={numericValue} format={format}>
            {value}
          </Odometer>
        )}
      </p>
      {spark && spark.length > 1 ? (
        <div className="mt-2">
          <Sparkline data={spark} />
        </div>
      ) : null}
      {hint ? (
        <p
          className={cn(
            "mt-2 text-xs font-medium",
            tone === "up" && "text-[var(--ob-success)]",
            tone === "down" && "text-[var(--ob-danger)]",
            tone === "neutral" && "text-[var(--ob-text-muted)]",
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
