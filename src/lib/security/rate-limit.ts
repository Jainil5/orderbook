type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();

const DEFAULT_MAX = 8;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

export function consumeRateLimit(
  key: string,
  maxAttempts = DEFAULT_MAX,
  windowMs = DEFAULT_WINDOW_MS,
): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || now >= bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (bucket.count >= maxAttempts) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return { allowed: true };
}

/** Best-effort client key for server actions (respects common proxy headers). */
export function rateLimitKeyFromHeaders(headerList: Headers): string {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  return headerList.get("x-real-ip") ?? "unknown";
}
