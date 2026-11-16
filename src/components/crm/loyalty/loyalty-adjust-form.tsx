"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmChip, CrmPanel } from "@/components/crm/crm-ui";
import {
  LoyaltyField,
  LoyaltyFormStatus,
  LoyaltySelect,
} from "@/components/crm/loyalty/loyalty-field";
import { redemptionValue } from "@/lib/crm/metrics";
import { formatMoney } from "@/lib/format";
import {
  adjustPointsAction,
  awardBonusPointsAction,
  awardOrderPointsAction,
  redeemPointsAction,
  type PointsAdjustmentInput,
} from "@/services/crm-loyalty-actions";
import type { CrmActionState } from "@/lib/crm/actions-kit";
import type { LoyaltyConfig } from "@/types/crm";

export type LoyaltyCustomerOption = { id: string; name: string; balance: number };
export type LoyaltyOrderOption = {
  id: string;
  label: string;
  customerId: string;
  customerName: string;
  /** `pointsForOrder(order.grand_total, config)` — computed on the server. */
  points: number;
};

type Status = { kind: "idle" | "ok" | "error"; message: string };
type PointsAction = (input: PointsAdjustmentInput) => Promise<CrmActionState>;

/**
 * Every way a balance moves by hand. Each is its own form against its own
 * server action, so a mistyped number cannot silently become a different kind
 * of ledger entry, and the reason typed here is what the audit trail keeps.
 *
 * The point previews (what N points are worth) run through `redemptionValue`
 * with this brand's stored config — the numbers below follow the config, they
 * are not a model this file assumes.
 */
export function LoyaltyAdjustForms({
  customers,
  orders,
  config,
  currencyCode,
  defaultCustomerId,
}: {
  customers: LoyaltyCustomerOption[];
  orders: LoyaltyOrderOption[];
  config: LoyaltyConfig;
  currencyCode: string;
  defaultCustomerId: string | null;
}) {
  return (
    <CrmPanel
      title="Move points"
      meta={config.enabled ? "Writes a ledger row" : "Programme switched off"}
    >
      {!config.enabled ? (
        <p className="mb-3 rounded-md border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] px-3 py-2 text-sm text-[var(--ob-text-muted)]">
          This brand&rsquo;s loyalty programme is switched off, so an order earns
          nothing and points carry no redemption value. Adjustments still record
          honestly in the ledger.
        </p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <PointsForm
          title="Award bonus points"
          blurb="Goodwill, a launch offer, a promise made at the counter. Adds to lifetime points, so it can lift a tier."
          submitLabel="Award bonus"
          pointsLabel="Bonus points"
          action={awardBonusPointsAction}
          customers={customers}
          config={config}
          currencyCode={currencyCode}
          defaultCustomerId={defaultCustomerId}
        />
        <PointsForm
          title="Redeem points"
          blurb="Honoured against the balance. Refuses if the points asked for are more than the account holds."
          submitLabel="Redeem"
          pointsLabel="Points to redeem"
          action={redeemPointsAction}
          customers={customers}
          config={config}
          currencyCode={currencyCode}
          defaultCustomerId={defaultCustomerId}
          capped
        />
        <PointsForm
          title="Manual adjustment"
          blurb="A correction: negative to take points back. A reason is required — an unexplained balance is not auditable."
          submitLabel="Apply adjustment"
          pointsLabel="Adjustment (signed)"
          action={adjustPointsAction}
          customers={customers}
          config={config}
          currencyCode={currencyCode}
          defaultCustomerId={defaultCustomerId}
          signed
          reasonRequired
        />
        <OrderAwardForm
          orders={orders}
          config={config}
          currencyCode={currencyCode}
          defaultCustomerId={defaultCustomerId}
        />
      </div>
    </CrmPanel>
  );
}

function PointsForm({
  title,
  blurb,
  submitLabel,
  pointsLabel,
  action,
  customers,
  config,
  currencyCode,
  defaultCustomerId,
  capped,
  signed,
  reasonRequired,
}: {
  title: string;
  blurb: string;
  submitLabel: string;
  pointsLabel: string;
  action: PointsAction;
  customers: LoyaltyCustomerOption[];
  config: LoyaltyConfig;
  currencyCode: string;
  defaultCustomerId: string | null;
  capped?: boolean;
  signed?: boolean;
  reasonRequired?: boolean;
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "" });

  const selected = customers.find((customer) => customer.id === customerId);
  const amount = Number(points.trim());
  const showValue =
    Number.isFinite(amount) && amount > 0 && config.redeem_value_per_point > 0;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus({ kind: "idle", message: "" });
    const result = await action({ customer_id: customerId, points, reason });
    setBusy(false);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setStatus({ kind: "ok", message: result.message ?? "Saved." });
    setPoints("");
    setReason("");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-2 rounded-md border border-[var(--ob-border)] p-3"
    >
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="text-xs text-[var(--ob-text-muted)]">{blurb}</p>
      <LoyaltyField label="Customer" required>
        <LoyaltySelect
          value={customerId}
          onChange={setCustomerId}
          placeholder="Pick a customer…"
          options={customers.map((customer) => ({
            value: customer.id,
            label:
              customer.balance > 0
                ? `${customer.name} · ${customer.balance} pts`
                : customer.name,
          }))}
        />
      </LoyaltyField>
      <LoyaltyField
        label={pointsLabel}
        required
        hint={
          capped && selected
            ? `Balance ${selected.balance} points.`
            : signed
              ? "Use a minus to take points back."
              : undefined
        }
      >
        <Input
          type="number"
          inputMode="numeric"
          step="1"
          min={capped ? 1 : signed ? undefined : 1}
          max={capped && selected ? selected.balance : undefined}
          value={points}
          onChange={(event) => setPoints(event.target.value)}
          required
        />
      </LoyaltyField>
      {showValue ? (
        <p className="text-xs text-[var(--ob-text-muted)]">
          {formatMoney(redemptionValue(Math.floor(amount), config), currencyCode)} at
          this brand&rsquo;s redemption value.
        </p>
      ) : null}
      <LoyaltyField label="Reason" required={reasonRequired} hint="Kept on the ledger row.">
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={200}
          required={reasonRequired}
          placeholder={reasonRequired ? "Why the balance is wrong" : "Optional"}
        />
      </LoyaltyField>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="secondary"
          className="px-3 py-2 text-xs"
          loading={busy}
          disabled={!customerId || !points.trim()}
        >
          {submitLabel}
        </Button>
        <LoyaltyFormStatus status={status} />
      </div>
    </form>
  );
}

