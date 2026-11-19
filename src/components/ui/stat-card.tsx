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
  numericWhenInView = false,
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
  /** Opt the roll in to the scroll reveal: the number holds at zero until the
   *  card is in view. Ignored when `numericValue` is unset. */
  numericWhenInView?: boolean;
  /** Optional mini trend line drawn under the value. */
  spark?: number[];
}) {
  return (
    <div className="ob-card relative overflow-hidden p-4">
      <p className="ob-label-quiet">{label}</p>
      <p className="ob-num mt-2 text-[clamp(26px,2.4vw,34px)] leading-none">
        {numericValue === undefined ? (
          value
        ) : (
          <Odometer
            value={numericValue}
            format={format}
            whenInView={numericWhenInView}
          >
            {value}
          </Odometer>
        )}
      </p>
      {spark && spark.length > 1 ? (
        <div className="mt-3">
          <Sparkline data={spark} />
        </div>
      ) : null}
      {hint ? (
        <p
          className={cn(
            "mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.13em]",
            tone === "up" &&
              "bg-[color-mix(in_srgb,var(--ob-success)_15%,transparent)] text-[var(--ob-success)]",
            tone === "down" &&
              "bg-[color-mix(in_srgb,var(--ob-danger)_15%,transparent)] text-[var(--ob-danger)]",
            tone === "neutral" &&
              "bg-[var(--ob-surface-muted)] text-[var(--ob-text-muted)]",
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
