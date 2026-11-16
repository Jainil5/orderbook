import type { NextConfig } from "next";
import { resolve } from "node:path";

/**
 * Origins allowed to call this app's Server Actions, from
 * `OB_ACTION_ALLOWED_ORIGINS` (comma-separated, wildcards like
 * `*.tunnel.example.com` are supported).
 *
 * A Server Action request is checked so the browser's `Origin` matches the host
 * the app believes it serves — real CSRF protection, and it needs no change
 * when the app is reached directly. Behind a reverse proxy the two stop being
 * the same string: the phone preview sends `Origin: <preview host>` while the
 * gateway forwards its own internal `x-forwarded-host`, and Next then aborts
 * with "Invalid Server Actions request" — which looks exactly like a broken
 * app ("a server error occurred") while every page still loads on its own.
 * Listing the proxy's public origin here is the fix; the check keeps running
 * for every other origin. It is deliberately not baked into the repo, because
 * a preview or tunnel host is this deployment's business, not the code's.
 */
const actionAllowedOrigins = (process.env.OB_ACTION_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    root: resolve(import.meta.dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
      ...(actionAllowedOrigins.length
        ? { allowedOrigins: actionAllowedOrigins }
        : {}),
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
