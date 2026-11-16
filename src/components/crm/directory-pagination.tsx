import Link from "next/link";
import type { DirectoryPage } from "@/lib/crm/directory";

const HREF = "/customers/directory";

/**
 * Paging stays on the server: the link is the current query string with a
 * different `page`, so a filter, a sort and a segment all survive it.
 */
export function DirectoryPagination({
  page,
  params,
}: {
  page: DirectoryPage;
  params: Record<string, string>;
}) {
  if (page.pageCount <= 1) return null;

  function link(target: number) {
    const search = new URLSearchParams(params);
    if (target === 1) search.delete("page");
    else search.set("page", String(target));
    const qs = search.toString();
    return qs ? `${HREF}?${qs}` : HREF;
  }

  const pages = Array.from({ length: page.pageCount }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === page.pageCount || Math.abs(n - page.page) <= 1,
  );

  return (
    <nav
      aria-label="Customer pages"
      className="mt-3 flex flex-wrap items-center gap-2 text-sm"
    >
      <span className="text-[var(--ob-text-muted)]">
        <span className="ob-num">{page.from}</span>–<span className="ob-num">{page.to}</span> of{" "}
        <span className="ob-num">{page.total}</span>
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {page.page > 1 ? (
          <Link
            href={link(page.page - 1)}
            className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5"
          >
            Previous
          </Link>
        ) : null}
        {pages.map((n, i) => (
          <span key={n} className="flex items-center gap-1">
            {i > 0 && n - pages[i - 1]! > 1 ? (
              <span aria-hidden className="px-1 text-[var(--ob-text-muted)]">
                …
              </span>
            ) : null}
            {n === page.page ? (
              <span
                aria-current="page"
                className="rounded-full border border-[var(--ob-primary)] bg-[var(--ob-primary)] px-3 py-1.5 text-[var(--ob-primary-foreground)]"
              >
                <span className="ob-num">{n}</span>
              </span>
            ) : (
              <Link
                href={link(n)}
                className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5"
              >
                <span className="ob-num">{n}</span>
              </Link>
            )}
          </span>
        ))}
        {page.page < page.pageCount ? (
          <Link
            href={link(page.page + 1)}
            className="ob-touch-target ob-btn-ghost rounded-full px-3 py-1.5"
          >
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
