"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

export function CustomerSearchBar({ initialQuery = "" }: { initialQuery?: string }) {
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
      router.replace(qs ? `/customers?${qs}` : "/customers");
    }, 300);
    return () => window.clearTimeout(timer);
  }, [value, router, searchParams]);

  return (
    <Input
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Search by name or phone…"
      aria-label="Search customers"
      className="max-w-md"
    />
  );
}
