export function EmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--ob-radius-lg)] border border-dashed border-[var(--ob-border)] bg-[var(--ob-surface)] px-6 py-12 text-center">
      <p className="text-base font-medium text-[var(--ob-text)]">{title}</p>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-[var(--ob-text-muted)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}
