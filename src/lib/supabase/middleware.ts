import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import { applySecurityHeaders } from "@/lib/security/headers";
import { safeInternalPath } from "@/lib/security/input";
import {
  DEMO_WORKSPACE_COOKIE,
  DEFAULT_DEMO_BRAND_CODE,
  demoPathToAppPath,
  isDemoWorkspaceCookieValue,
  isWorkspacePath,
} from "@/lib/workspace/constants";
import { resolveDemoBrandCode } from "@/lib/demo/brands";

const PROBE_PATH =
  /^\/(\.env|wp-admin|wp-login|xmlrpc|phpmyadmin|admin\.php|\.git)/i;

function attachDemoCookie(
  response: NextResponse,
  brandCode = DEFAULT_DEMO_BRAND_CODE,
) {
  response.cookies.set(DEMO_WORKSPACE_COOKIE, brandCode, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (PROBE_PATH.test(path)) {
    return applySecurityHeaders(
      request,
      new NextResponse(null, { status: 404 }),
    );
  }

  if (path === "/demo" || path.startsWith("/demo/")) {
    const brandParam = request.nextUrl.searchParams.get("brand");
    const brandCode = resolveDemoBrandCode(brandParam ?? undefined);
    const url = request.nextUrl.clone();
    url.pathname = demoPathToAppPath(path);
    url.search = request.nextUrl.search;
    url.searchParams.delete("brand");
    return applySecurityHeaders(
      request,
      attachDemoCookie(NextResponse.redirect(url), brandCode),
    );
  }

  const demoCookieRaw = request.cookies.get(DEMO_WORKSPACE_COOKIE)?.value;
  const demoCookie = isDemoWorkspaceCookieValue(demoCookieRaw);

  const isPublic =
    path === "/login" ||
    path === "/" ||
    path.startsWith("/quote/") ||
    path.startsWith("/api/auth");

  const env = getPublicEnv();
  if ("ok" in env) {
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
    const res = NextResponse.next({ request });
    return applySecurityHeaders(request, res);
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    env.supabaseUrl,
    env.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
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

  if (
    !user &&
    !demoCookie &&
    !isPublic &&
    !path.startsWith("/_next")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", safeInternalPath(path));
    return applySecurityHeaders(request, NextResponse.redirect(url));
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = safeInternalPath(url.searchParams.get("next"));
    url.search = "";
    const res = NextResponse.redirect(url);
    res.cookies.delete(DEMO_WORKSPACE_COOKIE);
    return applySecurityHeaders(request, res);
  }

  return applySecurityHeaders(request, supabaseResponse);
}
