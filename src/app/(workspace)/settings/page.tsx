"use client";

import { LivePageShell } from "@/components/workspace/live-page-shell";
import { useLiveWorkspace } from "@/components/workspace/live-workspace-provider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const { brand, settings, member, userEmail } = useLiveWorkspace();

  return (
    <LivePageShell title="Settings">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Business profile</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-[var(--ob-text-muted)]">Name</dt>
              <dd>{brand.name}</dd>
            </div>
            <div>
              <dt className="text-[var(--ob-text-muted)]">Brand ID</dt>
              <dd>{brand.code}</dd>
            </div>
            <div>
              <dt className="text-[var(--ob-text-muted)]">Currency</dt>
              <dd>{settings.currency_code}</dd>
            </div>
            {settings.tax_rate_percent != null ? (
              <div>
                <dt className="text-[var(--ob-text-muted)]">Tax rate</dt>
                <dd>{settings.tax_rate_percent}%</dd>
              </div>
            ) : null}
          </dl>
        </Card>
        <Card>
          <h2 className="font-semibold">Your account</h2>
          <p className="mt-2 text-sm">{userEmail}</p>
          <Badge className="mt-3" tone="neutral">
            Role: {member.role}
          </Badge>
          <p className="mt-4 text-sm text-[var(--ob-text-muted)]">
            Password changes via Supabase Auth — coming soon in UI.
          </p>
        </Card>
      </div>
    </LivePageShell>
  );
}
