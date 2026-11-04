"use client";

import { AppShell } from "@/components/shell/app-shell";
import { useLiveWorkspace } from "@/components/workspace/live-workspace-provider";

export function LivePageShell({
  title,
  headerActions,
  children,
}: {
  title: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { brand, userEmail } = useLiveWorkspace();
  return (
    <AppShell
      mode="live"
      brandName={brand.name}
      brandCode={brand.code}
      userEmail={userEmail}
      pageTitle={title}
      headerActions={headerActions}
    >
      {children}
    </AppShell>
  );
}
