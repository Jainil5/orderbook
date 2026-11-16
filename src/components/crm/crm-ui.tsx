"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { CRM_SECTIONS, crmSectionForPath } from "@/lib/workspace/crm-nav";

/**
 * Sub-navigation shared by every CRM screen, plus the small display pieces
 * the sections have in common. One file so eight screens cannot drift into
 * eight different look-alikes.
 */
export function CrmSubnav() {
  const pathname = usePathname();
  const active = crmSectionForPath(pathname)?.key ?? "overview";

  return (
    <nav
      aria-label="CRM"
      className="-mx-3 mb-4 overflow-x-auto px-3 sm:mx-0 sm:px-0"
    >
      <div className="flex min-w-max gap-1 border-b border-[var(--ob-border)] pb-px">
        {CRM_SECTIONS.map((section) => {
          const isActive = section.key === active;
          return (
            <Link
              key={section.href}
              href={section.href}
              title={section.description}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "ob-touch-target inline-flex items-center whitespace-nowrap rounded-t-md border-b-2 px-3 text-sm transition-colors",
                isActive
                  ? "border-[var(--crm-lab-strong)] font-medium text-[var(--ob-text)]"
                  : "border-transparent text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]",
              )}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * The outcome of a CRM form submit. Actions redirect back with `?notice=` or
 * `?error=`, so the message survives a reload and cannot claim a write the
 * server did not make.
 */
export function CrmNotice({
  notice,
  error,
}: {
  notice?: string;
  error?: string;
}) {
  if (!notice && !error) return null;
  const failed = Boolean(error);
  return (
    <div
      role={failed ? "alert" : "status"}
      className={cn(
        "mb-4 rounded-[var(--ob-radius-md)] border px-4 py-3 text-sm",
        failed
          ? "border-[color-mix(in_srgb,var(--crm-rust)_28%,white)] bg-[color-mix(in_srgb,var(--crm-rust)_7%,white)] text-[var(--crm-rust)]"
          : "border-[var(--crm-wash-line)] bg-[var(--crm-wash)] text-[var(--crm-lab-strong)]",
      )}
    >
      {error ?? notice}
    </div>
  );
}

/**
 * What a screen shows instead of a form when the role cannot write. The reason
 * travels with the component, so no screen can say "you can't do this" without
 * also saying which permission is missing — and the server re-checks every
 * write anyway, which this note says out loud.
 */
export function CrmReadOnlyNote({
  role,
  scope = "manage",
  children,
  className,
}: {
  role: string;
  scope?: "manage" | "log";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <CrmPanel title="Read-only" meta={`Your role: ${role}`} className={cn("mb-4", className)}>
      <p className="text-sm text-[var(--ob-text-muted)]">{children}</p>
      <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
        This needs the{" "}
        <strong className="text-[var(--crm-ink)]">{scope}</strong> permission —{" "}
        {scope === "manage"
          ? "owners, admins and managers."
          : "owners, admins, managers and staff."}{" "}
        The same check runs on the server before every write, so hiding these
        controls is only cosmetic.
      </p>
    </CrmPanel>
  );
}

export function CrmSectionHeader({
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

export type CrmStat = {
  label: string;
  value: string;
  hint?: string;
  href?: string;
};

export function CrmStatRow({ stats }: { stats: CrmStat[] }) {
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
 * A CRM card with a dark botanical rail. `meta` is the small right-aligned
 * note (a count, a date, a state).
 */
export function CrmPanel({
  title,
  meta,
  children,
  className,
  actions,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <Card className={cn("overflow-hidden p-0", className)}>
      <div className="crm-rail flex items-center justify-between gap-3 px-4 py-2.5">
        <h3 className="text-sm font-semibold tracking-wide">{title}</h3>
        <div className="flex items-center gap-2">
          {meta ? (
            <span className="text-xs text-[var(--crm-wash)] opacity-80">{meta}</span>
          ) : null}
          {actions}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

const STAGE_TONE: Record<string, string> = {
  new: "crm-stage-new",
  site_visit: "crm-stage-progress",
  quote_sent: "crm-stage-progress",
  negotiating: "crm-stage-progress",
  won: "crm-stage-won",
  lost: "crm-stage-lost",
};

export function CrmStageChip({
  stage,
  label,
}: {
  /** Raw stage value — colour follows the stage, never the label text. */
  stage: string;
  label: string;
}) {
  return (
    <span className={cn("crm-stage", STAGE_TONE[stage] ?? "")}>{label}</span>
  );
}

export function CrmChip({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "positive" | "warning" | "danger" | "ink";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "text-[var(--ob-text-muted)] border-[var(--ob-border)] bg-[var(--ob-surface-muted)]",
    positive: "crm-sentiment-positive border-[var(--crm-wash-line)] bg-[var(--crm-wash)]",
    warning: "crm-sentiment-neutral border-[var(--crm-wash-line)] bg-[var(--crm-wash)]",
    danger: "crm-sentiment-negative border-[var(--crm-wash-line)] bg-[var(--crm-wash)]",
    ink: "text-[var(--crm-wash)] border-[var(--crm-ink)] bg-[var(--crm-ink)]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** 1–5 stars as lab-green dots; also used for review ratings. */
export function CrmRating({ rating }: { rating: number }) {
  const rounded = Math.min(5, Math.max(0, Math.round(rating)));
  return (
    <span className="crm-dots" role="img" aria-label={`${rounded} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <i key={n} data-on={n <= rounded ? "true" : "false"} />
      ))}
    </span>
  );
}

/** Label + value rows for detail cards. */
export function CrmKeyValue({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode }[];
  className?: string;
}) {
  return (
    <dl className={cn("crm-kv grid grid-cols-2 gap-3 sm:grid-cols-3", className)}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className="text-sm">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
