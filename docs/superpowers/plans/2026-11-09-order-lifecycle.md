# Order Lifecycle & Billing Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** POS bills save as Pending orders that complete from an orders board with payment auto-finalization, a rebuilt bill-capture form (phone-primary customers, order type, date, offer-code selector, payment methods), product Unavailable (A/NA) flags, a deterministic 6-month growth+dip demo history, and a paste-ready Supabase seed SQL.

**Architecture:** One lifecycle rule layer (`src/lib/orders/order-rules.ts` + `buildOrderRecord`) shared by demo and live save paths; a new `completeOrderAction` finalizes payment through the existing demo payment machinery; brand-pack history is generated deterministically by a seeded module (server-side, zero cookie cost) and exported to SQL by a dump test. The orders page becomes a client board (Ongoing/All tabs) reusing `OrdersTable` for the All view.

**Tech Stack:** Next.js (custom fork — read `node_modules/next/dist/docs/` before fighting conventions), React client components, TypeScript, Vitest (node env), existing `ob-*` CSS token system.

**Spec:** `docs/superpowers/specs/2026-11-09-order-lifecycle-design.md` (binding; this plan argues from it)

## Global Constraints

- Work happens in worktree `.worktrees/order-lifecycle`, branch `feat/order-lifecycle` (baseline 3327a5b + spec commit ef64942). Dev/E2E port **:3003** (never :3000). E2E only via Playwright MCP isolated browser (`mcp__plugin_playwright_playwright__*`); remove `nextjs-portal` via evaluate when the dev overlay blocks clicks; the unsafe-eval CSP console error is the only acceptable console error.
- Static gate every task: `npm test && npx next typegen && npx tsc --noEmit` green (typegen BEFORE tsc is mandatory in this fork). ESLint clean.
- Action contract: server actions return `{ok:true, ...}|{ok:false,message}`; clients wrap calls in try/catch/finally — catch sets `"Could not save. Try again."`, finally clears pending, every success clears stale errors before/with `router.refresh()`.
- Money: `roundMoney(x) = Math.round(x*100)/100`; bills must satisfy `subtotal − discount + tax = grand_total` exactly (the 5% tax rule from `computeCartTotals`).
- Identity: `normalizeCustomerPhone` from the billing validation imports is the only phone comparison — match customers by normalized-phone equality.
- Time: local-time derivation only via `src/lib/manager/time.ts` (`localDayKey` etc.); every now-based render gated by `useMounted()` from `src/lib/use-mounted.ts`. Never `toISOString().slice(0,10)` for day buckets.
- Touch targets: `ob-touch-target` on ALL interactive elements (tabs, chips, segmented controls included). No page-level horizontal overflow at 375×812.
- Demo-first: nothing touches Supabase; live branches of new actions return honest `{ok:false,message:"Live mode unavailable."}`-style results through existing patterns; fixtures are server-side only (cookie store keeps its 40-order cap).
- Hydration: default form values must not differ server vs client (`useState(() => localDayKey(new Date()))` is SSR-safe because the server day-key renders first paint; any client-only correction happens in `useEffect` — follow the schedules-manager pattern).
- Trailing single newline on every touched file. Do not stage `.superpowers/`, `.env.local`, or scratch files (evidence files live in `/tmp` and get deleted). `next dev` re-adds the AGENTS.md block — commit it with the work when dirty.
- Commit per task (or per logical step inside a task); commit messages `feat:`/`fix:`/`test:` prefixed as in history.

**Key current-code facts (verified, cite them in dispatches):**
- `OrderStatus` is `draft|confirmed|completed|cancelled|refunded` (`src/types/database.ts:99`); `PaymentStatus` `pending|partial|paid|failed|refunded` (:104); `Order` (:113) and `CreateOrderInput` (:218) quoted below; `allowedStatusTransitions` (`src/lib/orders/order-rules.ts:43`); `isOpenQuote`/`isOpenReceivable` already in order-rules.
- `buildOrderRecord` (`src/lib/orders/build-order-record.ts:89`) currently sets `status: isQuote ? "draft" : "completed"` where `isQuote = input.paymentStatus === "pending"` (:151, :179).
- `submitDemoOrder` (`src/lib/demo/server.ts:209`) uses the same `isQuote` rule for the `BC-Q` order-number prefix (:242-245) and only creates customers when `saveNewCustomer` (:220-239).
- `updateDemoOrderStatus` (server.ts:418) patches the cookie order, falling back to `bucket.orderPatches` for fixture orders; `recordDemoPayment` (server.ts:443) appends `bucket.payments` + patches `amount_paid`/`payment_status` and audits.
- `mergedOrderData` (`src/lib/demo/data.ts:31`): pack fixture orders overlaid by cookie orders, then `applyOrderPatches`; `listDemoOrders(filters, brandCode)` (:120).
- Dashboard (`src/app/(workspace)/dashboard/page.tsx:39-60`) and analytics (`analytics/page.tsx:65+`) feed range-filtered orders to `snapshotFromOrderRecords` (`src/lib/analytics/snapshot.ts:87`) with **no status filter** — `snapshotFromDemo` and brand-pack `analytics` presets have no consumers (dead; do not update them).
- Billing UI: `billing-pos.tsx` (1080 lines) — state :126-155, `handleSubmit(asQuote)` :341-462 (passes `saveAsQuote: asQuote` into `onSubmitOrder`, a prop wired to `submitOrderAction`), customer fields :574-657 (name, mobile, **saved-customer select to remove**), table tag :659-671, `saveNewCustomer` checkbox :698-706, offer input :707-717, notes :718-727, payment select :769-783, `saveAsQuote` checkbox :821-829, Confirm button :839-846, tile builder `productTile` :862-882 via `PosProductTileWithButton` (`pos-product-tile.tsx`).
- Products: `Product.is_active`, override persistence `productOverrideFields` (`src/lib/demo/server.ts` ~:132-207), `mergeDemoProducts(pack.products, bucket)`, tiles read `stockAvailable`/`isLowStock`.
- Kitchen board (`src/app/(workspace)/kitchen/page.tsx:16`) filters `status === "confirmed" || status === "draft"` — pending orders will never appear unless updated.
- Ops actions pattern (existence guard + role gate + audit) lives in `src/services/manager-ops-actions.ts` (`hasOpsRecord`, `guardOps`); order ops live in `src/services/operations-actions.ts` (`updateOrderStatusAction`:75, `recordPaymentAction`:87, `exportOrdersCsvAction`:152).

