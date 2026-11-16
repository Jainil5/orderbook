"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmPanel } from "@/components/crm/crm-ui";
import { updateCustomerProfileAction } from "@/services/crm-customer-actions";
import type { Customer } from "@/types/database";

/**
 * The CRM half of a customer record. Contact details are the same fields
 * billing uses; everything below them is CRM-only and is written through the
 * same single customer path, so this form and the billing screen cannot
 * disagree about who a customer is.
 *
 * Consent is a recorded decision, not a checkbox: it is dated on save by the
 * server, and declining stamps the opt-out.
 */
export function CustomerProfileForm({
  customer,
  leadSources,
}: {
  customer: Customer;
  /** Source pick-list: the brand's own sources, plus the app defaults. */
  leadSources: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error"; message: string }>({
    kind: "idle",
    message: "",
  });
  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    notes: customer.notes ?? "",
    price_tier: customer.price_tier ?? "retail",
    dob: customer.dob ?? "",
    gender: customer.gender ?? "",
    address: customer.address ?? "",
    source: customer.source ?? "",
    tags: (customer.tags ?? []).join(", "),
    marketing_consent: customer.marketing_consent ?? "",
  });

  const set = (key: keyof typeof form) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
    setStatus({ kind: "idle", message: "" });
  };

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await updateCustomerProfileAction({ customerId: customer.id, ...form });
    setBusy(false);
    if (result.ok) {
      setStatus({ kind: "ok", message: "Saved." });
      router.refresh();
    } else {
      setStatus({ kind: "error", message: result.message });
    }
  }

  return (
    <CrmPanel
      title="Profile"
      meta={`Added ${customer.created_at ? customer.created_at.slice(0, 10) : "—"}`}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={form.name} onChange={set("name")} required />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={set("phone")} inputMode="tel" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set("email")} />
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={form.dob} onChange={set("dob")} />
          </Field>
          <Field label="Gender">
            <select
              className="ob-input w-full"
              value={form.gender}
              onChange={set("gender")}
              aria-label="Gender"
            >
              <option value="">Keep current / not recorded</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Price list">
            <select
              className="ob-input w-full"
              value={form.price_tier}
              onChange={set("price_tier")}
              aria-label="Price list"
            >
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
            </select>
          </Field>
          <Field label="Source">
            <select
              className="ob-input w-full"
              value={form.source}
              onChange={set("source")}
              aria-label="How the customer was acquired"
            >
              <option value="">Not recorded</option>
              {leadSources.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Marketing consent">
            <select
              className="ob-input w-full"
              value={form.marketing_consent}
              onChange={set("marketing_consent")}
              aria-label="Marketing consent"
            >
              <option value="">
                {customer.marketing_consent
                  ? `Currently ${customer.marketing_consent}`
                  : "Never asked"}
              </option>
              <option value="granted">Granted — may be targeted by campaigns</option>
              <option value="declined">Declined — never target</option>
            </select>
          </Field>
        </div>

        <Field label="Address">
          <Input value={form.address} onChange={set("address")} />
        </Field>

        <Field label="Tags" hint="Comma separated. Segments can match on these.">
          <Input value={form.tags} onChange={set("tags")} placeholder="villa buyer, repeat" />
        </Field>

        <Field label="Notes">
          <textarea
            className="ob-input min-h-24 w-full"
            value={form.notes}
            onChange={set("notes")}
            placeholder="Measurements, delivery preferences, who to ask for…"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy}>
            Save profile
          </Button>
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
        </div>
      </form>
    </CrmPanel>
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
      {hint ? <span className="mt-1 block text-xs text-[var(--ob-text-muted)]">{hint}</span> : null}
    </label>
  );
}
