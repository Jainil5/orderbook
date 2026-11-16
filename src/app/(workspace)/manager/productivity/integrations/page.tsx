import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav, ManagerStatRow } from "@/components/manager/manager-ui";
import { ConnectionCards } from "@/components/integrations/connection-cards";
import { SyncProposalQueue } from "@/components/integrations/sync-proposal-queue";
import { MessageProposalForm } from "@/components/integrations/message-proposal-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { toDemoBrandCode } from "@/lib/demo/data";
import { envContract } from "@/lib/integrations/config";
import { loadIntegrationsView } from "@/lib/integrations/service";
import { CAPABILITY_LABELS, scopeLabel } from "@/lib/integrations/labels";
import { loadWorkspaceSession } from "@/lib/workspace/session";

/**
 * The integrations screen: what is connected, what it may do, what came in,
 * and what is waiting for approval before it leaves.
 *
 * Everything rendered here comes from `loadIntegrationsView`, which returns
 * status, scope names and masked labels only — this page has no path to a
 * credential, and the env panel prints variable names, never values.
 */

const NOTICES: Record<string, string> = {
  connected: "Google account connected. Its calendars and messages can now be synced.",
  failed: "Google could not finish connecting this account. Nothing was saved.",
  not_allowed: "Only owners, admins and managers can connect external accounts.",
  too_many_attempts: "Too many attempts in a minute. Wait a moment and connect again.",
  not_configured:
    "This server has no Google OAuth credentials yet, so connecting is not possible.",
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; detail?: string }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("integrations")) {
    redirect("/manager/productivity");
  }

  const { notice, detail } = await searchParams;
  const code = toDemoBrandCode(ws.brand.code);
  const view = await loadIntegrationsView({
    code,
    role: ws.role,
    live: ws.mode !== "demo",
  });

  const lastRun = view.runs[0];
  // Live workspaces have no `brand_integrations` migration yet, so connecting
  // would fail on the first write. The screen stays readable; the actions hide.
  const canManage = view.canManage && ws.mode === "demo";
  const env = envContract();
  const configuredFor = (name: string): boolean => {
    if (name === "INTEGRATION_ENCRYPTION_KEY") return view.configuration.vault;
    if (name.startsWith("WHATSAPP_")) return view.configuration.whatsapp;
    return view.configuration.google;
  };
  const setNames = new Set(env.filter((row) => configuredFor(row.name)).map((row) => row.name));

  const stats = [
    {
      label: "Calendar items",
      value: String(view.imported.google_calendar),
      hint: "Events pulled into the unified agenda",
      href: "/manager/productivity/calendar",
    },
    {
      label: "Email follow-ups",
      value: String(view.imported.gmail),
      hint:
        view.needsFollowUp > 0
          ? `${view.needsFollowUp} flagged for a reply`
          : "Messages turned into follow-ups",
      href: "/manager/productivity/activities",
    },
    {
      label: "Waiting for you",
      value: String(view.pendingActions.length),
      hint: "Nothing leaves until confirmed",
    },
    {
      label: "Last sync",
      value: lastRun
        ? new Date(lastRun.ranAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Never",
      hint: lastRun ? (lastRun.ok ? "Completed" : "Failed") : "No runs recorded",
    },
  ];

  return (
    <PageShell title="Integrations">
      <ManagerSubnav
        manager="productivity"
        activeHref="/manager/productivity/integrations"
      />

      {notice && NOTICES[notice] ? (
        <div
          role="status"
          className={`mb-4 rounded-[var(--ob-radius-md)] border p-3 text-sm ${
            notice === "connected"
              ? "border-emerald-200 bg-emerald-50 text-[var(--ob-success)]"
              : "border-amber-200 bg-amber-50 text-[var(--ob-warning)]"
          }`}
        >
          {NOTICES[notice]}
          {detail ? <span className="block text-xs opacity-80">{detail}</span> : null}
        </div>
      ) : null}

      <ManagerStatRow stats={stats} />

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Credential storage</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--ob-text-muted)]">
              {view.vault.note}
            </p>
          </div>
          <Badge tone={view.vault.canStore ? "success" : "warning"}>
            {view.vault.canStore
              ? view.vault.backend === "supabase"
                ? "Encrypted at rest"
                : "Memory only (demo)"
              : "Cannot store"}
          </Badge>
        </div>
      </Card>

      {ws.mode !== "demo" ? (
        <p className="mb-4 rounded-md border border-[var(--ob-border)] bg-[var(--ob-surface-muted)] p-3 text-sm text-[var(--ob-text-secondary)]">
          This is a live workspace. The connection status below is read from the server,
          but connecting an account needs the <code className="text-xs">brand_integrations</code>{" "}
          table in the live database, which has not been provisioned for this workspace yet.
        </p>
      ) : null}

      <ConnectionCards connections={view.connections} canManage={canManage} />

      {canManage ? (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-semibold">Propose a message</h2>
          <MessageProposalForm configured={view.configuration.whatsapp} />
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Waiting for your confirmation</h2>
        <SyncProposalQueue
          actions={view.pendingActions}
          canManage={canManage}
          calendarLabel="Google Calendar or Gmail"
        />
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Sync history</h2>
        {view.runs.length === 0 ? (
          <EmptyState
            title="No sync runs yet"
            description="Once an account is connected, every import is logged here with how many items it brought in."
          />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <caption className="sr-only">Recent integration sync runs</caption>
              <thead className="bg-[var(--ob-surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--ob-text-muted)]">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Channel</th>
                  <th className="px-3 py-2 font-medium">Items</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {view.runs.map((run) => (
                  <tr
                    key={`${run.integration}-${run.ranAt}`}
                    className="border-t border-[var(--ob-border)]"
                  >
                    <td className="whitespace-nowrap px-3 py-2">
                      {new Date(run.ranAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{run.integration.replace("_", " ")}</td>
                    <td className="px-3 py-2">{run.imported}</td>
                    <td className="px-3 py-2 text-[var(--ob-text-muted)]">
                      {run.message ?? (run.ok ? "Ok" : "Failed")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section className="mt-6 grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="font-semibold">What this platform will never do</h2>
          <ul className="mt-2 space-y-2 text-sm text-[var(--ob-text-muted)]">
            <li>
              It does not ask for permission to send email. The Gmail grant covers reading
              and saving drafts, and there is no send path in the code.
            </li>
            <li>
              It does not write to your calendar or message anyone automatically. Every
              external change appears above as a proposal, and nothing is sent until you
              press confirm.
            </li>
            <li>
              It does not keep tokens in your browser. Access and refresh tokens are
              encrypted on the server, and the page only ever sees a status, scope names
              and a masked account label.
            </li>
            <li>
              Disconnecting deletes the stored credentials for that channel; the imported
              agenda rows stay so your history is not silently rewritten.
            </li>
          </ul>
          <p className="mt-3 text-xs text-[var(--ob-text-muted)]">
            Granted capabilities:{" "}
            {view.connections
              .filter((connection) => connection.status === "connected")
              .flatMap((connection) => connection.capabilities.map((cap) => CAPABILITY_LABELS[cap]))
              .join(", ") || "none yet"}
          </p>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold">Server settings</h2>
          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
            Names only — values are never read into this page.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {env.map((row) => (
              <li key={row.name} className="flex flex-wrap items-baseline gap-2">
                <code className="text-xs">{row.name}</code>
                <span
                  className={
                    setNames.has(row.name)
                      ? "text-xs text-[var(--ob-success)]"
                      : "text-xs text-[var(--ob-text-muted)]"
                  }
                >
                  {setNames.has(row.name) ? "set" : row.required ? "required" : "optional"}
                </span>
                <span className="text-xs text-[var(--ob-text-muted)]">{row.purpose}</span>
              </li>
            ))}
          </ul>
          {view.missingEnv.length > 0 ? (
            <p className="mt-3 rounded-md bg-[var(--ob-surface-muted)] p-2 text-xs text-[var(--ob-text-secondary)]">
              Still needed to switch this on: {view.missingEnv.join(", ")}
            </p>
          ) : (
            <p className="mt-3 text-xs text-[var(--ob-success)]">
              All credentials needed for Google Calendar and Gmail are present.
            </p>
          )}
          <p className="mt-3 text-xs text-[var(--ob-text-muted)]">
            Requested scopes:{" "}
            {view.connections
              .flatMap((connection) => connection.scopes.map(scopeLabel))
              .filter((scope, index, all) => all.indexOf(scope) === index)
              .join(", ") || "none"}
          </p>
        </Card>
      </section>
    </PageShell>
  );
}