---

### Task 1: Data model + lifecycle core (types, rules, builder)

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/lib/orders/order-rules.ts`
- Modify: `src/lib/orders/build-order-record.ts`
- Modify: `src/lib/demo/server.ts` (only the two `isQuote` detection sites)
- Test: `src/lib/orders/order-rules.test.ts` (create), `src/lib/orders/build-order-record.test.ts` (create — if one already exists for the builder, extend it and note so here)

**Interfaces:**
- Consumes: existing `CreateOrderInput`, `computeCartTotals`.
- Produces: `OrderStatus` includes `"pending"`; `Order.order_type?: "dine_in"|"takeaway"|"delivery"|"online"`, `Order.service_date?: string|null`, `Order.guests?: number|null`, `Order.delivery_address?: string|null`, `Order.payment_method?: string|null`, `Order.payment_reference?: string|null`; `CreateOrderInput.saveAsQuote?: boolean`, `.orderType?`, `.serviceDate?`, `.guests?`, `.deliveryAddress?`, `.paymentReference?`; `isRevenueOrder(order)`, `isPendingOrder(order)`, `allowedStatusTransitions("pending") = ["completed","cancelled"]`. Task 2 guards on these; Task 3 passes the new input fields; Task 7 filters with `isRevenueOrder`.

- [ ] **Step 1: Failing tests for rules + builder.**

`src/lib/orders/order-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allowedStatusTransitions, isPendingOrder, isRevenueOrder } from "./order-rules";

describe("lifecycle rules", () => {
  it("allows pending orders to complete or cancel", () => {
    expect(allowedStatusTransitions("pending")).toEqual(["completed", "cancelled"]);
  });
  it("treats completed as the only revenue status", () => {
    expect(isRevenueOrder({ status: "completed" })).toBe(true);
    expect(isRevenueOrder({ status: "pending" })).toBe(false);
    expect(isRevenueOrder({ status: "confirmed" })).toBe(false);
    expect(isRevenueOrder({ status: "cancelled" })).toBe(false);
    expect(isRevenueOrder({ status: "draft" })).toBe(false);
  });
  it("flags pending orders", () => {
    expect(isPendingOrder({ status: "pending" })).toBe(true);
    expect(isPendingOrder({ status: "confirmed" })).toBe(false);
  });
});
```

`src/lib/orders/build-order-record.test.ts` (real products/customers, no mocks):

```ts
import { describe, expect, it } from "vitest";
import { buildOrderRecord } from "./build-order-record";
import type { Customer, Offer, Product } from "@/types/database";

const product: Product = {
  id: "p1", brand_id: "b1", name: "Flat White", category: "Coffee",
  price: 220, is_active: true, tax_exempt: false,
} as Product;
const customers: Customer[] = [];

const base = {
  brandId: "b1", orderId: "o1", orderNumber: "BC-1",
  products: [product], customers, taxRatePercent: 5, offers: [] as Offer[],
};

describe("bill lifecycle", () => {
  it("saves a method-paid bill as pending with payment_method on the order", () => {
    const built = buildOrderRecord({ ...base, input: {
      customerId: null, lines: [{ productId: "p1", quantity: 2 }],
      paymentMethod: "UPI", paymentStatus: "pending",
      orderType: "dine_in", serviceDate: "2026-11-08", guests: 3, tableTag: "Table 7",
    }});
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.record.order.status).toBe("pending");
    expect(built.record.order.payment_status).toBe("pending");
    expect(built.record.order.amount_paid).toBe(0);
    expect(built.record.order.payment_method).toBe("UPI");
    expect(built.record.order.order_type).toBe("dine_in");
    expect(built.record.order.service_date).toBe("2026-11-08");
    expect(built.record.order.guests).toBe(3);
  });
  it("saves a payment-pending bill with null payment_method", () => {
    const built = buildOrderRecord({ ...base, input: {
      customerId: null, lines: [{ productId: "p1", quantity: 1 }],
      paymentMethod: "", paymentStatus: "pending",
    }});
    if (!built.ok) throw new Error("build failed");
    expect(built.record.order.status).toBe("pending");
    expect(built.record.order.payment_method).toBeNull();
  });
  it("keeps saveAsQuote bills as draft quotations", () => {
    const built = buildOrderRecord({ ...base, input: {
      customerId: null, lines: [{ productId: "p1", quantity: 1 }],
      paymentMethod: "", paymentStatus: "pending", saveAsQuote: true,
    }});
    if (!built.ok) throw new Error("build failed");
    expect(built.record.order.status).toBe("draft");
    expect(built.record.order.public_token).not.toBeNull();
  });
  it("defaults service_date to today's local day key when absent", () => {
    const built = buildOrderRecord({ ...base, input: {
      customerId: null, lines: [{ productId: "p1", quantity: 1 }],
      paymentMethod: "Cash", paymentStatus: "pending",
    }});
    if (!built.ok) throw new Error("build failed");
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).format(new Date());
    expect(built.record.order.service_date).toBe(key);
  });
});
```

Run `npx vitest run src/lib/orders` — expect FAIL (`allowedStatusTransitions("pending")` returns `[]` via the `default` case; `isRevenueOrder`/`isPendingOrder` don't exist; builder ignores unknown input fields → `status "completed"`… actually `paymentStatus:"pending"` currently maps to `"draft"` — the failure IS the proof the old quote heuristic is being replaced; capture which assertion fails first).

- [ ] **Step 2: Types.** In `src/types/database.ts`: add `| "pending"` to `OrderStatus` (after `"draft"`); add to `Order` (after `table_tag` block, all optional): `order_type?: "dine_in" | "takeaway" | "delivery" | "online" | null;`, `service_date?: string | null;`, `guests?: number | null;`, `delivery_address?: string | null;`, `payment_method?: string | null;`, `payment_reference?: string | null;` — add to `CreateOrderInput` (after `paymentStatus`): `saveAsQuote?: boolean;` and after `priceTier`: `orderType?: "dine_in" | "takeaway" | "delivery" | "online";`, `serviceDate?: string;`, `guests?: number | null;`, `deliveryAddress?: string;`, `paymentReference?: string;`.

- [ ] **Step 3: Rules.** In `src/lib/orders/order-rules.ts` append:

```ts
export function isPendingOrder(order: Pick<Order, "status">): boolean {
  return order.status === "pending";
}

