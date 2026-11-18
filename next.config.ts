import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  cacheComponents: false,
  partialPrefetching: false,
  // The preview gateway serves this app under *.preview.qoderwork.com; without
  // an entry, dev-only assets (JS/CSS/HMR) are blocked cross-origin and the
  // page renders without its client bundle. Dev-only: ignored in production.
  // 127.0.0.1 is listed explicitly — the dev server only auto-allows
  // "localhost", so a same-machine browser using the IP address would still
  // have its HMR websocket blocked and the app would never hydrate.
  allowedDevOrigins: ["**.preview.qoderwork.com", "localhost", "127.0.0.1"],
  turbopack: {
    root: resolve(import.meta.dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
      "*.csv": {
        type: "raw",
      },
    },
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
      // The preview gateway forwards its internal host, so the browser's
      // Origin (*.preview.qoderwork.com) fails the Server Actions CSRF host
      // check and every action rejects with "Invalid Server Actions request".
      // Whitelist the browser-visible host, per the Next.js proxy guidance.
      allowedOrigins: ["**.preview.qoderwork.com"],
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
