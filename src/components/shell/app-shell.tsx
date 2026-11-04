"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, navHref, type WorkspaceMode } from "@/lib/workspace/types";
import { Badge } from "@/components/ui/badge";
import { logoutAction } from "@/lib/auth/actions";
import {
  LayoutDashboard,
  Receipt,
  ShoppingBag,
  Package,
  LineChart,
  Tag,
  Users,
  CreditCard,
  Settings,
  PanelLeftClose,
  PanelLeft,
  LogOut,
} from "lucide-react";
import { useState } from "react";

const icons = {
  Dashboard: LayoutDashboard,
  Billing: Receipt,
  Orders: ShoppingBag,
  Products: Package,
  Analytics: LineChart,
  Offers: Tag,
  Customers: Users,
  Payments: CreditCard,
  Settings: Settings,
} as const;

export function AppShell({
  mode,
  brandName,
  brandCode,
  userEmail,
  children,
  pageTitle,
  headerActions,
}: {
  mode: WorkspaceMode;
  brandName: string;
  brandCode: string;
  userEmail?: string | null;
  pageTitle: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-[var(--ob-border)] bg-[var(--ob-surface)]",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className="border-b border-[var(--ob-border)] px-4 py-4">
        {!collapsed ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
              OrderBook
            </p>
            <p className="mt-1 truncate text-sm font-semibold">{brandName}</p>
            <p className="text-xs text-[var(--ob-text-muted)]">{brandCode}</p>
            {mode === "demo" ? (
              <Badge tone="demo" className="mt-2">
                DEMO — read only
              </Badge>
            ) : null}
          </>
        ) : (
          <span className="text-xs font-bold text-[var(--ob-primary)]">OB</span>
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const href = navHref(item, mode);
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const Icon = icons[item.label];
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-[var(--ob-radius-md)] px-3 py-2 text-sm transition",
                active
                  ? "bg-[var(--ob-surface-muted)] font-medium text-[var(--ob-primary)]"
                  : "text-[var(--ob-text-secondary)] hover:bg-[var(--ob-surface-muted)]",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              {!collapsed ? item.label : null}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--ob-border)] p-3">
        {!collapsed && userEmail ? (
          <p className="mb-2 truncate text-xs text-[var(--ob-text-muted)]">
            {userEmail}
          </p>
        ) : null}
        {mode === "live" ? (
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-[var(--ob-radius-md)] px-3 py-2 text-sm text-[var(--ob-text-secondary)] hover:bg-[var(--ob-surface-muted)]"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              {!collapsed ? "Log out" : null}
            </button>
          </form>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-2 rounded-[var(--ob-radius-md)] px-3 py-2 text-sm text-[var(--ob-primary)] hover:bg-[var(--ob-surface-muted)]"
          >
            {!collapsed ? "Sign in to your business" : "→"}
          </Link>
        )}
        <button
          type="button"
          className="mt-1 hidden w-full items-center gap-2 rounded-[var(--ob-radius-md)] px-3 py-2 text-sm text-[var(--ob-text-muted)] hover:bg-[var(--ob-surface-muted)] md:flex"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
              Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-[var(--ob-bg)]">
      <div className="hidden md:block">{sidebar}</div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full w-64">{sidebar}</div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--ob-border)] bg-[var(--ob-surface)]/95 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="rounded-md border border-[var(--ob-border)] px-2 py-1 text-sm md:hidden"
              onClick={() => setMobileOpen(true)}
            >
              Menu
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{pageTitle}</h1>
              <p className="text-xs text-[var(--ob-text-muted)]">
                {brandName} · {brandCode}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">{headerActions}</div>
        </header>
        {mode === "demo" ? (
          <div className="border-b border-violet-200 bg-violet-50 px-4 py-2 text-center text-sm text-violet-900">
            Demo mode — changes are disabled. Explore Brewery Cafe sample data.
          </div>
        ) : null}
        <main className="flex-1 p-4 md:p-6 ob-animate-in">{children}</main>
      </div>
    </div>
  );
}
