import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";

/**
 * Footer shared by the marketing page and the demo entry page. The giant
 * wordmark is the spec's sinking mark: it sizes itself from --mark-w, so it
 * always runs edge to edge and drops out of the bottom of the page.
 */
export function SiteFooter({
  link = { href: "/login", label: "Sign in" },
}: {
  link?: { href: string; label: string };
}) {
  return (
    <footer className="relative mt-8 overflow-hidden border-t border-[var(--ob-border)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8">
        <p className="ob-label-quiet">
          OrderBook by WebsiteIn — multi-business order management
        </p>
        <Link
          href={link.href}
          className="ob-btn-ghost ob-press inline-flex min-h-[44px] items-center rounded-full px-5 py-2 text-[15px] font-semibold"
        >
          {link.label} →
        </Link>
      </div>
      <Wordmark tone="footer" className="mt-4 text-center" />
    </footer>
  );
}
