/**
 * The brand mark. Deliberately still: it used to rotate on showcase surfaces
 * and pulse rings elsewhere, and both read as noise next to the data screens.
 */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <span
      className="ob-mark relative grid shrink-0 place-items-center rounded-[30%] text-[var(--ob-leaf-ink)]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        width={size * 0.52}
        height={size * 0.52}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 7v14" />
        <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
      </svg>
    </span>
  );
}
