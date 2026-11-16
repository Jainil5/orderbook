import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { Card } from "@/components/ui/card";
import { CustomerSearchBar } from "@/components/customers/customer-search-bar";
import { CustomerEditor } from "@/components/customers/customer-editor";
import { CsvExportButton } from "@/components/export/csv-export-button";
import { CrmSectionHeader, CrmSubnav } from "@/components/crm/crm-ui";
import {
  CustomerDirectoryTable,
  DirectorySortLinks,
  DirectoryStatRow,
  sortDirectoryRows,
  type DirectoryRow,
  type DirectorySort,
  DIRECTORY_COLUMNS,
} from "@/components/crm/directory/crm-directory-table";
import { loadCrmWorkspace, statById } from "@/lib/crm/loader";
import { exportCrmCustomersCsvAction } from "@/services/crm-customer-actions";
import type { Customer } from "@/types/database";

/**
 * The customer directory — the old `/customers` list, now with the CRM columns
 * that made it useful: spend, dues, points, consent and tags next to the name.
 *
 * Search stays on the existing `?q=` contract (it hits the same reader the
 * billing screen uses). Everything else is filtered here, in the request, from
 * rows `loadCrmWorkspace()` already returned.
 */
export default async function CrmDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    consent?: string;
    tag?: string;
    source?: string;
    sort?: string;
  }>;
}) {
  const crm = await loadCrmWorkspace();
  if (!crm) redirect("/login");
  const sp = await searchParams;

  const query = sp.q?.trim() ?? "";
  const status = sp.status?.trim() ?? "all";
  const consent = sp.consent?.trim() ?? "all";
  const tag = sp.tag?.trim() ?? "";
  const source = sp.source?.trim() ?? "";
  const sort: DirectorySort = DIRECTORY_COLUMNS.includes(
    sp.sort as DirectorySort,
  )
    ? (sp.sort as DirectorySort)
    : "name";

  // Search matches the same three fields billing matches on, over the rows the
  // loader already returned — one read per request, no second query.
  const needle = query.toLowerCase();
  const matchesQuery = (customer: Customer) =>
    !needle ||
    customer.name.toLowerCase().includes(needle) ||
    (customer.phone ?? "").toLowerCase().includes(needle) ||
    (customer.email ?? "").toLowerCase().includes(needle);

  const stats = statById(crm);

  const rows: DirectoryRow[] = crm.customers
    .filter((customer) => matchesQuery(customer))
    .filter((customer) => {
      const stat = stats.get(customer.id);
      if (status === "archived") return customer.status === "archived";
      if (status === "active") return stat?.status === "active";
      if (status === "inactive") return stat?.status === "inactive";
      return true;
    })
    .filter((customer) => {
      if (consent === "granted") return customer.marketing_consent === "granted";
      if (consent === "declined") return customer.marketing_consent === "declined";
      if (consent === "unset") return !customer.marketing_consent;
      if (consent === "opted_out") return Boolean(customer.opted_out_at);
      return true;
    })
    .filter((customer) => (tag ? (customer.tags ?? []).includes(tag) : true))
    .filter((customer) => (source ? customer.source === source : true))
    .map((customer) => ({ customer, stat: stats.get(customer.id) }));

  const ordered = sortDirectoryRows(rows, sort);

  const tags = Array.from(
    new Set(crm.customers.flatMap((c) => c.tags ?? [])),
  ).sort();
  const sources = Array.from(
    new Set(crm.customers.map((c) => c.source).filter(Boolean)),
  ).sort() as string[];

  /** Keep the current filters when a chip changes one dimension. */
  const buildHref = (changes: Record<string, string>) => {
    const params = new URLSearchParams();
    const next = { q: query, status, consent, tag, source, sort, ...changes };
    for (const [key, value] of Object.entries(next)) {
      if (value && value !== "all") params.set(key, value);
    }
    const qs = params.toString();
    return qs ? `/customers/directory?${qs}` : "/customers/directory";
  };

  const filterGroup = (
    label: string,
    options: { value: string; label: string }[],
    active: string,
    key: string,
  ) => (
    <div className="flex flex-wrap items-center gap-1 text-xs">
      <span className="text-[var(--ob-text-muted)]">{label}</span>
      {options.map((option) => {
        const selected = option.value === active;
        return (
          <Link
            key={option.value}
            href={buildHref({ [key]: option.value })}
            aria-pressed={selected}
            className={
              selected
                ? "rounded-full border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-2 py-0.5 font-medium text-[var(--crm-lab-strong)]"
                : "rounded-full border border-[var(--ob-border)] px-2 py-0.5 text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]"
            }
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );

  return (
    <PageShell
      title="Customers"
      headerActions={
        <CsvExportButton
          label="Export customers"
          onExport={exportCrmCustomersCsvAction}
        />
      }
    >
      <CrmSubnav />
      <CrmSectionHeader
        title="Customer directory"
        description="One customer record for the whole app — billing, orders and the CRM all read the same row."
        actions={
          tags.length ? (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 6).map((label) => (
                <Link
                  key={label}
                  href={buildHref({ tag: label })}
                  className="rounded-full border border-[var(--ob-border)] px-2 py-0.5 text-xs text-[var(--ob-text-muted)] hover:text-[var(--ob-text)]"
                >
                  {label}
                </Link>
              ))}
            </div>
          ) : null
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <h2 className="font-semibold">Add customer</h2>
          <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
            Saved customers appear in Billing straight away. Tags, consent and
            the rest of the CRM profile are edited on the customer page.
          </p>
          <div className="mt-3">
            <CustomerEditor />
          </div>
        </Card>
        <div className="lg:col-span-2">
          <Suspense
            fallback={
              <div className="h-10 max-w-md animate-pulse rounded-md bg-[var(--ob-surface-muted)]" />
            }
          >
            <CustomerSearchBar
              initialQuery={query}
              basePath="/customers/directory"
            />
          </Suspense>
          <div className="mt-3 space-y-2">
            {filterGroup(
              "Status",
              [
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "archived", label: "Archived" },
              ],
              status,
              "status",
            )}
            {filterGroup(
              "Marketing consent",
              [
                { value: "all", label: "All" },
                { value: "granted", label: "Granted" },
                { value: "declined", label: "Declined" },
                { value: "opted_out", label: "Opted out" },
                { value: "unset", label: "Never asked" },
              ],
              consent,
              "consent",
            )}
            {sources.length > 1
              ? filterGroup(
                  "Source",
                  [{ value: "all", label: "All" }, ...sources.map((s) => ({ value: s, label: s }))],
                  source,
                  "source",
                )
              : null}
            {tag ? (
              <Link
                href={buildHref({ tag: "" })}
                className="inline-block text-xs text-[var(--ob-primary)]"
              >
                Clear tag “{tag}”
              </Link>
            ) : null}
            <DirectorySortLinks active={sort} buildHref={(value) => buildHref({ sort: value })} />
          </div>
        </div>
      </div>

      <DirectoryStatRow rows={ordered} currencyCode={crm.currencyCode} />
      <CustomerDirectoryTable rows={ordered} currencyCode={crm.currencyCode} />
    </PageShell>
  );
}
