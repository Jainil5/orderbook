"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setOrdersPaused, setWorkingHours } from "@/lib/auth/settings-actions";
import {
  WEEKDAY_ORDER,
  openStateAt,
  type WeekdayKey,
  type WorkingHours,
} from "@/lib/hours/working-hours";
import { useMounted } from "@/lib/use-mounted";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const DAY_LABEL: Record<WeekdayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** What a day looks like the moment it is switched on. */
const OPEN_BY_DEFAULT = { open: "09:00", close: "18:00" };

export function WorkingHoursSetting({
  initialHours,
  initialPaused,
  canEdit,
  websiteUrl,
}: {
  initialHours: WorkingHours;
  initialPaused: boolean;
  canEdit: boolean;
  websiteUrl: string | null;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const [hours, setHours] = useState<WorkingHours>(initialHours);
  const [paused, setPaused] = useState(initialPaused);
  const [busy, setBusy] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state = mounted ? openStateAt(hours, new Date(), { paused }) : null;

  function patchDay(day: WeekdayKey, next: WorkingHours[WeekdayKey]) {
    setError(null);
    setMessage(null);
    setHours((prev) => ({ ...prev, [day]: next }));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await setWorkingHours(hours);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setMessage("Saved. The website header follows it on the next load.");
    router.refresh();
  }

  async function onPauseChange(next: boolean) {
    if (!canEdit || pauseBusy || next === paused) return;
    setPauseBusy(true);
    const result = await setOrdersPaused(next);
    setPauseBusy(false);
    if (result.ok) {
      setPaused(next);
      router.refresh();
    } else {
      setError("Could not save. Try again.");
    }
  }

  return (
    <form onSubmit={onSave} className="mt-4 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ob-radius-md)] border border-[var(--ob-border)] p-3">
        <div>
          <p className="font-medium">
            {paused ? "Closed for orders" : "Taking orders"}
          </p>
          <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
            The manual switch. It closes the door right now, whatever the week
            says — for a rush you cannot serve or a day you shut early.
          </p>
          {state ? (
            <p
              className={cn(
                "mt-2 text-sm font-semibold",
                state.status === "open"
                  ? "text-[var(--ob-success)]"
                  : state.status === "closing_soon"
                    ? "text-[var(--ob-warning)]"
                    : "text-[var(--ob-text-muted)]",
              )}
            >
              {state.label}
            </p>
          ) : null}
        </div>
        <select
          className="ob-input max-w-40"
          value={paused ? "closed" : "open"}
          disabled={!canEdit || pauseBusy}
          onChange={(e) => onPauseChange(e.target.value === "closed")}
          aria-label="Availability right now"
        >
          <option value="open">Available</option>
          <option value="closed">Not available</option>
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="ob-label">Opening hours</legend>
        <ul className="space-y-2">
          {WEEKDAY_ORDER.map((day) => {
            const window = hours[day];
            return (
              <li
                key={day}
                className="flex flex-wrap items-center gap-3 rounded-[var(--ob-radius-sm)] border border-[var(--ob-border)] p-3"
              >
                <label className="flex min-w-32 items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={window !== null}
                    disabled={!canEdit}
                    onChange={(e) =>
                      patchDay(day, e.target.checked ? { ...OPEN_BY_DEFAULT } : null)
                    }
                  />
                  {DAY_LABEL[day]}
                </label>
                {window ? (
                  <>
                    <label className="text-sm">
                      <span className="sr-only">{DAY_LABEL[day]} opening time</span>
                      <input
                        type="time"
                        className="ob-input w-32"
                        value={window.open}
                        disabled={!canEdit}
                        onChange={(e) =>
                          patchDay(day, {
                            open: e.target.value,
                            close: window.close,
                          })
                        }
                      />
                    </label>
                    <span className="text-sm text-[var(--ob-text-muted)]">to</span>
                    <label className="text-sm">
                      <span className="sr-only">{DAY_LABEL[day]} closing time</span>
                      <input
                        type="time"
                        className="ob-input w-32"
                        value={window.close}
                        disabled={!canEdit}
                        onChange={(e) =>
                          patchDay(day, {
                            open: window.open,
                            close: e.target.value,
                          })
                        }
                      />
                    </label>
                  </>
                ) : (
                  <span className="text-sm text-[var(--ob-text-muted)]">Closed</span>
                )}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy} disabled={!canEdit}>
          Save hours
        </Button>
        <p className="text-xs text-[var(--ob-text-muted)]">
          {websiteUrl
            ? `Shown on ${websiteUrl} and on any screen that asks whether you are open.`
            : "Shown on any screen that asks whether you are open."}
        </p>
      </div>

      {message ? (
        <p role="status" className="text-sm text-[var(--ob-success)]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--ob-danger)]">
          {error}
        </p>
      ) : null}
      {!canEdit ? (
        <p className="text-sm text-[var(--ob-text-muted)]">
          Only owners and managers can change this in live workspaces.
        </p>
      ) : null}
    </form>
  );
}
