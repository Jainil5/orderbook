"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createStaffAction,
  setStaffAvailabilityAction,
  setStaffStatusAction,
  updateStaffAction,
} from "@/services/manager-actions";
import {
  STAFF_AVAILABILITY_LABELS,
  STAFF_ROLES,
  STAFF_ROLE_LABELS,
} from "@/lib/manager/staff";
import type { StaffAvailability, StaffMember } from "@/types/manager";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function StaffManager({
  staff,
  canEdit,
}: {
  staff: StaffMember[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("cashier");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(member: StaffMember | null) {
    setEditing(member);
    setName(member?.name ?? "");
    setRole(member?.role ?? "cashier");
    setPhone(member?.phone ?? "");
    setEmail(member?.email ?? "");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const input = { name, role, phone, email };
    try {
      const result = editing
        ? await updateStaffAction(editing.id, input)
        : await createStaffAction(input);
      if (result.ok) {
        startEdit(null);
        router.refresh();
      } else {
        setError(result.message);
      }
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function onAvailability(id: string, value: StaffAvailability) {
    try {
      const result = await setStaffAvailabilityAction(id, value);
      if (!result.ok) setError(result.message);
      else {
        setError(null);
        router.refresh();
      }
    } catch {
      setError("Could not save. Try again.");
    }
  }

  async function onToggleStatus(member: StaffMember) {
    try {
      const result = await setStaffStatusAction(
        member.id,
        member.status === "active" ? "inactive" : "active",
      );
      if (!result.ok) setError(result.message);
      else {
        setError(null);
        router.refresh();
      }
    } catch {
      setError("Could not save. Try again.");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-1">
        <h2 className="font-semibold">{editing ? `Edit ${editing.name}` : "Add staff"}</h2>
        <form onSubmit={onSubmit} className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Name</span>
            <input
              className="ob-input mt-1 w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              disabled={!canEdit || pending}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Role</span>
            <select
              className="ob-input mt-1 w-full"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={!canEdit || pending}
            >
              {STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {STAFF_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Phone (optional)</span>
            <input
              className="ob-input mt-1 w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={40}
              disabled={!canEdit || pending}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--ob-text-muted)]">Email (optional)</span>
            <input
              className="ob-input mt-1 w-full"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={120}
              disabled={!canEdit || pending}
            />
          </label>
          {error ? <p role="alert" className="text-sm text-[var(--ob-danger)]">{error}</p> : null}
          <div className="flex gap-2">
            <button
              type="submit"
              className="ob-touch-target rounded-md bg-[var(--ob-primary)] px-4 text-sm font-medium text-[var(--ob-primary-foreground)] disabled:opacity-50"
              disabled={!canEdit || pending}
            >
              {pending ? "Saving…" : editing ? "Save changes" : "Add staff"}
            </button>
            {editing ? (
              <button
                type="button"
                className="ob-touch-target rounded-md border border-[var(--ob-border)] px-4 text-sm"
                onClick={() => startEdit(null)}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </Card>
      <div className="space-y-3 lg:col-span-2">
        {staff.map((member) => (
          <Card key={member.id} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {member.name}
                  {member.status === "inactive" ? (
                    <Badge tone="neutral" className="ml-2">
                      Inactive
                    </Badge>
                  ) : null}
                </p>
                <p className="text-sm text-[var(--ob-text-muted)]">
                  {STAFF_ROLE_LABELS[member.role]}
                  {member.phone ? ` · ${member.phone}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="ob-input ob-touch-target"
                  value={member.availability}
                  aria-label={`Availability for ${member.name}`}
                  disabled={!canEdit || member.status === "inactive"}
                  onChange={(e) =>
                    onAvailability(member.id, e.target.value as StaffAvailability)
                  }
                >
                  {(Object.keys(STAFF_AVAILABILITY_LABELS) as StaffAvailability[]).map(
                    (a) => (
                      <option key={a} value={a}>
                        {STAFF_AVAILABILITY_LABELS[a]}
                      </option>
                    ),
                  )}
                </select>
                {canEdit ? (
                  <>
                    <button
                      type="button"
                      className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                      onClick={() => startEdit(member)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ob-touch-target rounded-md border border-[var(--ob-border)] px-3 text-sm"
                      onClick={() => onToggleStatus(member)}
                    >
                      {member.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
