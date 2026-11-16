"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

export function CustomerSearchBar({
  initialQuery = "",
  basePath = "/customers",
  placeholder = "Search by name or phone…",
  ariaLabel = "Search customers",
}: {
  initialQuery?: string;
  /** Where the `q` param should live — the CRM directory uses its own route. */
  basePath?: string;
  /** Every CRM screen has its own words; the debounce + param logic does not change. */
  placeholder?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);
  const [prevInitialQuery, setPrevInitialQuery] = useState(initialQuery);
  if (prevInitialQuery !== initialQuery) {
    setPrevInitialQuery(initialQuery);
    setValue(initialQuery);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = value.trim();
      const current = searchParams.get("q")?.trim() ?? "";
      if (trimmed === current) return;
      const params = new URLSearchParams(searchParams.toString());
      if (trimmed) {
        params.set("q", trimmed);
      } else {
        params.delete("q");
      }
      const qs = params.toString();
      router.replace(qs ? `${basePath}?${qs}` : basePath);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [value, router, searchParams, basePath]);

  return (
    <Input
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="max-w-md"
    />
  );
}
