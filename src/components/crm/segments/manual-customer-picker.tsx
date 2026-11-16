"use client";

import { useState } from "react";
import { CrmChip } from "@/components/crm/crm-ui";

/**
 * Hand-picked customer list for a MANUAL segment.
 *
 * Everything here is one brand's own customer rows, passed down by the server
 * page. The only thing this component sends to the action is the list of ids.
 */

export type PickerCustomer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  consent: "granted" | "declined" | null;
  optedOutAt: string | null;
  archived: boolean;
};

const PAGE = 200;

export function ManualCustomerPicker({
  customers,
  selected,
  onChange,
}: {
  customers: PickerCustomer[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();

  const visible = customers.filter((customer) => {
    if (!needle) return true;
    return (
      customer.name.toLowerCase().includes(needle) ||
      (customer.phone ?? "").toLowerCase().includes(needle) ||
      (customer.email ?? "").toLowerCase().includes(needle)
    );
  });
  const shown = visible.slice(0, PAGE);
  const selectedSet = new Set(selected);

  function toggle(id: string, checked: boolean) {
    onChange(
      checked
        ? selected.includes(id)
          ? selected
          : [...selected, id]
        : selected.filter((item) => item !== id),
    );
  }

  return (
    <div className="rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-3">
      <label className="block text-sm">
        <span className="text-[var(--ob-text-muted)]">Search customers</span>
        <input
          className="ob-input mt-1 w-full"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Name, phone or email"
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ob-text-muted)]">
        <span>
          {selected.length} selected of {customers.length} customers ·{" "}
          {visible.length} match{visible.length === 1 ? "es" : ""} this search
        </span>
        <span className="flex flex-wrap gap-2">
          <button
            type="button"
            className="ob-touch-target underline"
            onClick={() =>
              onChange([
                ...selected,
                ...shown.filter((c) => !selectedSet.has(c.id)).map((c) => c.id),
              ])
            }
          >
            Add all {shown.length} shown
          </button>
          <button
            type="button"
            className="ob-touch-target underline"
            onClick={() => onChange([])}
          >
            Clear selection
          </button>
        </span>
      </div>

      <fieldset className="mt-2 max-h-72 space-y-1 overflow-y-auto border-t border-[var(--ob-border)] pt-2">
        <legend className="sr-only">Customers to include in this manual segment</legend>
        {shown.length === 0 ? (
          <p className="py-3 text-sm text-[var(--ob-text-muted)]">
            No customer matches that search.
          </p>
        ) : null}
        {shown.map((customer) => (
          <label
            key={customer.id}
            className="flex flex-wrap items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-[var(--ob-surface-muted)]"
          >
            <input
              type="checkbox"
              checked={selectedSet.has(customer.id)}
              onChange={(event) => toggle(customer.id, event.target.checked)}
            />
            <span className="min-w-0 truncate font-medium">{customer.name}</span>
            <span className="truncate text-xs text-[var(--ob-text-muted)]">
              {customer.phone ?? customer.email ?? "No contact recorded"}
            </span>
            {customer.archived ? <CrmChip tone="neutral">archived</CrmChip> : null}
            {!customer.archived && customer.optedOutAt ? (
              <CrmChip tone="danger">opted out</CrmChip>
            ) : null}
            {!customer.archived && !customer.optedOutAt && customer.consent === "granted" ? (
              <CrmChip tone="positive">consent</CrmChip>
            ) : null}
            {!customer.archived &&
            !customer.optedOutAt &&
            (customer.consent === "declined" || customer.consent === null) ? (
              <CrmChip tone="warning">
                {customer.consent === "declined" ? "declined" : "no consent"}
              </CrmChip>
            ) : null}
          </label>
        ))}
        {visible.length > shown.length ? (
          <p className="pt-2 text-xs text-[var(--ob-text-muted)]">
            Showing the first {PAGE} of {visible.length} matches — narrow the
            search to see the rest.
          </p>
        ) : null}
      </fieldset>
    </div>
  );
}
