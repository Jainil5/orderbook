import { NextResponse, type NextRequest } from "next/server";
import { resolveDemoBrandCode } from "@/lib/demo/brands";
import { applySecurityHeaders } from "@/lib/security/headers";
import { safeInternalPath } from "@/lib/security/input";
import {
  DEMO_WORKSPACE_COOKIE,
  demoPathToAppPath,
  isDemoWorkspaceCookieValue,
  isWorkspacePath,
} from "@/lib/workspace/constants";

const PROBE_PATH =
  /^\/(\.env|wp-admin|wp-login|xmlrpc|phpmyadmin|admin\.php|\.git)/i;

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (PROBE_PATH.test(path)) {
    return applySecurityHeaders(
      request,
      new NextResponse(null, { status: 404 }),
    );
  }

  if (path === "/demo" || path.startsWith("/demo/")) {
    const brandCode = resolveDemoBrandCode(
      request.nextUrl.searchParams.get("brand") ?? undefined,
    );
    const url = request.nextUrl.clone();
    url.pathname = demoPathToAppPath(path);
    url.search = request.nextUrl.search;
    url.searchParams.delete("brand");
    const res = NextResponse.redirect(url);
    res.cookies.set(DEMO_WORKSPACE_COOKIE, brandCode, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return applySecurityHeaders(request, res);
  }

  const demoCookie = isDemoWorkspaceCookieValue(
    request.cookies.get(DEMO_WORKSPACE_COOKIE)?.value,
  );
  const isPublic =
    path === "/login" ||
    path === "/" ||
    path.startsWith("/quote/") ||
    path.startsWith("/api/auth");

  if (
    !demoCookie &&
    !isPublic &&
    !path.startsWith("/_next") &&
    (isWorkspacePath(path) || path.startsWith("/print"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", safeInternalPath(path));
    return applySecurityHeaders(request, NextResponse.redirect(url));
  }

  if (demoCookie && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = safeInternalPath(url.searchParams.get("next"));
    url.search = "";
    return applySecurityHeaders(request, NextResponse.redirect(url));
  }

  return applySecurityHeaders(request, NextResponse.next({ request }));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
