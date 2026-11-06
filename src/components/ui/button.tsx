import { cn } from "@/lib/cn";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--ob-primary)] text-[var(--ob-primary-foreground)] hover:bg-[var(--ob-primary-hover)]",
  secondary:
    "border border-[var(--ob-border)] bg-[var(--ob-surface)] text-[var(--ob-text)] hover:bg-[var(--ob-surface-muted)]",
  ghost: "text-[var(--ob-text-secondary)] hover:bg-[var(--ob-surface-muted)]",
  danger: "bg-[var(--ob-danger)] text-white hover:opacity-90",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    loading?: boolean;
  }
>(function Button(
  { className, variant = "primary", loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        "ob-press inline-flex items-center justify-center gap-2 rounded-[var(--ob-radius-md)] px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? "Please wait…" : children}
    </button>
  );
});
