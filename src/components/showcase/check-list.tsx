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
    <ul className={cn("space-y-3 text-[15px] text-[var(--ob-text-secondary)]", className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <span className="ob-dash mt-[10px]" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
