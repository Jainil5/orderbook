import { getGoogleOAuthConfig } from "../config";
import type { ExternalEvent } from "@/types/integrations";

/**
 * Google Calendar REST adapter (official `www.googleapis.com/calendar/v3`
 * endpoints). Reads are `calendar.readonly`; writes happen only when a
 * `PendingSyncAction` has been confirmed by a user, and every payload is
 * rebuilt from validated fields here rather than forwarded from the client.
 */

const EVENTS_PATH = "/calendar/v3/calendars";
// Google's own ids use `#` (holiday calendars) and `@`; nothing here may carry a
// path, query or fragment separator, because the id is interpolated into a URL.
const CALENDAR_ID_PATTERN = /^[A-Za-z0-9@._#-]{1,250}$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const EVENT_ID_PATTERN = /^[A-Za-z0-9_@.-]{1,200}$/;
const MAX_FIELD = 500;

export type GoogleCalendarEvent = {
  id: string;
  summary: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  attendeeCount: number | null;
  htmlLink: string | null;
};

export type AdapterResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

function fail(status: number, message: string): { ok: false; status: number; message: string } {
  return { ok: false, status, message };
}

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed.slice(0, MAX_FIELD) : fallback;
}

function cleanNullable(value: unknown, max = MAX_FIELD): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : null;
}

/** Google sends either `dateTime` (timed) or `date` (all-day). */
function instantFrom(
  field: unknown,
  endField: unknown,
  isEnd: boolean,
): string | null {
  if (field && typeof field === "object") {
    const value = (field as { dateTime?: unknown }).dateTime;
    if (typeof value === "string" && RFC3339.test(value)) return value;
    // All-day events carry `date` only; give them a nominal local time so agenda
    // ordering stays sane.
    const day = (field as { date?: unknown }).date;
    if (typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const resolved = isEnd ? shiftDay(day, -1) : day;
      return `${resolved}T${isEnd ? "23:59" : "00:00"}:00`;
    }
  }
  if (typeof field === "string" && RFC3339.test(field)) return field;
  // All-day events get a nominal local time so agenda ordering stays sane.
  const daySource = typeof field === "string" ? field : undefined;
  if (daySource && /^\d{4}-\d{2}-\d{2}$/.test(daySource)) {
    const day = isEnd ? shiftDay(daySource, -1) : daySource;
    return `${day}T${isEnd ? "23:59" : "00:00"}:00`;
  }
  void endField;
  return null;
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function isValidCalendarId(value: unknown): value is string {
  return typeof value === "string" && CALENDAR_ID_PATTERN.test(value);
}

function apiBase(): string | null {
  const config = getGoogleOAuthConfig();
  return config ? config.apiBase : null;
}

/** Allowlist guard: we only ever call Google's own API origin. */
function safeApiUrl(path: string): string | null {
  const base = apiBase();
  if (!base) return null;
  const url = `${base}${path}`;
  return url.startsWith(`${base}/`) ? url : null;
}

async function call(
  url: string,
  accessToken: string,
  init?: RequestInit,
): Promise<{ ok: true; json: unknown } | { ok: false; status: number; message: string }> {
  if (!accessToken || accessToken.length > 4096) {
    return fail(400, "Missing access token.");
  }
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Never echo Google's body: it can contain account data.
      return fail(
        response.status,
        response.status === 401 || response.status === 403
          ? "Google refused the request — the connection needs re-approval."
          : `Google Calendar returned ${response.status}.`,
      );
    }
    return { ok: true, json: await response.json() };
  } catch {
    return fail(0, "Could not reach Google Calendar.");
  }
}

export function mapCalendarEvent(
  raw: unknown,
  input: { brandId: string; accountLabel: string | null; syncedAt: string },
): ExternalEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const event = raw as Record<string, unknown>;
  if (!EVENT_ID_PATTERN.test(String(event.id ?? ""))) return null;
  const startsAt = instantFrom(event.start, event.end, false);
  const endsAt = instantFrom(event.end, event.start, true) ?? startsAt;
  if (!startsAt || !endsAt) return null;
  const attendees = Array.isArray(event.attendees) ? event.attendees : null;
  return {
    id: `gcal-${String(event.id)}`,
    brand_id: input.brandId,
    source: "google_calendar",
    externalId: String(event.id),
    kind: "event",
    title: cleanText(event.summary, "Untitled event"),
    startsAt,
    endsAt,
    location: cleanNullable(event.location, 200),
    accountLabel: input.accountLabel,
    customerId: null,
    attendeeCount: attendees ? attendees.length : null,
    snippet: cleanNullable(event.description, 240),
    needsFollowUp: false,
    syncedAt: input.syncedAt,
  };
}

/**
 * Normalises an already-fetched row so the sync orchestrator never has to
 * fake a Google payload back into `mapCalendarEvent`.
 */
export function toExternalEvent(
  event: GoogleCalendarEvent,
  ctx: { brandId: string; accountLabel: string | null; syncedAt: string },
): ExternalEvent {
  return {
    id: `gcal-${event.id}`,
    brand_id: ctx.brandId,
    source: "google_calendar",
    externalId: event.id,
    kind: "event",
    title: event.summary,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    location: event.location,
    accountLabel: ctx.accountLabel,
    customerId: null,
    attendeeCount: event.attendeeCount,
    snippet: event.description,
    needsFollowUp: false,
    syncedAt: ctx.syncedAt,
  };
}

