import { NextResponse, type NextRequest } from "next/server";

// React uses eval() in development to reconstruct server-side stacks; production
// CSP must stay strict, so 'unsafe-eval' is only added when NODE_ENV is development.
// va.vercel-scripts.com serves the @vercel/analytics and @vercel/speed-insights
// dev/debug scripts; when deployed on Vercel the production scripts and their
// event endpoints are same-origin (/_vercel/insights/*, /_vercel/speed-insights/*).
const isDev = process.env.NODE_ENV === "development";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-DNS-Prefetch-Control": "off",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
  "Content-Security-Policy": `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com${isDev ? " 'unsafe-eval'" : ""}; connect-src 'self' https://va.vercel-scripts.com; font-src 'self' data:; object-src 'none'`,
};

export function applySecurityHeaders(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  if (request.nextUrl.protocol === "https:") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return response;
}
