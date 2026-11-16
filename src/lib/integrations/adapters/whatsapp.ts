import { getWhatsAppConfig } from "../config";

/**
 * WhatsApp Business Cloud API adapter (Meta's official `graph.facebook.com`
 * endpoints). No OAuth: a server-side system-user token in
 * `WHATSAPP_ACCESS_TOKEN`, never exposed to the browser.
 *
 * Product rule: a message is only ever handed to this adapter after a user
 * confirmed the proposal, and only when the recipient is in the approved
 * recipient list for that template. Free-text sends to arbitrary numbers are
 * not possible through this module.
 */

const GRAPH_API = "https://graph.facebook.com";
const MAX_BODY = 1024;
const PHONE = /^[0-9]{8,15}$/;
const TEMPLATE = /^[a-z0-9_]{1,64}$/;

export type WhatsAppResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

function fail(status: number, message: string): { ok: false; status: number; message: string } {
  return { ok: false, status, message };
}

function apiVersion(): string {
  return getWhatsAppConfig()?.apiVersion ?? "v21.0";
}

/** Only Meta's own graph origin, and only the configured phone-number node. */
function safeUrl(path: string): string | null {
  const config = getWhatsAppConfig();
  if (!config) return null;
  const url = `${GRAPH_API}/${apiVersion()}/${config.phoneNumberId}${path}`;
  return url.startsWith(`${GRAPH_API}/`) ? url : null;
}

export function normalizeMsisdn(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[^0-9]/g, "").replace(/^0+/, "");
  if (!PHONE.test(digits)) return null;
  return digits;
}

const URLISH = /(https?:\/\/|wa\.me|api\.whatsapp|graph\.facebook)/i;

/**
 * Bodies are plain text. Links are rejected because a marketing-style link in
 * an automated message is exactly how number bans happen, and because it keeps
 * a proposal's text identical to what actually goes out.
 */
export function buildTextMessage(body: unknown): {
  ok: true;
  body: string;
} | { ok: false; message: string } {
  if (typeof body !== "string") return { ok: false, message: "Message text is required." };
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, message: "Message text is required." };
  if (URLISH.test(trimmed)) {
    return { ok: false, message: "Automated messages cannot contain links." };
  }
  if (trimmed.length > MAX_BODY) {
    return { ok: false, message: `Message is too long (max ${MAX_BODY} characters).` };
  }
  return { ok: true, body: trimmed };
}

async function post(
  path: string,
  payload: Record<string, unknown>,
): Promise<WhatsAppResult<{ messageId: string | null }>> {
  if (!getWhatsAppConfig()) {
    return fail(503, "WhatsApp is not configured on this server.");
  }
  const url = safeUrl(path);
  if (!url) return fail(503, "WhatsApp is not configured on this server.");
  const token = getWhatsAppConfig()!.accessToken;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await response.json().catch(() => null)) as {
      messages?: { id?: unknown }[];
      error?: { message?: unknown };
    } | null;

    if (!response.ok) {
      // Meta's error text can name the recipient; keep our own generic line.
      return fail(
        response.status,
        response.status === 401 || response.status === 403
          ? "WhatsApp refused the request — check the Cloud API token."
          : `WhatsApp returned ${response.status}.`,
      );
    }
    const first = json?.messages?.[0];
    return {
      ok: true,
      data: { messageId: typeof first?.id === "string" ? first.id.slice(0, 64) : null },
    };
  } catch {
    return fail(0, "Could not reach WhatsApp.");
  }
}

/**
 * Session message — the only kind we send outside an approved template, and it
 * requires a customer-initiated conversation within the 24-hour window. Callers
 * must have passed through confirmation already.
 */
export async function sendText(input: {
  to: unknown;
  body: unknown;
  previewUrl?: boolean;
}): Promise<WhatsAppResult<{ messageId: string | null }>> {
  const to = normalizeMsisdn(input.to);
  if (!to) return fail(400, "Recipient phone number is not valid.");
  const built = buildTextMessage(input.body);
  if (!built.ok) return fail(400, built.message);

  return post("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { preview_url: input.previewUrl === true, body: built.body },
  });
}

export function buildTemplateParams(values: unknown): string[] | null {
  if (!Array.isArray(values) || values.length === 0 || values.length > 3) return null;
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const text = String(value).replace(/\s+/g, " ").trim().slice(0, 60);
    if (text.length === 0) return null;
    if (URLISH.test(text)) return null;
    out.push(text);
  }
  return out;
}

/** Approved template message — used for reminders once templates exist. */
export async function sendTemplate(input: {
  to: unknown;
  name: unknown;
  languageCode: unknown;
  bodyValues: unknown;
}): Promise<WhatsAppResult<{ messageId: string | null }>> {
  const to = normalizeMsisdn(input.to);
  if (!to) return fail(400, "Recipient phone number is not valid.");
  if (typeof input.name !== "string" || !TEMPLATE.test(input.name)) {
    return fail(400, "Template name is not valid.");
  }
  const language =
    typeof input.languageCode === "string" && /^[a-z]{2}(_[A-Z]{2})?$/.test(input.languageCode)
      ? input.languageCode
      : "en";
  const params = buildTemplateParams(input.bodyValues);
  if (!params) return fail(400, "Template body values are not valid.");

  return post("/messages", {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: input.name,
      language: { code: language },
      components: [
        {
          type: "body",
          parameters: params.map((text) => ({ type: "text", text })),
        },
      ],
    },
  });
}

export function isConfigured(): boolean {
  return getWhatsAppConfig() !== null;
}

/**
 * Meta's message id (`wamid.HBgN...`) trimmed to something safe to store. The
 * dot is part of Meta's ids, so it is allowed; nothing else non-alphanumeric is.
 */
export function safeMessageId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^[A-Za-z0-9_.-]{1,128}$/.test(value) ? value : null;
}
