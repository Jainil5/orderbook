import { NextResponse } from "next/server";
import { placeWebOrder } from "@/lib/demo/server";
import {
  parseWebOrderPayload,
  WEB_ORDER_LIMITS,
  type WebOrderPayloadVerdict,
} from "@/lib/site/order-request";
import { siteProfile } from "@/lib/site/registry";

/**
 * The storefront's order endpoint. A visitor's tap on "Place order" is an
 * ordinary JSON POST — no framework-internal encoding, nothing for a CDN or
 * proxy between the customer and the shop to misunderstand — and it writes
 * the ticket through the same `placeWebOrder` path the site used before, so
 * the counter still sees it on the Orders board as an online order.
 */
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/site/[brand]/order">,
) {
  const { brand } = await params;
  const profile = siteProfile(brand);
  if (!profile) {
    return NextResponse.json(
      { ok: false, message: "This brand site does not exist." },
      { status: 404 },
    );
  }

  const declaredSize = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredSize) && declaredSize > WEB_ORDER_LIMITS.bodyBytes) {
    return NextResponse.json(
      { ok: false, message: "This order is too large to send." },
      { status: 413 },
    );
  }

  const verdict: WebOrderPayloadVerdict = parseWebOrderPayload(
    await request.json().catch(() => null),
  );
  if (!verdict.ok) {
    return NextResponse.json(
      { ok: false, message: verdict.message },
      { status: 400 },
    );
  }

  const result = await placeWebOrder(profile.code, verdict.input);
  return NextResponse.json(result, { status: result.ok ? 201 : 422 });
}
