import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { ManagerSubnav } from "@/components/manager/manager-ui";
import { Card } from "@/components/ui/card";
import { STAFF_ROLES, STAFF_ROLE_LABELS } from "@/lib/manager/staff";
import {
  canEditBrandSettings,
  canLogCrmActivity,
  canManageCatalog,
  canManageCrm,
  canManageOrderOperations,
  canRecordPayments,
} from "@/lib/security/authorization";
import { canEditWorkspaceFeatures } from "@/lib/workspace/settings-access";
import { loadWorkspaceSession } from "@/lib/workspace/session";
import type { BrandRole } from "@/types/database";

const BRAND_ROLES: BrandRole[] = ["owner", "admin", "manager", "staff"];

const BRAND_ROLE_LABELS: Record<BrandRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
};

/** Every row calls the real authorization helper, so the table cannot drift from the code. */
const CAPABILITIES: {
  label: string;
  hint: string;
  allows: (role: BrandRole) => boolean;
}[] = [
  {
    label: "Edit brand settings",
    hint: "Settings, receipt details, Manager modules",
    allows: canEditBrandSettings,
  },
  {
    label: "Manage catalogue",
    hint: "Products, services, stock adjustments",
    allows: canManageCatalog,
  },
  {
    label: "Manage order operations",
    hint: "Refunds, posted-order status changes",
    allows: canManageOrderOperations,
  },
  {
    label: "Record payments",
    hint: "Take payment at billing or on an order",
    allows: canRecordPayments,
  },
  {
    label: "Log CRM activity",
    hint: "Leads, follow-ups, calls, visits, review replies",
    allows: canLogCrmActivity,
  },
  {
    label: "Manage CRM",
    hint: "Segments, campaigns, loyalty, complaints, deletions",
    allows: canManageCrm,
  },
];

const STAFF_ROLE_NOTES: Record<string, string> = {
  manager: "Roster lead: gets scheduled shifts and owns team tasks",
  cashier: "Front counter and billing",
  kitchen: "Kitchen and prep shifts",
  technician: "Installation and service jobs",
  sales: "Showroom floor, quotes and follow-up visits",
  other: "Anything not covered by the roles above",
};

export default async function StaffPermissionsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");
  if (ws.hiddenManagerModules.includes("permissions")) redirect("/manager/staff");

  const canEditFeatures = canEditWorkspaceFeatures(ws);

  return (
    <PageShell title="Roles & Permissions">
      <ManagerSubnav manager="staff" activeHref="/manager/staff/permissions" />

      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="font-semibold">Two role systems, two jobs</h2>
          <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium">Workspace role (BrandRole)</dt>
              <dd className="mt-1 text-[var(--ob-text-muted)]">
                Owner, admin, manager or staff. Decides what a signed-in person may
                change. In a live workspace it is stored per user on their
                <code className="mx-1 rounded bg-[var(--ob-surface-muted)] px-1">brand_members</code>
                row, and the capability table below is computed from the same helpers the
                rest of the app uses.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Roster role (StaffRole)</dt>
              <dd className="mt-1 text-[var(--ob-text-muted)]">
                Manager, cashier, kitchen, technician, sales or other. Describes the job
                an employee does for shifts, tasks and service jobs. It never opens or
                locks a screen.
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-[var(--ob-text-muted)]">
            Every member of the brand can open the Staff Manager screens. Which sections
            appear at all is a workspace preference (Settings → Business type & Manager
            modules), and what a person can change is decided by the capabilities below.
          </p>
        </Card>

        <Card className="overflow-x-auto p-0">
          <div className="p-4 pb-0">
            <h2 className="font-semibold">What each workspace role can change</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              Your role: <span className="font-medium text-[var(--ob-text)]">{BRAND_ROLE_LABELS[ws.role]}</span>
              {" · "}
              {ws.mode === "demo"
                ? "demo workspace, so feature settings are editable"
                : `feature settings ${canEditFeatures ? "editable" : "read-only"}`}
            </p>
          </div>
          <table className="mt-3 w-full min-w-[560px] border-collapse text-sm">
            <caption className="sr-only">
              Capability matrix for owner, admin, manager and staff roles
            </caption>
            <thead>
              <tr className="bg-[var(--ob-surface-muted)]">
                <th className="p-2 text-left font-medium">Capability</th>
                {BRAND_ROLES.map((role) => (
                  <th
                    key={role}
                    className="p-2 text-left font-medium"
                    aria-current={role === ws.role ? "true" : undefined}
                  >
                    <span
                      className={
                        role === ws.role
                          ? "rounded bg-[var(--ob-primary)] px-2 py-0.5 text-white"
                          : undefined
                      }
                    >
                      {BRAND_ROLE_LABELS[role]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((capability) => (
                <tr key={capability.label} className="border-t border-[var(--ob-border)]">
                  <th scope="row" className="p-2 text-left font-normal">
                    {capability.label}
                    <span className="block text-xs text-[var(--ob-text-muted)]">
                      {capability.hint}
                    </span>
                  </th>
                  {BRAND_ROLES.map((role) => {
                    const allowed = capability.allows(role);
                    return (
                      <td
                        key={role}
                        className={`p-2 ${
                          role === ws.role ? "bg-[var(--ob-surface-muted)]" : ""
                        }`}
                      >
                        {allowed ? (
                          <span className="text-[var(--ob-success)]">
                            Allowed
                            <span className="sr-only">{` for ${BRAND_ROLE_LABELS[role]}`}</span>
                          </span>
                        ) : (
                          <span className="text-[var(--ob-text-muted)]">
                            Read-only
                            <span className="sr-only">{` for ${BRAND_ROLE_LABELS[role]}`}</span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-x-auto p-0">
          <div className="p-4 pb-0">
            <h2 className="font-semibold">Roster roles</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              Set on the staff record and used by schedules, tasks and service jobs.
            </p>
          </div>
          <table className="mt-3 w-full min-w-[420px] border-collapse text-sm">
            <caption className="sr-only">Roster role and what it is used for</caption>
            <thead>
              <tr className="bg-[var(--ob-surface-muted)]">
                <th className="p-2 text-left font-medium">Roster role</th>
                <th className="p-2 text-left font-medium">Used for</th>
              </tr>
            </thead>
            <tbody>
              {STAFF_ROLES.map((role) => (
                <tr key={role} className="border-t border-[var(--ob-border)]">
                  <th scope="row" className="p-2 text-left font-normal">
                    {STAFF_ROLE_LABELS[role]}
                  </th>
                  <td className="p-2 text-[var(--ob-text-muted)]">
                    {STAFF_ROLE_NOTES[role] ?? "General roster entry"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold">What is not here</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--ob-text-muted)]">
            <li>
              Employee logins are not created from this screen. In a live workspace, access
              comes from a <code className="rounded bg-[var(--ob-surface-muted)] px-1">brand_members</code>{" "}
              row per user; the staff records here are roster entries, and attendance, leave
              and rota writes currently only apply to demo workspaces.
            </li>
            <li>
              There is no per-employee permission list: nothing grants one cashier extra
              rights over another. Permissions are the workspace role above.
            </li>
            <li>
              Payroll and commissions are not implemented anywhere in OrderBook today: no
              salary or commission field exists on the staff record and no screen here
              computes pay. They are future work, not a hidden feature.
            </li>
          </ul>
        </Card>
      </div>
    </PageShell>
  );
}
