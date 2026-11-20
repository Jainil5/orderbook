/**
 * Post-purchase self-serve — the pure half.
 *
 * A customer looks up their own bill on a page with no session behind it, so
 * two rules hold everywhere in this file:
 *
 * - Nothing internal reaches the browser. `projectOrder` is the only way an
 *   order leaves the server for this page, and it carries the bill number, the
 *   date, a status word, a total and the line names — never an order id, a
 *   customer id or a brand id. The bill number is not a secret here: it is
 *   printed on the paper in the customer's hand.
 * - Nothing is promised that the demo cannot do. There is no messaging
 *   provider wired up (`docs/SECURITY.md`), so no line below says "we will
 *   text you" or "check your email". What the counter can honestly say is when
 *   a person will next be standing at the till, and `OpenState.label` from the
 *   working-hours module is exactly that sentence — so every reply quotes it.
 *
 * No Next, no cookies, no demo loaders: the same module runs inside the client
 * component and inside the server action, which is what keeps the notice on the
 * page and the answer after a write word-for-word the same.
 */
import type { OpenState } from "@/lib/hours/working-hours";
import type { Order, OrderItem, OrderStatus } from "@/types/database";

/** What the customer says went wrong, in six choices and no more. */
export type SupportIssueKind =
  | "missing_item"
  | "wrong_item"
  | "quality"
  | "refund"
  | "return"
  | "other";

export const ISSUE_KINDS: readonly SupportIssueKind[] = [
  "missing_item",
  "wrong_item",
  "quality",
  "refund",
  "return",
  "other",
] as const;

export const ISSUE_KIND_LABELS: Record<SupportIssueKind, string> = {
  missing_item: "Missing item",
  wrong_item: "Wrong item",
  quality: "Quality problem",
  refund: "Refund",
  return: "Return",
  other: "Something else",
};

/**
 * The return and refund rules, in the merchant's own voice. These are the
 * limits a counter actually works to: hot food that has left the pass cannot
 * be taken back, a mistake on the bill is put right for nothing, and money
 * only moves when a person decides it should.
 */
export const POLICY_LINES: readonly string[] = [
  "Tell us the same day. A cold drink or a missing bottle is easy to put right an hour later and hard to reconstruct a week later.",
  "Food and drink we have made cannot come back once it leaves the counter — that is food safety, not policy, and it applies even if you did not like it.",
  "Sealed retail goods (beans, bottles, merchandise) can be returned within seven days with the bill number and the item as we packed it.",
  "If something was missing, wrong or not as described, we remake it or take it off the bill. There is no charge and no argument for our mistake.",
  "A refund is a decision a person makes, not a switch on this page. Log it and the counter settles it against your bill when you come in.",
  "Every issue logged here lands on the manager's complaint list and stays open until someone at the till closes it.",
  "Nothing is sent from this page — no SMS, no email, no WhatsApp. Quote your reference at the counter and the whole story is on the screen.",
];

/**
 * Customer-facing form of the six states a bill can be in — the same
 * vocabulary as `OrderStatus`, which the workspace prints raw and the list
 * filters allow through `src/lib/security/input.ts`. `draft` reads as a
 * quotation because that is what the counter calls the document.
 */
const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Quotation",
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** Everything this page may show about one bill. */
export type OrderLookup = {
  orderNumber: string;
  placedAt: string;
  status: string;
  total: number;
  currencyCode: string;
  /** Count of separate lines on the bill — always `lines.length`. */
  itemCount: number;
  customerName: string;
  lines: { name: string; quantity: number }[];
};

/**
 * Project an order for the person who placed it.
 *
 * `orderItems` is the whole merged item list rather than this order's slice, so
 * the id filter happens here and the caller never has to hand an id to the
 * page. `customerName` comes from the row the server matched on the mobile
 * number, which is why the projection is safe to render: the customer has
 * already proved they hold that number.
 */
export function projectOrder(
  order: Order,
  orderItems: readonly OrderItem[],
  customerName: string,
  currencyCode: string,
): OrderLookup {
  const mine = orderItems.filter((item) => item.order_id === order.id);
  return {
    orderNumber: order.order_number,
    placedAt: order.created_at,
    status: ORDER_STATUS_LABELS[order.status],
    total: order.grand_total,
    currencyCode,
    itemCount: mine.length,
    customerName,
    lines: mine.map((item) => ({
      name: item.product_name_snapshot,
      quantity: item.quantity,
    })),
  };
}

/**
 * The short reference the customer quotes at the counter: the bill number with
 * its punctuation folded away, plus the last four digits of the mobile on the
 * bill. Deterministic on purpose — the same order and the same number always
 * say the same thing, so a reference can be repeated from memory.
 */
export function lookupReference(orderNumber: string, mobile: string): string {
  const order = orderNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const digits = mobile.replace(/\D/g, "");
  return `SUP-${order || "ORDER"}-${digits.slice(-4) || "0000"}`;
}

/**
 * The paused branch of `openStateAt` has no status of its own — it comes back
 * as `closed` with one fixed sentence. Comparing that sentence is the only
 * honest way to tell "closed for now" from "the owner has stopped taking
 * orders", and the label is quoted rather than reworded so the page can never
 * disagree with the till.
 */
const PAUSED_LABEL = "Not taking orders right now";

function isPaused(open: OpenState): boolean {
  return open.status === "closed" && open.label === PAUSED_LABEL;
}

/**
 * When a human will next read this, in one sentence. The open state's own
 * label is pasted in whole — it is already a sentence, and repeating it here
 * is what guarantees the notice on the page, the reply after a write and the
 * pill at the top of the site all say the same time.
 */
export function answerLine(open: OpenState): string {
  if (isPaused(open)) {
    return `${open.label} — we cannot give you a time for this one. It waits until orders start again, and whoever opens them sees it.`;
  }
  if (open.status === "open") {
    return `${open.label} — a person is at the till, so this can be put right today.`;
  }
  if (open.status === "closing_soon") {
    return `${open.label}. Say it now and it gets put right before we lock up; after that it waits for the next shift.`;
  }
  if (!open.opensAt) {
    return `${open.label}, with no opening time on the schedule, so we will not invent one.`;
  }
  return `${open.label} — that is the first time a person will read this.`;
}

/**
 * What the customer is told after logging an issue. The four situations say
 * four different things: while the doors are open there is someone to speak
 * to, in the last hour the answer is a race, after closing it is a wait, and a
 * paused counter cannot promise anything at all.
 */
export function supportReply(
  issueLabel: string,
  open: OpenState,
): { headline: string; detail: string } {
  if (isPaused(open)) {
    return {
      headline: "Logged — but the counter is not taking orders right now",
      detail: `${issueLabel} on this bill is written down with your reference. ${answerLine(open)}`,
    };
  }
  if (open.status === "open") {
    return {
      headline: "Logged — the counter is open now",
      detail: `${issueLabel} on this bill is written down with your reference. ${answerLine(open)} Bring the bill number to the counter, or say the reference, and it is on the manager's list already.`,
    };
  }
  if (open.status === "closing_soon") {
    return {
      headline: "Logged — the counter is closing soon",
      detail: `${issueLabel} on this bill is written down with your reference. ${answerLine(open)}`,
    };
  }
  return {
    headline: "Logged — we will read it when we open",
    detail: `${issueLabel} on this bill is written down with your reference. ${answerLine(open)}`,
  };
}
