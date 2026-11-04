"use client";

import { AppShell } from "@/components/shell/app-shell";
import { useDemoWorkspace } from "@/components/workspace/demo-workspace-provider";

export function DemoPageShell({
  title,
  headerActions,
  children,
}: {
  title: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { brand } = useDemoWorkspace();
  return (
    <AppShell
      mode="demo"
      brandName={brand.name}
      brandCode={brand.code}
      pageTitle={title}
      headerActions={headerActions}
    >
      {children}
    </AppShell>
  );
}
