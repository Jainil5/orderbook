"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  customerCrmInputFromCustomer,
  MAX_CUSTOM_FIELDS,
  type CustomerCrmInput,
} from "@/lib/crm/directory";
import { updateCustomerCrmAction } from "@/services/crm-actions";
import type { Customer } from "@/types/database";

/**
 * The relationship half of a customer record. Billing's own editor still owns
 * name, phone and email, so this form never touches them — it writes tags,
 * source, price list, consent and the brand's custom fields.
 */
export function CustomerCrmEditor({ customer }: { customer: Customer }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState<CustomerCrmInput>(() =>
    customerCrmInputFromCustomer(customer),
  );

  function set<K extends keyof CustomerCrmInput>(key: K, value: CustomerCrmInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await updateCustomerCrmAction(customer.id, input);
      if (result.ok) {
        dialogRef.current?.close();
        router.refresh();
        return;
      }
      setError(result.message);
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => dialogRef.current?.showModal()}>
        Edit CRM fields
      </Button>
      <dialog
        ref={dialogRef}
        className="m-auto max-h-[90vh] w-[min(100%,42rem)] overflow-y-auto rounded-[var(--ob-radius-lg)] border border-[var(--ob-border)] bg-[var(--ob-glass-strong)] p-0 shadow-[var(--ob-shadow-md)] backdrop:bg-[var(--ob-scrim-bg)] backdrop:backdrop-blur-[3px]"
        onClose={() => setError(null)}
      >
        <form className="space-y-4 p-5" onSubmit={onSubmit}>
          <div>
            <h2 className="font-semibold">CRM fields</h2>
            <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
              {customer.name} — name, phone and email stay on the billing editor.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Status</span>
              <select
                className="ob-input mt-1 w-full"
                value={input.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Price list</span>
              <select
                className="ob-input mt-1 w-full"
                value={input.price_tier}
                onChange={(e) => set("price_tier", e.target.value)}
              >
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">How they found us</span>
              <input
                className="ob-input mt-1 w-full"
                value={input.source}
                onChange={(e) => set("source", e.target.value)}
                maxLength={60}
                placeholder="Walk-in, Instagram, referral…"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Gender (optional)</span>
              <select
                className="ob-input mt-1 w-full"
                value={input.gender}
                onChange={(e) => set("gender", e.target.value)}
              >
                <option value="">Not recorded</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--ob-text-muted)]">Birthday</span>
              <input
                className="ob-input mt-1 w-full"
                type="date"
                value={input.date_of_birth}
                onChange={(e) => set("date_of_birth", e.target.value)}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-[var(--ob-text-muted)]">Tags</span>
              <input
                className="ob-input mt-1 w-full"
                value={input.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="regular, rooftop, cash-only"
              />
              <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
                Comma separated. Tags drive segments and campaigns.
              </span>
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-[var(--ob-text-muted)]">Delivery address (optional)</span>
              <input
                className="ob-input mt-1 w-full"
                value={input.address}
                onChange={(e) => set("address", e.target.value)}
                maxLength={240}
              />
            </label>
          </div>

          <fieldset className="space-y-2 rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-3">
            <legend className="px-1 text-sm text-[var(--ob-text-muted)]">
              Marketing permission
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={input.marketing_consent === "yes"}
                onChange={(e) => set("marketing_consent", e.target.checked ? "yes" : "no")}
              />
              Consented to offers
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={input.opted_out === "yes"}
                onChange={(e) => set("opted_out", e.target.checked ? "yes" : "no")}
              />
              Opted out
            </label>
            <p className="text-xs text-[var(--ob-text-muted)]">
              An opt-out is a fact about the person and always wins, so campaigns drop this
              customer whatever the consent box says.
            </p>
          </fieldset>

          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Notes</span>
            <textarea
              className="ob-input mt-1 min-h-20 w-full"
              value={input.notes}
              onChange={(e) => set("notes", e.target.value)}
              maxLength={500}
            />
          </label>

          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">
              Custom fields — JSON object, up to {MAX_CUSTOM_FIELDS}
            </span>
            <textarea
              className="ob-input mt-1 min-h-24 w-full font-mono text-xs"
              value={input.custom_fields}
              onChange={(e) => set("custom_fields", e.target.value)}
              placeholder={'{\n  "Table preference": "window seat",\n  "Allergies": "peanut"\n}'}
            />
            <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">
              Whatever this shop keeps that no column was built for — values must be text or numbers.
            </span>
          </label>

          {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" loading={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setInput(customerCrmInputFromCustomer(customer));
                dialogRef.current?.close();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
