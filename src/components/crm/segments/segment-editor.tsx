"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmChip, CrmPanel } from "@/components/crm/crm-ui";
import {
  ManualCustomerPicker,
  type PickerCustomer,
} from "@/components/crm/segments/manual-customer-picker";
import {
  previewSegmentAudienceAction,
  saveSegmentAction,
  type SegmentInput,
  type SegmentPreview,
} from "@/services/crm-segment-actions";
import type { CustomerSegment, SegmentRules } from "@/types/crm";

/**
 * Create or edit one saved segment.
 *
 * Dynamic segments store RULES ONLY. There is no member list in this payload
 * and none in the row: membership is recomputed from live orders, reviews,
 * dues, loyalty and membership rows every time a page reads the segment.
 * Manual segments store `manual_customer_ids` and nothing else.
 */

export type SegmentRuleOptions = {
  tags: string[];
  sources: string[];
  loyaltyTiers: string[];
  membershipPlans: string[];
};

type RuleState = {
  minOrders: string;
  maxOrders: string;
  minTotalSpend: string;
  maxTotalSpend: string;
  lastPurchaseWithinDays: string;
  lastPurchaseOverDays: string;
  tagsAny: string;
  sourcesAny: string[];
  priceTiersAny: string[];
  hasOutstandingDues: boolean;
  hasUnresolvedComplaints: boolean;
  minAverageReviewRating: string;
  loyaltyTiersAny: string[];
  membershipPlansAny: string[];
};

const EMPTY_RULES: RuleState = {
  minOrders: "",
  maxOrders: "",
  minTotalSpend: "",
  maxTotalSpend: "",
  lastPurchaseWithinDays: "",
  lastPurchaseOverDays: "",
  tagsAny: "",
  sourcesAny: [],
  priceTiersAny: [],
  hasOutstandingDues: false,
  hasUnresolvedComplaints: false,
  minAverageReviewRating: "",
  loyaltyTiersAny: [],
  membershipPlansAny: [],
};

type TextRuleKey = Exclude<keyof RuleState, "hasOutstandingDues" | "hasUnresolvedComplaints">;

const KIND_CHOICES: {
  id: "dynamic" | "manual";
  label: string;
  hint: string;
}[] = [
  {
    id: "dynamic",
    label: "Dynamic — saved filter",
    hint: "Matches live data every time you open it.",
  },
  {
    id: "manual",
    label: "Manual — hand-picked people",
    hint: "The exact customers you tick, nothing else.",
  },
];

