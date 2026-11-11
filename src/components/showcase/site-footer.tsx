import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";

/** Footer shared by the marketing page and the demo entry page. */
export function SiteFooter({
  link = { href: "/login", label: "Sign in" },
}: {
  link?: { href: string; label: string };
}) {
  return (
    <footer className="border-t border-[var(--ob-border)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8">
        <div className="flex items-center gap-3">
          <LogoMark size={30} />
          <p className="text-sm text-[var(--ob-text-muted)]">
            OrderBook by WebsiteIn — multi-business order management
          </p>
        </div>
        <Link
          href={link.href}
          className="min-h-[44px] text-sm font-medium text-[var(--ob-primary)] hover:underline"
        >
          {link.label} →
        </Link>
      </div>
    </footer>
  );
}
