"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { buildWorkspaceNavItems } from "@/lib/workspace/nav";
import type { WorkspaceMode } from "@/lib/workspace/types";
import type { WorkspaceProfile } from "@/lib/workspace/constants";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { logoutAction } from "@/lib/auth/actions";
import {
  LayoutDashboard,
  Receipt,
  ShoppingBag,
  Package,
  LineChart,
  Users,
  CreditCard,
  Settings,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  Menu,
  FileText,
  FileCheck2,
  ClipboardList,
  ChevronDown,
} from "lucide-react";
import { useState, useEffect } from "react";
import { CommandPalette } from "@/components/workspace/command-palette";

const icons = {
  Dashboard: LayoutDashboard,
  Billing: Receipt,
  Quotation: FileText,
  Bill: FileCheck2,
  Orders: ShoppingBag,
  Products: Package,
  Manager: ClipboardList,
  Analytics: LineChart,
  Customers: Users,
  Payments: CreditCard,
  Settings: Settings,
} as const;

export function AppShell({
  mode,
  brandName,
  brandCode,
  userEmail,
  profile,
  children,
  pageTitle,
  headerActions,
}: {
  mode: WorkspaceMode;
  brandName: string;
  brandCode: string;
  userEmail?: string | null;
  profile: WorkspaceProfile;
  pageTitle: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const ws = useWorkspace();
  const navItems = buildWorkspaceNavItems(
    Boolean(ws.settings.quotation_builder_enabled),
    profile,
    ws.hiddenManagerModules,
  );
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const sidebar = (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-[var(--ob-sidebar-line)] bg-[var(--ob-sidebar)] text-[var(--ob-sidebar-text)] transition-[width] duration-300 ease-out",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className="border-b border-[var(--ob-sidebar-line)] px-4 py-4">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <span className="ob-mark grid h-9 w-9 place-items-center rounded-xl text-xs font-semibold text-white shadow-lg">
              OB
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ob-sidebar-muted)]">
                OrderBook
              </p>
              <p className="truncate text-sm font-semibold">{brandName}</p>
              <p className="text-xs text-[var(--ob-sidebar-muted)]">{brandCode}</p>
            </div>
          </div>
        ) : (
          <span className="ob-mark grid h-9 w-9 place-items-center rounded-xl text-xs font-semibold text-white shadow-lg">
            OB
          </span>
        )}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {navItems.map((item) => {
          const href = item.href;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const Icon = icons[item.iconKey];
          const hasChildren = Boolean(item.children?.length);
          const expanded = hasChildren && (expandedGroups[href] ?? active);
          return (
            <div key={href}>
              <div className="flex items-center">
                <Link
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  data-active={active ? "true" : "false"}
                  className={cn(
                    "ob-nav-link flex flex-1 items-center gap-3 rounded-[var(--ob-radius-md)] px-3 py-2.5 text-base transition-colors duration-200",
                    active
                      ? "bg-white/10 font-medium text-white"
                      : "text-[var(--ob-sidebar-muted)] hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  {!collapsed ? item.label : null}
                </Link>
                {hasChildren && !collapsed ? (
                  <button
                    type="button"
                    className="ob-touch-target grid shrink-0 place-items-center rounded-md px-1 text-[var(--ob-sidebar-muted)] hover:text-white"
                    aria-label={expanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
                    aria-expanded={expanded}
                    onClick={() =>
                      setExpandedGroups((prev) => ({ ...prev, [href]: !expanded }))
                    }
                  >
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
                      aria-hidden
                    />
                  </button>
                ) : null}
              </div>
              {hasChildren && expanded && !collapsed ? (
                <div className="mt-0.5 space-y-0.5 pl-8">
                  {item.children!.map((child) => {
                    const childActive =
                      pathname === child.href || pathname.startsWith(`${child.href}/`);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "ob-touch-target block rounded-[var(--ob-radius-md)] px-3 py-2 text-sm transition-colors",
                          childActive
                            ? "bg-white/10 font-medium text-white"
                            : "text-[var(--ob-sidebar-muted)] hover:bg-white/5 hover:text-white",
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-[var(--ob-sidebar-line)] p-3">
        {!collapsed && userEmail ? (
          <p className="mb-2 truncate text-xs text-[var(--ob-sidebar-muted)]">
            {userEmail}
          </p>
        ) : null}
        {!collapsed && mode === "demo" ? (
          <p className="mb-2 text-xs text-[var(--ob-sidebar-muted)]">Guest workspace</p>
        ) : null}
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-[var(--ob-radius-md)] px-3 py-2 text-sm text-[var(--ob-sidebar-muted)] hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            {!collapsed ? (mode === "demo" ? "Exit workspace" : "Log out") : null}
          </button>
        </form>
        {mode === "demo" && !collapsed ? (
          <Link
            href="/login"
            className="mt-1 flex items-center gap-2 rounded-[var(--ob-radius-md)] px-3 py-2 text-sm text-white hover:bg-white/5"
          >
            Sign in with business ID
          </Link>
        ) : null}
        <button
          type="button"
          className="mt-1 hidden w-full items-center gap-2 rounded-[var(--ob-radius-md)] px-3 py-2 text-sm text-[var(--ob-sidebar-muted)] hover:bg-white/5 hover:text-white md:flex"
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
    <div className="ob-workspace ob-ambient flex min-h-screen">
      <CommandPalette />
      <div className="hidden md:block">{sidebar}</div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" id="mobile-nav-drawer">
          <button
            type="button"
            className="ob-scrim absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <div className="ob-drawer relative z-10 h-full w-[min(18rem,88vw)] shadow-2xl">
            {sidebar}
          </div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="ob-safe-top sticky top-0 z-20 border-b border-[var(--ob-border)] bg-[var(--ob-surface)]/80 shadow-[var(--ob-shadow-sm)] backdrop-blur-md">
          <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-3">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                className="ob-touch-target inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-[var(--ob-border)] px-2.5 text-sm md:hidden"
                onClick={() => setMobileOpen(true)}
                aria-expanded={mobileOpen}
                aria-controls="mobile-nav-drawer"
              >
                <Menu className="h-4 w-4" aria-hidden />
                <span className="sr-only sm:not-sr-only sm:inline">Menu</span>
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-lg font-semibold sm:text-xl">
                  {pageTitle}
                </h1>
                <p className="hidden truncate text-sm text-[var(--ob-text-muted)] sm:block">
                  {brandName} · {brandCode}
                </p>
              </div>
            </div>
            {headerActions ? (
              <div className="flex max-w-full flex-wrap items-center gap-1.5 sm:justify-end">
                {headerActions}
              </div>
            ) : null}
          </div>
        </header>
        <main
          key={pathname}
          className="ob-page-enter ob-safe-bottom relative z-[1] flex-1 p-3 sm:p-4 md:p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