/** `undefined` means "all calendars the account can see"; never a raw wildcard. */
export async function fetchEvents(input: {
  accessToken: string;
  calendarId: string | undefined;
  timeMin: string;
  timeMax: string;
  query?: string;
  pageSize?: number;
}): Promise<AdapterResult<GoogleCalendarEvent[]>> {
  if (input.calendarId !== undefined && !isValidCalendarId(input.calendarId)) {
    return fail(400, "Invalid calendar id.");
  }
  if (!RFC3339.test(input.timeMin) || !RFC3339.test(input.timeMax)) {
    return fail(400, "Invalid sync window.");
  }
  const scope = input.calendarId ?? "primary";
  const params = new URLSearchParams({
    timeMin: input.timeMin,
    timeMax: input.timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(Math.min(Math.max(input.pageSize ?? 100, 1), 250)),
  });
  if (input.query) params.set("q", input.query.slice(0, 80));

  const url = safeApiUrl(`${EVENTS_PATH}/${encodeURIComponent(scope)}/events?${params}`);
  if (!url) return fail(503, "Google Calendar is not configured on this server.");

  const result = await call(url, input.accessToken);
  if (!result.ok) return result;
  const items = (result.json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return { ok: true, data: [] };

  const events: GoogleCalendarEvent[] = [];
  for (const raw of items) {
    const mapped = mapCalendarEvent(raw, {
      brandId: "",
      accountLabel: null,
      syncedAt: "",
    });
    if (!mapped) continue;
    const source = raw as Record<string, unknown>;
    events.push({
      id: mapped.externalId,
      summary: mapped.title,
      description: mapped.snippet,
      location: mapped.location,
      startsAt: mapped.startsAt,
      endsAt: mapped.endsAt,
      attendeeCount: mapped.attendeeCount,
      htmlLink: cleanNullable(source.htmlLink, 300),
    });
  }
  return { ok: true, data: events };
}

export async function listCalendars(
  accessToken: string,
): Promise<AdapterResult<{ id: string; summary: string; primary: boolean }[]>> {
  const url = safeApiUrl("/calendar/v3/users/me/calendarList");
  if (!url) return fail(503, "Google Calendar is not configured on this server.");
  const result = await call(url, accessToken);
  if (!result.ok) return result;
  const items = (result.json as { items?: unknown })?.items;
  if (!Array.isArray(items)) return { ok: true, data: [] };
  const calendars: { id: string; summary: string; primary: boolean }[] = [];
  for (const raw of items) {
    const calendar = raw as Record<string, unknown>;
    if (!isValidCalendarId(calendar.id)) continue;
    calendars.push({
      id: calendar.id,
      summary: cleanText(calendar.summary, "Calendar"),
      primary: calendar.primary === true,
    });
  }
  return { ok: true, data: calendars };
}

export type CalendarEventDraft = {
  summary: string;
  startsAt: string;
  endsAt: string;
  description?: string | null;
  location?: string | null;
  customerName?: string | null;
};

/**
 * Rebuilds a create payload from validated fields. The client only ever holds
 * the proposal id and the plain-text summary, so a tampered request cannot
 * smuggle an arbitrary Google API body through this adapter.
 */
export function buildEventBody(draft: CalendarEventDraft): {
  ok: true;
  body: Record<string, unknown>;
} | { ok: false; message: string } {
  if (typeof draft.summary !== "string" || draft.summary.trim().length === 0) {
    return { ok: false, message: "Event needs a title." };
  }
  if (!RFC3339.test(draft.startsAt) || !RFC3339.test(draft.endsAt)) {
    return { ok: false, message: "Event times must be valid ISO timestamps." };
  }
  if (new Date(draft.endsAt).getTime() <= new Date(draft.startsAt).getTime()) {
    return { ok: false, message: "Event must end after it starts." };
  }
  return {
    ok: true,
    body: {
      summary: draft.summary.trim().slice(0, MAX_FIELD),
      description: cleanNullable(draft.description) ?? undefined,
      location: cleanNullable(draft.location, 200) ?? undefined,
      attendees: draft.customerName
        ? [{ displayName: cleanText(draft.customerName, "Customer") }]
        : undefined,
      start: { dateTime: draft.startsAt },
      end: { dateTime: draft.endsAt },
    },
  };
}

/** Insert into the connected calendar — called only after a user confirms. */
export async function createEvent(input: {
  accessToken: string;
  calendarId: string | undefined;
  draft: CalendarEventDraft;
}): Promise<AdapterResult<{ externalId: string; htmlLink: string | null }>> {
  const built = buildEventBody(input.draft);
  if (!built.ok) return fail(400, built.message);
  if (input.calendarId !== undefined && !isValidCalendarId(input.calendarId)) {
    return fail(400, "Invalid calendar id.");
  }
  const url = safeApiUrl(
    `${EVENTS_PATH}/${encodeURIComponent(input.calendarId ?? "primary")}/events`,
  );
  if (!url) return fail(503, "Google Calendar is not configured on this server.");
  const result = await call(url, input.accessToken, {
    method: "POST",
    body: JSON.stringify(built.body),
  });
  if (!result.ok) return result;
  const created = result.json as { id?: unknown; htmlLink?: unknown };
  if (typeof created.id !== "string" || !EVENT_ID_PATTERN.test(created.id)) {
    return fail(502, "Google did not return an event id.");
  }
  return {
    ok: true,
    data: { externalId: created.id, htmlLink: cleanNullable(created.htmlLink, 300) },
  };
}
