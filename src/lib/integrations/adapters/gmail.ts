import { getGoogleOAuthConfig } from "../config";
import type { ExternalEvent } from "@/types/integrations";

/**
 * Gmail adapter — official `gmail/v1` endpoints under `gmail.readonly` and
 * `gmail.compose` only.
 *
 * Reading mail is safe and reversible, so `search` and `thread` calls just
 * return normalised rows. Writing is where the product draws its line: this
 * adapter can create a **draft**, never send. A `send_gmail_message` proposal
 * is rejected here even if one were created, because the scope is not granted
 * and the policy forbids it.
 */

const API = "https://www.googleapis.com/gmail/v1/users/me";
export const READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose";
const MAX_FIELD = 500;
const MAX_SNIPPET = 240;
const MESSAGE_ID = /^[A-Za-z0-9_-]{8,64}$/;
// Gmail threads replies with an RFC 2822 id such as `<1f8a...c@mail.gmail.com>`,
// so the header form gets its own allowlist: angle brackets, word characters, `.@+-`.
const THREAD_ID = /^<[A-Za-z0-9._+@-]{1,200}>$/;

export type GmailHeader = { name: string; value: string };

export type GmailMessage = {
  id: string;
  threadId: string | null;
  subject: string;
  from: string | null;
  to: string | null;
  snippet: string;
  receivedAt: string;
  unread: boolean;
};

export type AdapterResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

function fail(status: number, message: string): { ok: false; status: number; message: string } {
  return { ok: false, status, message };
}

function text(value: unknown, max: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : fallback;
}

/** Only Google's own Gmail origin is ever fetched. */
function safeUrl(path: string): string | null {
  if (!getGoogleOAuthConfig()) return null;
  const url = `${API}${path}`;
  return url.startsWith(`${API}/`) ? url : null;
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
      return fail(
        response.status,
        response.status === 401 || response.status === 403
          ? "Google refused the request — the connection needs re-approval."
          : `Gmail returned ${response.status}.`,
      );
    }
    return { ok: true, json: await response.json() };
  } catch {
    return fail(0, "Could not reach Gmail.");
  }
}

function headersOf(payload: Record<string, unknown>): GmailHeader[] {
  const headers = (payload.headers ?? payload.header) as unknown;
  if (!Array.isArray(headers)) return [];
  const out: GmailHeader[] = [];
  for (const raw of headers) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as { name?: unknown; value?: unknown };
    if (typeof entry.name !== "string" || typeof entry.value !== "string") continue;
    out.push({
      name: text(entry.name, 60),
      value: text(entry.value, 300),
    });
  }
  return out;
}

/** RFC 3339 from a Unix-seconds `internalDate`, falling back to the epoch. */
function receivedAt(internalDate: unknown): string {
  if (typeof internalDate === "string" && /^\d{1,13}$/.test(internalDate)) {
    const millis =
      internalDate.length > 11
        ? Number(internalDate)
        : Number(internalDate) * 1000;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (typeof internalDate === "number" && Number.isFinite(internalDate)) {
    return new Date(internalDate).toISOString();
  }
  return new Date(0).toISOString();
}

export function mapMessage(
  raw: unknown,
  input: { brandId: string; accountLabel: string | null; syncedAt: string },
): ExternalEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const message = raw as Record<string, unknown>;
  const id = message.id;
  if (typeof id !== "string" || !MESSAGE_ID.test(id)) return null;
  const payload = (message.payload ?? message) as Record<string, unknown>;
  const headers = headersOf(payload);
  const header = (name: string): string | null =>
    headers.find((entry) => entry.name.toLowerCase() === name)?.value ?? null;

  const subject = text(header("subject") ?? "", MAX_FIELD, "(no subject)");
  const date = receivedAt(payload.internalDate ?? message.internalDate);
  const snippet = text(header("snippet") ?? message.snippet, MAX_SNIPPET);
  const labelIds = Array.isArray(message.labelIds) ? message.labelIds : [];
  const unread = labelIds.includes("UNREAD");

  return {
    id: `gmail-${id}`,
    brand_id: input.brandId,
    source: "gmail",
    externalId: id,
    kind: "email",
    title: subject,
    startsAt: date,
    endsAt: date,
    location: null,
    accountLabel: input.accountLabel,
    customerId: null,
    attendeeCount: null,
    snippet: snippet.length > 0 ? snippet : null,
    // Anything unread that is not a notification-style label needs a reply.
    needsFollowUp: unread,
    syncedAt: input.syncedAt,
  };
}

/** Normalised row for the unified agenda from an already-read message. */
export function toExternalEvent(
  message: GmailMessage,
  ctx: { brandId: string; accountLabel: string | null; syncedAt: string },
): ExternalEvent {
  return {
    id: `gmail-${message.id}`,
    brand_id: ctx.brandId,
    source: "gmail",
    externalId: message.id,
    kind: "email",
    title: message.subject || "(no subject)",
    startsAt: message.receivedAt,
    endsAt: message.receivedAt,
    location: null,
    accountLabel: ctx.accountLabel,
    customerId: null,
    attendeeCount: null,
    snippet: message.snippet ? message.snippet.slice(0, 240) : null,
    // Unread mail is treated as "needs a reply", never as an inferred promise.
    needsFollowUp: message.unread,
    syncedAt: ctx.syncedAt,
  };
}

