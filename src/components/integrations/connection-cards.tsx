"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  disconnectIntegrationAction,
  listGoogleCalendarsAction,
  runSyncAction,
  selectCalendarAction,
} from "@/services/integrations-actions";
import {
  CAPABILITY_LABELS,
  STATUS_LABELS,
  scopeLabel,
} from "@/lib/integrations/labels";
import type { ConnectionView } from "@/lib/integrations/registry";
import type { IntegrationId } from "@/types/integrations";

/**
 * One card per channel: what it does, what was granted, when it last synced,
 * and the only three things a user can do from here — connect, pull, unlink.
 *
 * The Connect control is a plain link to the OAuth start route. Nothing on
 * this component can read a token: the props come from `loadIntegrationsView`,
 * which never selects the cipher columns.
 */

const TONE: Record<ConnectionView["status"], "success" | "neutral" | "warning" | "danger"> = {
  connected: "success",
  disconnected: "neutral",
  not_configured: "warning",
  error: "danger",
};

const IMPORTABLE: IntegrationId[] = ["google_calendar", "gmail"];

export function ConnectionCards({
  connections,
  canManage,
}: {
  connections: ConnectionView[];
  canManage: boolean;
}) {
  const [busy, setBusy] = useState<IntegrationId | null>(null);
  const [notices, setNotices] = useState<Partial<Record<IntegrationId, string>>>({});
  const [confirming, setConfirming] = useState<IntegrationId | null>(null);
  const [calendars, setCalendars] = useState<
    { id: string; summary: string; primary: boolean }[] | null
  >(null);
  const [pickerFor, setPickerFor] = useState<IntegrationId | null>(null);
  const router = useRouter();

  async function run(id: IntegrationId, fn: () => Promise<{ ok: boolean; message: string }>) {
    if (busy) return;
    setBusy(id);
    try {
      const result = await fn();
      setNotices((prev) => ({ ...prev, [id]: result.message }));
      if (result.ok) router.refresh();
    } catch {
      setNotices((prev) => ({ ...prev, [id]: "The request did not complete. Try again." }));
    } finally {
      setBusy(null);
    }
  }

  function openPicker(id: IntegrationId) {
    setPickerFor(pickerFor === id ? null : id);
    setCalendars(null);
    if (pickerFor !== id) {
      void run(id, async () => {
        const listed = await listGoogleCalendarsAction();
        if (!listed.ok) return listed;
        setCalendars(listed.calendars);
        return { ok: true, message: `${listed.calendars.length} calendar(s) on this account.` };
      });
    }
  }

  return (
    <div className="ob-stagger grid gap-3 lg:grid-cols-2">
      {connections.map((connection) => {
        const google = connection.id === "google_calendar" || connection.id === "gmail";
        const notice = notices[connection.id];
        return (
          <Card key={connection.id} className="flex h-full flex-col p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold">{connection.label}</h3>
                <p className="mt-1 text-sm text-[var(--ob-text-muted)]">
                  {connection.purpose}
                </p>
              </div>
              <Badge tone={TONE[connection.status]}>{STATUS_LABELS[connection.status]}</Badge>
            </div>

            <dl className="mt-3 space-y-1 text-xs text-[var(--ob-text-muted)]">
              {connection.accountLabel ? (
                <div className="flex gap-1">
                  <dt className="font-medium">Account</dt>
                  <dd className="min-w-0 break-all">{connection.accountLabel}</dd>
                </div>
              ) : null}
              <div className="flex gap-1">
                <dt className="font-medium">Access</dt>
                <dd>
                  {connection.capabilities.map((cap) => CAPABILITY_LABELS[cap]).join(", ") ||
                    "none yet"}
                </dd>
              </div>
              {connection.notRequested.length > 0 ? (
                <div className="flex gap-1">
                  <dt className="font-medium">Never requested</dt>
                  <dd>
                    {connection.notRequested.map((cap) => CAPABILITY_LABELS[cap]).join(", ")}
                  </dd>
                </div>
              ) : null}
              <div className="flex gap-1">
                <dt className="font-medium">Scopes</dt>
                <dd className="min-w-0 break-all">
                  {connection.scopes.length > 0
                    ? connection.scopes.map(scopeLabel).join(", ")
                    : "no OAuth scopes"}
                </dd>
              </div>
              <div className="flex gap-1">
                <dt className="font-medium">Last sync</dt>
                <dd>
                  {connection.lastSyncAt
                    ? new Date(connection.lastSyncAt).toLocaleString()
                    : "never"}
                </dd>
              </div>
              {connection.calendarId ? (
                <div className="flex gap-1">
                  <dt className="font-medium">Calendar</dt>
                  <dd className="min-w-0 break-all">{connection.calendarId}</dd>
                </div>
              ) : null}
            </dl>

            {connection.status === "not_configured" ? (
              <p className="mt-3 rounded-md bg-[var(--ob-surface-muted)] p-2 text-xs text-[var(--ob-text-secondary)]">
                Waiting on server settings: {connection.requiredEnv.join(", ")}
              </p>
            ) : null}

            {connection.status === "error" || notice ? (
              <p
                role="alert"
                className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-[var(--ob-warning)]"
              >
                {notice ?? connection.lastError}
              </p>
            ) : null}

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
              {google && canManage && connection.status !== "not_configured" ? (
                connection.status === "connected" ? (
                  <span className="text-xs text-[var(--ob-text-muted)]">
                    Connected as this account
                  </span>
                ) : (
                  <a
                    href="/api/integrations/google/start"
                    className="ob-touch-target inline-flex items-center rounded-[var(--ob-radius-md)] bg-[var(--ob-primary)] px-4 py-2.5 text-sm font-medium text-[var(--ob-primary-foreground)]"
                  >
                    Connect Google
                  </a>
                )
              ) : null}

              {canManage && IMPORTABLE.includes(connection.id) && connection.status === "connected" ? (
                <Button
                  variant="secondary"
                  disabled={busy === connection.id}
                  onClick={() =>
                    void run(connection.id, () => runSyncAction(connection.id))
                  }
                >
                  Sync now
                </Button>
              ) : null}

              {canManage && connection.id === "google_calendar" && connection.status === "connected" ? (
                <Button variant="ghost" onClick={() => openPicker(connection.id)}>
                  {pickerFor === connection.id ? "Close" : "Choose calendar"}
                </Button>
              ) : null}

              {canManage && google && connection.status === "connected" ? (
                confirming === connection.id ? (
                  <span className="flex items-center gap-2">
                    <Button
                      variant="danger"
                      disabled={busy === connection.id}
                      onClick={() =>
                        void run(connection.id, async () => {
                          setConfirming(null);
                          return disconnectIntegrationAction(connection.id);
                        })
                      }
                    >
                      Yes, disconnect
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button variant="ghost" onClick={() => setConfirming(connection.id)}>
                    Disconnect
                  </Button>
                )
              ) : null}
            </div>

            {pickerFor === connection.id ? (
              <div className="mt-3 rounded-md border border-[var(--ob-border)] p-2">
                <p className="text-xs text-[var(--ob-text-muted)]">
                  Only the calendar you pick here is pulled into the unified agenda.
                </p>
                {calendars === null ? (
                  <p className="mt-2 text-xs">Loading…</p>
                ) : calendars.length === 0 ? (
                  <p className="mt-2 text-xs">No calendars returned for this account.</p>
                ) : (
                  <ul className="mt-2 space-y-1">
                    {calendars.map((calendar) => (
                      <li key={calendar.id}>
                        <button
                          type="button"
                          className="ob-touch-target w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--ob-surface-muted)]"
                          disabled={busy === connection.id}
                          onClick={() =>
                            void run(connection.id, async () => {
                              const result = await selectCalendarAction(
                                connection.id,
                                calendar.id,
                              );
                              if (result.ok) setPickerFor(null);
                              return result;
                            })
                          }
                        >
                          {calendar.summary}
                          {calendar.primary ? " (default)" : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className="ob-touch-target mt-1 text-left text-xs text-[var(--ob-text-muted)] underline"
                  disabled={busy === connection.id}
                  onClick={() =>
                    void run(connection.id, async () => {
                      const result = await selectCalendarAction(connection.id, null);
                      if (result.ok) setPickerFor(null);
                      return result;
                    })
                  }
                >
                  Use the account default
                </button>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