/**
 * Pay out the points one posted order earned. The order's own id goes on the
 * ledger row, which is what stops the same order being awarded twice.
 */
function OrderAwardForm({
  orders,
  config,
  currencyCode,
  defaultCustomerId,
}: {
  orders: LoyaltyOrderOption[];
  config: LoyaltyConfig;
  currencyCode: string;
  defaultCustomerId: string | null;
}) {
  const router = useRouter();
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle", message: "" });

  const chosen = orders.find((order) => order.id === orderId);
  const value = chosen ? redemptionValue(chosen.points, config) : 0;

  // Deep-linked from a 360° page: only that customer's orders are on offer.
  const visible = defaultCustomerId
    ? orders.filter((order) => order.customerId === defaultCustomerId)
    : orders;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus({ kind: "idle", message: "" });
    const result = await awardOrderPointsAction({ order_id: orderId });
    setBusy(false);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setStatus({ kind: "ok", message: result.message ?? "Saved." });
    setOrderId("");
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-2 rounded-md border border-[var(--ob-border)] p-3"
    >
      <h4 className="text-sm font-semibold">Award points from an order</h4>
      <p className="text-xs text-[var(--ob-text-muted)]">
        Posts the points this brand&rsquo;s earn rate gives that order. An order
        already on the ledger is refused rather than awarded again.
      </p>
      {visible.length === 0 ? (
        <p className="text-xs text-[var(--ob-text-muted)]">
          No posted order is waiting for points — either every one has been
          awarded, or nothing has been posted yet.
        </p>
      ) : (
        <>
          <LoyaltyField label="Order" required>
            <LoyaltySelect
              value={orderId}
              onChange={setOrderId}
              placeholder="Pick an order…"
              options={visible.map((order) => ({
                value: order.id,
                label: `${order.label} · ${order.customerName} · ${order.points} pts`,
              }))}
            />
          </LoyaltyField>
          {chosen ? (
            <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--ob-text-muted)]">
              <CrmChip tone="positive">+{chosen.points} points</CrmChip>
              <span>
                worth {formatMoney(value, currencyCode)} on redemption, before any
                expiry date the config sets.
              </span>
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="secondary"
              className="px-3 py-2 text-xs"
              loading={busy}
              disabled={!orderId}
            >
              Award earned points
            </Button>
            <LoyaltyFormStatus status={status} />
          </div>
        </>
      )}
    </form>
  );
}
