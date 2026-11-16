"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import {
  MANAGERS,
  getManager,
  visibleManagers,
  visibleSections,
  type ManagerKey,
} from "@/lib/workspace/managers";

/**
 * Sub-navigation shared by every Manager screen. On a Manager overview it shows
 * that manager's sections; on `/manager` it switches between the four managers.
 */
export function ManagerSubnav({
  manager,
  activeHref,
}: {
  manager?: ManagerKey;
  activeHref: string;
}) {
  const ws = useWorkspace();
  const hidden = ws.hiddenManagerModules;
  const tabs = manager
    ? [
        { href: getManager(manager).href, label: "Overview" },
        ...visibleSections(manager, hidden).map((s) => ({
          href: s.href,
          label: s.navLabel,
        })),
      ]
    : MANAGERS.map((m) => ({ href: m.href, label: m.shortLabel }));

  return (
    <nav
      aria-label={manager ? getManager(manager).label : "Managers"}
      className="-mx-3 mb-4 overflow-x-auto px-3 sm:mx-0 sm:px-0"
    >
      <div className="flex min-w-max gap-1 border-b border-[var(--ob-border)] pb-px">
        {tabs.map((tab) => {
          const active = tab.href === activeHref;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "ob-touch-target inline-flex items-center whitespace-nowrap rounded-t-md border-b-2 px-3 text-sm transition-colors",
                active
                  ? "border-[var(--ob-primary)] font-medium text-[var(--ob-text)]"
                  : "border-transparent text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Overview strip used by section pages: what this section covers. */
export function ManagerSectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-[var(--ob-text-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export type ManagerStat = {
  label: string;
  value: string;
  hint?: string;
  href?: string;
};

export function ManagerStatRow({ stats }: { stats: ManagerStat[] }) {
  if (!stats.length) return null;
  return (
    <div className="ob-stagger mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((stat) => {
        const body = (
          <Card className="h-full p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
              {stat.label}
            </p>
            <p className="mt-1 text-2xl font-semibold">{stat.value}</p>
            {stat.hint ? (
              <p className="mt-1 text-xs text-[var(--ob-text-muted)]">{stat.hint}</p>
            ) : null}
          </Card>
        );
        return stat.href ? (
          <Link
            key={stat.label}
            href={stat.href}
            className="ob-touch-target block"
            aria-label={`${stat.label}: ${stat.value}`}
          >
            {body}
          </Link>
        ) : (
          <div key={stat.label}>{body}</div>
        );
      })}
    </div>
  );
}

/**
 * A Manager overview page: headline stats, optional extra content, and the
 * cards that lead into each enabled section.
 */
export function ManagerOverview({
  manager,
  stats,
  children,
}: {
  manager: ManagerKey;
  stats?: ManagerStat[];
  children?: React.ReactNode;
}) {
  const ws = useWorkspace();
  const definition = getManager(manager);
  const sections = visibleSections(manager, ws.hiddenManagerModules);

  return (
    <>
      <ManagerSubnav manager={manager} activeHref={definition.href} />
      <ManagerSectionHeader
        title={definition.label}
        description={`${definition.tagline} — ${definition.description}`}
      />
      <ManagerStatRow stats={stats ?? []} />
      {children}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.key} href={section.href} className="block">
            <Card className="h-full p-4 transition-shadow hover:shadow-[var(--ob-shadow-md)]">
              <p className="font-medium">{section.label}</p>
              <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                {section.description}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

/** `/manager` landing: the four managers as prominent cards. */
export function ManagerLanding({
  stats,
  children,
}: {
  stats?: ManagerStat[];
  children?: React.ReactNode;
}) {
  const ws = useWorkspace();
  const managers = visibleManagers(ws.hiddenManagerModules);

  return (
    <>
      <ManagerSubnav activeHref="/manager" />
      <ManagerStatRow stats={stats ?? []} />
      {children}
      <div className="ob-stagger mt-4 grid gap-4 sm:grid-cols-2">
        {managers.map((manager) => (
          <Link key={manager.key} href={manager.href} className="block">
            <Card className="h-full p-5 transition-shadow hover:shadow-[var(--ob-shadow-md)]">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--ob-text-muted)]">
                {manager.tagline}
              </p>
              <p className="mt-1 text-lg font-semibold">{manager.label}</p>
              <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                {manager.description}
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {manager.sections.map((section) => (
                  <li
                    key={section.key}
                    className="rounded-full bg-[var(--ob-surface-muted)] px-2.5 py-1 text-xs text-[var(--ob-text-secondary)]"
                  >
                    {section.navLabel}
                  </li>
                ))}
              </ul>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
