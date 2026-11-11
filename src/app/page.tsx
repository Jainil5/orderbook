import { Landing } from "@/components/landing/landing";
import { getBrandSummaries } from "@/lib/demo/showcase-stats";

export default function HomePage() {
  return <Landing summaries={getBrandSummaries()} />;
}
