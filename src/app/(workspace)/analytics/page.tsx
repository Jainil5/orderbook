import { loadWorkspaceSession } from "@/lib/workspace/session";
import { redirect } from "next/navigation";
import {
  AnalyticsDemoSection,
  AnalyticsLiveSection,
} from "@/components/analytics/analytics-demo-section";

export default async function AnalyticsPage() {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  if (ws.mode === "demo") {
    return <AnalyticsDemoSection />;
  }

  return <AnalyticsLiveSection />;
}
