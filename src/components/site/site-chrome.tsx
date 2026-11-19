"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { ArrowUp, ShoppingBag } from "lucide-react";
import { useCart } from "./cart-provider";
import type { SiteProfile } from "@/lib/site/registry";

/**
 * One delegated cursor listener feeds every `.site-spot` card its --sx/--sy,
 * exactly like the workspace's CardGlow but scoped to the site token set.
 */
export function SiteSpotlights() {
  useEffect(() => {
    let frame = 0;
    let x = 0;
    let y = 0;
    let target: HTMLElement | null = null;

    const apply = () => {
      frame = 0;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty("--sx", `${x - rect.left}px`);
      target.style.setProperty("--sy", `${y - rect.top}px`);
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      x = event.clientX;
      y = event.clientY;
      target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(".site-spot")
          : null;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}

export function SiteHeader({
  profile,
  nav,
}: {
  profile: SiteProfile;
  nav: SiteProfile["nav"];
}) {
  const pathname = usePathname();
  const { itemCount } = useCart();
  const menuHref = `/site/${profile.code}`;
  const orderHref = `/site/${profile.code}/order`;
  const isMenu = pathname === menuHref;
  const isOrder = pathname === orderHref;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--site-line)] bg-[color-mix(in_srgb,var(--site-bg)_78%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href={menuHref} className="group flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[30%] bg-[var(--site-accent)] text-[var(--site-accent-ink)]">
            <span className="site-display text-base leading-none">
              {profile.name.charAt(0)}
            </span>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight">
              {profile.name}
            </span>
            <span className="block truncate text-[11px] text-[var(--site-muted)]">
              {profile.tagline}
            </span>
          </span>
        </Link>

        <nav
          className="ml-auto flex items-center gap-1 sm:gap-2"
          aria-label="Site"
        >
          {isMenu ? (
            <ul className="mr-2 hidden items-center gap-1 lg:flex">
              {nav.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-[var(--site-muted)] transition hover:bg-[var(--site-surface)] hover:text-[var(--site-text)]"
                  >
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <SiteTab href={menuHref} active={isMenu} label={profile.menuTab} />
          <SiteTab href={orderHref} active={isOrder} label={profile.orderTab} />
          <Link
            href={orderHref}
            className="relative ml-1 inline-flex items-center gap-2 rounded-full border border-[var(--site-line)] bg-[var(--site-surface)] px-3 py-1.5 text-xs font-medium transition hover:border-[var(--site-accent)] hover:text-[var(--site-accent)]"
          >
            <ShoppingBag className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">
              {itemCount > 0 ? `${itemCount} in cart` : "Cart"}
            </span>
            {itemCount > 0 ? (
              <motion.span
                key={itemCount}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--site-accent)] px-1 text-[10px] font-bold text-[var(--site-accent-ink)]"
              >
                {itemCount}
              </motion.span>
            ) : null}
          </Link>
        </nav>
      </div>
    </header>
  );
}

function SiteTab({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      data-active={active}
      className="relative rounded-full px-3 py-1.5 text-xs font-medium text-[var(--site-muted)] transition data-[active=true]:text-[var(--site-text)] hover:text-[var(--site-text)]"
    >
      {label}
      {active ? (
        <motion.span
          layoutId={`site-tab-${href}`}
          className="absolute inset-x-2 -bottom-px h-px bg-[var(--site-accent)]"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      ) : null}
    </Link>
  );
}

/**
 * Footer in the reference sites' idiom: the house line, the same anchor nav
 * that runs across the top, the contacts, and a plain statement of where the
 * numbers on the page came from.
 */
export function SiteFooter({
  profile,
  nav,
  contactEmail,
  contactPhone,
  currencyNote,
}: {
  profile: SiteProfile;
  nav: SiteProfile["nav"];
  contactEmail: string | null;
  contactPhone: string | null;
  currencyNote: string;
}) {
  return (
    <footer className="mt-24 border-t border-[var(--site-line)]">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
        <div>
          <p className="site-display text-xl">{profile.name}</p>
          <p className="mt-2 text-sm text-[var(--site-muted)]">
            {profile.ventureLine}
          </p>
          <p className="mt-3 text-sm text-[var(--site-muted)]">{profile.city}</p>
          <p className="mt-1 text-sm text-[var(--site-muted)]">{profile.hours}</p>
        </div>

        <nav aria-label={`${profile.name} sections`}>
          <ul className="space-y-2 text-sm">
            {nav.map((section) => (
              <li key={section.id}>
                <a
                  href={`/site/${profile.code}#${section.id}`}
                  className="text-[var(--site-muted)] transition hover:text-[var(--site-accent)]"
                >
                  {section.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                href={`/site/${profile.code}/order`}
                className="text-[var(--site-muted)] transition hover:text-[var(--site-accent)]"
              >
                {profile.orderTab}
              </Link>
            </li>
          </ul>
          <a
            href="#top"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--site-accent)]"
          >
            {profile.backLabel} <ArrowUp className="h-3.5 w-3.5" aria-hidden />
          </a>
        </nav>

        <div className="text-sm text-[var(--site-muted)] sm:text-right">
          {contactEmail ? (
            <p>
              <a
                className="transition hover:text-[var(--site-accent)]"
                href={`mailto:${contactEmail}`}
              >
                {contactEmail}
              </a>
            </p>
          ) : null}
          {contactPhone ? (
            <p className="mt-1">
              <a
                className="transition hover:text-[var(--site-accent)]"
                href={`tel:${contactPhone.replace(/\s+/g, "")}`}
              >
                {contactPhone}
              </a>
            </p>
          ) : null}
          <p className="mt-3">{currencyNote}</p>
          <p className="mt-3">
            This storefront writes straight into the brand&apos;s{" "}
            <Link
              href="/"
              className="text-[var(--site-accent)] hover:underline"
            >
              OrderBook
            </Link>{" "}
            workspace.
          </p>
        </div>
      </div>

      <div className="border-t border-[var(--site-line)]">
        <p className="mx-auto w-full max-w-6xl px-4 py-5 text-[11px] leading-relaxed text-[var(--site-muted)] sm:px-6">
          Everything priced, counted and reviewed on this page comes out of the
          brand&apos;s own demo OrderBook ledger — the rows, stock figures and
          ratings are the same ones the workspace shows. Demo site: orders land
          in this browser&apos;s workspace and nothing is charged.
        </p>
      </div>
    </footer>
  );
}

/** Scroll-reveal wrapper for site sections (motion.dev whileInView). */
export function SiteReveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
