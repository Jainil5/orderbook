export const DEMO_WORKSPACE_COOKIE = "ob_demo_workspace";

export const WORKSPACE_ROUTE_PREFIXES = [
  "/dashboard",
  "/billing",
  "/orders",
  "/products",
  "/analytics",
  "/offers",
  "/customers",
  "/payments",
  "/settings",
] as const;

export function isWorkspacePath(pathname: string): boolean {
  return WORKSPACE_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function demoPathToAppPath(pathname: string): string {
  if (pathname === "/demo" || pathname === "/demo/") return "/dashboard";
  if (pathname.startsWith("/demo/")) {
    const rest = pathname.slice("/demo".length);
    return rest.length ? rest : "/dashboard";
  }
  return "/dashboard";
}
