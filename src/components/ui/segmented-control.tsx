import { cn } from "@/lib/cn";

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-full bg-[var(--ob-surface-muted)] p-1"
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition",
              selected
                ? "bg-[var(--ob-surface)] text-[var(--ob-text)] shadow-sm"
                : "text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
