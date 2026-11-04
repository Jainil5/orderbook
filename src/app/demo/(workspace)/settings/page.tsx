"use client";

import { DemoPageShell } from "@/components/workspace/demo-page-shell";
import { useDemoWorkspace } from "@/components/workspace/demo-workspace-provider";
import { Card } from "@/components/ui/card";

export default function DemoSettingsPage() {
  const { brand, settings } = useDemoWorkspace();

  return (
    <DemoPageShell title="Settings">
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
          </dl>
        </Card>
        <Card>
          <h2 className="font-semibold">Account</h2>
          <p className="mt-2 text-sm text-[var(--ob-text-muted)]">
            Password and profile management require sign-in.
          </p>
        </Card>
      </div>
    </DemoPageShell>
  );
}
