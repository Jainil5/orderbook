import { demoWorkspaceMeta } from "@/lib/demo/data";
import { DemoWorkspaceProvider } from "@/components/workspace/demo-workspace-provider";

export default function DemoWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const meta = demoWorkspaceMeta();
  return (
    <DemoWorkspaceProvider value={meta}>{children}</DemoWorkspaceProvider>
  );
}
