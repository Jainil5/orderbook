"use client";

import { AppShell } from "@/components/shell/app-shell";
import { useWorkspace } from "@/components/workspace/workspace-provider";

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
      pageTitle={title}
      headerActions={headerActions}
    >
      {children}
    </AppShell>
  );
}
