"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Customer } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saveCustomerAction,
  updateCustomerAction,
} from "@/services/operations-actions";

export function CustomerEditor({
  customer,
  onDone,
}: {
  customer?: Customer;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [priceTier, setPriceTier] = useState<"retail" | "wholesale">(
    customer?.price_tier === "wholesale" ? "wholesale" : "retail",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { name, phone, email, notes, price_tier: priceTier };
    const result = customer
      ? await updateCustomerAction(customer.id, payload)
      : await saveCustomerAction(payload);
    setBusy(false);
    if (result.ok) {
      router.refresh();
      onDone?.();
    } else {
      setError("message" in result ? result.message : "Could not save.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Input
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <Input
        placeholder="Phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <Input
        placeholder="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        placeholder="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <label className="block text-sm">
        <span className="text-[var(--ob-text-muted)]">Price list</span>
        <select
          className="mt-1 w-full ob-input"
          value={priceTier}
          onChange={(e) =>
            setPriceTier(e.target.value as "retail" | "wholesale")
          }
        >
          <option value="retail">Retail</option>
          <option value="wholesale">Wholesale</option>
        </select>
      </label>
      {error ? (
        <p className="text-sm text-[var(--ob-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={busy}>
        {customer ? "Save changes" : "Add customer"}
      </Button>
    </form>
  );
}
