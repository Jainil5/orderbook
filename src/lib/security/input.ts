/** Escape user input used inside PostgREST `.or()` / `ilike` filter strings. */
export function escapeIlikePattern(raw: string, maxLength = 80): string {
  const trimmed = raw.trim().slice(0, maxLength);
  return trimmed
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/[,().]/g, "");
}

/** Business ID format — blocks odd characters before server-side auth mapping. */
export function isValidBrandCode(code: string): boolean {
  return /^[A-Za-z0-9-]{2,32}$/.test(code.trim());
}

const ALLOWED_ORDER_STATUS = new Set([
  "all",
  "draft",
  "confirmed",
  "completed",
  "cancelled",
  "refunded",
]);

const ALLOWED_PAYMENT_STATUS = new Set([
  "all",
  "pending",
  "partial",
  "paid",
  "failed",
  "refunded",
]);

const ALLOWED_PAYMENT_METHODS = new Set(["UPI", "Card", "Cash"]);

export function sanitizeListFilter(
  value: string | undefined,
  allowed: Set<string>,
): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  return allowed.has(v) ? v : undefined;
}

export function sanitizeOrderStatus(value?: string) {
  return sanitizeListFilter(value, ALLOWED_ORDER_STATUS);
}

export function sanitizePaymentStatus(value?: string) {
  return sanitizeListFilter(value, ALLOWED_PAYMENT_STATUS);
}

export function sanitizePaymentMethod(value: string): string | null {
  const v = value.trim();
  return ALLOWED_PAYMENT_METHODS.has(v) ? v : null;
}

export function clampPage(page?: number): number {
  if (!page || !Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.floor(page), 10_000);
}

export function clampPageSize(pageSize?: number): number {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize < 1) return 20;
  return Math.min(Math.floor(pageSize), 100);
}

/** Prevent open redirects after login (internal paths only). */
export function safeInternalPath(next: string | null | undefined): string {
  if (!next) return "/dashboard";
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/dashboard";
  }
  if (next.startsWith("/login") || next.startsWith("/demo")) {
    return "/dashboard";
  }
  return next.split("?")[0] ?? "/dashboard";
}

export function isTrustedSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return parsed.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}