/** Revenue counting rule — spec §6. Only completed orders earn. */
export function isRevenueOrder(order: Pick<Order, "status">): boolean {
  return order.status === "completed";
}
```

and add to `allowedStatusTransitions`: `case "pending": return ["completed", "cancelled"];` (before `"confirmed"` case; leave others as-is).

- [ ] **Step 4: Builder.** In `build-order-record.ts`: replace `const isQuote = params.input.paymentStatus === "pending";` (:151) with `const isQuote = params.input.saveAsQuote === true;`. Replace the `status:` value (:179) with `status: isQuote ? "draft" : "pending",`. Replace the `payment_status` ternary (:180-185) with `payment_status: "pending",` for bills — quotation path keeps `"pending"` too, so both are `"pending"`: set `payment_status: "pending"` and keep `amount_paid` logic only for the quotation deposit case (`isQuote && depositPercent > 0` → deposit amount, else 0). Add order fields:

```ts
    order_type: params.input.orderType ?? null,
    service_date:
      params.input.serviceDate ??
      new Intl.DateTimeFormat("en-CA").format(new Date()),
    guests: params.input.guests ?? null,
    delivery_address: params.input.deliveryAddress?.trim() || null,
    payment_method: params.input.paymentMethod?.trim() || null,
    payment_reference: params.input.paymentReference?.trim().slice(0, 80) || null,
