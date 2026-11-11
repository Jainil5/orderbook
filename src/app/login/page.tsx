import { DemoPicker } from "@/components/auth/demo-picker";
import { getDemoShowcaseStats } from "@/lib/demo/showcase-stats";

// The showcase figures are rebased to the current day, so the page must render
// per request instead of from build-time output.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <DemoPicker showcase={getDemoShowcaseStats("BR-1")} />;
}
