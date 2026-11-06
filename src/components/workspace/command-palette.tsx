"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

const LINKS = [
  { href: "/billing", label: "Open billing / bill" },
  { href: "/quotation", label: "Quotation" },
  { href: "/products", label: "Products" },
  { href: "/products?tab=offers", label: "Offers & discounts" },
  { href: "/orders", label: "Orders" },
  { href: "/kitchen", label: "Kitchen board" },
  { href: "/customers", label: "Customers" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LINKS;
    return LINKS.filter((l) => l.label.toLowerCase().includes(q));
  }, [query]);

  if (!open) return null;

  return (
    <div className="ob-safe-top fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-2 pt-[10vh] sm:p-4 sm:pt-[15vh]">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close command palette"
        onClick={() => setOpen(false)}
      />
      <div className="relative z-10 w-full max-w-lg ob-card overflow-hidden shadow-xl">
        <div className="flex items-center gap-2 border-b border-[var(--ob-border)] px-3">
          <Search className="h-4 w-4 text-[var(--ob-text-muted)]" aria-hidden />
          <input
            autoFocus
            className="w-full py-3 text-sm outline-none"
            placeholder="Jump to…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {filtered.map((item) => (
            <li key={item.href}>
              <button
                type="button"
                className="flex w-full px-4 py-3 text-left text-sm hover:bg-[var(--ob-surface-muted)]"
                onClick={() => {
                  setOpen(false);
                  router.push(item.href);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="border-t border-[var(--ob-border)] px-4 py-2 text-xs text-[var(--ob-text-muted)]">
          Tip: ⌘K / Ctrl+K anywhere in the workspace
        </p>
      </div>
    </div>
  );
}

export function CommandPaletteHint() {
  return (
    <Link
      href="/billing"
      className="hidden rounded-md border border-[var(--ob-border)] px-2 py-1 text-xs text-[var(--ob-text-muted)] lg:inline"
    >
      ⌘K
    </Link>
  );
}