```

Validate `serviceDate` matches `^\d{4}-\d{2}-\d{2}$` before trusting it (invalid or absent → today's key; do NOT save garbage). Keep everything else (lines, offers, totals) untouched.

- [ ] **Step 5: Demo isQuote sites.** In `src/lib/demo/server.ts:242` replace `const isQuote = input.paymentStatus === "pending";` with `const isQuote = input.saveAsQuote === true;` (BC-Q prefix follows quotations only). Grep all other callers that pass `paymentStatus: "pending"` meaning quotation — `src/services/data.ts` `submitOrder` and the quotation flow (`src/services/quotes.ts`, quotation page): wherever a quotation is created, add `saveAsQuote: true` to the input so the live path keeps draft semantics. Run the Step 1 tests — expect PASS.

- [ ] **Step 6: Static gate + commit.**

```bash
npm test && npx next typegen && npx tsc --noEmit
git add -u src/ && git add src/lib/orders/order-rules.test.ts src/lib/orders/build-order-record.test.ts src/types/database.ts
git commit -m "feat: pending order lifecycle with type, date, payment intent on the order model"
```

---

### Task 2: Complete-order action with payment finalization

**Files:**
- Modify: `src/lib/demo/server.ts` (new `completeDemoOrder`)
- Modify: `src/services/operations-actions.ts` (new `completeOrderAction`)
- Test: `src/lib/demo/server.test.ts` (create if absent, else new file `src/lib/demo/complete-order.test.ts`)

**Interfaces:**
- Consumes: Task 1 rules (`allowedStatusTransitions("pending")`), `Order.payment_method`, existing `patchDemoOrderInStore`, `bucket.orderPatches`/`bucket.payments` shapes from `recordDemoPayment`.
- Produces: `completeOrderAction(orderId: string): Promise<{ok:true, orderNumber:string}|{ok:false,message:string}>` — the ONLY way POS orders complete (Tasks 3 board and 4 detail call it). Demo semantics: pending/confirmed → completed; if `payment_method` set → `payment_status:"paid"`, `amount_paid: grand_total` + Payment row appended (`method = payment_method`, `amount = grand_total`); if null → status completed, payment stays `"pending"`. Unknown id → `{ok:false,message:"Order not found."}`; already completed/cancelled → `{ok:false,message:"Order is already completed."}` / `"…cancelled."`.

- [ ] **Step 1: Failing tests** (real `updateDemoMutableBucket`-free? No — the demo actions need the cookie mock used by `demo-cookie-store.test.ts`; reuse that test's jar helper):

```ts
describe("completeDemoOrder", () => {
  it("completes a pending order and auto-records the chosen method", async () => {
    const order = makeStoredOrder({ status: "pending", payment_status: "pending",
      grand_total: 745.5, amount_paid: 0, payment_method: "UPI" });
    // seed store via the cookie jar helper, then:
    const res = await completeDemoOrder(order.id);
    expect(res.ok).toBe(true);
    const after = await getDemoOrder(order.id, "BR-1");
    expect(after?.status).toBe("completed");
    expect(after?.payment_status).toBe("paid");
    expect(after?.amount_paid).toBe(745.5);
    const bucket = await readDemoMutableBucket("BR-1");
    expect(bucket.payments[0]).toMatchObject({ order_id: order.id, amount: 745.5, method: "UPI", status: "paid" });
  });
  it("completes without payment when method is null (payment pending)", async () => {
    // order with payment_method: null → completed, payment_status stays "pending", no payments rows
  });
  it("rejects unknown and double-complete", async () => {
    expect(await completeDemoOrder("ghost")).toEqual({ ok: false, message: "Order not found." });
    // complete twice → second is {ok:false,message:"Order is already completed."}
  });
  it("completes a fixture order via orderPatches fallback", async () => {
    // pick a Task-6-style fixture id BEFORE Task 6 lands: construct a pack-order-shaped id not in the cookie store; after complete, bucket.orderPatches[id] has status completed + amount_paid
  });
});
```

Write exact fixtures/asserts following `demo-cookie-store.test.ts` patterns; RED first.

- [ ] **Step 2: Implement `completeDemoOrder` in server.ts.** Load order via `getDemoOrder`-style merge (`[...pack.orders, ...stored.orders]` + apply orderPatches so a fixture order that was already patched reads fresh). Guard: exists → else "Order not found."; `allowedStatusTransitions(order.status)` includes "completed" → else already-completed/cancelled messages. Then mirror `recordDemoPayment` machinery: patch (store-first, `orderPatches` fallback) `{ status:"completed", ...(order.payment_method ? { payment_status:"paid", amount_paid: order.grand_total } : {}) }`; when method present append the Payment row (same shape as `recordDemoPayment`: `id: demo-pay-${Date.now()}`, `status:"paid"`, `split_label:null`, `notes: "Auto-recorded at completion"`); audit `order.status` + `payment.recorded` (detail `auto:UPI`); `revalidateAll()`; return `{ ok: true, orderNumber: order.order_number }`.

- [ ] **Step 3: `completeOrderAction` in operations-actions.ts:**

```ts
export async function completeOrderAction(orderId: string) {
  const ws = await loadWorkspaceSession();
  if (!ws) return { ok: false as const, message: "Not signed in." };
  try {
    if (ws.mode === "demo") return await completeDemoOrder(orderId);
    // live: read, guard, updateOrderStatus + recordPayment via services/data — honest failure through existing result shapes
  } catch {
    return { ok: false as const, message: "Could not save. Try again." };
  }
}
```

Role gate: staff can complete (existing pattern: completers are order operations, same rights as `updateOrderStatusAction` — no extra gate).

- [ ] **Step 4: Static gate + commit** `feat: complete-order action finalizes payment per billing intent`.

---

### Task 3: Billing capture form rebuild

**Files:**
- Modify: `src/components/billing/billing-pos.tsx` (form state :126-155, `handleSubmit` :341-462, customer/payment/offer sections :574-846, tile builder :862-882 blocked adds live here for Task 5)
- Modify: `src/lib/demo/server.ts` (`submitDemoOrder` phone auto-link/seed)
- Test: `src/lib/demo/submit-order.test.ts` (auto-link/auto-create cases; reuse cookie-jar helper)

**Interfaces:**
- Consumes: Task 1 input fields; `findActiveOffer(code, offers)` (existing, `src/lib/pricing/offers.ts`); `normalizeCustomerPhone`; `localDayKey`.
- Produces: bill saves `{status:"pending", payment_status:"pending", order_type, service_date, payment_method|null, guests/delivery_address/payment_reference as filled}`; auto-created customer ids `demo-cust-<ts>` appended to `bucket.customers` (customer module lists pick them up); successful save returns to a clean form (cart, offer, payment, date-reset). Task 4's board consumes saved pending orders; Task 6's fixtures include matching field usage.

- [ ] **Step 1: Failing submit tests.** In demo server tests: (a) phone matches existing customer (normalized) → order `customer_id` = that customer, no duplicate created; (b) unknown phone → customer auto-created `{ name: input name || "User", phone }` and order linked; (c) `saveNewCustomer` flag no longer consulted (delete its use). RED (current code needs the checkbox).

- [ ] **Step 2: `submitDemoOrder` identity rewrite.** Replace the `saveNewCustomer` block (:220-239) with: if no `input.customerId` and normalized `input.customerPhone` present → find `customers.find(c => normalizeCustomerPhone(c.phone ?? undefined) === phone)`; link if found, else create `demo-cust-${Date.now()}` (name = `input.walkInName?.trim() || "User"`) into `bucket.customers` and link. (Also export a pure `matchOrCreateCustomerId(customers, phone, name): {id|null, created?: Customer}` helper and test it directly — the bucket write stays thin.)

- [ ] **Step 3: Form state.** Remove `customerId` picker state usage (keep `customerId` only internally unset — simplest: delete the state entirely along with `saveNewCustomer`; `walkInName` path becomes the name). Add:

```tsx
  const [orderType, setOrderType] = useState<"dine_in"|"takeaway"|"delivery"|"online">("dine_in");
  const [serviceDate, setServiceDate] = useState(() => localDayKey(new Date()));
  const [guests, setGuests] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [offerPick, setOfferPick] = useState(""); // "" none | "__custom" | code
  const [offerCustom, setOfferCustom] = useState("");
