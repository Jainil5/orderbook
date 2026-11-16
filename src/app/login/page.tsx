import { LoginForm } from "@/components/auth/login-form";
import { safeInternalPath } from "@/lib/security/input";
import { parseDemoBrandCodeParam } from "@/lib/workspace/constants";

/**
 * The login screen also answers a demo deep link.
 *
 * `/demo/orders?brand=BR-2` used to be handled in middleware, which could only
 * write a cookie. A session is now a row in `data/sessions.csv` and only the
 * server layer can write one, so middleware turns that link into
 * `/login?demo=BR-2&next=/orders` and this page — running on the server — hands
 * the form the brand and the page it wants. Both are validated here rather than
 * trusted from the query string: `safeInternalPath` will not return an
 * off-site URL, and an unknown brand simply means no auto-entry.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; next?: string }>;
}) {
  const params = await searchParams;
  const demoBrand = parseDemoBrandCodeParam(params.demo);
  return (
    <LoginForm
      demoBrand={demoBrand}
      next={demoBrand ? safeInternalPath(params.next) : null}
    />
  );
}