export type GmailQuery = {
  /** Gmail search syntax, e.g. `is:unread newer_than:7d`. */
  raw: string;
  maxResults: number;
};

const QUERY_ALLOWED = /^[A-Za-z0-9 ._:@"'()<>+-]{0,200}$/;

/**
 * The query is limited to Gmail's own search operators and a strict character
 * set: it is a read filter, never free-form input, and it must not carry
 * credentials or addresses harvested elsewhere.
 */
export function buildQuery(raw: unknown): GmailQuery | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0 || !QUERY_ALLOWED.test(trimmed)) return null;
  if (/[?]{2,}|https?:\/\//i.test(trimmed)) return null;
  return { raw: trimmed.slice(0, 200), maxResults: 25 };
}

export async function search(
  accessToken: string,
  query: GmailQuery,
): Promise<AdapterResult<string[]>> {
  const params = new URLSearchParams({
    q: query.raw,
    maxResults: String(Math.min(Math.max(query.maxResults, 1), 50)),
  });
  const url = safeUrl(`/messages?${params}`);
  if (!url) return fail(503, "Gmail is not configured on this server.");
  const result = await call(url, accessToken);
  if (!result.ok) return result;
  const messages = (result.json as { messages?: unknown })?.messages;
  if (!Array.isArray(messages)) return { ok: true, data: [] };
  const ids: string[] = [];
  for (const raw of messages) {
    const id = (raw as { id?: unknown })?.id;
    if (typeof id === "string" && MESSAGE_ID.test(id)) ids.push(id);
  }
  return { ok: true, data: ids };
}

/**
 * `metadata` keeps the read inside the scope we asked for: subject, sender,
 * timestamp and snippet — never the whole message body.
 */
export async function readMessage(
  accessToken: string,
  messageId: string,
): Promise<AdapterResult<GmailMessage>> {
  if (!MESSAGE_ID.test(messageId)) return fail(400, "Invalid message id.");
  const url = safeUrl(
    `/messages/${encodeURIComponent(messageId)}?format=metadata`,
  );
  if (!url) return fail(503, "Gmail is not configured on this server.");
  const result = await call(url, accessToken);
  if (!result.ok) return result;
  const mapped = mapMessage(result.json, {
    brandId: "",
    accountLabel: null,
    syncedAt: "",
  });
  if (!mapped) return fail(502, "Gmail returned an unreadable message.");
  const payload = (result.json as { payload?: Record<string, unknown> })?.payload;
  const headers = headersOf(payload ?? {});
  return {
    ok: true,
    data: {
      id: mapped.externalId,
      threadId: text((result.json as { threadId?: unknown })?.threadId, 64) || null,
      subject: mapped.title,
      from: headers.find((entry) => entry.name.toLowerCase() === "from")?.value ?? null,
      to: headers.find((entry) => entry.name.toLowerCase() === "to")?.value ?? null,
      snippet: mapped.snippet ?? "",
      receivedAt: mapped.startsAt,
      unread: mapped.needsFollowUp,
    },
  };
}

export type DraftInput = {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
};

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[A-Za-z]{2,}$/;

/** RFC 2822 message, base64url-encoded the way the Gmail API expects. */
export function buildDraft(input: DraftInput): {
  ok: true;
  raw: string;
} | { ok: false; message: string } {
  const to = input.to.trim();
  if (!EMAIL.test(to)) return { ok: false, message: "Draft needs a valid recipient." };
  const subject = text(input.subject, MAX_FIELD);
  if (subject.length === 0) return { ok: false, message: "Draft needs a subject." };
  const body = text(input.body, 4000);
  if (body.length === 0) return { ok: false, message: "Draft needs a message." };

  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    ...(input.inReplyTo && THREAD_ID.test(input.inReplyTo.trim())
      ? [`In-Reply-To: ${input.inReplyTo.trim()}`, `References: ${input.inReplyTo.trim()}`]
      : []),
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ];
  const raw = Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { ok: true, raw };
}

/**
 * Creates a draft in the connected mailbox (compose scope). This is the only
 * Gmail write the platform performs; sending stays a human action in Gmail.
 * The granted-scope list comes from the vault, so a connection that was
 * approved without `gmail.compose` cannot draft.
 */
export async function createDraft(input: {
  accessToken: string;
  grantedScopes: string[];
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
}): Promise<AdapterResult<{ draftId: string }>> {
  if (!input.grantedScopes.includes(COMPOSE_SCOPE)) {
    return fail(403, "The connection does not include the Gmail compose scope.");
  }
  const built = buildDraft(input);
  if (!built.ok) return fail(400, built.message);
  const url = safeUrl("/drafts");
  if (!url) return fail(503, "Gmail is not configured on this server.");
  const result = await call(url, input.accessToken, {
    method: "POST",
    body: JSON.stringify({ message: { raw: built.raw } }),
  });
  if (!result.ok) return result;
  const draft = result.json as { id?: unknown };
  if (typeof draft.id !== "string" || !MESSAGE_ID.test(draft.id)) {
    return fail(502, "Gmail did not return a draft id.");
  }
  return { ok: true, data: { draftId: draft.id } };
}