```

`offerCode` becomes derived: `const offerCode = offerPick === "__custom" ? offerCustom.trim() : offerPick;` (existing validation/preview at :243 and :368 keep working unchanged).

- [ ] **Step 4: Validation in `handleSubmit`.** Before anything: `const phone = normalizeCustomerPhone(customerMobile); if (!phone) { setFeedback("Enter the customer mobile number (8–15 digits)."); return; }` (mobile is now REQUIRED — delete the old optional branch). `serviceDate` must match `^\d{4}-\d{2}-\d{2}$` else feedback `"Pick a valid date."`; guests: `""` ok, else integer 1–99 feedback. Remove `asQuote` parameter (handleSubmit()) — the retail checkbox is gone; quotation saving remains only via the quotation document mode (guarded by existing `documentMode`). Keep every other validation.

- [ ] **Step 5: Submit payload + reset.** Pass: `orderType, serviceDate, guests: guests ? Number(guests) : null, deliveryAddress: orderType === "delivery" ? deliveryAddress.trim() || undefined : undefined, paymentReference: paymentReference.trim() || undefined, paymentMethod: paymentMethod === "PENDING" ? "" : paymentMethod, saveAsQuote: false` (quotation mode passes `saveAsQuote: true` through `documentMode === "quotation"` branch instead — locate how quotation page invokes this component and wire the flag there). On success (`result.ok`): `setCart([]); setOfferPick(""); setOfferCustom(""); setServiceDate(localDayKey(new Date())); setPaymentMethod("PENDING"); setCustomerMobile(""); setCustomerName(""); setNotes(""); setTableTag(""); setGuests(""); setDeliveryAddress(""); setPaymentReference(""); setFeedback(...)` — the saved-bill message + `lastSavedDocument` (WhatsApp doc) stay.

- [ ] **Step 6: JSX.** Replace :574-727 + :769-846 regions:
  - Mobile input first, label "Mobile number *", `required` NOT used (custom validation), hint: matched-customer live hint — `const matchedCustomer = phone ? customers.find(...) : null` rendered as "Existing customer: {name}".
  - Name input (optional, placeholder "Defaults to 'User'"). Delete the saved-customer `<label>` block (:628-658) and the saveNewCustomer checkbox (:698-706) and the saveAsQuote checkbox (:821-829) entirely.
  - Date input `type="date"` value `serviceDate`.
  - Type segmented control: 4 `<button role="radio" aria-checked>` chips Dine-in/Take-away/Delivery/Online in a `flex flex-wrap gap-2` row, each `ob-touch-target`, styling like existing filter chips.
  - Conditional: `orderType==="dine_in"` → Table tag + Guests(number, min 1 max 99); `orderType==="delivery"` → Delivery address (textarea 2 rows) — the `tableTag` label text becomes "Table / tag" unchanged.
  - Offer code: `<select>` `— None —`, active offers sorted by code (`offers.filter(o => o.is_active !== false).map(o => <option value={o.code}>{o.code} · {o.name}</option>)`), plus `<option value="__custom">Enter your own code…</option>`; when `offerPick === "__custom"` reveal `<Input value={offerCustom} placeholder="Type offer code">`. aria-label "Offer code".
  - Payment: select with `<option value="PENDING">Payment pending</option>` (default state value "PENDING"), UPI, Card, Cash + Reference input ("UPI txn / card ref / platform order no", optional).
  - Notes: keep, add placeholder "e.g. no ice".
  - Confirm button label unchanged (`confirmLabel`).
- [ ] **Step 7: Live-verify (:3003, isolated browser):** full bill with mobile+name, type Take-away, method UPI → orders page shows BC-xxxx Pending; re-save same mobile → order links to the now-existing customer (check /customers count grows by exactly 1). FO0D50 mistyped → blocked message; custom code HAPPY10 works; date change persists on detail.
- [ ] **Step 8: Static gate + commit** `feat: phone-primary bill capture with order type, date, offer selector and payment intent`.

---

### Task 4: Orders board (Ongoing/All tabs) + detail Complete + kitchen

**Files:**
- Create: `src/components/orders/orders-board.tsx` (client)
- Modify: `src/app/(workspace)/orders/page.tsx`
- Modify: `src/components/orders/order-operations-panel.tsx`
- Modify: `src/app/(workspace)/kitchen/page.tsx:16`
- Test: `src/components/orders/orders-board.test.ts`? No — pure logic lives in a helper: Create `src/lib/orders/board-grouping.ts` + `src/lib/orders/board-grouping.test.ts` (TDD), component itself E2E-verified.

**Interfaces:**
- Consumes: `completeOrderAction`, `updateOrderStatusAction` (cancel), `isPendingOrder`/`isRevenueOrder`, `localDayKey`, `useMounted`.
- Produces: `groupBoardOrders(orders, now): { ongoing: Order[]; completedToday: Order[] }` (ongoing = status pending|confirmed sorted OLDEST first; completedToday = status completed whose `created_at` local day === `localDayKey(now)` sorted NEWEST first; everything else excluded — All tab shows all).

- [ ] **Step 1: Failing grouping tests** (dates around midnight local: an order created 23:59 yesterday NOT in completedToday; sorted assertions). Implement `board-grouping.ts` — GREEN.
- [ ] **Step 2: `orders-board.tsx`.** Props: `orders, orderItems, currencyCode, orderNumberColumn`. Tabs (state, `role="tablist"`, buttons `ob-touch-target`): **Ongoing** (default) / **All orders**. Ongoing = two `<section>`s: "Ongoing (N)" list from `ongoing`, "Completed today (N)" from `completedToday`; row card: order number, type badge (order_type label — Dine-in/Take-away/Delivery/Online, Badge tone neutral), customer `name_snapshot ?? "Walk-in"` + phone, `table_tag`/`delivery_address` short line, grand total, payment Badge (reuse `paymentBadgeTone` logic from `orders-table.tsx:11` — extract it to `src/lib/orders/payment-badge.ts` exported and reused by both), wait label for ongoing rows: `const waitMin = mounted && isPendingOrder(o) ? minutesSince(o.created_at, now) : null` rendered `"{n} min"` (mounted-gated; `<45 min neutral, ≥45 min warning tone`). Ongoing rows get an **Order Completed** `Button` (calls `completeOrderAction(o.id)`, try/catch/finally per contract, on `{ok:false}` show inline `role="alert"` error near the row, on success `router.refresh()`), plus a ghost Cancel link to detail. Empty ongoing → `<EmptyState title="No ongoing orders" />`. All tab renders existing `<OrdersTable …/>`.
- [ ] **Step 3: Page wiring.** `orders/page.tsx` demo branch: pass `orders`+`orderItems` (already fetched) to `OrdersBoard` instead of `OrdersTable`; live branch same swap with `ordersRes.data`/`itemsRes.data` (board is status-agnostic). Keep CSV header actions.
- [ ] **Step 4: Detail panel.** `order-operations-panel.tsx`: when `isPendingOrder(order)` render prominent **Order Completed** button (same action) above the existing STATUS_ACTIONS row; add `pending` to that row's labels map ("Pending"); show `order_type`/`service_date`/`payment_method`/`guests`/`delivery_address`/`payment_reference` in `order-customer-details.tsx` when present.
- [ ] **Step 5: Kitchen.** Change filter to `(isPendingOrder(o) || o.status === "confirmed" || o.status === "draft")` (demo + live `listOrders` call gains nothing — live keeps confirmed). Add pending tone badges reuse.
- [ ] **Step 6: Browser E2E** (:3003): save bill → appears top of Ongoing with wait label → click Order Completed → moves to Completed today + /orders detail shows paid UPI + amount; Payment-pending order completes unpaid and record-payment still works; All tab filters unchanged; kitchen lists pending; 375px: tabs + rows usable, no h-overflow.
- [ ] **Step 7: Static gate + commit** `feat: ongoing orders board with one-tap completion and kitchen parity`.

---

### Task 5: Product Unavailable (A/NA)

**Files:**
- Modify: `src/types/database.ts` (`Product.unavailable?: boolean`)
- Modify: `src/lib/demo/server.ts` (`productOverrideFields` include `unavailable`; new `setDemoProductUnavailable(productId, unavailable)` mirroring `setDemoProductActive` :182)
- Modify: `src/services/product-actions.ts` + products demo action wrapper pattern used by `products-manager.tsx` (grep `toggleProductActiveAction` and mirror)
- Modify: `src/components/products/products-manager.tsx` (toggle button)
- Modify: `src/components/billing/billing-pos.tsx` (`tryAddProduct` + `productTile`), `src/components/billing/pos-product-tile.tsx` (badge + disabled add)
- Test: extend `src/lib/demo/demo-cookie-store.test.ts` or new `src/lib/demo/unavailable.test.ts` (override round-trip), unit for cart-block rule.

**Interfaces:**
- Consumes: existing override merge (`mergeDemoProducts` applies `bucket.productOverrides[id]`), `hasOpsRecord`-style existence guard (product id must exist post-merge, else "Product not found."), role gate `canEditBrandSettings`.
- Produces: `Product.unavailable` honored everywhere: `tryAddProduct` refuses with feedback "Not available right now."; tile shows **A**/`NA`; search/enter add path shares the same guard (route every add through `tryAddProduct`).

- [ ] **Step 1: Failing tests:** (a) override round-trip — setDemoProductUnavailable writes `productOverrides[id].unavailable=true`, `mergeDemoProducts` surfaces it, second call flips back to false (value `false` must persist, not vanish — check the override diff omits nothing); (b) `validateAdd(product)` rule: `buildPricedLines` already rejects inactive — add rejection for `unavailable` with message `"A product on this bill is invalid or inactive."` unchanged? NO — server must not silently block (tiles already block); the builder treats unavailable like inactive: `!product.is_active || product.unavailable` → same invalid message (defense-in-depth; test it).
- [ ] **Step 2: Implement** per interfaces (type, action with guard+audit `product.updated` detail `unavailable:true`, manager toggle button `ob-touch-target` labelled Unavailable/Available with `A`/`NA` chip preview, tile badge: in `pos-product-tile.tsx` header row `<Badge tone={product.unavailable ? "danger" : "success"}>{product.unavailable ? "NA" : "A"}</Badge>` — check Badge supports a danger/red tone (grep BadgeTones; if only `demo|success|warning|neutral`, use `warning` for NA + custom class `bg-[var(--ob-danger)]/10 text-[var(--ob-danger)]` or extend Badge tone list — extend is allowed, note in report); `billing-pos` `tryAddProduct`: early `if (product.unavailable) { setFeedback("Not available right now."); return; }` and tile gets `aria-disabled` + muted styling (`opacity-50`), add-button hidden for NA.
- [ ] **Step 3: Browser proof:** mark NA in /products → /billing shows NA, tap blocked, hint shown; existing cart line for that product stays; toggle back to A. Commit `feat: product unavailable flag with A/NA tiles and cart guard`.

---

### Task 6: Deterministic 6-month history (fixtures + generator)

**Files:**
- Create: `src/lib/demo/brands/history.ts` (pure, seeded generator — zero runtime imports beyond `computeCartTotals`/`roundMoney` helpers and `localDayKey` equivalents; type-only imports allowed)
- Modify: `src/lib/demo/brands/brewery-cafe.ts` (`orders`/`orderItems` become `...buildOrderHistory(BR1_CONFIG)` output appended to the hand-written ones), `src/lib/demo/brands/cubig-furniture.ts` same
- Test: `src/lib/demo/brands/history.test.ts`

**Interfaces:**
- Consumes: pack `products` (ids/categories/prices) and `customers` (BR-1 has the existing `c1/c2…` set; the generator creates `h-cust-1…h-cust-40` — packs must expose them in `customers` too or the orders carry `customer_id` unknown to timelines → GENERATOR RETURNS `customers` as well and brand packs merge them: `customers: [...hand, ...history.customers]`).
- Produces: `buildOrderHistory(cfg: HistoryConfig): { customers: Customer[]; orders: Order[]; orderItems: OrderItem[]; payments: Payment[] }` where `HistoryConfig = { brandId, prefix, products: HistoryProduct[], months: HistoryMonth[], rngSeed, taxRatePercent }`; ids deterministic: `hist-<prefix>-<seq>`, order numbers `<prefix>-H<seq>` (never collide with runtime `demo-order-*`/`BC-<rand>`). Fixture `mergedOrderData` picks them up with ZERO cookie cost (they are `pack.orders`). Past pending demo orders for the board: the generator emits 3 BR-1 / 1 BR-2 orders with `status:"pending"` dated TODAY (created_at = today, mixed times) so the board is never empty on first look — these are fixtures (non-patchable by id collision — orderPatches handle completing them).
- **Spec deviation note (ruling):** spec §6 said "generated once by a script, static"; this plan ships the generator module itself (seeded, pure, deterministic — every call returns identical data). Same reproducibility + testability, no 15k-line static file. Reviewer: this is intentional.

- [ ] **Step 1: Failing invariant tests** (the spec §6 numbers):

```ts
const out = buildOrderHistory(BR1_HISTORY_CFG); // seed 20261109, months May–Nov per cfg
const byMonth = totalsByMonth(out.orders);      // helper in test
it("excludes non-revenue orders from month totals" /* completed only */) …
it("grows ~12–15% May→Oct and dips ~20% in Nov daily-rate", () => {
  // assert: oct/may within [1.30,1.55]; novDailyRate/octDailyRate ∈ [0.72,0.88];
  // last-7-days-of-Nov daily rate ≥ 0.9 * Oct daily rate
});
it("every completed order satisfies subtotal − discount + tax = grand_total", …);
it("no order is in the future; service_date matches created_at local day", …);
it("≈5% cancelled, ≥8% offer-coded, payment-method mix all three present, ≥4 distinct customers with 3+ orders", …);
it("deterministic: two calls equal by id list", …);
it("emits 3 today-pending BR-1 orders", …);
```

- [ ] **Step 2: Implement `history.ts`.** Seeded LCG: `let s = seed; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;`. Month weights (spec shape): `monthlyTargets = [30, 34, 39, 44, 50, 56]` May–Oct + Nov partial per-day rate; weekend factor Sat/Sun ×1.6, Fri ×1.25; categories sampled from `products` by category buckets with cafe-appropriate weights; 1–4 lines/order, qty 1–3 (Frappe-type drinks weight higher); offer codes applied to ~8% via a `applyOffer` path that computes discount EXACTLY like `computeOfferDiscountAmount` rules (percent + cap for FOOD50 50%/150/category Food, HAPPY10 10%/200/min 300 — encode caps in cfg and clamp); ~5% cancelled (keep totals valid); payment methods sampled [0.5 UPI, 0.3 Cash, 0.2 Card]; 3 completed-with-null-payment_method in Nov (record-payment demo); customers: realistic Indian names list of 40 (hand-written array, phone `98XXXXXXXX` deterministic from rng, 1–8 orders each with zipf-ish skew). `created_at` = day + hour 8–22 min from rng ISO; `service_date` = same day `YYYY-MM-DD` local-constructed via `new Date(y, m, d)` + `toISOString`-FREE: build the stamp with `new Date(y,m,d,h,mi)` → `.toISOString()` for storage is fine (storage is UTC-ISO by design; derivation elsewhere is local). Order rows include new fields: `order_type` mix (0.6 dine_in, 0.2 takeaway, 0.15 delivery w/ short address strings, 0.05 online w/ `payment_reference` like `Zomato-1234`), `payment_status: "paid"`, `amount_paid = grand_total`. Emit `payments` array (one per paid order) so tender charts have Payment rows: the generator output's `payments` merge into `listDemoPayments`-equivalent — VERIFY how payments reach the analytics snapshot: `snapshotFromOrderRecords` accepts `payments?`; dashboard demo branch currently doesn't pass payments — Task 7 Step 0 adds `payments` wiring (merged pack+bucket) into BOTH pages; add `payments: Payment[]` to the pack type (`DemoBrandPack.payments?`) and `listDemoPaymentsMerged(code)` in data.ts (pack ∪ bucket.payments sorted) — do this in this task (test the merge).
- [ ] **Step 3: Wire packs.** BR-1/BR-2 `orders: [...existingHand, ...hist.orders]`, `orderItems` same, `customers: [...existing, ...hist.customers]`, new `payments: hist.payments`. Keep hand fixtures (they're referenced by ids in ops fixtures/timelines — do NOT delete anything existing).
- [ ] **Step 4: Browser proof:** /dashboard last-30-days now shows thousands in revenue + real trend line; /orders All tab paginates fine (250+ rows — check table renders; if `OrdersTable` has no virtualization issues at 250 rows leave it); /customers/c2 timeline shows months of history; kitchen shows 3 pending. Performance: SSR list pages < 1s. Commit `feat: deterministic 6-month demo history with growth, Nov dip and rebound`.

---

### Task 7: Revenue rules in dashboards + Overview + CSV

**Files:**
- Modify: `src/app/(workspace)/dashboard/page.tsx` (both branches), `src/app/(workspace)/analytics/page.tsx` (all snapshot feeds), `src/lib/analytics/snapshot.ts` (doc-comment only — filtering stays caller-side)
- Modify: `src/app/(workspace)/manager/page.tsx` + `src/lib/manager/ops-selectors.ts` (Overview "in progress" line), `src/services/operations-actions.ts:152` (CSV columns)
- Test: `src/lib/analytics/snapshot.test.ts` extend (revenue-rule integration via helper), ops-selectors test extend.

**Interfaces:**
- Consumes: Task 1 `isRevenueOrder`; Task 6 `listDemoPaymentsMerged`.
- Produces: dashboards: `orders.filter(isRevenueOrder)` before every `snapshotFromOrderRecords` call (range and all-time); `pendingAmount` redefined at call sites by passing revenue orders ONLY → outstanding receivables keep using `isOpenReceivable` (unchanged semantics for the receivables list). Overview gains `inProgressOrders = allOrders.filter(isPendingOrder).length` rendered in the Orders rollup card row (only when orders module context exists — it's always visible: it's the overview's own card, no gating needed).

- [ ] **Step 1: Failing tests:** snapshot input with 2 completed + 1 pending → netSales only completed, orderCount 2 (document via caller-level pure helper `revenueOrders(orders)` exported from order-rules with a direct test). Dashboard E2E check in Step 3 proves wiring.
- [ ] **Step 2: Implement caller filters + payments pass-through** (demo branches now also pass `payments: await listDemoPaymentsMerged(code)` so tender donuts finally have rows in demo mode — verify `paymentMethods` slice populates; live branch passes what `listOrderItemsForOrders`-style RPC provides or omits — keep live as-is if no payments fetch exists server-side; note in report).
- [ ] **Step 3: CSV:** demo header `["Order #","Customer","Total","Status","Payment","Method","Type","Date","Created"]` using `payment_method`, `order_type`, `service_date ?? created day` (live map same). Manager page: one small stat — reuse existing rollup card markup, label "Ongoing orders".
- [ ] **Step 4: E2E proof:** complete a pending order → dashboard NET SALES jumps by exactly its grand_total; before completing, save a pending bill → net sales UNCHANGED; CSV download shows new columns. Commit `feat: revenue counts completed orders only; payments feed demo tender mix; CSV order lifecycle columns`.

---

### Task 8: Supabase seed SQL export

**Files:**
- Create: `docs/SUPABASE_SEED_HISTORY.sql` (generated)
- Create: `src/lib/demo/brands/seed-sql.test.ts` (dump mechanism, skipped-by-default write + existence/shape assertion)

**Interfaces:**
- Consumes: Task 6 generator output (deterministic).
- Produces: paste-ready SQL: `INSERT INTO customers … ON CONFLICT (id) DO NOTHING;` blocks for 40+15 history customers, `orders` (+ new columns as `jsonb` payload? NO — only columns that exist in the current live schema: `id, brand_id, order_number, status, payment_status, customer_id, customer_name_snapshot, subtotal, discount_total, tax_total, fees_total, grand_total, notes, created_at, table_tag, delivery_notes, deposit_percent, amount_paid, offer_code_snapshot, order_kind`; skip `public_token`/new fields — schema drift is Plan B's audit), `order_items`, `payments`. Statements ordered parents→children, `BEGIN;…COMMIT;` wrapper, header comment block explaining paste target + idempotency (`ON CONFLICT DO NOTHING` everywhere so re-paste is safe).

- [ ] **Step 1:** Implement the dump test: when `process.env.DUMP_SEED_SQL === "1"` it writes the file (rows from generator + hand fixtures for both brands, brand-ids from pack constants — verify real live-brand uuids are used IF discoverable in repo config; the packs carry `brand.id` — use those exact ids); otherwise asserts `docs/SUPABASE_SEED_HISTORY.sql` exists, is >100 KB, starts with a comment, contains `INSERT INTO orders` and balanced quotes per line count vs generator totals (cheap integrity: number of `(hist-` occurrences equals order+item+payment row counts).
- [ ] **Step 2:** Run `DUMP_SEED_SQL=1 npx vitest run src/lib/demo/brands/seed-sql.test.ts && npx vitest run src/lib/demo/brands/seed-sql.test.ts` (generate, then verify). Commit `feat: paste-ready 6-month Supabase history seed SQL` + note in report: ids use brand-pack uuids; Jainil pastes manually; NOT wired or executed by the agent.

---

### Task 9: Full verification + E2E regression matrix

**Files:** none new; fix any bug found via TDD in the owning file. Evidence: `/tmp/order-lifecycle-e2e.md` (delete before finishing).

- [ ] **Step 1: Static:** `npm test && npx next typegen && npx tsc --noEmit` + `npx eslint src --max-warnings=0` → record counts.
- [ ] **Step 2: E2E matrix (isolated Playwright, :3003, cookies cleared first):**
  1. Bill walk-in: mobile required (block empty save with alert), name defaults User, auto-create then auto-link on 2nd bill; take-away + Cash ₹X → Pending on board → Complete → paid ₹X exactly, Completed-today section, dashboard +X.
  2. Payment-pending bill → Complete keeps payment pending → detail record-payment partial/full → paid.
  3. Offer: select FOOD50 from dropdown (cap math −150) + custom code HAPPY10; invalid code blocked.
  4. Delivery order with address + Online with reference render on board/detail/timeline.
  5. Date: backdate yesterday (service_date on detail), future tomorrow (sits ongoing), invalid blocked.
  6. NA product: tile blocks, Products toggle round-trip persists after reload, cart-retained edge.
  7. Kitchen lists today's pending; All tab filters (status pending/completed) still work; CSV export columns include new fields.
  8. Legacy: a pre-change cookie order (none exist in a fresh jar — instead manually craft via evaluate? NO: covered by builder unit + the fact nothing in the store has old-`completed`-from-bill semantics post-change; verify the 6 historical hand fixtures still render/edit).
  9. Analytics: last-30-days dip visible vs previous period (Nov dip line); tender donut non-empty (payments wiring); customer timeline months deep.
  10. Mobile 375×812 on /billing, /orders (both tabs), /orders/<id>, /kitchen, /products: 44px targets, no h-overflow, board tabs scroll.
  11. Double-complete → "already completed." alert (fresh click-race via two tabs).
- [ ] **Step 3: Fix failures TDD-first; re-run Step 1.**
- [ ] **Step 4: Cleanup:** delete `/tmp/order-lifecycle-e2e.md`, stop :3003 (TaskStop + `curl` verify dead; NEVER :3000), `git status` clean, commit any fixes `fix: order-lifecycle regression fixes`.

---

## Self-review record

- Spec coverage: §1 →T1; §2 →T1/T2/T3(+cart-clear fold-in); §3 →T3; §4 →T4; §5 →T5; §6 →T6/T7 (+ deviation ruling: generator module vs static file, recorded in T6); §7 →T8; §8 rules enforced in T1-T5 steps; §9 →T9 + per-task tests. Quotation `saveAsQuote` explicit flag: T1 Step 5. Kitchen board gap the spec missed (pending invisible there) — added to T4 Step 5. Dead analytics presets — explicitly NOT touched (T6 note), callers use derived snapshots.
- Placeholders: none; every code step contains its code; UI steps give anchors + content, exact JSX for non-trivial widgets (selector/segmented/validation).
- Type consistency: `isRevenueOrder`/`isPendingOrder` (T1) used T4/T7; `completeOrderAction`/`completeDemoOrder` (T2) used T4; history `payments` merge `listDemoPaymentsMerged` (T6) consumed T7; `localDayKey` import path `@/lib/manager/time` everywhere.
