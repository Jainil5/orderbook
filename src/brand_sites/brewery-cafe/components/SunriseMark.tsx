/** The Brewery Cafe mark: a half sun coming up over its own horizon line. */
export function SunriseMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className} fill="none">
      <path
        d="M6 20a10 10 0 0 1 20 0"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path d="M3 25h26" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M16 2.5v4M4.6 6.6l2.8 2.8M27.4 6.6l-2.8 2.8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
