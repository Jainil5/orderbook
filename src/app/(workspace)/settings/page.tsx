"use client";

import { PageShell } from "@/components/workspace/page-shell";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const ws = useWorkspace();

  return (
    <PageShell title="Settings">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Business profile</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-[var(--ob-text-muted)]">Name</dt>
              <dd>{ws.brand.name}</dd>
            </div>
            <div>
              <dt className="text-[var(--ob-text-muted)]">Brand ID</dt>
              <dd>{ws.brand.code}</dd>
            </div>
            <div>
              <dt className="text-[var(--ob-text-muted)]">Currency</dt>
              <dd>{ws.settings.currency_code}</dd>
            </div>
            {ws.settings.tax_rate_percent != null ? (
              <div>
                <dt className="text-[var(--ob-text-muted)]">Tax rate</dt>
                <dd>{ws.settings.tax_rate_percent}%</dd>
              </div>
            ) : null}
          </dl>
        </Card>
        <Card>
          <h2 className="font-semibold">Your account</h2>
          {ws.mode === "live" && ws.userEmail ? (
            <p className="mt-2 text-sm">{ws.userEmail}</p>
          ) : (
            <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
              Guest workspace — sign in to manage your account.
            </p>
          )}
          {ws.mode === "live" ? (
            <Badge className="mt-3" tone="neutral">
              Role: {ws.member.role}
            </Badge>
          ) : null}
        </Card>
      </div>
    </PageShell>
  );
}
