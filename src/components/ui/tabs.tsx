import { cn } from "@/lib/cn";

export function Tabs<T extends string>({
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
      role="tablist"
      aria-label={label}
      className="ob-scroll-x flex gap-1 border-b border-[var(--ob-border)] pb-px"
    >
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.id)}
            className={cn(
              "-mb-px shrink-0 snap-start border-b-2 px-3 py-2.5 text-sm font-medium transition sm:px-4",
              selected
                ? "border-[var(--ob-primary)] text-[var(--ob-primary)]"
                : "border-transparent text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
