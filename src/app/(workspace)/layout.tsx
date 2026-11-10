import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { NotificationsProvider } from "@/components/notifications/notifications-context";
import { DemoIncomingOrders } from "@/components/notifications/demo-incoming-orders";
import { DemoFeedSeed } from "@/components/notifications/demo-feed-seed";

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

  return (
    <NotificationsProvider>
      <WorkspaceProvider value={ws}>
        {ws.mode === "demo" ? (
          <>
            <DemoFeedSeed />
            <DemoIncomingOrders brandCode={ws.brand.code} />
          </>
        ) : null}
        {children}
      </WorkspaceProvider>
    </NotificationsProvider>
  );
}
