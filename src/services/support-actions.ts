"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getDemoBrandPack } from "@/lib/demo/brands";
import {
  listDemoCustomers,
  listDemoOrderItemsForOrders,
  listDemoOrders,
} from "@/lib/demo/data";
import { findCustomerByPhone, phoneDigits } from "@/lib/demo/customer-identity";
import { updateDemoMutableBucket } from "@/lib/demo/mutable-store";
import { SITE_BRAND_CODE, siteBrand } from "@/lib/demo/site-brand";
import { resolveWorkingHours } from "@/lib/hours/resolve";
import { openStateAt } from "@/lib/hours/working-hours";
import { newOpsId } from "@/lib/manager/ops-shared";
import { consumeRateLimit, rateLimitKeyFromHeaders } from "@/lib/security/rate-limit";
import {
  ISSUE_KINDS,
  ISSUE_KIND_LABELS,
  lookupReference,
  projectOrder,
  supportReply,
  type OrderLookup,
  type SupportIssueKind,
} from "@/lib/support/self-serve";
import type {
  ComplaintSeverity,
  CustomerComplaint,
  CustomerInteraction,
} from "@/types/crm";
import type { Customer, Order } from "@/types/database";

/**
 * The public post-purchase desk: look up your own bill, log what went wrong.
 *
 * This is the second public write in the app and it follows the one rule
 * `site-order-actions.ts` sets: no workspace session, the rate limiter is the
 * only gate, and every row is written into the brand's own per-browser demo
 * bucket. Two things it never does:
 *
 * - It never takes a brand code from the form. Tenancy is `SITE_BRAND_CODE`,
 *   the same constant the public menu and the site tray use, so a payload
 *   cannot point this page at somebody else's dataset.
 * - It never says which half of the pairing failed. The page asks for a bill
 *   number *and* the mobile the bill was placed on, so a wrong answer to
 *   either one gets the same sentence — otherwise the endpoint would be a
 *   free oracle for "does this bill number exist?".
 *
 * Nothing here sends anything. The rows are the whole story: the manager's
 * complaint list and the customer's interaction log, which is where a human
 * picks them up.
 */

/** Lookups are cheap and a customer may check three bills to find one. */
const MAX_LOOKUPS = 30;
/** Raising an issue is the write: five a ten-minute window is more than once. */
const MAX_ISSUES = 5;
const REQUEST_WINDOW_MS = 10 * 60 * 1000;
/** The CRM's own cap on a complaint or interaction detail (`lib/crm/reviews.ts`). */
const MAX_DETAIL = 1000;
const MAX_ORDER_NUMBER = 40;

const NOT_FOUND =
  "We could not find that order. Check the bill number and the mobile number it was placed on.";

/**
 * Severity is the review desk's judgement, expressed by kind:
 *
 * - `quality` → high: what we served was not right, and somebody should check
 *   the batch while the machine is still warm.
 * - `refund` → high: money has already left the till and only a person can
 *   decide what happens to it.
 * - `missing_item`, `wrong_item` → medium: our mistake on a bill, easy to put
 *   right, but a bill that is wrong is still a wrong bill.
 * - `return` → medium: sealed goods coming back inside a window — a queue, not
 *   an emergency.
 * - `other` → low: feedback, read with the rest of the list.
 */
const SEVERITY_BY_KIND: Record<SupportIssueKind, ComplaintSeverity> = {
  missing_item: "medium",
  wrong_item: "medium",
  quality: "high",
  refund: "high",
  return: "medium",
  other: "low",
};

type MatchedOrder = {
  order: Order;
  customer: Customer;
  /** What the bill called them at the time, falling back to the customer row. */
  customerName: string;
};

/**
 * Both halves must line up on the server's own merged rows: the bill number
 * has to be this brand's order *and* belong to the customer whose mobile this
 * is. Merged loaders, not the packs, so an order the visitor placed on the
 * site a minute ago is findable here too.
 */
async function matchOrder(
  rawOrderNumber: string,
  rawMobile: string,
): Promise<MatchedOrder | null> {
  const wanted = rawOrderNumber.trim().toUpperCase().slice(0, MAX_ORDER_NUMBER);
  const digits = phoneDigits(rawMobile);
  if (!wanted || !digits) return null;

  const [orders, customers] = await Promise.all([
    listDemoOrders(undefined, SITE_BRAND_CODE),
    listDemoCustomers(undefined, SITE_BRAND_CODE),
  ]);
  const customer = findCustomerByPhone(customers, rawMobile);
  if (!customer) return null;
  const order = orders.find(
    (row) =>
      row.order_number.trim().toUpperCase() === wanted &&
      row.customer_id === customer.id,
  );
  if (!order) return null;
  return {
    order,
    customer,
    customerName: order.customer_name_snapshot?.trim() || customer.name,
  };
}

/**
 * The paths `saveComplaintAction` and `saveInteractionAction` revalidate — the
 * overview, the directory, both list screens, and the 360 the new rows appear
 * on. A write that reaches this page has to reach the manager's screen too.
 */
function revalidateCrmViews(customerId: string) {
  revalidatePath("/customers");
  revalidatePath("/customers/directory");
  revalidatePath("/customers/reviews");
  revalidatePath("/customers/interactions");
  revalidatePath(`/customers/${customerId}`);
}

