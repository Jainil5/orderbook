import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { NotificationsProvider } from "@/components/notifications/notifications-context";
import { DemoFeedSeed } from "@/components/notifications/demo-feed-seed";
import { WebOrdersSeed } from "@/components/notifications/web-orders-seed";
import { demoWebOrderFeed } from "@/lib/demo/server";
import { webOrderNotifications } from "@/lib/notifications/web-orders";

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

  // Online orders placed on the brand website surface in the bell with the
  // customer's name, item count and total — real rows, not a simulated tick.
  const webOrders =
    ws.mode === "demo"
      ? webOrderNotifications(await demoWebOrderFeed(), ws.brand.name)
      : [];

  return (
    <NotificationsProvider>
      <WorkspaceProvider value={ws}>
        {ws.mode === "demo" ? (
          <>
            <DemoFeedSeed />
            <WebOrdersSeed items={webOrders} />
          </>
        ) : null}
        {children}
      </WorkspaceProvider>
    </NotificationsProvider>
  );
}
