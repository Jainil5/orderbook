import { cn } from "@/lib/cn";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "demo" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "bg-[var(--ob-surface-muted)] text-[var(--ob-text-secondary)]",
    success: "bg-emerald-50 text-[var(--ob-success)]",
    warning: "bg-amber-50 text-[var(--ob-warning)]",
    demo: "bg-violet-50 text-[var(--ob-demo)]",
    danger: "bg-red-50 text-[var(--ob-danger)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
