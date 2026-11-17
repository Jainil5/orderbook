import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/workspace/page-shell";
import { CsvExportButton } from "@/components/export/csv-export-button";
import { CustomerEditor } from "@/components/customers/customer-editor";
import { CrmSubnav } from "@/components/crm/crm-subnav";
import { CustomerImportDialog } from "@/components/crm/customer-import-dialog";
import { DirectoryFilters } from "@/components/crm/directory-filters";
import { DirectoryPagination } from "@/components/crm/directory-pagination";
import { DirectoryTable } from "@/components/crm/directory-table";
import {
  directoryFromParams,
  findDuplicates,
  queryDirectory,
  type DuplicateMatch,
} from "@/lib/crm/directory";
import { loadCrmWorkspace } from "@/lib/crm/data";
import { buildCustomerProfiles, filterUniverse } from "@/lib/crm/metrics";
import { manualMemberIds, segmentMemberIds } from "@/lib/crm/segments";
import { toDemoBrandCode } from "@/lib/demo/data";
import { exportCustomerDirectoryCsvAction } from "@/services/crm-actions";
import { canAddWorkspaceRecords } from "@/lib/workspace/settings-access";
import { loadWorkspaceSession } from "@/lib/workspace/session";

function flat(value: Record<string, string | string[] | undefined>) {
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") out[key] = item;
  }
  return out;
}

/**
 * Merging two customers would rewrite every bill that points at one of them,
 * so the directory only ever reports the clash and links to both records.
 */
function DuplicateNotice({ matches }: { matches: DuplicateMatch[] }) {
  if (!matches.length) return null;
  const high = matches.filter((m) => m.confidence === "high");
  return (
    <Card className="p-4">
      <h2 className="font-semibold">
        {high.length
          ? `${high.length} ${high.length === 1 ? "customer looks duplicated" : "customers look duplicated"}`
          : `${matches.length} ${matches.length === 1 ? "name appears twice" : "names appear twice"}`}
      </h2>
      <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
        Nothing merges itself here — bills point at a customer id, so which record survives is a
        decision only you can make.
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        {matches.slice(0, 5).map((match) => (
          <li key={`${match.a.customer.id}:${match.b.customer.id}`}>
            <Link href={`/customers/${match.a.customer.id}`} className="text-[var(--ob-primary)] hover:underline">
              {match.a.customer.name}
            </Link>
            {" / "}
            <Link href={`/customers/${match.b.customer.id}`} className="text-[var(--ob-primary)] hover:underline">
              {match.b.customer.name}
            </Link>
            <span className="text-[var(--ob-text-muted)]">
              {" "}
              — {match.reason}
              {match.confidence === "review" ? " (worth a look, not proof)" : ""}
            </span>
          </li>
        ))}
      </ul>
      {matches.length > 5 ? (
        <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
          +{matches.length - 5} more pair{matches.length - 5 === 1 ? "" : "s"}
        </p>
      ) : null}
    </Card>
  );
}

export default async function CustomerDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const raw = await searchParams;
  const code = toDemoBrandCode(ws.brand.code);
  const workspace = await loadCrmWorkspace(code);
  const profiles = buildCustomerProfiles(workspace);
  const universe = filterUniverse(profiles);
  const state = directoryFromParams(raw, universe.tags);

  // A saved segment narrows the book before the on-screen filters run, so the
  // two stack instead of fighting over the same URL.
  const segmentParam = typeof raw.segment === "string" ? raw.segment : null;
  const segment = workspace.segments.find((s) => s.id === segmentParam) ?? null;
  const memberIds = segment
    ? new Set(
        segment.kind === "manual"
          ? manualMemberIds(segment.member_ids, profiles)
          : segmentMemberIds(segment.rules ?? {}, profiles),
      )
    : state.memberIds;

  const page = queryDirectory(profiles, { ...state, memberIds });
  const params = flat(raw);
  const now = new Date();

  return (
    <PageShell
      title="Customers"
      headerActions={
        <>
          <CustomerImportDialog />
          <CsvExportButton label="Export CSV" onExport={exportCustomerDirectoryCsvAction} />
        </>
      }
    >
      <CrmSubnav activeHref="/customers/directory" />
      <div className="space-y-4">
        <DirectoryFilters
          state={{ ...state, memberIds }}
          segments={workspace.segments.map((s) => ({
            id: s.id,
            name: s.name,
            count:
              s.kind === "manual"
                ? manualMemberIds(s.member_ids, profiles).length
                : segmentMemberIds(s.rules ?? {}, profiles).length,
          }))}
          segmentId={segment?.id ?? null}
          universe={universe}
          loyaltyTiers={workspace.loyaltyRules?.tiers.map((t) => ({ id: t.id, name: t.name })) ?? []}
          total={page.total}
        />
        {canAddWorkspaceRecords() ? (
          <Card className="p-4">
            <h2 className="font-semibold">Add customer</h2>
            <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
              Name, phone and email live here — the CRM fields sit on the customer record.
              A spreadsheet of them belongs in Import CSV above.
            </p>
            <div className="mt-3">
              <CustomerEditor />
            </div>
          </Card>
        ) : null}
        <DuplicateNotice matches={findDuplicates(profiles)} />
        {segment ? (
          <p className="text-sm text-[var(--ob-text-muted)]">
            Showing the saved segment{" "}
            <span className="font-semibold text-[var(--ob-text)]">{segment.name}</span> —{" "}
            {segment.kind === "dynamic"
              ? "its rules are recomputed from live data on every load."
              : "a hand-picked list, which stays as you left it."}
          </p>
        ) : null}
        <div>
          <DirectoryTable page={page} currencyCode={workspace.currencyCode} now={now} />
          <DirectoryPagination page={page} params={params} />
        </div>
      </div>
    </PageShell>
  );
}
