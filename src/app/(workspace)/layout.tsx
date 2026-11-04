import { loadLiveWorkspace } from "@/lib/auth/actions";
import { redirect } from "next/navigation";
import { LiveWorkspaceProvider } from "@/components/workspace/live-workspace-provider";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ws = await loadLiveWorkspace();
  if (!ws) {
    redirect("/login?error=membership");
  }

  return (
    <LiveWorkspaceProvider value={ws}>{children}</LiveWorkspaceProvider>
  );
}