function num(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function fromRules(rules: SegmentRules): RuleState {
  return {
    minOrders: num(rules.minOrders),
    maxOrders: num(rules.maxOrders),
    minTotalSpend: num(rules.minTotalSpend),
    maxTotalSpend: num(rules.maxTotalSpend),
    lastPurchaseWithinDays: num(rules.lastPurchaseWithinDays),
    lastPurchaseOverDays: num(rules.lastPurchaseOverDays),
    tagsAny: (rules.tagsAny ?? []).join(", "),
    sourcesAny: rules.sourcesAny ?? [],
    priceTiersAny: rules.priceTiersAny ?? [],
    hasOutstandingDues: rules.hasOutstandingDues === true,
    hasUnresolvedComplaints: rules.hasUnresolvedComplaints === true,
    minAverageReviewRating: num(rules.minAverageReviewRating),
    loyaltyTiersAny: rules.loyaltyTiersAny ?? [],
    membershipPlansAny: rules.membershipPlansAny ?? [],
  };
}

export function SegmentEditor({
  segment,
  defaultKind = "dynamic",
  options,
  customers,
  currencyCode,
}: {
  /** Null when creating. */
  segment: CustomerSegment | null;
  defaultKind?: "dynamic" | "manual";
  options: SegmentRuleOptions;
  customers: PickerCustomer[];
  currencyCode: string;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"dynamic" | "manual">(
    segment?.kind ?? defaultKind,
  );
  const [rules, setRules] = useState<RuleState>(() =>
    segment ? fromRules(segment.rules ?? {}) : EMPTY_RULES,
  );
  const [manualIds, setManualIds] = useState<string[]>(
    segment ? segment.manual_customer_ids ?? [] : [],
  );
  const [form, setForm] = useState({
    name: segment?.name ?? "",
    description: segment?.description ?? "",
  });
  const [busy, setBusy] = useState<"save" | "preview" | null>(null);
  const [status, setStatus] = useState<{
    kind: "idle" | "ok" | "error";
    message: string;
  }>({ kind: "idle", message: "" });
  const [preview, setPreview] = useState<SegmentPreview | null>(null);

  const set =
    (key: keyof typeof form) =>
    (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
      reset();
    };

  const setTextRule =
    (key: TextRuleKey) =>
    (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setRules((prev) => ({ ...prev, [key]: event.target.value }));
      reset();
    };

  const setFlagRule =
    (key: "hasOutstandingDues" | "hasUnresolvedComplaints") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRules((prev) => ({ ...prev, [key]: event.target.checked }));
      reset();
    };

  const setList =
    (key: "sourcesAny" | "priceTiersAny" | "loyaltyTiersAny" | "membershipPlansAny") =>
    (value: string, checked: boolean) => {
      setRules((prev) => {
        const current = prev[key];
        return {
          ...prev,
          [key]: checked
            ? current.includes(value)
              ? current
              : [...current, value]
            : current.filter((item) => item !== value),
        };
      });
      reset();
    };

  function reset() {
    setStatus({ kind: "idle", message: "" });
    setPreview(null);
  }

  function payload(): SegmentInput {
    return {
      ...(segment ? { id: segment.id } : {}),
      name: form.name,
      description: form.description,
      kind,
      min_orders: rules.minOrders,
      max_orders: rules.maxOrders,
      min_total_spend: rules.minTotalSpend,
      max_total_spend: rules.maxTotalSpend,
      last_purchase_within_days: rules.lastPurchaseWithinDays,
      last_purchase_over_days: rules.lastPurchaseOverDays,
      tags_any: rules.tagsAny,
      sources_any: rules.sourcesAny.join(","),
      price_tiers_any: rules.priceTiersAny.join(","),
      has_outstanding_dues: rules.hasOutstandingDues,
      has_unresolved_complaints: rules.hasUnresolvedComplaints,
      min_average_review_rating: rules.minAverageReviewRating,
      loyalty_tiers_any: rules.loyaltyTiersAny.join(","),
      membership_plans_any: rules.membershipPlansAny.join(","),
      manual_customer_ids: kind === "manual" ? manualIds : [],
    };
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy("save");
    const result = await saveSegmentAction(payload());
    setBusy(null);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.message });
      return;
    }
    setStatus({ kind: "ok", message: result.message ?? "Segment saved." });
    setPreview(null);
    router.refresh();
  }

  async function onPreview() {
    setBusy("preview");
    const result = await previewSegmentAudienceAction(payload());
    setBusy(null);
    if (!result.ok) {
      setStatus({ kind: "error", message: result.message });
      setPreview(null);
      return;
    }
    setStatus({ kind: "idle", message: "" });
    setPreview(result.preview);
  }

  return (
    <CrmPanel
      title={segment ? `Edit “${segment.name}”` : "New segment"}
      meta={
        kind === "dynamic"
          ? "Rules only — members are recomputed on every read"
          : "Hand-picked customer ids only"
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
            Segment type
          </legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Segment type">
            {KIND_CHOICES.map((choice) => (
              <label
                key={choice.id}
                className={
                  kind === choice.id
                    ? "ob-touch-target flex-1 rounded-[var(--ob-radius-md)] border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] p-3 text-sm"
                    : "ob-touch-target flex-1 rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-3 text-sm"
                }
              >
                <span className="flex items-center gap-2 font-medium">
                  <input
                    type="radio"
                    name="segment-kind"
                    value={choice.id}
                    checked={kind === choice.id}
                    onChange={() => {
                      setKind(choice.id);
                      reset();
                    }}
                  />
                  {choice.label}
                </span>
                <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
                  {choice.hint}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Segment name" required>
            <Input
              value={form.name}
              onChange={set("name")}
              required
              maxLength={120}
              placeholder="VIP sippers, 60-day lapse…"
            />
          </Field>
          <Field label="Description" hint="Shown next to the segment everywhere it appears.">
            <Input
              value={form.description}
              onChange={set("description")}
              maxLength={500}
            />
          </Field>
        </div>

        {kind === "manual" ? (
          <div>
            <p className="mb-2 text-sm text-[var(--ob-text-muted)]">
              A manual segment stores only these ids. Nobody is added later by a
              rule, and archived customers drop out of the live count.
            </p>
            <ManualCustomerPicker
              customers={customers}
              selected={manualIds}
              onChange={(ids) => {
                setManualIds(ids);
                reset();
              }}
            />
          </div>
        ) : (
          <div className="space-y-5">
            <Group title="Orders and spend">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="At least this many orders">
                  <Input
                    value={rules.minOrders}
                    onChange={setTextRule("minOrders")}
                    inputMode="numeric"
                    placeholder="e.g. 3"
                  />
                </Field>
                <Field label="At most this many orders">
                  <Input
                    value={rules.maxOrders}
                    onChange={setTextRule("maxOrders")}
                    inputMode="numeric"
                    placeholder="e.g. 8"
                  />
                </Field>
                <Field label={`Total spend at least (${currencyCode})`}>
                  <Input
                    value={rules.minTotalSpend}
                    onChange={setTextRule("minTotalSpend")}
                    inputMode="decimal"
                    placeholder="e.g. 5000"
                  />
                </Field>
                <Field label={`Total spend up to (${currencyCode})`}>
                  <Input
                    value={rules.maxTotalSpend}
                    onChange={setTextRule("maxTotalSpend")}
                    inputMode="decimal"
                  />
                </Field>
              </div>
              <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
                Spend and order counts come from confirmed and completed orders
                only — drafts, quotes and cancellations never count.
              </p>
            </Group>

            <Group title="Last purchase">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Bought within the last N days" hint="Recent buyers.">
                  <Input
                    value={rules.lastPurchaseWithinDays}
                    onChange={setTextRule("lastPurchaseWithinDays")}
                    inputMode="numeric"
                    placeholder="e.g. 30"
                  />
                </Field>
                <Field label="No purchase for N days or more" hint="Lapsing buyers.">
                  <Input
                    value={rules.lastPurchaseOverDays}
                    onChange={setTextRule("lastPurchaseOverDays")}
                    inputMode="numeric"
                    placeholder="e.g. 60"
                  />
                </Field>
              </div>
              <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
                Pick one window. Someone with no purchase history never matches
                a date rule — use orders and tags for them.
              </p>
            </Group>

            <Group title="Identity">
              <Field
                label="Any of these tags"
                hint="Comma separated. Matches the tags on the customer record."
              >
                <Input
                  value={rules.tagsAny}
                  onChange={setTextRule("tagsAny")}
                  placeholder="villa buyer, repeat"
                />
              </Field>
              {options.tags.length ? (
                <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
                  In use today: {options.tags.slice(0, 12).join(", ")}
                  {options.tags.length > 12 ? "…" : ""}
                </p>
              ) : null}
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <CheckList
                  legend="Acquisition source"
                  values={options.sources}
                  selected={rules.sourcesAny}
                  onToggle={setList("sourcesAny")}
                />
                <CheckList
                  legend="Price list"
                  values={["retail", "wholesale"]}
                  labels={{ retail: "Retail", wholesale: "Wholesale" }}
                  selected={rules.priceTiersAny}
                  onToggle={setList("priceTiersAny")}
                />
              </div>
            </Group>

            <Group title="Money and service">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Average review rating at least" hint="0–5. Blank: no review needed.">
                  <Input
                    value={rules.minAverageReviewRating}
                    onChange={setTextRule("minAverageReviewRating")}
                    inputMode="decimal"
                    placeholder="e.g. 4"
                  />
                </Field>
                <div className="flex flex-col justify-end gap-2 pb-1">
                  <label className="ob-touch-target flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={rules.hasOutstandingDues}
                      onChange={setFlagRule("hasOutstandingDues")}
                    />
                    Has outstanding dues
                  </label>
                  <label className="ob-touch-target flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={rules.hasUnresolvedComplaints}
                      onChange={setFlagRule("hasUnresolvedComplaints")}
                    />
                    Has unresolved complaints
                  </label>
                </div>
              </div>
            </Group>

            <Group title="Loyalty and membership">
              <div className="grid gap-4 sm:grid-cols-2">
                <CheckList
                  legend="Loyalty tier"
                  values={options.loyaltyTiers}
                  selected={rules.loyaltyTiersAny}
                  onToggle={setList("loyaltyTiersAny")}
                  emptyNote="This brand has no loyalty tiers configured yet."
                />
                <CheckList
                  legend="Membership plan"
                  values={options.membershipPlans}
                  selected={rules.membershipPlansAny}
                  onToggle={setList("membershipPlansAny")}
                  emptyNote="No membership plans recorded yet."
                />
              </div>
              <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
                Tier names come from the loyalty configuration this brand
                saved, plan names from real membership rows — nothing is
                hardcoded.
              </p>
            </Group>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={busy === "save"}>
            {segment ? "Save segment" : "Create segment"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={busy === "preview"}
            onClick={onPreview}
          >
            Preview this audience
          </Button>
          <Link
            href="/customers/segments"
            className="ob-touch-target px-2 py-2 text-sm text-[var(--ob-text-muted)] underline"
          >
            Close
          </Link>
        </div>

        {status.kind !== "idle" ? (
          <p
            role={status.kind === "error" ? "alert" : "status"}
            className={
              status.kind === "error"
                ? "text-sm text-[var(--ob-danger)]"
                : "text-sm text-[var(--crm-lab-strong)]"
            }
          >
            {status.message}
          </p>
        ) : null}

        {preview ? <PreviewResult preview={preview} /> : null}
      </form>
    </CrmPanel>
  );
}

/** Raw rule match vs the consent-filtered audience — the gap made explicit. */
function PreviewResult({ preview }: { preview: SegmentPreview }) {
  return (
    <div className="rounded-[var(--ob-radius-md)] border border-[var(--crm-wash-line)] bg-[var(--crm-wash)] p-3">
      <h4 className="text-sm font-semibold">
        {preview.matched} match{preview.matched === 1 ? "es" : ""} the rule ·{" "}
        {preview.contactable} you may contact
      </h4>
      <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
        {preview.blocked === 0
          ? "Everybody who matches has granted marketing consent and has not opted out."
          : `${preview.blocked} of the matches are silently excluded from any send list: consent declined, never asked, opted out or archived. They stay in the segment count but never in the audience.`}
      </p>
      {preview.ruleLines.length ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-[var(--ob-text-secondary)]">
          {preview.ruleLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-[var(--ob-text-muted)]">
          Manual list — the {preview.matched} live people are exactly the ones you
          ticked.
        </p>
      )}
      <ul className="mt-2 space-y-1 text-sm">
        {preview.sample.map((person) => (
          <li key={person.name} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate">{person.name}</span>
            <CrmChip tone={person.contactable ? "positive" : "danger"}>
              {person.contactable ? "may contact" : person.reason ?? "excluded"}
            </CrmChip>
          </li>
        ))}
      </ul>
      {preview.sample.length < preview.matched ? (
        <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
          First {preview.sample.length} of {preview.matched} matches shown.
        </p>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
        {title}
      </legend>
      <div className="space-y-2">{children}</div>
    </fieldset>
  );
}

function CheckList({
  legend,
  values,
  labels,
  selected,
  onToggle,
  emptyNote,
}: {
  legend: string;
  values: string[];
  labels?: Record<string, string>;
  selected: string[];
  onToggle: (value: string, checked: boolean) => void;
  emptyNote?: string;
}) {
  if (!values.length) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
          {legend}
        </p>
        <p className="mt-1 text-xs text-[var(--ob-text-muted)]">
          {emptyNote ?? "Nothing to pick from yet — type the value in instead."}
        </p>
      </div>
    );
  }
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ob-text-muted)]">
        {legend}
      </legend>
      <div className="ob-scroll-x flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
        {values.map((value) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={(event) => onToggle(value, event.target.checked)}
            />
            {labels?.[value] ?? value}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="text-[var(--ob-text-muted)]">
        {label}
        {required ? <span className="ml-0.5 text-[var(--ob-danger)]">*</span> : null}
      </span>
      <div className="mt-1">{children}</div>
      {hint ? (
        <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}
