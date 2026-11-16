import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";
import { applySecurityHeaders } from "@/lib/security/headers";
import { safeInternalPath } from "@/lib/security/input";
import {
  DEMO_WORKSPACE_COOKIE,
  demoPathToAppPath,
  isDemoSessionTokenValue,
  isWorkspacePath,
  parseDemoBrandCodeParam,
} from "@/lib/workspace/constants";

const PROBE_PATH =
  /^\/(\.env|wp-admin|wp-login|xmlrpc|phpmyadmin|admin\.php|\.git)/i;

/**
 * Middleware only recognises a demo session by its shape. The session itself is
 * a row in `data/sessions.csv`, and reading a file is not something this layer
 * can do — so a request with a token-shaped cookie continues to the layout,
 * which resolves the row and sends it back here if the session is gone.
 */
function carriesDemoSession(request: NextRequest): boolean {
  return isDemoSessionTokenValue(request.cookies.get(DEMO_WORKSPACE_COOKIE)?.value);
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
    /* A demo link cannot open a session from here: signing in writes a row, and
       only the server layer can write it. Send the browser to the login screen
       with the brand and the page it asked for; the screen turns that into the
       one-click "explore" it always was. */
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const brand = parseDemoBrandCodeParam(
      request.nextUrl.searchParams.get("brand"),
    );
    if (brand) url.searchParams.set("demo", brand);
    const target = demoPathToAppPath(path);
    if (target !== "/dashboard") {
      url.searchParams.set("next", safeInternalPath(target));
    }
    return applySecurityHeaders(request, NextResponse.redirect(url));
  }

  const demoSession = carriesDemoSession(request);

  const isPublic =
    path === "/login" ||
    path === "/" ||
    path.startsWith("/quote/") ||
    path.startsWith("/api/auth");

  const env = getPublicEnv();
  if ("ok" in env) {
    if (
      !demoSession &&
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
    !demoSession &&
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
    !demoSession &&
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
    /* A real user does not need the demo token. Dropping the cookie is all
       this layer can do — ending the row needs the CSV store, which is
       server-only — so the row lives on until it expires. It is inert: nothing
       reaches it without the token this browser just lost. */
    res.cookies.delete(DEMO_WORKSPACE_COOKIE);
    return applySecurityHeaders(request, res);
  }

  return applySecurityHeaders(request, supabaseResponse);
}
