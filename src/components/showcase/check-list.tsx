import { cn } from "@/lib/cn";

/** Bullet list used by the shared showcase sections. */
export function CheckList({
  items,
  className,
}: {
  items: readonly string[];
  className?: string;
}) {
  return (
    <ul className={cn("space-y-2.5 text-sm text-[var(--ob-text-secondary)]", className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5">
          <span
            className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ob-accent)]"
            aria-hidden
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
