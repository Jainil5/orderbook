import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) {
    redirect("/login");
  }

  return <WorkspaceProvider value={ws}>{children}</WorkspaceProvider>;
}
