import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme, type Theme } from "@/lib/theme";

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {
    theme?: unknown;
  } | null;
  const theme: Theme = parseTheme(body?.theme as string) ?? "light";
  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return Response.json({ ok: true, theme });
}
