import { redirect } from "next/navigation";
import { PageShell } from "@/components/workspace/page-shell";
import { MarketingSubnav } from "@/components/marketing/marketing-subnav";
import {
  ContentManager,
  type ContentInitialBrief,
} from "@/components/marketing/content-manager";
import { listDemoProductsMerged, toDemoBrandCode } from "@/lib/demo/data";
import {
  CONTENT_OBJECTIVE_LABELS,
  REEL_DURATIONS,
  clampNotes,
  type ContentKind,
  type ContentObjective,
} from "@/lib/marketing/script";
import { loadWorkspaceSession } from "@/lib/workspace/session";

const KINDS: readonly string[] = ["reel", "image"];

/**
 * A brief arrives as URL params from Growth Signals. Everything is allowlisted
 * here — an unknown objective or a length outside the reel menu simply means
 * "start from the defaults", never "pass it through".
 */
function readBrief(params: {
  product?: string;
  objective?: string;
  kind?: string;
  seconds?: string;
  notes?: string;
}): ContentInitialBrief | null {
  const productId = params.product?.trim();
  if (!productId) return null;

  const objective = params.objective ?? "";
  const kind = params.kind ?? "";
  if (!Object.keys(CONTENT_OBJECTIVE_LABELS).includes(objective)) return null;
  if (!KINDS.includes(kind)) return null;

  const parsedSeconds = Number(params.seconds);
  const seconds =
    kind === "reel" && (REEL_DURATIONS as readonly number[]).includes(parsedSeconds)
      ? parsedSeconds
      : kind === "reel"
        ? REEL_DURATIONS[0]
        : 0;

  return {
    productId,
    objective: objective as ContentObjective,
    kind: kind as ContentKind,
    seconds,
    notes: clampNotes(params.notes ?? ""),
  };
}

export default async function ContentManagementPage({
  searchParams,
}: {
  searchParams: Promise<{
    product?: string;
    objective?: string;
    kind?: string;
    seconds?: string;
    notes?: string;
  }>;
}) {
  const ws = await loadWorkspaceSession();
  if (!ws) redirect("/login");

  const products = await listDemoProductsMerged(
    { activeOnly: true },
    toDemoBrandCode(ws.brand.code),
  );
  const brief = readBrief(await searchParams);

  return (
    <PageShell title="Content Management">
      <MarketingSubnav activeHref="/marketing/content" />
      <ContentManager
        key={`${brief?.productId ?? "new"}-${brief?.objective ?? "discount"}`}
        brandName={ws.brand.name}
        currencyCode={ws.settings.currency_code}
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          price: p.price,
          image_url: p.image_url ?? null,
        }))}
        initialBrief={brief}
      />
    </PageShell>
  );
}