export async function findOrderAction(input: {
  orderNumber: string;
  mobile: string;
}): Promise<{ ok: true; order: OrderLookup } | { ok: false; message: string }> {
  const limited = consumeRateLimit(
    `support-lookup:${rateLimitKeyFromHeaders(await headers())}`,
    MAX_LOOKUPS,
    REQUEST_WINDOW_MS,
  );
  if (!limited.allowed) {
    return {
      ok: false,
      message: `Too many lookups from this connection. Try again in ${limited.retryAfterSec} seconds.`,
    };
  }

  const match = await matchOrder(input?.orderNumber ?? "", input?.mobile ?? "");
  if (!match) return { ok: false, message: NOT_FOUND };

  const orderItems = await listDemoOrderItemsForOrders(SITE_BRAND_CODE);
  return {
    ok: true,
    order: projectOrder(
      match.order,
      orderItems,
      match.customerName,
      siteBrand().currencyCode,
    ),
  };
}

/**
 * Logging the issue. Two rows, exactly the way the workspace logs them: an
 * interaction — what the customer told us — and a complaint carrying the
 * back-link, so the 360 shows one story rather than two unrelated records.
 *
 * `complaint` is the honest entry in `INTERACTION_TYPES` for a customer
 * reporting something went wrong; it is what the review desk already logs for
 * the same event arriving by phone. `staff_id` stays null because no colleague
 * has picked it up yet. The follow-up date is only set when there is a future
 * to defer to: while the doors are open `opensAt` is the instant this window
 * *started*, so a due date then would be a lie in the past — the complaint list
 * itself is the prompt, and the reply text says so. Closed, the next opening
 * instant is exactly the time the customer was quoted.
 */
export async function raiseIssueAction(input: {
  orderNumber: string;
  mobile: string;
  kind: SupportIssueKind;
  detail: string;
}): Promise<
  | { ok: true; reference: string; headline: string; detail: string }
  | { ok: false; message: string }
> {
  const limited = consumeRateLimit(
    `support-issue:${rateLimitKeyFromHeaders(await headers())}`,
    MAX_ISSUES,
    REQUEST_WINDOW_MS,
  );
  if (!limited.allowed) {
    return {
      ok: false,
      message: `Too many issues logged from this connection. Try again in ${limited.retryAfterSec} seconds.`,
    };
  }

  const match = await matchOrder(input?.orderNumber ?? "", input?.mobile ?? "");
  if (!match) return { ok: false, message: NOT_FOUND };

  const kind = ISSUE_KINDS.find((option) => option === input?.kind);
  if (!kind) return { ok: false, message: "Tell us which of these it was." };

  const words = (input?.detail ?? "").trim().slice(0, MAX_DETAIL);
  if (words.length < 3) {
    return { ok: false, message: "Say what went wrong, in a few of your own words." };
  }

  const { hours, ordersPaused } = await resolveWorkingHours(SITE_BRAND_CODE);
  const now = new Date();
  const open = openStateAt(hours, now, { paused: ordersPaused });
  const issueLabel = ISSUE_KIND_LABELS[kind];
  // The reference carries the number on the customer's own record, not the
  // string that arrived in the form, so a crafted input cannot shape what the
  // counter is asked to look for.
  const reference = lookupReference(
    match.order.order_number,
    match.customer.phone ?? input?.mobile ?? "",
  );
  const reply = supportReply(issueLabel, open);
  // `brand_id` is the pack's own id, never a value that came off the form.
  const brandId = getDemoBrandPack(SITE_BRAND_CODE).settings.brand_id;
  const interactionId = newOpsId("int");

  const interaction: CustomerInteraction = {
    id: interactionId,
    brand_id: brandId,
    customer_id: match.customer.id,
    lead_id: null,
    type: "complaint",
    summary: `Self-serve issue ${reference} on order ${match.order.order_number}: ${issueLabel}`.slice(0, 160),
    detail: words,
    occurred_at: now.toISOString(),
    staff_id: null,
    outcome: null,
    next_follow_up_at:
      open.status === "closed" && open.opensAt ? open.opensAt.toISOString() : null,
    task_id: null,
    attachment_url: null,
  };

  const complaint: CustomerComplaint = {
    id: newOpsId("cmp"),
    brand_id: brandId,
    customer_id: match.customer.id,
    review_id: null,
    interaction_id: interactionId,
    subject: `Order ${match.order.order_number}: ${issueLabel} logged by the customer`.slice(0, 160),
    detail: words,
    severity: SEVERITY_BY_KIND[kind],
    status: "open",
    owner_staff_id: null,
    raised_at: now.toISOString(),
    resolved_at: null,
  };

  // One bucket write for both rows: they are a single event, and the CRM
  // merge (`loadDemoCrm`) reads both lists off the same store.
  await updateDemoMutableBucket(SITE_BRAND_CODE, (bucket) => ({
    ...bucket,
    interactions: [...bucket.interactions, interaction],
    complaints: [...bucket.complaints, complaint],
  }));

  revalidateCrmViews(match.customer.id);
  return {
    ok: true,
    reference,
    headline: reply.headline,
    detail: reply.detail,
  };
}
