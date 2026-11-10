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
  const tint = (token: string) =>
    `bg-[color-mix(in_srgb,var(${token})_14%,transparent)] text-[var(${token})] ring-1 ring-inset ring-[color-mix(in_srgb,var(${token})_30%,transparent)]`;
  const tones = {
    neutral:
      "bg-[var(--ob-surface-muted)] text-[var(--ob-text-secondary)] ring-1 ring-inset ring-[var(--ob-border)]",
    success: tint("--ob-success"),
    warning: tint("--ob-warning"),
    demo: tint("--ob-demo"),
    danger: tint("--ob-danger"),
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
