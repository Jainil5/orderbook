import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { NotificationsProvider } from "@/components/notifications/notifications-context";
import { NewOrderAlerts } from "@/components/notifications/new-order-alerts";
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
        <NewOrderAlerts
          brandCode={ws.brand.code}
          currencyCode={ws.settings.currency_code}
        />
        {ws.mode === "demo" ? <DemoFeedSeed /> : null}
        {children}
      </WorkspaceProvider>
    </NotificationsProvider>
  );
}
