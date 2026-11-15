import { cn } from "@/lib/cn";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "ob-btn-primary",
  secondary:
    "border border-[var(--ob-border-strong)] bg-[var(--ob-tint-wash)] text-[var(--ob-text)] hover:border-[var(--ob-line-hover)] hover:bg-[var(--ob-tint-hover)]",
  ghost: "ob-btn-ghost",
  danger:
    "bg-[var(--ob-danger)] text-[var(--ob-danger-ink)] hover:brightness-110",
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
        "ob-press inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-50",
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
