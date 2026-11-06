"use client";

import { AppShell } from "@/components/shell/app-shell";
import { useWorkspace } from "@/components/workspace/workspace-provider";
import {
  WorkspaceBrandWebsiteLink,
  WorkspaceSettingsFeaturesLink,
} from "@/components/workspace/workspace-brand-website-link";

export function PageShell({
  title,
  headerActions,
  children,
}: {
  title: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ws = useWorkspace();
  return (
    <AppShell
      mode={ws.mode}
      brandName={ws.brand.name}
      brandCode={ws.brand.code}
      userEmail={ws.userEmail}
      profile={ws.profile}
      pageTitle={title}
      headerActions={
        <>
          <span className="hidden sm:contents">
            <WorkspaceBrandWebsiteLink />
            <WorkspaceSettingsFeaturesLink />
          </span>
          {headerActions}
        </>
      }
    >
      {children}
    </AppShell>
  );
}
